// ==========================================================================
// cash-map — Tab 1: Overview (Hero, Recap, Daueraufträge, Category Pots)
// ==========================================================================

import { icon } from '../icons.js';
import { formatMoney, formatMonthLong, escapeHtml, shiftMonthKey, compareMonthKeys } from '../format.js';
import { CATEGORY_GROUPS } from '../defaults.js';
import { computeMonthRecap, getTimelineStartMonth } from '../finance.js';

const DAY_MS = 86400000;

function monthName(key) {
  return formatMonthLong(key).split(' ')[0];
}

function isIOSBrowserNotStandalone() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  return isIOS && !standalone;
}

function shouldShowBackupReminder(state) {
  const txs = state.transactions || [];
  if (txs.length < 5) return false;
  const now = Date.now();
  const snoozedAt = Date.parse(state.settings.backupReminderSnoozedAt || '');
  if (Number.isFinite(snoozedAt) && now - snoozedAt < 7 * DAY_MS) return false;
  const lastBackup = Date.parse(state.settings.lastBackupAt || '');
  if (Number.isFinite(lastBackup)) return now - lastBackup > 30 * DAY_MS;
  const oldest = Math.min(...txs.map((t) => Date.parse(t.createdAt) || now));
  return now - oldest > 7 * DAY_MS;
}

function renderInstallBanner(state) {
  if (!isIOSBrowserNotStandalone() || state.settings.installHintDismissed) return '';
  return `
    <div class="action-banner">
      <div class="action-banner-left">
        <div class="action-banner-icon">${icon('share', 18)}</div>
        <div>
          <div class="action-banner-title">Als iPhone-App installieren</div>
          <div class="action-banner-sub">In Safari auf <strong>Teilen</strong> → <strong>Zum Home-Bildschirm</strong> tippen.</div>
        </div>
      </div>
      <button class="icon-btn icon-btn-sm" data-action="dismiss-install" aria-label="Hinweis schließen">${icon('x', 14)}</button>
    </div>
  `;
}

function renderFutureBanner(state, snapshot) {
  if (!snapshot.isFuture) return '';
  const isCleanStart = snapshot.monthKey === getTimelineStartMonth(state);
  if (isCleanStart) {
    return `
      <div class="action-banner is-pos">
        <div class="action-banner-left">
          <div class="action-banner-icon" style="background:var(--positive-soft);color:var(--positive);">${icon('calendar', 18)}</div>
          <div>
            <div class="action-banner-title">Startklar für ${escapeHtml(formatMonthLong(snapshot.monthKey))}</div>
            <div class="action-banner-sub">Dein Tracking beginnt in diesem Monat – alle Budgets liegen frisch für dich bereit. Monate davor sind ausgeblendet.</div>
          </div>
        </div>
      </div>
    `;
  }
  return `
    <div class="action-banner">
      <div class="action-banner-left">
        <div class="action-banner-icon">${icon('calendar', 18)}</div>
        <div>
          <div class="action-banner-title">Prognose für ${escapeHtml(formatMonthLong(snapshot.monthKey))}</div>
          <div class="action-banner-sub">Daueraufträge &amp; Budgets sind als ausgegeben eingeplant, Rücklagen wachsen weiter. Ideal zum Vorplanen.</div>
        </div>
      </div>
    </div>
  `;
}

function renderBackupReminder(state) {
  if (!shouldShowBackupReminder(state)) return '';
  const last = Date.parse(state.settings.lastBackupAt || '');
  const days = Number.isFinite(last) ? Math.floor((Date.now() - last) / DAY_MS) : null;
  return `
    <div class="action-banner is-warn">
      <div class="action-banner-left">
        <div class="action-banner-icon">${icon('shield', 18)}</div>
        <div>
          <div class="action-banner-title">Zeit für eine Datensicherung</div>
          <div class="action-banner-sub">${days !== null ? `Letzte Sicherung vor ${days} Tagen.` : 'Noch kein Backup – sichere deine Daten z. B. in iCloud Drive.'}</div>
        </div>
      </div>
      <div class="action-banner-actions">
        <button class="btn btn-primary btn-sm" data-action="quick-backup">Sichern</button>
        <button class="icon-btn icon-btn-sm" data-action="snooze-backup" aria-label="Später erinnern">${icon('x', 14)}</button>
      </div>
    </div>
  `;
}

