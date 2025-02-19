/* ------------------ Hilfsfunktion ------------------ */
function getInputValue(id) {
  return document.getElementById(id).value.trim();
}
let latitude_positive;

/* ------------------ Leaflet Map Initialization ------------------ */
var map = L.map('map').setView([52.52, 13.40], 5);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

var marker;
var radiusCircle;

/* ------------------ Map Marker Update ------------------ */
function updateMapMarker() {
  let latStr = getInputValue("latitude");
  let lonStr = getInputValue("longitude");
  if (latStr === "" || lonStr === "") {
    return;
  }
  let latitude = parseFloat(latStr);
  let longitude = parseFloat(lonStr);
  if (isNaN(latitude) || isNaN(longitude)) {
    return;
  }
  if (marker) {
    marker.setLatLng([latitude, longitude]);
  } else {
    marker = L.marker([latitude, longitude]).addTo(map);
  }
  map.setView([latitude, longitude], 10);
  //Ergänzung zur Bestimmung der Halbkugel
  if (latitude >= 0) {
    latitude_positive = true;
  }
  else {
    latitude_positive = false;
  }
}

/* ------------------ Update Radius Circle ------------------ */
function updateRadiusCircle() {
  let latStr = getInputValue("latitude");
  let lonStr = getInputValue("longitude");
  let radiusStr = getInputValue("radius-input");

  // Wenn ein Feld leer ist, nicht fortfahren
  if (latStr === "" || lonStr === "" || radiusStr === "") {
    return;
  }

  let latitude = parseFloat(latStr);
  let longitude = parseFloat(lonStr);
  let radiusKm = parseFloat(radiusStr);

  if (isNaN(latitude) || isNaN(longitude) || isNaN(radiusKm)) {
    console.warn("Ungültige Werte für den Radius oder die Koordinaten.");
    return;
  }

  if (radiusCircle) {
    map.removeLayer(radiusCircle);
  }
  radiusCircle = L.circle([latitude, longitude], {
    color: "blue",
    fillColor: "blue",
    fillOpacity: 0.2,
    radius: radiusKm * 1000 // Umrechnung km -> Meter
  }).addTo(map);
  map.setView([latitude, longitude], 10);
}

/* ------------------ Station Selection ------------------ */
function selectStation(row) {
  // Entferne 'selected'-Klasse von allen Zeilen
  document.querySelectorAll("#station-table tr").forEach(r => r.classList.remove("selected"));
  row.classList.add("selected");

  let stationId = row.cells[0].innerText;
  let latitude = parseFloat(row.cells[1].innerText);
  let longitude = parseFloat(row.cells[2].innerText);
  map.setView([latitude, longitude], 10);

  let startYear = getInputValue("start-year");
  let endYear = getInputValue("end-year");
  fetchWeatherData(stationId, startYear, endYear);
}

/* ------------------ Dropdown Functionality ------------------ */
function toggleDropdown(event) {
  let targetId = event.target.dataset.target;
  let dropdown = document.getElementById(targetId);
  if (dropdown) {
    let isVisible = dropdown.style.display === "block";
    document.querySelectorAll(".dropdown-list").forEach(el => el.style.display = "none");
    dropdown.style.display = isVisible ? "none" : "block";
  }
}

function setDropdownValue(value, inputId, dropdownId) {
  document.getElementById(inputId).value = value;
  document.getElementById(dropdownId).style.display = "none";
}

/* ------------------ Fetch Stations based on Criteria ------------------ */
async function fetchStationData() {
  let stationCount = getInputValue("station-count-input");
  let radius = getInputValue("radius-input");
  let latitude = getInputValue("latitude");
  let longitude = getInputValue("longitude");

  // Prüfen, ob alle Werte vorhanden sind
  if (latitude === "" || longitude === "" || radius === "" || stationCount === "") {
    console.error("Nicht alle Suchkriterien sind gesetzt.");
    return;
  }
  // Query-Parameter sicher zusammenbauen
  let queryParams = `?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&radius_km=${encodeURIComponent(radius)}&station_count=${encodeURIComponent(stationCount)}`;
  let fetchUrl = `/get_stations${queryParams}`;
  console.log("Fetching Stations from:", fetchUrl);
  try {
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      let errorText = await response.text();
      throw new Error(`Server returned ${response.status}: ${errorText}`);
    }
    // Zur besseren Fehlersuche zunächst die rohe Antwort loggen
    const rawText = await response.text();
    console.log("Raw response:", rawText);
    // Anschließend versuchen wir, die Antwort als JSON zu parsen
    const data = JSON.parse(rawText);
    updateStationTable(data);
  } catch (error) {
    console.error("Error fetching stations:", error);
  }
}

