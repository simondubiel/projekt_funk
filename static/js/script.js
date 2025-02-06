// Initialisierung der Leaflet-Karte
var map = L.map('map').setView([52.52, 13.40], 5);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let marker;

// Funktion zum Setzen eines Markers bei Eingabe von Koordinaten
function updateMapMarker() {
    let latitude = parseFloat(document.getElementById("latitude").value);
    let longitude = parseFloat(document.getElementById("longitude").value);

    if (!isNaN(latitude) && !isNaN(longitude)) {
        if (marker) {
            marker.setLatLng([latitude, longitude]);
        } else {
            marker = L.marker([latitude, longitude]).addTo(map);
        }
        map.setView([latitude, longitude], 10);
    }
}

// Funktion zur Auswahl einer Station
function selectStation(row) {
    document.querySelectorAll("#station-table tr").forEach(r => r.classList.remove("selected"));
    row.classList.add("selected");

    let stationId = row.cells[0].innerText;
    let latitude = parseFloat(row.cells[1].innerText);
    let longitude = parseFloat(row.cells[2].innerText);

    map.setView([latitude, longitude], 10);

    // Wetterdaten für die ausgewählte Station abrufen
    fetchWeatherData(stationId);
}

// Allgemeine Funktion zum Öffnen und Schließen von Dropdowns
function toggleDropdown(event) {
    let targetId = event.target.dataset.target;
    let dropdown = document.getElementById(targetId);

    if (dropdown) {
        let isVisible = dropdown.style.display === "block";
        document.querySelectorAll(".dropdown-list").forEach(el => el.style.display = "none");
        dropdown.style.display = isVisible ? "none" : "block";
    }
}

// Setzt die Werte für Dropdown-Inputs
function setDropdownValue(value, inputId, dropdownId) {
    document.getElementById(inputId).value = value;
    document.getElementById(dropdownId).style.display = "none";
}

// Wetterdaten abrufen
async function fetchWeatherData(stationId) {
    try {
        const response = await fetch(`/get_weather_data?station_id=${stationId}`);
        const data = await response.json();

        if (data.error) {
            console.error("Error fetching weather data:", data.error);
            document.getElementById("weather-data-container").innerHTML = `<p>Error: ${data.error}</p>`;
            return;
        }

        displayWeatherData(data);
    } catch (error) {
        console.error("Failed to fetch weather data:", error);
    }
}

// Wetterdaten anzeigen
function displayWeatherData(data) {
    const container = document.getElementById("weather-data-container");
    container.innerHTML = "<h3>Weather Data</h3>";

    if (data.length === 0) {
        container.innerHTML += "<p>Keine Wetterdaten verfügbar.</p>";
        return;
    }

    const table = document.createElement("table");
    table.innerHTML = `
        <thead>
            <tr>
                <th>Date</th>
                <th>Element</th>
                <th>Value</th>
            </tr>
        </thead>
        <tbody>
            ${data.map(row => `
                <tr>
                    <td>${row.DATE}</td>
                    <td>${row.ELEMENT}</td>
                    <td>${row.VALUE}</td>
                </tr>
            `).join('')}
        </tbody>
    `;
    container.appendChild(table);
}

// Suchkriterien speichern
function saveSearchCriteria() {
    let latitude = document.getElementById("latitude").value;
    let longitude = document.getElementById("longitude").value;
    let radius = document.getElementById("radius-input").value;

    let searchCriteria = {
        latitude: latitude,
        longitude: longitude,
        radius: radius
    };

    console.log("Gespeicherte Suchkriterien:", searchCriteria);
    localStorage.setItem("searchCriteria", JSON.stringify(searchCriteria));
}

// Eingaben validieren (nur numerische Werte)
function validateNumericInput(input) {
    input.value = input.value.replace(/[^0-9.]/g, ''); // Entfernt alle nicht-numerischen Zeichen außer dem Punkt
}

// Klick-Events für Dropdowns registrieren
document.querySelectorAll(".dropdown-btn").forEach(btn => {
    btn.addEventListener("click", toggleDropdown);
});

// Schließt alle Dropdowns, wenn außerhalb geklickt wird
document.addEventListener("click", function(event) {
    if (!event.target.classList.contains("dropdown-btn")) {
        document.querySelectorAll(".dropdown-list").forEach(dropdown => {
            dropdown.style.display = "none";
        });
    }
});

function setStationCount(value) {
    document.getElementById("station-count-input").value = value;
    document.getElementById("station-count-dropdown").style.display = "none"; // Dropdown schließen
}

