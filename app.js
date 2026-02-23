const DATA_PATH = "data/ds-059341__custom_20028720_linear.csv";
const MAP_PATH = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const state = {
  reporter: "",
  flow: "",
  year: "",
  month: "",
  product: "",
  productQuery: "",
  selectedCountry: "",
};

const MAP_ZOOM = 1.4;
const MAP_CENTER_OFFSET = [-100, 460];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const EU_COUNTRIES = new Set([
  "Austria",
  "Belgium",
  "Bulgaria",
  "Croatia",
  "Cyprus",
  "Czechia",
  "Denmark",
  "Estonia",
  "Finland",
  "France",
  "Germany",
  "Greece",
  "Hungary",
  "Ireland",
  "Italy",
  "Latvia",
  "Lithuania",
  "Luxembourg",
  "Malta",
  "Netherlands",
  "Poland",
  "Portugal",
  "Romania",
  "Slovakia",
  "Slovenia",
  "Spain",
  "Sweden",
]);

const EUROPE_EXTRA = new Set([
  "Albania",
  "Andorra",
  "Armenia",
  "Azerbaijan",
  "Belarus",
  "Bosnia and Herzegovina",
  "Iceland",
  "Kosovo",
  "Moldova",
  "Montenegro",
  "North Macedonia",
  "Norway",
  "Serbia",
  "Switzerland",
  "Ukraine",
  "United Kingdom",
]);

const AMERICAS = new Set([
  "Argentina",
  "Bolivia",
  "Brazil",
  "Canada",
  "Chile",
  "Colombia",
  "Costa Rica",
  "Cuba",
  "Dominican Republic",
  "Ecuador",
  "El Salvador",
  "Guatemala",
  "Honduras",
  "Jamaica",
  "Mexico",
  "Nicaragua",
  "Panama",
  "Paraguay",
  "Peru",
  "United States of America",
  "Uruguay",
  "Venezuela",
]);

const ASIA = new Set([
  "Afghanistan",
  "Armenia",
  "Azerbaijan",
  "Bahrain",
  "Bangladesh",
  "Bhutan",
  "Brunei",
  "Cambodia",
  "China",
  "Georgia",
  "India",
  "Indonesia",
  "Iran",
  "Iraq",
  "Israel",
  "Japan",
  "Jordan",
  "Kazakhstan",
  "Kuwait",
  "Kyrgyzstan",
  "Laos",
  "Lebanon",
  "Malaysia",
  "Mongolia",
  "Myanmar",
  "Nepal",
  "North Korea",
  "Oman",
  "Pakistan",
  "Palestine",
  "Philippines",
  "Qatar",
  "Saudi Arabia",
  "Singapore",
  "South Korea",
  "Sri Lanka",
  "Syria",
  "Taiwan",
  "Thailand",
  "Turkey",
  "United Arab Emirates",
  "Uzbekistan",
  "Vietnam",
]);

const COUNTRY_ALIASES = new Map([
  ["Czech Republic", "Czechia"],
  ["Korea, Democratic People's Republic of", "North Korea"],
  ["Korea, Republic of", "South Korea"],
  ["Moldova, Republic of", "Moldova"],
  ["Turkiye", "Turkey"],
  ["United Kingdom", "United Kingdom"],
]);

const KNOWN_COUNTRIES = new Set([
  ...EU_COUNTRIES,
  ...EUROPE_EXTRA,
  ...AMERICAS,
  ...ASIA,
]);

const formatNumber = d3.format(",.0f");
const formatValue = d3.format(",.2f");
const parseMonth = d3.timeParse("%Y-%m");
const formatMonth = d3.timeFormat("%Y-%m");

const filtersEl = d3.select("#filters");
const productListEl = d3.select("#productList");
const productSearchEl = d3.select("#productSearch");
const productLabelEl = d3.select("#productLabel");
const mapLabelEl = d3.select("#mapLabel");
const countryLabelEl = d3.select("#countryLabel");
const tooltipEl = d3.select("#tooltip");
const btnProductsEl = d3.select("#btnProducts");
const productDropdownEl = d3.select("#productDropdown");

let reporterSelectRef = null;
let reporterSet = new Set();

