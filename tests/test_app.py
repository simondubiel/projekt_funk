import pytest
import requests
import pandas as pd
from app import (
    haversine,
    fetch_and_filter_stations,
    fetch_weather_data,
    load_stations,
    parse_ghcnd_csv_from_string,
    parse_ghcnd_dly_from_string,
    app,
    load_inventory,
)

BASE_URL = "http://127.0.0.1:5000"


@pytest.fixture
def client():
    """Fixture zur Initialisierung des Flask-Testclients."""
    with app.test_client() as client:
        yield client



# --- Test for load_inventory() ---
def test_load_inventory(monkeypatch):
    """Test loading of inventory data."""
    # Example inventory data in fixed-width format (dummy values)
    mock_inventory = (
        "USW00094728"    # indices 0-10: ID (11 chars)
        " "              # index 11 filler
        " 40.783 "       # indices 12-19: LATITUDE (8 chars; note the trailing space)
        " "              # index 20 filler
        "  -73.967"      # indices 21-29: LONGITUDE (9 chars)
        " "              # index 30 filler
        "TMIN"           # indices 31-34: ELEMENT (4 chars)
        " "              # index 35 filler
        "1900"           # indices 36-39: FIRSTYEAR (4 chars)
        " "              # index 40 filler
        "2020"           # indices 41-44: LASTYEAR (4 chars)
        "\n"
        "USW00094728"    
        " "              
        " 40.783 "       
        " "              
        "  -73.967"      
        " "              
        "TMAX"           
        " "              
        "1900"           
        " "              
        "2020"           
        "\n"
    )
    def mock_requests_get(url, *args, **kwargs):
        class MockResponse:
            status_code = 200
            text = mock_inventory
        return MockResponse()
    monkeypatch.setattr(requests, "get", mock_requests_get)
    inventory_df = load_inventory()
    assert not inventory_df.empty
    assert "ID" in inventory_df.columns
    # Check that both TMIN and TMAX records are present
    assert "TMIN" in inventory_df["ELEMENT"].values
    assert "TMAX" in inventory_df["ELEMENT"].values

# --- Test for /preload_status endpoint ---
@pytest.fixture
def client():
    with app.test_client() as client:
        yield client

def test_preload_status(client):
    """Test the preload status endpoint returns a valid status."""
    response = client.get("/preload_status")
    assert response.status_code == 200
    assert response.json["status"] in ["loading", "done"]

# --- Test for fallback in fetch_weather_data (using .dly) ---
def test_fetch_weather_data_fallback(monkeypatch):
    """Test that when CSV data is not available, the .dly fallback is used."""
    # First request (CSV) fails
    def mock_requests_get(url, *args, **kwargs):
        class MockResponse:
            status_code = 404
            text = ""
        return MockResponse()
    monkeypatch.setattr(requests, "get", mock_requests_get)

    # Since we don't have a valid .dly example, expect the function to return None
    from app import fetch_weather_data
    weather_data = fetch_weather_data("USW00094728")
    assert weather_data is None

# --- Test for parse_ghcnd_dly_from_string with empty data ---
def test_parse_ghcnd_dly_from_string_empty():
    """Test that an empty .dly string returns an empty DataFrame."""
    df = parse_ghcnd_dly_from_string("")
    assert df.empty

# **Test für `haversine()`**
def test_haversine():
    """Testet die Entfernung zwischen zwei Koordinaten."""
    dist = haversine(52.5200, 13.4050, 48.8566, 2.3522)  # Berlin → Paris
    assert round(dist, 2) == 877.46  # Erwartet 877,46 km Entfernung

    # Test für gleiche Koordinaten (Erwartung: 0 km)
    assert haversine(52.5200, 13.4050, 52.5200, 13.4050) == 0


