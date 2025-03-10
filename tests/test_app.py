import pytest
import requests
import pandas as pd
from io import StringIO
from app import (
    app,
    haversine,
    fetch_and_filter_stations,
    fetch_weather_data,
    load_stations,
    load_inventory,
    parse_ghcnd_csv_from_string,
    parse_ghcnd_dly_from_string,
)

BASE_URL = "http://127.0.0.1:5000"

# Fixture for the Flask test client.
@pytest.fixture
def client():
    with app.test_client() as client:
        yield client

# ------------------------------
# Tests for load_inventory()

def test_load_inventory_success(monkeypatch):
    # Construct fixed-width inventory data exactly as expected.
    mock_inventory = (
        "USW00094728"    # indices 0-10: ID (11 chars)
        " "              # index 11
        " 40.783 "       # indices 12-19: LATITUDE (8 chars)
        " "              # index 20
        "  -73.967"      # indices 21-29: LONGITUDE (9 chars)
        " "              # index 30
        "TMIN"           # indices 31-34: ELEMENT (4 chars)
        " "              # index 35
        "1900"           # indices 36-39: FIRSTYEAR (4 chars)
        " "              # index 40
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
    inv_df = load_inventory()
    assert not inv_df.empty
    assert "ID" in inv_df.columns
    # Verify that the ELEMENT column contains the full strings.
    assert "TMIN" in inv_df["ELEMENT"].values
    assert "TMAX" in inv_df["ELEMENT"].values

def test_load_inventory_failure(monkeypatch):
    def mock_requests_get(url, *args, **kwargs):
        class MockResponse:
            status_code = 404
            text = ""
        return MockResponse()
    monkeypatch.setattr(requests, "get", mock_requests_get)
    inv_df = load_inventory()
    assert inv_df is None

# ------------------------------
# Tests for load_stations()

def test_load_stations_success(monkeypatch):
    # Construct fixed-width station data (71 characters expected)
    mock_station = (
        "USW00094728"    # 0-10: ID (11 chars)
        " "              # index 11
        " 40.783 "       # 12-19: LATITUDE (8 chars)
        " "              # index 20
        "  -73.967"      # 21-29: LONGITUDE (9 chars)
        " "              # index 30
        "  39.9"         # 31-36: ELEVATION (6 chars)
        " "              # index 37
        "NY"             # 38-39: STATE (2 chars)
        " "              # index 40
        "NEW YORK CITY CENTRAL PARK    "  # 41-70: NAME (30 chars)
    )
    # Use the same inventory as in the previous test.
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
            class MockResponse:
                status_code = 404
                text = ""
            return MockResponse()
    monkeypatch.setattr(requests, "get", mock_requests_get)
    # Reset caches so that load_stations() re-fetches the data.
    import app
    app.cached_stations = None
    app.cached_inventory = None
    stations_df = load_stations()
    assert stations_df is not None
    assert not stations_df.empty
    assert stations_df.iloc[0]["ID"] == "USW00094728"

def test_load_stations_failure(monkeypatch):
    # Simulate failure on station data retrieval.
    def mock_requests_get(url, *args, **kwargs):
        class MockResponse:
            status_code = 404
            text = ""
        return MockResponse()
    monkeypatch.setattr(requests, "get", mock_requests_get)
    import app
    app.cached_stations = None
    stations_df = load_stations()
    assert stations_df is None

# ------------------------------
# Test for fetch_and_filter_stations()

def test_fetch_and_filter_stations(monkeypatch):
    mock_station = (
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
            class MockResponse:
                status_code = 404
                text = ""
            return MockResponse()
    monkeypatch.setattr(requests, "get", mock_requests_get)
    import app
    app.cached_stations = None
    app.cached_inventory = None
    filtered = fetch_and_filter_stations(40.7, -74.0, 50)
    assert not filtered.empty
    assert filtered.iloc[0]["ID"] == "USW00094728"

# ------------------------------
# Tests for parsing CSV

def test_parse_ghcnd_csv_from_string():
    mock_csv = """ID,DATE,ELEMENT,VALUE,M-FLAG,Q-FLAG,S-FLAG,OBS-TIME
USW00094728,20230101,TMAX,30,M,X,S,0700
USW00094728,20230102,TMIN,10,M,X,S,0700"""
    df = parse_ghcnd_csv_from_string(mock_csv)
    assert not df.empty
    assert "DATE" in df.columns
    assert df.iloc[0]["ELEMENT"] == "TMAX"
    assert df.iloc[1]["ELEMENT"] == "TMIN"

def test_parse_ghcnd_csv_from_string_empty():
    df = parse_ghcnd_csv_from_string("")
    assert df.empty

# ------------------------------
# Tests for parsing .dly files

def test_parse_ghcnd_dly_from_string_empty():
    df = parse_ghcnd_dly_from_string("")
    assert df.empty

def test_parse_ghcnd_dly_from_string_valid():
    # Construct a minimal valid .dly line:
    # station_id (11) + year (4) + month (2) + element (4) = 21 characters.
    # Then 31 days * 8 characters = 248 characters.
    # Total = 269 characters (the minimum length).
    station_id = "USW00094728"
    year = "2023"
    month = "01"
    element = "TMAX"
    # For each day, use "  012   " (5-char value field plus 3 filler spaces)
    day_field = "  012   "
    days = day_field * 31
    dly_line = f"{station_id}{year}{month}{element}{days}"
    df = parse_ghcnd_dly_from_string(dly_line)
    # Expect 31 records, one for each day of January 2023.
    assert len(df) == 31
    for record in df.to_dict("records"):
        assert record["VALUE"] == 12
        assert record["DATE"].year == 2023
        assert record["DATE"].month == 1

# ------------------------------
# Tests for fetch_weather_data()

def test_fetch_weather_data_csv(monkeypatch):
    mock_csv = """ID,DATE,ELEMENT,VALUE,M-FLAG,Q-FLAG,S-FLAG,OBS-TIME
USW00094728,20230101,TMAX,30,M,X,S,0700
USW00094728,20230102,TMIN,10,M,X,S,0700"""
    def mock_requests_get(url, *args, **kwargs):
        class MockResponse:
            status_code = 200
            text = mock_csv
        return MockResponse()
    monkeypatch.setattr(requests, "get", mock_requests_get)
    weather_data = fetch_weather_data("USW00094728")
    assert weather_data is not None
    assert "DATE" in weather_data.columns
    assert weather_data.iloc[0]["ELEMENT"] == "TMAX"

def test_fetch_weather_data_fallback(monkeypatch):
    # Simulate CSV failure (404) so fallback to .dly is attempted.
    def mock_requests_get(url, *args, **kwargs):
        class MockResponse:
            status_code = 404
            text = ""
        return MockResponse()
    monkeypatch.setattr(requests, "get", mock_requests_get)
    weather_data = fetch_weather_data("USW00094728")
    assert weather_data is None

# ------------------------------
# API Endpoint tests

def test_get_stations_endpoint(monkeypatch, client):
    mock_station = (
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
            class MockResponse:
                status_code = 404
                text = ""
            return MockResponse()
    monkeypatch.setattr(requests, "get", mock_requests_get)
    import app
    app.cached_stations = None
    app.cached_inventory = None
    response = client.get("/get_stations?latitude=40.783&longitude=-73.967&radius_km=10&station_count=10&start_year=1900&end_year=2020")
    assert response.status_code == 200
    stations = response.get_json()
    assert isinstance(stations, list)
    assert any(station["ID"] == "USW00094728" for station in stations)

def test_get_weather_data_endpoint(monkeypatch, client):
    # Create mock CSV data with two records in different years.
    mock_csv = """ID,DATE,ELEMENT,VALUE,M-FLAG,Q-FLAG,S-FLAG,OBS-TIME
USW00094728,20190101,TMAX,25,M,X,S,0700
USW00094728,20200101,TMIN,5,M,X,S,0700"""
    def mock_requests_get(url, *args, **kwargs):
        class MockResponse:
            status_code = 200
            text = mock_csv
        return MockResponse()
    monkeypatch.setattr(requests, "get", mock_requests_get)
    response = client.get("/get_weather_data?station_id=USW00094728&start_year=2020&end_year=2020")
    assert response.status_code == 200
    data = response.get_json()
    # Only the 2020 record should be returned.
    for record in data:
        assert pd.to_datetime(record["DATE"]).year == 2020

def test_get_weather_data_missing_param(client):
    response = client.get(f"{BASE_URL}/get_weather_data")
    assert response.status_code == 400
    assert response.get_json()["error"] == "No station ID provided"

# ------------------------------
# Tests for general routes and error handling

def test_index_page(client):
    response = client.get("/")
    assert response.status_code == 200
    assert b"<title>" in response.data

def test_global_error_handler(client):
    # Ensure that the /error route is only registered when TESTING is True.
    app.config["TESTING"] = True
    response = client.get("/error")
    assert response.status_code == 500
    assert "Ein unerwarteter Fehler" in response.get_json()["error"]

def test_preload_status(client):
    response = client.get("/preload_status")
    assert response.status_code == 200
    assert response.get_json()["status"] in ["loading", "done"]

# ------------------------------
# Test for haversine()

def test_haversine():
    dist = haversine(52.5200, 13.4050, 48.8566, 2.3522)  # Berlin -> Paris
    assert round(dist, 2) == 877.46
    assert haversine(52.5200, 13.4050, 52.5200, 13.4050) == 0