// Toggle product dropdown
btnProductsEl.on("click", (event) => {
  event.stopPropagation();
  productDropdownEl.classed("open", !productDropdownEl.classed("open"));
});

// Close dropdown when clicking outside
d3.select("body").on("click", () => {
  productDropdownEl.classed("open", false);
});

productDropdownEl.on("click", (event) => {
  event.stopPropagation();
});

const charts = {
  euPie: d3.select("#euPie"),
  map: d3.select("#map"),
  countryPie: d3.select("#countryPie"),
  countryLine: d3.select("#countryLine"),
  countryLineLegend: d3.select("#countryLineLegend"),
  mapLegend: d3.select("#mapLegend"),
};

const stripDiacritics = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const normalizeCountry = (name) => {
  if (!name) return "";
  const trimmed = name.trim();
  const asciiName = stripDiacritics(trimmed);
  if (COUNTRY_ALIASES.has(trimmed)) return COUNTRY_ALIASES.get(trimmed);
  if (COUNTRY_ALIASES.has(asciiName)) return COUNTRY_ALIASES.get(asciiName);

  const parenIndex = trimmed.indexOf(" (");
  if (parenIndex > 0) {
    const base = trimmed.slice(0, parenIndex);
    const baseAscii = stripDiacritics(base);
    const resolvedBase = COUNTRY_ALIASES.get(base) || COUNTRY_ALIASES.get(baseAscii) || base;
    if (KNOWN_COUNTRIES.has(resolvedBase)) return resolvedBase;
  }

  return trimmed;
};

const regionForCountry = (name) => {
  const country = normalizeCountry(name);
  if (EU_COUNTRIES.has(country)) return "EU";
  if (AMERICAS.has(country)) return "America";
  if (ASIA.has(country)) return "Asia";
  return "Other";
};

const isEurope = (name) => {
  const country = normalizeCountry(name);
  return EU_COUNTRIES.has(country) || EUROPE_EXTRA.has(country);
};

// Remove all DOM-TOM from france Map Polygone
const pruneFranceOverseas = (feature) => {
  if (normalizeCountry(feature.properties.name) !== "France") return feature;

  const keepPolygon = (polygon) => {
    const centroid = d3.geoCentroid({
      type: "Feature",
      properties: feature.properties,
      geometry: { type: "Polygon", coordinates: polygon },
    });
    const [lon, lat] = centroid;
    return lat > 35 && lon > -10 && lon < 30;
  };

  if (feature.geometry.type === "Polygon") {
    return keepPolygon(feature.geometry.coordinates) ? feature : null;
  }

  if (feature.geometry.type === "MultiPolygon") {
    const kept = feature.geometry.coordinates.filter(keepPolygon);
    if (!kept.length) return feature;
    return {
      ...feature,
      geometry: { ...feature.geometry, coordinates: kept },
    };
  }

  return feature;
};

const productCategory = (name) => {
  const lower = name.toLowerCase();
  if (lower.includes("cheese")) return "Fromage";
  if (lower.includes("yogurt") || lower.includes("yoghurt") || lower.includes("curdled")) {
    return "Yaourt";
  }
  if (lower.includes("milk") || lower.includes("cream")) return "Lait";
  return "Other";
};

const shortenProductLabel = (label, maxLength = 38) => {
  if (!label) return "";
  if (label.length <= maxLength) return label;
  return `${label.slice(0, maxLength - 3).trim()}...`;
};

const parseRow = (d) => {
  const date = parseMonth(d.TIME_PERIOD);
  return {
    reporter: normalizeCountry(d.reporter),
    partner: normalizeCountry(d.partner),
    product: d.product,
    flow: d.flow,
    indicator: d.indicators,
    date,
    year: date ? String(date.getFullYear()) : "",
    month: date ? String(date.getMonth() + 1).padStart(2, "0") : "",
    value: d.OBS_VALUE === "" ? 0 : +d.OBS_VALUE,
  };
};

const createSelect = (label, options, onChange) => {
  const wrapper = filtersEl.append("label").text(label);
  const select = wrapper.append("select");
  select
    .selectAll("option")
    .data(options)
    .enter()
    .append("option")
    .attr("value", (d) => d.value)
    .text((d) => d.label);
  select.on("change", (event) => onChange(event.target.value));
  return select;
};

