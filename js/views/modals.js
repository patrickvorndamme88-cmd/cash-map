// ==========================================================================
// cash-map — Native iOS Bottom Sheets (Quick-Entry Numpad, Detail, Editors)
// ==========================================================================

import { icon, CATEGORY_ICON_KEYS, CATEGORY_COLORS } from '../icons.js';
import {
  formatMoney,
  formatMonthLong,
  formatShortDate,
  defaultDateForMonth,
  parseGermanAmount,
  escapeHtml,
  roundCents,
  daysInMonth,
  shiftMonthKey,
  getCurrentMonthKey,
  compareMonthKeys,
} from '../format.js';
import { CATEGORY_GROUPS } from '../defaults.js';
import { computeCategoryHistory, getEffectiveBudget, getEffectiveSalary, isSalaryOverridden, getMonthBounds } from '../finance.js';
import { lockScroll, unlockScroll } from '../ui.js';
import { renderCategoryHistoryChart } from '../charts.js';
import { parseAndValidateBackup } from '../backup.js';

const DEFAULT_NOTE_HINTS = {
  cat_ernaehrung: ['Wocheneinkauf', 'Supermarkt', 'Drogerie', 'Bäcker'],
  cat_auto: ['Tanken', 'Waschanlage', 'Werkstatt', 'Parken'],
  cat_sauna: ['Therme', 'Abendtarif', 'Tageskarte'],
  cat_kleidung: ['Kleidung', 'Schuhe', 'Jacke'],
  cat_ruecklage_fix: ['Rundfunkbeitrag', 'KFZ-Versicherung', 'Haftpflicht'],
  cat_puffer: ['Geschenk', 'Apotheke', 'Ungeplant'],
};

function getQuickNoteChips(transactions, txType, categoryId) {
  if (txType === 'transfer') return ['Ausgleich', 'Ansparen', 'Umschichtung'];
  if (txType === 'income') return categoryId ? ['Erstattung', 'Retoure', 'Cashback'] : ['Bonus', 'Verkauf', 'Steuererstattung'];
  const counts = new Map();
  for (const t of transactions || []) {
    if (t.type === 'expense' && t.categoryId === categoryId && t.note && !t.note.endsWith('(Dauerauftrag)') && !t.note.endsWith('(Fixkosten)')) {
      const n = t.note.trim();
      if (n.length >= 2 && n.length <= 26) counts.set(n, (counts.get(n) || 0) + 1);
    }
  }
  const learned = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const fallbacks = DEFAULT_NOTE_HINTS[categoryId] || [];
  const merged = [];
  for (const item of [...learned, ...fallbacks]) {
    if (!merged.some((x) => x.toLowerCase() === item.toLowerCase())) merged.push(item);
    if (merged.length >= 4) break;
  }
  return merged;
}

