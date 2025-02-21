from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import requests
import pandas as pd
from io import StringIO
from math import radians, cos, sin, sqrt, atan2
import threading

# Basis-URL für die GHCN-Daily-Daten
GHCN_BASE_URL = "https://www.ncei.noaa.gov/pub/data/ghcn/daily/"

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)

# Globales Cache für Stationsdaten
cached_stations = None

@app.route('/')
def index():
    # Ensure stations are loaded (or trigger loading if not already done)
    stations = load_stations()
    station_count = len(stations) if stations is not None else 0
    return render_template("index.html", station_count=station_count)

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
    """
    Lädt die Stationsdaten aus der Datei ghcnd-stations.txt.
    Die Daten werden einmalig geladen und in der globalen Variable cached_stations gespeichert.
    Fehlende STATE-Werte werden durch "unknown" ersetzt.
    """
    global cached_stations
    if cached_stations is None:
        print("Loading station data from NOAA...")
        stations_url = f"{GHCN_BASE_URL}ghcnd-stations.txt"
        response = requests.get(stations_url)
        if response.status_code != 200:
            print("Failed to load station data. HTTP status code:", response.status_code)
            return None
        stations_data = response.text
        colspecs = [(0, 11), (12, 20), (21, 30), (31, 37), (38, 40), (41, 71)]
        columns = ['ID', 'LATITUDE', 'LONGITUDE', 'ELEVATION', 'STATE', 'NAME']
        cached_stations = pd.read_fwf(StringIO(stations_data), colspecs=colspecs, names=columns)
        cached_stations.dropna(subset=['LATITUDE', 'LONGITUDE'], inplace=True)
        cached_stations["STATE"] = cached_stations["STATE"].fillna("unknown")
        print("Station data loaded successfully.")
    return cached_stations

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
        print("Error parsing CSV data:", e)
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
        if len(line) < 269:  # Zeile zu kurz? -> überspringen
            continue
        station_id = line[0:11]
        try:
            year = int(line[11:15])
            month = int(line[15:17])
        except:
            continue
        element = line[17:21]
        # Für jeden Tag des Monats
        for day in range(1, 32):
            # VALUE: Spalten 22-26 (Index 21 bis 26)
            start_index = 21 + (day - 1) * 8
            end_index = start_index + 5
            value_str = line[start_index:end_index]
            try:
                value = int(value_str)
            except:
                continue
            if value == -9999:
                continue
            # Erzeuge Datum; ungültige Tage werden übersprungen
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
    Zuerst wird versucht, die CSV-Version aus by_station zu laden.
    Scheitert das (z. B. 404), wird als Fallback die .dly-Datei aus dem "all"-Verzeichnis abgerufen.
    """
    print(f"Fetching weather data for station {station_id} (CSV)...")
    csv_url = f"{GHCN_BASE_URL}by_station/{station_id}.csv"
    response = requests.get(csv_url)
    if response.status_code == 200:
        print(f"CSV data for station {station_id} fetched successfully.")
        df = parse_ghcnd_csv_from_string(response.text)
        return df
    else:
        print(f"CSV not available for station {station_id} (HTTP {response.status_code}). Trying .dly file...")
        dly_url = f"{GHCN_BASE_URL}all/{station_id}.dly"
        response2 = requests.get(dly_url)
        if response2.status_code == 200:
            print(f".dly data for station {station_id} fetched successfully.")
            df = parse_ghcnd_dly_from_string(response2.text)
            return df
        else:
            print(f"Failed to fetch weather data for station {station_id} from both CSV and .dly sources. HTTP status for .dly: {response2.status_code}")
            return None

@app.route('/get_stations', methods=['GET'])
def get_stations():
    try:
        latitude = float(request.args.get('latitude'))
        longitude = float(request.args.get('longitude'))
        radius_km = float(request.args.get('radius_km'))
        station_count = int(request.args.get('station_count', 10))
    except (TypeError, ValueError) as e:
        print("Invalid parameters for get_stations request:", e)
        return jsonify({"error": "Invalid parameters"}), 400

    stations_df = fetch_and_filter_stations(latitude, longitude, radius_km)
    stations_df = stations_df.head(station_count)
    stations = stations_df.to_dict(orient="records")
    print(f"Returning {len(stations)} stations for coordinates ({latitude}, {longitude}) with radius {radius_km} km.")
    return jsonify(stations)

@app.route('/get_weather_data', methods=['GET'])
def get_weather_data():
    """
    Ruft alle verfügbaren Wetterdaten für die angegebene Station ab.
    Anschließend wird lokal ermittelt, von wann bis wann Daten vorhanden sind.
    Es werden nur die Daten zurückgegeben, die im angegebenen Zeitraum liegen.
    """
    station_id = request.args.get('station_id')
    start_year = request.args.get('start_year')
    end_year = request.args.get('end_year')
    if not station_id:
        print("No station ID provided in get_weather_data request.")
        return jsonify({"error": "No station ID provided"}), 400

    weather_data = fetch_weather_data(station_id)
    if weather_data is None or weather_data.empty:
        print(f"No weather data found for station {station_id}.")
        return jsonify({"error": f"No data found for station {station_id}"}), 404

    # Logge den Gesamtzeitraum der verfügbaren Daten
    min_date = weather_data["DATE"].min()
    max_date = weather_data["DATE"].max()
    print(f"Weather data available for station {station_id} from {min_date} to {max_date}.")

    # Falls Start- und Endjahr angegeben sind, filtere die Daten lokal
    if start_year and end_year:
        try:
            start_year_int = int(start_year)
            end_year_int = int(end_year)
            filtered_data = weather_data[weather_data["DATE"].dt.year.between(start_year_int, end_year_int)]
            print(f"Filtered weather data for station {station_id} between {start_year_int} and {end_year_int}: {len(filtered_data)} records found.")
            weather_data = filtered_data
        except Exception as e:
            print("Error filtering weather data by year:", e)
            return jsonify({"error": "Invalid year parameters"}), 400

    return weather_data.to_json(orient='records')

@app.errorhandler(Exception)
def handle_global_error(error):
    print("Global error:", error)
    response = {"error": "Ein unerwarteter Fehler ist aufgetreten.", "details": str(error)}
    return jsonify(response), 500

if app.config.get("TESTING"):
    @app.route("/error")
    def error():
        raise Exception("Simulierter Fehler")

if __name__ == "__main__":
    # Starte einen Hintergrund-Thread zum Laden der Stationsdaten,
    # damit die Webseite sofort geladen wird.
    def background_load():
        print("Loading station data in background...")
        load_stations()
        print("Station data loaded in background.")

    thread = threading.Thread(target=background_load)
    thread.daemon = True
    thread.start()

    print("Starting the app.")
    app.run(debug=True)