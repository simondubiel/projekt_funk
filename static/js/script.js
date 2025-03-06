function getInputValue(id) {
  return document.getElementById(id).value.trim();
}
let latitude_positive;

var map = L.map('map').setView([52.52, 13.40], 5);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

var marker;
var radiusCircle;
var stationMarkers = [];

const mapContainer = document.getElementById('map');
const resizeObserver = new ResizeObserver(entries => {
  map.invalidateSize();
});
resizeObserver.observe(mapContainer);

map.on('click', function(e) {
  let tableBody = document.getElementById("station-table");
  let updateCoordinates = false;
  
  // If no stations are listed, update coordinates.
  if (!tableBody || tableBody.childElementCount === 0 ||
      (tableBody.childElementCount === 1 && tableBody.innerText.trim().includes("Keine Stationen verfügbar"))) {
    updateCoordinates = true;
  } else if (radiusCircle) {
    // If stations are listed, update coordinates only when clicking outside the circle.
    let circleCenter = radiusCircle.getLatLng();
    let distanceFromCenter = circleCenter.distanceTo(e.latlng); // distance in meters
    if (distanceFromCenter > radiusCircle.getRadius()) {
      updateCoordinates = true;
    }
  } else {
    updateCoordinates = true;
  }
  
  if (updateCoordinates) {
    let lat = e.latlng.lat;
    let lon = e.latlng.lng;
    document.getElementById("latitude").value = lat.toFixed(5);
    document.getElementById("longitude").value = lon.toFixed(5);
    updateMapMarker();
    updateRadiusCircle();
  }
});

var redIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-shadow.png',
  shadowSize: [41, 41]
});

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
  latitude_positive = (latitude >= 0);
}

function updateRadiusCircle() {
  let latStr = getInputValue("latitude");
  let lonStr = getInputValue("longitude");
  let radiusStr = getInputValue("radius-input");

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
    radius: radiusKm * 1000
  }).addTo(map);
  map.setView([latitude, longitude], 10);
}

function selectStation(row) {
  showLoading();
  document.querySelectorAll("#station-table tr").forEach(r => r.classList.remove("selected"));
  row.classList.add("selected");

  let stationId = row.cells[0].innerText;
  let latitude = parseFloat(row.cells[1].innerText);
  let longitude = parseFloat(row.cells[2].innerText);
  let stationName = row.cells[3].innerText;

  map.setView([latitude, longitude], 10);

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
  fetchWeatherData(stationId, startYear, endYear)
    .then(() => {
      hideLoading();
    })
    .catch(error => {
      console.error(error);
      hideLoading();
    });
}

function toggleDropdown(event) {
  let targetId = event.target.dataset.target;
  let dropdown = document.getElementById(targetId);
  if (dropdown) {
    let isVisible = dropdown.style.display === "block";
    document.querySelectorAll(".dropdown-list").forEach(el => el.style.display = "none");
    dropdown.style.display = isVisible ? "none" : "block";
  }
}

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

async function fetchStationData() {
  let stationCount = getInputValue("station-count-input");
  let radius = getInputValue("radius-input");
  let latitude = getInputValue("latitude");
  let longitude = getInputValue("longitude");
  let startYear = getInputValue("start-year");
  let endYear = getInputValue("end-year");

  if (latitude === "" || longitude === "" || radius === "" || stationCount === "" || startYear === "" || endYear === "") {
    console.error("Nicht alle Suchkriterien sind gesetzt.");
    return;
  }

  let radiusKm = parseFloat(radius);
  if (isNaN(radiusKm)) {
    console.error("Ungültiger Radiuswert.");
    return;
  }

  // Request many stations; server-side filtering will return only those that have valid inventory.
  let queryParams = `?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&radius_km=${encodeURIComponent(radiusKm)}&station_count=9999&start_year=${encodeURIComponent(startYear)}&end_year=${encodeURIComponent(endYear)}`;
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

    if (stationData.length === 0) {
      console.warn("Keine Stationen gefunden, die die Kriterien erfüllen.");
    }
    
    // Limit the number of stations to display.
    const limitedStations = stationData.slice(0, parseInt(stationCount));
    
    updateStationTable(limitedStations);
    updateStationMarkers(limitedStations);
  } catch (error) {
    console.error("Error fetching stations:", error);
  }
}

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

