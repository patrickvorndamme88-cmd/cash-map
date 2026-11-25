// ==========================================================================
// cash-map — Main Application Entry, Event Delegation & SW Registration
// ==========================================================================

import { store } from './store.js';
import { computeMonthSnapshot } from './finance.js';
import {
  formatMoney,
  formatMonthShort,
  shiftMonthKey,
  getCurrentMonthKey,
  parseGermanAmount,
  escapeHtml,
} from './format.js';
import { icon } from './icons.js';
import { parseAndValidateBackup } from './backup.js';

import { renderOverviewView } from './views/overview.js';
import { renderTransactionsView, renderTransactionsResults } from './views/transactions.js';
import { renderAnalyticsView } from './views/analytics.js';
import { renderBudgetsView } from './views/budgets.js';
import { createSheetManager } from './views/modals.js';
import { openSettingsSheet } from './views/settings.js';
import { mountOnboarding } from './views/onboarding.js';

const headerEl = document.getElementById('app-header');
const mainEl = document.getElementById('app-main');
const tabbarEl = document.getElementById('app-tabbar');
const sheetRoot = document.getElementById('sheet-root');
const onboardingRoot = document.getElementById('onboarding-root');
const toastRoot = document.getElementById('toast-root');
const importFileInput = document.getElementById('global-import-file');

// ---- Toast / Undo Snackbar Manager ----
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

// ---- Sheet Manager ----
const sheets = createSheetManager(sheetRoot, store, { onToast: showToast });

function requestFileImport() {
  importFileInput.value = '';
  importFileInput.click();
}

importFileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const res = parseAndValidateBackup(text);
    if (!res.ok) {
      showToast(res.error, 'error', { duration: 5500 });
      return;
    }
    sheets.openImportPreviewSheet(res);
  } catch {
    showToast('Datei konnte nicht gelesen werden.', 'error');
  }
});

// ---- Onboarding Controller ----
const onboarding = mountOnboarding(onboardingRoot, store, {
  onRequestImport: requestFileImport,
  onToast: showToast,
});