const updateSelectValue = (select, value) => {
  select.property("value", value);
};

const buildFilters = (data) => {
  const reporters = Array.from(new Set(data.map((d) => d.reporter))).sort(d3.ascending);
  const flows = Array.from(new Set(data.map((d) => d.flow))).sort(d3.ascending);
  const years = Array.from(new Set(data.map((d) => d.year))).sort(d3.ascending);
  const months = Array.from(new Set(data.map((d) => d.month))).sort(d3.ascending);

  reporterSet = new Set(reporters);

  state.reporter = state.reporter || reporters[0] || "";
  state.flow = state.flow || "ALL";
  state.year = state.year || years[years.length - 1] || "";
  state.month = state.month || "";

  filtersEl.html("");
  const reporterSelect = createSelect(
    "Reporter",
    reporters.map((d) => ({ label: d, value: d })),
    (value) => {
      state.reporter = value;
      render(data);
    }
  );
  reporterSelectRef = reporterSelect;

  const flowOptions = [{ label: "Import & Export", value: "ALL" }].concat(
    flows.map((d) => ({ label: d, value: d }))
  );
  const flowSelect = createSelect("Flow", flowOptions, (value) => {
    state.flow = value;
    render(data);
  });

  const yearSelect = createSelect(
    "Year",
    years.map((d) => ({ label: d, value: d })),
    (value) => {
      state.year = value;
      render(data);
    }
  );

  const monthOptions = [{ label: "All", value: "" }].concat(
    months.map((d) => ({ label: MONTHS[Number(d) - 1], value: d }))
  );
  const monthSelect = createSelect("Month", monthOptions, (value) => {
    state.month = value;
    render(data);
  });

  updateSelectValue(reporterSelect, state.reporter);
  updateSelectValue(flowSelect, state.flow);
  updateSelectValue(yearSelect, state.year);
  updateSelectValue(monthSelect, state.month);
};

const buildProductList = (products, data) => {
  const filtered = state.productQuery
    ? products.filter((p) => p.toLowerCase().includes(state.productQuery))
    : products;

  const items = productListEl.selectAll("button").data(filtered, (d) => d);
  items.exit().remove();

  const enter = items.enter().append("button").attr("class", "product-item");
  enter.merge(items)
    .classed("active", (d) => d === state.product)
    .text((d) => d)
    .on("click", (event, d) => {
      state.product = d;
      productDropdownEl.classed("open", false);
      render(data);
      buildProductList(products, data);
    });
};

const baseFilter = (data) => {
  return data.filter((d) => {
    if (state.reporter && d.reporter !== state.reporter) return false;
    if (state.flow && state.flow !== "ALL" && d.flow !== state.flow) return false;
    return true;
  });
};

const filterByDate = (data) => {
  return data.filter((d) => {
    if (state.year && d.year !== state.year) return false;
    if (state.month && d.month !== state.month) return false;
    return true;
  });
};

const drawPie = (container, data, colors, onSliceClick) => {
  const width = container.node().clientWidth;
  const height = container.node().clientHeight;
  const radius = Math.min(width, height) / 2 - 10;

  container.selectAll("*").remove();
  const svg = container.append("svg").attr("width", width).attr("height", height);
  const group = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);

  if (!data.length) {
    group.append("text").attr("text-anchor", "middle").attr("fill", "#6b5f57").text("No data");
    return;
  }

  const color = d3.scaleOrdinal().domain(data.map((d) => d.label)).range(colors);
  const pie = d3.pie().value((d) => d.value);
  const arc = d3.arc().innerRadius(radius * 0.3).outerRadius(radius);

  const arcs = group
    .selectAll("path")
    .data(pie(data))
    .enter()
    .append("path")
    .attr("d", arc)
    .attr("fill", (d) => color(d.data.label))
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.2)
    .style("cursor", onSliceClick ? "pointer" : "default");

  if (onSliceClick) {
    arcs.on("click", (event, d) => onSliceClick(d.data.label));
  }

  group
    .selectAll("text")
    .data(pie(data))
    .enter()
    .append("text")
    .attr("transform", (d) => `translate(${arc.centroid(d)})`)
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .attr("font-size", 11)
    .attr("fill", "#1f1a16")
    .text((d) => (d.data.value ? d.data.label : ""));
};

