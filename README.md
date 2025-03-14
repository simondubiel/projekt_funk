# Webanwendung Wetterstationen

**Projektdokumentation:** [Projektdokumentation](users_guide/Projektdokumentation.pdf)

**Videoanleitung:** https://youtu.be/S2fxKH1EAoQ

**Datengrundlage:** https://www1.ncdc.noaa.gov/pub/data/ghcn/daily/

**Code-Erläuterung:** [Code-Erläuterung](users_guide/Code-Dokumentation.pdf)


# Projektstruktur und Dateibeschreibungen

Unten findest du eine strukturierte Übersicht aller Ordner und Dateien in diesem Repository – auf Deutsch. Du kannst den Text gerne für deine README anpassen oder neu formatieren.

---

## Repository-Struktur

### `__pycache__`
- **Was es ist:** Von Python automatisch erstelltes Verzeichnis, in dem vorkompilierte Bytecode-Dateien (`.pyc`) abgelegt werden.  
- **Wozu es dient:** Beschleunigt das Ausführen von Python-Code, da dieser nicht jedes Mal neu kompiliert werden muss.  
- **Hinweis:** Wird in der Regel nicht versioniert und kann bei Bedarf gefahrlos gelöscht werden.

### `app.cpython-313.pyc`
- **Was es ist:** Eine Bytecode-kompilierte Version von `app.py` für Python 3.13.  
- **Wozu es dient:** Beschleunigt das Ausführen von Python-Code.  
- **Hinweis:** Muss nicht manuell bearbeitet werden; kann bei Bedarf gelöscht werden.

---

### `.github/workflows/`
- **Was es ist:** Verzeichnis mit den GitHub-Actions-Workflows für CI/CD.  
- **Wozu es dient:** Automatisiert den Build-, Test- und Deployment-Prozess des Projekts.

  - **`docker-publish.yml`**  
    - **Zweck:** Baut und pusht ein Docker-Image in die GitHub Container Registry.  
    - **Wichtige Schritte:**
      1. Repository auschecken  
      2. Anmelden im GitHub Container Registry  
      3. Multi-Arch-Image (für `linux/amd64` und `linux/arm64`) bauen und pushen  
      4. Container mit `docker run` und optional mit `docker compose` testen  

  - **`python-app-test.yml`**  
    - **Zweck:** Führt Python-Tests aus (mit `pytest`) und prüft Codequalität (Linting via `flake8`, Formatierung via `black`).  
    - **Wichtige Schritte:**  
      1. Python-Abhängigkeiten installieren (aus `requirements.txt`)  
      2. Linting  
      3. Testdurchführung mit Coverage  
      4. Abbruch, falls Coverage < 80 %  

  - **`test.yml`**  
    - **Zweck:** Führt Browser-Tests mit Node.js, Puppeteer, Mocha und Chai aus.  
    - **Wichtige Schritte:**  
      1. Repository auschecken  
      2. Abhängigkeiten via `npm install`  
      3. Ausführen der Tests mit `npm test`

---

### `.venv/`
- **Was es ist:** Ein lokales Python-Virtual-Environment.  
- **Wozu es dient:** Trennt die Python-Abhängigkeiten dieses Projekts von System- oder anderen Projekten.  
- **Hinweis:** Wird oft nicht eingecheckt; kann aber für konsistente Entwicklungsumgebungen genutzt werden.

---

### `.vscode/`
- **Was es ist:** VS-Code-spezifische Einstellungen.  
- **Wozu es dient:** Legt z. B. Editor-Einstellungen für Linting, Debugging oder Formatierung fest.  
- **Hinweis:** Hilft dabei, Code-Standards in VS Code zu vereinheitlichen.

---

### `css/`
- **Was es ist:** Ordner für CSS-Dateien zur Gestaltung des Frontends.  
- **Wichtigste Datei:** `styles.css`  
  - **Zweck:** Haupt-Stylesheet der Anwendung.  
  - **Inhalt:** Layout-Regeln, Farbschemata, responsive Design, Animationen etc.

---

### `images/`
- **Was es ist:** Ordner für Bilddateien, die im Frontend verwendet werden.  
- **Wichtige Datei:** `Background.jpg`  
  - **Zweck:** Hintergrundbild, das auf der Hauptseite verwendet wird.

---

### `js/`
- **Was es ist:** Ordner für clientseitige JavaScript-Dateien.  
- **Wichtigste Datei:** `script.js`  
  - **Zweck:** Kernlogik für die Frontend-Funktionen wie Karteninteraktionen (Leaflet), Benutzereingaben, Datenabfragen und Diagrammerstellung (D3.js).  
  - **Inhalte:**  
    - Aktualisierung von Leaflet-Markern und Radius-Kreisen  
    - AJAX/Fetch-Aufrufe an Flask-Endpunkte  
    - Chart-Rendering und Tabellenerzeugung

---

### `templates/`
- **Was es ist:** Standardordner für Flask-Templates (HTML-Dateien).  
- **Wozu es dient:** Flask sucht hier nach Jinja-Templates für gerenderte Ansichten.  
- **Hinweis:** Das Projekt verwendet `index.html` direkt im Hauptverzeichnis. Zusätzliche Templates könnten jedoch hier liegen, falls benötigt.

---

### `index.html`
- **Was es ist:** Haupt-HTML-Datei, die Flask ausliefert.  
- **Zweck:**  
  - Definiert das Grundlayout, bindet CSS/JS ein und enthält Platzhalter für dynamische Daten (z. B. Anzahl Stationen).  
  - Stellt die Leaflet-Karte und den Chart-Bereich dar.

---

