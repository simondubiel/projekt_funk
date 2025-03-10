import pytest
import requests
import pandas as pd
import sys
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
    with app.test_client() as client:
        yield client

def test_load_inventory(monkeypatch):
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
        class MockResponse:
            status_code = 200
            text = mock_inventory
        return MockResponse()
    monkeypatch.setattr(requests, "get", mock_requests_get)
    inventory_df = load_inventory()
    assert not inventory_df.empty
    assert "ID" in inventory_df.columns
    assert "TMIN" in inventory_df["ELEMENT"].values
    assert "TMAX" in inventory_df["ELEMENT"].values

@pytest.fixture
def client():
    with app.test_client() as client:
        yield client

def test_preload_status(client):
    response = client.get("/preload_status")
    assert response.status_code == 200
    assert response.json["status"] in ["loading", "done"]

def test_fetch_weather_data_fallback(monkeypatch):
    def mock_requests_get(url, *args, **kwargs):
        class MockResponse:
            status_code = 404
            text = ""
        return MockResponse()
    monkeypatch.setattr(requests, "get", mock_requests_get)

    from app import fetch_weather_data
    weather_data = fetch_weather_data("USW00094728")
    assert weather_data is None


def test_parse_ghcnd_dly_from_string_empty():
    df = parse_ghcnd_dly_from_string("")
    assert df.empty


def test_haversine():
    dist = haversine(52.5200, 13.4050, 48.8566, 2.3522)
    assert round(dist, 2) == 877.46 

    assert haversine(52.5200, 13.4050, 52.5200, 13.4050) == 0


def test_load_stations(monkeypatch):
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


def test_fetch_and_filter_stations(monkeypatch):
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


def test_fetch_weather_data(monkeypatch):
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

def test_parse_ghcnd_csv_from_string():
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

def test_get_weather_data_missing_param(client):
    response = client.get(f"{BASE_URL}/get_weather_data")
    assert response.status_code == 400
    assert response.json["error"] == "No station ID provided"

def test_get_weather_data_invalid_station(client, monkeypatch):
    def mock_fetch_weather_data(station_id):
        return None 
    monkeypatch.setattr("app.fetch_weather_data", mock_fetch_weather_data)
    response = client.get(f"{BASE_URL}/get_weather_data?station_id=INVALID")
    assert response.status_code == 404
    assert "error" in response.json

def test_fetch_weather_data_request_failed(monkeypatch):
    def mock_requests_get(*args, **kwargs):
        class MockResponse:
            status_code = 404
            text = ""
        return MockResponse()
    monkeypatch.setattr(requests, "get", mock_requests_get)
    weather_data = fetch_weather_data("INVALID_ID")
    assert weather_data is None


def test_parse_ghcnd_csv_from_string_empty():
    df = parse_ghcnd_csv_from_string("")
    assert df.empty


def test_index_page(client):
    response = client.get("/")
    assert response.status_code == 200
    assert b"<title>" in response.data

def test_global_error_handler(client):
    response = client.get("/error")
    assert response.status_code == 500
    assert "Ein unerwarteter Fehler ist aufgetreten." in response.json["error"]

def test_preload_status(client):
    response = client.get("/preload_status")
    assert response.status_code == 200
    assert response.json["status"] in ["loading", "done"]    

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
    
    response = client.get("/get_stations?latitude=40.783&longitude=-73.967&radius_km=10&station_count=10&start_year=1900&end_year=2020")
    assert response.status_code == 200
    stations = response.get_json()
    assert isinstance(stations, list)
    assert any(station["ID"] == "USW00094728" for station in stations)

def test_parse_ghcnd_dly_from_string_valid():
    station_id = "USW00094728"         
    year = "2023"                      
    month = "01"                       
    element = "TMAX"                   
    day1 = "   10   "                  
    missing_day = "-9999   "           
    day_fields = day1 + missing_day * 30  
    dly_line = station_id + year + month + element + day_fields
    assert len(dly_line) == 269, "The .dly line must be exactly 269 characters long."
    
    df = parse_ghcnd_dly_from_string(dly_line)
    assert len(df) == 1, "Only one valid day record should be parsed."
    record = df.iloc[0]
    assert record["VALUE"] == 10
    assert record["ELEMENT"] == "TMAX"
    assert record["DATE"].year == 2023
    assert record["DATE"].month == 1
    assert record["DATE"].day == 1


def test_get_weather_data_endpoint_valid(monkeypatch, client):
    mock_csv = (
        "USW00094728,20190101,TMAX,25,M,X,S,0700\n"
        "USW00094728,20200101,TMIN,5,M,X,S,0700\n"
        "USW00094728,20210101,TMAX,30,M,X,S,0700\n"
    )

    def mock_requests_get(url, *args, **kwargs):
        class MockResponse:
            status_code = 200
            text = mock_csv
        return MockResponse()

    monkeypatch.setattr(requests, "get", mock_requests_get)
    response = client.get(
        "/get_weather_data?station_id=USW00094728&start_year=2020&end_year=2021"
    )
    assert response.status_code == 200
    import json
    data = json.loads(response.data.decode("utf-8"))
    for record in data:
        date_val = pd.to_datetime(record["DATE"], unit="ms", errors="coerce")
        year = date_val.year if pd.notnull(date_val) else 1970
        assert year in [2020, 2021], f"Record year {year} is outside the filter range."

def test_load_stations_inventory_failure(monkeypatch):
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
    def mock_requests_get(url, *args, **kwargs):
        if "ghcnd-stations.txt" in url:
            class MockResponse:
                status_code = 200
                text = mock_station
            return MockResponse()
        elif "ghcnd-inventory.txt" in url:
            class MockResponse:
                status_code = 404
                text = ""
            return MockResponse()
        else:
            class MockResponse:
                status_code = 404
                text = ""
            return MockResponse()
    monkeypatch.setattr(requests, "get", mock_requests_get)
    app.cached_stations = None
    app.cached_inventory = None
    stations_df = load_stations()
    assert stations_df is not None
    assert not stations_df.empty
    assert stations_df.iloc[0]["ID"] == "USW00094728"


def test_fetch_weather_data_dly_success(monkeypatch):
    station_id = "USW00094728"
    station_id_str = station_id  
    year_str = "2023"
    month_str = "01"
    element = "TMAX"
    day1 = "   10   "  
    missing_day = "-9999   "  
    day_fields = day1 + missing_day * 30  
    dly_line = station_id_str + year_str + month_str + element + day_fields
    assert len(dly_line) == 269, "The .dly line must be exactly 269 characters long."

    def mock_requests_get(url, *args, **kwargs):
        if "by_station" in url:
            class MockResponse:
                status_code = 404
                text = ""
            return MockResponse()
        elif "all" in url:
            class MockResponse:
                status_code = 200
                text = dly_line
            return MockResponse()
        else:
            class MockResponse:
                status_code = 404
                text = ""
            return MockResponse()

    monkeypatch.setattr(requests, "get", mock_requests_get)
    df = fetch_weather_data(station_id)
    assert df is not None
    assert len(df) == 1
    record = df.iloc[0]
    assert record["VALUE"] == 10
    assert record["ELEMENT"] == "TMAX"
    assert record["DATE"].year == 2023
    assert record["DATE"].month == 1
    assert record["DATE"].day == 1


def test_parse_ghcnd_csv_from_string_exception(monkeypatch):
    def mock_read_csv(*args, **kwargs):
        raise Exception("Test exception")
    monkeypatch.setattr(pd, "read_csv", mock_read_csv)
    df = parse_ghcnd_csv_from_string("invalid data")
    assert df.empty