export function createSheetManager(sheetRoot, store, { onToast }) {
  let cleanupFns = [];

  function close() {
    cleanupFns.forEach((fn) => {
      try { fn(); } catch {}
    });
    cleanupFns = [];
    unlockScroll('sheet');
    sheetRoot.classList.remove('is-open');
    sheetRoot.setAttribute('aria-hidden', 'true');
    setTimeout(() => {
      if (!sheetRoot.classList.contains('is-open')) {
        sheetRoot.innerHTML = '';
      }
    }, 280);
  }

  function openRaw({ title, headerRight = '', bodyHtml, onMount }) {
    cleanupFns.forEach((fn) => { try { fn(); } catch {} });
    cleanupFns = [];

    sheetRoot.innerHTML = `
      <div class="sheet-backdrop" data-sheet-close></div>
      <div class="sheet-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="sheet-handle-bar"><div class="sheet-handle"></div></div>
        <div class="sheet-header">
          <h3 class="sheet-title">${escapeHtml(title)}</h3>
          <div style="display:flex;align-items:center;gap:8px;">
            ${headerRight}
            <button class="sheet-close" data-sheet-close aria-label="Schließen">${icon('x', 17)}</button>
          </div>
        </div>
        <div class="sheet-body">${bodyHtml}</div>
      </div>
    `;

    // Lock page behind the sheet & trigger slide-in transition next frame
    lockScroll('sheet');
    requestAnimationFrame(() => {
      sheetRoot.classList.add('is-open');
      sheetRoot.setAttribute('aria-hidden', 'false');
    });

    // Swipe-down-to-dismiss on handle & header (native iOS sheet feel)
    const panelEl = sheetRoot.querySelector('.sheet-panel');
    let dragStartY = null;
    let dragDy = 0;
    let dragStartT = 0;
    const onDragStart = (e) => {
      if (e.target.closest('button, input, select, textarea, a')) return;
      dragStartY = e.touches[0].clientY;
      dragDy = 0;
      dragStartT = Date.now();
      panelEl.classList.add('is-dragging');
    };
    const onDragMove = (e) => {
      if (dragStartY === null) return;
      dragDy = Math.max(0, e.touches[0].clientY - dragStartY);
      panelEl.style.transform = `translateY(${dragDy}px)`;
      e.preventDefault();
    };
    const onDragEnd = () => {
      if (dragStartY === null) return;
      const velocity = dragDy / Math.max(1, Date.now() - dragStartT);
      dragStartY = null;
      panelEl.classList.remove('is-dragging');
      panelEl.style.transform = '';
      if (dragDy > 110 || (velocity > 0.55 && dragDy > 36)) close();
    };
    sheetRoot.querySelectorAll('.sheet-handle-bar, .sheet-header').forEach((el) => {
      el.addEventListener('touchstart', onDragStart, { passive: true });
      el.addEventListener('touchmove', onDragMove, { passive: false });
      el.addEventListener('touchend', onDragEnd);
      el.addEventListener('touchcancel', onDragEnd);
    });

    sheetRoot.querySelectorAll('[data-sheet-close]').forEach((el) => {
      el.addEventListener('click', close);
    });

    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    cleanupFns.push(() => window.removeEventListener('keydown', onKey));

    if (onMount) {
      const extraCleanup = onMount(sheetRoot.querySelector('.sheet-panel'), close);
      if (typeof extraCleanup === 'function') cleanupFns.push(extraCleanup);
    }
  }

  // ---- Safe Mini Math Evaluator for Numpad (+ and - expressions) ----
  function evalExpr(expr) {
    const cleaned = String(expr || '')
      .replace(/,/g, '.')
      .replace(/[^0-9.+\-]/g, '');
    if (!cleaned) return 0;
    const tokens = cleaned.match(/[+\-]?[0-9]*\.?[0-9]+/g);
    if (!tokens) return 0;
    const total = tokens.reduce((acc, tok) => acc + Number(tok), 0);
    return Number.isFinite(total) ? roundCents(Math.max(0, total)) : 0;
  }

  // ========================================================================
  // 1. Quick-Entry & Edit Transaction Sheet (with Custom iPhone Numpad!)
  // ========================================================================
  function openTransactionSheet({ snapshot, editTx = null, defaultType = 'expense', defaultCategoryId = null, defaultFromId = null, defaultToId = null, defaultAmount = null }) {
    const activeCats = snapshot.categories.map((s) => s.category);
    const statMap = new Map(snapshot.categories.map((s) => [s.category.id, s]));
    const privacy = store.state.settings.privacyMode;

    let txType = editTx ? editTx.type : defaultType;
    let expr = editTx
      ? String(editTx.amount).replace('.', ',')
      : defaultAmount
        ? String(roundCents(defaultAmount)).replace('.', ',')
        : '';
    let selectedCatId = editTx
      ? editTx.categoryId
      : (defaultCategoryId || activeCats[1]?.id || activeCats[0]?.id || null);
    let fromCatId = editTx?.fromCategoryId || defaultFromId || activeCats.find((c) => c.id === 'cat_puffer')?.id || activeCats[0]?.id || null;
    let toCatId = editTx?.toCategoryId || defaultToId || activeCats.find((c) => c.id !== fromCatId)?.id || activeCats[0]?.id || null;
    let txDate = editTx ? editTx.date : defaultDateForMonth(snapshot.monthKey);
    let txNote = editTx ? (editTx.note || '') : '';

    const isEdit = Boolean(editTx);
    const bounds = getMonthBounds(store.state);
    const dateMin = `${bounds.min}-01`;
    const dateMax = `${bounds.max}-${String(daysInMonth(bounds.max)).padStart(2, '0')}`;

    function renderInner(panel) {
      const amountVal = evalExpr(expr);
      const hasOperator = /[+\-]/.test(expr.slice(1));

      // Live pot preview pill!
      let previewText = 'Betrag eingeben';
      let previewColor = 'var(--text-secondary)';
      if (txType === 'expense' && selectedCatId && statMap.has(selectedCatId)) {
        const st = statMap.get(selectedCatId);
        const origContribution = isEdit && editTx.type === 'expense' && editTx.categoryId === selectedCatId ? editTx.amount : 0;
        const newPot = roundCents(st.potBalance + origContribution - amountVal);
        previewText = `${st.category.name}-Konto danach: ${formatMoney(newPot, { privacy, signed: true })}`;
        previewColor = newPot < 0 ? 'var(--negative)' : 'var(--positive)';
      } else if (txType === 'income') {
        if (selectedCatId && statMap.has(selectedCatId)) {
          const st = statMap.get(selectedCatId);
          const newPot = roundCents(st.potBalance + amountVal);
          previewText = `Gutschrift in ${st.category.name}: ${formatMoney(newPot, { privacy, signed: true })}`;
          previewColor = 'var(--positive)';
        } else {
          previewText = 'Erhöht deine gesamten Monatseinnahmen';
          previewColor = 'var(--positive)';
        }
      } else if (txType === 'transfer' && fromCatId && toCatId) {
        const fromSt = statMap.get(fromCatId);
        const toSt = statMap.get(toCatId);
        if (fromCatId === toCatId) {
          previewText = 'Bitte zwei unterschiedliche Töpfe wählen';
          previewColor = 'var(--warning)';
        } else if (fromSt && toSt) {
          previewText = `${fromSt.category.name}: ${formatMoney(fromSt.potBalance - amountVal, { privacy, compact: true })} → ${toSt.category.name}: ${formatMoney(toSt.potBalance + amountVal, { privacy, compact: true })}`;
          previewColor = 'var(--accent)';
        }
      }

      // Category selector area depending on txType
      let selectorHtml = '';
      if (txType === 'transfer') {
        const optsFrom = activeCats
          .map((c) => `<option value="${c.id}" ${c.id === fromCatId ? 'selected' : ''}>${escapeHtml(c.name)} (${formatMoney(statMap.get(c.id)?.potBalance || 0, { privacy, compact: true })})</option>`)
          .join('');
        const optsTo = activeCats
          .map((c) => `<option value="${c.id}" ${c.id === toCatId ? 'selected' : ''}>${escapeHtml(c.name)} (${formatMoney(statMap.get(c.id)?.potBalance || 0, { privacy, compact: true })})</option>`)
          .join('');
        selectorHtml = `
          <div class="field-row-2">
            <div class="field">
              <label class="field-label" for="tx-from-cat">Von Topf</label>
              <select id="tx-from-cat" class="select">${optsFrom}</select>
            </div>
            <div class="field">
              <label class="field-label" for="tx-to-cat">In Topf</label>
              <select id="tx-to-cat" class="select">${optsTo}</select>
            </div>
          </div>
        `;
      } else {
        const generalPick = txType === 'income'
          ? `
            <button type="button" class="cat-pick-item ${selectedCatId === null ? 'is-selected' : ''}" style="--cat-color:var(--positive);" data-pick-cat="__general__">
              <div class="cat-pick-icon">${icon('sparkles', 17)}</div>
              <span class="cat-pick-name">Allgemein</span>
            </button>
          `
          : '';
        const catItems = activeCats
          .map((c) => `
            <button type="button" class="cat-pick-item ${selectedCatId === c.id ? 'is-selected' : ''}" style="--cat-color:${c.color};" data-pick-cat="${c.id}">
              <div class="cat-pick-icon">${icon(c.icon, 17)}</div>
              <span class="cat-pick-name">${escapeHtml(c.name)}</span>
            </button>
          `)
          .join('');
        selectorHtml = `
          <div>
            <div class="field-label" style="margin-bottom:6px;">
              <span>${txType === 'income' ? 'Einnahme zuordnen (optional Topf-Gutschrift)' : 'Kategorie wählen'}</span>
            </div>
            <div class="cat-picker-scroll">${generalPick}${catItems}</div>
          </div>
        `;
      }

      const displayAmountStr = expr
        ? `${hasOperator ? `${formatMoney(amountVal)}` : `${expr} €`}`
        : '0,00 €';

      const body = panel.querySelector('.sheet-body');
      body.innerHTML = `
        <div class="segmented" role="tablist">
          <button type="button" class="segmented-btn ${txType === 'expense' ? 'is-active' : ''}" data-set-type="expense">Ausgabe</button>
          <button type="button" class="segmented-btn ${txType === 'income' ? 'is-active' : ''}" data-set-type="income">Einnahme</button>
          <button type="button" class="segmented-btn ${txType === 'transfer' ? 'is-active' : ''}" data-set-type="transfer">Umbuchung</button>
        </div>

        <div class="amount-display">
          <div class="amount-expr money">${hasOperator ? escapeHtml(expr) : '&nbsp;'}</div>
          <div class="amount-big money is-${txType}">${escapeHtml(displayAmountStr)}</div>
          <div class="amount-preview-pill money" style="color:${previewColor};">${escapeHtml(previewText)}</div>
        </div>

        ${selectorHtml}

        <div class="field-row-2">
          <div class="field">
            <label class="field-label" for="tx-date-input">Datum</label>
            <input id="tx-date-input" type="date" class="input" min="${dateMin}" max="${dateMax}" style="padding:10px 11px;" value="${escapeHtml(txDate)}" />
          </div>
          <div class="field">
            <label class="field-label" for="tx-note-input">Notiz</label>
            <input id="tx-note-input" type="text" class="input" style="padding:10px 11px;" placeholder="${txType === 'transfer' ? 'z. B. Werkstatt ausgleichen' : 'z. B. REWE, Tanken…'}" value="${escapeHtml(txNote)}" />
          </div>
        </div>
        ${(() => {
          const chips = getQuickNoteChips(store.state.transactions, txType, selectedCatId);
          if (chips.length === 0) return '';
          return `<div class="quick-note-row" aria-label="Schnell-Notizen">${chips
            .map((c) => `<button type="button" class="quick-note-chip ${txNote === c ? 'is-active' : ''}" data-note-chip="${escapeHtml(c)}">${escapeHtml(c)}</button>`)
            .join('')}</div>`;
        })()}

        <!-- Custom iPhone Numpad -->
        <div class="numpad-grid" aria-label="Ziffernblock">
          <button type="button" class="num-key" data-num="7">7</button>
          <button type="button" class="num-key" data-num="8">8</button>
          <button type="button" class="num-key" data-num="9">9</button>
          <button type="button" class="num-key is-op" data-num="back" aria-label="Löschen">${icon('backspace', 20)}</button>

          <button type="button" class="num-key" data-num="4">4</button>
          <button type="button" class="num-key" data-num="5">5</button>
          <button type="button" class="num-key" data-num="6">6</button>
          <button type="button" class="num-key is-op" data-num="+">+</button>

          <button type="button" class="num-key" data-num="1">1</button>
          <button type="button" class="num-key" data-num="2">2</button>
          <button type="button" class="num-key" data-num="3">3</button>
          <button type="button" class="num-key is-submit" data-num="submit">${isEdit ? 'Sichern' : 'Buchen'}</button>

          <button type="button" class="num-key" data-num="C" style="font-size:var(--text-sm);color:var(--text-secondary);">C</button>
          <button type="button" class="num-key" data-num="0">0</button>
          <button type="button" class="num-key" data-num=",">,</button>
        </div>
      `;

      // Bind handlers
      body.querySelectorAll('[data-set-type]').forEach((btn) => {
        btn.addEventListener('click', () => {
          txType = btn.getAttribute('data-set-type');
          if (txType === 'income' && !isEdit) selectedCatId = null;
          if (txType === 'expense' && !selectedCatId) selectedCatId = activeCats[0]?.id || null;
          renderInner(panel);
        });
      });

      body.querySelectorAll('[data-pick-cat]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const val = btn.getAttribute('data-pick-cat');
          selectedCatId = val === '__general__' ? null : val;
          renderInner(panel);
        });
      });

      body.querySelector('#tx-from-cat')?.addEventListener('change', (e) => {
        fromCatId = e.target.value;
        renderInner(panel);
      });

      body.querySelector('#tx-to-cat')?.addEventListener('change', (e) => {
        toCatId = e.target.value;
        renderInner(panel);
      });

      body.querySelector('#tx-date-input')?.addEventListener('change', (e) => {
        txDate = e.target.value;
      });

      body.querySelector('#tx-note-input')?.addEventListener('input', (e) => {
        txNote = e.target.value;
      });

      body.querySelectorAll('[data-note-chip]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const val = btn.getAttribute('data-note-chip');
          txNote = txNote === val ? '' : val;
          renderInner(panel);
        });
      });

      const handleKeyInput = (k) => {
        if (k === 'submit') {
          submit();
          return;
        }
        if (k === 'C') {
          expr = '';
        } else if (k === 'back') {
          expr = expr.slice(0, -1);
        } else if (k === '+') {
          if (expr && !/[+\-,]$/.test(expr)) expr += '+';
        } else if (k === ',') {
          const lastSegment = expr.split(/[+\-]/).pop() || '';
          if (!lastSegment.includes(',')) {
            expr += lastSegment.length === 0 ? '0,' : ',';
          }
        } else {
          // Digit
          const lastSegment = expr.split(/[+\-]/).pop() || '';
          const decPart = lastSegment.split(',')[1];
          if (decPart !== undefined && decPart.length >= 2) return; // max 2 decimals
          if (expr.length >= 16) return;
          expr += k;
        }
        renderInner(panel);
      };

      body.querySelectorAll('[data-num]').forEach((btn) => {
        btn.addEventListener('click', () => handleKeyInput(btn.getAttribute('data-num')));
      });
    }

    function submit() {
      const finalAmount = evalExpr(expr);
      if (finalAmount <= 0) {
        onToast('Bitte gib einen Betrag größer als 0 € ein.', 'warn');
        return;
      }
      if (txType === 'expense' && !selectedCatId) {
        onToast('Bitte wähle eine Kategorie aus.', 'warn');
        return;
      }
      if (txType === 'transfer' && (!fromCatId || !toCatId || fromCatId === toCatId)) {
        onToast('Bitte wähle zwei verschiedene Töpfe zum Umbuchen.', 'warn');
        return;
      }
      if (txDate && txDate < dateMin) {
        onToast(`Das Datum liegt vor deinem Tracking-Beginn (${formatMonthLong(bounds.min)}).`, 'warn');
        return;
      }
      if (txDate && txDate > dateMax) {
        onToast('Das Datum liegt zu weit in der Zukunft.', 'warn');
        return;
      }

      const payload = {
        type: txType,
        date: txDate || defaultDateForMonth(snapshot.monthKey),
        amount: finalAmount,
        categoryId: txType === 'transfer' ? null : selectedCatId,
        fromCategoryId: txType === 'transfer' ? fromCatId : null,
        toCategoryId: txType === 'transfer' ? toCatId : null,
        note: txNote,
      };

      if (isEdit) {
        store.updateTransaction(editTx.id, payload);
        close();
        onToast('Buchung aktualisiert.', 'info', { undo: true });
      } else {
        store.addTransaction(payload);
        close();
        const label = txType === 'transfer' ? 'Umbuchung gespeichert' : txType === 'income' ? 'Einnahme gespeichert' : 'Ausgabe eingetragen';
        onToast(`${label} (${formatMoney(finalAmount)}).`, 'info', { undo: true });
      }
    }

    const headerRight = isEdit
      ? `<button class="btn btn-danger btn-sm" id="btn-delete-tx">${icon('trash', 14)} Löschen</button>`
      : '';

    openRaw({
      title: isEdit ? 'Buchung bearbeiten' : 'Neue Buchung',
      headerRight,
      bodyHtml: '',
      onMount(panel) {
        renderInner(panel);

        panel.querySelector('#btn-delete-tx')?.addEventListener('click', () => {
          store.deleteTransaction(editTx.id);
          close();
          onToast('Buchung gelöscht.', 'warn', { undo: true });
        });

        // Allow desktop keyboard typing seamlessly when not focused on note/date inputs
        const onKeyDown = (e) => {
          const tag = document.activeElement?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
            return;
          }
          if (/^[0-9]$/.test(e.key)) {
            e.preventDefault();
            const seg = expr.split(/[+\-]/).pop() || '';
            const dec = seg.split(',')[1];
            if (dec !== undefined && dec.length >= 2) return;
            if (expr.length >= 16) return;
            expr += e.key;
            renderInner(panel);
          } else if (e.key === ',' || e.key === '.') {
            e.preventDefault();
            const seg = expr.split(/[+\-]/).pop() || '';
            if (!seg.includes(',')) expr += seg.length === 0 ? '0,' : ',';
            renderInner(panel);
          } else if (e.key === '+') {
            e.preventDefault();
            if (expr && !/[+\-,]$/.test(expr)) expr += '+';
            renderInner(panel);
          } else if (e.key === 'Backspace') {
            e.preventDefault();
            expr = expr.slice(0, -1);
            renderInner(panel);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
      },
    });
  }

  // ========================================================================
  // 2. Category Detail & Pot History Sheet
  // ========================================================================
  function openCategoryDetailSheet({ snapshot, categoryId }) {
    const stat = snapshot.categories.find((c) => c.category.id === categoryId);
    if (!stat) return;
    const cat = stat.category;
    const privacy = store.state.settings.privacyMode;
    const history = computeCategoryHistory(store.state, categoryId, snapshot.monthKey, 6);
    const avgSpent = roundCents(history.reduce((s, h) => s + h.netSpent, 0) / history.length);

    const catTxs = snapshot.transactions.filter(
      (t) => t.categoryId === categoryId || t.fromCategoryId === categoryId || t.toCategoryId === categoryId
    );

    const pufferCat = snapshot.categories.find(
      (c) => c.category.id !== categoryId && (c.category.id === 'cat_puffer' || c.category.name.toLowerCase().includes('puffer'))
    );
    const canRescueFromPuffer = stat.potBalance < -0.01 && pufferCat && pufferCat.potBalance > 0;

    // Dauerauftrag status (booked / open → 1-tap book)
    const isFutureMonth = compareMonthKeys(snapshot.monthKey, getCurrentMonthKey()) > 0;
    let recurringBlock = '';
    if (stat.isRecurring) {
      if (stat.isBooked) {
        recurringBlock = `
          <div class="action-banner is-pos">
            <div class="action-banner-left">
              <div class="action-banner-icon" style="background:var(--positive-soft);color:var(--positive);">${icon('check', 18)}</div>
              <div>
                <div class="action-banner-title">Dauerauftrag gebucht</div>
                <div class="action-banner-sub">${escapeHtml(formatMoney(stat.actualSpent, { privacy }))} im ${escapeHtml(formatMonthLong(snapshot.monthKey))} · Buchungstag ${stat.bookingDay}.</div>
              </div>
            </div>
          </div>`;
      } else if (!isFutureMonth) {
        recurringBlock = `
          <div class="action-banner">
            <div class="action-banner-left">
              <div class="action-banner-icon">${icon('repeat', 18)}</div>
              <div>
                <div class="action-banner-title">Dauerauftrag offen</div>
                <div class="action-banner-sub">Fällig am ${stat.bookingDay}. · ${escapeHtml(formatMoney(stat.budget, { privacy }))}</div>
              </div>
            </div>
            <button class="btn btn-primary btn-sm" id="btn-book-single">Jetzt buchen</button>
          </div>`;
      }
    }

    // Savings goal forecast
    let goalBlock = '';
    if (cat.goalAmount && cat.goalAmount > 0) {
      const goal = cat.goalAmount;
      const pct = Math.max(0, Math.min(100, (stat.potBalance / goal) * 100));
      const avgDiff = roundCents(history.reduce((s, h) => s + h.monthDiff + 0, 0) / Math.max(1, history.length));
      let forecast;
      if (stat.potBalance >= goal) {
        forecast = 'Sparziel erreicht – stark!';
      } else if (avgDiff > 0) {
        const monthsNeeded = Math.ceil((goal - stat.potBalance) / avgDiff);
        forecast = monthsNeeded <= 120
          ? `Bei Ø ${formatMoney(avgDiff, { privacy, signed: true, compact: true })} pro Monat erreichst du es voraussichtlich im ${formatMonthLong(shiftMonthKey(snapshot.monthKey, monthsNeeded))}.`
          : 'Bei deinem aktuellen Tempo dauert es noch über 10 Jahre.';
      } else {
        forecast = 'Aktuell wächst dieser Topf nicht – erhöhe das Budget oder gib etwas weniger aus.';
      }
      goalBlock = `
        <div class="breakdown-box">
          <div class="breakdown-row">
            <span style="display:flex;align-items:center;gap:6px;font-weight:650;color:var(--text-primary);">${icon('target', 15)} Sparziel ${escapeHtml(formatMoney(goal, { privacy, compact: true }))}</span>
            <span class="money" style="font-weight:750;color:var(--text-primary);">${Math.round(pct)} %</span>
          </div>
          <div class="goal-track"><div class="goal-fill" style="width:${pct.toFixed(1)}%;background:${cat.color};"></div></div>
          <div class="field-hint">${escapeHtml(forecast)}</div>
        </div>`;
    }

    const txRows = catTxs.length > 0
      ? `<div class="tx-list">${catTxs
          .map((tx) => {
            const isTransfer = tx.type === 'transfer';
            const isIn = isTransfer ? tx.toCategoryId === categoryId : tx.type === 'income';
            const sign = isIn ? '+' : '−';
            const amtClass = isIn ? 'text-pos' : '';
            const label = tx.note || (isTransfer ? (isIn ? 'Umbuchung Eingang' : 'Umbuchung Ausgang') : tx.type === 'income' ? 'Gutschrift' : cat.name);
            return `
              <button class="tx-row" data-detail-edit-tx="${tx.id}">
                <div class="tx-main">
                  <div class="tx-title">${escapeHtml(label)}</div>
                  <div class="tx-meta">${escapeHtml(formatShortDate(tx.date))}</div>
                </div>
                <div class="tx-amount money ${amtClass}">${sign}${escapeHtml(formatMoney(tx.amount, { privacy }))}</div>
              </button>
            `;
          })
          .join('')}</div>`
      : `<div style="font-size:var(--text-xs);color:var(--text-tertiary);text-align:center;padding:12px;">Noch keine Buchungen im ${escapeHtml(formatMonthLong(snapshot.monthKey))}.</div>`;

    const otherActiveCats = snapshot.categories
      .map((s) => s.category)
      .filter((c) => c.id !== cat.id);

    const currentRuleVal = stat.surplusTarget
      ? stat.surplusTarget.id
      : cat.rollover
        ? '__self__'
        : '__none__';

    const surplusRuleOptions = [
      `<option value="__self__" ${currentRuleVal === '__self__' ? 'selected' : ''}>Im eigenen Topf ansparen</option>`,
      ...otherActiveCats.map(
        (c) => `<option value="${c.id}" ${currentRuleVal === c.id ? 'selected' : ''}>Überschuss → ${escapeHtml(c.name)}</option>`
      ),
      `<option value="__none__" ${currentRuleVal === '__none__' ? 'selected' : ''}>Verfallen lassen (ohne Übertrag)</option>`,
    ].join('');

    const surplusQuickRow = !stat.isRecurring
      ? `
        <div class="field" style="gap:5px;">
          <label class="field-label" for="detail-surplus-select">
            <span>${icon('cornerDownRight', 12, 'inline-icon')} Was passiert am Monatsende mit Überschuss?</span>
          </label>
          <select id="detail-surplus-select" class="select" style="padding:9px 12px;">${surplusRuleOptions}</select>
        </div>
      `
      : '';

    const carryRowsHtml = (() => {
      if (stat.sweptIn > 0.005) {
        const srcRows = stat.sweptInSources
          .map(
            (src) => `
              <div class="breakdown-row">
                <span>+ Überschuss Vormonat (${escapeHtml(src.name)})</span>
                <span class="money text-pos">+${escapeHtml(formatMoney(src.amount, { privacy }))}</span>
              </div>`
          )
          .join('');
        return `
          <div class="breakdown-row">
            <span>Übertrag eigener Topf</span>
            <span class="money">${escapeHtml(formatMoney(stat.ownCarryIn, { privacy, signed: true }))}</span>
          </div>
          ${srcRows}
        `;
      }
      if (stat.surplusTarget) {
        return Math.abs(stat.carryIn) >= 0.01
          ? `<div class="breakdown-row"><span>Vormonat-Saldo</span><span class="money">${escapeHtml(formatMoney(stat.carryIn, { privacy, signed: true }))}</span></div>`
          : '';
      }
      if (cat.rollover) {
        return `
          <div class="breakdown-row">
            <span>Übertrag aus Vormonat</span>
            <span class="money">${escapeHtml(formatMoney(stat.carryIn, { privacy, signed: true }))}</span>
          </div>
        `;
      }
      return '';
    })();

    const bodyHtml = `
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="cat-icon" style="--cat-color:${cat.color};width:48px;height:48px;border-radius:15px;">${icon(cat.icon, 24)}</div>
        <div style="min-width:0;flex:1;">
          <div style="font-size:var(--text-lg);font-weight:750;letter-spacing:-0.02em;">${escapeHtml(cat.name)}</div>
          <div style="font-size:var(--text-xs);color:var(--text-secondary);">${escapeHtml(
            cat.note ||
              (stat.surplusTarget
                ? `Überschuss wandert am Monatsende in ${stat.surplusTarget.name}`
                : cat.rollover
                  ? 'Wachsendes Kategoriekonto aktiv'
                  : 'Monatliches Budget ohne Übertrag')
          )}</div>
        </div>
      </div>

      <div class="kpi-pair">
        <div class="kpi-tile">
          <div class="kpi-tile-label">${stat.surplusTarget ? 'Rest im Monat' : cat.rollover ? 'Kategoriekonto gesamt' : 'Rest im Monat'}</div>
          <div class="kpi-tile-val money ${stat.potBalance >= 0 ? 'text-pos' : 'text-neg'}">${escapeHtml(formatMoney(stat.potBalance, { privacy, signed: true }))}</div>
        </div>
        <div class="kpi-tile">
          <div class="kpi-tile-label">Monatsdifferenz</div>
          <div class="kpi-tile-val money ${stat.monthDiff >= 0 ? 'text-pos' : 'text-neg'}">${escapeHtml(formatMoney(stat.monthDiff, { privacy, signed: true }))}</div>
        </div>
      </div>

      ${recurringBlock}
      ${surplusQuickRow}
      ${goalBlock}

      ${canRescueFromPuffer ? `
        <button class="btn btn-primary btn-block" id="btn-rescue-puffer">
          ${icon('transfer', 16)} ${escapeHtml(formatMoney(Math.abs(stat.potBalance), { privacy }))} aus „${escapeHtml(pufferCat.category.name)}“ ausgleichen
        </button>
      ` : ''}

      <!-- Transparent Rollover Math Breakdown -->
      <div class="breakdown-box">
        <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-tertiary);margin-bottom:2px;">
          Konto-Aufschlüsselung (${escapeHtml(formatMonthLong(snapshot.monthKey))})
        </div>
        ${carryRowsHtml}
        <div class="breakdown-row">
          <span>+ Monatsbudget</span>
          <span class="money text-pos">${escapeHtml(formatMoney(stat.budget, { privacy, signed: true }))}</span>
        </div>
        <div class="breakdown-row">
          <span>${stat.isProjected ? '− Eingeplant (Prognose)' : '− Ausgaben'}</span>
          <span class="money">${stat.spent > 0 ? '−' : ''}${escapeHtml(formatMoney(stat.spent, { privacy }))}</span>
        </div>
        ${stat.catIncome > 0 ? `
          <div class="breakdown-row">
            <span>+ Gutschriften / Erstattungen</span>
            <span class="money text-pos">+${escapeHtml(formatMoney(stat.catIncome, { privacy }))}</span>
          </div>
        ` : ''}
        ${Math.abs(stat.netTransfers) >= 0.01 ? `
          <div class="breakdown-row">
            <span>± Umbuchungen</span>
            <span class="money text-accent">${escapeHtml(formatMoney(stat.netTransfers, { privacy, signed: true }))}</span>
          </div>
        ` : ''}
        <div class="breakdown-row is-total">
          <span>= ${stat.surplusTarget ? 'Rest Ende Monat' : 'Kontostand Ende Monat'}</span>
          <span class="money ${stat.potBalance >= 0 ? 'text-pos' : 'text-neg'}">${escapeHtml(formatMoney(stat.potBalance, { privacy, signed: true }))}</span>
        </div>
        ${stat.surplusTarget && stat.potBalance > 0.005 ? `
          <div class="field-hint" style="padding-top:4px;border-top:1px dashed var(--border-subtle);color:var(--positive);">
            ${icon('cornerDownRight', 12, 'inline-icon')} <strong>${escapeHtml(formatMoney(stat.potBalance, { privacy }))}</strong> wandern am Monatsende automatisch in <strong>„${escapeHtml(stat.surplusTarget.name)}“</strong>.
          </div>
        ` : ''}
      </div>

      <!-- Quick Action Buttons -->
      <div class="field-row-2">
        <button class="btn btn-primary btn-sm" id="btn-detail-add-exp">${icon('plus', 15)} Ausgabe</button>
        <button class="btn btn-secondary btn-sm" id="btn-detail-transfer">${icon('transfer', 15)} Umbuchen</button>
      </div>

      <!-- 6-Month Chart -->
      <div class="card card-compact" style="display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:var(--text-xs);font-weight:700;color:var(--text-secondary);">6-Monats-Verlauf (Budget vs. Ausgabe)</span>
          <span style="font-size:var(--text-xs);color:var(--text-tertiary);">Ø <strong class="money" style="color:var(--text-primary);">${escapeHtml(formatMoney(avgSpent, { privacy, compact: true }))}</strong></span>
        </div>
        ${renderCategoryHistoryChart(history, cat.color, { privacy })}
      </div>

      <!-- Transactions in this Category -->
      <div>
        <div class="field-label" style="margin-bottom:8px;">Buchungen in diesem Monat (${catTxs.length})</div>
        ${txRows}
      </div>
    `;

    openRaw({
      title: 'Kategoriekonto',
      headerRight: `<button class="btn btn-secondary btn-sm" id="btn-detail-edit-cat">${icon('edit', 14)} Bearbeiten</button>`,
      bodyHtml,
      onMount(panel) {
        panel.querySelector('#detail-surplus-select')?.addEventListener('change', (e) => {
          const v = e.target.value;
          if (v === '__self__') {
            store.setCategorySurplusRule(cat.id, { rollover: true, surplusTargetId: null });
            onToast(`${cat.name}: spart jetzt im eigenen Topf.`, 'info', { undo: true });
          } else if (v === '__none__') {
            store.setCategorySurplusRule(cat.id, { rollover: false, surplusTargetId: null });
            onToast(`${cat.name}: ohne Übertrag.`, 'info', { undo: true });
          } else {
            const tCat = otherActiveCats.find((c) => c.id === v);
            store.setCategorySurplusRule(cat.id, { rollover: true, surplusTargetId: v });
            onToast(`${cat.name}: Überschuss wandert in „${tCat?.name || 'Ziel-Topf'}“.`, 'info', { undo: true });
          }
          // Refresh detail sheet with updated snapshot!
          import('../finance.js').then(({ computeMonthSnapshot }) => {
            const freshSnap = computeMonthSnapshot(store.state, snapshot.monthKey);
            openCategoryDetailSheet({ snapshot: freshSnap, categoryId: cat.id });
          });
        });
        panel.querySelector('#btn-detail-edit-cat')?.addEventListener('click', () => {
          openCategoryEditSheet({ category: cat, monthKey: snapshot.monthKey });
        });
        panel.querySelector('#btn-detail-add-exp')?.addEventListener('click', () => {
          openTransactionSheet({ snapshot, defaultType: 'expense', defaultCategoryId: cat.id });
        });
        panel.querySelector('#btn-detail-transfer')?.addEventListener('click', () => {
          if (stat.potBalance > 0.005) {
            openTransactionSheet({ snapshot, defaultType: 'transfer', defaultFromId: cat.id, defaultToId: stat.surplusTarget?.id || null });
          } else {
            openTransactionSheet({ snapshot, defaultType: 'transfer', defaultToId: cat.id });
          }
        });
        panel.querySelector('#btn-book-single')?.addEventListener('click', () => {
          store.bookRecurring([stat], snapshot.monthKey);
          close();
          onToast(`${cat.name} gebucht (${formatMoney(stat.budget)}).`, 'info', { undo: true });
        });
        panel.querySelector('#btn-rescue-puffer')?.addEventListener('click', () => {
          const amt = roundCents(Math.abs(stat.potBalance));
          store.addTransaction({
            type: 'transfer',
            date: defaultDateForMonth(snapshot.monthKey),
            amount: amt,
            fromCategoryId: pufferCat.category.id,
            toCategoryId: cat.id,
            note: `Ausgleich aus ${pufferCat.category.name}`,
          });
          close();
          onToast(`${formatMoney(amt)} aus ${pufferCat.category.name} umgebucht!`, 'info', { undo: true });
        });
        panel.querySelectorAll('[data-detail-edit-tx]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const txId = btn.getAttribute('data-detail-edit-tx');
            const tx = store.state.transactions.find((t) => t.id === txId);
            if (tx) openTransactionSheet({ snapshot, editTx: tx });
          });
        });
      },
    });
  }

  // ========================================================================
  // 3. Create / Edit Category Sheet
  // ========================================================================
  function openCategoryEditSheet({ category = null, monthKey }) {
    const isEdit = Boolean(category);
    let name = category ? category.name : '';
    let group = category ? category.group : 'daily';
    let budget = category ? getEffectiveBudget(category, monthKey) : 50;
    let initialBalance = category ? (category.initialBalance || 0) : 0;
    let goalAmount = category && category.goalAmount ? category.goalAmount : '';
    let isFixed = category ? Boolean(category.isFixed) : false;
    const bookingDay = category?.bookingDay || 1;
    const groupHint = (gid) => (CATEGORY_GROUPS.find((g) => g.id === gid) || CATEGORY_GROUPS[1]).hint;
    const dayOptions = Array.from({ length: 28 }, (_, i) => i + 1)
      .map((d) => `<option value="${d}" ${d === bookingDay ? 'selected' : ''}>am ${d}. des Monats</option>`)
      .join('');
    let rollover = category ? category.rollover !== false : true;
    let surplusTargetId = category?.surplusTargetId || null;
    let surplusMode = surplusTargetId ? 'forward' : rollover ? 'self' : 'none';
    const targetCandidates = store.state.categories
      .filter((c) => !c.archived && c.id !== category?.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const defaultTargetId = surplusTargetId
      || targetCandidates.find((c) => c.id === 'cat_puffer')?.id
      || targetCandidates[0]?.id
      || '';
    const targetCatOpts = targetCandidates
      .map((c) => `<option value="${c.id}" ${c.id === defaultTargetId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`)
      .join('');
    let selectedColor = category ? category.color : CATEGORY_COLORS[0];
    let selectedIcon = category ? category.icon : 'wallet';
    let note = category ? (category.note || '') : '';
    let budgetScope = 'from_month';

    const groupOpts = CATEGORY_GROUPS.map(
      (g) => `<option value="${g.id}" ${g.id === group ? 'selected' : ''}>${escapeHtml(g.label)}</option>`
    ).join('');

    const swatches = CATEGORY_COLORS.map(
      (c) => `<button type="button" class="swatch-btn ${c === selectedColor ? 'is-selected' : ''}" style="background:${c};" data-pick-color="${c}" aria-label="Farbe ${c}"></button>`
    ).join('');

    const iconsHtml = CATEGORY_ICON_KEYS.map(
      (k) => `<button type="button" class="icon-pick-btn ${k === selectedIcon ? 'is-selected' : ''}" data-pick-icon="${k}" aria-label="Icon ${k}">${icon(k, 18)}</button>`
    ).join('');

    const bodyHtml = `
      <form id="cat-edit-form" style="display:flex;flex-direction:column;gap:14px;">
        <div class="field">
          <label class="field-label" for="ce-name">Name der Kategorie</label>
          <input id="ce-name" type="text" class="input" required maxlength="50" placeholder="z. B. Urlaub, Hobby, Geschenke…" value="${escapeHtml(name)}" />
        </div>

        <div class="field-row-2">
          <div class="field">
            <label class="field-label" for="ce-budget">Monatsbudget</label>
            <div class="input-money-wrap">
              <input id="ce-budget" type="text" inputmode="decimal" class="input" value="${budget.toFixed(2).replace('.', ',')}" />
              <span class="input-money-suffix">€</span>
            </div>
          </div>
          <div class="field">
            <label class="field-label" for="ce-group">Gruppe</label>
            <select id="ce-group" class="select">${groupOpts}</select>
          </div>
        </div>
        <div class="field-hint" id="ce-group-hint">${escapeHtml(groupHint(group))}</div>

        ${isEdit ? `
          <div class="field">
            <label class="field-label">Budget-Änderung anwenden</label>
            <div class="segmented">
              <button type="button" class="segmented-btn is-active" data-budget-scope="from_month">Ab ${escapeHtml(formatMonthLong(monthKey))}</button>
              <button type="button" class="segmented-btn" data-budget-scope="all_months">Alle Monate</button>
            </div>
          </div>
        ` : ''}

        <div class="field-row-2">
          <div class="field">
            <label class="field-label" for="ce-initial">Startguthaben</label>
            <div class="input-money-wrap">
              <input id="ce-initial" type="text" inputmode="decimal" class="input" value="${initialBalance.toFixed(2).replace('.', ',')}" />
              <span class="input-money-suffix">€</span>
            </div>
          </div>
          <div class="field">
            <label class="field-label" for="ce-goal">Sparziel (optional)</label>
            <div class="input-money-wrap">
              <input id="ce-goal" type="text" inputmode="decimal" class="input" placeholder="z. B. 1000" value="${goalAmount ? Number(goalAmount).toFixed(2).replace('.', ',') : ''}" />
              <span class="input-money-suffix">€</span>
            </div>
          </div>
        </div>

        <div class="field">
          <label class="field-label">Was passiert am Monatsende mit Überschuss?</label>
          <div class="segmented">
            <button type="button" class="segmented-btn ${surplusMode === 'self' ? 'is-active' : ''}" data-surplus-mode="self">Im Topf sparen</button>
            <button type="button" class="segmented-btn ${surplusMode === 'forward' ? 'is-active' : ''}" data-surplus-mode="forward">Weiterleiten</button>
            <button type="button" class="segmented-btn ${surplusMode === 'none' ? 'is-active' : ''}" data-surplus-mode="none">Verfällt</button>
          </div>
          <div class="field-hint" id="ce-surplus-hint">${
            surplusMode === 'forward'
              ? 'Neuer Monat startet frisch beim Budget – Ungenutztes fließt automatisch in deinen Ziel-Topf.'
              : surplusMode === 'self'
                ? 'Ideal für jährliche Kosten (z. B. Versicherungen) & Rücklagen – Guthaben bleibt in dieser Kategorie.'
                : 'Startet jeden Monat wieder bei 0 € ohne Übertrag.'
          }</div>
        </div>

        <div class="field" id="ce-target-field" style="${surplusMode === 'forward' ? '' : 'display:none;'}">
          <label class="field-label" for="ce-surplus-target">Ziel-Topf für Überschüsse</label>
          <select id="ce-surplus-target" class="select">${targetCatOpts}</select>
        </div>

        <div class="toggle-row">
          <div class="toggle-text">
            <div class="toggle-title">Dauerauftrag</div>
            <div class="toggle-desc">Fester Betrag jeden Monat (z. B. Miete, Abo, Sparplan) – mit einem Tipp gebucht</div>
          </div>
          <label class="ios-switch">
            <input type="checkbox" id="ce-fixed" ${isFixed ? 'checked' : ''} />
            <span class="ios-switch-track"></span>
          </label>
        </div>

        <div class="field" id="ce-day-field" style="${isFixed ? '' : 'display:none;'}">
          <label class="field-label" for="ce-day">Buchungstag</label>
          <select id="ce-day" class="select">${dayOptions}</select>
        </div>

        <div class="field">
          <label class="field-label" for="ce-note">Beschreibung / Notiz</label>
          <input id="ce-note" type="text" class="input" placeholder="Wofür ist dieser Topf gedacht?" value="${escapeHtml(note)}" />
        </div>

        <div class="field">
          <label class="field-label">Farbe</label>
          <div class="swatch-grid">${swatches}</div>
        </div>

        <div class="field">
          <label class="field-label">Symbol</label>
          <div class="icon-grid">${iconsHtml}</div>
        </div>

        ${isEdit ? `
          <div class="field-row-2">
            <button type="button" class="btn btn-secondary btn-sm" id="ce-move-up">${icon('chevronUp', 15)} Nach oben</button>
            <button type="button" class="btn btn-secondary btn-sm" id="ce-move-down">${icon('chevronDown', 15)} Nach unten</button>
          </div>
        ` : ''}

        <button type="submit" class="btn btn-primary btn-block">${icon('check', 17)} ${isEdit ? 'Änderungen speichern' : 'Kategorie anlegen'}</button>
        ${isEdit ? `<button type="button" class="btn btn-danger btn-block" id="ce-archive">${icon('trash', 15)} Kategorie entfernen</button>` : ''}
      </form>
    `;

    openRaw({
      title: isEdit ? 'Kategorie bearbeiten' : 'Neue Kategorie',
      bodyHtml,
      onMount(panel) {
        panel.querySelectorAll('[data-surplus-mode]').forEach((btn) => {
          btn.addEventListener('click', () => {
            surplusMode = btn.getAttribute('data-surplus-mode');
            panel.querySelectorAll('[data-surplus-mode]').forEach((b) => b.classList.toggle('is-active', b === btn));
            const tf = panel.querySelector('#ce-target-field');
            if (tf) tf.style.display = surplusMode === 'forward' ? '' : 'none';
            const sh = panel.querySelector('#ce-surplus-hint');
            if (sh) {
              sh.textContent = surplusMode === 'forward'
                ? 'Neuer Monat startet frisch beim Budget – Ungenutztes fließt automatisch in deinen Ziel-Topf.'
                : surplusMode === 'self'
                  ? 'Ideal für jährliche Kosten (z. B. Versicherungen) & Rücklagen – Guthaben bleibt in dieser Kategorie.'
                  : 'Startet jeden Monat wieder bei 0 € ohne Übertrag.';
            }
          });
        });
        panel.querySelector('#ce-fixed')?.addEventListener('change', (e) => {
          const dayField = panel.querySelector('#ce-day-field');
          if (dayField) dayField.style.display = e.target.checked ? '' : 'none';
        });
        panel.querySelector('#ce-group')?.addEventListener('change', (e) => {
          const hint = panel.querySelector('#ce-group-hint');
          if (hint) hint.textContent = groupHint(e.target.value);
        });

        panel.querySelectorAll('[data-budget-scope]').forEach((btn) => {
          btn.addEventListener('click', () => {
            budgetScope = btn.getAttribute('data-budget-scope');
            panel.querySelectorAll('[data-budget-scope]').forEach((b) => b.classList.toggle('is-active', b === btn));
          });
        });

        panel.querySelectorAll('[data-pick-color]').forEach((btn) => {
          btn.addEventListener('click', () => {
            selectedColor = btn.getAttribute('data-pick-color');
            panel.querySelectorAll('[data-pick-color]').forEach((b) => b.classList.toggle('is-selected', b === btn));
          });
        });

        panel.querySelectorAll('[data-pick-icon]').forEach((btn) => {
          btn.addEventListener('click', () => {
            selectedIcon = btn.getAttribute('data-pick-icon');
            panel.querySelectorAll('[data-pick-icon]').forEach((b) => b.classList.toggle('is-selected', b === btn));
          });
        });

        panel.querySelector('#ce-move-up')?.addEventListener('click', () => {
          store.moveCategory(category.id, -1);
          onToast('Reihenfolge aktualisiert.', 'info');
        });

        panel.querySelector('#ce-move-down')?.addEventListener('click', () => {
          store.moveCategory(category.id, 1);
          onToast('Reihenfolge aktualisiert.', 'info');
        });

        panel.querySelector('#ce-archive')?.addEventListener('click', () => {
          store.archiveCategory(category.id);
          close();
          onToast(`Kategorie „${category.name}“ entfernt.`, 'warn', { undo: true });
        });

        panel.querySelector('#cat-edit-form').addEventListener('submit', (e) => {
          e.preventDefault();
          const newName = panel.querySelector('#ce-name').value.trim();
          if (!newName) {
            onToast('Bitte einen Namen eingeben.', 'warn');
            return;
          }
          const newBudget = parseGermanAmount(panel.querySelector('#ce-budget').value);
          const newInit = parseGermanAmount(panel.querySelector('#ce-initial').value);
          const rawGoal = panel.querySelector('#ce-goal').value.trim();
          const newGoal = rawGoal ? parseGermanAmount(rawGoal) : null;
          const chosenTarget = surplusMode === 'forward' ? (panel.querySelector('#ce-surplus-target')?.value || null) : null;

          store.saveCategory(
            {
              id: category?.id || null,
              name: newName,
              group: panel.querySelector('#ce-group').value,
              budget: Number.isFinite(newBudget) && newBudget >= 0 ? newBudget : 0,
              initialBalance: Number.isFinite(newInit) ? newInit : 0,
              goalAmount: Number.isFinite(newGoal) && newGoal > 0 ? newGoal : null,
              isFixed: panel.querySelector('#ce-fixed').checked,
              bookingDay: Number(panel.querySelector('#ce-day')?.value || 1),
              rollover: surplusMode !== 'none',
              surplusTargetId: chosenTarget,
              note: panel.querySelector('#ce-note').value,
              color: selectedColor,
              icon: selectedIcon,
            },
            monthKey,
            budgetScope
          );
          close();
          onToast(isEdit ? 'Kategorie gespeichert.' : `Kategorie „${newName}“ angelegt.`, 'info');
        });
      },
    });
  }

  // ========================================================================
  // 4. Edit Monthly Net Salary Sheet
  // ========================================================================
  function openSalaryEditSheet({ monthKey }) {
    const currentVal = getEffectiveSalary(store.state, monthKey);
    const overridden = isSalaryOverridden(store.state, monthKey);
    let mode = 'from_month';

    const bodyHtml = `
      <form id="salary-form" style="display:flex;flex-direction:column;gap:14px;">
        <div class="field">
          <label class="field-label" for="sal-amount">Monatliches Nettogehalt</label>
          <div class="input-money-wrap">
            <input id="sal-amount" type="text" inputmode="decimal" class="input" style="font-size:1.45rem;padding:13px 40px 13px 15px;" value="${currentVal.toFixed(2).replace('.', ',')}" />
            <span class="input-money-suffix" style="font-size:1.15rem;">€</span>
          </div>
        </div>

        <div class="field">
          <label class="field-label">Gültigkeit wählen</label>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <label class="toggle-row" style="cursor:pointer;">
              <div class="toggle-text">
                <div class="toggle-title">Ab ${escapeHtml(formatMonthLong(monthKey))} (Standard)</div>
                <div class="toggle-desc">Ideal bei Gehaltserhöhung — frühere Monate bleiben unverändert</div>
              </div>
              <input type="radio" name="sal-mode" value="from_month" checked />
            </label>
            <label class="toggle-row" style="cursor:pointer;">
              <div class="toggle-text">
                <div class="toggle-title">Nur für ${escapeHtml(formatMonthLong(monthKey))}</div>
                <div class="toggle-desc">Ideal für 13. Gehalt, Urlaubsgeld oder Sonderzahlung</div>
              </div>
              <input type="radio" name="sal-mode" value="only_month" />
            </label>
            <label class="toggle-row" style="cursor:pointer;">
              <div class="toggle-text">
                <div class="toggle-title">Rückwirkend für alle Monate</div>
                <div class="toggle-desc">Setzt das Basis-Nettogehalt überall auf diesen Wert</div>
              </div>
              <input type="radio" name="sal-mode" value="all_months" />
            </label>
          </div>
        </div>

        <button type="submit" class="btn btn-primary btn-block">${icon('check', 17)} Nettogehalt speichern</button>
        ${overridden ? `<button type="button" class="btn btn-secondary btn-block" id="btn-clear-sal-override">Sonderbetrag für diesen Monat aufheben</button>` : ''}
      </form>
    `;

    openRaw({
      title: 'Nettogehalt anpassen',
      bodyHtml,
      onMount(panel) {
        panel.querySelectorAll('input[name="sal-mode"]').forEach((r) => {
          r.addEventListener('change', (e) => { mode = e.target.value; });
        });
        panel.querySelector('#btn-clear-sal-override')?.addEventListener('click', () => {
          store.clearSalaryOverride(monthKey);
          close();
          onToast('Sonderbetrag aufgehoben.', 'info');
        });
        panel.querySelector('#salary-form').addEventListener('submit', (e) => {
          e.preventDefault();
          const val = parseGermanAmount(panel.querySelector('#sal-amount').value);
          if (!Number.isFinite(val) || val < 0) {
            onToast('Bitte gib einen gültigen Betrag ein.', 'warn');
            return;
          }
          store.updateSalary(val, monthKey, mode);
          close();
          onToast(`Nettogehalt auf ${formatMoney(val)} aktualisiert.`, 'info', { undo: true });
        });
      },
    });
  }

  // ========================================================================
  // 5. JSON Backup Import Preview & Paste Sheet
  // ========================================================================
  function openImportPreviewSheet(validationResult) {
    const { state: parsedState, summary } = validationResult;
    const expDate = summary.exportedAt
      ? new Date(summary.exportedAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
      : 'Unbekannt';

    const bodyHtml = `
      <div class="action-banner is-pos">
        <div class="action-banner-left">
          <div class="action-banner-icon" style="background:var(--positive-soft);color:var(--positive);">${icon('check', 19)}</div>
          <div>
            <div class="action-banner-title">Gültiges cash-map Backup erkannt!</div>
            <div class="action-banner-sub">Exportiert am ${escapeHtml(expDate)}</div>
          </div>
        </div>
      </div>

      <div class="breakdown-box">
        <div class="breakdown-row">
          <span>Kategorien &amp; Budgets</span>
          <strong class="money">${summary.categoryCount} Kategorien</strong>
        </div>
        <div class="breakdown-row">
          <span>Gespeicherte Buchungen</span>
          <strong class="money">${summary.transactionCount} Einträge</strong>
        </div>
        <div class="breakdown-row">
          <span>Nettogehalt (aktuell)</span>
          <strong class="money">${escapeHtml(formatMoney(summary.latestSalary))}</strong>
        </div>
        <div class="breakdown-row">
          <span>Startmonat</span>
          <strong>${escapeHtml(formatMonthLong(summary.startMonth))}</strong>
        </div>
      </div>

      <div style="font-size:var(--text-xs);color:var(--text-secondary);">
        Beim Wiederherstellen werden alle aktuellen Daten durch dieses Backup ersetzt (inkl. Kategorien, Monatsbudgets, Startguthaben &amp; Buchungen).
      </div>

      <div class="field-row-2">
        <button type="button" class="btn btn-secondary" data-sheet-close>Abbrechen</button>
        <button type="button" class="btn btn-positive" id="btn-confirm-import">${icon('upload', 16)} Wiederherstellen</button>
      </div>
    `;

    openRaw({
      title: 'Backup wiederherstellen',
      bodyHtml,
      onMount(panel) {
        panel.querySelector('#btn-confirm-import').addEventListener('click', () => {
          store.replaceStateFromBackup(parsedState);
          close();
          onToast('Datensicherung vollständig wiederhergestellt!', 'info', { undo: true });
        });
      },
    });
  }

  function openPasteImportSheet() {
    const bodyHtml = `
      <div class="field">
        <label class="field-label" for="paste-json-area">JSON-Datensicherung hier einfügen</label>
        <textarea id="paste-json-area" class="textarea" rows="8" placeholder='{"app": "cash-map", ...}' style="font-family:var(--font-mono);font-size:16px;"></textarea>
      </div>
      <button type="button" class="btn btn-primary btn-block" id="btn-parse-pasted">${icon('check', 16)} JSON prüfen &amp; Vorschau anzeigen</button>
    `;

    openRaw({
      title: 'JSON-Text importieren',
      bodyHtml,
      onMount(panel) {
        panel.querySelector('#btn-parse-pasted').addEventListener('click', () => {
          const text = panel.querySelector('#paste-json-area').value;
          const res = parseAndValidateBackup(text);
          if (!res.ok) {
            onToast(res.error, 'error');
            return;
          }
          openImportPreviewSheet(res);
        });
      },
    });
  }

  return {
    openRaw,
    close,
    openTransactionSheet,
    openCategoryDetailSheet,
    openCategoryEditSheet,
    openSalaryEditSheet,
    openImportPreviewSheet,
    openPasteImportSheet,
  };
}