/* ------------------ Update Station Table ------------------ */
function updateStationTable(stationData) {
  let tableBody = document.getElementById("station-table");
  tableBody.innerHTML = "";
  if (!stationData || stationData.length === 0) {
    tableBody.innerHTML = "<tr><td colspan='4'>Keine Stationen verfügbar</td></tr>";
    return;
  }
  stationData.forEach(station => {
    let row = document.createElement("tr");
    row.innerHTML = `
      <td>${station.ID}</td>
      <td>${station.LATITUDE}</td>
      <td>${station.LONGITUDE}</td>
      <td>${station.NAME}</td>
    `;
    row.addEventListener("click", () => selectStation(row));
    tableBody.appendChild(row);
  });
}

/* ------------------ Fetch Weather Data ------------------ */
async function fetchWeatherData(stationId, startYear, endYear) {
  try {
    const response = await fetch(`/get_weather_data?station_id=${encodeURIComponent(stationId)}&start_year=${encodeURIComponent(startYear)}&end_year=${encodeURIComponent(endYear)}`);
    if (!response.ok) {
      let errorText = await response.text();
      throw new Error(`Server returned ${response.status}: ${errorText}`);
    }
    const data = await response.json();
    if (data.error) {
      console.error("Error fetching weather data:", data.error);
      document.getElementById("d3-chart").innerHTML = `<p>Error: ${data.error}</p>`;
      return;
    }
    processWeatherData(data);
  } catch (error) {
    console.error("Failed to fetch weather data:", error);
  }
}

/* ------------------ Process Weather Data for D3 Visualization ------------------ */
function processWeatherData(data) {
  // Konvertiere Datum und Wert
  data.forEach(d => {
    d.DATE = new Date(d.DATE);
    d.VALUE = +d.VALUE;
    d.VALUE = d.VALUE / 10;  // Umrechnung von 0.1 Grad Celsius in Grad Celsius
  });
  
  let tminData = data.filter(d => d.ELEMENT === "TMIN");
  let tmaxData = data.filter(d => d.ELEMENT === "TMAX");

  let annualTmin = d3.nest()
    .key(d => d.DATE.getFullYear())
    .rollup(values => d3.mean(values, d => d.VALUE))
    .entries(tminData)
    .map(d => ({ year: +d.key, value: d.value }));
  
  let annualTmax = d3.nest()
    .key(d => d.DATE.getFullYear())
    .rollup(values => d3.mean(values, d => d.VALUE))
    .entries(tmaxData)
    .map(d => ({ year: +d.key, value: d.value }));

  function getSeason(date) {
    let month = date.getMonth() + 1;
    if (latitude_positive) {
      if (month === 12 || month === 1 || month === 2) return "Winter";
      else if (month >= 3 && month <= 5) return "Spring";
      else if (month >= 6 && month <= 8) return "Summer";
      else if (month >= 9 && month <= 11) return "Autumn";
    }
    else {
      if (month === 12 || month === 1 || month === 2) return "Summer";
      else if (month >= 3 && month <= 5) return "Autumn";
      else if (month >= 6 && month <= 8) return "Winter";
      else if (month >= 9 && month <= 11) return "Spring";
    }
  }

  function getSeasonYear(date) {
    let year = date.getFullYear();
    let month = date.getMonth() + 1;
    return month === 12 ? year + 1 : year;
  }
  
  let seasonalTmin = d3.nest()
    .key(d => getSeasonYear(d.DATE) + "-" + getSeason(d.DATE))
    .rollup(values => {
      return {
        season: getSeason(values[0].DATE),
        year: getSeasonYear(values[0].DATE),
        value: d3.mean(values, d => d.VALUE)
      };
    })
    .entries(tminData)
    .map(d => d.value);
  
  let seasonalTmax = d3.nest()
    .key(d => getSeasonYear(d.DATE) + "-" + getSeason(d.DATE))
    .rollup(values => {
      return {
        season: getSeason(values[0].DATE),
        year: getSeasonYear(values[0].DATE),
        value: d3.mean(values, d => d.VALUE)
      };
    })
    .entries(tmaxData)
    .map(d => d.value);
  
  let processedData = {
    annualTmin: annualTmin,
    annualTmax: annualTmax,
    seasonalTmin: seasonalTmin,
    seasonalTmax: seasonalTmax
  };
  // Global speichern, damit Filter auch die Tabelle aktualisieren
  window.currentWeatherDataset = processedData;
  drawChart(processedData);
  drawDataTable(processedData);
}