function setRadiusValue(value) {
    document.getElementById("radius-input").value = value;
    document.getElementById("radius-dropdown").style.display = "none"; // Dropdown schließen
    updateRadiusCircle(); // Kreis auf der Karte aktualisieren
}
document.querySelectorAll("#station-table tbody tr").forEach(row => {
    row.addEventListener("click", function() {
        document.querySelectorAll("#station-table tbody tr").forEach(r => r.classList.remove("selected"));
        this.classList.add("selected");
    });
});

function confirmSelection() {
    // Werte aus den Eingabefeldern auslesen
    let stationCount = document.getElementById("station-count-input").value;
    let radius = document.getElementById("radius-input").value;
    let startYear = document.getElementById("start-year").value;
    let endYear = document.getElementById("end-year").value;
    let latitude = document.getElementById("latitude").value;
    let longitude = document.getElementById("longitude").value;

    // JSON-Objekt erstellen
    let searchCriteria = {
        "station_count": stationCount,
        "radius_km": radius,
        "start_year": startYear,
        "end_year": endYear,
        "latitude": latitude,
        "longitude": longitude
    };

    // JSON in der Konsole ausgeben
    console.log("Gespeicherte Suchkriterien:", JSON.stringify(searchCriteria, null, 2));
}

let radiusCircle = null; // Speichert den aktuellen Kreis

function updateRadiusCircle() {
    let latitude = parseFloat(document.getElementById("latitude").value);
    let longitude = parseFloat(document.getElementById("longitude").value);
    let radiusKm = parseFloat(document.getElementById("radius-input").value);

    // Falls ungültige Werte, Abbruch
    if (isNaN(latitude) || isNaN(longitude) || isNaN(radiusKm)) {
        console.warn("Ungültige Werte für den Radius oder die Koordinaten.");
        return;
    }

    // Falls bereits ein Kreis existiert, diesen entfernen
    if (radiusCircle) {
        map.removeLayer(radiusCircle);
    }

    // Neuen Kreis mit Radius erstellen
    radiusCircle = L.circle([latitude, longitude], {
        color: "blue",         // Randfarbe
        fillColor: "blue",     // Füllfarbe
        fillOpacity: 0.2,      // Leicht transparent
        radius: radiusKm * 1000 // km → Meter umwandeln
    }).addTo(map);

    // Karte auf den Kreis zentrieren und anpassen
    map.setView([latitude, longitude], 10);
}

function updateStationTable(stationData) {
    let tableBody = document.getElementById("station-table");
    tableBody.innerHTML = ""; // Löscht vorhandene Inhalte

    // Falls keine Daten vorhanden sind
    if (!stationData || stationData.length === 0) {
        tableBody.innerHTML = "<tr><td colspan='3'>Keine Stationen verfügbar</td></tr>";
        return;
    }

    // Durch die erhaltenen Stationen iterieren und sie der Tabelle hinzufügen
    stationData.forEach(station => {
        let row = document.createElement("tr");
        row.innerHTML = `
            <td>${station.name}</td>
            <td>${station.latitude}</td>
            <td>${station.longitude}</td>
        `;
        row.addEventListener("click", () => selectStation(row)); // Station auswählbar machen
        tableBody.appendChild(row);
    });
}

const testData = [
    { name: "Station A", latitude: "52.52", longitude: "13.40" },
    { name: "Station B", latitude: "48.85", longitude: "2.35" },
    { name: "Station C", latitude: "51.51", longitude: "-0.12" },
    { name: "Station D", latitude: "40.71", longitude: "-74.01" },
    { name: "Station E", latitude: "35.68", longitude: "139.76" }
];

// Test: Tabelle mit Dummy-Daten befüllen
updateStationTable(testData);

/*
async function fetchStationData() {
    try {
        let response = await fetch("/api/stations"); // URL anpassen
        let data = await response.json();
        updateStationTable(data); // Tabelle mit Daten aktualisieren
    } catch (error) {
        console.error("Fehler beim Abrufen der Stationsdaten:", error);
    }
}
*/
// Automatisch die Daten beim Laden abrufen
document.addEventListener("DOMContentLoaded", fetchStationData);

// Event Listener für Eingabefelder zur Kartenaktualisierung
document.getElementById("latitude").addEventListener("input", updateMapMarker);
document.getElementById("longitude").addEventListener("input", updateMapMarker);
document.getElementById("confirm-btn").addEventListener("click", confirmSelection);
document.getElementById("radius-input").addEventListener("input", updateRadiusCircle);
document.getElementById("latitude").addEventListener("input", updateRadiusCircle);
document.getElementById("longitude").addEventListener("input", updateRadiusCircle);
document.getElementById("radius-input").addEventListener("change", updateRadiusCircle);