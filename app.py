from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import requests
import pandas as pd
from io import StringIO
from math import radians, cos, sin, sqrt, atan2

# Basis-URL für die GHCN-Daily-Daten
GHCN_BASE_URL = "https://www.ncei.noaa.gov/pub/data/ghcn/daily/"

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)

# Route to serve index.html
@app.route('/')
def index():
    return render_template("index.html")

def haversine(lat1, lon1, lat2, lon2):
    """Berechnet die Entfernung zwischen zwei Punkten auf der Erde in km."""
    R = 6371.0  # Erdradius in Kilometern
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2)**2 + cos(lat1) * cos(lat2) * sin(dlon / 2)**2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return R * c

def load_stations():
    """Lädt die Stationsdaten aus der Datei ghcnd-stations.txt"""
    stations_url = f"{GHCN_BASE_URL}ghcnd-stations.txt"
    response = requests.get(stations_url)
    if response.status_code != 200:
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
        return pd.DataFrame()
    stations_df["DISTANCE"] = stations_df.apply(
        lambda row: haversine(lat, lon, row['LATITUDE'], row['LONGITUDE']), axis=1
    )
    return stations_df[stations_df["DISTANCE"] <= radius_km].sort_values(by="DISTANCE")

def fetch_weather_data(station_id):
    """Lädt Wetterdaten für eine Station von der NOAA-Website als CSV-Datei."""
    station_url = f"{GHCN_BASE_URL}by_station/{station_id}.csv"
    response = requests.get(station_url)
    
    if response.status_code != 200:
        return None
    
    return parse_ghcn_csv_from_string(response.text)

def parse_ghcn_csv_from_string(data):
    """Parst die CSV-Daten in ein Pandas DataFrame."""
    col_names = ["ID", "DATE", "ELEMENT", "VALUE", "M-FLAG", "Q-FLAG", "S-FLAG", "OBS-TIME"]
    df = pd.read_csv(StringIO(data), names=col_names, dtype=str)
    
    # Konvertiere das Datum in datetime-Format
    df["DATE"] = pd.to_datetime(df["DATE"], format="%Y%m%d", errors="coerce")
    
    # Wandle den Wertebereich um und entferne ungültige Werte (-9999)
    df["VALUE"] = pd.to_numeric(df["VALUE"], errors="coerce")
    df.loc[df["VALUE"] == -9999, "VALUE"] = None
    
    df.dropna(subset=["VALUE"], inplace=True)

    return df[["DATE", "ELEMENT", "VALUE"]]

@app.route('/get_weather_data', methods=['GET'])
def get_weather_data():
    station_id = request.args.get('station_id')
    if not station_id:
        return jsonify({"error": "No station ID provided"}), 400
    weather_data = fetch_weather_data(station_id)
    if weather_data is None or weather_data.empty:
        return jsonify({"error": f"No data found for station {station_id}"}), 404
    return weather_data.to_json(orient='records')

@app.errorhandler(Exception)
def handle_global_error(error):
    """Globaler Fehler-Handler, der alle unerwarteten Fehler abfängt."""
    response = {"error": "Ein unerwarteter Fehler ist aufgetreten.", "details": str(error)}
    return jsonify(response), 500

if __name__ == "__main__":
    app.run(debug=True)