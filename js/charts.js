// ==========================================================================
// cash-map — Custom SVG Charts (Sankey Cash-Flow Map, Donut, 6M Trends)
// ==========================================================================

import { formatMoney, formatMonthNameOnly, escapeHtml, roundCents } from './format.js';

/**
 * Renders the signature Cash-Flow Sankey Diagram (Nettogehalt -> Gruppen -> Kategorien / Töpfe).
 * mode: 'plan' (planned salary distribution) | 'actual' (real money flow incl. savings)
 */
export function renderCashFlowSankey(snapshot, { mode = 'plan', privacy = false } = {}) {
  const width = 440;
  const isPlan = mode === 'plan';

  const sourceTotal = isPlan ? Math.max(snapshot.salary, snapshot.totalBudgeted) : Math.max(snapshot.totalIncome, snapshot.netOutflow);
  if (sourceTotal <= 0) {
    return `<div class="empty-state" style="padding: 24px 16px;">
      <div class="empty-title">Noch kein Geldfluss vorhanden</div>
      <div class="empty-sub">Trage dein Nettogehalt und deine Budgets ein, um deine Cash-Map zu sehen.</div>
    </div>`;
  }

  // Build right-side targets
  let targets = [];
  if (isPlan) {
    targets = snapshot.categories
      .filter((c) => c.budget > 0)
      .map((c) => ({
        id: c.category.id,
        label: c.category.name,
        group: c.category.group,
        amount: c.budget,
        color: c.category.color,
      }));
    if (snapshot.unallocatedSalary > 0.01) {
      targets.push({
        id: '_unallocated',
        label: 'Noch nicht verteilt',
        group: 'reserve',
        amount: snapshot.unallocatedSalary,
        color: '#64748B',
      });
    }
  } else {
    targets = snapshot.categories
      .filter((c) => c.netSpent > 0)
      .map((c) => ({
        id: c.category.id,
        label: c.category.name,
        group: c.category.group,
        amount: c.netSpent,
        color: c.category.color,
      }));
    if (snapshot.monthlyCashflowDiff > 0.01) {
      targets.push({
        id: '_saved',
        label: 'Gespart (in Töpfe)',
        group: 'reserve',
        amount: snapshot.monthlyCashflowDiff,
        color: '#10D99B',
      });
    }
  }

  targets.sort((a, b) => b.amount - a.amount);

  // Build middle nodes (groups)
  const groupOrder = [
    { id: 'fixed', label: 'Fixkosten', color: '#5B8CFF' },
    { id: 'daily', label: 'Alltag', color: '#10D99B' },
    { id: 'invest', label: 'Investition', color: '#A78BFA' },
    { id: 'reserve', label: isPlan ? 'Rücklagen' : 'Rückl. & Spar-Plus', color: '#F5B942' },
  ];

  const groups = groupOrder
    .map((g) => {
      const children = targets.filter((t) => t.group === g.id);
      const total = roundCents(children.reduce((s, c) => s + c.amount, 0));
      return { ...g, children, total };
    })
    .filter((g) => g.total > 0);

  // Order targets grouped by their middle group so Sankey ribbons never cross!
  const orderedTargets = [];
  for (const g of groups) {
    for (const child of g.children) {
      orderedTargets.push(child);
    }
  }

  const totalFlow = roundCents(orderedTargets.reduce((s, t) => s + t.amount, 0)) || 1;

  // Dynamic height with guaranteed non-overlapping vertical pitch for all labels
  const padTop = 24;
  const padBot = 24;
  const targetGap = 9;
  const minBarH = 26; // ensures 2-line labels (title + €) never collide even for tiny budgets
  const extraProportionalPool = Math.max(90, orderedTargets.length * 10);

  const targetHeights = orderedTargets.map(
    (t) => minBarH + (t.amount / totalFlow) * extraProportionalPool
  );
  const usableH = targetHeights.reduce((a, b) => a + b, 0) + Math.max(0, orderedTargets.length - 1) * targetGap;
  const height = Math.ceil(usableH + padTop + padBot);

  const colLeftX = 10;
  const colMidX = 148;
  const colRightX = 270;
  const nodeW = 10;

  // Layout right targets with guaranteed pitch
  const targetNodes = [];
  let cursorY = padTop;
  orderedTargets.forEach((t, idx) => {
    const h = targetHeights[idx];
    targetNodes.push({ ...t, x: colRightX, y: cursorY, h });
    cursorY += h + targetGap;
  });

  // Layout middle groups centered cleanly over their actual target spans (with collision protection)
  const groupGap = 14;
  const groupNodes = [];
  let prevGroupBottom = padTop - groupGap;
  for (const g of groups) {
    const childNodes = targetNodes.filter((tn) => tn.group === g.id);
    const spanTop = childNodes[0].y;
    const spanBot = childNodes[childNodes.length - 1].y + childNodes[childNodes.length - 1].h;
    const desiredH = Math.max(28, Math.min(spanBot - spanTop, (g.total / totalFlow) * usableH * 0.72 + 22));
    const spanMid = (spanTop + spanBot) / 2;
    let y = Math.max(prevGroupBottom + groupGap, spanMid - desiredH / 2);
    if (y + desiredH > padTop + usableH) {
      y = Math.max(prevGroupBottom + groupGap, padTop + usableH - desiredH);
    }
    groupNodes.push({ ...g, x: colMidX, y, h: desiredH, outCursor: y });
    prevGroupBottom = y + desiredH;
  }

  // Layout left source node
  const srcH = Math.max(100, Math.min(usableH * 0.65, 220));
  const srcY = padTop + (usableH - srcH) / 2;
  let srcCursor = srcY;

  const linksSvg = [];
  const nodesSvg = [];

  // Source node
  nodesSvg.push(`
    <rect x="${colLeftX}" y="${srcY.toFixed(1)}" width="${nodeW}" height="${srcH.toFixed(1)}" rx="5" fill="url(#sankeySrcGrad)" />
    <text x="${colLeftX}" y="${(srcY - 6).toFixed(1)}" class="sankey-node-label">${isPlan ? 'Nettogehalt' : 'Einnahmen'}</text>
    <text x="${colLeftX}" y="${(srcY + srcH + 13).toFixed(1)}" class="sankey-node-val">${escapeHtml(formatMoney(isPlan ? snapshot.salary : snapshot.totalIncome, { privacy, compact: true }))}</text>
  `);

  // Links: Source -> Groups
  for (const g of groupNodes) {
    const linkThick = Math.max(3, (g.total / totalFlow) * srcH);
    const y0 = srcCursor + linkThick / 2;
    const y1 = g.y + g.h / 2;
    srcCursor += linkThick;

    const x0 = colLeftX + nodeW;
    const x1 = g.x;
    const cx = (x0 + x1) / 2;
    linksSvg.push(
      `<path class="sankey-link" d="M ${x0} ${y0.toFixed(1)} C ${cx} ${y0.toFixed(1)}, ${cx} ${y1.toFixed(1)}, ${x1} ${y1.toFixed(1)}" stroke="${g.color}" stroke-width="${Math.max(2.5, Math.min(linkThick, g.h)).toFixed(1)}" />`
    );

    // Group bar + label
    const gMidY = g.y + g.h / 2;
    nodesSvg.push(`
      <rect x="${g.x}" y="${g.y.toFixed(1)}" width="${nodeW}" height="${g.h.toFixed(1)}" rx="5" fill="${g.color}" />
      <text x="${g.x - 6}" y="${(gMidY - 2).toFixed(1)}" text-anchor="end" class="sankey-node-label">${escapeHtml(g.label)}</text>
      <text x="${g.x - 6}" y="${(gMidY + 10).toFixed(1)}" text-anchor="end" class="sankey-node-val">${escapeHtml(formatMoney(g.total, { privacy, compact: true }))}</text>
    `);
  }

  // Links: Groups -> Targets
  for (const t of targetNodes) {
    const g = groupNodes.find((gn) => gn.id === t.group);
    if (!g) continue;
    const segH = Math.max(2, (t.amount / g.total) * g.h);
    const y0 = g.outCursor + segH / 2;
    g.outCursor += segH;
    const y1 = t.y + t.h / 2;

    const x0 = g.x + nodeW;
    const x1 = t.x;
    const cx = (x0 + x1) / 2;
    linksSvg.push(
      `<path class="sankey-link" d="M ${x0} ${y0.toFixed(1)} C ${cx} ${y0.toFixed(1)}, ${cx} ${y1.toFixed(1)}, ${x1} ${y1.toFixed(1)}" stroke="${t.color}" stroke-width="${Math.max(2, Math.min(segH, t.h)).toFixed(1)}" />`
    );

    const shortLabel = t.label.length > 22 ? `${t.label.slice(0, 21)}…` : t.label;
    const tMidY = t.y + t.h / 2;
    nodesSvg.push(`
      <rect x="${t.x}" y="${t.y.toFixed(1)}" width="${nodeW}" height="${t.h.toFixed(1)}" rx="4" fill="${t.color}" />
      <text x="${t.x + nodeW + 8}" y="${(tMidY - 2).toFixed(1)}" class="sankey-node-label">${escapeHtml(shortLabel)}</text>
      <text x="${t.x + nodeW + 8}" y="${(tMidY + 10.5).toFixed(1)}" class="sankey-node-val">${escapeHtml(formatMoney(t.amount, { privacy, compact: true }))}</text>
    `);
  }

  return `
    <div class="sankey-wrap">
      <svg class="sankey-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Geldfluss-Diagramm">
        <defs>
          <linearGradient id="sankeySrcGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#5B8CFF"/>
            <stop offset="100%" stop-color="#10D99B"/>
          </linearGradient>
        </defs>
        ${linksSvg.join('')}
        ${nodesSvg.join('')}
      </svg>
    </div>
  `;
}

