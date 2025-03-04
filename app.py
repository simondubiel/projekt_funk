# app.py
import os
import logging
from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
from flask_caching import Cache
import requests
import pandas as pd
from io import StringIO
from math import radians, cos, sin, sqrt, atan2
import threading

# --- Configuration & Logging ---
# Read the NOAA base URL from an environment variable (with a default value)
GHCN_BASE_URL = os.getenv("GHCN_BASE_URL", "https://www.ncei.noaa.gov/pub/data/ghcn/daily/")

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Flask App Setup ---
app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)
cache = Cache(app, config={'CACHE_TYPE': 'simple'})  # Use simple caching for demonstration

# Global requests session for connection reuse
session = requests.Session()

# --- Utility Functions ---

def haversine(lat1, lon1, lat2, lon2):
    """Berechnet die Entfernung zwischen zwei Punkten auf der Erde in km."""
    R = 6371.0  # Erdradius in Kilometern
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return R * c

@cache.cached(timeout=3600, key_prefix='ghcn_stations')
def load_stations():
    """
    Lädt die Stationsdaten aus der NOAA-Datei.  
    Die Daten werden über Flask-Caching zwischengespeichert.
    """
    logger.info("Loading station data from NOAA...")
    stations_url = f"{GHCN_BASE_URL}ghcnd-stations.txt"
    try:
        response = session.get(stations_url, timeout=10)
    except Exception as e:
        logger.error("Error during station data request: %s", e)
        return None
    if response.status_code != 200:
        logger.error("Failed to load station data. HTTP status code: %s", response.status_code)
        return None
    stations_data = response.text
    colspecs = [(0, 11), (12, 20), (21, 30), (31, 37), (38, 40), (41, 71)]
    columns = ['ID', 'LATITUDE', 'LONGITUDE', 'ELEVATION', 'STATE', 'NAME']
    stations_df = pd.read_fwf(StringIO(stations_data), colspecs=colspecs, names=columns)
    stations_df.dropna(subset=['LATITUDE', 'LONGITUDE'], inplace=True)
    stations_df["STATE"] = stations_df["STATE"].fillna("unknown")
    logger.info("Station data loaded successfully.")
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

def parse_ghcnd_csv_from_string(data):
    """
    Parst die CSV-Daten (by_station) in ein Pandas DataFrame.
    """
    col_names = ["ID", "DATE", "ELEMENT", "VALUE", "M-FLAG", "Q-FLAG", "S-FLAG", "OBS-TIME"]
    try:
        df = pd.read_csv(StringIO(data), names=col_names, dtype=str)
    except Exception as e:
        logger.error("Error parsing CSV data: %s", e)
        return pd.DataFrame()
    
    df["DATE"] = pd.to_datetime(df["DATE"], format="%Y%m%d", errors="coerce")
    df["VALUE"] = pd.to_numeric(df["VALUE"], errors="coerce")
    df.loc[df["VALUE"] == -9999, "VALUE"] = None
    df.dropna(subset=["VALUE"], inplace=True)
    return df[["DATE", "ELEMENT", "VALUE"]]

def parse_ghcnd_dly_from_string(data):
    """
    Parst die .dly-Daten (monatsweise fixe Breiten) in ein Pandas DataFrame.
    Jede Zeile enthält einen Monat. Es werden für jeden Tag (1-31) die Werte extrahiert.
    Fehlende Werte (d.h. -9999) werden ignoriert.
    """
    records = []
    lines = data.splitlines()
    for line in lines:
        if len(line) < 269:
            continue
        station_id = line[0:11]
        try:
            year = int(line[11:15])
            month = int(line[15:17])
        except:
            continue
        element = line[17:21]
        for day in range(1, 32):
            start_index = 21 + (day - 1) * 8
            end_index = start_index + 5
            value_str = line[start_index:end_index]
            try:
                value = int(value_str)
            except:
                continue
            if value == -9999:
                continue
            try:
                date = pd.Timestamp(year=year, month=month, day=day)
            except Exception:
                continue
            records.append({"DATE": date, "ELEMENT": element, "VALUE": value})
    df = pd.DataFrame(records)
    return df