function renderRecap(state, snapshot, privacy) {
  if (!snapshot.isCurrent) return '';
  const prev = shiftMonthKey(snapshot.monthKey, -1);
  if (compareMonthKeys(prev, getTimelineStartMonth(state)) < 0) return '';
  if (state.settings.recapDismissed === prev) return '';

  const { snapshot: s, onPlan, total, best } = computeMonthRecap(state, prev);
  if (s.totalBudgeted <= 0) return '';
  const diff = s.totalMonthDiff;
  const isPos = diff >= 0;

  return `
    <section class="recap-card" aria-label="Monatsrückblick">
      <div class="recap-head">
        <span class="recap-eyebrow">${icon('sparkles', 14)} Rückblick ${escapeHtml(monthName(prev))}</span>
        <button class="icon-btn icon-btn-sm" data-action="dismiss-recap" data-month="${prev}" aria-label="Rückblick ausblenden">${icon('x', 14)}</button>
      </div>
      <div class="recap-main money ${isPos ? 'text-pos' : 'text-neg'}">
        ${escapeHtml(formatMoney(diff, { privacy, signed: true }))}
        <small>${isPos ? 'unter Budget – das ist in deine Töpfe gewandert.' : 'über Budget – deine Töpfe haben das abgefedert.'}</small>
      </div>
      <div class="recap-stats">
        <div class="recap-stat">
          <div class="recap-stat-label">Im Plan</div>
          <div class="recap-stat-val">${onPlan} / ${total} Töpfe</div>
        </div>
        <div class="recap-stat">
          <div class="recap-stat-label">Bester Topf</div>
          <div class="recap-stat-val">${best ? `${escapeHtml(best.category.name)}` : '–'}</div>
        </div>
        <div class="recap-stat">
          <div class="recap-stat-label">Investiert</div>
          <div class="recap-stat-val money">${escapeHtml(formatMoney(s.investedThisMonth, { privacy, compact: true }))}</div>
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" data-goto-month="${prev}">${escapeHtml(monthName(prev))} ansehen ${icon('chevronRight', 14)}</button>
    </section>
  `;
}

