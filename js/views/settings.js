// ==========================================================================
// cash-map — Settings & JSON Datensicherung Sheet
// ==========================================================================

import { icon } from '../icons.js';
import { escapeHtml } from '../format.js';
import { exportBackupFile, copyBackupToClipboard } from '../backup.js';

function formatBackupAge(iso) {
  if (!iso) return 'Noch keine Datensicherung erstellt';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return 'Gesichert';
  const diffDays = Math.floor((Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24));
  const dateStr = dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (diffDays <= 0) return `Heute gesichert (${dateStr})`;
  if (diffDays === 1) return `Gestern gesichert (${dateStr})`;
  return `Vor ${diffDays} Tagen gesichert (${dateStr})`;
}

export function openSettingsSheet(sheetManager, store, { onRequestImport, onToast }) {
  const s = store.state.settings;
  const txCount = store.state.transactions.length;
  const catCount = store.state.categories.filter((c) => !c.archived).length;
  const hasBackup = Boolean(s.lastBackupAt);

  const bodyHtml = `
    <!-- JSON Datensicherung (Export & Import) -->
    <div class="settings-group">
      <div class="settings-group-title">Datensicherung (JSON)</div>

      <div class="action-banner ${hasBackup ? 'is-pos' : 'is-warn'}">
        <div class="action-banner-left">
          <div class="action-banner-icon" style="${hasBackup ? 'background:var(--positive-soft);color:var(--positive);' : ''}">
            ${icon(hasBackup ? 'shield' : 'info', 18)}
          </div>
          <div>
            <div class="action-banner-title">${escapeHtml(formatBackupAge(s.lastBackupAt))}</div>
            <div class="action-banner-sub">${catCount} Kategorien · ${txCount} Buchungen · inkl. aller Budgets</div>
          </div>
        </div>
      </div>

      <div class="settings-card">
        <button type="button" class="settings-row settings-row-btn" id="set-export-share">
          <div class="settings-row-left">
            <div class="settings-row-icon" style="color:var(--positive);background:var(--positive-soft);">${icon('share', 18)}</div>
            <div>
              <div class="toggle-title">JSON-Backup sichern / teilen</div>
              <div class="toggle-desc">Direkt in iCloud Drive, Dateien oder Downloads speichern</div>
            </div>
          </div>
          ${icon('chevronRight', 16)}
        </button>

        <button type="button" class="settings-row settings-row-btn" id="set-export-download">
          <div class="settings-row-left">
            <div class="settings-row-icon">${icon('download', 18)}</div>
            <div>
              <div class="toggle-title">Als .json Datei herunterladen</div>
              <div class="toggle-desc">Kompletter Export aller Einstellungen &amp; Buchungen</div>
            </div>
          </div>
          ${icon('chevronRight', 16)}
        </button>

        <button type="button" class="settings-row settings-row-btn" id="set-export-copy">
          <div class="settings-row-left">
            <div class="settings-row-icon">${icon('copy', 17)}</div>
            <div>
              <div class="toggle-title">JSON in Zwischenablage kopieren</div>
              <div class="toggle-desc">Z. B. für Apple Notizen als schnelles Zweit-Backup</div>
            </div>
          </div>
          ${icon('chevronRight', 16)}
        </button>

        <button type="button" class="settings-row settings-row-btn" id="set-import-file">
          <div class="settings-row-left">
            <div class="settings-row-icon" style="color:var(--violet);background:var(--violet-soft);">${icon('upload', 18)}</div>
            <div>
              <div class="toggle-title">JSON-Backup importieren</div>
              <div class="toggle-desc">Vorherige Datensicherung aus Datei wiederherstellen</div>
            </div>
          </div>
          ${icon('chevronRight', 16)}
        </button>

        <button type="button" class="settings-row settings-row-btn" id="set-import-paste">
          <div class="settings-row-left">
            <div class="settings-row-icon" style="color:var(--violet);background:var(--violet-soft);">${icon('edit', 17)}</div>
            <div>
              <div class="toggle-title">JSON-Text einfügen</div>
              <div class="toggle-desc">Kopiertes Backup aus Notizen direkt wiederherstellen</div>
            </div>
          </div>
          ${icon('chevronRight', 16)}
        </button>
      </div>
    </div>

    <!-- Darstellung & Privatsphäre -->
    <div class="settings-group">
      <div class="settings-group-title">Darstellung &amp; Privatsphäre</div>
      <div class="card card-compact" style="display:flex;flex-direction:column;gap:12px;">
        <div class="field">
          <label class="field-label">Design-Modus</label>
          <div class="segmented">
            <button type="button" class="segmented-btn ${s.theme === 'auto' ? 'is-active' : ''}" data-set-theme="auto">System</button>
            <button type="button" class="segmented-btn ${s.theme === 'dark' ? 'is-active' : ''}" data-set-theme="dark">${icon('moon', 13)} Dunkel</button>
            <button type="button" class="segmented-btn ${s.theme === 'light' ? 'is-active' : ''}" data-set-theme="light">${icon('sun', 13)} Hell</button>
          </div>
        </div>

        <div class="toggle-row" style="padding:10px 12px;">
          <div class="toggle-text">
            <div class="toggle-title">Diskret-Modus (Beträge verbergen)</div>
            <div class="toggle-desc">Blendet alle Euro-Beträge unterwegs aus</div>
          </div>
          <label class="ios-switch">
            <input type="checkbox" id="set-privacy" ${s.privacyMode ? 'checked' : ''} />
            <span class="ios-switch-track"></span>
          </label>
        </div>
      </div>
    </div>

    <!-- iPhone Installation Guide -->
    <div class="settings-group">
      <div class="settings-group-title">Auf dem iPhone installieren</div>
      <div class="card card-compact" style="font-size:var(--text-xs);color:var(--text-secondary);display:flex;flex-direction:column;gap:6px;line-height:1.45;">
        <div><strong>1.</strong> Öffne deinen GitHub-Pages-Link in <strong>Safari</strong> auf dem iPhone.</div>
        <div><strong>2.</strong> Tippe unten in der Mitte auf das <strong>Teilen-Symbol</strong> (Quadrat mit Pfeil nach oben).</div>
        <div><strong>3.</strong> Wähle <strong>„Zum Home-Bildschirm“</strong> — fertig! cash-map startet danach im Vollbild mit eigenem App-Icon und funktioniert auch offline.</div>
      </div>
    </div>

    <!-- Demo & Reset -->
    <div class="settings-group">
      <div class="settings-group-title">Demo &amp; Datenverwaltung</div>
      <div class="settings-card">
        <button type="button" class="settings-row settings-row-btn" id="set-load-demo">
          <div class="settings-row-left">
            <div class="settings-row-icon" style="color:var(--warning);background:var(--warning-soft);">${icon('sparkles', 17)}</div>
            <div>
              <div class="toggle-title">3-Monats-Beispieldaten laden</div>
              <div class="toggle-desc">Zeigt gefüllte Töpfe, Charts &amp; Fixkosten zum Ausprobieren</div>
            </div>
          </div>
          ${icon('chevronRight', 16)}
        </button>

        <button type="button" class="settings-row settings-row-btn" id="set-restart-ob">
          <div class="settings-row-left">
            <div class="settings-row-icon">${icon('refresh', 17)}</div>
            <div>
              <div class="toggle-title">Start-Assistent neu öffnen</div>
              <div class="toggle-desc">Gehalt &amp; Standard-Kategorien neu durchgehen</div>
            </div>
          </div>
          ${icon('chevronRight', 16)}
        </button>

        <button type="button" class="settings-row settings-row-btn" id="set-reset-all">
          <div class="settings-row-left">
            <div class="settings-row-icon" style="color:var(--negative);background:var(--negative-soft);">${icon('trash', 17)}</div>
            <div>
              <div class="toggle-title" style="color:var(--negative);">Alle Daten zurücksetzen</div>
              <div class="toggle-desc">Löscht Buchungen und setzt cash-map auf Werkseinstellungen</div>
            </div>
          </div>
          ${icon('chevronRight', 16)}
        </button>
      </div>
    </div>

    <div style="text-align:center;font-size:0.7rem;color:var(--text-tertiary);padding-top:4px;">
      cash-map PWA v1.0 · 100 % lokal auf deinem Gerät gespeichert
    </div>
  `;

  sheetManager.openRaw({
    title: 'Einstellungen & Backup',
    bodyHtml,
    onMount(panel, close) {
      panel.querySelector('#set-export-share').addEventListener('click', async () => {
        const res = await exportBackupFile(store.state, { preferShare: true });
        if (res.method !== 'cancelled') {
          store.markBackupNow();
          onToast(`Backup gespeichert (${res.filename}).`, 'info');
          openSettingsSheet(sheetManager, store, { onRequestImport, onToast });
        }
      });

      panel.querySelector('#set-export-download').addEventListener('click', async () => {
        const res = await exportBackupFile(store.state, { preferShare: false });
        store.markBackupNow();
        onToast(`Backup heruntergeladen (${res.filename}).`, 'info');
        openSettingsSheet(sheetManager, store, { onRequestImport, onToast });
      });

      panel.querySelector('#set-export-copy').addEventListener('click', async () => {
        try {
          await copyBackupToClipboard(store.state);
          store.markBackupNow();
          onToast('JSON-Backup in Zwischenablage kopiert!', 'info');
          openSettingsSheet(sheetManager, store, { onRequestImport, onToast });
        } catch {
          onToast('Kopieren fehlgeschlagen.', 'error');
        }
      });

      panel.querySelector('#set-import-file').addEventListener('click', () => {
        onRequestImport();
      });

      panel.querySelector('#set-import-paste').addEventListener('click', () => {
        sheetManager.openPasteImportSheet();
      });

      panel.querySelectorAll('[data-set-theme]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const t = btn.getAttribute('data-set-theme');
          store.setTheme(t);
          panel.querySelectorAll('[data-set-theme]').forEach((b) => b.classList.toggle('is-active', b === btn));
        });
      });

      panel.querySelector('#set-privacy').addEventListener('change', () => {
        store.togglePrivacy();
      });

      panel.querySelector('#set-load-demo').addEventListener('click', () => {
        store.loadDemoData();
        close();
        onToast('3-Monats-Demo geladen!', 'info', { undo: true });
      });

      panel.querySelector('#set-restart-ob').addEventListener('click', () => {
        store.resetAllData(false);
        close();
      });

      let confirmReset = false;
      const resetBtn = panel.querySelector('#set-reset-all');
      resetBtn.addEventListener('click', () => {
        if (!confirmReset) {
          confirmReset = true;
          resetBtn.querySelector('.toggle-title').textContent = 'Wirklich alles löschen? Nochmal tippen!';
          resetBtn.querySelector('.toggle-desc').textContent = 'Tipp: Erstelle vorher oben ein JSON-Backup.';
          return;
        }
        store.resetAllData(true);
        close();
        onToast('Alle Daten zurückgesetzt.', 'warn', { undo: true });
      });
    },
  });
}
