// ==========================================================================
// cash-map — Month Picker (Year overview) & Tracking-Start Sheet
// ==========================================================================

import { icon } from '../icons.js';
import {
  formatMoney,
  formatMonthLong,
  formatMonthNameOnly,
  escapeHtml,
  getCurrentMonthKey,
  compareMonthKeys,
  parseMonthKey,
  shiftMonthKey,
  monthKeyFromDate,
  roundCents,
} from '../format.js';
import { computeMonthSnapshot, getMonthBounds, FUTURE_PLANNING_MONTHS } from '../finance.js';

export function openMonthPicker(sheets, store, { onToast }) {
  const state = store.state;
  const privacy = state.settings.privacyMode;
  const { min, max } = getMonthBounds(state);
  const cur = getCurrentMonthKey();
  const sel = store.ui.selectedMonth;
  const minYear = parseMonthKey(min).year;
  const maxYear = parseMonthKey(max).year;

  const blocks = [];
  for (let y = minYear; y <= maxYear; y++) {
    let diffSum = 0;
    let investSum = 0;
    let monthsCounted = 0;

    const tiles = [];
    for (let m = 1; m <= 12; m++) {
      const mk = `${y}-${String(m).padStart(2, '0')}`;
      const disabled = compareMonthKeys(mk, min) < 0 || compareMonthKeys(mk, max) > 0;
      const isFuture = compareMonthKeys(mk, cur) > 0;
      let valHtml = '<span class="month-tile-val text-dim">–</span>';

      if (!disabled && !isFuture) {
        const snap = computeMonthSnapshot(state, mk);
        diffSum = roundCents(diffSum + snap.totalMonthDiff);
        investSum = roundCents(investSum + snap.investedThisMonth);
        monthsCounted++;
        const v = Math.round(snap.totalMonthDiff);
        valHtml = `<span class="month-tile-val money ${v >= 0 ? 'text-pos' : 'text-neg'}">${escapeHtml(formatMoney(v, { privacy, signed: true, compact: true }))}</span>`;
      } else if (!disabled && isFuture) {
        valHtml = '<span class="month-tile-val">Prognose</span>';
      }

      tiles.push(`
        <button type="button"
          class="month-tile ${mk === sel ? 'is-selected' : ''} ${mk === cur ? 'is-current' : ''} ${isFuture ? 'is-future' : ''}"
          data-pick-month="${mk}" ${disabled ? 'disabled' : ''}
          aria-label="${escapeHtml(formatMonthLong(mk))}">
          <span class="month-tile-name">${escapeHtml(formatMonthNameOnly(mk))}</span>
          ${valHtml}
        </button>
      `);
    }

    blocks.push(`
      <div class="month-year-block">
        <div class="month-year-head">
          <span class="month-year-title">${y}</span>
          ${monthsCounted > 0
            ? `<span class="month-year-sum money">Budget-Diff. <strong class="${diffSum >= 0 ? 'text-pos' : 'text-neg'}">${escapeHtml(formatMoney(diffSum, { privacy, signed: true, compact: true }))}</strong> · investiert <strong>${escapeHtml(formatMoney(investSum, { privacy, compact: true }))}</strong></span>`
            : ''}
        </div>
        <div class="month-grid">${tiles.join('')}</div>
      </div>
    `);
  }

  const quickTarget = compareMonthKeys(cur, min) < 0 ? min : cur;
  const quickLabel = compareMonthKeys(cur, min) < 0 ? 'Zum Startmonat' : 'Aktueller Monat';

  const bodyHtml = `
    <div class="field-hint">
      Die Zahl zeigt die <strong>Budget-Differenz</strong> des Monats – ein Plus ist in deine Töpfe gewandert.
      Monate vor deinem Tracking-Beginn (${escapeHtml(formatMonthLong(min))}) sind ausgeblendet.
    </div>
    ${blocks.join('')}
    <div class="field-row-2">
      <button type="button" class="btn btn-secondary btn-sm" id="mp-start">${icon('calendar', 14)} Beginn ändern</button>
      <button type="button" class="btn btn-primary btn-sm" data-pick-month="${quickTarget}">${icon('home', 14)} ${quickLabel}</button>
    </div>
  `;

  sheets.openRaw({
    title: 'Monat wählen',
    bodyHtml,
    onMount(panel, close) {
      panel.querySelectorAll('[data-pick-month]').forEach((btn) => {
        btn.addEventListener('click', () => {
          store.setUI({ selectedMonth: btn.getAttribute('data-pick-month') });
          close();
        });
      });
      panel.querySelector('#mp-start')?.addEventListener('click', () => {
        openStartMonthSheet(sheets, store, { onToast });
      });
      requestAnimationFrame(() => {
        panel.querySelector('.month-tile.is-selected')?.scrollIntoView({ block: 'center' });
      });
    },
  });
}

export function openStartMonthSheet(sheets, store, { onToast }) {
  const state = store.state;
  const cur = getCurrentMonthKey();
  const maxStart = shiftMonthKey(cur, FUTURE_PLANNING_MONTHS);

  let earliestTx = null;
  for (const tx of state.transactions || []) {
    if (!tx.date) continue;
    const mk = monthKeyFromDate(tx.date);
    if (!earliestTx || compareMonthKeys(mk, earliestTx) < 0) earliestTx = mk;
  }
  const latestAllowed = earliestTx && compareMonthKeys(earliestTx, maxStart) < 0 ? earliestTx : maxStart;

  const bodyHtml = `
    <div class="field-hint" style="font-size:var(--text-sm);">
      Ab diesem Monat trägst du deine Ausgaben ein. Für jeden Monat ab dann fließt dein Budget in die Kategoriekonten –
      Monate davor blendet cash-map komplett aus.
    </div>
    <div class="field">
      <label class="field-label" for="sm-input">Tracking-Beginn</label>
      <input id="sm-input" type="month" class="input" value="${escapeHtml(state.settings.startMonth || cur)}" max="${latestAllowed}" />
    </div>
    ${earliestTx ? `
      <div class="action-banner">
        <div class="action-banner-left">
          <div class="action-banner-icon">${icon('info', 17)}</div>
          <div>
            <div class="action-banner-title">Früheste Buchung: ${escapeHtml(formatMonthLong(earliestTx))}</div>
            <div class="action-banner-sub">Der Beginn kann nicht nach deiner ersten Buchung liegen.</div>
          </div>
        </div>
      </div>` : ''}
    <button type="button" class="btn btn-primary btn-block" id="sm-save">${icon('check', 16)} Beginn speichern</button>
  `;

  sheets.openRaw({
    title: 'Tracking-Beginn',
    bodyHtml,
    onMount(panel, close) {
      panel.querySelector('#sm-save').addEventListener('click', () => {
        const val = panel.querySelector('#sm-input').value;
        if (!/^\d{4}-\d{2}$/.test(val)) {
          onToast('Bitte wähle einen gültigen Monat.', 'warn');
          return;
        }
        if (compareMonthKeys(val, latestAllowed) > 0) {
          onToast(`Der Beginn darf spätestens ${formatMonthLong(latestAllowed)} sein.`, 'warn');
          return;
        }
        store.setStartMonth(val);
        close();
        onToast(`Tracking beginnt jetzt im ${formatMonthLong(val)}.`, 'info', { undo: true });
      });
    },
  });
}
