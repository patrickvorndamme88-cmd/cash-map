// ==========================================================================
// cash-map — Tab 3: Cash-Map & Analytics (Sankey, Donut, 6M Trend, Pots)
// ==========================================================================

import { renderCashFlowSankey, renderSpendingDonut, renderSixMonthChart } from '../charts.js';
import { computeHistorySeries } from '../finance.js';
import { formatMoney, formatMonthLong, formatPercent, escapeHtml } from '../format.js';
import { icon } from '../icons.js';

export function renderAnalyticsView(state, ui, snapshot) {
  const privacy = state.settings.privacyMode;
  const mode = ui.analyticsMode || 'plan';
  const series = computeHistorySeries(state, snapshot.monthKey, 6);

  // Pot ranking (sorted by potBalance descending)
  const potSorted = [...snapshot.categories].sort((a, b) => b.potBalance - a.potBalance);
  const maxAbsPot = Math.max(50, ...potSorted.map((c) => Math.abs(c.potBalance)));

  const potRankHtml = potSorted
    .map((stat) => {
      const pct = Math.min(100, (Math.abs(stat.potBalance) / maxAbsPot) * 100);
      const isNeg = stat.potBalance < 0;
      const barColor = isNeg ? 'var(--negative)' : stat.category.color;
      return `
        <div class="pot-rank-item" data-open-category="${stat.category.id}" style="cursor:pointer;">
          <div class="pot-rank-top">
            <span style="display:flex;align-items:center;gap:7px;font-weight:650;min-width:0;">
              <span style="color:${stat.category.color};display:inline-flex;">${icon(stat.category.icon, 15)}</span>
              <span class="truncate">${escapeHtml(stat.category.name)}</span>
            </span>
            <span class="money ${isNeg ? 'text-neg' : stat.potBalance > 0 ? 'text-pos' : 'text-muted'}" style="font-weight:750;flex-shrink:0;">
              ${escapeHtml(formatMoney(stat.potBalance, { privacy, signed: true }))}
            </span>
          </div>
          <div class="pot-rank-bar-bg">
            <div class="pot-rank-bar-fill" style="width:${pct.toFixed(1)}%;background:${barColor};"></div>
          </div>
        </div>
      `;
    })
    .join('');

  return `
    <div class="section-head">
      <h2 class="section-title">Cash-Map Analyse</h2>
      <span class="text-dim" style="font-size:var(--text-xs);font-weight:600;">${escapeHtml(formatMonthLong(snapshot.monthKey))}</span>
    </div>

    <!-- 2x2 KPI Highlights -->
    <section class="stats-grid-2">
      <div class="stat-card">
        <div class="stat-label">Spar- &amp; Investquote</div>
        <div class="stat-val money ${snapshot.savingsRate >= 20 ? 'text-pos' : snapshot.savingsRate < 0 ? 'text-neg' : ''}">
          ${privacy ? '•• %' : formatPercent(snapshot.savingsRate, 1)}
        </div>
        <div class="stat-sub">Vermögensplus: <span class="money">${escapeHtml(formatMoney(snapshot.wealthAdded, { privacy, signed: true, compact: true }))}</span></div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Monats-Cashflow</div>
        <div class="stat-val money ${snapshot.monthlyCashflowDiff >= 0 ? 'text-pos' : 'text-neg'}">
          ${escapeHtml(formatMoney(snapshot.monthlyCashflowDiff, { privacy, signed: true, compact: true }))}
        </div>
        <div class="stat-sub">Einnahmen minus Ausgaben</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Topf-Rücklagen gesamt</div>
        <div class="stat-val money ${snapshot.totalPotBalance >= 0 ? 'text-pos' : 'text-neg'}">
          ${escapeHtml(formatMoney(snapshot.totalPotBalance, { privacy, compact: true }))}
        </div>
        <div class="stat-sub">${snapshot.negativePotTotal < 0 ? `inkl. ${escapeHtml(formatMoney(snapshot.negativePotTotal, { privacy, compact: true }))} Minus` : 'Alle Töpfe im grünen Bereich'}</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Investiert (${escapeHtml(snapshot.monthKey.slice(5))}/${snapshot.monthKey.slice(2, 4)})</div>
        <div class="stat-val money" style="color:var(--violet);">
          ${escapeHtml(formatMoney(snapshot.investedThisMonth, { privacy, compact: true }))}
        </div>
        <div class="stat-sub">Aktiensparplan &amp; Co.</div>
      </div>
    </section>

    <!-- Signature Sankey Cash-Flow Map -->
    <section class="chart-card">
      <div class="chart-header">
        <div>
          <div class="chart-title">Geldfluss-Karte</div>
          <div class="chart-subtitle">${mode === 'plan' ? 'Wie sich dein Nettogehalt auf deine Töpfe verteilt' : 'Wohin dein Geld in diesem Monat wirklich geflossen ist'}</div>
        </div>
      </div>
      <div class="segmented">
        <button class="segmented-btn ${mode === 'plan' ? 'is-active' : ''}" data-analytics-mode="plan">Gehalts-Plan</button>
        <button class="segmented-btn ${mode === 'actual' ? 'is-active' : ''}" data-analytics-mode="actual">Echter Fluss</button>
      </div>
      ${renderCashFlowSankey(snapshot, { mode, privacy })}
    </section>

    <!-- Spending Breakdown Donut -->
    <section class="chart-card">
      <div class="chart-header">
        <div>
          <div class="chart-title">Ausgaben-Verteilung</div>
          <div class="chart-subtitle">Anteile der tatsächlichen Ausgaben im ${escapeHtml(formatMonthLong(snapshot.monthKey))}</div>
        </div>
      </div>
      ${renderSpendingDonut(snapshot, { privacy })}
    </section>

    <!-- 6-Month Cashflow Bar Chart -->
    <section class="chart-card">
      <div class="chart-header">
        <div>
          <div class="chart-title">6-Monats-Verlauf</div>
          <div class="chart-subtitle">Einnahmen vs. Ausgaben im Vergleich</div>
        </div>
      </div>
      ${renderSixMonthChart(series, { privacy })}
    </section>

    <!-- Category Pot Leaderboard -->
    <section class="chart-card">
      <div class="chart-header">
        <div>
          <div class="chart-title">Kategoriekonten-Ranking</div>
          <div class="chart-subtitle">Tippe auf einen Topf für den genauen Kontoverlauf</div>
        </div>
      </div>
      <div class="pot-rank-list">
        ${potRankHtml}
      </div>
    </section>
  `;
}
