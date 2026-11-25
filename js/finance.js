// ==========================================================================
// cash-map — Core Financial Engine (Pure, Deterministic, Cent-Accurate)
// ==========================================================================

import {
  roundCents,
  compareMonthKeys,
  listMonthsBetween,
  shiftMonthKey,
  monthKeyFromDate,
  getCurrentMonthKey,
  daysInMonth,
} from './format.js';
import { CATEGORY_GROUPS } from './defaults.js';

/**
 * Resolves an effective value from a sorted history array [{ effectiveFrom: 'YYYY-MM', amount }]
 */
export function resolveHistoryValue(history, monthKey, fallback = 0) {
  if (!Array.isArray(history) || history.length === 0) return roundCents(fallback);
  const sorted = [...history].sort((a, b) => compareMonthKeys(a.effectiveFrom, b.effectiveFrom));
  let chosen = sorted[0].amount;
  for (const entry of sorted) {
    if (compareMonthKeys(entry.effectiveFrom, monthKey) <= 0) {
      chosen = entry.amount;
    } else {
      break;
    }
  }
  return roundCents(chosen);
}

export function getEffectiveSalary(state, monthKey) {
  if (state.salaryOverrides && Object.prototype.hasOwnProperty.call(state.salaryOverrides, monthKey)) {
    return roundCents(state.salaryOverrides[monthKey]);
  }
  return resolveHistoryValue(state.salaryHistory, monthKey, 0);
}

export function isSalaryOverridden(state, monthKey) {
  return Boolean(state.salaryOverrides && Object.prototype.hasOwnProperty.call(state.salaryOverrides, monthKey));
}

export function getEffectiveBudget(category, monthKey) {
  return resolveHistoryValue(category.budgetHistory, monthKey, 0);
}

/**
 * Finds the earliest active month from settings.startMonth and existing transactions.
 */
export function getTimelineStartMonth(state) {
  let earliest = state.settings?.startMonth || getCurrentMonthKey();
  for (const tx of state.transactions || []) {
    if (!tx.date) continue;
    const mk = monthKeyFromDate(tx.date);
    if (compareMonthKeys(mk, earliest) < 0) {
      earliest = mk;
    }
  }
  return earliest;
}

/**
 * Groups transactions by monthKey for O(N) single-pass chronological evaluation.
 */
function indexTransactionsByMonth(transactions) {
  const byMonth = new Map();
  for (const tx of transactions || []) {
    if (!tx || !tx.date) continue;
    const mk = monthKeyFromDate(tx.date);
    if (!byMonth.has(mk)) byMonth.set(mk, []);
    byMonth.get(mk).push(tx);
  }
  return byMonth;
}

/**
 * Computes full financial snapshot for a specific monthKey, including exact
 * cumulative rollover balances (Kategoriekonten) carried from timeline start.
 */