// ---- Persistent Header Renderer ----
function renderHeader(state, ui) {
  const isCurrentMonth = ui.selectedMonth === getCurrentMonthKey();
  const privacy = state.settings.privacyMode;
  const needsBackupDot = !state.settings.lastBackupAt && state.transactions.length >= 3;

  headerEl.innerHTML = `
    <div class="header-brand">
      <div class="brand-mark"><img src="./icons/icon-180.png" alt="" /></div>
      <span class="brand-title">cash-map</span>
    </div>

    <div class="month-switcher" role="group" aria-label="Monat wechseln">
      <button class="month-nav-btn" data-month-shift="-1" aria-label="Vorheriger Monat">${icon('chevronLeft', 17)}</button>
      <button class="month-label-btn" data-month-today title="Zum aktuellen Monat springen">
        ${isCurrentMonth ? '<span class="month-dot-current" aria-hidden="true"></span>' : ''}
        <span>${escapeHtml(formatMonthShort(ui.selectedMonth))}</span>
      </button>
      <button class="month-nav-btn" data-month-shift="1" aria-label="Nächster Monat">${icon('chevronRight', 17)}</button>
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

// ---- Persistent Bottom Tab Bar Renderer ----
function renderTabBar(ui) {
  const tab = ui.activeTab;
  tabbarEl.innerHTML = `
    <button class="tab-btn ${tab === 'overview' ? 'is-active' : ''}" data-nav-tab="overview" aria-current="${tab === 'overview' ? 'page' : 'false'}">
      ${icon('home', 22)}
      <span>Übersicht</span>
    </button>

    <button class="tab-btn ${tab === 'transactions' ? 'is-active' : ''}" data-nav-tab="transactions" aria-current="${tab === 'transactions' ? 'page' : 'false'}">
      ${icon('list', 22)}
      <span>Buchungen</span>
    </button>

    <div class="tab-add-wrap">
      <button class="tab-add-btn" data-action="open-add" aria-label="Neue Buchung eintragen">
        ${icon('plus', 26)}
      </button>
    </div>

    <button class="tab-btn ${tab === 'analytics' ? 'is-active' : ''}" data-nav-tab="analytics" aria-current="${tab === 'analytics' ? 'page' : 'false'}">
      ${icon('map', 22)}
      <span>Cash-Map</span>
    </button>

    <button class="tab-btn ${tab === 'budgets' ? 'is-active' : ''}" data-nav-tab="budgets" aria-current="${tab === 'budgets' ? 'page' : 'false'}">
      ${icon('sliders', 22)}
      <span>Plan</span>
    </button>
  `;
}

// ---- Main App Render Loop ----
let lastSnapshot = null;

function renderApp() {
  const state = store.state;
  const ui = store.ui;
  lastSnapshot = computeMonthSnapshot(state, ui.selectedMonth);

  renderHeader(state, ui);
  renderTabBar(ui);
  onboarding.render();

  // Preserve search input focus if user is typing in Transactions search
  const activeId = document.activeElement?.id;
  const selectionStart = document.activeElement?.selectionStart;

  if (ui.activeTab === 'overview') {
    mainEl.innerHTML = renderOverviewView(state, ui, lastSnapshot);
  } else if (ui.activeTab === 'transactions') {
    mainEl.innerHTML = renderTransactionsView(state, ui, lastSnapshot);
  } else if (ui.activeTab === 'analytics') {
    mainEl.innerHTML = renderAnalyticsView(state, ui, lastSnapshot);
  } else if (ui.activeTab === 'budgets') {
    mainEl.innerHTML = renderBudgetsView(state, ui, lastSnapshot);
  }

  if (activeId === 'tx-search-input') {
    const el = document.getElementById('tx-search-input');
    if (el) {
      el.focus();
      if (typeof selectionStart === 'number') {
        el.setSelectionRange(selectionStart, selectionStart);
      }
    }
  }
}

// ---- Delegated Event Handling ----
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action], [data-nav-tab], [data-month-shift], [data-month-today], [data-group-filter], [data-open-category], [data-edit-category], [data-edit-tx], [data-tx-type], [data-tx-cat], [data-analytics-mode]');
  if (!target) return;

  // Tab switching
  if (target.hasAttribute('data-nav-tab')) {
    const nextTab = target.getAttribute('data-nav-tab');
    store.setUI({ activeTab: nextTab });
    window.scrollTo({ top: 0, behavior: 'instant' });
    return;
  }

  // Month navigation
  if (target.hasAttribute('data-month-shift')) {
    const delta = Number(target.getAttribute('data-month-shift'));
    store.setUI({ selectedMonth: shiftMonthKey(store.ui.selectedMonth, delta) });
    return;
  }

  if (target.hasAttribute('data-month-today')) {
    const cur = getCurrentMonthKey();
    if (store.ui.selectedMonth !== cur) {
      store.setUI({ selectedMonth: cur });
      showToast('Zurück im aktuellen Monat.', 'info', { duration: 2000 });
    }
    return;
  }

  // Overview group filter
  if (target.hasAttribute('data-group-filter')) {
    store.setUI({ groupFilter: target.getAttribute('data-group-filter') });
    return;
  }

  // Open Category Detail Sheet
  if (target.hasAttribute('data-open-category')) {
    sheets.openCategoryDetailSheet({
      snapshot: lastSnapshot,
      categoryId: target.getAttribute('data-open-category'),
    });
    return;
  }

  // Edit Category Sheet (from Plan tab)
  if (target.hasAttribute('data-edit-category')) {
    const id = target.getAttribute('data-edit-category');
    const cat = store.state.categories.find((c) => c.id === id);
    if (cat) sheets.openCategoryEditSheet({ category: cat, monthKey: store.ui.selectedMonth });
    return;
  }

  // Edit Transaction Sheet
  if (target.hasAttribute('data-edit-tx')) {
    const id = target.getAttribute('data-edit-tx');
    const tx = store.state.transactions.find((t) => t.id === id);
    if (tx) sheets.openTransactionSheet({ snapshot: lastSnapshot, editTx: tx });
    return;
  }

  // Transactions filters
  if (target.hasAttribute('data-tx-type')) {
    store.setUI({ txTypeFilter: target.getAttribute('data-tx-type') });
    return;
  }

  if (target.hasAttribute('data-tx-cat')) {
    store.setUI({ txCategoryFilter: target.getAttribute('data-tx-cat') });
    return;
  }

  // Analytics Sankey mode toggle
  if (target.hasAttribute('data-analytics-mode')) {
    store.setUI({ analyticsMode: target.getAttribute('data-analytics-mode') });
    return;
  }

  // Named Actions
  const action = target.getAttribute('data-action');
  switch (action) {
    case 'open-add':
      sheets.openTransactionSheet({ snapshot: lastSnapshot, defaultType: 'expense' });
      break;
    case 'open-transfer':
      sheets.openTransactionSheet({ snapshot: lastSnapshot, defaultType: 'transfer' });
      break;
    case 'open-settings':
      openSettingsSheet(sheets, store, { onRequestImport: requestFileImport, onToast: showToast });
      break;
    case 'toggle-privacy':
      store.togglePrivacy();
      showToast(
        store.state.settings.privacyMode ? 'Diskret-Modus aktiviert.' : 'Beträge wieder sichtbar.',
        'info',
        { duration: 2000 }
      );
      break;
    case 'dismiss-install':
      store.dismissInstallHint();
      break;
    case 'book-fixed': {
      const count = store.bookFixedCategories(lastSnapshot.unbookedFixed, store.ui.selectedMonth);
      if (count > 0) {
        showToast(`${count} Fixkosten für diesen Monat gebucht!`, 'info', { undo: true });
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
        const nextBudget = pufferStat.budget + lastSnapshot.unallocatedSalary;
        store.updateCategoryBudget(pufferId, nextBudget, store.ui.selectedMonth, 'from_month');
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
  }
});

// Live search in Transactions tab without re-mounting the input (keeps iOS keyboard rock-steady!)
document.addEventListener('input', (e) => {
  if (e.target.id === 'tx-search-input') {
    store.ui = { ...store.ui, txSearch: e.target.value };
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
    if (clearBtn) clearBtn.style.display = e.target.value ? '' : 'none';
  }
});

// Commit inline budget input changes in Plan tab on change / blur
document.addEventListener('change', (e) => {
  if (e.target.hasAttribute('data-budget-input')) {
    const catId = e.target.getAttribute('data-budget-input');
    const val = parseGermanAmount(e.target.value);
    if (!Number.isFinite(val) || val < 0) {
      showToast('Bitte gib eine gültige Zahl ein.', 'warn');
      renderApp();
      return;
    }
    store.updateCategoryBudget(catId, val, store.ui.selectedMonth, 'from_month');
    showToast('Monatsbudget aktualisiert.', 'info', { duration: 1800 });
  }
});

// Handle PWA Shortcut URL parameters (?action=add or ?tab=analytics)
function handleLaunchParams() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  const action = params.get('action');
  if (tab && ['overview', 'transactions', 'analytics', 'budgets'].includes(tab)) {
    store.setUI({ activeTab: tab });
  }
  if (action === 'add' && store.state.settings.onboardingCompleted) {
    setTimeout(() => {
      sheets.openTransactionSheet({ snapshot: lastSnapshot, defaultType: 'expense' });
    }, 120);
  }
}

// Subscribe & Initial Render
store.subscribe(renderApp);
renderApp();
handleLaunchParams();

// ---- Service Worker Registration (Offline Support + Update Toast) ----
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showToast('Neue Version von cash-map verfügbar — neu laden zum Aktualisieren.', 'info', { duration: 6000 });
          }
        });
      });
    } catch (err) {
      console.warn('Service Worker Registrierung übersprungen:', err);
    }
  });
}
