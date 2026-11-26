// ==========================================================================
// cash-map — Main Application Entry, Event Delegation & SW Registration
// ==========================================================================

import { store } from './store.js';
import { computeMonthSnapshot, getMonthBounds } from './finance.js';
import {
  formatMoney,
  formatMonthShort,
  formatMonthLong,
  shiftMonthKey,
  getCurrentMonthKey,
  compareMonthKeys,
  parseGermanAmount,
  escapeHtml,
} from './format.js';
import { icon } from './icons.js';
import { parseAndValidateBackup, exportBackupFile } from './backup.js';
import { animateCountUps, restartAnimation } from './ui.js';

import { renderOverviewView } from './views/overview.js';
import { renderTransactionsView, renderTransactionsResults } from './views/transactions.js';
import { renderAnalyticsView } from './views/analytics.js';
import { renderBudgetsView, renderPlanSummary, renderPlanRowMeta } from './views/budgets.js';
import { createSheetManager } from './views/modals.js';
import { openSettingsSheet } from './views/settings.js';
import { mountOnboarding } from './views/onboarding.js';
import { openMonthPicker, openStartMonthSheet } from './views/monthpicker.js';

const appEl = document.getElementById('app');
const headerEl = document.getElementById('app-header');
const mainEl = document.getElementById('app-main');
const tabbarEl = document.getElementById('app-tabbar');
const sheetRoot = document.getElementById('sheet-root');
const onboardingRoot = document.getElementById('onboarding-root');
const toastRoot = document.getElementById('toast-root');
const importFileInput = document.getElementById('global-import-file');

// ---- Toast / Undo Snackbar ----
let toastTimer = null;
function showToast(message, tone = 'info', { undo = false, duration = 4200 } = {}) {
  if (toastTimer) clearTimeout(toastTimer);
  toastRoot.innerHTML = `
    <div class="toast is-${tone}">
      <div class="toast-left">
        <span class="toast-dot"></span>
        <span>${escapeHtml(message)}</span>
      </div>
      ${undo ? `<button type="button" class="toast-action" id="toast-undo-btn">Rückgängig</button>` : ''}
    </div>
  `;
  toastRoot.querySelector('#toast-undo-btn')?.addEventListener('click', () => {
    const label = store.undo();
    if (label) showToast(`Rückgängig: ${label}`, 'info', { duration: 2400 });
  });
  toastTimer = setTimeout(() => {
    toastRoot.innerHTML = '';
  }, duration);
}

// ---- Sheets & Import ----
const sheets = createSheetManager(sheetRoot, store, { onToast: showToast });

function requestFileImport() {
  importFileInput.value = '';
  importFileInput.click();
}

importFileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const res = parseAndValidateBackup(await file.text());
    if (!res.ok) {
      showToast(res.error, 'error', { duration: 5500 });
      return;
    }
    sheets.openImportPreviewSheet(res);
  } catch {
    showToast('Datei konnte nicht gelesen werden.', 'error');
  }
});

const onboarding = mountOnboarding(onboardingRoot, store, {
  onRequestImport: requestFileImport,
  onToast: showToast,
});