function updateStationMarkers(stationData) {
  console.log("Stationen:", stationData);
  stationMarkers.forEach(m => map.removeLayer(m));
  stationMarkers = [];
  if (!stationData || stationData.length === 0) return;
  stationData.forEach(station => {
    var lat = parseFloat(station.LATITUDE);
    var lon = parseFloat(station.LONGITUDE);
    var m = L.marker([lat, lon]);
    m.on("click", function() {
      selectStationByData(station);
    });
    m.addTo(map);
    stationMarkers.push(m);
  });
}

function selectStationByData(station) {
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

function processWeatherData(data) {
  data.forEach(d => {
    d.DATE = new Date(d.DATE);
    d.VALUE = +d.VALUE;
    d.VALUE = d.VALUE / 10;
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
  window.currentWeatherDataset = processedData;
  drawChart(processedData);
}

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

function drawChart(dataset) {
  
  console.log("Annual TMIN:", dataset.annualTmin);
  console.log("Annual TMAX:", dataset.annualTmax);
  console.log("Seasonal TMIN:", dataset.seasonalTmin);
  console.log("Seasonal TMAX:", dataset.seasonalTmax);

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

  var allData = dataset.annualTmin.concat(dataset.annualTmax, dataset.seasonalTmin, dataset.seasonalTmax);
  var yMin = d3.min(allData, function(d) { return d.value; });
  var yMax = d3.max(allData, function(d) { return d.value; });
  yMin = Math.min(yMin, 0) - 4;
  yMax = Math.max(yMax, 0) + 4;

  var minYear = d3.min(allData, function(d) { return d.year; });
  var maxYear = d3.max(allData, function(d) { return d.year; });
  var xDomain = [minYear, maxYear];

  var x = d3.scaleLinear().domain(xDomain).range([0, width]);
  var y = d3.scaleLinear().domain([yMin, yMax]).range([height, 0]);

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

  svg.append("g")
    .attr("class", "axis y-axis")
    .call(d3.axisLeft(y).tickSize(0));

  var lineGenerator = d3.line()
    .defined(function(d) { return d.value != null; })
    .x(function(d) { return x(d.year); })
    .y(function(d) { return y(d.value); });

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

  var lines = [
    { name: "Annual TMIN", data: dataset.annualTmin, color: annualColors["Annual TMIN"], visible: true },
    { name: "Annual TMAX", data: dataset.annualTMAX || dataset.annualTmax, color: annualColors["Annual TMAX"], visible: true }
  ];

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

  lines.forEach(function(lineData) {
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

  window.currentLines = lines;

  var legendContainer = d3.select("#chart-legend");
  legendContainer.html("");
  if (lines && lines.length > 0) {
    var legend = legendContainer.append("div");
    lines.forEach(function(lineData) {
      var legendItem = legend.append("div")
        .attr("class", "legend-item")
        .on("click", function() {
          lineData.visible = !lineData.visible;
          updateChartVisibility(window.currentLines);
          drawDataTable(window.currentWeatherDataset, window.currentLines);
          d3.select(this).select(".legend-dot")
            .style("background-color", lineData.visible ? lineData.color : "gray");
          d3.select(this).select(".legend-text")
            .style("color", lineData.visible ? lineData.color : "gray")
            .style("text-decoration", lineData.visible ? "none" : "line-through");
        });
      
      legendItem.append("span")
        .attr("class", "legend-dot")
        .style("display", "inline-block")
        .style("width", "16px")
        .style("height", "16px")
        .style("border-radius", "50%")
        .style("background-color", lineData.color);
      
      legendItem.append("span")
        .attr("class", "legend-text")
        .style("margin-left", "15px")
        .text(lineData.name)
        .style("color", lineData.color);
    });
  }
  
  drawDataTable(window.currentWeatherDataset, window.currentLines);

  function updateChartVisibility(lines) {
    lines.forEach(function(lineData) {
      d3.select("path[data-name='" + lineData.name + "']")
        .style("display", lineData.visible ? null : "none");
    });
  }

  var focus = svg.append("g")
    .attr("class", "focus")
    .style("display", "none");

  focus.append("line")
    .attr("class", "focus-line")
    .attr("stroke", "gray")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "3,3")
    .attr("y1", 0)
    .attr("y2", height);

  window.currentLines.forEach(function(lineData, i) {
    focus.append("circle")
      .attr("class", "focus-circle")
      .attr("id", "focus-circle-" + i)
      .attr("r", 4)
      .attr("fill", lineData.color);
  });

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

  var bisectYear = d3.bisector(function(d) { return d.year; }).left;

  function mousemove() {
    var mouse = d3.mouse(this);
    var mouseX = mouse[0];
    var yearAtMouse = x.invert(mouseX);

    focus.select(".focus-line")
      .attr("x1", mouseX)
      .attr("x2", mouseX);

    var tooltipContent = "<strong>Year:</strong> " + Math.round(yearAtMouse);

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
        tooltipContent += "<br><span style='color:" + lineData.color + "'>" + lineData.name + ":</span> " + dClosest.value.toFixed(1);
      } else {
        d3.select("#focus-circle-" + i).style("display", "none");
        tooltipContent += "<br><span style='color:" + lineData.color + "'>" + lineData.name + ":</span> n/a";
      }
    });

    tooltip.html(tooltipContent)
           .style("left", (d3.event.pageX + 10) + "px")
           .style("top", (d3.event.pageY - 28) + "px");
  }
}

function drawDataTable(dataset, lines) {
  let visibleSeries = lines.filter(line => line.visible).map(line => line.name);
  
  let annualTableContainer = document.getElementById("annual-data-table");
  let seasonalTableContainer = document.getElementById("seasonal-data-table");
  annualTableContainer.innerHTML = "";
  seasonalTableContainer.innerHTML = "";
  
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
        annualTableHTML += `<td>${annualData[year][series] ? annualData[year][series].toFixed(1) : ""}</td>`;
      });
      annualTableHTML += "</tr>";
    });
    annualTableHTML += "</tbody></table>";
    annualTableContainer.innerHTML = annualTableHTML;
  }
  
  let seasonalSeries = visibleSeries.filter(name => name.startsWith("TMIN") || name.startsWith("TMAX"));
  if (seasonalSeries.length > 0) {
    let seasonalData = {};
    dataset.seasonalTmin.forEach(d => {
      let key = d.year;
      if (!seasonalData[key]) seasonalData[key] = { year: d.year };
      let seriesName = `TMIN ${d.season}`;
      if (seasonalSeries.includes(seriesName)) {
        seasonalData[key][seriesName] = d.value;
      }
    });

    dataset.seasonalTmax.forEach(d => {
      let key = d.year;
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
        seasonalTableHTML += `<td>${row[series] !== undefined ? row[series].toFixed(1) : ""}</td>`;
      });
      seasonalTableHTML += "</tr>";
    });
    seasonalTableHTML += "</tbody></table>";
    seasonalTableContainer.innerHTML = seasonalTableHTML;
  }
}

