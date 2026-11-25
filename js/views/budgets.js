// ==========================================================================
// cash-map — Tab 4: Plan (Salary, Distribution, Explainer & Category Budgets)
// ==========================================================================

import { icon } from '../icons.js';
import { formatMoney, formatMonthLong, escapeHtml } from '../format.js';
import { CATEGORY_GROUPS } from '../defaults.js';
import { getTimelineStartMonth } from '../finance.js';

export function renderPlanRowMeta(stat, salary) {
  const sharePct = salary > 0 ? Math.round((stat.budget / salary) * 100) : 0;
  const parts = [`${sharePct} % vom Gehalt`];
  if (stat.isRecurring) {
    parts.push(`${icon('repeat', 11, 'inline-icon')} Dauerauftrag am ${stat.bookingDay}.`);
  } else if (stat.surplusTarget) {
    parts.push(`${icon('cornerDownRight', 11, 'inline-icon')} Überschuss → ${escapeHtml(stat.surplusTarget.name)}`);
  } else if (stat.category.rollover) {
    parts.push('Wachsender Topf');
  } else {
    parts.push('Ohne Übertrag');
  }
  return parts.join(' · ');
}

export function renderPlanSummary(snapshot, privacy) {
  const unalloc = snapshot.unallocatedSalary;
  const isPerfect = Math.abs(unalloc) < 0.01;
  const isOver = unalloc < -0.01;
  const isFree = unalloc > 0.01;

  const baseTotal = Math.max(snapshot.salary, snapshot.totalBudgeted, 1);
  const stackSegments = CATEGORY_GROUPS.map((g) => {
    const grp = snapshot.groups.find((x) => x.id === g.id);
    const val = grp ? grp.budget : 0;
    const pct = (val / baseTotal) * 100;
    return pct > 0.4
      ? `<div class="plan-stack-seg" style="width:${pct.toFixed(2)}%;background:${g.color};" title="${escapeHtml(g.label)}"></div>`
      : '';
  }).join('');

  const legend = CATEGORY_GROUPS.map((g) => {
    const grp = snapshot.groups.find((x) => x.id === g.id);
    if (!grp) return '';
    return `<span class="plan-legend-item"><span class="legend-dot" style="background:${g.color}"></span>${escapeHtml(g.short)} <strong class="money">${escapeHtml(formatMoney(grp.budget, { privacy, compact: true }))}</strong></span>`;
  }).join('');

  const statusText = isPerfect
    ? 'Perfekt! 100 % deines Nettogehalts sind verplant.'
    : isOver
      ? `Achtung: ${formatMoney(Math.abs(unalloc), { privacy })} mehr verplant als dein Gehalt.`
      : `Noch ${formatMoney(unalloc, { privacy })} vom Nettogehalt unverplant.`;

  const pufferCat = snapshot.categories.find((c) => c.category.id === 'cat_puffer' || c.category.name.toLowerCase().includes('puffer'));

  return `
    <section class="card" id="plan-summary" style="display:flex;flex-direction:column;gap:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div style="min-width:0;">
          <div class="eyebrow-label">Nettogehalt · ${escapeHtml(formatMonthLong(snapshot.monthKey))}</div>
          <div class="money" style="font-family:var(--font-display);font-size:1.85rem;font-weight:750;letter-spacing:-0.035em;margin-top:2px;">
            ${escapeHtml(formatMoney(snapshot.salary, { privacy }))}
          </div>
          ${snapshot.salaryOverridden
            ? `<div style="font-size:var(--text-xs);color:var(--accent);font-weight:600;margin-top:2px;">Sonderbetrag nur für diesen Monat</div>`
            : `<div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:2px;">Gilt monatlich ab diesem Zeitraum</div>`}
        </div>
        <button class="btn btn-secondary btn-sm" data-action="edit-salary">${icon('edit', 14)} Ändern</button>
      </div>

      <div>
        <div class="plan-stack">${stackSegments}</div>
        <div class="plan-legend">${legend}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px;font-size:var(--text-xs);">
          <span style="font-weight:650;color:${isPerfect ? 'var(--positive)' : isOver ? 'var(--negative)' : 'var(--warning)'};">${escapeHtml(statusText)}</span>
        </div>
      </div>

      ${isFree && pufferCat ? `
        <button class="btn btn-secondary btn-sm btn-block" data-action="assign-rest-to-puffer" data-puffer-id="${pufferCat.category.id}">
          ${icon('sparkles', 14)} Rest (${escapeHtml(formatMoney(unalloc, { privacy }))}) in „${escapeHtml(pufferCat.category.name)}“ legen
        </button>
      ` : ''}
    </section>
  `;
}

function renderExplainer() {
  const groupRows = CATEGORY_GROUPS.map((g) => `
    <div class="explainer-row">
      <span class="legend-dot" style="background:${g.color};margin-top:4px;"></span>
      <div><strong>${escapeHtml(g.label)}</strong> – ${escapeHtml(g.hint)}</div>
    </div>
  `).join('');

  return `
    <details class="explainer">
      <summary>
        <span style="display:flex;align-items:center;gap:8px;">${icon('info', 16)} Gruppen, Daueraufträge &amp; Überschüsse – kurz erklärt</span>
        ${icon('chevronDown', 16, 'chev')}
      </summary>
      <div class="explainer-body">
        <div class="explainer-title">Gruppe = <em>wofür</em> das Geld ist</div>
        ${groupRows}
        <div class="explainer-title">Dauerauftrag = <em>wie</em> gebucht wird</div>
        <div class="explainer-row">
          <span class="explainer-icon">${icon('repeat', 14)}</span>
          <div>Ein fester Betrag an einem festen Tag – unabhängig von der Gruppe. So ist die Miete ein Dauerauftrag in <strong>Fixkosten</strong> und dein Aktiensparplan einer in <strong>Sparen &amp; Investieren</strong>.</div>
        </div>
        <div class="explainer-title">Überschuss am Monatsende: Eigener Topf vs. Weiterleiten</div>
        <div class="explainer-row">
          <span class="explainer-icon">${icon('piggy', 14)}</span>
          <div><strong>Im eigenen Topf ansparen:</strong> Ideal für jährliche Versicherungen, Auto-Reparaturen oder Kleidung – Ungenutztes baut dein Kategoriekonto auf.</div>
        </div>
        <div class="explainer-row">
          <span class="explainer-icon">${icon('cornerDownRight', 14)}</span>
          <div><strong>Überschuss weiterleiten:</strong> Ideal für Monatsbudgets wie <strong>Sauna</strong> – der neue Monat startet frisch beim Monatsbudget, und alles Gesparte wandert automatisch in deinen Ziel-Topf (z. B. <strong>Puffer</strong> oder <strong>Aktiensparplan</strong>).</div>
        </div>
      </div>
    </details>
  `;
}

export function renderBudgetsView(state, ui, snapshot) {
  const privacy = state.settings.privacyMode;
  const trackingStart = getTimelineStartMonth(state);

  const groupedHtml = CATEGORY_GROUPS.map((g) => {
    const items = snapshot.categories.filter((s) => s.category.group === g.id);
    if (items.length === 0) return '';
    const grpSum = items.reduce((sum, s) => sum + s.budget, 0);

    const rows = items.map((stat) => {
      const cat = stat.category;
      return `
        <div class="plan-cat-row">
          <button class="cat-icon" style="--cat-color:${cat.color};width:38px;height:38px;border-radius:11px;" data-edit-category="${cat.id}" aria-label="${escapeHtml(cat.name)} bearbeiten">
            ${icon(cat.icon, 19)}
          </button>
          <div class="plan-cat-info" data-edit-category="${cat.id}">
            <div class="plan-cat-name">
              <span class="truncate">${escapeHtml(cat.name)}</span>
              ${icon('edit', 12, 'plan-edit-hint')}
            </div>
            <div class="plan-meta truncate" id="plan-meta-${cat.id}">${renderPlanRowMeta(stat, snapshot.salary)}</div>
          </div>
          <div class="plan-input-wrap">
            <input
              type="text"
              inputmode="decimal"
              enterkeyhint="done"
              autocomplete="off"
              class="plan-cat-input"
              data-budget-input="${cat.id}"
              value="${privacy ? '•••' : stat.budget.toFixed(2).replace('.', ',')}"
              ${privacy ? 'disabled' : ''}
              aria-label="Monatsbudget für ${escapeHtml(cat.name)}"
            />
            <span class="plan-cat-suffix">€</span>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div class="section-head">
          <span class="section-title" style="font-size:var(--text-sm);">
            <span class="legend-dot" style="background:${g.color};"></span>
            ${escapeHtml(g.label)}
          </span>
          <span class="money text-muted" id="plan-group-sum-${g.id}" style="font-size:var(--text-xs);font-weight:700;">${escapeHtml(formatMoney(grpSum, { privacy }))}</span>
        </div>
        ${rows}
      </div>
    `;
  }).join('');

  return `
    <div class="section-head">
      <h2 class="section-title">Gehalts- &amp; Budgetplan</h2>
      <button class="btn btn-primary btn-sm" data-action="new-category">${icon('plus', 14)} Kategorie</button>
    </div>

    ${renderPlanSummary(snapshot, privacy)}

    <div class="plan-info-line">
      <span>${icon('calendar', 13, 'inline-icon')} Tracking seit <strong>${escapeHtml(formatMonthLong(trackingStart))}</strong> · Änderungen gelten ab <strong>${escapeHtml(formatMonthLong(snapshot.monthKey))}</strong></span>
      <button class="section-link" data-action="edit-start-month">Beginn ändern</button>
    </div>

    ${renderExplainer()}

    ${groupedHtml}
  `;
}