const drawLine = (container, series, colors) => {
  const width = container.node().clientWidth;
  const height = container.node().clientHeight;
  const margin = { top: 12, right: 18, bottom: 28, left: 48 };

  container.selectAll("*").remove();
  const svg = container.append("svg").attr("width", width).attr("height", height);
  const plot = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const allPoints = series.flatMap((s) => s.values);
  if (!allPoints.length) {
    plot.append("text").attr("x", innerWidth / 2).attr("y", innerHeight / 2).attr("text-anchor", "middle").attr("fill", "#6b5f57").text("No data");
    return;
  }

  const x = d3.scaleTime().domain(d3.extent(allPoints, (d) => d.date)).range([0, innerWidth]);
  const y = d3.scaleLinear().domain([0, d3.max(allPoints, (d) => d.value) || 0]).nice().range([innerHeight, 0]);

  plot.append("g").attr("transform", `translate(0,${innerHeight})`).call(d3.axisBottom(x).ticks(6));
  plot.append("g").call(d3.axisLeft(y).ticks(5));

  const color = d3.scaleOrdinal().domain(series.map((d) => d.name)).range(colors);
  const line = d3.line().x((d) => x(d.date)).y((d) => y(d.value));

  plot
    .selectAll("path.line")
    .data(series)
    .enter()
    .append("path")
    .attr("class", "line")
    .attr("fill", "none")
    .attr("stroke", (d) => color(d.name))
    .attr("stroke-width", 2)
    .attr("d", (d) => line(d.values));
};

const drawLineLegend = (container, series, colors) => {
  container.selectAll("*").remove();
  if (!series.length) return;
  const color = d3.scaleOrdinal().domain(series.map((d) => d.name)).range(colors);
  const items = container.selectAll("span").data(series).enter().append("span");
  items.append("i").style("background", (d) => color(d.name));
  items.append("strong").text((d) => d.name);
};

