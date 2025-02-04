import pytest
import requests
from app import haversine, fetch_weather_data, app

BASE_URL = "http://127.0.0.1:5000"

@pytest.fixture
def client():
    """Fixture zur Initialisierung des Flask-Testclients."""
    with app.test_client() as client:
        yield client

def test_haversine():
    """Testet die Entfernung zwischen zwei Koordinaten."""
    dist = haversine(52.5200, 13.4050, 48.8566, 2.3522)  # Berlin → Paris
    assert round(dist, 0) == 878  # Erwartete Entfernung ca. 878 km

def test_fetch_weather_data():
    """Testet den Abruf von Wetterdaten für eine Teststation."""
    station_id = "USW00094728"  # Beispielstation
    weather_data = fetch_weather_data(station_id)
    assert weather_data is None or not weather_data.empty

def test_index_page(client):
    """Testet, ob die Index-Seite korrekt geladen wird."""
    response = client.get('/')
    assert response.status_code == 200
    assert b"<title>" in response.data  # Prüft, ob HTML zurückgegeben wird

def test_get_weather_data(client):
    """Testet den API-Endpunkt `/get_weather_data`."""
    response = client.get(f'{BASE_URL}/get_weather_data?station_id=USW00094728')
    assert response.status_code in [200, 404]  # Erfolgreich oder keine Daten