// ---- Header ----
function renderHeader(state, ui) {
  const cur = getCurrentMonthKey();
  const isCurrentMonth = ui.selectedMonth === cur;
  const isFuture = compareMonthKeys(ui.selectedMonth, cur) > 0;
  const { min, max } = getMonthBounds(state);
  const atMin = compareMonthKeys(ui.selectedMonth, min) <= 0;
  const atMax = compareMonthKeys(ui.selectedMonth, max) >= 0;
  const privacy = state.settings.privacyMode;
  const needsBackupDot = !state.settings.lastBackupAt && state.transactions.length >= 3;

  headerEl.innerHTML = `
    <div class="header-brand">
      <div class="brand-mark"><img src="./icons/icon-180.png" alt="" /></div>
      <span class="brand-title">cash-map</span>
    </div>

    <div class="month-switcher" role="group" aria-label="Monat wechseln">
      <button class="month-nav-btn" data-month-shift="-1" ${atMin ? 'disabled' : ''} aria-label="Vorheriger Monat">${icon('chevronLeft', 17)}</button>
      <button class="month-label-btn" data-action="open-month-picker" aria-label="Monat auswählen">
        ${isCurrentMonth ? '<span class="month-dot-current" aria-hidden="true"></span>' : ''}
        ${isFuture ? '<span class="month-dot-future" aria-hidden="true"></span>' : ''}
        <span>${escapeHtml(formatMonthShort(ui.selectedMonth))}</span>
        ${icon('chevronDown', 12)}
      </button>
      <button class="month-nav-btn" data-month-shift="1" ${atMax ? 'disabled' : ''} aria-label="Nächster Monat">${icon('chevronRight', 17)}</button>
    </div>

    <div class="header-actions">
      <button class="icon-btn ${privacy ? 'is-active' : ''}" data-action="toggle-privacy" aria-label="Beträge verbergen oder zeigen" title="Diskret-Modus">
        ${icon(privacy ? 'eyeOff' : 'eye', 18)}
      </button>
      <button class="icon-btn" data-action="open-settings" aria-label="Einstellungen und Datensicherung" title="Einstellungen &amp; Backup">
        ${icon('settings', 18)}
        ${needsBackupDot ? '<span class="icon-btn-badge" aria-hidden="true"></span>' : ''}
      </button>
    </div>
  `;
}

// ---- Tab Bar ----
function renderTabBar(ui) {
  const tab = ui.activeTab;
  const tabBtn = (id, ico, label) => `
    <button class="tab-btn ${tab === id ? 'is-active' : ''}" data-nav-tab="${id}" aria-current="${tab === id ? 'page' : 'false'}">
      ${icon(ico, 22)}
      <span>${label}</span>
    </button>`;
  tabbarEl.innerHTML = `
    ${tabBtn('overview', 'home', 'Übersicht')}
    ${tabBtn('transactions', 'list', 'Buchungen')}
    <div class="tab-add-wrap">
      <button class="tab-add-btn" data-action="open-add" aria-label="Neue Buchung eintragen">${icon('plus', 26)}</button>
    </div>
    ${tabBtn('analytics', 'map', 'Cash-Map')}
    ${tabBtn('budgets', 'sliders', 'Plan')}
  `;
}

// ---- Main Render Loop ----
let lastSnapshot = null;
let lastRenderedMonth = null;
let lastRenderedTab = null;

const countUpFormat = (v) => formatMoney(v);

function renderApp() {
  const state = store.state;
  const ui = store.ui;
  lastSnapshot = computeMonthSnapshot(state, ui.selectedMonth);

  renderHeader(state, ui);
  renderTabBar(ui);
  onboarding.render();

  // While onboarding is open, hide shell children completely so only onboarding scrolls
  const inOnboarding = !state.settings.onboardingCompleted;
  appEl?.classList.toggle('is-onboarding', inOnboarding);
  if (inOnboarding) {
    mainEl.innerHTML = '';
    lastRenderedMonth = null;
    lastRenderedTab = null;
    return;
  }

  const activeId = document.activeElement?.id;
  const selectionStart = document.activeElement?.selectionStart;

  if (ui.activeTab === 'overview') mainEl.innerHTML = renderOverviewView(state, ui, lastSnapshot);
  else if (ui.activeTab === 'transactions') mainEl.innerHTML = renderTransactionsView(state, ui, lastSnapshot);
  else if (ui.activeTab === 'analytics') mainEl.innerHTML = renderAnalyticsView(state, ui, lastSnapshot);
  else if (ui.activeTab === 'budgets') mainEl.innerHTML = renderBudgetsView(state, ui, lastSnapshot);

  if (lastRenderedMonth && lastRenderedMonth !== ui.selectedMonth) {
    restartAnimation(mainEl, compareMonthKeys(ui.selectedMonth, lastRenderedMonth) > 0 ? 'anim-next' : 'anim-prev');
  } else if (lastRenderedTab && lastRenderedTab !== ui.activeTab) {
    restartAnimation(mainEl, 'anim-fade');
  }
  lastRenderedMonth = ui.selectedMonth;
  lastRenderedTab = ui.activeTab;

  animateCountUps(mainEl, countUpFormat);

  if (activeId === 'tx-search-input') {
    const el = document.getElementById('tx-search-input');
    if (el) {
      el.focus();
      if (typeof selectionStart === 'number') el.setSelectionRange(selectionStart, selectionStart);
    }
  }
}