def fetch_weather_data(station_id):
    """
    Versucht, alle verfügbaren Wetterdaten für die Station abzurufen.  
    Zuerst wird versucht, die CSV-Version zu laden. Scheitert dies,  
    wird als Fallback die .dly-Datei abgerufen.
    """
    logger.info("Fetching weather data for station %s (CSV)...", station_id)
    csv_url = f"{GHCN_BASE_URL}by_station/{station_id}.csv"
    try:
        response = session.get(csv_url, timeout=10)
    except Exception as e:
        logger.error("Error fetching CSV for station %s: %s", station_id, e)
        return None
    if response.status_code == 200:
        logger.info("CSV data for station %s fetched successfully.", station_id)
        df = parse_ghcnd_csv_from_string(response.text)
        return df
    else:
        logger.info("CSV not available for station %s (HTTP %s). Trying .dly file...", station_id, response.status_code)
        dly_url = f"{GHCN_BASE_URL}all/{station_id}.dly"
        try:
            response2 = session.get(dly_url, timeout=10)
        except Exception as e:
            logger.error("Error fetching .dly for station %s: %s", station_id, e)
            return None
        if response2.status_code == 200:
            logger.info(".dly data for station %s fetched successfully.", station_id)
            df = parse_ghcnd_dly_from_string(response2.text)
            return df
        else:
            logger.error("Failed to fetch weather data for station %s from both CSV and .dly sources. HTTP status for .dly: %s", station_id, response2.status_code)
            return None

# --- API Endpoints ---

@app.route('/')
def index():
    stations = load_stations()
    station_count = len(stations) if stations is not None else 0
    return render_template("index.html", station_count=station_count)

@app.route('/get_stations', methods=['GET'])
def get_stations():
    try:
        latitude = float(request.args.get('latitude'))
        longitude = float(request.args.get('longitude'))
        radius_km = float(request.args.get('radius_km'))
        station_count = int(request.args.get('station_count', 10))
    except (TypeError, ValueError) as e:
        logger.error("Invalid parameters for get_stations request: %s", e)
        return jsonify({"error": "Invalid parameters"}), 400

    stations_df = fetch_and_filter_stations(latitude, longitude, radius_km)
    stations_df = stations_df.head(station_count)
    stations = stations_df.to_dict(orient="records")
    logger.info("Returning %d stations for coordinates (%f, %f) with radius %f km.",
                len(stations), latitude, longitude, radius_km)
    return jsonify(stations)

@app.route('/get_weather_data', methods=['GET'])
def get_weather_data():
    station_id = request.args.get('station_id')
    start_year = request.args.get('start_year')
    end_year = request.args.get('end_year')
    if not station_id:
        logger.error("No station ID provided in get_weather_data request.")
        return jsonify({"error": "No station ID provided"}), 400

    weather_data = fetch_weather_data(station_id)
    if weather_data is None or weather_data.empty:
        logger.error("No weather data found for station %s.", station_id)
        return jsonify({"error": f"No data found for station {station_id}"}), 404

    min_date = weather_data["DATE"].min()
    max_date = weather_data["DATE"].max()
    logger.info("Weather data available for station %s from %s to %s.", station_id, min_date, max_date)

    if start_year and end_year:
        try:
            start_year_int = int(start_year)
            end_year_int = int(end_year)
            filtered_data = weather_data[weather_data["DATE"].dt.year.between(start_year_int, end_year_int)]
            logger.info("Filtered weather data for station %s between %d and %d: %d records found.",
                        station_id, start_year_int, end_year_int, len(filtered_data))
            weather_data = filtered_data
        except Exception as e:
            logger.error("Error filtering weather data by year: %s", e)
            return jsonify({"error": "Invalid year parameters"}), 400

    return weather_data.to_json(orient='records')

@app.errorhandler(Exception)
def handle_global_error(error):
    logger.error("Global error: %s", error)
    response = {"error": "Ein unerwarteter Fehler ist aufgetreten.", "details": str(error)}
    return jsonify(response), 500

if app.config.get("TESTING"):
    @app.route("/error")
    def error():
        raise Exception("Simulierter Fehler")

if __name__ == "__main__":
    def background_load():
        logger.info("Loading station data in background...")
        load_stations()
        logger.info("Station data loaded in background.")

    thread = threading.Thread(target=background_load)
    thread.daemon = True
    thread.start()

    logger.info("Starting the app.")
    app.run(debug=True)