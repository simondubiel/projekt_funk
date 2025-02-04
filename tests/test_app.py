import pytest
import requests
from app import (
    haversine,
    fetch_and_filter_stations,
    fetch_weather_data,
    load_stations,
    parse_ghcn_dly_from_string,
    app,
)

BASE_URL = "http://127.0.0.1:5000"

@pytest.fixture
def client():
    """Fixture zur Initialisierung des Flask-Testclients."""
    with app.test_client() as client:
        yield client


# ✅ **Test für `haversine()`**
ddef test_haversine():
    """Testet die Entfernung zwischen zwei Koordinaten."""
    dist = haversine(52.5200, 13.4050, 48.8566, 2.3522)  # Berlin → Paris
    assert round(dist, 2) == 877.46  # Erwartet 877,46 km Entfernung


# ✅ **Test für `load_stations()`**
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


# ✅ **Test für `fetch_and_filter_stations()`**
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


# ✅ **Test für `fetch_weather_data()`**
def test_fetch_weather_data(monkeypatch):
    """Testet den Abruf von Wetterdaten für eine bestimmte Station."""
    mock_data = "USW00094728 20230101 TMAX  30  -9999  50  40  -9999  -9999"

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


# ✅ **Test für `parse_ghcn_dly_from_string()`**
def test_parse_ghcn_dly_from_string():
    """Testet das Parsen der NOAA .dly-Daten."""
    mock_data = "USW00094728 20230101 TMAX  30  -9999  50  40  -9999  -9999"
    df = parse_ghcn_dly_from_string(mock_data)

    assert not df.empty
    assert "DATE" in df.columns
    assert "ELEMENT" in df.columns
    assert "VALUE" in df.columns
    assert df.iloc[0]["ELEMENT"] == "TMAX"


# ✅ **API-Test: `/get_weather_data` ohne Parameter**
def test_get_weather_data_missing_param(client):
    """Testet den API-Endpunkt `/get_weather_data` ohne `station_id`."""
    response = client.get(f"{BASE_URL}/get_weather_data")
    assert response.status_code == 400
    assert response.json["error"] == "No station ID provided"


# ✅ **API-Test: `/get_weather_data` mit ungültiger Station**
def test_get_weather_data_invalid_station(client, monkeypatch):
    """Testet den API-Endpunkt `/get_weather_data` mit ungültiger `station_id`."""
    
    def mock_fetch_weather_data(station_id):
        return None  # Simuliert eine fehlgeschlagene API-Abfrage

    monkeypatch.setattr("app.fetch_weather_data", mock_fetch_weather_data)

    response = client.get(f"{BASE_URL}/get_weather_data?station_id=INVALID")
    assert response.status_code == 404
    assert "error" in response.json


# ✅ **API-Test: `/` (Index-Seite)**
def test_index_page(client):
    """Testet, ob die Index-Seite korrekt geladen wird."""
    response = client.get("/")
    assert response.status_code == 200
    assert b"<title>" in response.data  # Prüft, ob HTML zurückgegeben wird