function renderHero(snapshot, privacy) {
  const spentRatio = snapshot.totalBudgeted > 0
    ? Math.min(100, (snapshot.netOutflow / snapshot.totalBudgeted) * 100)
    : 0;
  const isOverBudget = snapshot.netOutflow > snapshot.totalBudgeted && snapshot.totalBudgeted > 0;

  const pill = snapshot.isCleanFutureStart
    ? `<span class="hero-pill is-pos">${icon('calendar', 12)} Startmonat</span>`
    : snapshot.isFuture
      ? `<span class="hero-pill">${icon('calendar', 12)} Prognose</span>`
      : `<span class="hero-pill ${snapshot.monthlyCashflowDiff >= 0 ? 'is-pos' : 'is-neg'} money">Monat ${escapeHtml(formatMoney(snapshot.monthlyCashflowDiff, { privacy, signed: true, compact: true }))}</span>`;

  const countAttrs = privacy ? '' : `data-countup="${snapshot.totalPotBalance}" data-countup-key="hero-pot"`;

  const da = snapshot.dailyAllowance;
  const dailyHtml = da
    ? `
      <div class="hero-daily">
        <div class="hero-daily-icon">${icon('wallet', 14)}</div>
        <div>${da.remaining > 0.005
          ? `Noch <strong class="money">${escapeHtml(formatMoney(da.perDay, { privacy }))}</strong> pro Tag für den Alltag · ${da.daysLeft} ${da.daysLeft === 1 ? 'Tag' : 'Tage'} übrig`
          : 'Alltagsbudget für diesen Monat ausgeschöpft – ab jetzt zahlen deine Töpfe.'}</div>
      </div>`
    : '';

  return `
    <section class="hero-card" aria-label="Monatsübersicht">
      <div class="hero-inner">
        <div class="hero-top-row">
          <span class="hero-eyebrow">${icon('piggy', 14)} Gesamt-Kategoriekonten</span>
          ${pill}
        </div>

        <div class="hero-main-amount money" ${countAttrs}>${escapeHtml(formatMoney(snapshot.totalPotBalance, { privacy }))}</div>
        <div class="hero-subline">
          <span>${snapshot.isCleanFutureStart ? 'Start' : snapshot.isFuture ? 'Prognose' : 'Stand'} Ende ${escapeHtml(formatMonthLong(snapshot.monthKey))}</span>
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
            ${snapshot.investedThisMonth > 0 ? `<div class="hero-metric-sub money">${escapeHtml(formatMoney(snapshot.investedThisMonth, { privacy, compact: true }))} investiert</div>` : ''}
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
            ${snapshot.monthPace !== null ? `<div class="pace-marker" style="left:${snapshot.monthPace.toFixed(1)}%;" title="Heute"></div>` : ''}
          </div>
        </div>
        ${dailyHtml}
      </div>
    </section>
  `;
}

function renderRecurringBanner(snapshot, privacy) {
  const list = snapshot.unbookedRecurring;
  if (!list || list.length === 0) return '';
  const names = list.slice(0, 3).map((u) => `${u.category.name} (${u.bookingDay}.)`).join(', ') + (list.length > 3 ? ' …' : '');
  return `
    <div class="action-banner">
      <div class="action-banner-left">
        <div class="action-banner-icon">${icon('repeat', 18)}</div>
        <div>
          <div class="action-banner-title">${list.length} ${list.length === 1 ? 'Dauerauftrag' : 'Daueraufträge'} offen · ${escapeHtml(formatMoney(snapshot.unbookedRecurringTotal, { privacy, compact: true }))}</div>
          <div class="action-banner-sub">${escapeHtml(names)}</div>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" data-action="book-recurring">Alle buchen</button>
    </div>
  `;
}

function renderPlanAlert(snapshot, privacy) {
  if (Math.abs(snapshot.unallocatedSalary) < 1) return '';
  const isOver = snapshot.unallocatedSalary < 0;
  return `
    <div class="action-banner ${isOver ? 'is-warn' : 'is-pos'}">
      <div class="action-banner-left">
        <div class="action-banner-icon">${icon(isOver ? 'info' : 'sparkles', 18)}</div>
        <div>
          <div class="action-banner-title">${isOver
            ? `${escapeHtml(formatMoney(Math.abs(snapshot.unallocatedSalary), { privacy, compact: true }))} mehr verplant als Gehalt`
            : `${escapeHtml(formatMoney(snapshot.unallocatedSalary, { privacy, compact: true }))} vom Gehalt noch frei`}</div>
          <div class="action-banner-sub">${isOver ? 'Passe deine Budgets im Plan-Tab an.' : 'Weise es z. B. deinem Puffer oder Sparplan zu.'}</div>
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" data-nav-tab="budgets">Planen</button>
    </div>
  `;
}