// ---- Month navigation (respects tracking start & planning horizon) ----
function shiftMonth(delta) {
  const { min, max } = getMonthBounds(store.state);
  const next = shiftMonthKey(store.ui.selectedMonth, delta);
  if (compareMonthKeys(next, min) < 0) {
    showToast(`Dein Tracking beginnt im ${formatMonthLong(min)}.`, 'info', { duration: 2200 });
    return;
  }
  if (compareMonthKeys(next, max) > 0) {
    showToast('Weiter als 12 Monate reicht die Planung nicht.', 'info', { duration: 2200 });
    return;
  }
  store.setUI({ selectedMonth: next });
}

function isOverlayOpen() {
  return sheetRoot.classList.contains('is-open') || onboardingRoot.classList.contains('is-open');
}

// ---- Delegated Click Handling ----
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action], [data-nav-tab], [data-month-shift], [data-goto-month], [data-group-filter], [data-open-category], [data-edit-category], [data-edit-tx], [data-tx-type], [data-tx-cat], [data-analytics-mode]');
  if (!target) return;
  if (sheetRoot.contains(target) || onboardingRoot.contains(target)) return; // handled by sheet/onboarding

  if (target.hasAttribute('data-nav-tab')) {
    store.setUI({ activeTab: target.getAttribute('data-nav-tab') });
    window.scrollTo({ top: 0, behavior: 'instant' });
    return;
  }
  if (target.hasAttribute('data-month-shift')) {
    shiftMonth(Number(target.getAttribute('data-month-shift')));
    return;
  }
  if (target.hasAttribute('data-goto-month')) {
    store.setUI({ selectedMonth: target.getAttribute('data-goto-month'), activeTab: 'overview' });
    window.scrollTo({ top: 0, behavior: 'instant' });
    return;
  }
  if (target.hasAttribute('data-group-filter')) {
    store.setUI({ groupFilter: target.getAttribute('data-group-filter') });
    return;
  }
  if (target.hasAttribute('data-open-category')) {
    sheets.openCategoryDetailSheet({ snapshot: lastSnapshot, categoryId: target.getAttribute('data-open-category') });
    return;
  }
  if (target.hasAttribute('data-edit-category')) {
    const cat = store.state.categories.find((c) => c.id === target.getAttribute('data-edit-category'));
    if (cat) sheets.openCategoryEditSheet({ category: cat, monthKey: store.ui.selectedMonth });
    return;
  }
  if (target.hasAttribute('data-edit-tx')) {
    const tx = store.state.transactions.find((t) => t.id === target.getAttribute('data-edit-tx'));
    if (tx) sheets.openTransactionSheet({ snapshot: lastSnapshot, editTx: tx });
    return;
  }
  if (target.hasAttribute('data-tx-type')) {
    store.setUI({ txTypeFilter: target.getAttribute('data-tx-type') });
    return;
  }
  if (target.hasAttribute('data-tx-cat')) {
    store.setUI({ txCategoryFilter: target.getAttribute('data-tx-cat') });
    return;
  }
  if (target.hasAttribute('data-analytics-mode')) {
    store.setUI({ analyticsMode: target.getAttribute('data-analytics-mode') });
    return;
  }

  switch (target.getAttribute('data-action')) {
    case 'open-add':
      sheets.openTransactionSheet({ snapshot: lastSnapshot, defaultType: 'expense' });
      break;
    case 'open-transfer':
      sheets.openTransactionSheet({ snapshot: lastSnapshot, defaultType: 'transfer' });
      break;
    case 'open-settings':
      openSettingsSheet(sheets, store, { onRequestImport: requestFileImport, onToast: showToast });
      break;
    case 'open-month-picker':
      openMonthPicker(sheets, store, { onToast: showToast });
      break;
    case 'edit-start-month':
      openStartMonthSheet(sheets, store, { onToast: showToast });
      break;
    case 'toggle-privacy':
      store.togglePrivacy();
      showToast(store.state.settings.privacyMode ? 'Diskret-Modus aktiviert.' : 'Beträge wieder sichtbar.', 'info', { duration: 2000 });
      break;
    case 'dismiss-install':
      store.dismissInstallHint();
      break;
    case 'dismiss-recap':
      store.dismissRecap(target.getAttribute('data-month'));
      break;
    case 'snooze-backup':
      store.snoozeBackupReminder();
      showToast('Ich erinnere dich in einer Woche wieder.', 'info', { duration: 2200 });
      break;
    case 'quick-backup':
      exportBackupFile(store.state, { preferShare: true }).then((res) => {
        if (res.method !== 'cancelled') {
          store.markBackupNow();
          showToast(`Backup gespeichert (${res.filename}).`, 'info');
        }
      });
      break;
    case 'book-recurring': {
      const count = store.bookRecurring(lastSnapshot.unbookedRecurring, store.ui.selectedMonth);
      if (count > 0) {
        showToast(`${count} ${count === 1 ? 'Dauerauftrag' : 'Daueraufträge'} gebucht!`, 'info', { undo: true });
      }
      break;
    }
    case 'edit-salary':
      sheets.openSalaryEditSheet({ monthKey: store.ui.selectedMonth });
      break;
    case 'new-category':
      sheets.openCategoryEditSheet({ category: null, monthKey: store.ui.selectedMonth });
      break;
    case 'assign-rest-to-puffer': {
      const pufferId = target.getAttribute('data-puffer-id');
      const pufferStat = lastSnapshot.categories.find((c) => c.category.id === pufferId);
      if (pufferStat && lastSnapshot.unallocatedSalary > 0) {
        store.updateCategoryBudget(pufferId, pufferStat.budget + lastSnapshot.unallocatedSalary, store.ui.selectedMonth, 'from_month');
        showToast(`Restbetrag in „${pufferStat.category.name}“ gelegt!`, 'info');
      }
      break;
    }
    case 'clear-tx-search':
      store.setUI({ txSearch: '' });
      break;
    case 'clear-tx-filters':
      store.setUI({ txSearch: '', txTypeFilter: 'all', txCategoryFilter: 'all' });
      break;
    default:
      break;
  }
});

