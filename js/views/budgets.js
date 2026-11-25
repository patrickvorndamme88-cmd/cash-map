// ==========================================================================
// cash-map — Tab 4: Plan (Salary Config, Distribution Bar & Category Editor)
// ==========================================================================

import { icon } from '../icons.js';
import { formatMoney, formatMonthLong, escapeHtml } from '../format.js';
import { CATEGORY_GROUPS } from '../defaults.js';

export function renderBudgetsView(state, ui, snapshot) {
  const privacy = state.settings.privacyMode;
  const unalloc = snapshot.unallocatedSalary;
  const isPerfect = Math.abs(unalloc) < 0.01;
  const isOver = unalloc < -0.01;
  const isFree = unalloc > 0.01;

  // Stacked salary distribution segments by group
  const baseTotal = Math.max(snapshot.salary, snapshot.totalBudgeted, 1);
  const stackSegments = CATEGORY_GROUPS.map((g) => {
    const grp = snapshot.groups.find((x) => x.id === g.id);
    const val = grp ? grp.budget : 0;
    const pct = (val / baseTotal) * 100;
    return pct > 0.4
      ? `<div style="width:${pct.toFixed(2)}%;background:${g.color};height:100%;transition:width 320ms var(--ease-spring);" title="${escapeHtml(g.label)}: ${escapeHtml(formatMoney(val, { privacy }))}"></div>`
      : '';
  }).join('');

  const statusText = isPerfect
    ? 'Perfekt! 100 % deines Nettogehalts sind verplant.'
    : isOver
      ? `Achtung: ${formatMoney(Math.abs(unalloc), { privacy })} mehr verplant als dein Gehalt.`
      : `Noch ${formatMoney(unalloc, { privacy })} vom Nettogehalt unverplant.`;

  const pufferCat = snapshot.categories.find((c) => c.category.id === 'cat_puffer' || c.category.name.toLowerCase().includes('puffer'));

  // Group categories neatly for planning
  const groupedHtml = CATEGORY_GROUPS.map((g) => {
    const items = snapshot.categories.filter((s) => s.category.group === g.id);
    if (items.length === 0) return '';
    const grpSum = items.reduce((sum, s) => sum + s.budget, 0);

    const rows = items
      .map((stat) => {
        const cat = stat.category;
        const sharePct = snapshot.salary > 0 ? Math.round((stat.budget / snapshot.salary) * 100) : 0;
        return `
          <div class="plan-cat-row">
            <button class="cat-icon" style="--cat-color:${cat.color};width:38px;height:38px;border-radius:11px;" data-edit-category="${cat.id}" aria-label="${escapeHtml(cat.name)} bearbeiten">
              ${icon(cat.icon, 19)}
            </button>
            <div style="flex:1;min-width:0;cursor:pointer;" data-edit-category="${cat.id}">
              <div class="cat-name" style="font-size:var(--text-sm);">${escapeHtml(cat.name)}</div>
              <div class="truncate" style="font-size:0.7rem;color:var(--text-tertiary);margin-top:1px;">
                ${sharePct} % Gehalt${cat.isFixed ? ' · Fix' : ''}${cat.rollover ? ' · Topf' : ''}
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:5px;">
              <div style="position:relative;display:flex;align-items:center;">
                <input
                  type="text"
                  inputmode="decimal"
                  class="plan-cat-input"
                  data-budget-input="${cat.id}"
                  value="${privacy ? '•••' : stat.budget.toFixed(2).replace('.', ',')}"
                  ${privacy ? 'disabled' : ''}
                  aria-label="Monatsbudget für ${escapeHtml(cat.name)}"
                />
                <span style="position:absolute;right:9px;font-size:var(--text-xs);font-weight:700;color:var(--text-tertiary);pointer-events:none;">€</span>
              </div>
              <button class="icon-btn" style="width:30px;height:30px;" data-edit-category="${cat.id}" aria-label="${escapeHtml(cat.name)} Details bearbeiten">
                ${icon('edit', 14)}
              </button>
            </div>
          </div>
        `;
      })
      .join('');

    return `
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div class="section-head">
          <span class="section-title" style="font-size:var(--text-sm);">
            <span class="legend-dot" style="background:${g.color};"></span>
            ${escapeHtml(g.label)}
          </span>
          <span class="money text-muted" style="font-size:var(--text-xs);font-weight:700;">${escapeHtml(formatMoney(grpSum, { privacy }))}</span>
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

    <!-- Net Salary & Allocation Card -->
    <section class="card" style="display:flex;flex-direction:column;gap:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div>
          <div style="font-size:var(--text-xs);font-weight:650;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.04em;">
            Nettogehalt · ${escapeHtml(formatMonthLong(snapshot.monthKey))}
          </div>
          <div class="money" style="font-family:var(--font-display);font-size:1.85rem;font-weight:750;letter-spacing:-0.035em;margin-top:2px;">
            ${escapeHtml(formatMoney(snapshot.salary, { privacy }))}
          </div>
          ${snapshot.salaryOverridden
            ? `<div style="font-size:var(--text-xs);color:var(--accent);font-weight:600;margin-top:2px;">Sonderbetrag nur für diesen Monat aktiv</div>`
            : `<div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:2px;">Gilt monatlich ab diesem Zeitraum</div>`}
        </div>
        <button class="btn btn-secondary btn-sm" data-action="edit-salary">${icon('edit', 14)} Ändern</button>
      </div>

      <!-- Stacked Distribution Bar -->
      <div>
        <div style="height:10px;border-radius:999px;background:var(--track-bg);overflow:hidden;display:flex;gap:2px;">
          ${stackSegments}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:var(--text-xs);">
          <span style="font-weight:650;color:${isPerfect ? 'var(--positive)' : isOver ? 'var(--negative)' : 'var(--warning)'};">
            ${escapeHtml(statusText)}
          </span>
          <span class="money text-muted">Verplant: <strong>${escapeHtml(formatMoney(snapshot.totalBudgeted, { privacy, compact: true }))}</strong></span>
        </div>
      </div>

      ${isFree && pufferCat ? `
        <button class="btn btn-secondary btn-sm btn-block" data-action="assign-rest-to-puffer" data-puffer-id="${pufferCat.category.id}">
          ${icon('sparkles', 14)} Rest (${escapeHtml(formatMoney(unalloc, { privacy }))}) automatisch in „${escapeHtml(pufferCat.category.name)}“ legen
        </button>
      ` : ''}
    </section>

    <div style="font-size:var(--text-xs);color:var(--text-tertiary);padding:0 4px;">
      Tipp: Änderungen am Monatsbudget gelten standardmäßig ab <strong>${escapeHtml(formatMonthLong(snapshot.monthKey))}</strong>, damit ältere Monate unverfälscht bleiben. Tippe auf eine Kategorie für Startguthaben, Sparziel, Fixkosten &amp; Reihenfolge.
    </div>

    ${groupedHtml}
  `;
}