### `test_app.py`
- **Was es ist:** Python-Testskript (mit `pytest`) für die Backend-Funktionen.  
- **Zweck:**  
  - Testet die Flask-Routen (`/get_stations`, `/get_weather_data` etc.).  
  - Prüft Datenverarbeitung (z. B. NOAA-API-Integration, Parsing) und Fehlermeldungen.

---

### `test.html`
- **Was es ist:** HTML-Datei zum Ausführen von Client-Tests mit Mocha/Chai im Browser.  
- **Zweck:**  
  - Lädt `script.js` und `tests.js` im Browser.  
  - Zeigt Testresultate direkt in einer Weboberfläche an.

---

### `tests.js`
- **Was es ist:** JavaScript-Datei mit Testfällen für Mocha/Chai.  
- **Zweck:**  
  - Testet Frontend-Funktionen wie `fillMissingYears` oder `processWeatherData`.  
  - Stellt sicher, dass die browserseitige Logik (Charts, Datenaufbereitung) funktioniert.

---

### `users_guide/`
- **Was es ist:** Ordner, in dem weitere Dokumentationen oder Anleitungen für Endnutzer abgelegt werden können.  
- **Inhalt:** Könnte zusätzliche README-Dateien, Screenshots oder weiterführende Dokumente enthalten.

---

### `Code-Dokumentation.pdf` & `Code-Dokumentation-2.pdf`
- **Was es ist:** PDF-Dateien mit codebezogenen Erklärungen, Architekturübersichten oder Entwickler-Dokumentation.  
- **Zweck:** Liefert tiefergehende Informationen über Aufbau, Funktionen und Zusammenhänge im Code.

---

### `Projektdokumentation.pdf`
- **Was es ist:** PDF mit Projektinformationen (Planung, Meilensteine, Risikomanagement etc.).  
- **Zweck:** Gibt einen umfassenden Überblick über Projektziele, -umfang und zeitlichen Ablauf.

---

### `Dockerfile`
- **Was es ist:** Bauanleitung für das Docker-Image.  
- **Wichtige Schritte:**
  1. Startet mit `python:3.13.1` als Basis  
  2. Installiert Python-Abhängigkeiten aus `requirements.txt`  
  3. Kopiert den gesamten Projektinhalt in den Container  
  4. Startet die Flask-App über Gunicorn auf Port 8080

---

### `docker-compose.yml`
- **Was es ist:** Konfigurationsdatei, um den Container (oder mehrere Container) gemeinsam zu verwalten.  
- **Zweck:**  
  - Startet den Flask-Container mit festgelegtem Arbeitsspeicher und Port (8080)  
  - Erleichtert das Hoch- und Runterfahren via `docker compose up/down`

---

### `app.py`
- **Was es ist:** Zentrales Flask-Programm.  
- **Zweck:**
  - Stellt Routen bereit (z. B. `/get_stations`, `/get_weather_data`)  
  - Lädt Stationsdaten und Wetterdaten aus dem NOAA-GHCN-Archiv  
  - Speichert Ergebnisse im Cache, damit wiederholte Anfragen schneller beantwortet werden  
  - Enthält Hintergrund-Laderoutinen und globale Fehlerbehandlung  

---

### `package.json`
- **Was es ist:** Definition für Node.js, speziell für Browser-Tests.  
- **Zweck:**  
  - Listet die Entwicklungsabhängigkeiten (z. B. Puppeteer)  
  - Definiert das `test`-Skript, das Puppeteer + Mocha ausführt

---

### `runTests.js`
- **Was es ist:** Node.js-Skript zum Ausführen der Browser-Tests mit Puppeteer.  
- **Zweck:**
  - Öffnet `test.html` in einem headless Chromium  
  - Wartet auf das Testergebnis (Mocha)  
  - Bricht mit Fehlercode ab, wenn Tests fehlschlagen (wichtig für CI)

---

### `requirements.txt`
- **Was es ist:** Auflistung der Python-Abhängigkeiten.  
- **Inhalt:**  
  - Flask, Flask-CORS, requests, pandas, gunicorn, pytest etc.  
- **Zweck:** Sorgt für eine einheitliche Umgebung, damit das Projekt überall reproduzierbar installiert werden kann.

---

## Zusammenspiel der Komponenten

1. **Lokale Entwicklung:**
   - Erstelle am besten ein virtuelles Python-Environment (`.venv`) und installiere alle Pakete mit `pip install -r requirements.txt`.
   - Starte die Flask-App lokal über `python app.py`.

2. **Tests:**
   - **Python-Tests:** Mit `pytest` (oder über GitHub Actions per `python-app-test.yml`).
   - **Browser-Tests:** `test.html` manuell im Browser öffnen oder `npm test` ausführen (nutzt Puppeteer im Headless-Modus).

3. **Dockerisierung:**
   - **`Dockerfile`:** Baut das Image.
   - **`docker-compose.yml`:** Startet den Container mit Port 8080 und Ressourcenlimits.
   - **`docker-publish.yml`:** Baut das Image und pusht es automatisch in die GitHub Container Registry.

4. **Continuous Integration:**
   - Die GitHub-Actions in `.github/workflows/` werden bei jedem Push oder Pull Request ausgeführt, führen Tests durch und bauen ggf. Images.

5. **Dokumentation:**
   - Die PDFs (`Projektdokumentation.pdf`, `Code-Dokumentation.pdf`, etc.) geben Einblick in Code-Struktur, Projektmanagement und Architektur.

Diese Übersicht hilft Ihnen, sich in dem Projekt zurechtzufinden. Bei Bedarf bieten die PDF-Dateien eine vertiefende Dokumentation zum Code und zum Projektablauf.