// ---- Plan tab: live budget editing without re-rendering the list ----
function patchPlanView() {
  lastSnapshot = computeMonthSnapshot(store.state, store.ui.selectedMonth);
  const privacy = store.state.settings.privacyMode;
  const sumEl = document.getElementById('plan-summary');
  if (sumEl) sumEl.outerHTML = renderPlanSummary(lastSnapshot, privacy);
  for (const g of lastSnapshot.groups) {
    const el = document.getElementById(`plan-group-sum-${g.id}`);
    if (el) el.textContent = formatMoney(g.budget, { privacy });
  }
  for (const s of lastSnapshot.categories) {
    const el = document.getElementById(`plan-meta-${s.category.id}`);
    if (el) el.innerHTML = renderPlanRowMeta(s, lastSnapshot.salary);
  }
}

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'tx-search-input') {
    // Live search: only the result list is re-rendered → iOS keyboard stays rock-steady
    store.ui = { ...store.ui, txSearch: t.value };
    const privacy = store.state.settings.privacyMode;
    const res = renderTransactionsResults(store.state, store.ui, lastSnapshot);
    const resultsEl = document.getElementById('tx-results-container');
    const countEl = document.getElementById('tx-count-badge');
    const sumEl = document.getElementById('tx-sum-strip');
    const clearBtn = document.getElementById('tx-search-clear-btn');
    if (resultsEl) resultsEl.innerHTML = res.timelineHtml;
    if (countEl) countEl.textContent = String(res.count);
    if (sumEl) {
      sumEl.innerHTML = `Ausg.: <strong style="color:var(--text-primary);">${escapeHtml(formatMoney(res.sumExpenses, { privacy }))}</strong>${res.sumIncomes > 0 ? ` · <span class="text-pos">+${escapeHtml(formatMoney(res.sumIncomes, { privacy, compact: true }))}</span>` : ''}`;
    }
    if (clearBtn) clearBtn.style.display = t.value ? '' : 'none';
    return;
  }
  if (t.hasAttribute && t.hasAttribute('data-budget-input')) {
    const val = parseGermanAmount(t.value);
    if (!Number.isFinite(val) || val < 0) return;
    store.updateCategoryBudget(t.getAttribute('data-budget-input'), val, store.ui.selectedMonth, 'from_month', { silent: true });
    patchPlanView();
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.hasAttribute && t.hasAttribute('data-budget-input')) {
    const stat = lastSnapshot?.categories.find((s) => s.category.id === t.getAttribute('data-budget-input'));
    const val = parseGermanAmount(t.value);
    if (!Number.isFinite(val) || val < 0) {
      showToast('Bitte gib eine gültige Zahl ein.', 'warn');
    }
    if (stat) t.value = stat.budget.toFixed(2).replace('.', ',');
  }
});