const drawMap = (container, features, values, flows, reporter, flow, importValues, exportValues) => {
  const width = container.node().clientWidth;
  const height = container.node().clientHeight;
  container.selectAll("*").remove();

  const svg = container.append("svg").attr("width", width).attr("height", height);
  const europe = { type: "FeatureCollection", features };
  const projection = d3.geoMercator().fitSize([width, height], europe);
  projection
    .scale(projection.scale() * MAP_ZOOM)
    .translate([width / 2 + MAP_CENTER_OFFSET[0], height / 2 + MAP_CENTER_OFFSET[1]]);
  const path = d3.geoPath(projection);

  const maxImport = d3.max(Object.values(importValues)) || 0;
  const maxExport = d3.max(Object.values(exportValues)) || 0;
  const maxBoth = d3.max(
    Object.keys(importValues).map((key) => {
      const importValue = importValues[key] || 0;
      const exportValue = exportValues[key] || 0;
      return importValue > 0 && exportValue > 0 ? importValue + exportValue : 0;
    })
  ) || 0;

  const importColor = d3.scaleSequential().domain([0, maxImport || 1]).interpolator(d3.interpolateYlGn);
  const exportColor = d3.scaleSequential().domain([0, maxExport || 1]).interpolator(d3.interpolateYlOrRd);
  const bothColor = d3.scaleSequential().domain([0, maxBoth || 1]).interpolator(d3.interpolatePurples);

  const centroids = new Map(
    features.map((feature) => {
      const name = normalizeCountry(feature.properties.name);
      return [name, path.centroid(feature)];
    })
  );

  const clipId = "map-clip";
  const arrowId = "flow-arrow";
  const defs = svg.append("defs");
  defs
    .append("clipPath")
    .attr("id", clipId)
    .append("rect")
    .attr("width", width)
    .attr("height", height);
  defs
    .append("marker")
    .attr("id", arrowId)
    .attr("viewBox", "0 0 10 10")
    .attr("refX", 8)
    .attr("refY", 5)
    .attr("markerWidth", 4)
    .attr("markerHeight", 4)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M 0 2 L 8 5 L 0 8 z")
    .attr("fill", "#1f1a16");

  const mapLayer = svg.append("g").attr("clip-path", `url(#${clipId})`);

  mapLayer
    .selectAll("path")
    .data(features)
    .enter()
    .append("path")
    .attr("class", "country")
    .classed("selected", (d) => normalizeCountry(d.properties.name) === state.selectedCountry)
    .attr("d", path)
    .attr("fill", (d) => {
      const name = normalizeCountry(d.properties.name);
      if (state.selectedCountry && name === state.selectedCountry) return "#cfe3ff";

      const importValue = importValues[name] || 0;
      const exportValue = exportValues[name] || 0;

      if (flow === "IMPORT") return importValue > 0 ? importColor(importValue) : "#d8d3cb";
      if (flow === "EXPORT") return exportValue > 0 ? exportColor(exportValue) : "#d8d3cb";
      if (importValue > 0 && exportValue > 0) return "#f6e7a5";
      if (importValue > 0) return importColor(importValue);
      if (exportValue > 0) return exportColor(exportValue);
      return "#d8d3cb";
    })
    .style("cursor", "pointer")
    .on("mousemove", (event, d) => {
      const name = normalizeCountry(d.properties.name);
      const value = values[name] || 0;
      tooltipEl
        .style("opacity", 1)
        .style("left", `${event.clientX + 12}px`)
        .style("top", `${event.clientY + 12}px`)
        .text(`${name}: ${formatValue(value)}`);
    })
    .on("mouseleave", () => tooltipEl.style("opacity", 0))
    .on("click", (event, d) => {
      const clickedCountry = normalizeCountry(d.properties.name);
      state.selectedCountry = clickedCountry;
      if (reporterSet.has(clickedCountry)) {
        state.reporter = clickedCountry;
        if (reporterSelectRef) {
          updateSelectValue(reporterSelectRef, state.reporter);
        }
      }
      render();
    });

  const showArrows = flow === "ALL";
  if (showArrows) {
    const reporterPoint = reporter ? centroids.get(normalizeCountry(reporter)) : null;
    const flowMax = d3.max(flows, (d) => d.value) || 0;
    const strokeScale = d3.scaleSqrt().domain([0, flowMax || 1]).range([0.8, 4.6]);

    const flowLines = flows
      .map((flowLine) => {
        const source = centroids.get(flowLine.source);
        const target = centroids.get(flowLine.target);
        if (!source || !target || !reporterPoint) return null;
        return { ...flowLine, sourcePoint: source, targetPoint: target };
      })
      .filter(Boolean);

    mapLayer
      .append("g")
      .attr("class", "flow-lines")
      .selectAll("path")
      .data(flowLines)
      .enter()
      .append("path")
      .attr("d", (d) => {
        const [x1, y1] = d.sourcePoint;
        const [x2, y2] = d.targetPoint;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.hypot(dx, dy) || 1;
        const offset = d.flow === "IMPORT" ? -8 : 8;
        const nx = (-dy / length) * offset;
        const ny = (dx / length) * offset;
        const mx = (x1 + x2) / 2 + nx;
        const my = (y1 + y2) / 2 + ny;
        return `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
      })
      .attr("fill", "none")
      .attr("stroke", "#1f1a16")
      .attr("stroke-opacity", 0.4)
      .attr("stroke-width", (d) => Math.max(0.8, strokeScale(d.value) * 0.75))
      .attr("marker-end", `url(#${arrowId})`)
      .style("pointer-events", "stroke")
      .on("mousemove", (event, d) => {
        const direction = d.flow === "IMPORT" ? `Import from ${d.partner}` : `Export to ${d.partner}`;
        tooltipEl
          .style("opacity", 1)
          .style("left", `${event.clientX + 12}px`)
          .style("top", `${event.clientY + 12}px`)
          .text(`${direction}: ${formatValue(d.value)}`);
      })
      .on("mouseleave", () => tooltipEl.style("opacity", 0));
  }

  charts.mapLegend.html("");
  if (flow === "IMPORT" || flow === "EXPORT") {
    const isImport = flow === "IMPORT";
    const scale = isImport ? importColor : exportColor;
    const legendTitle = isImport ? "Import intensity" : "Export intensity";
    const maxValue = isImport ? maxImport : maxExport;

    const block = charts.mapLegend.append("div").attr("class", "legend-block");
    block.append("span").attr("class", "legend-title").text(legendTitle);
    block
      .append("span")
      .attr("class", "legend-bar")
      .style("background", `linear-gradient(90deg, ${scale(0)}, ${scale(maxValue * 0.5)}, ${scale(maxValue || 1)})`);
  } else {
    const importBlock = charts.mapLegend.append("div").attr("class", "legend-block");
    importBlock.append("span").attr("class", "legend-title").text("Import intensity");
    importBlock
      .append("span")
      .attr("class", "legend-bar")
      .style("background", `linear-gradient(90deg, ${importColor(0)}, ${importColor(maxImport * 0.5)}, ${importColor(maxImport || 1)})`);

    const exportBlock = charts.mapLegend.append("div").attr("class", "legend-block");
    exportBlock.append("span").attr("class", "legend-title").text("Export intensity");
    exportBlock
      .append("span")
      .attr("class", "legend-bar")
      .style("background", `linear-gradient(90deg, ${exportColor(0)}, ${exportColor(maxExport * 0.5)}, ${exportColor(maxExport || 1)})`);

    charts.mapLegend
      .append("span")
      .attr("class", "legend-swatch")
      .text("Import & Export");

  }
};

const renderProductView = (data) => {
  const productData = data.filter((d) => d.product === state.product);
  const yearData = productData.filter((d) => d.year === state.year);

  const euTotals = d3.rollups(
    yearData.filter((d) => regionForCountry(d.partner) === "EU"),
    (v) => d3.sum(v, (d) => d.value),
    (d) => d.partner
  )
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => d3.descending(a.value, b.value))
    .slice(0, 8);

  drawPie(charts.euPie, euTotals, ["#3f6b3f", "#8bbd8b", "#d0e4d0", "#f1e7db"]);
};

const renderMapView = (filteredData, fullData, europeFeatures) => {
  const filtered = filterByDate(filteredData).filter((d) => d.product === state.product);
  const totals = d3.rollups(
    filtered,
    (v) => d3.sum(v, (d) => d.value),
    (d) => d.partner
  );
  const values = Object.fromEntries(totals);

  const flowBase = fullData.filter((d) => (state.reporter ? d.reporter === state.reporter : true));
  const flowFiltered = filterByDate(flowBase).filter((d) => d.product === state.product);
  const flowTotals = d3.rollups(
    flowFiltered,
    (v) => d3.sum(v, (d) => d.value),
    (d) => d.flow,
    (d) => d.partner
  );

  const importValues = {};
  const exportValues = {};

  const flows = [];
  flowTotals.forEach(([flow, partners]) => {
    partners.forEach(([partner, value]) => {
      const normalizedPartner = normalizeCountry(partner);
      if (!isEurope(normalizedPartner)) return;
      if (flow === "IMPORT") importValues[normalizedPartner] = value;
      if (flow === "EXPORT") exportValues[normalizedPartner] = value;
      const source = flow === "EXPORT" ? state.reporter : normalizedPartner;
      const target = flow === "EXPORT" ? normalizedPartner : state.reporter;
      if (!source || !target) return;
      flows.push({
        flow,
        partner: normalizedPartner,
        source: normalizeCountry(source),
        target: normalizeCountry(target),
        value,
      });
    });
  });

  drawMap(charts.map, europeFeatures, values, flows, state.reporter, state.flow, importValues, exportValues);
};

const renderCountryDetail = (data) => {
  const hasSelectedData = state.selectedCountry
    ? data.some((d) => d.partner === state.selectedCountry)
    : false;

  if (!hasSelectedData) {
    const yearData = data.filter((d) => d.year === state.year);
    const topPartner = d3
      .rollups(
        yearData,
        (v) => d3.sum(v, (d) => d.value),
        (d) => d.partner
      )
      .sort((a, b) => d3.descending(a[1], b[1]))[0];
    state.selectedCountry = topPartner ? topPartner[0] : "";
  }

  if (!state.selectedCountry) {
    charts.countryLine.selectAll("*").remove();
    charts.countryLineLegend.selectAll("*").remove();
    return;
  }

  const countryData = data.filter((d) => d.partner === state.selectedCountry);
  if (charts.countryPie.node()) {
    const yearData = countryData.filter((d) => d.year === state.year);

    const productTotals = d3.rollups(
      yearData,
      (v) => d3.sum(v, (d) => d.value),
      (d) => d.product
    )
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => d3.descending(a.value, b.value));

    const shortTotals = d3
      .rollups(
        productTotals,
        (v) => d3.sum(v, (d) => d.value),
        (d) => shortenProductLabel(d.label)
      )
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => d3.descending(a.value, b.value));

    const topProducts = shortTotals.slice(0, 6);
    const otherValue = d3.sum(shortTotals.slice(6), (d) => d.value);
    if (otherValue) topProducts.push({ label: "Other", value: otherValue });

    drawPie(charts.countryPie, topProducts, ["#0f4c5c", "#e36414", "#3f6b3f", "#b9a89a", "#7e6f65", "#c7b7a3"]);
  }

  const totalByDate = d3.rollups(
    data,
    (v) => d3.sum(v, (d) => d.value),
    (d) => formatMonth(d.date)
  );
  const totalMap = new Map(totalByDate);

  const countryByDate = d3.rollups(
    countryData,
    (v) => {
      const total = d3.sum(v, (d) => d.value);
      const lait = d3.sum(v.filter((d) => productCategory(d.product) === "Lait"), (d) => d.value);
      const fromage = d3.sum(v.filter((d) => productCategory(d.product) === "Fromage"), (d) => d.value);
      const yaourt = d3.sum(v.filter((d) => productCategory(d.product) === "Yaourt"), (d) => d.value);
      return { total, lait, fromage, yaourt };
    },
    (d) => formatMonth(d.date)
  )
    .map(([dateKey, values]) => {
      const all = totalMap.get(dateKey) || 0;
      return {
        date: parseMonth(dateKey),
        total: all ? (values.total / all) * 100 : 0,
        lait: all ? (values.lait / all) * 100 : 0,
        fromage: all ? (values.fromage / all) * 100 : 0,
        yaourt: all ? (values.yaourt / all) * 100 : 0,
      };
    })
    .filter((d) => d.date)
    .sort((a, b) => d3.ascending(a.date, b.date));

  const series = [
    { name: "Total", values: countryByDate.map((d) => ({ date: d.date, value: d.total })) },
    { name: "Lait", values: countryByDate.map((d) => ({ date: d.date, value: d.lait })) },
    { name: "Fromage", values: countryByDate.map((d) => ({ date: d.date, value: d.fromage })) },
    { name: "Yaourt", values: countryByDate.map((d) => ({ date: d.date, value: d.yaourt })) },
  ];

  drawLine(charts.countryLine, series, ["#1f1a16", "#0f4c5c", "#e36414", "#3f6b3f"]);
  drawLineLegend(charts.countryLineLegend, series, ["#1f1a16", "#0f4c5c", "#e36414", "#3f6b3f"]);
};

