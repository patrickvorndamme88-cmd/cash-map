// ==========================================================================
// cash-map — Sleek 3-Step First-Run Onboarding Wizard (+ Direct Restore)
// ==========================================================================

import { icon } from '../icons.js';
import { formatMoney, formatMonthLong, getCurrentMonthKey, parseGermanAmount, escapeHtml, roundCents } from '../format.js';

export function mountOnboarding(rootEl, store, { onRequestImport, onToast }) {
  let step = 1;
  let salary = 3000;
  let startMonth = getCurrentMonthKey();
  const budgets = {};
  for (const cat of store.state.categories) {
    budgets[cat.id] = cat.budgetHistory?.[0]?.amount ?? 0;
  }

  function render() {
    if (store.state.settings.onboardingCompleted) {
      rootEl.classList.remove('is-open');
      rootEl.setAttribute('aria-hidden', 'true');
      rootEl.innerHTML = '';
      return;
    }

    rootEl.classList.add('is-open');
    rootEl.setAttribute('aria-hidden', 'false');

    const dots = [1, 2, 3]
      .map((n) => `<span class="onboarding-dot ${step === n ? 'is-active' : ''}"></span>`)
      .join('');

    let bodyHtml = '';
    let footerHtml = '';

    if (step === 1) {
      bodyHtml = `
        <div style="display:flex;flex-direction:column;gap:20px;margin-top:8px;">
          <div class="onboarding-logo">
            <img src="./icons/icon-192.png" alt="cash-map App-Icon" />
          </div>
          <div>
            <h1 style="font-family:var(--font-display);font-size:1.9rem;font-weight:800;letter-spacing:-0.04em;margin:0;line-height:1.12;">
              Willkommen bei <span style="white-space:nowrap;background:linear-gradient(90deg,var(--accent),var(--positive));-webkit-background-clip:text;background-clip:text;color:transparent;">cash-map</span>
            </h1>
            <p style="margin:10px 0 0;color:var(--text-secondary);font-size:var(--text-md);line-height:1.5;">
              Dein persönlicher Geldfluss-Kompass für das iPhone — behalte Nettogehalt, Monatsbudgets und automatisch wachsende Kategoriekonten spielend leicht im Blick.
            </p>
          </div>

          <div class="feature-pill-list">
            <div class="feature-pill-item">
              <div class="action-banner-icon">${icon('piggy', 19)}</div>
              <div>
                <div style="font-weight:700;font-size:var(--text-sm);">Wachsende Kategoriekonten</div>
                <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:2px;">Gibst du bei Auto, Sauna, Kleidung oder Rücklagen weniger aus, füllt sich dein Topf Monat für Monat automatisch weiter.</div>
              </div>
            </div>
            <div class="feature-pill-item">
              <div class="action-banner-icon" style="background:var(--positive-soft);color:var(--positive);">${icon('map', 19)}</div>
              <div>
                <div style="font-weight:700;font-size:var(--text-sm);">Interaktive Cash-Map &amp; 1-Tap Fixkosten</div>
                <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:2px;">Sieh sofort, wohin jeder Euro fließt, und buche Miete, Sparplan &amp; Abos mit einem Fingertipp.</div>
              </div>
            </div>
            <div class="feature-pill-item">
              <div class="action-banner-icon" style="background:var(--warning-soft);color:var(--warning);">${icon('shield', 19)}</div>
              <div>
                <div style="font-weight:700;font-size:var(--text-sm);">100 % lokal, offline &amp; JSON-Backup</div>
                <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:2px;">Deine Daten bleiben ausschließlich auf deinem Gerät und lassen sich jederzeit als JSON sichern &amp; wiederherstellen.</div>
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
      bodyHtml = `
        <div style="display:flex;flex-direction:column;gap:18px;margin-top:12px;">
          <div>
            <div style="font-size:var(--text-xs);font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:0.05em;">Schritt 1 von 2</div>
            <h2 style="font-family:var(--font-display);font-size:1.65rem;font-weight:800;letter-spacing:-0.035em;margin:4px 0 0;">Dein monatliches Nettogehalt</h2>
            <p style="margin:6px 0 0;color:var(--text-secondary);font-size:var(--text-sm);">Wie viel Geld landet monatlich auf deinem Konto? Du kannst es später jederzeit pro Monat anpassen.</p>
          </div>

          <div class="card" style="display:flex;flex-direction:column;gap:14px;">
            <div class="field">
              <label class="field-label" for="ob-salary-input">Monatliches Nettogehalt</label>
              <div class="input-money-wrap">
                <input id="ob-salary-input" type="text" inputmode="decimal" class="input" style="font-size:1.45rem;padding:14px 40px 14px 16px;" value="${salary.toFixed(2).replace('.', ',')}" />
                <span class="input-money-suffix" style="font-size:1.2rem;">€</span>
              </div>
            </div>

            <div class="field">
              <label class="field-label" for="ob-start-month">Startmonat für Kategoriekonten</label>
              <input id="ob-start-month" type="month" class="input" value="${startMonth}" />
              <span style="font-size:var(--text-xs);color:var(--text-tertiary);">Ab ${escapeHtml(formatMonthLong(startMonth))} beginnen deine Töpfe sich anzusparen.</span>
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
      const sumBudgets = roundCents(Object.values(budgets).reduce((a, b) => a + (Number(b) || 0), 0));
      const diff = roundCents(salary - sumBudgets);
      const statusColor = Math.abs(diff) < 0.01 ? 'var(--positive)' : diff < 0 ? 'var(--negative)' : 'var(--warning)';

      const rows = store.state.categories
        .map((cat) => `
          <div class="plan-cat-row" style="padding:9px 11px;">
            <div class="cat-icon" style="--cat-color:${cat.color};width:34px;height:34px;border-radius:10px;">${icon(cat.icon, 17)}</div>
            <div style="flex:1;min-width:0;">
              <div class="cat-name" style="font-size:var(--text-sm);">${escapeHtml(cat.name)}</div>
              <div style="font-size:0.68rem;color:var(--text-tertiary);">${cat.isFixed ? 'Fixkosten' : 'Wachsender Topf'}</div>
            </div>
            <div style="position:relative;display:flex;align-items:center;">
              <input type="text" inputmode="decimal" class="plan-cat-input" data-ob-cat="${cat.id}" value="${Number(budgets[cat.id] || 0).toFixed(2).replace('.', ',')}" />
              <span style="position:absolute;right:9px;font-size:var(--text-xs);font-weight:700;color:var(--text-tertiary);pointer-events:none;">€</span>
            </div>
          </div>
        `)
        .join('');

      bodyHtml = `
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div>
            <div style="font-size:var(--text-xs);font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:0.05em;">Schritt 2 von 2</div>
            <h2 style="font-family:var(--font-display);font-size:1.5rem;font-weight:800;letter-spacing:-0.03em;margin:4px 0 0;">Deine 11 Kategorien verteilen</h2>
          </div>

          <div class="card card-compact" style="display:flex;justify-content:space-between;align-items:center;position:sticky;top:8px;z-index:5;">
            <div>
              <div style="font-size:var(--text-xs);color:var(--text-secondary);">Verplant von ${escapeHtml(formatMoney(salary, { compact: true }))}</div>
              <div id="ob-live-status" class="money" style="font-size:var(--text-sm);font-weight:750;color:${statusColor};margin-top:2px;">
                ${Math.abs(diff) < 0.01 ? 'Perfekt! 100 % verteilt' : diff > 0 ? `Noch ${escapeHtml(formatMoney(diff))} frei` : `${escapeHtml(formatMoney(Math.abs(diff)))} über Gehalt`}
              </div>
            </div>
            ${diff > 0.01 ? `<button class="btn btn-secondary btn-sm" data-ob-rest-puffer>Rest → Puffer</button>` : ''}
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;">
            ${rows}
          </div>
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
        <div style="padding-top:12px;">${footerHtml}</div>
      </div>
    `;

    // Bind events
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
      step = Math.min(3, step + 1);
      render();
      rootEl.scrollTo({ top: 0, behavior: 'smooth' });
    });

    rootEl.querySelector('[data-ob-back]')?.addEventListener('click', () => {
      step = Math.max(1, step - 1);
      render();
    });

    rootEl.querySelector('[data-ob-import]')?.addEventListener('click', () => {
      onRequestImport();
    });

    rootEl.querySelector('[data-ob-demo]')?.addEventListener('click', () => {
      store.loadDemoData();
      onToast('3-Monats-Demo geladen — probiere alles in Ruhe aus!', 'info');
    });

    rootEl.querySelectorAll('[data-ob-cat]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const id = inp.getAttribute('data-ob-cat');
        const val = parseGermanAmount(inp.value);
        budgets[id] = Number.isFinite(val) && val >= 0 ? val : 0;
        const sumB = roundCents(Object.values(budgets).reduce((a, b) => a + (Number(b) || 0), 0));
        const d = roundCents(salary - sumB);
        const stEl = rootEl.querySelector('#ob-live-status');
        if (stEl) {
          stEl.style.color = Math.abs(d) < 0.01 ? 'var(--positive)' : d < 0 ? 'var(--negative)' : 'var(--warning)';
          stEl.textContent = Math.abs(d) < 0.01
            ? 'Perfekt! 100 % verteilt'
            : d > 0
              ? `Noch ${formatMoney(d)} frei`
              : `${formatMoney(Math.abs(d))} über Gehalt`;
        }
      });
    });

    rootEl.querySelector('[data-ob-rest-puffer]')?.addEventListener('click', () => {
      const sumB = roundCents(Object.values(budgets).reduce((a, b) => a + (Number(b) || 0), 0));
      const d = roundCents(salary - sumB);
      if (d > 0) {
        budgets['cat_puffer'] = roundCents((budgets['cat_puffer'] || 0) + d);
        render();
      }
    });

    rootEl.querySelector('[data-ob-finish]')?.addEventListener('click', () => {
      store.completeOnboarding({
        netSalary: salary,
        categoryBudgets: budgets,
        startMonth,
      });
      onToast('cash-map ist bereit! Viel Spaß beim Planen.', 'info');
    });
  }

  return { render };
}
