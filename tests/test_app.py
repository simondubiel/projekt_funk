import pytest
import requests
import pandas as pd
import json
from io import StringIO
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

# Fixture for the Flask test client.
@pytest.fixture
def client():
    with app.test_client() as client:
        yield client

# --- Test for load_inventory() ---

def test_load_inventory(monkeypatch):
    """Test loading of inventory data."""
    mock_inventory = (
        "USW00094728"    # indices 0-10: ID (11 chars)
        " "              # index 11 filler
        " 40.783 "       # indices 12-19: LATITUDE (8 chars)
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
    # Patch the requests.get used in the app module.
    monkeypatch.setattr(app.requests, "get", mock_requests_get)
    app.cached_inventory = None  # Clear cache for a fresh load.
    inventory_df = load_inventory()
    assert not inventory_df.empty
    assert "ID" in inventory_df.columns
    assert "TMIN" in inventory_df["ELEMENT"].values
    assert "TMAX" in inventory_df["ELEMENT"].values

def test_load_inventory_failure(monkeypatch):
    """Test inventory loading failure returns None."""
    def mock_requests_get(url, *args, **kwargs):
        class MockResponse:
            status_code = 404
            text = ""
        return MockResponse()
    # Patch the requests.get used in the app module.
    monkeypatch.setattr(app.requests, "get", mock_requests_get)
    app.cached_inventory = None  # Clear cache so failure branch is taken.
    inv_df = load_inventory()
    assert inv_df is None

# --- Test for /preload_status endpoint ---
def test_preload_status(client):
    """Test the preload status endpoint returns a valid status."""
    response = client.get("/preload_status")
    assert response.status_code == 200
    assert response.json["status"] in ["loading", "done"]

# --- Test for fallback in fetch_weather_data (using .dly) ---
def test_fetch_weather_data_fallback(monkeypatch):
    """Test that when CSV data is not available, the .dly fallback is used."""
    def mock_requests_get(url, *args, **kwargs):
        class MockResponse:
            status_code = 404
            text = ""
        return MockResponse()
    monkeypatch.setattr(app.requests, "get", mock_requests_get)
    weather_data = fetch_weather_data("USW00094728")
    assert weather_data is None

# --- Test for parse_ghcnd_dly_from_string with empty data ---
def test_parse_ghcnd_dly_from_string_empty():
    """Test that an empty .dly string returns an empty DataFrame."""
    df = parse_ghcnd_dly_from_string("")
    assert df.empty

# **Test for haversine()**
def test_haversine():
    """Test distance calculation between two coordinates."""
    dist = haversine(52.5200, 13.4050, 48.8566, 2.3522)  # Berlin → Paris
    assert round(dist, 2) == 877.46
    assert haversine(52.5200, 13.4050, 52.5200, 13.4050) == 0

# **Test for load_stations()**
def test_load_stations(monkeypatch):
    """Test loading of station data."""
    mock_data = (
        "USW00094728"    # 0-10: ID
        " "              # 11
        " 40.783 "       # 12-19: LATITUDE
        " "              # 20
        "  -73.967"      # 21-29: LONGITUDE
        " "              # 30
        "  39.9"         # 31-36: ELEVATION
        " "              # 37
        "NY"             # 38-39: STATE
        " "              # 40
        "NEW YORK CITY CENTRAL PARK    "  # 41-70: NAME
    )
    def mock_requests_get(*args, **kwargs):
        class MockResponse:
            status_code = 200
            text = mock_data
        return MockResponse()
    monkeypatch.setattr(app.requests, "get", mock_requests_get)
    stations_df = load_stations()
    assert not stations_df.empty
    assert "ID" in stations_df.columns
    assert stations_df.iloc[0]["ID"] == "USW00094728"

# **Test for fetch_and_filter_stations()**
def test_fetch_and_filter_stations(monkeypatch):
    """Test filtering of stations by coordinates and radius."""
    mock_data = (
        "USW00094728"
        " "
        " 40.783 "
        " "
        "  -73.967"
        " "
        "  39.9"
        " "
        "NY"
        " "
        "NEW YORK CITY CENTRAL PARK    "
    )
    def mock_requests_get(*args, **kwargs):
        class MockResponse:
            status_code = 200
            text = mock_data
        return MockResponse()
    monkeypatch.setattr(app.requests, "get", mock_requests_get)
    filtered_stations = fetch_and_filter_stations(40.7, -74.0, 50)
    assert not filtered_stations.empty
    assert "ID" in filtered_stations.columns
    assert filtered_stations.iloc[0]["ID"] == "USW00094728"

# **Test for fetch_weather_data() with CSV**
def test_fetch_weather_data(monkeypatch):
    """Test fetching weather data from CSV."""
    mock_data = (
        "USW00094728,20230101,TMAX,30,M,X,S,0700\n"
        "USW00094728,20230102,TMIN,10,M,X,S,0700"
    )
    def mock_requests_get(*args, **kwargs):
        class MockResponse:
            status_code = 200
            text = mock_data
        return MockResponse()
    monkeypatch.setattr(app.requests, "get", mock_requests_get)
    weather_data = fetch_weather_data("USW00094728")
    assert weather_data is not None
    assert "DATE" in weather_data.columns
    assert "ELEMENT" in weather_data.columns
    assert "VALUE" in weather_data.columns
    assert weather_data.iloc[0]["ELEMENT"] == "TMAX"
    assert weather_data.iloc[1]["ELEMENT"] == "TMIN"

# **Test for parse_ghcnd_csv_from_string()**
def test_parse_ghcnd_csv_from_string():
    """Test parsing of NOAA CSV data."""
    mock_data = (
        "USW00094728,20230101,TMAX,30,M,X,S,0700\n"
        "USW00094728,20230102,TMIN,10,M,X,S,0700"
    )
    df = parse_ghcnd_csv_from_string(mock_data)
    assert not df.empty
    assert "DATE" in df.columns
    assert "ELEMENT" in df.columns
    assert "VALUE" in df.columns
    assert df.iloc[0]["ELEMENT"] == "TMAX"
    assert df.iloc[1]["ELEMENT"] == "TMIN"

# **API Test: /get_weather_data with valid CSV data**
def test_get_weather_data_endpoint(monkeypatch, client):
    """Test the /get_weather_data endpoint with valid CSV data."""
    mock_csv = (
        "USW00094728,20190101,TMAX,25,M,X,S,0700\n"
        "USW00094728,20200101,TMIN,5,M,X,S,0700"
    )
    def mock_requests_get(url, *args, **kwargs):
        class MockResponse:
            status_code = 200
            text = mock_csv
        return MockResponse()
    monkeypatch.setattr(app.requests, "get", mock_requests_get)
    response = client.get("/get_weather_data?station_id=USW00094728&start_year=2020&end_year=2020")
    assert response.status_code == 200
    # Since the endpoint returns a JSON string, load it manually.
    data = json.loads(response.data.decode("utf-8"))
    # Only the 2020 record should be returned.
    for record in data:
        assert pd.to_datetime(record["DATE"]).year == 2020

# **API Test: /get_weather_data missing parameter**
def test_get_weather_data_missing_param(client):
    """Test the /get_weather_data endpoint without station_id."""
    response = client.get(f"{BASE_URL}/get_weather_data")
    assert response.status_code == 400
    assert response.json["error"] == "No station ID provided"

# **API Test: /get_weather_data with invalid station**
def test_get_weather_data_invalid_station(client, monkeypatch):
    """Test /get_weather_data endpoint with an invalid station_id."""
    def mock_fetch_weather_data(station_id):
        return None  # Simulate failure
    monkeypatch.setattr("app.fetch_weather_data", mock_fetch_weather_data)
    response = client.get(f"{BASE_URL}/get_weather_data?station_id=INVALID")
    assert response.status_code == 404
    assert "error" in response.json

# **Test for error handling in fetch_weather_data()**
def test_fetch_weather_data_request_failed(monkeypatch):
    """Simulate a failed HTTP request for CSV weather data."""
    def mock_requests_get(*args, **kwargs):
        class MockResponse:
            status_code = 404
            text = ""
        return MockResponse()
    monkeypatch.setattr(app.requests, "get", mock_requests_get)
    weather_data = fetch_weather_data("INVALID_ID")
    assert weather_data is None

# **API Test: / (Index Page)**
def test_index_page(client):
    """Test that the index page loads correctly."""
    response = client.get("/")
    assert response.status_code == 200
    assert b"<title>" in response.data

# **Test for the global error handler**
def test_global_error_handler(client):
    """Test that unexpected errors are handled by the global error handler."""
    app.config["TESTING"] = True  # Ensure /error route is registered.
    response = client.get("/error")
    assert response.status_code == 500
    assert "Ein unerwarteter Fehler" in response.json["error"]

# **Test for /preload_status endpoint again**
def test_preload_status_again(client):
    response = client.get("/preload_status")
    assert response.status_code == 200
    assert response.json["status"] in ["loading", "done"]