document.addEventListener('focusin', (e) => {
  const t = e.target;
  if (t.hasAttribute && t.hasAttribute('data-budget-input')) {
    setTimeout(() => {
      try { t.select(); } catch {}
    }, 0);
  }
});

document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (e.key === 'Enter' && t.hasAttribute && t.hasAttribute('data-budget-input')) {
    e.preventDefault();
    t.blur();
    return;
  }
  // Desktop convenience: ← / → switch months, Enter/Space opens focused category card
  const tag = t.tagName;
  if (isOverlayOpen() || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if ((e.key === 'Enter' || e.key === ' ') && t.hasAttribute && t.hasAttribute('data-open-category')) {
    e.preventDefault();
    sheets.openCategoryDetailSheet({ snapshot: lastSnapshot, categoryId: t.getAttribute('data-open-category') });
    return;
  }
  if (e.key === 'ArrowLeft') shiftMonth(-1);
  else if (e.key === 'ArrowRight') shiftMonth(1);
});

// ---- Horizontal swipe on the content switches months (iOS feel) ----
let swipe = null;
mainEl.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) return;
  const t = e.touches[0];
  if (t.clientX < 24 || t.clientX > window.innerWidth - 24) return;
  if (e.target.closest('.chip-row, .sankey-wrap, .cat-picker-scroll, input, textarea, select, details')) return;
  swipe = { x: t.clientX, y: t.clientY, time: Date.now() };
}, { passive: true });

mainEl.addEventListener('touchend', (e) => {
  if (!swipe) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - swipe.x;
  const dy = t.clientY - swipe.y;
  const dt = Date.now() - swipe.time;
  swipe = null;
  if (Math.abs(dx) > 70 && Math.abs(dy) < 40 && dt < 600) shiftMonth(dx < 0 ? 1 : -1);
}, { passive: true });

// ---- PWA shortcut parameters (?action=add or ?tab=analytics) ----
function handleLaunchParams() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  if (tab && ['overview', 'transactions', 'analytics', 'budgets'].includes(tab)) {
    store.setUI({ activeTab: tab });
  }
  if (params.get('action') === 'add' && store.state.settings.onboardingCompleted) {
    setTimeout(() => sheets.openTransactionSheet({ snapshot: lastSnapshot, defaultType: 'expense' }), 120);
  }
}

store.subscribe(renderApp);
renderApp();
handleLaunchParams();

// ---- Service Worker (offline support + update hint) ----
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showToast('Neue Version von cash-map verfügbar – App neu öffnen zum Aktualisieren.', 'info', { duration: 6000 });
          }
        });
      });
    } catch (err) {
      console.warn('Service Worker Registrierung übersprungen:', err);
    }
  });
}
