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

/** How far into the future the user may navigate for planning. */
export const FUTURE_PLANNING_MONTHS = 12;

/**
 * Resolves an effective value from a history array [{ effectiveFrom: 'YYYY-MM', amount }]
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

export function getBookingDay(category) {
  const d = Math.round(Number(category?.bookingDay) || 1);
  return Math.min(28, Math.max(1, d));
}

/**
 * Earliest active month = settings.startMonth (or an earlier transaction, if any exists).
 */
export function getTimelineStartMonth(state) {
  let earliest = state.settings?.startMonth || getCurrentMonthKey();
  for (const tx of state.transactions || []) {
    if (!tx.date) continue;
    const mk = monthKeyFromDate(tx.date);
    if (compareMonthKeys(mk, earliest) < 0) earliest = mk;
  }
  return earliest;
}

/**
 * Navigable month range: from tracking start up to 12 months into the future.
 */
export function getMonthBounds(state) {
  const min = getTimelineStartMonth(state);
  let max = shiftMonthKey(getCurrentMonthKey(), FUTURE_PLANNING_MONTHS);
  if (compareMonthKeys(min, max) > 0) max = min;
  return { min, max };
}

export function clampMonthKey(state, monthKey) {
  const { min, max } = getMonthBounds(state);
  if (compareMonthKeys(monthKey, min) < 0) return min;
  if (compareMonthKeys(monthKey, max) > 0) return max;
  return monthKey;
}

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
 * Resolves valid surplus forwarding target category (if configured & active).
 */
export function resolveSurplusTarget(cat, activeCatMap) {
  const tid = cat?.surplusTargetId;
  if (!tid || tid === cat.id) return null;
  return activeCatMap.get(tid) || null;
}

/**
 * Computes the full financial snapshot for `targetMonth`, including exact
 * cumulative rollover balances (Kategoriekonten) AND automatic month-end
 * surplus sweeps (`surplusTargetId`, e.g. unused Sauna budget -> Puffer).
 */
