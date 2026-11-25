// ==========================================================================
// cash-map — Reactive State Store & LocalStorage Persistence
// ==========================================================================

import { createInitialState, createDemoState, DEFAULT_BOOKING_DAYS } from './defaults.js';
import { clampMonthKey } from './finance.js';
import {
  getCurrentMonthKey,
  compareMonthKeys,
  roundCents,
  uid,
  defaultDateForMonth,
  daysInMonth,
} from './format.js';

export const STORAGE_KEY = 'cashmap_state_v1';

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function clampDay(d) {
  const n = Math.round(Number(d) || 1);
  return Math.min(28, Math.max(1, n));
}

/**
 * Brings older saved states / backups up to date (adds missing settings & booking days).
 */
export function migrateState(s) {
  const defaults = createInitialState();
  s.schemaVersion = 1;
  s.settings = { ...defaults.settings, ...(s.settings || {}) };
  if (!Array.isArray(s.salaryHistory) || s.salaryHistory.length === 0) s.salaryHistory = defaults.salaryHistory;
  if (!s.salaryOverrides || typeof s.salaryOverrides !== 'object') s.salaryOverrides = {};
  if (!Array.isArray(s.transactions)) s.transactions = [];
  for (const c of s.categories || []) {
    if (c.isFixed) c.bookingDay = clampDay(c.bookingDay || DEFAULT_BOOKING_DAYS[c.id] || 1);
    else if (c.bookingDay === undefined) c.bookingDay = null;
    if (c.surplusTargetId === undefined) {
      c.surplusTargetId = !s.settings.onboardingCompleted && c.id === 'cat_sauna' ? 'cat_puffer' : null;
    }
    if (!Array.isArray(c.budgetHistory) || c.budgetHistory.length === 0) {
      c.budgetHistory = [{ effectiveFrom: s.settings.startMonth, amount: 0 }];
    }
  }
  return s;
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.categories)) return null;
    return migrateState(parsed);
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
    this.state = loadFromStorage() || createInitialState();
    this.ui = {
      activeTab: 'overview', // 'overview' | 'transactions' | 'analytics' | 'budgets'
      selectedMonth: getCurrentMonthKey(),
      groupFilter: 'all',
      txSearch: '',
      txCategoryFilter: 'all',
      txTypeFilter: 'all',
      analyticsMode: 'plan',
    };
    this._clampSelected();
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

  _clampSelected() {
    this.ui.selectedMonth = clampMonthKey(this.state, this.ui.selectedMonth);
  }

  _pushUndo(label) {
    this.undoStack.push({ label, snapshot: deepClone(this.state) });
    if (this.undoStack.length > 15) this.undoStack.shift();
  }

  undo() {
    const last = this.undoStack.pop();
    if (!last) return null;
    this.state = last.snapshot;
    saveToStorage(this.state);
    this._clampSelected();
    this._applyTheme();
    this.emit();
    return last.label;
  }

  _commit(undoLabel = null) {
    if (undoLabel) this._pushUndo(undoLabel);
    saveToStorage(this.state);
    this._clampSelected();
    this._applyTheme();
    this.emit();
  }

  _applyTheme() {
    const pref = this.state.settings?.theme || 'auto';
    const sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved = pref === 'dark' || (pref === 'auto' && sysDark) ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', resolved);
    const meta = document.getElementById('theme-color-meta');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#090B10' : '#F3F5FA');
  }

  // ---- UI Navigation State ----
  setUI(patch) {
    this.ui = { ...this.ui, ...patch };
    if (Object.prototype.hasOwnProperty.call(patch, 'selectedMonth')) this._clampSelected();
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

  dismissRecap(monthKey) {
    this.state.settings.recapDismissed = monthKey;
    this._commit();
  }

  snoozeBackupReminder() {
    this.state.settings.backupReminderSnoozedAt = new Date().toISOString();
    this._commit();
  }

  markBackupNow() {
    this.state.settings.lastBackupAt = new Date().toISOString();
    this.state.settings.backupReminderSnoozedAt = null;
    this._commit();
  }

  setStartMonth(monthKey) {
    this._pushUndo('Tracking-Beginn geändert');
    this.state.settings.startMonth = monthKey;
    const alignFirst = (hist) => {
      if (!Array.isArray(hist) || hist.length === 0) return;
      hist.sort((a, b) => compareMonthKeys(a.effectiveFrom, b.effectiveFrom));
      if (compareMonthKeys(hist[0].effectiveFrom, monthKey) > 0) hist[0].effectiveFrom = monthKey;
    };
    alignFirst(this.state.salaryHistory);
    for (const c of this.state.categories) alignFirst(c.budgetHistory);
    this._commit();
  }

  completeOnboarding({ netSalary, categoryBudgets, surplusTargets, startMonth }) {
    const m = startMonth || getCurrentMonthKey();
    this.state.settings.startMonth = m;
    this.state.settings.onboardingCompleted = true;
    this.state.salaryHistory = [{ effectiveFrom: m, amount: roundCents(netSalary) }];
    if (categoryBudgets && typeof categoryBudgets === 'object') {
      for (const cat of this.state.categories) {
        if (Object.prototype.hasOwnProperty.call(categoryBudgets, cat.id)) {
          cat.budgetHistory = [{ effectiveFrom: m, amount: roundCents(categoryBudgets[cat.id]) }];
        }
        if (surplusTargets && Object.prototype.hasOwnProperty.call(surplusTargets, cat.id)) {
          cat.surplusTargetId = surplusTargets[cat.id] || null;
        }
      }
    }
    this.ui.selectedMonth = getCurrentMonthKey();
    this._commit();
  }

  loadDemoData() {
    this._pushUndo('Vorherige Daten');
    this.state = createDemoState();
    this.ui.selectedMonth = getCurrentMonthKey();
    saveToStorage(this.state);
    this._clampSelected();
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
    this._clampSelected();
    this._applyTheme();
    this.emit();
  }

  replaceStateFromBackup(newState) {
    this._pushUndo('Stand vor Import');
    this.state = migrateState(deepClone(newState));
    this.state.settings.onboardingCompleted = true;
    this.ui.selectedMonth = getCurrentMonthKey();
    saveToStorage(this.state);
    this._clampSelected();
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
  /**
   * silent=true saves without re-rendering (used while typing in the Plan tab,
   * so the iPhone keyboard stays open and focus never jumps).
   */
  updateCategoryBudget(categoryId, amount, monthKey, mode = 'from_month', { silent = false } = {}) {
    const cat = this.state.categories.find((c) => c.id === categoryId);
    if (!cat) return;
    const val = roundCents(Math.max(0, amount));

    if (mode === 'all_months') {
      cat.budgetHistory = [{ effectiveFrom: this.state.settings.startMonth || monthKey, amount: val }];
    } else {
      const hist = (cat.budgetHistory || []).filter((h) => h.effectiveFrom !== monthKey);
      hist.push({ effectiveFrom: monthKey, amount: val });
      hist.sort((a, b) => compareMonthKeys(a.effectiveFrom, b.effectiveFrom));
      cat.budgetHistory = hist;
    }

    if (silent) {
      saveToStorage(this.state);
      return;
    }
    this._commit();
  }

  setCategorySurplusRule(categoryId, { rollover = true, surplusTargetId = null }) {
    const cat = this.state.categories.find((c) => c.id === categoryId);
    if (!cat) return;
    this._pushUndo('Überschuss-Regel geändert');
    cat.rollover = Boolean(rollover);
    cat.surplusTargetId = surplusTargetId && surplusTargetId !== categoryId ? surplusTargetId : null;
    this._commit();
  }

  saveCategory(catData, monthKey, budgetMode = 'from_month') {
    this._pushUndo('Kategorie bearbeitet');
    const isFixed = Boolean(catData.isFixed);
    const bookingDay = isFixed ? clampDay(catData.bookingDay || 1) : null;
    const cleanTarget = catData.surplusTargetId && catData.surplusTargetId !== catData.id ? catData.surplusTargetId : null;

    if (catData.id) {
      const existing = this.state.categories.find((c) => c.id === catData.id);
      if (existing) {
        existing.name = catData.name.trim();
        existing.icon = catData.icon;
        existing.color = catData.color;
        existing.group = catData.group;
        existing.isFixed = isFixed;
        existing.bookingDay = bookingDay;
        existing.rollover = Boolean(catData.rollover);
        existing.surplusTargetId = cleanTarget;
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
        isFixed,
        bookingDay,
        rollover: catData.rollover !== false,
        surplusTargetId: cleanTarget,
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
      type: txInput.type || 'expense',
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
    if (!this.state.transactions.some((t) => t.id === txId)) return;
    this._pushUndo('Buchung gelöscht');
    this.state.transactions = this.state.transactions.filter((t) => t.id !== txId);
    this._commit();
  }

  /**
   * Books standing orders (Daueraufträge) for a month, each on its own booking day.
   */
  bookRecurring(statList, monthKey) {
    if (!statList || statList.length === 0) return 0;
    this._pushUndo(statList.length === 1 ? 'Dauerauftrag gebucht' : 'Daueraufträge gebucht');
    const dim = daysInMonth(monthKey);
    const now = new Date().toISOString();
    for (const item of statList) {
      const day = Math.min(item.bookingDay || 1, dim);
      this.state.transactions.push({
        id: uid('tx'),
        type: 'expense',
        date: `${monthKey}-${String(day).padStart(2, '0')}`,
        amount: roundCents(item.budget),
        categoryId: item.category.id,
        fromCategoryId: null,
        toCategoryId: null,
        note: `${item.category.name} (Dauerauftrag)`,
        createdAt: now,
      });
    }
    this._commit();
    return statList.length;
  }
}

export const store = new CashMapStore();

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    store._applyTheme();
  });
}
