// ==========================================================================
// cash-map — Reactive State Store & LocalStorage Persistence
// ==========================================================================

import { createInitialState, createDemoState } from './defaults.js';
import {
  getCurrentMonthKey,
  compareMonthKeys,
  roundCents,
  uid,
  defaultDateForMonth,
} from './format.js';

export const STORAGE_KEY = 'cashmap_state_v1';

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.categories)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveToStorage(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Speichern fehlgeschlagen:', err);
  }
}

class CashMapStore {
  constructor() {
    const loaded = loadFromStorage();
    this.state = loaded || createInitialState();
    this.ui = {
      activeTab: 'overview', // 'overview' | 'transactions' | 'analytics' | 'budgets'
      selectedMonth: getCurrentMonthKey(),
      groupFilter: 'all',
      txSearch: '',
      txCategoryFilter: 'all',
      txTypeFilter: 'all',
      analyticsMode: 'plan', // 'plan' | 'actual' for Sankey
    };
    this.undoStack = [];
    this.listeners = new Set();
    this._applyTheme();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) {
      try {
        fn(this.state, this.ui);
      } catch (e) {
        console.error('Store listener error:', e);
      }
    }
  }

  _pushUndo(label) {
    this.undoStack.push({
      label,
      snapshot: deepClone(this.state),
    });
    if (this.undoStack.length > 15) this.undoStack.shift();
  }

  undo() {
    const last = this.undoStack.pop();
    if (!last) return null;
    this.state = last.snapshot;
    saveToStorage(this.state);
    this._applyTheme();
    this.emit();
    return last.label;
  }

  _commit(undoLabel = null) {
    if (undoLabel) this._pushUndo(undoLabel);
    saveToStorage(this.state);
    this._applyTheme();
    this.emit();
  }

  _applyTheme() {
    const pref = this.state.settings?.theme || 'auto';
    const sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved = pref === 'dark' || (pref === 'auto' && sysDark) ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', resolved);
    const meta = document.getElementById('theme-color-meta');
    if (meta) {
      meta.setAttribute('content', resolved === 'dark' ? '#090B10' : '#F3F5FA');
    }
  }

  // ---- UI Navigation State ----
  setUI(patch) {
    this.ui = { ...this.ui, ...patch };
    this.emit();
  }

  // ---- Settings ----
  setTheme(theme) {
    this.state.settings.theme = theme;
    this._commit();
  }

  togglePrivacy() {
    this.state.settings.privacyMode = !this.state.settings.privacyMode;
    this._commit();
  }

  dismissInstallHint() {
    this.state.settings.installHintDismissed = true;
    this._commit();
  }

  markBackupNow() {
    this.state.settings.lastBackupAt = new Date().toISOString();
    this._commit();
  }

  completeOnboarding({ netSalary, categoryBudgets, startMonth }) {
    const m = startMonth || getCurrentMonthKey();
    this.state.settings.startMonth = m;
    this.state.settings.onboardingCompleted = true;
    this.state.salaryHistory = [{ effectiveFrom: m, amount: roundCents(netSalary) }];
    if (categoryBudgets && typeof categoryBudgets === 'object') {
      for (const cat of this.state.categories) {
        if (Object.prototype.hasOwnProperty.call(categoryBudgets, cat.id)) {
          cat.budgetHistory = [{ effectiveFrom: m, amount: roundCents(categoryBudgets[cat.id]) }];
        }
      }
    }
    this.ui.selectedMonth = m;
    this._commit();
  }

  loadDemoData() {
    this._pushUndo('Vorherige Daten');
    this.state = createDemoState();
    this.ui.selectedMonth = getCurrentMonthKey();
    saveToStorage(this.state);
    this._applyTheme();
    this.emit();
  }

  resetAllData(keepOnboarding = false) {
    this._pushUndo('Vorherige Daten');
    const fresh = createInitialState(getCurrentMonthKey(), 3000);
    fresh.settings.onboardingCompleted = keepOnboarding;
    fresh.settings.theme = this.state.settings?.theme || 'auto';
    this.state = fresh;
    this.ui.selectedMonth = getCurrentMonthKey();
    saveToStorage(this.state);
    this._applyTheme();
    this.emit();
  }

  replaceStateFromBackup(newState) {
    this._pushUndo('Stand vor Import');
    this.state = deepClone(newState);
    this.state.settings.onboardingCompleted = true;
    saveToStorage(this.state);
    this._applyTheme();
    this.emit();
  }

  // ---- Salary Management ----
  updateSalary(amount, monthKey, mode = 'from_month') {
    const val = roundCents(Math.max(0, amount));
    this._pushUndo('Gehalt geändert');

    if (mode === 'only_month') {
      if (!this.state.salaryOverrides) this.state.salaryOverrides = {};
      this.state.salaryOverrides[monthKey] = val;
    } else if (mode === 'all_months') {
      this.state.salaryHistory = [{ effectiveFrom: this.state.settings.startMonth || monthKey, amount: val }];
      if (this.state.salaryOverrides) delete this.state.salaryOverrides[monthKey];
    } else {
      // 'from_month': upsert into salaryHistory
      const hist = (this.state.salaryHistory || []).filter((h) => h.effectiveFrom !== monthKey);
      hist.push({ effectiveFrom: monthKey, amount: val });
      hist.sort((a, b) => compareMonthKeys(a.effectiveFrom, b.effectiveFrom));
      this.state.salaryHistory = hist;
      if (this.state.salaryOverrides) delete this.state.salaryOverrides[monthKey];
    }
    this._commit();
  }

  clearSalaryOverride(monthKey) {
    if (this.state.salaryOverrides && Object.prototype.hasOwnProperty.call(this.state.salaryOverrides, monthKey)) {
      this._pushUndo('Gehalt-Ausnahme entfernt');
      delete this.state.salaryOverrides[monthKey];
      this._commit();
    }
  }

  // ---- Category Management ----
  updateCategoryBudget(categoryId, amount, monthKey, mode = 'from_month') {
    const cat = this.state.categories.find((c) => c.id === categoryId);
    if (!cat) return;
    const val = roundCents(Math.max(0, amount));

    if (mode === 'all_months') {
      const start = this.state.settings.startMonth || monthKey;
      cat.budgetHistory = [{ effectiveFrom: start, amount: val }];
    } else {
      const hist = (cat.budgetHistory || []).filter((h) => h.effectiveFrom !== monthKey);
      hist.push({ effectiveFrom: monthKey, amount: val });
      hist.sort((a, b) => compareMonthKeys(a.effectiveFrom, b.effectiveFrom));
      cat.budgetHistory = hist;
    }
    this._commit();
  }

  saveCategory(catData, monthKey, budgetMode = 'from_month') {
    this._pushUndo('Kategorie bearbeitet');
    if (catData.id) {
      const existing = this.state.categories.find((c) => c.id === catData.id);
      if (existing) {
        existing.name = catData.name.trim();
        existing.icon = catData.icon;
        existing.color = catData.color;
        existing.group = catData.group;
        existing.isFixed = Boolean(catData.isFixed);
        existing.rollover = Boolean(catData.rollover);
        existing.initialBalance = roundCents(catData.initialBalance || 0);
        existing.goalAmount = catData.goalAmount > 0 ? roundCents(catData.goalAmount) : null;
        existing.note = (catData.note || '').trim();
        if (typeof catData.budget === 'number' && !Number.isNaN(catData.budget)) {
          if (budgetMode === 'all_months') {
            existing.budgetHistory = [{ effectiveFrom: this.state.settings.startMonth || monthKey, amount: roundCents(catData.budget) }];
          } else {
            const hist = (existing.budgetHistory || []).filter((h) => h.effectiveFrom !== monthKey);
            hist.push({ effectiveFrom: monthKey, amount: roundCents(catData.budget) });
            hist.sort((a, b) => compareMonthKeys(a.effectiveFrom, b.effectiveFrom));
            existing.budgetHistory = hist;
          }
        }
      }
    } else {
      const maxOrder = this.state.categories.reduce((m, c) => Math.max(m, c.order ?? 0), -1);
      const start = this.state.settings.startMonth || monthKey;
      this.state.categories.push({
        id: uid('cat'),
        name: catData.name.trim(),
        icon: catData.icon || 'wallet',
        color: catData.color || '#5B8CFF',
        group: catData.group || 'daily',
        isFixed: Boolean(catData.isFixed),
        rollover: catData.rollover !== false,
        initialBalance: roundCents(catData.initialBalance || 0),
        goalAmount: catData.goalAmount > 0 ? roundCents(catData.goalAmount) : null,
        note: (catData.note || '').trim(),
        order: maxOrder + 1,
        archived: false,
        budgetHistory: [{ effectiveFrom: start, amount: roundCents(catData.budget || 0) }],
      });
    }
    this._commit();
  }

  moveCategory(categoryId, direction) {
    const active = this.state.categories
      .filter((c) => !c.archived)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = active.findIndex((c) => c.id === categoryId);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= active.length) return;

    const tmp = active[idx];
    active[idx] = active[swapIdx];
    active[swapIdx] = tmp;
    active.forEach((c, i) => { c.order = i; });
    this._commit();
  }

  archiveCategory(categoryId) {
    const cat = this.state.categories.find((c) => c.id === categoryId);
    if (!cat) return;
    this._pushUndo(`Kategorie „${cat.name}“ entfernt`);
    cat.archived = true;
    this._commit();
  }

  // ---- Transaction Management ----
  addTransaction(txInput) {
    const tx = {
      id: uid('tx'),
      type: txInput.type || 'expense', // 'expense' | 'income' | 'transfer'
      date: txInput.date || defaultDateForMonth(this.ui.selectedMonth),
      amount: roundCents(Math.abs(txInput.amount || 0)),
      categoryId: txInput.categoryId || null,
      fromCategoryId: txInput.fromCategoryId || null,
      toCategoryId: txInput.toCategoryId || null,
      note: (txInput.note || '').trim(),
      createdAt: new Date().toISOString(),
    };
    this._pushUndo('Buchung hinzugefügt');
    this.state.transactions.push(tx);
    this._commit();
    return tx;
  }

  updateTransaction(txId, patch) {
    const idx = this.state.transactions.findIndex((t) => t.id === txId);
    if (idx < 0) return;
    this._pushUndo('Buchung bearbeitet');
    this.state.transactions[idx] = {
      ...this.state.transactions[idx],
      ...patch,
      amount: roundCents(Math.abs(patch.amount ?? this.state.transactions[idx].amount)),
      note: (patch.note ?? this.state.transactions[idx].note ?? '').trim(),
    };
    this._commit();
  }

  deleteTransaction(txId) {
    const tx = this.state.transactions.find((t) => t.id === txId);
    if (!tx) return;
    this._pushUndo('Buchung gelöscht');
    this.state.transactions = this.state.transactions.filter((t) => t.id !== txId);
    this._commit();
  }

  bookFixedCategories(unbookedList, monthKey) {
    if (!unbookedList || unbookedList.length === 0) return 0;
    this._pushUndo('Fixkosten gebucht');
    const date = `${monthKey}-01`;
    const now = new Date().toISOString();
    for (const item of unbookedList) {
      this.state.transactions.push({
        id: uid('tx'),
        type: 'expense',
        date,
        amount: roundCents(item.budget),
        categoryId: item.category.id,
        fromCategoryId: null,
        toCategoryId: null,
        note: `${item.category.name} (Fixkosten)`,
        createdAt: now,
      });
    }
    this._commit();
    return unbookedList.length;
  }
}

export const store = new CashMapStore();

// Keep theme synced when iOS switches Dark/Light automatically
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    store._applyTheme();
  });
}