export function computeMonthSnapshot(state, targetMonth) {
  const categories = [...(state.categories || [])]
    .filter((c) => !c.archived)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const activeCatMap = new Map(categories.map((c) => [c.id, c]));
  const txByMonth = indexTransactionsByMonth(state.transactions);
  const timelineStart = getTimelineStartMonth(state);
  const currentKey = getCurrentMonthKey();

  const isBeforeTimeline = compareMonthKeys(targetMonth, timelineStart) < 0;
  const monthsToWalk = isBeforeTimeline ? [targetMonth] : listMonthsBetween(timelineStart, targetMonth);

  const runningPot = new Map();
  for (const cat of categories) {
    runningPot.set(cat.id, isBeforeTimeline ? 0 : roundCents(cat.initialBalance || 0));
  }

  let cumulativeInvested = 0;
  let finalCategoryStats = [];
  let finalMonthTxs = [];

  for (let mIdx = 0; mIdx < monthsToWalk.length; mIdx++) {
    const mk = monthsToWalk[mIdx];
    const isFirstWalkMonth = mIdx === 0;
    const monthTxs = txByMonth.get(mk) || [];
    const isFutureMonth = compareMonthKeys(mk, currentKey) > 0;

    // 1. Compute month-boundary surplus sweeps from the END of the previous month (mIdx - 1)
    const ownCarryMap = new Map();
    const sweptInSourcesMap = new Map(); // catId -> [{ categoryId, name, amount }]

    if (isFirstWalkMonth) {
      for (const cat of categories) {
        ownCarryMap.set(cat.id, cat.rollover ? (runningPot.get(cat.id) ?? 0) : 0);
      }
    } else {
      for (const cat of categories) {
        const prevEnd = runningPot.get(cat.id) ?? 0;
        const targetCat = resolveSurplusTarget(cat, activeCatMap);

        if (targetCat) {
          if (prevEnd > 0.005) {
            // Positive leftover sweeps into targetCat! This category starts fresh at 0 €.
            ownCarryMap.set(cat.id, 0);
            if (!sweptInSourcesMap.has(targetCat.id)) sweptInSourcesMap.set(targetCat.id, []);
            sweptInSourcesMap.get(targetCat.id).push({
              categoryId: cat.id,
              name: cat.name,
              amount: prevEnd,
            });
          } else {
            // Zero or negative balance: keep deficit visible on this category (if rollover !== false)
            ownCarryMap.set(cat.id, cat.rollover !== false ? prevEnd : 0);
          }
        } else {
          ownCarryMap.set(cat.id, cat.rollover ? prevEnd : 0);
        }
      }
    }

    // 2. Aggregate transactions in month `mk`
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
      const ownCarryIn = ownCarryMap.get(cat.id) ?? 0;
      const sweptInSources = sweptInSourcesMap.get(cat.id) || [];
      const sweptIn = roundCents(sweptInSources.reduce((s, x) => s + x.amount, 0));
      const carryIn = roundCents(ownCarryIn + sweptIn);

      const budget = getEffectiveBudget(cat, mk);
      const actualSpent = spentMap.get(cat.id) || 0;
      const hasActivity = txCountMap.has(cat.id);
      const isCleanFutureStart = mk === timelineStart && compareMonthKeys(timelineStart, currentKey) > 0;
      const isProjected = isFutureMonth && !isCleanFutureStart && !hasActivity && cat.group !== 'reserve' && budget > 0;
      const spent = isProjected ? budget : actualSpent;
      const catIncome = catIncomeMap.get(cat.id) || 0;
      const transfersIn = transferInMap.get(cat.id) || 0;
      const transfersOut = transferOutMap.get(cat.id) || 0;
      const netTransfers = roundCents(transfersIn - transfersOut);

      const netSpent = roundCents(spent - catIncome);
      const monthDiff = roundCents(budget - netSpent);
      const potBalance = roundCents(carryIn + monthDiff + netTransfers);

      runningPot.set(cat.id, potBalance);
      if (cat.group === 'invest') {
        cumulativeInvested = roundCents(cumulativeInvested + Math.max(0, netSpent));
      }

      if (mk === targetMonth) {
        const surplusTarget = resolveSurplusTarget(cat, activeCatMap);
        const sweepPreviewAmount = surplusTarget && potBalance > 0.005 ? potBalance : 0;
        const spentPct = budget > 0 ? Math.max(0, (netSpent / budget) * 100) : (netSpent > 0 ? 100 : 0);
        const goalPct = cat.goalAmount && cat.goalAmount > 0
          ? Math.max(0, Math.min(100, (potBalance / cat.goalAmount) * 100))
          : null;
        const isRecurring = Boolean(cat.isFixed);

        statsThisMonth.push({
          category: cat,
          monthKey: mk,
          ownCarryIn,
          sweptIn,
          sweptInSources,
          carryIn,
          surplusTarget,
          sweepPreviewAmount,
          budget,
          spent,
          actualSpent,
          catIncome,
          netSpent,
          transfersIn,
          transfersOut,
          netTransfers,
          monthDiff,
          potBalance,
          spentPct,
          goalPct,
          isProjected,
          isRecurring,
          bookingDay: isRecurring ? getBookingDay(cat) : null,
          isBooked: isRecurring && actualSpent > 0,
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

  const isFuture = compareMonthKeys(targetMonth, currentKey) > 0;
  const isCurrent = targetMonth === currentKey;
  const isCleanFutureStart = isFuture && targetMonth === timelineStart;

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

  const projectedSpent = roundCents(
    finalCategoryStats.filter((s) => s.isProjected).reduce((sum, s) => sum + s.spent, 0)
  );
  totalSpent = roundCents(totalSpent + projectedSpent);

  const totalIncome = roundCents(salary + generalExtraIncome);
  const netOutflow = roundCents(totalSpent - totalCategoryIncome);
  const totalBudgeted = roundCents(finalCategoryStats.reduce((sum, s) => sum + s.budget, 0));
  const unallocatedSalary = roundCents(salary - totalBudgeted);
  const totalMonthDiff = roundCents(totalBudgeted - netOutflow);
  const monthlyCashflowDiff = roundCents(totalIncome - netOutflow);
  const totalPotBalance = roundCents(finalCategoryStats.reduce((sum, s) => sum + s.potBalance, 0));
  const positivePotTotal = roundCents(finalCategoryStats.reduce((sum, s) => sum + Math.max(0, s.potBalance), 0));
  const negativePotTotal = roundCents(finalCategoryStats.reduce((sum, s) => sum + Math.min(0, s.potBalance), 0));

  const investedThisMonth = roundCents(
    finalCategoryStats
      .filter((s) => s.category.group === 'invest')
      .reduce((sum, s) => sum + Math.max(0, s.netSpent), 0)
  );
  const wealthAdded = roundCents(monthlyCashflowDiff + investedThisMonth);
  const savingsRate = totalIncome > 0 ? (wealthAdded / totalIncome) * 100 : 0;

  const allowBooking = !isFuture || (targetMonth === timelineStart && compareMonthKeys(timelineStart, currentKey) > 0);
  const unbookedRecurring = !allowBooking
    ? []
    : finalCategoryStats
        .filter((s) => s.isRecurring && s.budget > 0 && s.actualSpent === 0)
        .sort((a, b) => a.bookingDay - b.bookingDay);
  const unbookedRecurringTotal = roundCents(unbookedRecurring.reduce((sum, s) => sum + s.budget, 0));

  let monthPace = null;
  let dailyAllowance = null;
  if (isCurrent) {
    const today = new Date();
    const totalDays = daysInMonth(targetMonth);
    monthPace = Math.min(100, Math.max(2, (today.getDate() / totalDays) * 100));

    const flex = finalCategoryStats.filter((s) => s.category.group === 'daily' && !s.isRecurring && s.budget > 0);
    if (flex.length > 0) {
      const daysLeft = Math.max(1, totalDays - today.getDate() + 1);
      const flexBudget = roundCents(flex.reduce((sum, s) => sum + s.budget, 0));
      const flexSpent = roundCents(flex.reduce((sum, s) => sum + s.netSpent, 0));
      const remaining = Math.max(0, roundCents(flexBudget - flexSpent));
      dailyAllowance = {
        remaining,
        daysLeft,
        perDay: roundCents(remaining / daysLeft),
        budget: flexBudget,
      };
    }
  }

  const groupSummaries = CATEGORY_GROUPS.map((g) => {
    const items = finalCategoryStats.filter((s) => s.category.group === g.id);
    return {
      ...g,
      items,
      budget: roundCents(items.reduce((a, b) => a + b.budget, 0)),
      netSpent: roundCents(items.reduce((a, b) => a + b.netSpent, 0)),
      diff: roundCents(items.reduce((a, b) => a + b.monthDiff, 0)),
      pot: roundCents(items.reduce((a, b) => a + b.potBalance, 0)),
    };
  }).filter((g) => g.items.length > 0);

  return {
    monthKey: targetMonth,
    isFuture,
    isCurrent,
    isCleanFutureStart,
    salary,
    salaryOverridden: isSalaryOverridden(state, targetMonth),
    generalExtraIncome,
    totalCategoryIncome,
    totalIncome,
    totalBudgeted,
    unallocatedSalary,
    totalSpent,
    projectedSpent,
    netOutflow,
    totalMonthDiff,
    monthlyCashflowDiff,
    totalPotBalance,
    positivePotTotal,
    negativePotTotal,
    investedThisMonth,
    cumulativeInvested,
    wealthAdded,
    savingsRate,
    monthPace,
    dailyAllowance,
    unbookedRecurring,
    unbookedRecurringTotal,
    categories: finalCategoryStats,
    groups: groupSummaries,
    transactions: finalMonthTxs,
  };
}

/**
 * Snapshots for the last `count` months ending at `endMonthKey` (chronological),
 * never reaching back before the tracking start.
 */
export function computeHistorySeries(state, endMonthKey, count = 6) {
  const start = getTimelineStartMonth(state);
  const months = [];
  for (let i = count - 1; i >= 0; i--) {
    const mk = shiftMonthKey(endMonthKey, -i);
    if (compareMonthKeys(mk, start) >= 0) months.push(mk);
  }
  if (months.length === 0) months.push(endMonthKey);
  return months.map((mk) => computeMonthSnapshot(state, mk));
}

export function computeCategoryHistory(state, categoryId, endMonthKey, count = 6) {
  return computeHistorySeries(state, endMonthKey, count).map((snap) => {
    const stat = snap.categories.find((c) => c.category.id === categoryId);
    return {
      monthKey: snap.monthKey,
      budget: stat ? stat.budget : 0,
      netSpent: stat ? stat.netSpent : 0,
      monthDiff: stat ? stat.monthDiff : 0,
      sweptIn: stat ? stat.sweptIn : 0,
      potBalance: stat ? stat.potBalance : 0,
      isProjected: stat ? stat.isProjected : false,
    };
  });
}

/**
 * Monthly recap ("Rückblick") for a finished month.
 */
export function computeMonthRecap(state, monthKey) {
  const snapshot = computeMonthSnapshot(state, monthKey);
  const withBudget = snapshot.categories.filter((s) => s.budget > 0);
  const onPlan = withBudget.filter((s) => s.monthDiff >= -0.005).length;
  const activeSaved = [...snapshot.categories]
    .filter((s) => !s.isRecurring && s.category.group !== 'reserve' && s.monthDiff > 0)
    .sort((a, b) => b.monthDiff - a.monthDiff);
  const reserveSaved = [...snapshot.categories]
    .filter((s) => !s.isRecurring && s.monthDiff > 0)
    .sort((a, b) => b.monthDiff - a.monthDiff);
  const best = activeSaved[0] || reserveSaved[0] || null;
  return { snapshot, onPlan, total: withBudget.length, best };
}