/* ------------------ Draw D3 Chart with Legend ------------------ */
function drawChart(dataset) {
  // Vorherige Inhalte löschen
  d3.select("#d3-chart").selectAll("*").remove();
  d3.select("#chart-legend").selectAll("*").remove();
  
  let margin = {top: 20, right: 80, bottom: 50, left: 50},
      width = 800 - margin.left - margin.right,
      height = 400 - margin.top - margin.bottom;
  
  let svg = d3.select("#d3-chart").append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
  
  let allAnnual = dataset.annualTmin.concat(dataset.annualTmax);
  let xDomain = d3.extent(allAnnual, d => d.year);
  let yDomain = d3.extent(allAnnual, d => d.value);
  
  let x = d3.scaleLinear().domain(xDomain).range([0, width]);
  let y = d3.scaleLinear().domain(yDomain).range([height, 0]);
  
  svg.append("g")
    .attr("transform", "translate(0," + height + ")")
    .call(d3.axisBottom(x).tickFormat(d3.format("d")));
  
  svg.append("g")
    .call(d3.axisLeft(y));
  
  let lineGenerator = d3.line()
    .x(d => x(d.year))
    .y(d => y(d.value));
  
  // Linien definieren
  let lines = [
    {name: "Annual TMIN", data: dataset.annualTmin, color: "blue", visible: true},
    {name: "Annual TMAX", data: dataset.annualTmax, color: "red", visible: true}
  ];
  
  // Saisonale Daten gruppieren
  let seasonalGroupsTmin = d3.nest()
    .key(d => d.season)
    .entries(dataset.seasonalTmin);
  let seasonalGroupsTmax = d3.nest()
    .key(d => d.season)
    .entries(dataset.seasonalTmax);
  
  seasonalGroupsTmin.forEach(group => {
    lines.push({name: `Seasonal TMIN ${group.key}`, data: group.values, color: "lightblue", visible: true});
  });
  seasonalGroupsTmax.forEach(group => {
    lines.push({name: `Seasonal TMAX ${group.key}`, data: group.values, color: "pink", visible: true});
  });
  
  // Linien zeichnen
  lines.forEach(lineData => {
    lineData.path = svg.append("path")
      .datum(lineData.data)
      .attr("fill", "none")
      .attr("stroke", lineData.color)
      .attr("stroke-width", 2)
      .attr("d", lineGenerator)
      .attr("class", "line")
      .attr("data-name", lineData.name);
  });
  
  // Legende mit Checkboxes
  let legend = d3.select("#chart-legend").append("div");
  lines.forEach(lineData => {
    let legendItem = legend.append("div");
    legendItem.append("input")
      .attr("type", "checkbox")
      .attr("checked", true)
      .attr("id", lineData.name)
      .on("change", function() {
        lineData.visible = this.checked;
        updateChartVisibility(lines);
        drawDataTable(window.currentWeatherDataset);
      });
    legendItem.append("label")
      .attr("for", lineData.name)
      .text(lineData.name)
      .style("color", lineData.color);
  });
}

function updateChartVisibility(lines) {
  lines.forEach(lineData => {
    d3.select(`path[data-name='${lineData.name}']`)
      .style("display", lineData.visible ? null : "none");
  });
}

