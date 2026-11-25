// ==========================================================================
// cash-map — Tab 2: Transactions (Search, Filters, Date-Grouped Timeline)
// ==========================================================================

import { icon } from '../icons.js';
import { formatMoney, formatDateGroupLabel, formatMonthLong, escapeHtml, roundCents } from '../format.js';

export function renderTransactionsResults(state, ui, snapshot) {
  const privacy = state.settings.privacyMode;
  const catMap = new Map(state.categories.map((c) => [c.id, c]));

  const query = (ui.txSearch || '').trim().toLowerCase();
  const typeFilter = ui.txTypeFilter || 'all';
  const catFilter = ui.txCategoryFilter || 'all';

  const filtered = snapshot.transactions.filter((tx) => {
    if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
    if (catFilter !== 'all') {
      const matchesCat = tx.categoryId === catFilter || tx.fromCategoryId === catFilter || tx.toCategoryId === catFilter;
      if (!matchesCat) return false;
    }
    if (query) {
      const cat = catMap.get(tx.categoryId);
      const fromCat = catMap.get(tx.fromCategoryId);
      const toCat = catMap.get(tx.toCategoryId);
      const hay = `${tx.note || ''} ${cat?.name || ''} ${fromCat?.name || ''} ${toCat?.name || ''} ${tx.amount}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  // Group filtered transactions by ISO date
  const groups = [];
  const byDate = new Map();
  for (const tx of filtered) {
    if (!byDate.has(tx.date)) {
      const arr = [];
      byDate.set(tx.date, arr);
      groups.push({ date: tx.date, items: arr });
    }
    byDate.get(tx.date).push(tx);
  }

  const sumExpenses = roundCents(filtered.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0));
  const sumIncomes = roundCents(filtered.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0));

  const timelineHtml = groups.length > 0
    ? groups
        .map((g) => {
          const dayExp = roundCents(g.items.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0));
          const rows = g.items
            .map((tx) => {
              if (tx.type === 'transfer') {
                const fromC = catMap.get(tx.fromCategoryId);
                const toC = catMap.get(tx.toCategoryId);
                return `
                  <button class="tx-row" data-edit-tx="${tx.id}">
                    <div class="tx-icon" style="--tx-color:var(--accent);">${icon('transfer', 18)}</div>
                    <div class="tx-main">
                      <div class="tx-title">${escapeHtml(fromC?.name || 'Topf')} → ${escapeHtml(toC?.name || 'Topf')}</div>
                      <div class="tx-meta">${escapeHtml(tx.note || 'Topf-Umbuchung')}</div>
                    </div>
                    <div class="tx-amount money text-accent">${escapeHtml(formatMoney(tx.amount, { privacy }))}</div>
                  </button>
                `;
              }

              const cat = catMap.get(tx.categoryId);
              const isInc = tx.type === 'income';
              const color = isInc ? 'var(--positive)' : (cat?.color || '#5B8CFF');
              const ico = isInc ? 'arrowDownLeft' : (cat?.icon || 'wallet');
              const title = tx.note || (isInc ? (cat ? `Erstattung: ${cat.name}` : 'Sondereinnahme') : (cat?.name || 'Ausgabe'));
              const meta = isInc
                ? (cat ? `Gutschrift in ${cat.name}` : 'Zusätzliche Einnahme')
                : (cat?.name || 'Ohne Kategorie');

              return `
                <button class="tx-row" data-edit-tx="${tx.id}">
                  <div class="tx-icon" style="--tx-color:${color};">${icon(ico, 19)}</div>
                  <div class="tx-main">
                    <div class="tx-title">${escapeHtml(title)}</div>
                    <div class="tx-meta">${escapeHtml(meta)}</div>
                  </div>
                  <div class="tx-amount money ${isInc ? 'text-pos' : ''}">
                    ${isInc ? '+' : '−'}${escapeHtml(formatMoney(tx.amount, { privacy }))}
                  </div>
                </button>
              `;
            })
            .join('');

          return `
            <div class="tx-group">
              <div class="tx-group-date">
                <span>${escapeHtml(formatDateGroupLabel(g.date))}</span>
                ${dayExp > 0 ? `<span class="money">−${escapeHtml(formatMoney(dayExp, { privacy }))}</span>` : ''}
              </div>
              <div class="tx-list">${rows}</div>
            </div>
          `;
        })
        .join('')
    : `
      <div class="empty-state">
        <div class="empty-icon">${icon('list', 24)}</div>
        <div class="empty-title">${query || typeFilter !== 'all' || catFilter !== 'all' ? 'Keine passenden Buchungen' : `Keine Buchungen im ${escapeHtml(formatMonthLong(snapshot.monthKey))}`}</div>
        <div class="empty-sub">${query || typeFilter !== 'all' || catFilter !== 'all'
          ? 'Probiere einen anderen Filter oder Suchbegriff.'
          : 'Tippe unten auf das leuchtende +, um deine erste Ausgabe oder Einnahme einzutragen.'}</div>
        ${!query && typeFilter === 'all' && catFilter === 'all'
          ? `<button class="btn btn-primary btn-sm" data-action="open-add" style="margin-top:6px;">${icon('plus', 15)} Erste Buchung eintragen</button>`
          : `<button class="btn btn-secondary btn-sm" data-action="clear-tx-filters" style="margin-top:6px;">Filter zurücksetzen</button>`}
      </div>
    `;

  return {
    count: filtered.length,
    sumExpenses,
    sumIncomes,
    timelineHtml,
  };
}

export function renderTransactionsView(state, ui, snapshot) {
  const privacy = state.settings.privacyMode;
  const typeFilter = ui.txTypeFilter || 'all';
  const catFilter = ui.txCategoryFilter || 'all';
  const res = renderTransactionsResults(state, ui, snapshot);

  const catOptions = [
    `<button class="chip ${catFilter === 'all' ? 'is-active' : ''}" data-tx-cat="all">Alle Töpfe</button>`,
    ...state.categories
      .filter((c) => !c.archived)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((c) => `<button class="chip ${catFilter === c.id ? 'is-active' : ''}" data-tx-cat="${c.id}">${escapeHtml(c.name)}</button>`),
  ].join('');

  return `
    <div class="section-head">
      <h2 class="section-title">Buchungen <span id="tx-count-badge" class="section-count">${res.count}</span></h2>
      <div id="tx-sum-strip" class="money text-muted" style="font-size:var(--text-xs);font-weight:650;">
        Ausg.: <strong style="color:var(--text-primary);">${escapeHtml(formatMoney(res.sumExpenses, { privacy }))}</strong>
        ${res.sumIncomes > 0 ? ` · <span class="text-pos">+${escapeHtml(formatMoney(res.sumIncomes, { privacy, compact: true }))}</span>` : ''}
      </div>
    </div>

    <!-- Search Bar -->
    <div class="search-box">
      ${icon('search', 17)}
      <input
        id="tx-search-input"
        type="search"
        class="search-input"
        placeholder="Notiz, Kategorie oder Betrag suchen…"
        value="${escapeHtml(ui.txSearch || '')}"
        autocomplete="off"
      />
      <button id="tx-search-clear-btn" class="search-clear" data-action="clear-tx-search" aria-label="Suche leeren" style="${ui.txSearch ? '' : 'display:none;'}">${icon('x', 13)}</button>
    </div>

    <!-- Type Segmented Control -->
    <div class="segmented" role="tablist">
      <button class="segmented-btn ${typeFilter === 'all' ? 'is-active' : ''}" data-tx-type="all">Alle</button>
      <button class="segmented-btn ${typeFilter === 'expense' ? 'is-active' : ''}" data-tx-type="expense">Ausgaben</button>
      <button class="segmented-btn ${typeFilter === 'income' ? 'is-active' : ''}" data-tx-type="income">Einnahmen</button>
      <button class="segmented-btn ${typeFilter === 'transfer' ? 'is-active' : ''}" data-tx-type="transfer">Umbuchung</button>
    </div>

    <!-- Category Filter Chips -->
    <div class="chip-row">${catOptions}</div>

    <div id="tx-results-container" style="display:flex;flex-direction:column;gap:var(--space-3);">
      ${res.timelineHtml}
    </div>
  `;
}