function renderCategoryCard(stat, snapshot, privacy) {
  const cat = stat.category;
  const isPotNeg = stat.potBalance < -0.005;
  const isPotZero = Math.abs(stat.potBalance) < 0.01;
  const fillPct = Math.min(100, stat.spentPct);
  const isOver = stat.netSpent > stat.budget + 0.005 && stat.budget > 0;
  const showPace = snapshot.monthPace !== null && !stat.isRecurring && stat.budget > 0;

  let subline;
  let rightHtml;
  let diffHtml;
  const diffClass = stat.monthDiff > 0.005 ? 'text-pos' : stat.monthDiff < -0.005 ? 'text-neg' : 'text-muted';
  const normalDiff = `<span class="cat-month-diff money ${diffClass}">Monat: ${escapeHtml(formatMoney(stat.monthDiff, { privacy, signed: true }))}</span>`;

  if (stat.isRecurring) {
    const status = stat.isBooked ? 'booked' : stat.isProjected ? 'planned' : 'open';
    const chip = status === 'booked'
      ? `<span class="status-chip is-booked">${icon('check', 12)} Gebucht</span>`
      : status === 'planned'
        ? `<span class="status-chip is-planned">${icon('calendar', 12)} Geplant</span>`
        : `<span class="status-chip is-open">${icon('clock', 12)} Offen</span>`;
    const caption = status === 'open'
      ? `${formatMoney(stat.budget, { privacy })} fällig`
      : !isPotZero
        ? `Konto ${formatMoney(stat.potBalance, { privacy, signed: true })}`
        : `${formatMoney(stat.budget, { privacy, compact: true })} / Monat`;
    const sweptBadge = stat.sweptIn > 0.005
      ? ` · <strong class="text-pos">+${escapeHtml(formatMoney(stat.sweptIn, { privacy, compact: true }))} Zufluss</strong>`
      : '';
    subline = status === 'booked'
      ? `<span>Dauerauftrag am ${stat.bookingDay}. · gebucht${sweptBadge}</span>`
      : `<span>Dauerauftrag am ${stat.bookingDay}.${status === 'open' ? ' · noch offen' : ''}${sweptBadge}</span>`;
    rightHtml = `${chip}<span class="pot-caption money ${isPotNeg ? 'text-neg' : ''}">${escapeHtml(caption)}</span>`;
    diffHtml = status === 'open'
      ? `<span class="cat-month-diff text-warn">noch nicht gebucht</span>`
      : normalDiff;
  } else if (stat.surplusTarget) {
    const potPillClass = isPotNeg ? 'is-neg' : isPotZero ? 'is-neutral' : '';
    const targetName = escapeHtml(stat.surplusTarget.name);
    subline = stat.carryIn < -0.01
      ? `<span>Vormonat ${escapeHtml(formatMoney(stat.carryIn, { privacy, signed: true, compact: true }))} · ${icon('cornerDownRight', 11, 'inline-icon')} ${targetName}</span>`
      : `<span>${icon('cornerDownRight', 11, 'inline-icon')} Überschuss → ${targetName}</span>`;
    rightHtml = `
      <span class="pot-pill ${potPillClass} money">${escapeHtml(formatMoney(stat.potBalance, { privacy, signed: true }))}</span>
      <span class="pot-caption">${stat.potBalance > 0.005 ? `Rest → ${targetName}` : 'Monatsrest'}</span>
    `;
    diffHtml = normalDiff;
  } else {
    const potPillClass = isPotNeg ? 'is-neg' : isPotZero ? 'is-neutral' : '';
    if (stat.sweptIn > 0.005) {
      const ownPart = Math.abs(stat.ownCarryIn) >= 0.01
        ? `Übertrag ${escapeHtml(formatMoney(stat.ownCarryIn, { privacy, signed: true, compact: true }))} · `
        : '';
      subline = `<span>${ownPart}<strong class="text-pos">+${escapeHtml(formatMoney(stat.sweptIn, { privacy, compact: true }))} Zufluss</strong></span>`;
    } else if (cat.rollover && Math.abs(stat.carryIn) >= 0.01) {
      subline = `<span>Übertrag ${escapeHtml(formatMoney(stat.carryIn, { privacy, signed: true, compact: true }))}</span>`;
    } else {
      subline = `<span>Monatsbudget ${escapeHtml(formatMoney(stat.budget, { privacy, compact: true }))}</span>`;
    }
    rightHtml = `
      <span class="pot-pill ${potPillClass} money">${escapeHtml(formatMoney(stat.potBalance, { privacy, signed: true }))}</span>
      <span class="pot-caption">${cat.rollover ? 'Kategoriekonto' : 'Restbetrag'}</span>
    `;
    diffHtml = normalDiff;
  }

  const goalLine = stat.goalPct !== null
    ? `
      <div class="cat-goal-row">
        <span>${icon('target', 12, 'inline-icon')} Sparziel ${escapeHtml(formatMoney(cat.goalAmount, { privacy, compact: true }))}</span>
        <span class="money" style="font-weight:650;color:var(--text-secondary);">${Math.round(stat.goalPct)} % erreicht</span>
      </div>`
    : '';

  return `
    <article class="cat-card ${isPotNeg ? 'is-negative-pot' : ''}" style="--cat-color:${cat.color};" data-open-category="${cat.id}" role="button" tabindex="0">
      <div class="cat-card-top">
        <div class="cat-icon">${icon(cat.icon, 21)}</div>
        <div class="cat-info">
          <div class="cat-name-row">
            <span class="cat-name">${escapeHtml(cat.name)}</span>
            ${stat.isRecurring ? `<span class="cat-badge cat-badge-recurring" title="Dauerauftrag">${icon('repeat', 11)}</span>` : ''}
          </div>
          <div class="cat-sub">${subline}</div>
        </div>
        <div class="cat-amounts">${rightHtml}</div>
      </div>

      <div class="cat-progress-wrap">
        <div class="progress-track">
          <div class="progress-fill ${isOver ? 'is-over' : ''} ${stat.isProjected ? 'is-projected' : ''}" style="width:${fillPct.toFixed(1)}%;"></div>
          ${showPace ? `<div class="progress-pace" style="left:${snapshot.monthPace.toFixed(1)}%;" title="Heute"></div>` : ''}
        </div>
        <div class="cat-footer">
          <span class="cat-spent-text money">
            <strong>${escapeHtml(formatMoney(stat.netSpent, { privacy }))}</strong> von ${escapeHtml(formatMoney(stat.budget, { privacy, compact: true }))}
          </span>
          ${diffHtml}
        </div>
      </div>
      ${goalLine}
    </article>
  `;
}

