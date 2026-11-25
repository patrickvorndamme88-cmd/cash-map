// ==========================================================================
// cash-map — Default Categories, Groups & Realistic 3-Month Demo Generator
// ==========================================================================
//
// Two independent concepts (kept strictly separate everywhere in the app):
//   • GROUP  (category.group)  = WOFÜR das Geld ist  → Fixkosten, Alltag, Rücklagen, Investieren
//   • DAUERAUFTRAG (category.isFixed + bookingDay) = WIE gebucht wird → fester Monatsbetrag,
//     den der Monatsstart-Assistent mit einem Tipp bucht. Kann in JEDER Gruppe vorkommen
//     (z. B. Miete in "Fixkosten", ETF-Sparplan in "Sparen & Investieren").
//   (Das Datenfeld heißt aus Kompatibilitätsgründen mit alten Backups weiterhin `isFixed`.)

import { getCurrentMonthKey, shiftMonthKey, uid } from './format.js';

export const CATEGORY_GROUPS = [
  {
    id: 'fixed',
    label: 'Fixkosten & Abos',
    short: 'Fixkosten',
    color: '#5B8CFF',
    hint: 'Laufende Kosten wie Miete, Verträge & Abos',
  },
  {
    id: 'daily',
    label: 'Alltag & Lifestyle',
    short: 'Alltag',
    color: '#10D99B',
    hint: 'Variable Ausgaben, die du selbst steuerst',
  },
  {
    id: 'reserve',
    label: 'Rücklagen & Puffer',
    short: 'Rücklagen',
    color: '#F5B942',
    hint: 'Geld, das für später angespart wird',
  },
  {
    id: 'invest',
    label: 'Sparen & Investieren',
    short: 'Investieren',
    color: '#A78BFA',
    hint: 'Vermögensaufbau, z. B. ETF- oder Aktiensparplan',
  },
];

export function getGroupMeta(groupId) {
  return CATEGORY_GROUPS.find((g) => g.id === groupId) || CATEGORY_GROUPS[1];
}

// Sensible booking days for the built-in standing orders (used for migrations too)
export const DEFAULT_BOOKING_DAYS = {
  cat_miete: 1,
  cat_aktien: 2,
  cat_fitness: 3,
  cat_handy: 5,
  cat_cloud: 7,
};

export function createDefaultCategories(startMonth = getCurrentMonthKey()) {
  const defs = [
    { id: 'cat_miete', name: 'Miete', icon: 'house', color: '#5B8CFF', group: 'fixed', budget: 950, isFixed: true, goalAmount: null, note: 'Warmmiete inkl. Nebenkosten' },
    { id: 'cat_ernaehrung', name: 'Ernährung & Hygiene', icon: 'cart', color: '#10D99B', group: 'daily', budget: 420, isFixed: false, goalAmount: null, note: 'Supermarkt, Drogerie & Alltag' },
    { id: 'cat_auto', name: 'Auto (Benzin & Reparaturen)', icon: 'car', color: '#F59E0B', group: 'daily', budget: 260, isFixed: false, goalAmount: 1000, note: 'Tanken, Werkstatt, Reifen & TÜV' },
    { id: 'cat_aktien', name: 'Aktiensparplan', icon: 'trending', color: '#A78BFA', group: 'invest', budget: 500, isFixed: true, goalAmount: null, note: 'Monatlicher ETF- & Aktiensparplan' },
    { id: 'cat_ruecklage_fix', name: 'Rücklage jährliche Fixkosten', icon: 'shield', color: '#2DD4BF', group: 'reserve', budget: 180, isFixed: false, goalAmount: 2160, note: 'KFZ-Versicherung, GEZ, Haftpflicht, Steuern' },
    { id: 'cat_kleidung', name: 'Kleidung', icon: 'shirt', color: '#F472B6', group: 'daily', budget: 90, isFixed: false, goalAmount: null, surplusTargetId: null, note: 'Mode, Schuhe & Jacken' },
    { id: 'cat_sauna', name: 'Sauna', icon: 'sauna', color: '#FB7185', group: 'daily', budget: 65, isFixed: false, goalAmount: null, surplusTargetId: 'cat_puffer', note: 'Therme, Sauna & Entspannung' },
    { id: 'cat_fitness', name: 'Fitnessstudio', icon: 'dumbbell', color: '#38BDF8', group: 'fixed', budget: 45, isFixed: true, goalAmount: null, note: 'Monatlicher Mitgliedsbeitrag' },
    { id: 'cat_handy', name: 'Handytarif', icon: 'smartphone', color: '#6366F1', group: 'fixed', budget: 25, isFixed: true, goalAmount: null, note: 'Mobilfunkvertrag' },
    { id: 'cat_cloud', name: 'Cloudspeicher', icon: 'cloud', color: '#84CC16', group: 'fixed', budget: 15, isFixed: true, goalAmount: null, note: 'iCloud+ / Google One / Backup' },
    { id: 'cat_puffer', name: 'Puffer', icon: 'lifebuoy', color: '#F97316', group: 'reserve', budget: 450, isFixed: false, goalAmount: 3000, note: 'Flexibles Sicherheitsnetz & Ungeplantes' },
  ];

  return defs.map((d, idx) => ({
    id: d.id,
    name: d.name,
    icon: d.icon,
    color: d.color,
    group: d.group,
    isFixed: d.isFixed,
    bookingDay: d.isFixed ? (DEFAULT_BOOKING_DAYS[d.id] || 1) : null,
    rollover: true,
    surplusTargetId: d.surplusTargetId || null,
    initialBalance: 0,
    goalAmount: d.goalAmount,
    note: d.note,
    order: idx,
    archived: false,
    budgetHistory: [{ effectiveFrom: startMonth, amount: d.budget }],
  }));
}

