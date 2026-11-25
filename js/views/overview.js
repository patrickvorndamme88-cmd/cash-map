// ==========================================================================
// cash-map — Tab 1: Overview (Hero Card, Fixkosten Prompt, Category Pots)
// ==========================================================================

import { icon } from '../icons.js';
import { formatMoney, formatMonthLong, escapeHtml } from '../format.js';
import { CATEGORY_GROUPS } from '../defaults.js';

function isIOSBrowserNotStandalone() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  return isIOS && !standalone;
}

export function renderOverviewView(state, ui, snapshot) {
  const privacy = state.settings.privacyMode;
  const potSignClass = snapshot.totalPotBalance >= 0 ? 'is-pos' : 'is-neg';
  const monthDiffSignClass = snapshot.monthlyCashflowDiff >= 0 ? 'is-pos' : 'is-neg';
  const spentRatio = snapshot.totalBudgeted > 0
    ? Math.min(100, (snapshot.netOutflow / snapshot.totalBudgeted) * 100)
    : 0;
  const isOverBudget = snapshot.netOutflow > snapshot.totalBudgeted && snapshot.totalBudgeted > 0;

  // Optional iOS Home Screen Install Banner (only shown in iOS Safari, dismissible)
  const installBanner = isIOSBrowserNotStandalone() && !state.settings.installHintDismissed
    ? `
      <div class="action-banner">
        <div class="action-banner-left">
          <div class="action-banner-icon">${icon('share', 18)}</div>
          <div>
            <div class="action-banner-title">Als iPhone-App installieren</div>
            <div class="action-banner-sub">Tippe unten in Safari auf <strong>Teilen</strong> → <strong>Zum Home-Bildschirm</strong>.</div>
          </div>
        </div>
        <button class="icon-btn" data-action="dismiss-install" aria-label="Hinweis schließen" style="width:30px;height:30px;">${icon('x', 15)}</button>
      </div>
    `
    : '';

  // 1-Tap Fixkosten Assistent Banner
  const fixedBanner = snapshot.unbookedFixed.length > 0
    ? `
      <div class="action-banner">
        <div class="action-banner-left">
          <div class="action-banner-icon">${icon('zap', 19)}</div>
          <div>
            <div class="action-banner-title">${snapshot.unbookedFixed.length} Fixkosten offen (${escapeHtml(formatMoney(snapshot.unbookedFixedTotal, { privacy, compact: true }))})</div>
            <div class="action-banner-sub">${escapeHtml(snapshot.unbookedFixed.map((u) => u.category.name).slice(0, 3).join(', '))}${snapshot.unbookedFixed.length > 3 ? ' …' : ''}</div>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" data-action="book-fixed">Alle buchen</button>
      </div>
    `
    : '';

  // Unallocated / Overallocated Salary subtle alert
  let planAlert = '';
  if (Math.abs(snapshot.unallocatedSalary) >= 1) {
    const isOver = snapshot.unallocatedSalary < 0;
    planAlert = `
      <div class="action-banner ${isOver ? 'is-warn' : 'is-pos'}">
        <div class="action-banner-left">
          <div class="action-banner-icon">${icon(isOver ? 'info' : 'sparkles', 18)}</div>
          <div>
            <div class="action-banner-title">${isOver
              ? `${escapeHtml(formatMoney(Math.abs(snapshot.unallocatedSalary), { privacy, compact: true }))} mehr verplant als Gehalt`
              : `${escapeHtml(formatMoney(snapshot.unallocatedSalary, { privacy, compact: true }))} vom Gehalt noch frei`
            }</div>
            <div class="action-banner-sub">${isOver ? 'Passe deine Kategorie-Budgets im Plan-Tab an.' : 'Weise es z. B. deinem Puffer oder Sparplan zu.'}</div>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" data-nav-tab="budgets">Planen</button>
      </div>
    `;
  }

  // Filter categories by group pill
  const activeGroup = ui.groupFilter || 'all';
  const filteredCats = activeGroup === 'all'
    ? snapshot.categories
    : snapshot.categories.filter((c) => c.category.group === activeGroup);

  const filterChips = [
    { id: 'all', label: `Alle (${snapshot.categories.length})` },
    ...CATEGORY_GROUPS.map((g) => {
      const count = snapshot.categories.filter((c) => c.category.group === g.id).length;
      return { id: g.id, label: `${g.label} (${count})`, count };
    }).filter((g) => g.count > 0),
  ]
    .map((chip) => `<button class="chip ${activeGroup === chip.id ? 'is-active' : ''}" data-group-filter="${chip.id}">${escapeHtml(chip.label)}</button>`)
    .join('');

  // Render Category Pot Cards
  const categoryCards = filteredCats
    .map((stat) => {
      const cat = stat.category;
      const isPotNeg = stat.potBalance < 0;
      const isPotZero = Math.abs(stat.potBalance) < 0.01;
      const potPillClass = isPotNeg ? 'is-neg' : isPotZero ? 'is-neutral' : '';
      const diffClass = stat.monthDiff > 0 ? 'text-pos' : stat.monthDiff < 0 ? 'text-neg' : 'text-muted';
      const fillPct = Math.min(100, stat.spentPct);
      const isOver = stat.netSpent > stat.budget && stat.budget > 0;
      const showPace = snapshot.monthPace !== null && !cat.isFixed && stat.budget > 0;

      const carryHint = cat.rollover && Math.abs(stat.carryIn) >= 0.01
        ? `<span>Übertrag ${escapeHtml(formatMoney(stat.carryIn, { privacy, signed: true, compact: true }))}</span>`
        : cat.isFixed
          ? `<span>Monatlich fix</span>`
          : `<span>Monatsbudget ${escapeHtml(formatMoney(stat.budget, { privacy, compact: true }))}</span>`;

      const goalLine = stat.goalPct !== null
        ? `
          <div class="cat-goal-row">
            <span>Sparziel: ${escapeHtml(formatMoney(cat.goalAmount, { privacy, compact: true }))}</span>
            <span class="money" style="font-weight:650;color:var(--text-secondary);">${Math.round(stat.goalPct)} % erreicht</span>
          </div>
        `
        : '';

      return `
        <article class="cat-card ${isPotNeg ? 'is-negative-pot' : ''}" style="--cat-color:${cat.color};" data-open-category="${cat.id}" role="button" tabindex="0">
          <div class="cat-card-top">
            <div class="cat-icon">${icon(cat.icon, 21)}</div>
            <div class="cat-info">
              <div class="cat-name-row">
                <span class="cat-name">${escapeHtml(cat.name)}</span>
                ${cat.isFixed ? `<span class="cat-badge">Fix</span>` : ''}
              </div>
              <div class="cat-sub">${carryHint}</div>
            </div>
            <div class="cat-amounts">
              <span class="pot-pill ${potPillClass} money">${escapeHtml(formatMoney(stat.potBalance, { privacy, signed: true }))}</span>
              <span class="pot-caption">${cat.rollover ? 'Kategoriekonto' : 'Restbetrag'}</span>
            </div>
          </div>

          <div class="cat-progress-wrap">
            <div class="progress-track">
              <div class="progress-fill ${isOver ? 'is-over' : ''}" style="width:${fillPct.toFixed(1)}%;"></div>
              ${showPace ? `<div class="progress-pace" style="left:${snapshot.monthPace.toFixed(1)}%;" title="Aktueller Tag im Monat"></div>` : ''}
            </div>
            <div class="cat-footer">
              <span class="cat-spent-text money">
                <strong>${escapeHtml(formatMoney(stat.netSpent, { privacy }))}</strong> von ${escapeHtml(formatMoney(stat.budget, { privacy, compact: true }))}
              </span>
              <span class="cat-month-diff money ${diffClass}">
                Monat: ${escapeHtml(formatMoney(stat.monthDiff, { privacy, signed: true }))}
              </span>
            </div>
          </div>
          ${goalLine}
        </article>
      `;
    })
    .join('');

  return `
    ${installBanner}

    <!-- Hero Cashflow & Total Pot Card -->
    <section class="hero-card" aria-label="Monatsübersicht">
      <div class="hero-inner">
        <div class="hero-top-row">
          <span class="hero-eyebrow">${icon('piggy', 14)} Gesamt-Kategoriekonten</span>
          <span class="hero-pill ${monthDiffSignClass} money">
            Monat ${escapeHtml(formatMoney(snapshot.monthlyCashflowDiff, { privacy, signed: true, compact: true }))}
          </span>
        </div>

        <div class="hero-main-amount money">${escapeHtml(formatMoney(snapshot.totalPotBalance, { privacy, signed: snapshot.totalPotBalance < 0 }))}</div>
        <div class="hero-subline">
          <span>Stand Ende ${escapeHtml(formatMonthLong(snapshot.monthKey))}</span>
          <span style="opacity:0.45;">|</span>
          <span>Spar- &amp; Investquote: <strong style="color:#FFFFFF;">${privacy ? '•• %' : `${Math.round(snapshot.savingsRate)} %`}</strong></span>
        </div>

        <div class="hero-metrics">
          <div class="hero-metric">
            <div class="hero-metric-label">Einnahmen</div>
            <div class="hero-metric-value money">${escapeHtml(formatMoney(snapshot.totalIncome, { privacy, compact: true }))}</div>
          </div>
          <div class="hero-metric">
            <div class="hero-metric-label">Ausgaben</div>
            <div class="hero-metric-value money">${escapeHtml(formatMoney(snapshot.netOutflow, { privacy, compact: true }))}</div>
          </div>
          <div class="hero-metric">
            <div class="hero-metric-label">Budget-Diff.</div>
            <div class="hero-metric-value money ${snapshot.totalMonthDiff >= 0 ? 'is-pos' : 'is-neg'}">${escapeHtml(formatMoney(snapshot.totalMonthDiff, { privacy, signed: true, compact: true }))}</div>
          </div>
        </div>

        <div class="hero-bar-wrap">
          <div class="hero-bar-head">
            <span>Budgetverbrauch (${Math.round(spentRatio)} %)</span>
            <span class="money">${escapeHtml(formatMoney(snapshot.netOutflow, { privacy, compact: true }))} / ${escapeHtml(formatMoney(snapshot.totalBudgeted, { privacy, compact: true }))}</span>
          </div>
          <div class="hero-bar-track">
            <div class="hero-bar-fill ${isOverBudget ? 'is-over' : ''}" style="width:${spentRatio.toFixed(1)}%;"></div>
            ${snapshot.monthPace !== null ? `<div class="pace-marker" style="left:${snapshot.monthPace.toFixed(1)}%;"></div>` : ''}
          </div>
        </div>
      </div>
    </section>

    ${fixedBanner}
    ${planAlert}

    <!-- Categories & Pots Section -->
    <div class="section-head">
      <h2 class="section-title">Deine Kategorien &amp; Töpfe</h2>
      <button class="section-link" data-action="open-transfer">${icon('transfer', 14)} Umbuchen</button>
    </div>

    <div class="chip-row" role="tablist" aria-label="Gruppenfilter">
      ${filterChips}
    </div>

    <section class="category-list" aria-label="Kategorien">
      ${categoryCards || `<div class="empty-state"><div class="empty-title">Keine Kategorien in dieser Gruppe</div></div>`}
    </section>
  `;
}
