// ==========================================================================
// cash-map — 3-Step First-Run Onboarding Wizard (+ Direct Restore / Demo)
// ==========================================================================

import { icon } from '../icons.js';
import {
  formatMoney,
  formatMonthLong,
  getCurrentMonthKey,
  shiftMonthKey,
  parseGermanAmount,
  escapeHtml,
  roundCents,
} from '../format.js';
import { CATEGORY_GROUPS } from '../defaults.js';
import { FUTURE_PLANNING_MONTHS } from '../finance.js';
import { lockScroll, unlockScroll } from '../ui.js';

export function mountOnboarding(rootEl, store, { onRequestImport, onToast }) {
  let step = 1;
  let salary = 3000;
  let startMonth = getCurrentMonthKey();
  const budgets = {};
  const surplusTargets = {};
  for (const cat of store.state.categories) {
    budgets[cat.id] = cat.budgetHistory?.[0]?.amount ?? 0;
    surplusTargets[cat.id] = cat.surplusTargetId || null;
  }

  const sumBudgets = () => roundCents(Object.values(budgets).reduce((a, b) => a + (Number(b) || 0), 0));

  function statusInfo() {
    const d = roundCents(salary - sumBudgets());
    if (Math.abs(d) < 0.01) return { color: 'var(--positive)', text: 'Perfekt! 100 % verteilt', diff: d };
    if (d > 0) return { color: 'var(--warning)', text: `Noch ${formatMoney(d)} frei`, diff: d };
    return { color: 'var(--negative)', text: `${formatMoney(Math.abs(d))} über Gehalt`, diff: d };
  }

  function render() {
    if (store.state.settings.onboardingCompleted) {
      rootEl.classList.remove('is-open');
      rootEl.setAttribute('aria-hidden', 'true');
      rootEl.innerHTML = '';
      unlockScroll('onboarding');
      return;
    }

    lockScroll('onboarding');
    rootEl.classList.add('is-open');
    rootEl.setAttribute('aria-hidden', 'false');

    const dots = [1, 2, 3].map((n) => `<span class="onboarding-dot ${step === n ? 'is-active' : ''}"></span>`).join('');
    let bodyHtml = '';
    let footerHtml = '';

    if (step === 1) {
      bodyHtml = `
        <div style="display:flex;flex-direction:column;gap:20px;margin-top:8px;">
          <div class="onboarding-logo"><img src="./icons/icon-192.png" alt="cash-map App-Icon" /></div>
          <div>
            <h1 class="onboarding-h1">
              Willkommen bei <span class="brand-gradient-text">cash-map</span>
            </h1>
            <p style="margin:10px 0 0;color:var(--text-secondary);font-size:var(--text-md);line-height:1.5;">
              Dein persönlicher Geldfluss-Kompass – behalte Nettogehalt, Monatsbudgets und automatisch wachsende Kategoriekonten spielend leicht im Blick.
            </p>
          </div>

          <div class="feature-pill-list">
            <div class="feature-pill-item">
              <div class="action-banner-icon">${icon('piggy', 19)}</div>
              <div>
                <div style="font-weight:700;font-size:var(--text-sm);">Wachsende Kategoriekonten</div>
                <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:2px;">Gibst du bei Auto, Sauna oder Kleidung weniger aus, füllt sich der Topf Monat für Monat weiter.</div>
              </div>
            </div>
            <div class="feature-pill-item">
              <div class="action-banner-icon" style="background:var(--positive-soft);color:var(--positive);">${icon('repeat', 19)}</div>
              <div>
                <div style="font-weight:700;font-size:var(--text-sm);">Cash-Map &amp; 1-Tap Daueraufträge</div>
                <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:2px;">Sieh, wohin jeder Euro fließt, und buche Miete, Sparplan &amp; Abos mit einem Fingertipp.</div>
              </div>
            </div>
            <div class="feature-pill-item">
              <div class="action-banner-icon" style="background:var(--warning-soft);color:var(--warning);">${icon('shield', 19)}</div>
              <div>
                <div style="font-weight:700;font-size:var(--text-sm);">100 % lokal, offline &amp; JSON-Backup</div>
                <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:2px;">Deine Daten bleiben auf deinem Gerät und lassen sich jederzeit sichern &amp; wiederherstellen.</div>
              </div>
            </div>
          </div>
        </div>
      `;
      footerHtml = `
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button class="btn btn-primary btn-block" data-ob-next>In 60 Sekunden einrichten</button>
          <div class="field-row-2">
            <button class="btn btn-secondary btn-sm" data-ob-import>${icon('upload', 15)} Backup laden</button>
            <button class="btn btn-secondary btn-sm" data-ob-demo>${icon('sparkles', 15)} Demo ansehen</button>
          </div>
        </div>
      `;
    } else if (step === 2) {
      const maxStart = shiftMonthKey(getCurrentMonthKey(), FUTURE_PLANNING_MONTHS);
      bodyHtml = `
        <div style="display:flex;flex-direction:column;gap:18px;margin-top:12px;">
          <div>
            <div class="ob-step-label">Schritt 1 von 2</div>
            <h2 class="onboarding-h2">Dein monatliches Nettogehalt</h2>
            <p style="margin:6px 0 0;color:var(--text-secondary);font-size:var(--text-sm);">Wie viel landet monatlich auf deinem Konto? Du kannst es später jederzeit anpassen – auch nur für einzelne Monate (z. B. Urlaubsgeld).</p>
          </div>

          <div class="card" style="display:flex;flex-direction:column;gap:16px;">
            <div class="field">
              <label class="field-label" for="ob-salary-input">Monatliches Nettogehalt</label>
              <div class="input-money-wrap">
                <input id="ob-salary-input" type="text" inputmode="decimal" enterkeyhint="next" autocomplete="off" class="input" style="font-size:1.45rem;padding:14px 40px 14px 16px;" value="${salary.toFixed(2).replace('.', ',')}" />
                <span class="input-money-suffix" style="font-size:1.2rem;">€</span>
              </div>
            </div>

            <div class="field">
              <label class="field-label" for="ob-start-month">Ab welchem Monat trackst du?</label>
              <input id="ob-start-month" type="month" class="input" value="${startMonth}" max="${maxStart}" />
              <span class="field-hint" id="ob-start-hint">Ab ${escapeHtml(formatMonthLong(startMonth))} fließt jeden Monat dein Budget in die Töpfe. Monate davor werden ausgeblendet.</span>
            </div>
          </div>
        </div>
      `;
      footerHtml = `
        <div style="display:flex;gap:10px;">
          <button class="btn btn-secondary" data-ob-back>Zurück</button>
          <button class="btn btn-primary flex-1" data-ob-next>Weiter zu den Kategorien</button>
        </div>
      `;
    } else if (step === 3) {
      const st = statusInfo();
      const catsSorted = [...store.state.categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      const groupsHtml = CATEGORY_GROUPS.map((g) => {
        const items = catsSorted.filter((c) => c.group === g.id);
        if (items.length === 0) return '';
        const rows = items.map((cat) => {
          const canToggleRule = !cat.isFixed && cat.id !== 'cat_puffer';
          const isForward = Boolean(surplusTargets[cat.id]);
          const ruleHtml = cat.isFixed
            ? `<div class="plan-meta truncate">${icon('repeat', 11, 'inline-icon')} Dauerauftrag am ${cat.bookingDay || 1}.</div>`
            : canToggleRule
              ? `<button type="button" class="ob-rule-pill ${isForward ? 'is-forward' : ''}" data-ob-toggle-rule="${cat.id}" title="Antippen zum Umschalten">${
                  isForward ? `${icon('cornerDownRight', 11, 'inline-icon')} Überschuss → Puffer` : 'Wachsender Topf'
                }</button>`
              : `<div class="plan-meta truncate">Wachsender Topf</div>`;

          return `
            <div class="plan-cat-row" style="padding:9px 11px;">
              <div class="cat-icon" style="--cat-color:${cat.color};width:34px;height:34px;border-radius:10px;">${icon(cat.icon, 17)}</div>
              <div style="flex:1;min-width:0;">
                <div class="cat-name" style="font-size:var(--text-sm);">${escapeHtml(cat.name)}</div>
                ${ruleHtml}
              </div>
              <div class="plan-input-wrap">
                <input type="text" inputmode="decimal" enterkeyhint="next" autocomplete="off" class="plan-cat-input" data-ob-cat="${cat.id}" value="${Number(budgets[cat.id] || 0).toFixed(2).replace('.', ',')}" />
                <span class="plan-cat-suffix">€</span>
              </div>
            </div>
          `;
        }).join('');
        return `
          <div style="display:flex;flex-direction:column;gap:7px;">
            <div class="ob-group-head"><span class="legend-dot" style="background:${g.color};"></span>${escapeHtml(g.label)}</div>
            ${rows}
          </div>
        `;
      }).join('');

      bodyHtml = `
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div>
            <div class="ob-step-label">Schritt 2 von 2</div>
            <h2 class="onboarding-h2">Dein Gehalt auf ${store.state.categories.length} Töpfe verteilen</h2>
            <p style="margin:4px 0 0;font-size:var(--text-xs);color:var(--text-tertiary);">Tipp: Tippe unter einer Kategorie auf <strong>Wachsender Topf</strong>, falls Ungenutztes lieber in deinen <strong>Puffer</strong> wandern soll (wie bei Sauna voreingestellt).</p>
          </div>

          <div class="card card-compact ob-sticky-status">
            <div>
              <div style="font-size:var(--text-xs);color:var(--text-secondary);">Verplant von ${escapeHtml(formatMoney(salary, { compact: true }))}</div>
              <div id="ob-live-status" class="money" style="font-size:var(--text-sm);font-weight:750;color:${st.color};margin-top:2px;">${escapeHtml(st.text)}</div>
            </div>
            <button class="btn btn-secondary btn-sm" data-ob-rest-puffer style="${st.diff > 0.01 ? '' : 'display:none;'}">Rest → Puffer</button>
          </div>

          ${groupsHtml}
        </div>
      `;
      footerHtml = `
        <div style="display:flex;gap:10px;">
          <button class="btn btn-secondary" data-ob-back>Zurück</button>
          <button class="btn btn-positive flex-1" data-ob-finish>${icon('check', 17)} cash-map starten</button>
        </div>
      `;
    }

    rootEl.innerHTML = `
      <div class="onboarding-wrap">
        <div style="display:flex;flex-direction:column;gap:16px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div class="onboarding-steps-dots">${dots}</div>
            <span style="font-size:var(--text-xs);font-weight:600;color:var(--text-tertiary);">cash-map</span>
          </div>
          ${bodyHtml}
        </div>
        <div class="onboarding-footer">${footerHtml}</div>
      </div>
    `;

    bindEvents();
  }

  function updateLiveStatus() {
    const st = statusInfo();
    const stEl = rootEl.querySelector('#ob-live-status');
    if (stEl) {
      stEl.style.color = st.color;
      stEl.textContent = st.text;
    }
    const restBtn = rootEl.querySelector('[data-ob-rest-puffer]');
    if (restBtn) restBtn.style.display = st.diff > 0.01 ? '' : 'none';
  }

  function goToStep(n) {
    step = n;
    render();
    rootEl.scrollTo({ top: 0 });
  }

  function bindEvents() {
    rootEl.querySelector('[data-ob-next]')?.addEventListener('click', () => {
      if (step === 2) {
        const salVal = parseGermanAmount(rootEl.querySelector('#ob-salary-input')?.value);
        if (!Number.isFinite(salVal) || salVal <= 0) {
          onToast('Bitte gib ein gültiges Nettogehalt ein.', 'warn');
          return;
        }
        salary = salVal;
        startMonth = rootEl.querySelector('#ob-start-month')?.value || getCurrentMonthKey();
      }
      goToStep(Math.min(3, step + 1));
    });

    rootEl.querySelector('[data-ob-back]')?.addEventListener('click', () => goToStep(Math.max(1, step - 1)));
    rootEl.querySelector('[data-ob-import]')?.addEventListener('click', () => onRequestImport());
    rootEl.querySelector('[data-ob-demo]')?.addEventListener('click', () => {
      store.loadDemoData();
      onToast('3-Monats-Demo geladen – probiere alles in Ruhe aus!', 'info');
    });

    rootEl.querySelector('#ob-start-month')?.addEventListener('change', (e) => {
      const hint = rootEl.querySelector('#ob-start-hint');
      if (hint && /^\d{4}-\d{2}$/.test(e.target.value)) {
        hint.textContent = `Ab ${formatMonthLong(e.target.value)} fließt jeden Monat dein Budget in die Töpfe. Monate davor werden ausgeblendet.`;
      }
    });

    rootEl.querySelectorAll('[data-ob-cat]').forEach((inp) => {
      inp.addEventListener('focus', () => setTimeout(() => inp.select(), 0));
      inp.addEventListener('input', () => {
        const val = parseGermanAmount(inp.value);
        budgets[inp.getAttribute('data-ob-cat')] = Number.isFinite(val) && val >= 0 ? val : 0;
        updateLiveStatus();
      });
      inp.addEventListener('change', () => {
        inp.value = Number(budgets[inp.getAttribute('data-ob-cat')] || 0).toFixed(2).replace('.', ',');
      });
    });

    rootEl.querySelectorAll('[data-ob-toggle-rule]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-ob-toggle-rule');
        const nextForward = !surplusTargets[id];
        surplusTargets[id] = nextForward ? 'cat_puffer' : null;
        btn.classList.toggle('is-forward', nextForward);
        btn.innerHTML = nextForward
          ? `${icon('cornerDownRight', 11, 'inline-icon')} Überschuss → Puffer`
          : 'Wachsender Topf';
      });
    });

    rootEl.querySelector('[data-ob-rest-puffer]')?.addEventListener('click', () => {
      const d = roundCents(salary - sumBudgets());
      if (d > 0 && Object.prototype.hasOwnProperty.call(budgets, 'cat_puffer')) {
        budgets.cat_puffer = roundCents((budgets.cat_puffer || 0) + d);
        const inp = rootEl.querySelector('[data-ob-cat="cat_puffer"]');
        if (inp) inp.value = budgets.cat_puffer.toFixed(2).replace('.', ',');
        updateLiveStatus();
      }
    });

    rootEl.querySelector('[data-ob-finish]')?.addEventListener('click', () => {
      store.completeOnboarding({ netSalary: salary, categoryBudgets: budgets, surplusTargets, startMonth });
      onToast('cash-map ist bereit! Viel Spaß beim Planen.', 'info');
    });
  }

  return { render };
}