# **Test für `load_stations()`**
def test_load_stations(monkeypatch):
    """Testet das Laden der Wetterstationen."""
    mock_data = "USW00094728   40.783  -73.967  39.9 NY NEW YORK CITY CENTRAL PARK"

    def mock_requests_get(*args, **kwargs):
        class MockResponse:
            status_code = 200
            text = mock_data
        return MockResponse()

    monkeypatch.setattr(requests, "get", mock_requests_get)

    stations_df = load_stations()
    assert not stations_df.empty
    assert "ID" in stations_df.columns
    assert stations_df.iloc[0]["ID"] == "USW00094728"


# **Test für `fetch_and_filter_stations()`**
def test_fetch_and_filter_stations(monkeypatch):
    """Testet das Filtern von Wetterstationen nach Koordinaten und Radius."""
    mock_data = "USW00094728   40.783  -73.967  39.9 NY NEW YORK CITY CENTRAL PARK"

    def mock_requests_get(*args, **kwargs):
        class MockResponse:
            status_code = 200
            text = mock_data
        return MockResponse()

    monkeypatch.setattr(requests, "get", mock_requests_get)

    filtered_stations = fetch_and_filter_stations(40.7, -74.0, 50)  # New York, Radius 50 km
    assert not filtered_stations.empty
    assert "ID" in filtered_stations.columns
    assert filtered_stations.iloc[0]["ID"] == "USW00094728"


# **Test für `fetch_weather_data()` mit CSV**
def test_fetch_weather_data(monkeypatch):
    """Testet den Abruf von Wetterdaten für eine bestimmte Station aus CSV-Dateien."""
    mock_data = """ID,DATE,ELEMENT,VALUE,M-FLAG,Q-FLAG,S-FLAG,OBS-TIME
USW00094728,20230101,TMAX,30,M,X,S,0700
USW00094728,20230102,TMIN,10,M,X,S,0700"""

    def mock_requests_get(*args, **kwargs):
        class MockResponse:
            status_code = 200
            text = mock_data
        return MockResponse()

    monkeypatch.setattr(requests, "get", mock_requests_get)

    weather_data = fetch_weather_data("USW00094728")
    assert weather_data is not None
    assert "DATE" in weather_data.columns
    assert "ELEMENT" in weather_data.columns
    assert "VALUE" in weather_data.columns
    assert weather_data.iloc[0]["ELEMENT"] == "TMAX"
    assert weather_data.iloc[1]["ELEMENT"] == "TMIN"


# **Test für `parse_ghcnd_csv_from_string()`**
def test_parse_ghcnd_csv_from_string():
    """Testet das Parsen der NOAA CSV-Daten."""
    mock_data = """ID,DATE,ELEMENT,VALUE,M-FLAG,Q-FLAG,S-FLAG,OBS-TIME
USW00094728,20230101,TMAX,30,M,X,S,0700
USW00094728,20230102,TMIN,10,M,X,S,0700"""

    df = parse_ghcnd_csv_from_string(mock_data)

    assert not df.empty
    assert "DATE" in df.columns
    assert "ELEMENT" in df.columns
    assert "VALUE" in df.columns
    assert df.iloc[0]["ELEMENT"] == "TMAX"
    assert df.iloc[1]["ELEMENT"] == "TMIN"


# **API-Test: `/get_weather_data` ohne Parameter**
def test_get_weather_data_missing_param(client):
    """Testet den API-Endpunkt `/get_weather_data` ohne `station_id`."""
    response = client.get(f"{BASE_URL}/get_weather_data")
    assert response.status_code == 400
    assert response.json["error"] == "No station ID provided"


# **API-Test: `/get_weather_data` mit ungültiger Station**
def test_get_weather_data_invalid_station(client, monkeypatch):
    """Testet den API-Endpunkt `/get_weather_data` mit ungültiger `station_id`."""

    def mock_fetch_weather_data(station_id):
        return None  # Simuliert eine fehlgeschlagene API-Abfrage

    monkeypatch.setattr("app.fetch_weather_data", mock_fetch_weather_data)

    response = client.get(f"{BASE_URL}/get_weather_data?station_id=INVALID")
    assert response.status_code == 404
    assert "error" in response.json