/**
 * Renders a crisp Donut Chart for actual spending breakdown by category.
 */
export function renderSpendingDonut(snapshot, { privacy = false } = {}) {
  const items = snapshot.categories
    .filter((c) => c.netSpent > 0)
    .sort((a, b) => b.netSpent - a.netSpent);

  const total = roundCents(items.reduce((s, c) => s + c.netSpent, 0));
  if (total <= 0) {
    return `<div class="empty-state" style="padding: 24px 16px;">
      <div class="empty-title">Noch keine Ausgaben</div>
      <div class="empty-sub">Sobald du Buchungen einträgst, erscheint hier deine Ausgaben-Verteilung.</div>
    </div>`;
  }

  const size = 152;
  const cx = size / 2;
  const cy = size / 2;
  const r = 56;
  const strokeW = 18;
  const circ = 2 * Math.PI * r;
  const gap = items.length > 1 ? 3 : 0;

  let offset = 0;
  const arcs = items.map((item) => {
    const share = item.netSpent / total;
    const len = Math.max(2, share * circ - gap);
    const dashArray = `${len.toFixed(2)} ${(circ - len).toFixed(2)}`;
    const dashOffset = (-offset).toFixed(2);
    offset += share * circ;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${item.category.color}" stroke-width="${strokeW}" stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}" transform="rotate(-90 ${cx} ${cy})" />`;
  });

  const topLegend = items.slice(0, 6);
  const restAmount = roundCents(items.slice(6).reduce((s, c) => s + c.netSpent, 0));

  const legendRows = topLegend
    .map((item) => {
      const pct = Math.round((item.netSpent / total) * 100);
      return `
        <div class="legend-item">
          <div class="legend-left">
            <span class="legend-dot" style="background:${item.category.color}"></span>
            <span class="legend-name">${escapeHtml(item.category.name)}</span>
          </div>
          <span class="legend-val money">${escapeHtml(formatMoney(item.netSpent, { privacy, compact: true }))} <span class="text-dim" style="font-weight:500;">${pct}%</span></span>
        </div>
      `;
    })
    .join('');

  const restRow = restAmount > 0
    ? `<div class="legend-item">
        <div class="legend-left">
          <span class="legend-dot" style="background:var(--text-tertiary)"></span>
          <span class="legend-name">Weitere (${items.length - 6})</span>
        </div>
        <span class="legend-val money">${escapeHtml(formatMoney(restAmount, { privacy, compact: true }))}</span>
      </div>`
    : '';

  return `
    <div class="donut-layout">
      <div class="donut-svg-wrap">
        <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Ausgabenverteilung">
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--track-bg)" stroke-width="${strokeW}" />
          ${arcs.join('')}
        </svg>
        <div class="donut-center">
          <span class="donut-center-label">Ausgaben</span>
          <span class="donut-center-val money">${escapeHtml(formatMoney(total, { privacy, compact: true }))}</span>
        </div>
      </div>
      <div class="donut-legend">
        ${legendRows}
        ${restRow}
      </div>
    </div>
  `;
}

/**
 * Renders 6-Month Cashflow Comparison (Einnahmen vs. Ausgaben) + Total Pot trend line.
 */
export function renderSixMonthChart(series, { privacy = false } = {}) {
  const width = 420;
  const height = 175;
  const padL = 12;
  const padR = 12;
  const padT = 16;
  const padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxVal = Math.max(
    100,
    ...series.map((s) => Math.max(s.totalIncome, s.netOutflow, s.totalBudgeted))
  );

  const groupW = plotW / series.length;
  const barW = Math.min(18, groupW * 0.28);
  const gap = 4;

  // Horizontal guide lines
  const gridLines = [0, 0.5, 1].map((f) => {
    const y = padT + plotH * (1 - f);
    return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" class="chart-grid-line" />`;
  });

  const bars = series.map((snap, idx) => {
    const cx = padL + idx * groupW + groupW / 2;
    const incH = Math.max(2, (snap.totalIncome / maxVal) * plotH);
    const outH = Math.max(2, (snap.netOutflow / maxVal) * plotH);
    const incY = padT + plotH - incH;
    const outY = padT + plotH - outH;
    const isOver = snap.netOutflow > snap.totalIncome;
    const isLast = idx === series.length - 1;

    return `
      <g>
        <rect x="${(cx - barW - gap / 2).toFixed(1)}" y="${incY.toFixed(1)}" width="${barW}" height="${incH.toFixed(1)}" rx="5" fill="#5B8CFF" opacity="${isLast ? '1' : '0.68'}" />
        <rect x="${(cx + gap / 2).toFixed(1)}" y="${outY.toFixed(1)}" width="${barW}" height="${outH.toFixed(1)}" rx="5" fill="${isOver ? '#FF5C77' : '#10D99B'}" opacity="${isLast ? '1' : '0.78'}" />
        <text x="${cx.toFixed(1)}" y="${height - 8}" text-anchor="middle" class="chart-axis-label" style="${isLast ? 'fill:var(--text-primary);font-weight:750;' : ''}">${escapeHtml(formatMonthNameOnly(snap.monthKey))}</text>
      </g>
    `;
  });

  const latest = series[series.length - 1];
  const avgOut = roundCents(series.reduce((s, x) => s + x.netOutflow, 0) / series.length);

  return `
    <svg class="bar-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="6-Monats-Verlauf">
      ${gridLines.join('')}
      ${bars.join('')}
    </svg>
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <div class="chart-legend-inline">
        <span class="chart-legend-chip"><span class="legend-dot" style="background:#5B8CFF"></span>Einnahmen</span>
        <span class="chart-legend-chip"><span class="legend-dot" style="background:#10D99B"></span>Ausgaben</span>
      </div>
      <div class="text-dim" style="font-size:var(--text-xs);">Ø Ausgaben: <strong class="money" style="color:var(--text-primary);">${escapeHtml(formatMoney(avgOut, { privacy, compact: true }))}</strong></div>
    </div>
  `;
}

