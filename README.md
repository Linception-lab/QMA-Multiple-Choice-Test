# QM-Auditor Prüfungstrainer

Web-App-Version des Excel/VBA-Fragenkatalogs `QMA_Fragen_Ver3_7Rev5-3.xlsm`. Alle 201 Fragen aus den 10 Themenblättern sind übernommen, die Oberfläche ist speziell für Touch-Bedienung auf dem iPhone gebaut. Kein Server, kein Build-Schritt, keine Installation – reines HTML/CSS/JavaScript.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Grundgerüst der Seite |
| `style.css` | Design (Farben, Layout, Bottom-Sheet, Prüfstempel) |
| `app.js` | Gesamte App-Logik (Zustand, Rendering, Auswertung, Speicherung) |
| `data.js` | Alle Fragen/Antworten, automatisch aus der Excel-Datei extrahiert |

## Auf GitHub veröffentlichen

1. Auf [github.com](https://github.com) ein neues, leeres Repository anlegen (z. B. `qm-auditor-trainer`), **ohne** README/`.gitignore` beim Anlegen zu erzeugen.
2. Die vier Dateien aus diesem Ordner in das lokale Repo-Verzeichnis kopieren.
3. Im Terminal:
   ```bash
   git init
   git add .
   git commit -m "QM-Auditor Prüfungstrainer"
   git branch -M main
   git remote add origin https://github.com/<dein-benutzername>/qm-auditor-trainer.git
   git push -u origin main
   ```
4. Auf GitHub unter **Settings → Pages** als Quelle den `main`-Branch (Ordner `/root`) auswählen und speichern.
5. Nach ein bis zwei Minuten ist die App unter `https://<dein-benutzername>.github.io/qm-auditor-trainer/` erreichbar.

## Nutzung auf dem iPhone

- **Über GitHub Pages (empfohlen):** Link in Safari öffnen, dann über das Teilen-Symbol „Zum Home-Bildschirm" hinzufügen. Die App startet dann wie eine native App, ganz ohne Adressleiste.
- **Ohne GitHub, direkt lokal:** Alle vier Dateien z. B. per AirDrop oder iCloud Drive in die „Dateien"-App laden (gleicher Ordner) und `index.html` antippen. Funktioniert komplett offline, da `data.js` als normales Skript und nicht per Netzwerk-Abruf geladen wird.

## Funktionsumfang

- Themenauswahl (10 Kategorien) sowie „Alle Tests" und „Wiederholung" (falsch beantwortete Fragen)
- Modus **Normal** (merkt sich die zuletzt bearbeitete Frage je Thema) oder **Zufällig** (wählbare Fragenanzahl)
- **Prüfungssimulation**: optionales Zeitlimit mit Countdown, Ergebnis-Stempel am Ende (bestanden ab 60 %, wie im Original), Verlauf wird gespeichert
- Mehrfachauswahl-Fragen mit sofortigem Farb-Feedback (grün/rot) je Antwortoption, RICHTIG/FALSCH-Banner, Referenztext zu jeder Antwort
- Navigation Zurück/Weiter, Statistik-Leiste (Gesamt/Beantwortet/Richtig/Falsch)
- Volltextsuche über alle Fragen und Antworten
- Alles wird lokal im Browser gespeichert (`localStorage`): falsch beantwortete Fragen, letzte Position je Thema, Ergebnisverlauf der Prüfungssimulationen – mit Buttons zum gezielten Zurücksetzen

## Bewusste Vereinfachungen gegenüber dem Original-Makro

Das VBA-Original kannte zwei separate Prüfungs-Modi („Prüfung aus allen Fragen" mit Countdown-Timer und „Prüfung Einzeltest" mit Stoppuhr) sowie einige nicht mehr genutzte Zwischenzustände. In der App-Version wurden diese zu einem einzigen, flexiblen **Prüfungssimulation**-Schalter zusammengeführt, der auf jede Auswahl (einzelnes Thema, alle Tests, Wiederholung) anwendbar ist. Das ist für die Touch-Bedienung übersichtlicher und deckt den eigentlichen Nutzen ab: zeitlich begrenztes Üben mit Ergebnis-Prozentzahl.

## Daten aktualisieren

Ändert sich der Fragenkatalog in der Excel-Datei, kann `data.js` neu erzeugt werden (Python mit `openpyxl`). Meldet euch einfach nochmal mit der aktualisierten `.xlsm`-Datei, dann wird `data.js` neu generiert – am Code von `app.js`/`index.html`/`style.css` muss dafür nichts geändert werden.