# **Test für Fehlerbehandlung in `fetch_weather_data()`**
def test_fetch_weather_data_request_failed(monkeypatch):
    """Simuliert einen fehlgeschlagenen HTTP-Request für die CSV-Wetterdaten."""

    def mock_requests_get(*args, **kwargs):
        class MockResponse:
            status_code = 404
            text = ""
        return MockResponse()

    monkeypatch.setattr(requests, "get", mock_requests_get)

    weather_data = fetch_weather_data("INVALID_ID")
    assert weather_data is None


# **Test für Fehlerbehandlung in `parse_ghcnd_csv_from_string()`**
def test_parse_ghcnd_csv_from_string_empty():
    """Testet das Parsen einer leeren CSV-Datei."""
    df = parse_ghcnd_csv_from_string("")
    assert df.empty


# **API-Test: `/` (Index-Seite)**
def test_index_page(client):
    """Testet, ob die Index-Seite korrekt geladen wird."""
    response = client.get("/")
    assert response.status_code == 200
    assert b"<title>" in response.data  # Prüft, ob HTML zurückgegeben wird


# **Test für den globalen Fehlerhandler**
def test_global_error_handler(client):
    """Testet, ob unerwartete Fehler korrekt abgefangen werden."""
    response = client.get("/error")
    assert response.status_code == 500
    assert "Ein unerwarteter Fehler ist aufgetreten." in response.json["error"]

def test_preload_status(client):
    response = client.get("/preload_status")
    # The status should be either "loading" or "done" depending on preloading
    assert response.status_code == 200
    assert response.json["status"] in ["loading", "done"]    

def test_get_stations_endpoint(monkeypatch, client):
    # Create mock station and inventory data with proper fixed-width formatting.
    mock_station = (
        "USW00094728"    # ID: indices 0-10 (11 chars)
        " "              # index 11 filler
        " 40.783 "       # LATITUDE: indices 12-19 (8 chars)
        " "              # index 20 filler
        "  -73.967"      # LONGITUDE: indices 21-29 (9 chars)
        " "              # index 30 filler
        "  39.9"         # ELEVATION: indices 31-36 (6 chars)
        " "              # index 37 filler
        "NY"             # STATE: indices 38-39 (2 chars)
        " "              # index 40 filler
        "NEW YORK CITY CENTRAL PARK    "  # NAME: indices 41-70 (30 chars)
    )
    mock_inventory = (
        "USW00094728"    
        " "              
        " 40.783 "       
        " "              
        "  -73.967"      
        " "              
        "TMIN"           
        " "              
        "1900"           
        " "              
        "2020"           
        "\n"
        "USW00094728"    
        " "              
        " 40.783 "       
        " "              
        "  -73.967"      
        " "              
        "TMAX"           
        " "              
        "1900"           
        " "              
        "2020"           
        "\n"
    )
    
    def mock_requests_get(url, *args, **kwargs):
        # Return station data for the stations endpoint,
        # inventory data for the inventory endpoint.
        if "ghcnd-stations.txt" in url:
            class MockResponse:
                status_code = 200
                text = mock_station
            return MockResponse()
        elif "ghcnd-inventory.txt" in url:
            class MockResponse:
                status_code = 200
                text = mock_inventory
            return MockResponse()
        else:
            # Fallback for other URLs.
            class MockResponse:
                status_code = 404
                text = ""
            return MockResponse()
    
    monkeypatch.setattr(requests, "get", mock_requests_get)
    
    # Now call the endpoint with parameters that match the mock data.
    response = client.get("/get_stations?latitude=40.783&longitude=-73.967&radius_km=10&station_count=10&start_year=1900&end_year=2020")
    assert response.status_code == 200
    stations = response.get_json()
    assert isinstance(stations, list)
    # Ensure that the station is returned.
    assert any(station["ID"] == "USW00094728" for station in stations)