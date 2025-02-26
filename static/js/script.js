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
  let stationName = row.cells[3].innerText; // Get station name

  map.setView([latitude, longitude], 10);

  // Update the headers with the station name
  let annualHeader = document.querySelector("#annual-data-container .BoxHeading");
  let seasonalHeader = document.querySelector("#seasonal-data-container .BoxHeading");
  let graphHeader = document.querySelector("#chart-container .BoxHeading");

  if (annualHeader) {
    annualHeader.innerText = `${stationName} - Jährliche Durchschnittswerte`;
  }
  if (seasonalHeader) {
    seasonalHeader.innerText = `${stationName} - Saisonale Durchschnittswerte`;
  }

  if (graphHeader) {
    graphHeader.innerText = `${stationName} - Wetterdaten`;
  }

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
  let startYear = getInputValue("start-year");
  let endYear = getInputValue("end-year");

  // Prüfen, ob alle Werte vorhanden sind
  if (latitude === "" || longitude === "" || radius === "" || stationCount === "" || startYear === "" || endYear === "") {
    console.error("Nicht alle Suchkriterien sind gesetzt.");
    return;
  }
  // Query-Parameter sicher zusammenbauen
  let queryParams = `?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&radius_km=${encodeURIComponent(radius)}&station_count=${encodeURIComponent(stationCount)}&start_year=${encodeURIComponent(startYear)}&end_year=${encodeURIComponent(endYear)}`;
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
  // Clear previous chart and legend content
  d3.select("#d3-chart").selectAll("*").remove();
  d3.select("#chart-legend").selectAll("*").remove();

  var margin = { top: 20, right: 80, bottom: 50, left: 50 },
      width = 1200 - margin.left - margin.right,
      height = 400 - margin.top - margin.bottom;

  var svg = d3.select("#d3-chart").append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  // Combine all y values from annual and seasonal data
  var allData = dataset.annualTmin.concat(dataset.annualTmax, dataset.seasonalTmin, dataset.seasonalTmax);
  var yMin = d3.min(allData, function(d) { return d.value; });
  var yMax = d3.max(allData, function(d) { return d.value; });
  yMin = Math.min(yMin, 0) - 4;
  yMax = Math.max(yMax, 0) + 4;

  // Compute x domain based on all years in the dataset
  var minYear = d3.min(allData, function(d) { return d.year; });
  var maxYear = d3.max(allData, function(d) { return d.year; });
  var xDomain = [minYear, maxYear];

  var x = d3.scaleLinear().domain(xDomain).range([0, width]);
  var y = d3.scaleLinear().domain([yMin, yMax]).range([height, 0]);

  // Create x-axis with tick values for every year and rotate labels by -70°
  var tickValues = d3.range(minYear, maxYear + 1);
  var xAxisGroup = svg.append("g")
    .attr("class", "axis x-axis")
    .attr("transform", "translate(0," + y(0) + ")")
    .call(d3.axisBottom(x)
      .tickFormat(d3.format("d"))
      .tickValues(tickValues)
    );

  xAxisGroup.selectAll("text")
    .attr("transform", "rotate(70)")
    .attr("text-anchor", "start")
    .style("font-weight", "normal");

  // Create y-axis
  svg.append("g")
    .attr("class", "axis y-axis")
    .call(d3.axisLeft(y));

  var lineGenerator = d3.line()
    .x(function(d) { return x(d.year); })
    .y(function(d) { return y(d.value); });

  // Define color mappings
  var annualColors = {
    "Annual TMIN": "#6699FF",
    "Annual TMAX": "#CC0000"
  };
  var seasonColors = {
    "Spring": { TMIN: "#339900", TMAX: "#00CC00" },
    "Summer": { TMIN: "#FF6633", TMAX: "#FF3300" },
    "Autumn": { TMIN: "#663300", TMAX: "#CC6633" },
    "Winter": { TMIN: "#666666", TMAX: "#CCCCCC" }
  };

  // Build array of lines to plot
  var lines = [
    { name: "Annual TMIN", data: dataset.annualTmin, color: annualColors["Annual TMIN"], visible: true },
    { name: "Annual TMAX", data: dataset.annualTmax, color: annualColors["Annual TMAX"], visible: true }
  ];

  // Group seasonal data and add to lines array
  var seasonalGroupsTmin = d3.nest()
    .key(function(d) { return d.season; })
    .entries(dataset.seasonalTmin);
  var seasonalGroupsTmax = d3.nest()
    .key(function(d) { return d.season; })
    .entries(dataset.seasonalTmax);

  seasonalGroupsTmin.forEach(function(group) {
    var season = group.key;
    var color = seasonColors[season] ? seasonColors[season].TMIN : "black";
    lines.push({ name: "TMIN " + season, data: group.values, color: color, visible: true });
  });
  seasonalGroupsTmax.forEach(function(group) {
    var season = group.key;
    var color = seasonColors[season] ? seasonColors[season].TMAX : "black";
    lines.push({ name: "TMAX " + season, data: group.values, color: color, visible: true });
  });

  // Draw each line (all lines are drawn initially)
  lines.forEach(function(lineData) {
    lineData.path = svg.append("path")
      .datum(lineData.data)
      .attr("fill", "none")
      .attr("stroke", lineData.color)
      .attr("stroke-width", 2)
      .attr("d", lineGenerator)
      .attr("class", "line")
      .attr("data-name", lineData.name);
  });

  // Add the legend with checkboxes to toggle visibility
  var legendContainer = d3.select("#chart-legend");
  legendContainer.html("");
  if (lines && lines.length > 0) {
    var legend = legendContainer.append("div");
    lines.forEach(function(lineData) {
      var legendItem = legend.append("div");
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
}

// This function toggles display of each line based on its "visible" flag.
function updateChartVisibility(lines) {
  lines.forEach(function(lineData) {
    d3.select("path[data-name='" + lineData.name + "']")
      .style("display", lineData.visible ? null : "none");
  });
}

/* ------------------ Draw Data Table ------------------ */
function drawDataTable(dataset) {
  // Determine which series are visible
  let visibleSeries = [];
  d3.selectAll("#chart-legend input").each(function() {
    if (this.checked) {
      visibleSeries.push(this.id);
    }
  });
  
  // Get the two containers by their new IDs
  let annualTableContainer = document.getElementById("annual-data-table");
  let seasonalTableContainer = document.getElementById("seasonal-data-table");
  annualTableContainer.innerHTML = "";
  seasonalTableContainer.innerHTML = "";
  
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
    let annualTableHTML = "<table border='1'><thead><tr><th>Year</th>";
    annualSeries.forEach(series => {
      annualTableHTML += `<th>${series}</th>`;
    });
    annualTableHTML += "</tr></thead><tbody>";
    Object.keys(annualData).sort().forEach(year => {
      annualTableHTML += `<tr><td>${year}</td>`;
      annualSeries.forEach(series => {
        annualTableHTML += `<td>${annualData[year][series] ? annualData[year][series].toFixed(2) : ""}</td>`;
      });
      annualTableHTML += "</tr>";
    });
    annualTableHTML += "</tbody></table>";
    annualTableContainer.innerHTML = annualTableHTML;
  }
  
  // ---------------- Seasonal Data Table (grouped by year) ----------------
  let seasonalSeries = visibleSeries.filter(name => name.startsWith("TMIN") || name.startsWith("TMAX"));
  if (seasonalSeries.length > 0) {
    let seasonalData = {};
    // Process Seasonal TMIN data
    dataset.seasonalTmin.forEach(d => {
      let key = d.year;  // Group by year
      if (!seasonalData[key]) seasonalData[key] = { year: d.year };
      let seriesName = `TMIN ${d.season}`;
      if (seasonalSeries.includes(seriesName)) {
        seasonalData[key][seriesName] = d.value;
      }
    });
    // Process Seasonal TMAX data
    dataset.seasonalTmax.forEach(d => {
      let key = d.year;  // Group by year
      if (!seasonalData[key]) seasonalData[key] = { year: d.year };
      let seriesName = `TMAX ${d.season}`;
      if (seasonalSeries.includes(seriesName)) {
        seasonalData[key][seriesName] = d.value;
      }
    });
    
    let seasonalTableHTML = "<table border='1'><thead><tr><th>Year</th>";
    seasonalSeries.forEach(series => {
      seasonalTableHTML += `<th>${series}</th>`;
    });
    seasonalTableHTML += "</tr></thead><tbody>";
    Object.keys(seasonalData).sort().forEach(year => {
      let row = seasonalData[year];
      seasonalTableHTML += `<tr><td>${row.year}</td>`;
      seasonalSeries.forEach(series => {
        seasonalTableHTML += `<td>${row[series] !== undefined ? row[series].toFixed(2) : ""}</td>`;
      });
      seasonalTableHTML += "</tr>";
    });
    seasonalTableHTML += "</tbody></table>";
    seasonalTableContainer.innerHTML = seasonalTableHTML;
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