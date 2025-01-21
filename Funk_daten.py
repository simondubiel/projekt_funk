import sys
import requests
import pandas as pd
from io import StringIO
from math import radians, cos, sin, sqrt, atan2
from PySide6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QLabel, QLineEdit, QPushButton, 
    QTableWidget, QTableWidgetItem, QSpinBox
)
from PySide6.QtCore import Qt
from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg as FigureCanvas
import matplotlib.pyplot as plt

# Basis-URL für die GHCN-Daily-Daten
GHCN_BASE_URL = "https://www.ncei.noaa.gov/pub/data/ghcn/daily/"

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

def load_stations():
    """Lädt die Stationsdaten aus der Datei ghcnd-stations.txt"""
    stations_url = f"{GHCN_BASE_URL}ghcnd-stations.txt"
    
    response = requests.get(stations_url)
    if response.status_code != 200:
        print("Fehler beim Laden der Stationsdaten")
        return None

    stations_data = response.text

    colspecs = [(0, 11), (12, 20), (21, 30), (31, 37), (38, 40), (41, 71)]
    columns = ['ID', 'LATITUDE', 'LONGITUDE', 'ELEVATION', 'STATE', 'NAME']

    stations_df = pd.read_fwf(StringIO(stations_data), colspecs=colspecs, names=columns)
    stations_df.dropna(subset=['LATITUDE', 'LONGITUDE'], inplace=True)
    
    return stations_df

def fetch_and_filter_stations(lat, lon, radius_km):
    """Filtert Stationen basierend auf Koordinaten und Radius."""
    stations_df = load_stations()
    if stations_df is None:
        return []
    
    stations_df["DISTANCE"] = stations_df.apply(
        lambda row: haversine(lat, lon, row['LATITUDE'], row['LONGITUDE']), axis=1
    )

    filtered_stations = stations_df[stations_df["DISTANCE"] <= radius_km].sort_values(by="DISTANCE")

    return filtered_stations

def fetch_weather_data(station_id):
    """Lädt Wetterdaten für eine Station von der NOAA-Website herunter."""
    station_url = f"{GHCN_BASE_URL}all/{station_id}.dly"

    response = requests.get(station_url)
    if response.status_code != 200:
        print(f"Fehler beim Abrufen der Wetterdaten für Station {station_id}")
        return None

    return parse_ghcn_dly_from_string(response.text)

def parse_ghcn_dly_from_string(data):
    """Parst die .dly-Daten in ein Pandas DataFrame."""
    colspecs = [
        (0, 11), (11, 15), (15, 17), (17, 21)
    ] + [(21 + 8 * i, 26 + 8 * i) for i in range(31)]

    col_names = ['ID', 'YEAR', 'MONTH', 'ELEMENT'] + [f'DAY_{i+1}' for i in range(31)]

    df = pd.read_fwf(StringIO(data), colspecs=colspecs, names=col_names)
    df.replace(-9999, None, inplace=True)

    df = df.melt(id_vars=['ID', 'YEAR', 'MONTH', 'ELEMENT'], var_name="DAY", value_name="VALUE")
    df['DAY'] = df['DAY'].str.extract('(\d+)').astype(int)

    df['DATE'] = pd.to_datetime(df[['YEAR', 'MONTH', 'DAY']], errors='coerce')
    df.dropna(subset=['VALUE'], inplace=True)

    return df[['DATE', 'ELEMENT', 'VALUE']]

class WeatherStationFinder(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Wetterstation Finder (GHCN-Daily)")
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
        try:
            lat = float(self.lat_input.text().strip())
            lon = float(self.lon_input.text().strip())
            radius = self.radius_input.value()

            stations = fetch_and_filter_stations(lat, lon, radius)

            if not stations.empty:
                self.populate_table(stations)
            else:
                self.show_error("Keine Stationen im Radius gefunden.")
        except ValueError:
            self.show_error("Bitte gültige Koordinaten eingeben.")

    def populate_table(self, stations):
        """Füllt die Tabelle mit gefundenen Stationen."""
        self.table.setRowCount(len(stations))
        for row_idx, (_, station) in enumerate(stations.iterrows()):
            self.table.setItem(row_idx, 0, QTableWidgetItem(station["ID"]))
            self.table.setItem(row_idx, 1, QTableWidgetItem(station["NAME"]))
            self.table.setItem(row_idx, 2, QTableWidgetItem(str(station["LATITUDE"])))
            self.table.setItem(row_idx, 3, QTableWidgetItem(str(station["LONGITUDE"])))
            self.table.setItem(row_idx, 4, QTableWidgetItem(f"{station['DISTANCE']:.2f} km"))

    def select_station(self):
        """Wählt eine Station aus der Tabelle aus und ruft Wetterdaten ab."""
        selected_row = self.table.currentRow()
        if selected_row == -1:
            self.show_error("Bitte wählen Sie eine Station aus.")
            return

        station_id = self.table.item(selected_row, 0).text()
        weather_data = fetch_weather_data(station_id)

        if weather_data is not None and not weather_data.empty:
            self.weather_data_label.setText(f"Wetterdaten für {station_id} gefunden")
        else:
            self.show_error("Keine Wetterdaten gefunden.")

    def show_error(self, message):
        error_label = QLabel(message, self)
        error_label.setStyleSheet("color: red;")
        self.layout().addWidget(error_label)

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = WeatherStationFinder()
    window.show()
    sys.exit(app.exec())