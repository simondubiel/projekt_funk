from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import requests
import pandas as pd
from io import StringIO
from math import radians, cos, sin, sqrt, atan2
import threading

GHCN_BASE_URL = "https://www.ncei.noaa.gov/pub/data/ghcn/daily/"

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)

cached_stations = None
cached_inventory = None
preloading_complete = False

@app.route('/preload_status')
def preload_status():
    if preloading_complete:
        return jsonify({"status": "done"})
    return jsonify({"status": "loading"})

@app.route('/')
def index():
    stations = load_stations()
    station_count = len(stations) if stations is not None else 0
    return render_template("index.html", station_count=station_count)

def haversine(lat1, lon1, lat2, lon2):
    """Berechnet die Entfernung zwischen zwei Punkten auf der Erde in km."""
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2)**2 + cos(lat1) * cos(lat2) * sin(dlon / 2)**2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return R * c

def load_stations():
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
        df_stations = pd.read_fwf(StringIO(stations_data), colspecs=colspecs, names=columns)
        df_stations.dropna(subset=['LATITUDE', 'LONGITUDE'], inplace=True)
        df_stations["STATE"] = df_stations["STATE"].fillna("unknown")
        print("Station data loaded successfully.")
        
        inventory_df = load_inventory()
        if inventory_df is None:
            print("Failed to load inventory data. Returning station data without filtering.")
            cached_stations = df_stations
        else:
            valid_inventory = inventory_df[inventory_df['ELEMENT'].isin(['TMIN', 'TMAX'])]
            valid_station_ids = valid_inventory.groupby('ID')['ELEMENT'].nunique()
            valid_station_ids = valid_station_ids[valid_station_ids == 2].index.tolist()
            df_stations = df_stations[df_stations['ID'].isin(valid_station_ids)]
            cached_stations = df_stations
            print(f"Filtered stations: {len(cached_stations)} stations have both TMIN and TMAX data.")
    return cached_stations

def load_inventory():
    global cached_inventory
    if cached_inventory is not None:
        return cached_inventory

    print("Loading inventory data from NOAA...")
    inventory_url = f"{GHCN_BASE_URL}ghcnd-inventory.txt"
    response = requests.get(inventory_url)
    if response.status_code != 200:
        print("Failed to load inventory data. HTTP status code:", response.status_code)
        return None
    inventory_data = response.text
    colspecs = [(0, 11), (12, 20), (21, 30), (31, 35), (36, 40), (41, 45)]
    columns = ['ID', 'LATITUDE', 'LONGITUDE', 'ELEMENT', 'FIRSTYEAR', 'LASTYEAR']
    cached_inventory = pd.read_fwf(StringIO(inventory_data), colspecs=colspecs, names=columns)
    cached_inventory.dropna(subset=['ID'], inplace=True)
    print("Inventory data loaded successfully.")
    return cached_inventory

def fetch_and_filter_stations(lat, lon, radius_km):
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
    Zuerst wird versucht, die CSV-Version aus by_station zu laden.
    Scheitert das, wird als Fallback die .dly-Datei aus dem "all"-Verzeichnis abgerufen.
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
        start_year = int(request.args.get('start_year'))
        end_year = int(request.args.get('end_year'))
    except (TypeError, ValueError) as e:
        print("Invalid parameters for get_stations request:", e)
        return jsonify({"error": "Invalid parameters"}), 400

    stations_df = fetch_and_filter_stations(latitude, longitude, radius_km)
    if stations_df is None or stations_df.empty:
         return jsonify([])

    inventory_df = load_inventory()
    if inventory_df is None or inventory_df.empty:
         print("No inventory data available")
         return jsonify([])

    valid_inventory_tmin = inventory_df[
        (inventory_df['ELEMENT'] == 'TMIN') &
        (inventory_df['FIRSTYEAR'].astype(int) <= start_year) &
        (inventory_df['LASTYEAR'].astype(int) >= end_year)
    ]
    valid_inventory_tmax = inventory_df[
        (inventory_df['ELEMENT'] == 'TMAX') &
        (inventory_df['FIRSTYEAR'].astype(int) <= start_year) &
        (inventory_df['LASTYEAR'].astype(int) >= end_year)
    ]
    valid_station_ids = set(valid_inventory_tmin['ID']).intersection(set(valid_inventory_tmax['ID']))

    stations_df = stations_df[stations_df['ID'].isin(valid_station_ids)]
    stations_df = stations_df.head(station_count)
    stations = stations_df.to_dict(orient="records")
    print(f"Returning {len(stations)} stations for coordinates ({latitude}, {longitude}) with radius {radius_km} km that have TMIN/TMAX data between {start_year} and {end_year}.")
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

    min_date = weather_data["DATE"].min()
    max_date = weather_data["DATE"].max()
    print(f"Weather data available for station {station_id} from {min_date} to {max_date}.")

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

preload_started = False

@app.before_request
def start_background_preload_once():
    global preload_started, preloading_complete
    if not preload_started:
        preload_started = True
        def background_load():
            global preloading_complete
            print("Preloading station and inventory data...")
            load_stations()
            load_inventory()
            preloading_complete = True
            print("Preloading complete.")
        threading.Thread(target=background_load, daemon=True).start()

if __name__ == "__main__":
    def background_load():
        global preloading_complete
        print("Preloading station and inventory data...")
        load_stations()
        load_inventory()
        preloading_complete = True
        print("Preloading complete.")

    print("Starting the app.")
    app.run(debug=False)

