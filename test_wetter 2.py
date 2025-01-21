import sys
import matplotlib.dates as mdates
import requests
from math import radians, cos, sin, sqrt, atan2
from PySide6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QLabel, QLineEdit, QPushButton, 
    QTableWidget, QTableWidgetItem, QSpinBox
)
from PySide6.QtCore import Qt
from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg as FigureCanvas
import matplotlib.pyplot as plt

# NOAA API Details
API_BASE_URL = "https://www.ncei.noaa.gov/cdo-web/api/v2/"
API_TOKEN = "vLWftBvjohXMMDYJpTsOhyNifKFmyICt"  # Ersetze mit deinem API-Token


def haversine(lat1, lon1, lat2, lon2):
    """Berechnet die Entfernung zwischen zwei Punkten auf der Erde in km."""
    R = 6371.0  # Erdradius in Kilometern

    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = sin(dlat / 2)**2 + cos(lat1) * cos(lat2) * sin(dlon / 2)**2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    distance = R * c
    return distance


def fetch_and_filter_stations(lat, lon, radius_km):
    """Ruft alle Wetterstationen von der NOAA API ab und filtert sie basierend auf dem Radius."""
    url = f"{API_BASE_URL}stations"
    params = {
        "limit": 1000,
        "sortfield": "name",
        "sortorder": "asc"
    }
    headers = {"token": API_TOKEN}

    try:
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()

        if response.status_code == 200 and response.text.strip():
            all_stations = response.json().get("results", [])
            
            # Stationen im Umkreis filtern
            filtered_stations = []
            for station in all_stations:
                station_lat = station["latitude"]
                station_lon = station["longitude"]

                distance = haversine(lat, lon, station_lat, station_lon)
                if distance <= radius_km:
                    filtered_stations.append({
                        "id": station["id"],
                        "name": station["name"],
                        "latitude": station_lat,
                        "longitude": station_lon,
                        "distance_km": round(distance, 2)
                    })

            return sorted(filtered_stations, key=lambda x: x["distance_km"])
        else:
            return []
    except Exception as e:
        print(f"Fehler beim Abrufen der Stationen: {e}")
        return []


def fetch_weather_data(station_id):
    """Ruft Wetterdaten für eine ausgewählte Station ab."""
    url = f"{API_BASE_URL}data"
    params = {
        "datasetid": "GHCND",
        "stationid": station_id,
        "startdate": "2023-01-01",
        "enddate": "2023-12-31",
        "limit": 100
    }
    headers = {"token": API_TOKEN}

    try:
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()

        if response.status_code == 200 and response.text.strip():
            weather_data = response.json().get("results", [])
            return weather_data
        else:
            return None
    except Exception as e:
        print(f"Fehler beim Abrufen der Wetterdaten: {e}")
        return None