export function computeMonthSnapshot(state, targetMonth) {
  const categories = [...(state.categories || [])]
    .filter((c) => !c.archived)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const txByMonth = indexTransactionsByMonth(state.transactions);
  const timelineStart = getTimelineStartMonth(state);

  const isBeforeTimeline = compareMonthKeys(targetMonth, timelineStart) < 0;
  const monthsToWalk = isBeforeTimeline
    ? [targetMonth]
    : listMonthsBetween(timelineStart, targetMonth);

  // Initialize running pot balances per category
  const runningPot = new Map();
  for (const cat of categories) {
    runningPot.set(cat.id, isBeforeTimeline ? 0 : roundCents(cat.initialBalance || 0));
  }

  let finalCategoryStats = [];
  let finalMonthTxs = [];

  for (const mk of monthsToWalk) {
    const monthTxs = txByMonth.get(mk) || [];

    // Aggregate per-category figures for this month
    const spentMap = new Map();
    const catIncomeMap = new Map();
    const transferInMap = new Map();
    const transferOutMap = new Map();
    const txCountMap = new Map();

    for (const tx of monthTxs) {
      const amt = roundCents(tx.amount || 0);
      if (tx.type === 'expense' && tx.categoryId) {
        spentMap.set(tx.categoryId, roundCents((spentMap.get(tx.categoryId) || 0) + amt));
        txCountMap.set(tx.categoryId, (txCountMap.get(tx.categoryId) || 0) + 1);
      } else if (tx.type === 'income' && tx.categoryId) {
        catIncomeMap.set(tx.categoryId, roundCents((catIncomeMap.get(tx.categoryId) || 0) + amt));
        txCountMap.set(tx.categoryId, (txCountMap.get(tx.categoryId) || 0) + 1);
      } else if (tx.type === 'transfer') {
        if (tx.fromCategoryId) {
          transferOutMap.set(tx.fromCategoryId, roundCents((transferOutMap.get(tx.fromCategoryId) || 0) + amt));
          txCountMap.set(tx.fromCategoryId, (txCountMap.get(tx.fromCategoryId) || 0) + 1);
        }
        if (tx.toCategoryId) {
          transferInMap.set(tx.toCategoryId, roundCents((transferInMap.get(tx.toCategoryId) || 0) + amt));
          txCountMap.set(tx.toCategoryId, (txCountMap.get(tx.toCategoryId) || 0) + 1);
        }
      }
    }

    const statsThisMonth = [];

    for (const cat of categories) {
      const prevPot = runningPot.get(cat.id) ?? 0;
      const carryIn = cat.rollover ? prevPot : 0;
      const budget = getEffectiveBudget(cat, mk);
      const spent = spentMap.get(cat.id) || 0;
      const catIncome = catIncomeMap.get(cat.id) || 0;
      const transfersIn = transferInMap.get(cat.id) || 0;
      const transfersOut = transferOutMap.get(cat.id) || 0;
      const netTransfers = roundCents(transfersIn - transfersOut);

      // Net outflow for this category in this month (refunds reduce net spending)
      const netSpent = roundCents(spent - catIncome);
      // Monthly difference: positive = under budget (surplus), negative = over budget
      const monthDiff = roundCents(budget - netSpent);
      // Cumulative category account balance (Kategoriekonto)
      const potBalance = roundCents(carryIn + monthDiff + netTransfers);

      runningPot.set(cat.id, potBalance);

      if (mk === targetMonth) {
        const spentPct = budget > 0 ? Math.max(0, (netSpent / budget) * 100) : (netSpent > 0 ? 100 : 0);
        const goalPct = cat.goalAmount && cat.goalAmount > 0
          ? Math.max(0, Math.min(100, (potBalance / cat.goalAmount) * 100))
          : null;

        statsThisMonth.push({
          category: cat,
          monthKey: mk,
          carryIn,
          budget,
          spent,
          catIncome,
          netSpent,
          transfersIn,
          transfersOut,
          netTransfers,
          monthDiff,
          potBalance,
          spentPct,
          goalPct,
          txCount: txCountMap.get(cat.id) || 0,
        });
      }
    }

    if (mk === targetMonth) {
      finalCategoryStats = statsThisMonth;
      finalMonthTxs = [...monthTxs].sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
    }
  }

  // Monthly totals
  const salary = getEffectiveSalary(state, targetMonth);
  let generalExtraIncome = 0;
  let totalCategoryIncome = 0;
  let totalSpent = 0;

  for (const tx of finalMonthTxs) {
    const amt = roundCents(tx.amount || 0);
    if (tx.type === 'income') {
      if (tx.categoryId) totalCategoryIncome = roundCents(totalCategoryIncome + amt);
      else generalExtraIncome = roundCents(generalExtraIncome + amt);
    } else if (tx.type === 'expense') {
      totalSpent = roundCents(totalSpent + amt);
    }
  }

  const totalIncome = roundCents(salary + generalExtraIncome);
  const netOutflow = roundCents(totalSpent - totalCategoryIncome);
  const totalBudgeted = roundCents(finalCategoryStats.reduce((sum, s) => sum + s.budget, 0));
  const unallocatedSalary = roundCents(salary - totalBudgeted);
  const totalMonthDiff = roundCents(totalBudgeted - netOutflow);
  const monthlyCashflowDiff = roundCents(totalIncome - netOutflow);
  const totalPotBalance = roundCents(finalCategoryStats.reduce((sum, s) => sum + s.potBalance, 0));
  const positivePotTotal = roundCents(
    finalCategoryStats.reduce((sum, s) => sum + Math.max(0, s.potBalance), 0)
  );
  const negativePotTotal = roundCents(
    finalCategoryStats.reduce((sum, s) => sum + Math.min(0, s.potBalance), 0)
  );

  // Investment & savings rate (counts 'invest' group spending as wealth-building!)
  const investedThisMonth = roundCents(
    finalCategoryStats
      .filter((s) => s.category.group === 'invest')
      .reduce((sum, s) => sum + Math.max(0, s.netSpent), 0)
  );
  const wealthAdded = roundCents(monthlyCashflowDiff + investedThisMonth);
  const savingsRate = totalIncome > 0 ? (wealthAdded / totalIncome) * 100 : 0;

  // Unbooked recurring fixed categories in this month (1-Tap Fixkosten Assistent)
  const unbookedFixed = finalCategoryStats.filter(
    (s) => s.category.isFixed && s.budget > 0 && s.spent === 0
  );
  const unbookedFixedTotal = roundCents(unbookedFixed.reduce((sum, s) => sum + s.budget, 0));

  // Current month pace indicator (percentage of days elapsed in current month)
  let monthPace = null;
  if (targetMonth === getCurrentMonthKey()) {
    const today = new Date();
    const totalDays = daysInMonth(targetMonth);
    monthPace = Math.min(100, Math.max(2, (today.getDate() / totalDays) * 100));
  }

  // Group summaries
  const groupSummaries = CATEGORY_GROUPS.map((g) => {
    const items = finalCategoryStats.filter((s) => s.category.group === g.id);
    const budget = roundCents(items.reduce((a, b) => a + b.budget, 0));
    const netSpentVal = roundCents(items.reduce((a, b) => a + b.netSpent, 0));
    const diff = roundCents(items.reduce((a, b) => a + b.monthDiff, 0));
    const pot = roundCents(items.reduce((a, b) => a + b.potBalance, 0));
    return {
      ...g,
      items,
      budget,
      netSpent: netSpentVal,
      diff,
      pot,
    };
  }).filter((g) => g.items.length > 0);

  return {
    monthKey: targetMonth,
    salary,
    salaryOverridden: isSalaryOverridden(state, targetMonth),
    generalExtraIncome,
    totalCategoryIncome,
    totalIncome,
    totalBudgeted,
    unallocatedSalary,
    totalSpent,
    netOutflow,
    totalMonthDiff,
    monthlyCashflowDiff,
    totalPotBalance,
    positivePotTotal,
    negativePotTotal,
    investedThisMonth,
    wealthAdded,
    savingsRate,
    monthPace,
    unbookedFixed,
    unbookedFixedTotal,
    categories: finalCategoryStats,
    groups: groupSummaries,
    transactions: finalMonthTxs,
  };
}

/**
 * Computes snapshots for the last `count` months ending at `endMonthKey` (chronological order).
 */
export function computeHistorySeries(state, endMonthKey, count = 6) {
  const months = [];
  for (let i = count - 1; i >= 0; i--) {
    months.push(shiftMonthKey(endMonthKey, -i));
  }
  return months.map((mk) => computeMonthSnapshot(state, mk));
}

/**
 * Computes a single category's 6-month trajectory for the Category Detail Sheet.
 */
export function computeCategoryHistory(state, categoryId, endMonthKey, count = 6) {
  const series = computeHistorySeries(state, endMonthKey, count);
  return series.map((snap) => {
    const stat = snap.categories.find((c) => c.category.id === categoryId);
    return {
      monthKey: snap.monthKey,
      budget: stat ? stat.budget : 0,
      netSpent: stat ? stat.netSpent : 0,
      monthDiff: stat ? stat.monthDiff : 0,
      potBalance: stat ? stat.potBalance : 0,
    };
  });
}