export function renderOverviewView(state, ui, snapshot) {
  const privacy = state.settings.privacyMode;

  const activeGroup = ui.groupFilter || 'all';
  const filteredCats = activeGroup === 'all'
    ? snapshot.categories
    : snapshot.categories.filter((c) => c.category.group === activeGroup);

  const filterChips = [
    { id: 'all', label: `Alle (${snapshot.categories.length})`, count: 1 },
    ...CATEGORY_GROUPS.map((g) => ({
      id: g.id,
      label: `${g.label} (${snapshot.categories.filter((c) => c.category.group === g.id).length})`,
      count: snapshot.categories.filter((c) => c.category.group === g.id).length,
    })),
  ]
    .filter((chip) => chip.count > 0)
    .map((chip) => `<button class="chip ${activeGroup === chip.id ? 'is-active' : ''}" data-group-filter="${chip.id}">${escapeHtml(chip.label)}</button>`)
    .join('');

  const categoryCards = filteredCats.map((stat) => renderCategoryCard(stat, snapshot, privacy)).join('');

  return `
    ${renderInstallBanner(state)}
    ${renderFutureBanner(state, snapshot)}
    ${renderRecap(state, snapshot, privacy)}
    ${renderHero(snapshot, privacy)}
    ${renderRecurringBanner(snapshot, privacy)}
    ${renderBackupReminder(state)}
    ${renderPlanAlert(snapshot, privacy)}

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
