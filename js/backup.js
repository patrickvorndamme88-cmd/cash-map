// ==========================================================================
// cash-map — JSON Backup Export, Validation & Safe Restore
// ==========================================================================

import { getTodayISO, roundCents, getCurrentMonthKey } from './format.js';

export const BACKUP_FORMAT_VERSION = 1;

/**
 * Creates the full portable JSON backup payload containing all settings,
 * salary history, category budgets/configs, and transactions.
 */
export function buildBackupPayload(state) {
  return {
    app: 'cash-map',
    backupVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      schemaVersion: state.schemaVersion || 1,
      settings: { ...state.settings },
      salaryHistory: state.salaryHistory || [],
      salaryOverrides: state.salaryOverrides || {},
      categories: state.categories || [],
      transactions: state.transactions || [],
    },
  };
}

export function serializeBackup(state) {
  return JSON.stringify(buildBackupPayload(state), null, 2);
}

/**
 * Exports JSON backup file. On iPhone Safari/PWA, uses native Share Sheet
 * when file-sharing is supported (allows direct save to iCloud Drive / Files),
 * with automatic seamless fallback to standard browser download.
 */
export async function exportBackupFile(state, { preferShare = false } = {}) {
  const filename = `cash-map-backup-${getTodayISO()}.json`;
  const json = serializeBackup(state);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });

  if (preferShare && typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: 'application/json' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'cash-map Datensicherung',
          text: `Datensicherung vom ${getTodayISO()}`,
          files: [file],
        });
        return { method: 'share', filename };
      }
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return { method: 'cancelled', filename };
      }
      // Fall through to standard download
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 400);

  return { method: 'download', filename };
}

/**
 * Copies full JSON backup text directly to clipboard (handy iOS Notes fallback).
 */
export async function copyBackupToClipboard(state) {
  const json = serializeBackup(state);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(json);
    return true;
  }
  const ta = document.createElement('textarea');
  ta.value = json;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  return true;
}

/**
 * Validates and normalizes an imported JSON string.
 * Returns { ok: true, state, summary } or { ok: false, error }.
 */
export function parseAndValidateBackup(rawText) {
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      error: 'Die Datei ist kein gültiges JSON-Format. Bitte wähle eine echte cash-map Backup-Datei.',
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Leere oder ungültige Backup-Struktur.' };
  }

  // Support both wrapped envelope ({ app: 'cash-map', data: {...} }) and raw state object
  const payload = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;

  if (!Array.isArray(payload.categories) || payload.categories.length === 0) {
    return {
      ok: false,
      error: 'Keine Kategorien im Backup gefunden. Handelt es sich um eine cash-map Datensicherung?',
    };
  }

  if (!Array.isArray(payload.transactions)) {
    return {
      ok: false,
      error: 'Das Buchungsfeld fehlt oder ist beschädigt.',
    };
  }

  const defaultMonth = payload.settings?.startMonth || getCurrentMonthKey();

  // Normalize categories cleanly
  const normalizedCategories = payload.categories.map((c, idx) => {
    const budgetHist = Array.isArray(c.budgetHistory) && c.budgetHistory.length > 0
      ? c.budgetHistory.map((b) => ({
          effectiveFrom: String(b.effectiveFrom || defaultMonth).slice(0, 7),
          amount: roundCents(Number(b.amount) || 0),
        }))
      : [{ effectiveFrom: defaultMonth, amount: roundCents(Number(c.monthlyBudget) || 0) }];

    return {
      id: String(c.id || `cat_imp_${idx}`),
      name: String(c.name || `Kategorie ${idx + 1}`).slice(0, 60),
      icon: String(c.icon || 'wallet'),
      color: String(c.color || '#5B8CFF'),
      group: ['fixed', 'daily', 'reserve', 'invest'].includes(c.group) ? c.group : 'daily',
      isFixed: Boolean(c.isFixed),
      rollover: c.rollover !== false,
      initialBalance: roundCents(Number(c.initialBalance) || 0),
      goalAmount: c.goalAmount && Number(c.goalAmount) > 0 ? roundCents(Number(c.goalAmount)) : null,
      note: String(c.note || ''),
      order: typeof c.order === 'number' ? c.order : idx,
      archived: Boolean(c.archived),
      budgetHistory: budgetHist,
    };
  });

  // Normalize transactions
  const normalizedTransactions = payload.transactions
    .filter((t) => t && typeof t === 'object' && t.date && Number.isFinite(Number(t.amount)))
    .map((t, idx) => ({
      id: String(t.id || `tx_imp_${idx}`),
      type: ['expense', 'income', 'transfer'].includes(t.type) ? t.type : 'expense',
      date: String(t.date).slice(0, 10),
      amount: roundCents(Math.abs(Number(t.amount))),
      categoryId: t.categoryId ? String(t.categoryId) : null,
      fromCategoryId: t.fromCategoryId ? String(t.fromCategoryId) : null,
      toCategoryId: t.toCategoryId ? String(t.toCategoryId) : null,
      note: String(t.note || ''),
      createdAt: t.createdAt || new Date().toISOString(),
    }));

  // Normalize salary history
  const normalizedSalaryHistory = Array.isArray(payload.salaryHistory) && payload.salaryHistory.length > 0
    ? payload.salaryHistory.map((s) => ({
        effectiveFrom: String(s.effectiveFrom || defaultMonth).slice(0, 7),
        amount: roundCents(Number(s.amount) || 0),
      }))
    : [{ effectiveFrom: defaultMonth, amount: roundCents(Number(payload.netSalary) || 3000) }];

  const normalizedOverrides = {};
  if (payload.salaryOverrides && typeof payload.salaryOverrides === 'object') {
    for (const [k, v] of Object.entries(payload.salaryOverrides)) {
      if (/^\d{4}-\d{2}$/.test(k) && Number.isFinite(Number(v))) {
        normalizedOverrides[k] = roundCents(Number(v));
      }
    }
  }

  const normalizedState = {
    schemaVersion: 1,
    settings: {
      theme: ['auto', 'dark', 'light'].includes(payload.settings?.theme) ? payload.settings.theme : 'auto',
      privacyMode: Boolean(payload.settings?.privacyMode),
      startMonth: defaultMonth,
      onboardingCompleted: true,
      lastBackupAt: parsed.exportedAt || payload.settings?.lastBackupAt || new Date().toISOString(),
      installHintDismissed: Boolean(payload.settings?.installHintDismissed),
    },
    salaryHistory: normalizedSalaryHistory,
    salaryOverrides: normalizedOverrides,
    categories: normalizedCategories,
    transactions: normalizedTransactions,
  };

  const activeCategories = normalizedCategories.filter((c) => !c.archived);
  const latestSalary = normalizedSalaryHistory[normalizedSalaryHistory.length - 1]?.amount || 0;

  return {
    ok: true,
    state: normalizedState,
    summary: {
      exportedAt: parsed.exportedAt || null,
      categoryCount: activeCategories.length,
      transactionCount: normalizedTransactions.length,
      latestSalary,
      startMonth: defaultMonth,
    },
  };
}
