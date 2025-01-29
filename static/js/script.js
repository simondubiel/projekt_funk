var map = L.map('map').setView([52.52, 13.40], 5);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

function selectStation(row) {
    let rows = document.querySelectorAll("#station-table tr");
    rows.forEach(r => r.classList.remove("selected"));
    row.classList.add("selected");

    let latitude = parseFloat(row.cells[1].innerText);
    let longitude = parseFloat(row.cells[2].innerText);

    map.setView([latitude, longitude], 10);
}

function toggleRadiusDropdown() {
    let dropdown = document.getElementById("radius-dropdown");
    dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
}

function setRadiusValue(value) {
    document.getElementById("radius-input").value = value;
    document.getElementById("radius-dropdown").style.display = "none";
}

function saveSearchCriteria() {
    let latitude = document.querySelector(".input-field[placeholder='Latitude']").value;
    let longitude = document.querySelector(".input-field[placeholder='Longitude']").value;
    let radius = document.getElementById("radius-input").value;

    let searchCriteria = {
        latitude: latitude,
        longitude: longitude,
        radius: radius
    };

    console.log("Gespeicherte Suchkriterien:", searchCriteria);
    localStorage.setItem("searchCriteria", JSON.stringify(searchCriteria));
}
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

function displayWeatherData(data) {
    const container = document.getElementById("weather-data-container");
    container.innerHTML = "<h3>Weather Data</h3>";
    
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

// Modify existing function to send station ID to backend
function selectStation(row) {
    let rows = document.querySelectorAll("#station-table tr");
    rows.forEach(r => r.classList.remove("selected"));
    row.classList.add("selected");

    let stationId = row.cells[0].innerText;
    let latitude = parseFloat(row.cells[1].innerText);
    let longitude = parseFloat(row.cells[2].innerText);

    map.setView([latitude, longitude], 10);

    // Fetch weather data for the selected station
    fetchWeatherData(stationId);
}