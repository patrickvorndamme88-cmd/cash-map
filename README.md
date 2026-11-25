# cash-map

Deine persönliche **iPhone Progressive Web App (PWA)** für den monatlichen Geldfluss, individuelle Kategorie-Budgets und automatisch wachsende Kategoriekonten — **100 % lokal, offline-fähig und ohne Build-Prozess direkt auf GitHub Pages hostbar**.

## Highlights

- **Alle deine Kategorien direkt startklar:** Miete, Ernährung & Hygiene, Auto (Benzin & Reparaturen), Aktiensparplan, Rücklage jährliche Fixkosten, Kleidung, Sauna, Fitnessstudio, Handytarif, Cloudspeicher & Puffer — vollständig anpassbar, sortierbar und erweiterbar.
- **Wachsende Kategoriekonten & smarte Überschuss-Weiterleitung:** Entscheide pro Kategorie ganz flexibel: Bei jährlichen/unregelmäßigen Kosten (*Rücklage jährliche Fixkosten*, *Auto*, *Kleidung*) sammelt sich Ungenutztes im **eigenen Kategoriekonto** an. Bei reinen Monatsbudgets wie *Sauna* kannst du einstellen, dass der neue Monat frisch beim Budget startet und nicht genutztes Geld am Monatsende **automatisch in deinen Wunsch-Topf** (z. B. *Puffer* oder *Aktiensparplan*) wandert — kein Cent geht verloren!
- **Interaktive Cash-Map (Geldfluss-Diagramm):** Visuelle Sankey-Karte deines Nettogehalts über Fixkosten, Alltag, Investitionen und Rücklagen bis in jeden einzelnen Topf — umschaltbar zwischen *Gehalts-Plan* und *Echtem Geldfluss*.
- **Daueraufträge mit 1-Tap-Buchung:** Feste Monatsbeträge wie Miete, Aktiensparplan, Fitnessstudio, Handytarif & Cloudspeicher haben einen eigenen Buchungstag und lassen sich mit einem Fingertipp buchen. *Gruppe* (wofür das Geld ist) und *Dauerauftrag* (wie gebucht wird) sind dabei sauber getrennt – der Sparplan bleibt in „Sparen & Investieren“, ist aber trotzdem ein Dauerauftrag.
- **Tracking-Beginn & Monatsübersicht:** Monate vor deinem Start sind ausgeblendet. Ein Tipp auf den Monat öffnet eine Jahresübersicht mit der Budget-Differenz jedes Monats; Wischen nach links/rechts wechselt den Monat. Zukünftige Monate (bis 12 Monate voraus) zeigen eine Prognose zum Vorplanen.
- **Monatsrückblick, Tagesbudget & Sparziel-Prognose:** Rückblick auf den Vormonat, „noch X € pro Tag für den Alltag“ und eine Prognose, wann ein Sparziel erreicht ist.
- **Topf-Umbuchungen & Puffer-Ausgleich:** Geld sauber zwischen Töpfen umschichten (z. B. aus dem *Puffer* ins *Auto*-Konto) — bei einem negativen Topf sogar per 1-Tap-Vorschlag.
- **iPhone-Ziffernblock mit Taschenrechner:** Blitzschnelles Eintragen von Ausgaben & Einnahmen inkl. `+`-Summenfunktion und Live-Vorschau des neuen Kontostands.
- **JSON Datensicherung (Export & Import):** Komplettes Backup aller Einstellungen, Nettogehalt-Verläufe, Kategorie-Budgets, Startguthaben und Buchungen — per iPhone Share-Sheet (iCloud Drive / Dateien), Download oder Zwischenablage. Beim Import wird eine geprüfte Vorschau angezeigt.
- **Diskret-Modus (👁️) & Dark/Light Mode:** Beträge unterwegs mit einem Tipp ausblenden; automatisches Midnight-Obsidian Dark Theme & Crisp-Porcelain Light Theme.

---

## Auf GitHub Pages veröffentlichen (in 2 Minuten)

Da `cash-map` ohne Build-Tool auskommt, kannst du den Ordner direkt auf GitHub hochladen:

1. Erstelle auf [github.com](https://github.com/new) ein neues Repository mit dem Namen **`cash-map`** (Public oder Private je nach GitHub-Plan; GitHub Pages ist bei Public-Repos kostenlos — deine Finanzdaten liegen **niemals** im Repo, sondern ausschließlich lokal auf deinem iPhone!).
2. Lade alle Dateien und Ordner aus diesem Verzeichnis (`index.html`, `manifest.webmanifest`, `sw.js`, `.nojekyll`, `css/`, `js/`, `icons/`) in den Branch **`main`** hoch.
3. Öffne im Repository **Settings → Pages**.
4. Wähle unter **Build and deployment → Source**: **Deploy from a branch**, Branch **`main`** und Ordner **`/ (root)`**, dann **Save**.
5. Nach ~1 Minute ist deine App live unter:
   `https://<dein-github-name>.github.io/cash-map/`

---

## Auf dem iPhone als App installieren

1. Öffne deine GitHub-Pages-URL in **Safari** auf dem iPhone.
2. Tippe unten in der Mitte auf das **Teilen-Symbol** (Quadrat mit Pfeil nach oben).
3. Scrolle nach unten und tippe auf **„Zum Home-Bildschirm“** → **„Hinzufügen“**.
4. Fertig! `cash-map` erscheint mit eigenem Icon auf deinem Home-Bildschirm, öffnet im Vollbild ohne Safari-Leisten und funktioniert dank Service Worker auch komplett offline.

> **Tipp zur Datensicherung:** Erstelle regelmäßig unter **⚙️ Einstellungen → JSON-Backup sichern / teilen** eine Sicherung direkt in deiner **iCloud Drive (Dateien-App)**. Falls du dein iPhone wechselst oder die Web-App neu installierst, kannst du diese Datei bereits auf dem Startbildschirm mit einem Tipp wiederherstellen.