async function confirmSelection() {
  showLoading();
  saveSearchCriteria();
  try {
    await fetchStationData();
  } catch (error) {
    console.error(error);
  } finally {
    hideLoading();
  }
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

document.getElementById("station-count-input").addEventListener("input", () => {
  if (document.getElementById("station-count-input").value > 10) {
    stationCount = 10;
    document.getElementById("station-count-input").value = "10";
    alert("Es können maximal 10 Stationen angezeigt werden. Der Wert wurde auf 10 gesetzt.");
  }
});

document.getElementById("radius-input").addEventListener("input", () => {
  if (document.getElementById("radius-input").value > 100) {
    radiusKm = 100;
    document.getElementById("radius-input").value = "100";
    alert("Der Radius darf maximal 100 km betragen. Der Wert wurde auf 100 km gesetzt.");
  }
});

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

function showLoading() {
  document.getElementById('loading-overlay').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loading-overlay').style.display = 'none';
}

document.addEventListener("DOMContentLoaded", () => {
  // Ensure the loading overlay is visible at the beginning
  showLoading();
  // Start polling the preload status
  checkPreloadStatus();
});

function checkPreloadStatus() {
  fetch('/preload_status')
    .then(response => response.json())
    .then(data => {
        if (data.status === "done") {
            hideLoading();
        } else {
            // If still loading, check again after 1 second
            setTimeout(checkPreloadStatus, 1000);
        }
    })
    .catch(error => {
        console.error("Error checking preload status:", error);
        setTimeout(checkPreloadStatus, 1000);
    });
}