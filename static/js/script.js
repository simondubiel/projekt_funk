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
var stationMarkers = [];

// Allow selecting coordinates by clicking on the map when the inputs are empty.
map.on('click', function(e) {
  let tableBody = document.getElementById("station-table");
  // Allow selecting new coordinates if there are no data rows,
  // i.e. if the table is empty or contains only the "Keine Stationen verfügbar" row.
  if (!tableBody || tableBody.childElementCount === 0 || (tableBody.childElementCount === 1 && tableBody.innerText.trim().includes("Keine Stationen verfügbar"))) {
    let lat = e.latlng.lat;
    let lon = e.latlng.lng;
    document.getElementById("latitude").value = lat.toFixed(5);
    document.getElementById("longitude").value = lon.toFixed(5);
    updateMapMarker();
    updateRadiusCircle();
  }
});

/* ------------------ Custom Red Icon for Coordinates Marker ------------------ */
var redIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-shadow.png',
  shadowSize: [41, 41]
});

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
    marker = L.marker([latitude, longitude], { icon: redIcon }).addTo(map);
  }
  map.setView([latitude, longitude], 10);
  if (latitude >= 0) {
    latitude_positive = true;
  } else {
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

/* ------------------ Fetch Stations based on Criteria ------------------ */
/* ------------------ Filter Stations by Weather Data ------------------ */
async function filterStationsByWeatherData(stations, startYear, endYear) {
  let filteredStations = [];
  await Promise.all(stations.map(async (station) => {
    try {
      const response = await fetch(`/get_weather_data?station_id=${encodeURIComponent(station.ID)}&start_year=${encodeURIComponent(startYear)}&end_year=${encodeURIComponent(endYear)}`);
      if (!response.ok) {
        console.warn(`Weather data not available for station ${station.ID}`);
        return;
      }
      const data = await response.json();
      // Check if there is any record with ELEMENT "TMIN" or "TMAX"
      const hasTmin = data.some(record => record.ELEMENT === "TMIN");
      const hasTmax = data.some(record => record.ELEMENT === "TMAX");
      if (hasTmin || hasTmax) {
        filteredStations.push(station);
      }
    } catch (error) {
      console.error(`Error checking weather data for station ${station.ID}:`, error);
    }
  }));
  return filteredStations;
}

/* ------------------ Fetch Stations based on Criteria ------------------ */
async function fetchStationData() {
  let stationCount = getInputValue("station-count-input");
  let radius = getInputValue("radius-input");
  let latitude = getInputValue("latitude");
  let longitude = getInputValue("longitude");
  let startYear = getInputValue("start-year");
  let endYear = getInputValue("end-year");

  // Check that all criteria are provided
  if (latitude === "" || longitude === "" || radius === "" || stationCount === "" || startYear === "" || endYear === "") {
    console.error("Nicht alle Suchkriterien sind gesetzt.");
    return;
  }

  // Build query parameters safely
  let queryParams = `?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&radius_km=${encodeURIComponent(radius)}&station_count=${encodeURIComponent(stationCount)}&start_year=${encodeURIComponent(startYear)}&end_year=${encodeURIComponent(endYear)}`;
  let fetchUrl = `/get_stations${queryParams}`;
  console.log("Fetching Stations from:", fetchUrl);
  try {
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      let errorText = await response.text();
      throw new Error(`Server returned ${response.status}: ${errorText}`);
    }
    const rawText = await response.text();
    const stationData = JSON.parse(rawText);

    // Filter stations by checking for available TMIN or TMAX data within the selected timeframe.
    const filteredStations = await filterStationsByWeatherData(stationData, startYear, endYear);
    if(filteredStations.length === 0) {
      console.warn("Keine Stationen mit TMIN oder TMAX Daten in diesem Zeitraum gefunden.");
    }
    updateStationTable(filteredStations);
    updateStationMarkers(filteredStations);
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

/* ------------------ Update Station Markers on Map ------------------ */
function updateStationMarkers(stationData) {
  console.log("Stationen:", stationData);
  // Remove any existing station markers from the map.
  stationMarkers.forEach(m => map.removeLayer(m));
  stationMarkers = [];
  if (!stationData || stationData.length === 0) return;
  stationData.forEach(station => {
    var lat = parseFloat(station.LATITUDE);
    var lon = parseFloat(station.LONGITUDE);
    var m = L.marker([lat, lon]);
    // When clicking the marker, select the station (similar to table row selection)
    m.on("click", function() {
      selectStationByData(station);
    });
    m.addTo(map);
    stationMarkers.push(m);
  });
}

/* ------------------ Select Station via Marker Data ------------------ */
function selectStationByData(station) {
  // Mimic table row selection using station data
  let lat = parseFloat(station.LATITUDE);
  let lon = parseFloat(station.LONGITUDE);
  map.setView([lat, lon], 10);

  let annualHeader = document.querySelector("#annual-data-container .BoxHeading");
  let seasonalHeader = document.querySelector("#seasonal-data-container .BoxHeading");
  let graphHeader = document.querySelector("#chart-container .BoxHeading");

  if (annualHeader) { annualHeader.innerText = `${station.NAME} - Jährliche Durchschnittswerte`; }
  if (seasonalHeader) { seasonalHeader.innerText = `${station.NAME} - Saisonale Durchschnittswerte`; }
  if (graphHeader) { graphHeader.innerText = `${station.NAME} - Wetterdaten`; }

  let startYear = getInputValue("start-year");
  let endYear = getInputValue("end-year");
  fetchWeatherData(station.ID, startYear, endYear);
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
    console.log("Raw weather data:", data);
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
    } else {
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
  // Call drawChart; drawDataTable will be called from drawChart after setting window.currentLines
  drawChart(processedData);
}

/* ------------------ Helper: Fill Missing Years ------------------ */
// This function returns an array for every year in [minYear, maxYear].
// If a year is missing in the input data, it inserts an object with value null.
function fillMissingYears(data, minYear, maxYear) {
  let dataMap = new Map();
  data.forEach(d => dataMap.set(d.year, d.value));
  let filled = [];
  for (let year = minYear; year <= maxYear; year++) {
    if (dataMap.has(year)) {
      filled.push({ year: year, value: dataMap.get(year) });
    } else {
      filled.push({ year: year, value: null });
    }
  }
  return filled;
}

/* ------------------ Draw D3 Chart with Legend ------------------ */
function drawChart(dataset) {
  
  console.log("Annual TMIN:", dataset.annualTmin);
  console.log("Annual TMAX:", dataset.annualTmax);
  console.log("Seasonal TMIN:", dataset.seasonalTmin);
  console.log("Seasonal TMAX:", dataset.seasonalTmax);

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
  var totalTicks = tickValues.length;

  if (totalTicks > 100) {
    tickValues = tickValues.filter((d, i) => i % 20 === 0);
  } else if (totalTicks > 60) {
    tickValues = tickValues.filter((d, i) => i % 10 === 0);
  } else if (totalTicks > 40) {
    tickValues = tickValues.filter((d, i) => i % 5 === 0);
  } else if (totalTicks > 30) {
    tickValues = tickValues.filter((d, i) => i % 3 === 0);
  } 

  var xAxis = d3.axisBottom(x)
    .tickFormat(d3.format("d"))
    .tickValues(tickValues)
    .tickSizeInner(0)
    .tickSizeOuter(0);

  var xAxisGroup = svg.append("g")
      .attr("class", "axis x-axis")
      .attr("transform", "translate(0," + height + ")")
      .call(xAxis);

  xAxisGroup.selectAll("text")
      .attr("dy", "1em")
      .attr("transform", function() {
        return "translate(15,15) rotate(70)";
      })
      .style("text-anchor", "middle");
    
  // Create a grid axis based on the y scale
  var yGrid = d3.axisLeft(y)
    .tickSize(-width)
    .tickFormat("")
    .ticks(10);

  var gridGroup = svg.append("g")
    .attr("class", "grid")
    .call(yGrid)
    .selectAll("line")
    .attr("stroke", "#ddd")
    .attr("stroke-dasharray", "2,2");

  svg.select(".grid").selectAll("line")
    .filter(function() {
      // The bottom grid line should have a y-coordinate equal to the chart height.
      return +d3.select(this).attr("y1") === height;
    })
    .remove();

  svg.select(".grid").select(".domain").remove();

  svg.append("line")
    .attr("x1", 0)
    .attr("x2", width)
    .attr("y1", y(0)) 
    .attr("y2", y(0))
    .attr("stroke", "black")
    .attr("stroke-width", 1);

  // Create y-axis without tick marks on the left side
  svg.append("g")
    .attr("class", "axis y-axis")
    .call(d3.axisLeft(y).tickSize(0));

  // Define the line generator with a defined accessor.
  var lineGenerator = d3.line()
    .defined(function(d) { return d.value != null; })
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
    "Autumn": { TMIN: "#993300", TMAX: "#CC6633" },
    "Winter": { TMIN: "#666666", TMAX: "#CCCCCC" }
  };

  // Build array of lines to plot
  var lines = [
    { name: "Annual TMIN", data: dataset.annualTmin, color: annualColors["Annual TMIN"], visible: true },
    { name: "Annual TMAX", data: dataset.annualTMAX || dataset.annualTmax, color: annualColors["Annual TMAX"], visible: true }
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

  // For each line, fill missing years so that gaps appear if data is missing.
  lines.forEach(function(lineData) {
    // Replace the raw data with a complete series including nulls for missing years.
    lineData.filledData = fillMissingYears(lineData.data, minYear, maxYear);
    lineData.path = svg.append("path")
      .datum(lineData.filledData)
      .attr("fill", "none")
      .attr("stroke", lineData.color)
      .attr("stroke-width", 2)
      .attr("d", lineGenerator)
      .attr("class", "line")
      .attr("data-name", lineData.name);
  });

  // Store lines globally so that data table and legend events can access them
  window.currentLines = lines;

  // Add the legend with clickable dot and text
  var legendContainer = d3.select("#chart-legend");
  legendContainer.html("");  // Clear previous legend content
  if (lines && lines.length > 0) {
    var legend = legendContainer.append("div");
    lines.forEach(function(lineData) {
      var legendItem = legend.append("div")
        .attr("class", "legend-item")
        .on("click", function() {
          // Toggle visibility
          lineData.visible = !lineData.visible;
          updateChartVisibility(window.currentLines);
          drawDataTable(window.currentWeatherDataset, window.currentLines);
          // Update styles based on visibility
          d3.select(this).select(".legend-dot")
            .style("background-color", lineData.visible ? lineData.color : "gray");
          d3.select(this).select(".legend-text")
            .style("color", lineData.visible ? lineData.color : "gray")
            .style("text-decoration", lineData.visible ? "none" : "line-through");
        });
      
      // Create the colored dot
      legendItem.append("span")
        .attr("class", "legend-dot")
        .style("display", "inline-block")
        .style("width", "16px")
        .style("height", "16px")
        .style("border-radius", "50%")
        .style("background-color", lineData.color);
      
      // Create the text for the legend item
      legendItem.append("span")
        .attr("class", "legend-text")
        .style("margin-left", "15px")
        .text(lineData.name)
        .style("color", lineData.color);
    });
  }
  
  // After drawing the chart, update the data tables using the global lines
  drawDataTable(window.currentWeatherDataset, window.currentLines);


  // This function toggles display of each line based on its "visible" flag.
  function updateChartVisibility(lines) {
    lines.forEach(function(lineData) {
      d3.select("path[data-name='" + lineData.name + "']")
        .style("display", lineData.visible ? null : "none");
    });
  }

  // ***************** Interactive Hover Implementation *****************

  // Append a focus group to hold a vertical line and one circle per visible line
  var focus = svg.append("g")
    .attr("class", "focus")
    .style("display", "none");

  // Append a vertical focus line
  focus.append("line")
    .attr("class", "focus-line")
    .attr("stroke", "gray")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "3,3")
    .attr("y1", 0)
    .attr("y2", height);

  // For each line in window.currentLines, add a focus circle (initially hidden)
  window.currentLines.forEach(function(lineData, i) {
    focus.append("circle")
      .attr("class", "focus-circle")
      .attr("id", "focus-circle-" + i)
      .attr("r", 4)
      .attr("fill", lineData.color);
  });

  // Create a tooltip div (if not already created)
  var tooltip = d3.select("body").select(".tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select("body").append("div")
      .attr("class", "tooltip")
      .style("position", "absolute")
      .style("background", "#fff")
      .style("padding", "5px")
      .style("border", "1px solid #ccc")
      .style("border-radius", "5px")
      .style("pointer-events", "none")
      .style("display", "none");
  }

  // Append an overlay rectangle to capture mouse events
  svg.append("rect")
    .attr("class", "overlay")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "none")
    .attr("pointer-events", "all")
    .on("mouseover", function() {
        focus.style("display", null);
        tooltip.style("display", null);
    })
    .on("mouseout", function() {
        focus.style("display", "none");
        tooltip.style("display", "none");
    })
    .on("mousemove", mousemove);

  // Use a bisector to find the nearest data point by year
  var bisectYear = d3.bisector(function(d) { return d.year; }).left;

  function mousemove() {
    var mouse = d3.mouse(this);
    var mouseX = mouse[0];
    // Invert the x scale to get the corresponding year (could be fractional)
    var yearAtMouse = x.invert(mouseX);

    // Update the vertical focus line position
    focus.select(".focus-line")
      .attr("x1", mouseX)
      .attr("x2", mouseX);

    // Build tooltip content
    var tooltipContent = "<strong>Year:</strong> " + Math.round(yearAtMouse);

    // For each visible line, find the nearest point and update its focus circle
    window.currentLines.forEach(function(lineData, i) {
      if (!lineData.visible) {
        d3.select("#focus-circle-" + i).style("display", "none");
        tooltipContent += "<br><span style='color:" + lineData.color + "'>" + lineData.name + ":</span> n/a";
        return;
      }
      var data = lineData.filledData;
      var idx = bisectYear(data, yearAtMouse);
      var d0 = data[idx - 1];
      var d1 = data[idx];
      var dClosest;
      if (!d0) {
        dClosest = d1;
      } else if (!d1) {
        dClosest = d0;
      } else {
        dClosest = (yearAtMouse - d0.year) > (d1.year - yearAtMouse) ? d1 : d0;
      }
      if (dClosest && dClosest.value != null) {
        d3.select("#focus-circle-" + i)
          .style("display", null)
          .attr("cx", x(dClosest.year))
          .attr("cy", y(dClosest.value));
        tooltipContent += "<br><span style='color:" + lineData.color + "'>" + lineData.name + ":</span> " + dClosest.value.toFixed(2);
      } else {
        d3.select("#focus-circle-" + i).style("display", "none");
        tooltipContent += "<br><span style='color:" + lineData.color + "'>" + lineData.name + ":</span> n/a";
      }
    });

    // Position and update tooltip
    tooltip.html(tooltipContent)
           .style("left", (d3.event.pageX + 10) + "px")
           .style("top", (d3.event.pageY - 28) + "px");
  }
}
/* ------------------ Draw Data Table ------------------ */
function drawDataTable(dataset, lines) {
  // Determine which series are visible
  let visibleSeries = lines.filter(line => line.visible).map(line => line.name);
  
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