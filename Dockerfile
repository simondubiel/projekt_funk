# Basis-Image mit Python 3.13.1
FROM python:3.13.1

# Arbeitsverzeichnis setzen
WORKDIR /app

# Abhängigkeiten installieren
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App-Dateien kopieren
COPY . .

# Flask-Umgebungsvariablen setzen
ENV FLASK_APP=app.py
ENV FLASK_ENV=production
ENV PORT=8080

# Flask mit Gunicorn starten
CMD ["gunicorn", "-w", "1", "-b", "0.0.0.0:8080", "app:app"]