let cachedData = [];
let cachedEurope = [];

const render = (data = cachedData) => {
  const base = baseFilter(data);
  productLabelEl.text(state.product || "No product");
  mapLabelEl.text(`${state.year || ""} ${state.month ? MONTHS[Number(state.month) - 1] : "All"}`);
  countryLabelEl.text(state.selectedCountry || "Select a country");

  renderProductView(base);
  renderMapView(base, data, cachedEurope);
  renderCountryDetail(base);
};

const onResize = () => {
  window.addEventListener("resize", () => render());
};

const init = (data, europeFeatures) => {
  cachedData = data;
  cachedEurope = europeFeatures;

  const products = Array.from(new Set(data.map((d) => d.product))).sort(d3.ascending);
  state.product = state.product || products[0] || "";

  buildFilters(data);
  buildProductList(products, data);
  productSearchEl.on("input", (event) => {
    state.productQuery = event.target.value.trim().toLowerCase();
    buildProductList(products, data);
  });

  render();
  onResize();
};

Promise.all([d3.csv(DATA_PATH, parseRow), d3.json(MAP_PATH)]).then(([data, world]) => {
  const allCountries = topojson.feature(world, world.objects.countries).features;
  const europe = allCountries
    .filter((d) => isEurope(d.properties.name))
    .map((feature) => pruneFranceOverseas(feature))
    .filter(Boolean);
  init(data, europe);
});