class WeatherStationFinder(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Wetterstation Finder")
        self.setGeometry(100, 100, 800, 600)
        self.initUI()

    def initUI(self):
        layout = QVBoxLayout()

        # Eingabe für geographische Koordinaten
        self.lat_input = QLineEdit(self)
        self.lat_input.setPlaceholderText("Breitengrad (z.B. 52.5162)")
        layout.addWidget(QLabel("Breitengrad:"))
        layout.addWidget(self.lat_input)

        self.lon_input = QLineEdit(self)
        self.lon_input.setPlaceholderText("Längengrad (z.B. 13.3777)")
        layout.addWidget(QLabel("Längengrad:"))
        layout.addWidget(self.lon_input)

        # Suchradius
        self.radius_input = QSpinBox(self)
        self.radius_input.setRange(1, 500)
        self.radius_input.setValue(50)
        layout.addWidget(QLabel("Suchradius (km):"))
        layout.addWidget(self.radius_input)

        # Such-Button
        self.search_button = QPushButton("Stationen suchen", self)
        self.search_button.clicked.connect(self.fetch_stations)
        layout.addWidget(self.search_button)

        # Ergebnis-Tabelle für Stationen
        self.table = QTableWidget(self)
        self.table.setColumnCount(5)
        self.table.setHorizontalHeaderLabels(["ID", "Name", "Lat", "Lon", "Distanz (km)"])
        layout.addWidget(self.table)

        # Auswahl-Button für Stationen
        self.select_button = QPushButton("Station auswählen", self)
        self.select_button.clicked.connect(self.select_station)
        layout.addWidget(self.select_button)

        # Wetterdaten-Ausgabe
        self.weather_data_label = QLabel("", self)
        layout.addWidget(self.weather_data_label)

        # Matplotlib Chart
        self.canvas = FigureCanvas(plt.Figure(figsize=(6, 4)))
        layout.addWidget(self.canvas)

        self.setLayout(layout)

    def fetch_stations(self):
        """Sucht nach Wetterstationen basierend auf Koordinaten und Radius."""
        lat = float(self.lat_input.text().strip())
        lon = float(self.lon_input.text().strip())
        radius = self.radius_input.value()

        stations = fetch_and_filter_stations(lat, lon, radius)

        if stations:
            self.populate_table(stations)
        else:
            self.show_error("Keine Stationen im Radius gefunden.")

    def populate_table(self, stations):
        """Füllt die Tabelle mit gefundenen Stationen."""
        self.table.setRowCount(len(stations))
        for row_idx, station in enumerate(stations):
            self.table.setItem(row_idx, 0, QTableWidgetItem(station["id"]))
            self.table.setItem(row_idx, 1, QTableWidgetItem(station["name"]))
            self.table.setItem(row_idx, 2, QTableWidgetItem(str(station["latitude"])))
            self.table.setItem(row_idx, 3, QTableWidgetItem(str(station["longitude"])))
            self.table.setItem(row_idx, 4, QTableWidgetItem(f"{station['distance_km']} km"))

    def select_station(self):
        """Wählt eine Station aus der Tabelle aus und ruft Wetterdaten ab."""
        selected_row = self.table.currentRow()
        if selected_row == -1:
            self.show_error("Bitte wählen Sie eine Station aus.")
            return

        station_id = self.table.item(selected_row, 0).text()
        weather_data = fetch_weather_data(station_id)

        if weather_data:
            self.weather_data_label.setText(f"Wetterdaten für {station_id}: {len(weather_data)} Einträge gefunden")
            self.plot_weather_data(weather_data)
        else:
            self.show_error("Keine Wetterdaten gefunden.")

    def plot_weather_data(self, weather_data):
        """Zeigt Wetterdaten grafisch an."""
        from datetime import datetime

        # Konvertiere Datumswerte in Python-Datetime-Objekte
        dates = [datetime.strptime(entry["date"], "%Y-%m-%dT%H:%M:%S") for entry in weather_data]
        values = [entry["value"] / 10.0 for entry in weather_data]  # Werte sind in Zehntel °C

        self.canvas.figure.clear()
        ax = self.canvas.figure.add_subplot(111)

        # Plot der Werte
        ax.plot(dates, values, marker='o', label="Temperaturverlauf")

        # Setze das Intervall der X-Achse auf 10 Jahre
        ax.xaxis.set_major_locator(mdates.YearLocator(10))  # Alle 10 Jahre ein Ticker
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))  # Nur das Jahr anzeigen

        # Berechne und zeichne den Mittelwert als horizontale Linie
        avg_value = sum(values) / len(values)
        ax.axhline(avg_value, color="red", linestyle="--", label=f"Mittelwert: {avg_value:.2f} °C")

        # Berechne und zeichne eine lineare Trendlinie
        import numpy as np
        num_dates = mdates.date2num(dates)  # Konvertiere Datumsangaben für Trendberechnung
        z = np.polyfit(num_dates, values, 1)  # Lineare Regression
        p = np.poly1d(z)
        ax.plot(dates, p(num_dates), label="Trendlinie", linestyle="--", color="green")

        # Achsentitel und Raster setzen
        ax.set_title("Temperaturverlauf")
        ax.set_xlabel("Jahr")
        ax.set_ylabel("Temperatur (°C)")
        ax.legend()
        ax.grid(True)

        # Automatische Rotation der Datumsbeschriftung für bessere Lesbarkeit
        plt.setp(ax.xaxis.get_majorticklabels(), rotation=45)

        self.canvas.draw()

    def show_error(self, message):
        """Zeigt eine Fehlermeldung an."""
        error_label = QLabel(message, self)
        error_label.setStyleSheet("color: red;")
        self.layout().addWidget(error_label)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = WeatherStationFinder()
    window.show()
    sys.exit(app.exec())