/**
 * Renders 6-month history for a single category inside the Category Detail Sheet:
 * subtle budget backdrop bar + actual spending bar + pot balance indicator.
 */
export function renderCategoryHistoryChart(history, color, { privacy = false } = {}) {
  const width = 380;
  const height = 136;
  const padL = 8;
  const padR = 8;
  const padT = 18;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxVal = Math.max(20, ...history.map((h) => Math.max(h.budget, h.netSpent)));
  const slotW = plotW / history.length;
  const barW = Math.min(26, slotW * 0.44);

  const items = history.map((h, idx) => {
    const cx = padL + idx * slotW + slotW / 2;
    const bH = Math.max(2, (h.budget / maxVal) * plotH);
    const sH = Math.max(h.netSpent > 0 ? 4 : 0, (h.netSpent / maxVal) * plotH);
    const bY = padT + plotH - bH;
    const sY = padT + plotH - sH;
    const isOver = h.netSpent > h.budget;
    const isLast = idx === history.length - 1;

    return `
      <g>
        <rect x="${(cx - barW / 2).toFixed(1)}" y="${bY.toFixed(1)}" width="${barW}" height="${bH.toFixed(1)}" rx="6" fill="var(--track-bg)" stroke="var(--border-default)" stroke-width="1" stroke-dasharray="3 2" />
        ${sH > 0 ? `<rect x="${(cx - barW / 2).toFixed(1)}" y="${sY.toFixed(1)}" width="${barW}" height="${sH.toFixed(1)}" rx="6" fill="${isOver ? '#FF5C77' : color}" opacity="${isLast ? '1' : '0.78'}" />` : ''}
        <text x="${cx.toFixed(1)}" y="${(Math.min(bY, sY) - 5).toFixed(1)}" text-anchor="middle" class="chart-axis-label" style="font-size:9px;fill:${isOver ? 'var(--negative)' : 'var(--text-secondary)'};">${privacy ? '••' : (h.netSpent > 0 ? Math.round(h.netSpent) + '€' : '0€')}</text>
        <text x="${cx.toFixed(1)}" y="${height - 7}" text-anchor="middle" class="chart-axis-label" style="${isLast ? 'fill:var(--text-primary);font-weight:750;' : ''}">${escapeHtml(formatMonthNameOnly(h.monthKey))}</text>
      </g>
    `;
  });

  return `
    <svg class="bar-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Kategorie 6-Monats-Verlauf">
      <line x1="${padL}" y1="${padT + plotH}" x2="${width - padR}" y2="${padT + plotH}" class="chart-grid-line" />
      ${items.join('')}
    </svg>
  `;
}