/* ------------------ Draw Data Table ------------------ */
function drawDataTable(dataset) {
  let visibleSeries = [];
  d3.selectAll("#chart-legend input").each(function() {
    if (this.checked) {
      visibleSeries.push(this.id);
    }
  });
  
  let tableContainer = document.getElementById("d3-data-table");
  tableContainer.innerHTML = "";
  
  // ---------------- Annual Data Table ----------------
  let annualSeries = visibleSeries.filter(name => name.startsWith("Annual"));
  if (annualSeries.length > 0) {
    let annualData = {};
    if (annualSeries.includes("Annual TMIN")) {
      dataset.annualTmin.forEach(d => {
        if (!annualData[d.year]) annualData[d.year] = {};
        annualData[d.year]["Annual TMIN"] = d.value;
      });
    }
    if (annualSeries.includes("Annual TMAX")) {
      dataset.annualTmax.forEach(d => {
        if (!annualData[d.year]) annualData[d.year] = {};
        annualData[d.year]["Annual TMAX"] = d.value;
      });
    }
    let tableHTML = "<h4>Annual Data</h4><table border='1'><thead><tr><th>Year</th>";
    annualSeries.forEach(series => {
      tableHTML += `<th>${series}</th>`;
    });
    tableHTML += "</tr></thead><tbody>";
    Object.keys(annualData).sort().forEach(year => {
      tableHTML += `<tr><td>${year}</td>`;
      annualSeries.forEach(series => {
        tableHTML += `<td>${annualData[year][series] ? annualData[year][series].toFixed(2) : ""}</td>`;
      });
      tableHTML += "</tr>";
    });
    tableHTML += "</tbody></table>";
    tableContainer.innerHTML += tableHTML;
  }
  
  // ---------------- Seasonal Data Table (grouped by year) ----------------
  let seasonalSeries = visibleSeries.filter(name => name.startsWith("Seasonal"));
  if (seasonalSeries.length > 0) {
    let seasonalData = {};
    // Process Seasonal TMIN data
    dataset.seasonalTmin.forEach(d => {
      let key = d.year;  // group by year only
      if (!seasonalData[key]) seasonalData[key] = { year: d.year };
      let seriesName = `Seasonal TMIN ${d.season}`;
      if (seasonalSeries.includes(seriesName)) {
        seasonalData[key][seriesName] = d.value;
      }
    });
    // Process Seasonal TMAX data
    dataset.seasonalTmax.forEach(d => {
      let key = d.year;  // group by year only
      if (!seasonalData[key]) seasonalData[key] = { year: d.year };
      let seriesName = `Seasonal TMAX ${d.season}`;
      if (seasonalSeries.includes(seriesName)) {
        seasonalData[key][seriesName] = d.value;
      }
    });
    
    let tableHTML = "<h4>Seasonal Data</h4><table border='1'><thead><tr><th>Year</th>";
    seasonalSeries.forEach(series => {
      tableHTML += `<th>${series}</th>`;
    });
    tableHTML += "</tr></thead><tbody>";
    Object.keys(seasonalData).sort().forEach(year => {
      let row = seasonalData[year];
      tableHTML += `<tr><td>${row.year}</td>`;
      seasonalSeries.forEach(series => {
        tableHTML += `<td>${row[series] !== undefined ? row[series].toFixed(2) : ""}</td>`;
      });
      tableHTML += "</tr>";
    });
    tableHTML += "</tbody></table>";
    tableContainer.innerHTML += tableHTML;
  }
}

/* ------------------ Confirm Button Action ------------------ */
function confirmSelection() {
  saveSearchCriteria();
  fetchStationData();
}

function saveSearchCriteria() {
  let searchCriteria = {
    "station_count": getInputValue("station-count-input"),
    "radius_km": getInputValue("radius-input"),
    "start_year": getInputValue("start-year"),
    "end_year": getInputValue("end-year"),
    "latitude": getInputValue("latitude"),
    "longitude": getInputValue("longitude")
  };
  console.log("Gespeicherte Suchkriterien:", JSON.stringify(searchCriteria, null, 2));
}

/* ------------------ Input Validation ------------------ */
function validateNumericInput(input) {
  input.value = input.value.replace(/[^0-9.]/g, '');
}

/* ------------------ Event Listeners ------------------ */
document.querySelectorAll(".dropdown-btn").forEach(btn => {
  btn.addEventListener("click", toggleDropdown);
});

document.addEventListener("click", function(event) {
  if (!event.target.classList.contains("dropdown-btn")) {
    document.querySelectorAll(".dropdown-list").forEach(dropdown => {
      dropdown.style.display = "none";
    });
  }
});

function setStationCount(value) {
  document.getElementById("station-count-input").value = value;
  document.getElementById("station-count-dropdown").style.display = "none";
}

function setRadiusValue(value) {
  document.getElementById("radius-input").value = value;
  document.getElementById("radius-dropdown").style.display = "none";
  updateRadiusCircle();
}

document.getElementById("latitude").addEventListener("input", () => {
  updateMapMarker();
  updateRadiusCircle();
});
document.getElementById("longitude").addEventListener("input", () => {
  updateMapMarker();
  updateRadiusCircle();
});
document.getElementById("radius-input").addEventListener("input", updateRadiusCircle);
document.getElementById("confirm-btn").addEventListener("click", confirmSelection);