export function createInitialState(startMonth = getCurrentMonthKey(), netSalary = 3000) {
  return {
    schemaVersion: 1,
    settings: {
      theme: 'auto', // 'auto' | 'dark' | 'light'
      privacyMode: false,
      startMonth,
      onboardingCompleted: false,
      lastBackupAt: null,
      installHintDismissed: false,
      recapDismissed: null,
      backupReminderSnoozedAt: null,
    },
    salaryHistory: [{ effectiveFrom: startMonth, amount: netSalary }],
    salaryOverrides: {},
    categories: createDefaultCategories(startMonth),
    transactions: [],
  };
}

/**
 * Generates 3 realistic months of sample data ending in the current month
 * so the user can immediately experience filled category pots, rollover math,
 * Sankey flow diagrams, monthly recap and trends — and wipe it with 1 tap anytime.
 */
export function createDemoState() {
  const cur = getCurrentMonthKey();
  const todayDay = new Date().getDate();
  const mMinus2 = shiftMonthKey(cur, -2);
  const mMinus1 = shiftMonthKey(cur, -1);

  const state = createInitialState(mMinus2, 3000);
  state.settings.onboardingCompleted = true;

  const ruecklage = state.categories.find((c) => c.id === 'cat_ruecklage_fix');
  if (ruecklage) ruecklage.initialBalance = 360;
  const puffer = state.categories.find((c) => c.id === 'cat_puffer');
  if (puffer) puffer.initialBalance = 250;

  const txs = [];
  const addExp = (monthKey, day, categoryId, amount, note) => {
    // Never create demo bookings in the future of the current month
    const safeDay = monthKey === cur ? Math.min(day, todayDay) : day;
    txs.push({
      id: uid('tx'),
      type: 'expense',
      date: `${monthKey}-${String(safeDay).padStart(2, '0')}`,
      amount,
      categoryId,
      note,
      createdAt: new Date().toISOString(),
    });
  };

  const addStandingOrders = (m) => {
    addExp(m, 1, 'cat_miete', 950, 'Miete (Dauerauftrag)');
    addExp(m, 2, 'cat_aktien', 500, 'Aktiensparplan (Dauerauftrag)');
    addExp(m, 3, 'cat_fitness', 45, 'Fitnessstudio (Dauerauftrag)');
    addExp(m, 5, 'cat_handy', 25, 'Handytarif (Dauerauftrag)');
    addExp(m, 7, 'cat_cloud', 15, 'Cloudspeicher (Dauerauftrag)');
  };

  // ---- Month -2 ----
  addStandingOrders(mMinus2);
  addExp(mMinus2, 4, 'cat_ernaehrung', 112.4, 'REWE Wocheneinkauf');
  addExp(mMinus2, 11, 'cat_ernaehrung', 89.2, 'Edeka & dm Drogerie');
  addExp(mMinus2, 18, 'cat_ernaehrung', 104.8, 'Wocheneinkauf');
  addExp(mMinus2, 25, 'cat_ernaehrung', 86.5, 'Supermarkt & Bäcker');
  addExp(mMinus2, 9, 'cat_auto', 78.5, 'Tanken Super E10');
  addExp(mMinus2, 22, 'cat_auto', 74.2, 'Tanken');
  addExp(mMinus2, 14, 'cat_sauna', 34.0, 'Abendtarif Therme');
  addExp(mMinus2, 20, 'cat_puffer', 62.0, 'Geburtstagsgeschenk');

  // ---- Month -1 ----
  addStandingOrders(mMinus1);
  addExp(mMinus1, 3, 'cat_ernaehrung', 118.9, 'REWE Großeinkauf');
  addExp(mMinus1, 10, 'cat_ernaehrung', 95.3, 'Aldi & Rossmann');
  addExp(mMinus1, 17, 'cat_ernaehrung', 124.6, 'Wocheneinkauf + Gäste');
  addExp(mMinus1, 24, 'cat_ernaehrung', 98.4, 'Edeka');
  addExp(mMinus1, 8, 'cat_auto', 82.0, 'Tanken');
  addExp(mMinus1, 19, 'cat_auto', 69.5, 'Tanken & Waschanlage');
  addExp(mMinus1, 15, 'cat_kleidung', 139.0, 'Herbstjacke & Pullover');
  addExp(mMinus1, 12, 'cat_ruecklage_fix', 55.08, 'Rundfunkbeitrag Quartal');
  addExp(mMinus1, 27, 'cat_puffer', 115.0, 'Zahnreinigung');

  // ---- Current month (Miete & Sparplan booked; Fitness/Handy/Cloud still open) ----
  addExp(cur, 1, 'cat_miete', 950, 'Miete (Dauerauftrag)');
  addExp(cur, 2, 'cat_aktien', 500, 'Aktiensparplan (Dauerauftrag)');
  addExp(cur, 4, 'cat_ernaehrung', 108.6, 'REWE Wocheneinkauf');
  addExp(cur, 11, 'cat_ernaehrung', 84.3, 'dm & Supermarkt');
  addExp(cur, 18, 'cat_ernaehrung', 96.4, 'Wocheneinkauf');
  addExp(cur, 9, 'cat_auto', 76.8, 'Tanken');
  addExp(cur, 16, 'cat_sauna', 42.0, 'Tageskarte Sauna & Aufguss');
  addExp(cur, 14, 'cat_kleidung', 49.9, 'Sneaker im Sale');

  txs.push({
    id: uid('tx'),
    type: 'income',
    date: `${mMinus1}-21`,
    amount: 140,
    categoryId: null,
    note: 'Verkauf alte Kopfhörer',
    createdAt: new Date().toISOString(),
  });

  state.transactions = txs;
  return state;
}
