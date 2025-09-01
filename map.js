let routeLayers = []; // Store main + alternative routes

let map, userMarker, sourceMarker, destMarker, routeLine;

// Emission values in grams per km
const emissionRates = {
  petrol: 192,
  diesel: 171,
  electric: 20,
  bike: 103,
  bus: 105,
  truck: 400,
  electric_truck: 100,
  walking: 0,
  cycling: 0
};

// Speed assumptions in km/h
const averageSpeeds = {
  petrol: 60,
  diesel: 60,
  electric: 60,
  bike: 40,
  bus: 45,
  truck: 50,
  electric_truck: 50,
  walking: 5,
  cycling: 15
};

// Fetch with timeout helper to avoid long hangs
async function fetchWithTimeout(resource, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(resource, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

// Tourist categories configuration
const TOURIST_CATEGORIES = {
  parks: { key: 'parks', label: 'Parks', emoji: '🌳', color: '#4CAF50' },
  gardens: { key: 'gardens', label: 'Gardens', emoji: '🌺', color: '#8BC34A' },
  beaches: { key: 'beaches', label: 'Beaches', emoji: '🏖️', color: '#FFB74D' },
  rivers: { key: 'rivers', label: 'Rivers', emoji: '🌊', color: '#2196F3' },
  lakes: { key: 'lakes', label: 'Lakes', emoji: '🏞️', color: '#03DAC6' },
  forests: { key: 'forests', label: 'Forests', emoji: '🌲', color: '#2E7D32' },
  monuments: { key: 'monuments', label: 'Monuments', emoji: '🏛️', color: '#FF9800' },
  temples: { key: 'temples', label: 'Temples', emoji: '🕌', color: '#9C27B0' },
  museums: { key: 'museums', label: 'Museums', emoji: '🏛️', color: '#FF5722' },
  palaces: { key: 'palaces', label: 'Palaces', emoji: '🏰', color: '#E91E63' },
  forts: { key: 'forts', label: 'Forts', emoji: '🏯', color: '#795548' },
  ev: { key: 'ev', label: 'EV Charging', emoji: '⚡', color: '#9C27B0' },
  fuel: { key: 'fuel', label: 'Petrol Pumps', emoji: '⛽', color: '#F44336' },
  hospitals: { key: 'hospitals', label: 'Hospitals', emoji: '🏥', color: '#F44336' },
  atms: { key: 'atms', label: 'ATMs', emoji: '💳', color: '#9E9E9E' },
  toilets: { key: 'toilets', label: 'Toilets', emoji: '🚻', color: '#9E9E9E' },
  restaurants: { key: 'restaurants', label: 'Restaurants', emoji: '🍽️', color: '#F44336' },
  cafes: { key: 'cafes', label: 'Cafes', emoji: '☕', color: '#8D6E63' },
  hotels: { key: 'hotels', label: 'Hotels', emoji: '🏨', color: '#795548' },
  cinemas: { key: 'cinemas', label: 'Cinemas', emoji: '🎬', color: '#E91E63' },
  malls: { key: 'malls', label: 'Shopping Malls', emoji: '🛍️', color: '#E91E63' },
  markets: { key: 'markets', label: 'Markets', emoji: '🏪', color: '#FF9800' }
};

// ==== TomTom Integration Config (added) ====
const TOMTOM_CONFIG = {
  PRIMARY_KEY: '87ed92c52fd2fea74165fc67a34bf35582656cbd712ee5591ed20e88489ca394',
  SECONDARY_KEY: 'AZKtYdDL9LY5v4vy367AIZI0rzSiuN3Z',
  COUNTRY_SET: 'IN',
  BASE_URL: 'https://api.tomtom.com/search/2'
};

// Map TomTom categories/queries to our TOURIST_CATEGORIES keys
const TOMTOM_CATEGORY_MAP = {
  restaurants: 'restaurant',
  hotels: 'hotel',
  monuments: 'tourist_attraction',
  ev: 'ev station',
  hospitals: 'hospital',
  atms: 'atm',
  toilets: 'toilet',
  cafes: 'cafe',
  cinemas: 'cinema',
  malls: 'shopping mall',
  markets: 'market',
  fuel: 'fuel station',
  parks: 'park',
  gardens: 'garden',
  beaches: 'beach',
  rivers: 'river',
  lakes: 'lake',
  forests: 'forest',
  museums: 'museum',
  palaces: 'palace',
  forts: 'castle'
};

// Last data-source state for UI indication (no signature changes downstream)
let lastTouristDataEnhanced = false;
let lastGeocodeProvider = 'osm';
let WEATHER_PROVIDER = 'unknown';
let TRAFFIC_KEY = null;
let WEATHER_KEY = null;
let apiRoleDetectionRan = false;
let trafficTileLayers = [];
let lastTrafficWeatherHtml = '';
const imageCache = new Map();
const markerByPlaceId = new Map();

// Global popup management
let currentOpenPopup = null;
let hoverTimeout = null;
let lastHoveredMarker = null;

// Function to close all open popups
function closeAllPopups() {
  if (currentOpenPopup) {
    try {
      currentOpenPopup.closePopup();
    } catch (_) {}
    currentOpenPopup = null;
  }
}

// Function to close popup after delay (for hover interactions)
function closePopupAfterDelay(popup, delay = 1500) {
  if (hoverTimeout) {
    clearTimeout(hoverTimeout);
  }
  hoverTimeout = setTimeout(() => {
    if (popup && popup.isOpen() && popup !== currentOpenPopup) {
      popup.closePopup();
    }
  }, delay);
}

// Function to handle popup open event
function onPopupOpen(popup) {
  closeAllPopups();
  currentOpenPopup = popup;
}

// Function to handle popup close event
function onPopupClose() {
  if (currentOpenPopup) {
    currentOpenPopup = null;
  }
}

// Function to create enhanced popup with hover support
function createEnhancedPopup(marker, content, categoryKey) {
  const popup = L.popup({
    className: 'enhanced-popup',
    maxWidth: 300,
    closeButton: true,
    autoClose: false,
    closeOnClick: false
  }).setContent(content);
  
  // Bind popup to marker
  marker.bindPopup(popup);
  
  // Handle popup events
  marker.on('popupopen', () => onPopupOpen(popup));
  marker.on('popupclose', () => onPopupClose(popup));
  
  // Add hover interactions
  marker.on('mouseover', () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
    }
    if (!popup.isOpen()) {
      popup.openPopup();
    }
  });
  
  marker.on('mouseout', () => {
    closePopupAfterDelay(popup, 800);
  });
  
  // Click to keep popup open
  marker.on('click', () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
    }
    if (!popup.isOpen()) {
      popup.openPopup();
    }
  });
  
  return popup;
}

// Helper: build a category-specific Leaflet DivIcon
function buildTouristDivIcon(categoryKey) {
  const cat = TOURIST_CATEGORIES[categoryKey] || { emoji: '📍', color: '#2e7d32' };
  return L.divIcon({
    className: 'tourist-marker',
    html: `<div class="tourist-marker-circle" style="border-color:${cat.color}; background:${cat.color}22;">
      <span class="tourist-marker-emoji">${cat.emoji}</span>
    </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

// ==== TomTom Helpers (added) ====
function getTomTomKeyPair() {
  return [TOMTOM_CONFIG.PRIMARY_KEY, TOMTOM_CONFIG.SECONDARY_KEY].filter(Boolean);
}

async function tomtomGeocode(query, key) {
  const center = map && typeof map.getCenter === 'function' ? map.getCenter() : null;
  const bias = center ? `&lat=${center.lat}&lon=${center.lng}` : '';
  const url = `${TOMTOM_CONFIG.BASE_URL}/search/${encodeURIComponent(query)}.json?key=${encodeURIComponent(key)}&countrySet=${encodeURIComponent(TOMTOM_CONFIG.COUNTRY_SET)}&limit=1${bias}`;
  const res = await fetchWithTimeout(url, {}, 12000);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !Array.isArray(data.results) || data.results.length === 0) return null;
  const pos = data.results[0] && data.results[0].position;
  if (!pos || !isFinite(pos.lat) || !isFinite(pos.lon)) return null;
  return [pos.lat, pos.lon];
}

// Try TomTom first, fall back to existing geocode()
async function enhancedGeocode(location) {
  const trimmed = (location || '').trim();
  if (!trimmed) return null;
  try {
    const [primary, secondary] = getTomTomKeyPair();
    if (primary) {
      try {
        const c1 = await tomtomGeocode(trimmed, primary);
        if (c1) { lastGeocodeProvider = 'tomtom'; return c1; }
      } catch (e) { console.warn('TomTom geocode primary failed', e); }
    }
    if (secondary) {
      try {
        const c2 = await tomtomGeocode(trimmed, secondary);
        if (c2) { lastGeocodeProvider = 'tomtom'; return c2; }
      } catch (e) { console.warn('TomTom geocode secondary failed', e); }
    }
  } catch (_) {}
  // Fallback to existing pipeline
  const fallback = await geocode(location);
  if (fallback) { lastGeocodeProvider = 'osm'; }
  return fallback;
}

// Sample a few points along route to limit TomTom requests
function sampleRoutePoints(routeGeometry, maxSamples = 6) {
  const coords = (routeGeometry && routeGeometry.coordinates) || [];
  if (coords.length === 0) return [];
  const step = Math.max(1, Math.floor(coords.length / maxSamples));
  const out = [];
  for (let i = 0; i < coords.length && out.length < maxSamples; i += step) {
    const [lon, lat] = coords[i];
    out.push({ lat, lon });
  }
  // ensure last point included
  if (out.length && (out[out.length - 1].lat !== coords[coords.length - 1][1] || out[out.length - 1].lon !== coords[coords.length - 1][0])) {
    const [lon, lat] = coords[coords.length - 1];
    out.push({ lat, lon });
  }
  return out;
}

function normalizeTomTomResultToPlace(result, categoryKey) {
  const name = (result && result.poi && result.poi.name) || 'Unnamed';
  const pos = result && result.position ? result.position : null;
  const lat = pos ? pos.lat : null;
  const lon = pos ? pos.lon : null;
  const phone = (result && result.poi && result.poi.phone) || (result && result.poi && result.poi.phoneNumber);
  const url = (result && result.poi && result.poi.url) || (result && result.poi && result.poi.website);
  const address = (result && result.address && (result.address.freeformAddress || result.address.streetName)) || '';
  const id = (result && (result.id || (name + '_' + (lat || '') + '_' + (lon || '')))) || Math.random().toString(36).slice(2);
  return {
    id: `tomtom/${id}`,
    lat,
    lon,
    name,
    tags: {
      source: 'tomtom',
      phone: phone || undefined,
      website: url || undefined,
      addr_full: address || undefined,
      opening_hours: undefined
    },
    category: categoryKey
  };
}

async function fetchTomTomCategoryNear(lat, lon, categoryKey, key) {
  const categoryQuery = TOMTOM_CATEGORY_MAP[categoryKey];
  if (!categoryQuery) return [];
  const url = `${TOMTOM_CONFIG.BASE_URL}/categorySearch/${encodeURIComponent(categoryQuery)}.json?key=${encodeURIComponent(key)}&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&radius=1000&limit=10`;
  try {
    const res = await fetchWithTimeout(url, {}, 12000);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data || !Array.isArray(data.results)) return [];
    return data.results.map(r => normalizeTomTomResultToPlace(r, categoryKey)).filter(p => isFinite(p.lat) && isFinite(p.lon));
  } catch (e) {
    return [];
  }
}

async function fetchTomTomPOIs(routeGeometry, vehicleType, existingGrouped) {
  const points = sampleRoutePoints(routeGeometry, 4); // Reduce from 6 to 4
  if (!points.length) return { grouped: {}, flat: [], enhanced: false };
  const [primary, secondary] = getTomTomKeyPair();
  const keyToUse = primary || secondary;
  if (!keyToUse) return { grouped: {}, flat: [], enhanced: false };

  // Limit categories to avoid hitting daily limits; skip categories already saturated from OSM
  const categoryKeys = Object.keys(TOMTOM_CATEGORY_MAP).filter(key => {
    const arr = existingGrouped && existingGrouped[key];
    return !arr || arr.length < 5; // Reduce from 15 to 5
  });

  // If EV, ensure we include charging stations first
  const orderedCats = vehicleType === 'electric'
    ? ['ev', ...categoryKeys.filter(k => k !== 'ev')]
    : categoryKeys;

  const aggregate = [];
  let anySuccess = false;
  for (const p of points) {
    for (const cat of orderedCats) {
      // Reduce soft cap from 500 to 200 for faster processing
      if (aggregate.length > 200) break;
      try {
        const items = await fetchTomTomCategoryNear(p.lat, p.lon, cat, keyToUse);
        if (items && items.length) { anySuccess = true; aggregate.push(...items); }
      } catch (_) {}
    }
  }
  const deduped = dedupeByLocation(aggregate);

  // group by categoryKey in our structure and respect per-category cap
  const grouped = {};
  for (const key of Object.keys(TOURIST_CATEGORIES)) grouped[key] = [];
  for (const place of deduped) {
    const key = place.category;
    if (!grouped[key]) grouped[key] = [];
    if (grouped[key].length < 5) grouped[key].push(place); // Reduce from 15 to 5
  }
  const flat = Object.values(grouped).flat();
  return { grouped, flat, enhanced: anySuccess };
}

// ==== Traffic & Weather Autodetect and Fetch (added) ====
async function tryTomTomTrafficKey(key) {
  try {
    const testUrl = `https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json?point=12.9716,77.5946&key=${encodeURIComponent(key)}`;
    const res = await fetchWithTimeout(testUrl, {}, 8000);
    if (!res.ok) return false;
    const data = await res.json();
    return !!(data && data.flowSegmentData);
  } catch (_) { return false; }
}

async function tryOpenWeatherKey(key) {
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=12.9716&lon=77.5946&appid=${encodeURIComponent(key)}&units=metric`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return false;
    const data = await res.json();
    return !!(data && data.main && typeof data.main.temp === 'number');
  } catch (_) { return false; }
}

async function tryTomorrowKey(key) {
  try {
    const url = `https://api.tomorrow.io/v4/weather/realtime?location=12.9716,77.5946&units=metric&apikey=${encodeURIComponent(key)}`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return false;
    const data = await res.json();
    return !!(data && data.data && data.data.values && typeof data.data.values.temperature === 'number');
  } catch (_) { return false; }
}

async function tryWeatherbitKey(key) {
  try {
    const url = `https://api.weatherbit.io/v2.0/current?lat=12.9716&lon=77.5946&key=${encodeURIComponent(key)}`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return false;
    const data = await res.json();
    return !!(data && data.data && Array.isArray(data.data) && data.data.length > 0 && typeof data.data[0].temp === 'number');
  } catch (_) { return false; }
}

async function ensureApiKeyRoles() {
  if (apiRoleDetectionRan) return;
  apiRoleDetectionRan = true;
  const keys = getTomTomKeyPair();
  const k1 = keys[0] || null;
  const k2 = keys[1] || null;
  // Detect traffic key (TomTom)
  if (k1 && await tryTomTomTrafficKey(k1)) TRAFFIC_KEY = k1;
  else if (k2 && await tryTomTomTrafficKey(k2)) TRAFFIC_KEY = k2;
  else TRAFFIC_KEY = k1 || k2 || null;

  // Detect weather provider for the remaining key
  const candidates = [k1, k2].filter(k => k && k !== TRAFFIC_KEY);
  // Allow traffic key to double as weather key if needed
  if (TRAFFIC_KEY) candidates.push(TRAFFIC_KEY);
  for (const key of candidates) {
    if (await tryOpenWeatherKey(key)) { WEATHER_PROVIDER = 'openweather'; WEATHER_KEY = key; break; }
    if (await tryTomorrowKey(key)) { WEATHER_PROVIDER = 'tomorrow'; WEATHER_KEY = key; break; }
    if (await tryWeatherbitKey(key)) { WEATHER_PROVIDER = 'weatherbit'; WEATHER_KEY = key; break; }
  }
  if (!WEATHER_PROVIDER || WEATHER_PROVIDER === 'unknown') {
    WEATHER_PROVIDER = 'none'; WEATHER_KEY = null;
  }
}

async function fetchTrafficSummary(routeGeometry) {
  try {
    if (!TRAFFIC_KEY) return null;
    const points = sampleRoutePoints(routeGeometry, 3);
    if (!points.length) return null;
    let totalSpeed = 0, totalFree = 0, count = 0;
    for (const p of points) {
      const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json?point=${p.lat},${p.lon}&key=${encodeURIComponent(TRAFFIC_KEY)}`;
      const res = await fetchWithTimeout(url, {}, 8000);
      if (!res.ok) continue;
      const data = await res.json();
      const seg = data && data.flowSegmentData;
      if (seg && typeof seg.currentSpeed === 'number' && typeof seg.freeFlowSpeed === 'number') {
        totalSpeed += seg.currentSpeed;
        totalFree += seg.freeFlowSpeed;
        count++;
      }
    }
    if (!count) return null;
    const avgSpeed = totalSpeed / count;
    const avgFree = totalFree / count;
    const congestion = avgFree > 0 ? Math.max(0, Math.min(1, 1 - (avgSpeed / avgFree))) : 0;
    return { avgSpeed: Math.round(avgSpeed), avgFree: Math.round(avgFree), congestion }; // congestion 0..1
  } catch (_) { return null; }
}

async function fetchWeather(lat, lon) {
  if (!WEATHER_KEY || WEATHER_PROVIDER === 'none') return null;
  try {
    if (WEATHER_PROVIDER === 'openweather') {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${encodeURIComponent(WEATHER_KEY)}&units=metric`;
      const res = await fetchWithTimeout(url, {}, 8000);
      if (!res.ok) return null;
      const d = await res.json();
      const w = (d.weather && d.weather[0]) || {};
      return {
        tempC: d.main && d.main.temp,
        description: w.description || 'Weather',
        windKph: d.wind && typeof d.wind.speed === 'number' ? Math.round(d.wind.speed * 3.6) : undefined,
        precipMm: d.rain && (d.rain['1h'] || d.rain['3h'])
      };
    }
    if (WEATHER_PROVIDER === 'tomorrow') {
      const url = `https://api.tomorrow.io/v4/weather/realtime?location=${lat},${lon}&units=metric&apikey=${encodeURIComponent(WEATHER_KEY)}`;
      const res = await fetchWithTimeout(url, {}, 8000);
      if (!res.ok) return null;
      const d = await res.json();
      const v = d && d.data && d.data.values || {};
      return {
        tempC: v.temperature,
        description: typeof v.weatherCode === 'number' ? `Code ${v.weatherCode}` : 'Weather',
        windKph: typeof v.windSpeed === 'number' ? Math.round(v.windSpeed) : undefined,
        precipMm: typeof v.precipitationIntensity === 'number' ? v.precipitationIntensity : undefined
      };
    }
    if (WEATHER_PROVIDER === 'weatherbit') {
      const url = `https://api.weatherbit.io/v2.0/current?lat=${lat}&lon=${lon}&key=${encodeURIComponent(WEATHER_KEY)}`;
      const res = await fetchWithTimeout(url, {}, 8000);
      if (!res.ok) return null;
      const d = await res.json();
      const w = d && d.data && d.data[0] || {};
      return {
        tempC: w.temp,
        description: w.weather && w.weather.description,
        windKph: w.wind_spd ? Math.round(w.wind_spd * 3.6) : undefined,
        precipMm: w.precip
      };
    }
  } catch (_) { return null; }
  return null;
}

async function fetchWeatherAlongRoute(routeGeometry) {
  try {
    const pts = sampleRoutePoints(routeGeometry, 3);
    const out = [];
    for (const p of pts) {
      const w = await fetchWeather(p.lat, p.lon);
      if (w) out.push({ lat: p.lat, lon: p.lon, ...w });
    }
    return out;
  } catch (_) { return []; }
}

function addTrafficTileOverlays() {
  try {
    if (!TRAFFIC_KEY || !map) return;
    // Remove previous
    for (const l of trafficTileLayers) { try { map.removeLayer(l); } catch(_){} }
    trafficTileLayers = [];
    const flow = L.tileLayer(`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${encodeURIComponent(TRAFFIC_KEY)}`, { opacity: 0.65 });
    const incidents = L.tileLayer(`https://api.tomtom.com/traffic/map/4/tile/incidents/{z}/{x}/{y}.png?key=${encodeURIComponent(TRAFFIC_KEY)}`, { opacity: 0.8 });
    flow.addTo(map); incidents.addTo(map);
    trafficTileLayers.push(flow, incidents);
    // track to cleanup with route
    routeLayers.push(flow, incidents);
  } catch (_) {}
}

function buildTrafficWeatherSnippet(trafficSummary, weatherPoints) {
  let html = '';
  if (trafficSummary) {
    const t = getTrafficSeverity(trafficSummary.congestion);
    const dot = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${t.color};margin-right:6px;vertical-align:middle;"></span>`;
    html += `<div style="margin-top:6px;">${dot}<strong>Traffic:</strong> ${t.level} (avg ${trafficSummary.avgSpeed} km/h vs free ${trafficSummary.avgFree} km/h)</div>`;
  }
  if (weatherPoints && weatherPoints.length) {
    const w = weatherPoints[0];
    const parts = [];
    const ws = getWeatherSeverity(w);
    const dotW = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${ws.color};margin-right:6px;vertical-align:middle;"></span>`;
    if (typeof w.tempC === 'number') parts.push(`${Math.round(w.tempC)}°C`);
    if (w.description) parts.push(w.description);
    if (typeof w.windKph === 'number') parts.push(`wind ${w.windKph} km/h`);
    if (typeof w.precipMm === 'number') parts.push(`${w.precipMm} mm`);
    html += `<div style="margin-top:4px;">${dotW}<strong>Weather:</strong> ${ws.level}${parts.length ? ` — ${parts.join(', ')}` : ''}${WEATHER_PROVIDER && WEATHER_PROVIDER !== 'none' ? ` <small>(${WEATHER_PROVIDER})</small>` : ''}</div>`;
  }
  return html;
}

// Severity helpers for coloring
function getTrafficSeverity(congestion) {
  // congestion 0..1
  if (typeof congestion !== 'number') return { level: 'Unknown', color: '#9CA3AF' };
  if (congestion > 0.66) return { level: 'Heavy', color: '#dc2626' }; // red
  if (congestion > 0.33) return { level: 'Moderate', color: '#f59e0b' }; // yellow
  return { level: 'Light', color: '#16a34a' }; // green
}

function getWeatherSeverity(w) {
  const temp = typeof w.tempC === 'number' ? w.tempC : null;
  const wind = typeof w.windKph === 'number' ? w.windKph : 0;
  const precip = typeof w.precipMm === 'number' ? w.precipMm : 0;
  // Simple heuristic thresholds
  const extremeTemp = (temp !== null) && (temp >= 38 || temp <= 10);
  if (precip >= 5 || wind >= 40 || extremeTemp) return { level: 'Severe', color: '#dc2626' };
  if (precip >= 1 || wind >= 20 || (temp !== null && (temp >= 33 || temp <= 15))) return { level: 'Mild', color: '#f59e0b' };
  return { level: 'Good', color: '#16a34a' };
}

// ==== Wikipedia image helpers (no API key needed) ====
async function fetchWikipediaThumbByTitle(title) {
  try {
    if (!title || title.toLowerCase() === 'unnamed') return null;
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages&piprop=thumbnail&pithumbsize=300&titles=${encodeURIComponent(title)}`;
    const res = await fetchWithTimeout(url, {}, 9000);
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data && data.query && data.query.pages;
    if (!pages) return null;
    for (const k of Object.keys(pages)) {
      const p = pages[k];
      if (p && p.thumbnail && p.thumbnail.source) return p.thumbnail.source;
    }
    return null;
  } catch (_) { return null; }
}

async function fetchWikipediaThumbByGeo(lat, lon, radius = 600) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages|coordinates&piprop=thumbnail&pithumbsize=300&generator=geosearch&ggscoord=${lat}|${lon}&ggsradius=${radius}&ggslimit=8`;
    const res = await fetchWithTimeout(url, {}, 9000);
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data && data.query && data.query.pages;
    if (!pages) return null;
    const vals = Object.values(pages);
    const withThumb = vals.find(v => v && v.thumbnail && v.thumbnail.source);
    return withThumb ? withThumb.thumbnail.source : null;
  } catch (_) { return null; }
}

async function fetchPlaceImage(place) {
  try {
    const cacheKey = `${place.name || 'Unnamed'}_${place.lat?.toFixed(4)}_${place.lon?.toFixed(4)}`;
    if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);
    // 1) If OSM tags include direct image URL
    const t = place.tags || {};
    const direct = t.image || t['image:0'] || t['wikimedia_commons'];
    if (direct && typeof direct === 'string' && direct.startsWith('http')) {
      imageCache.set(cacheKey, direct);
      return direct;
    }
    // 2) Try Wikipedia by title
    let img = await fetchWikipediaThumbByTitle(place.name);
    if (!img) {
      // 3) Try geo-based search near the place
      img = await fetchWikipediaThumbByGeo(place.lat, place.lon, 700);
    }
    if (img) imageCache.set(cacheKey, img);
    return img || null;
  } catch (_) { return null; }
}

function buildPlacePopupHtml(cat, name, details, osmUrl, lat, lon, imgUrl) {
  return `
    <div class="tourist-popup">
      <div class="popup-head" style="border-bottom-color:${cat ? cat.color : '#2e7d32'};">
        <span class="emoji">${cat ? cat.emoji : '📍'}</span>
        <strong>${name}</strong>
      </div>
      <div class="popup-body">
        <div class="popup-cat" style="background:${cat ? cat.color : '#2e7d32'}22; color:${cat ? cat.color : '#2e7d32'}">${cat ? cat.label : 'Place'}</div>
        ${imgUrl ? `<div style="margin:6px 0 8px 0;"><img src="${imgUrl}" alt="${name}" style="width:100%;height:140px;object-fit:cover;border-radius:8px;" loading="lazy" /></div>` : ''}
        ${details.length ? `<div class="popup-details">${details.join('<br>')}</div>` : ''}
      </div>
      <div class="popup-actions">
        <button type="button" class="dir-btn" onclick="focusPlace(${lat}, ${lon})">Show Here</button>
        <a class="osm-link" href="${osmUrl}" target="_blank">OSM</a>
      </div>
    </div>
  `;
}

// Build colorized route segments based on TomTom flow along the route
function sampleRoutePointsWithIndex(routeGeometry, maxSamples = 24) {
  const coords = (routeGeometry && routeGeometry.coordinates) || [];
  if (coords.length === 0) return [];
  const step = Math.max(1, Math.floor(coords.length / maxSamples));
  const out = [];
  for (let i = 0; i < coords.length; i += step) {
    const [lon, lat] = coords[i];
    out.push({ lat, lon, index: i });
  }
  if (out[out.length - 1]?.index !== coords.length - 1) {
    const [lon, lat] = coords[coords.length - 1];
    out.push({ lat, lon, index: coords.length - 1 });
  }
  return out;
}

async function fetchTrafficSeverityForPoint(lat, lon) {
  if (!TRAFFIC_KEY) return null;
  try {
    const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json?point=${lat},${lon}&key=${encodeURIComponent(TRAFFIC_KEY)}`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return null;
    const data = await res.json();
    const seg = data && data.flowSegmentData;
    if (!seg || typeof seg.currentSpeed !== 'number' || typeof seg.freeFlowSpeed !== 'number') return null;
    const congestion = seg.freeFlowSpeed > 0 ? Math.max(0, Math.min(1, 1 - (seg.currentSpeed / seg.freeFlowSpeed))) : 0;
    return getTrafficSeverity(congestion);
  } catch (_) { return null; }
}

async function colorizeRouteByTraffic(routeGeometry, mainLayerToReplace) {
  try {
    if (!TRAFFIC_KEY || !map || !routeGeometry || !routeGeometry.coordinates || routeGeometry.coordinates.length < 2) return;

    // Remove the solid main route so segmented colors are visible
    try { if (mainLayerToReplace) { map.removeLayer(mainLayerToReplace); } } catch(_) {}

    const samples = sampleRoutePointsWithIndex(routeGeometry, 24);
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i];
      const b = samples[i + 1];
      const midLat = (a.lat + b.lat) / 2;
      const midLon = (a.lon + b.lon) / 2;
      let sev = await fetchTrafficSeverityForPoint(midLat, midLon);
      if (!sev) sev = { color: '#16a34a' }; // default green
      const segCoords = routeGeometry.coordinates.slice(a.index, b.index + 1).map(([lon, lat]) => [lat, lon]);
      if (segCoords.length < 2) continue;
      const segLayer = L.polyline(segCoords, { color: sev.color, weight: 6, opacity: 0.95 }).addTo(map);
      routeLayers.push(segLayer);
    }
  } catch (_) {}
}

// Helper: compute bbox with small buffer from route geometry
function computeBufferedBbox(routeGeometry, bufferDeg = 0.03) { // Reduce from 0.05 to 0.03
  const coords = routeGeometry.coordinates;
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  coords.forEach(([lon, lat]) => {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  });
  return {
    south: minLat - bufferDeg,
    west: minLon - bufferDeg,
    north: maxLat + bufferDeg,
    east: maxLon + bufferDeg
  };
}

// Helper: convert lat/lon to Web Mercator meters for distance calcs
function latLonToMeters(lat, lon) {
  const x = lon * 20037508.34 / 180.0;
  let y = Math.log(Math.tan((90 + lat) * Math.PI / 360.0)) / (Math.PI / 180.0);
  y = y * 20037508.34 / 180.0;
  return { x, y };
}

// Helper: distance from a point (lat,lon) to a polyline (list of [lon,lat]) in meters
function distancePointToPolylineMeters(pointLat, pointLon, lineCoordinates) {
  const p = latLonToMeters(pointLat, pointLon);
  let minDist = Infinity;
  for (let i = 1; i < lineCoordinates.length; i++) {
    const [lon1, lat1] = lineCoordinates[i - 1];
    const [lon2, lat2] = lineCoordinates[i];
    const a = latLonToMeters(lat1, lon1);
    const b = latLonToMeters(lat2, lon2);
    const abx = b.x - a.x; const aby = b.y - a.y;
    const apx = p.x - a.x; const apy = p.y - a.y;
    const ab2 = abx * abx + aby * aby;
    let t = ab2 === 0 ? 0 : ((apx * abx + apy * aby) / ab2);
    t = Math.max(0, Math.min(1, t));
    const projx = a.x + t * abx;
    const projy = a.y + t * aby;
    const dx = p.x - projx; const dy = p.y - projy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

// Helper: deduplicate by approximate location
function dedupeByLocation(places) {
  const seen = new Set();
  const result = [];
  for (const place of places) {
    if (!place.lat || !place.lon) continue;
    const key = `${place.lat.toFixed(5)}_${place.lon.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(place);
  }
  return result;
}

// Helper: get a safe name from tags
function getPlaceName(tags) {
  return tags.name || tags['name:en'] || tags['alt_name'] || tags['brand'] || 'Unnamed';
}

// Categorize an OSM element into one of our categories
function determineCategory(tags) {
  const leisure = tags.leisure;
  const natural = tags.natural;
  const tourism = tags.tourism;
  const amenity = tags.amenity;
  const historic = tags.historic;
  const water = tags.water;
  const waterway = tags.waterway;
  const landuse = tags.landuse;
  const religion = tags.religion;
  const shop = tags.shop;

  if (amenity === 'charging_station') return 'ev';
  if (amenity === 'fuel') return 'fuel';
  if (amenity === 'hospital') return 'hospitals';
  if (amenity === 'atm') return 'atms';
  if (amenity === 'toilets') return 'toilets';
  if (amenity === 'restaurant') return 'restaurants';
  if (amenity === 'cafe') return 'cafes';
  if (amenity === 'cinema') return 'cinemas';
  if (amenity === 'marketplace') return 'markets';

  if (tourism === 'hotel') return 'hotels';
  if (tourism === 'museum') return 'museums';
  if (tourism === 'monument' || tourism === 'attraction') return 'monuments';

  if (historic === 'palace') return 'palaces';
  if (historic === 'fort' || historic === 'castle') return 'forts';
  if (historic === 'monument') return 'monuments';

  if (leisure === 'park' || landuse === 'recreation_ground') return 'parks';
  if (leisure === 'garden') return 'gardens';
  if (leisure === 'nature_reserve') return 'parks';

  if (natural === 'beach') return 'beaches';
  if (natural === 'water' && (water === 'lake' || water === 'lagoon' || water === 'reservoir' || water === 'pond')) return 'lakes';
  if (natural === 'wood' || landuse === 'forest' || natural === 'forest') return 'forests';
  if (waterway === 'river' || (natural === 'water' && water === 'river')) return 'rivers';

  if (amenity === 'place_of_worship' || tourism === 'place_of_worship' || religion) return 'temples';

  if (shop === 'mall') return 'malls';
  if (shop === 'supermarket' || shop === 'convenience') return 'markets';

  return null;
}

// Build a comprehensive Overpass QL query within bbox
function buildOverpassQuery(bbox) {
  const { south, west, north, east } = bbox;
  return `
    [out:json][timeout:25];
    (
      // Parks and recreational areas
      node["leisure"~"park|garden|nature_reserve|playground"](${south},${west},${north},${east});
      way["leisure"~"park|garden|nature_reserve|playground"](${south},${west},${north},${east});
      relation["leisure"~"park|garden|nature_reserve|playground"](${south},${west},${north},${east});

      // Natural features
      node["natural"~"beach|water|wood|forest|peak|cliff"](${south},${west},${north},${east});
      way["natural"~"beach|water|wood|forest|peak|cliff"](${south},${west},${north},${east});
      relation["natural"~"beach|water|wood|forest|peak|cliff"](${south},${west},${north},${east});

      // Water bodies
      node["waterway"~"river|stream|canal"](${south},${west},${north},${east});
      way["waterway"~"river|stream|canal"](${south},${west},${north},${east});
      relation["waterway"~"river|stream|canal"](${south},${west},${north},${east});

      // Tourist attractions
      node["tourism"~"hotel|museum|attraction|viewpoint|information"](${south},${west},${north},${east});
      way["tourism"~"hotel|museum|attraction|viewpoint|information"](${south},${west},${north},${east});
      relation["tourism"~"hotel|museum|attraction|viewpoint|information"](${south},${west},${north},${east});

      // Amenities
      node["amenity"~"charging_station|fuel|hospital|atm|toilets|restaurant|cafe|cinema|marketplace|school|university|library|bank|post_office"](${south},${west},${north},${east});
      way["amenity"~"charging_station|fuel|hospital|atm|toilets|restaurant|cafe|cinema|marketplace|school|university|library|bank|post_office"](${south},${west},${north},${east});
      relation["amenity"~"charging_station|fuel|hospital|atm|toilets|restaurant|cafe|cinema|marketplace|school|university|library|bank|post_office"](${south},${west},${north},${east});

      // Historic sites
      node["historic"~"monument|castle|fort|palace|ruins|archaeological_site"](${south},${west},${north},${east});
      way["historic"~"monument|castle|fort|palace|ruins|archaeological_site"](${south},${west},${north},${east});
      relation["historic"~"monument|castle|fort|palace|ruins|archaeological_site"](${south},${west},${north},${east});

      // Religious sites
      node["amenity"="place_of_worship"](${south},${west},${north},${east});
      way["amenity"="place_of_worship"](${south},${west},${north},${east});
      relation["amenity"="place_of_worship"](${south},${west},${north},${east});

      // Shopping
      node["shop"~"mall|supermarket|convenience|department_store"](${south},${west},${north},${east});
      way["shop"~"mall|supermarket|convenience|department_store"](${south},${west},${north},${east});
      relation["shop"~"mall|supermarket|convenience|department_store"](${south},${west},${north},${east});

      // Landmarks and notable places
      node["landmark"](${south},${west},${north},${east});
      way["landmark"](${south},${west},${north},${east});
      relation["landmark"](${south},${west},${north},${east});
    );
    out center 200;
  `;
}

// Call Overpass API and return normalized elements
async function searchComprehensivePlaces(routeGeometry) {
  try {
    const bbox = computeBufferedBbox(routeGeometry, 0.05); // Increase buffer for better coverage
    const query = buildOverpassQuery(bbox);
    let data;
    
    // Try multiple Overpass endpoints for better reliability
    const endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.nchc.org.tw/api/interpreter',
      'https://overpass.openstreetmap.fr/api/interpreter'
    ];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`Trying Overpass endpoint: ${endpoint}`);
        const res = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: new URLSearchParams({ data: query })
        }, 30000); // Increase timeout to 30 seconds
        
        if (res.ok) {
          data = await res.json();
          console.log(`Success with ${endpoint}, found ${data.elements?.length || 0} elements`);
          break;
        } else {
          console.warn(`HTTP ${res.status} from ${endpoint}`);
        }
      } catch (e) {
        console.warn(`Failed to query ${endpoint}:`, e.message);
        continue;
      }
    }
    
    if (!data || !data.elements) {
      console.warn('All Overpass endpoints failed, trying fallback search...');
      return await fallbackLandmarkSearch(bbox);
    }
    
    const elements = data.elements
      .map(el => {
        const lat = el.lat || (el.center && el.center.lat);
        const lon = el.lon || (el.center && el.center.lon);
        const tags = el.tags || {};
        if (lat == null || lon == null) return null;
        return { id: `${el.type}/${el.id}`, lat, lon, tags, name: getPlaceName(tags) };
      })
      .filter(Boolean);
    
    console.log(`Successfully processed ${elements.length} elements from Overpass`);
    return elements;
  } catch (e) {
    console.error('Overpass error:', e);
    // Try fallback search
    try {
      const bbox = computeBufferedBbox(routeGeometry, 0.05);
      return await fallbackLandmarkSearch(bbox);
    } catch (fallbackError) {
      console.error('Fallback search also failed:', fallbackError);
      return [];
    }
  }
}

// Fallback: segment the route and query smaller windows to capture near-route POIs
async function searchComprehensivePlacesSegmented(routeGeometry) {
  const coords = routeGeometry.coordinates; // [lon,lat]
  if (!coords || coords.length === 0) return [];

  // Increase samples for better coverage
  const maxSamples = 8; // Increase from 6 to 8
  const step = Math.max(1, Math.floor(coords.length / maxSamples));
  const samples = [];
  for (let i = 0; i < coords.length; i += step) samples.push(coords[i]);
  if (samples[samples.length - 1] !== coords[coords.length - 1]) samples.push(coords[coords.length - 1]);

  const aggregate = [];
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.nchc.org.tw/api/interpreter'
  ];

  for (let i = 0; i < samples.length; i++) {
    const [lon, lat] = samples[i];
    // Increase bbox size for better coverage
    const bbox = { south: lat - 0.02, west: lon - 0.02, north: lat + 0.02, east: lon + 0.02 };
    const query = buildOverpassQuery(bbox);
    
    let success = false;
    for (const endpoint of endpoints) {
      try {
        const res = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: new URLSearchParams({ data: query })
        }, 15000); // Increase timeout
        
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.elements)) {
            for (const el of data.elements) {
              const latEl = el.lat || (el.center && el.center.lat);
              const lonEl = el.lon || (el.center && el.center.lon);
              const tags = el.tags || {};
              if (latEl == null || lonEl == null) continue;
              aggregate.push({ 
                id: `${el.type}/${el.id}`, 
                lat: latEl, 
                lon: lonEl, 
                tags, 
                name: getPlaceName(tags) 
              });
            }
            success = true;
            break; // Success with this endpoint, move to next sample
          }
        }
      } catch (e) {
        console.warn(`Failed to query ${endpoint} for sample ${i}:`, e.message);
        continue; // Try next endpoint
      }
    }
    
    // If all endpoints failed for this sample, try Nominatim fallback
    if (!success) {
      try {
        const fallbackResults = await fallbackLandmarkSearch(bbox);
        aggregate.push(...fallbackResults);
      } catch (fallbackError) {
        console.warn(`Fallback search failed for sample ${i}:`, fallbackError.message);
      }
    }
    
      // Increase soft cap for much better coverage
  if (aggregate.length > 800) break; // Increase from 500 to 800
  }
  
  console.log(`Segmented search found ${aggregate.length} total places`);
  return aggregate;
}

// Filter all places to those along the route and categorize
async function findAllTouristPlacesAlongRoute(routeGeometry, corridorMeters = 1200) { // Increase from 800 to 1200
  let allPlaces = await searchComprehensivePlaces(routeGeometry);
  if (!allPlaces.length) {
    // Fallback to segmented strategy when bbox query returns empty or is rate-limited
    console.log('Primary search returned no results, trying segmented search...');
    allPlaces = await searchComprehensivePlacesSegmented(routeGeometry);
  }
  
  if (!allPlaces.length) {
    console.warn('Both primary and segmented search failed, trying emergency fallback...');
    // Emergency fallback: use a very wide search area
    const emergencyBbox = computeBufferedBbox(routeGeometry, 0.1); // Very wide buffer
    allPlaces = await fallbackLandmarkSearch(emergencyBbox);
  }
  
  if (!allPlaces.length) {
    console.error('All search methods failed - no landmarks found');
    return { grouped: {}, flat: [] };
  }
  
  console.log(`Found ${allPlaces.length} total places before filtering`);
  
  // Increase corridor width for better coverage
  const withinCorridor = allPlaces.filter(p => {
    const d = distancePointToPolylineMeters(p.lat, p.lon, routeGeometry.coordinates);
    return d <= corridorMeters;
  });
  
  console.log(`${withinCorridor.length} places within ${corridorMeters}m corridor`);
  
  const deduped = dedupeByLocation(withinCorridor);
  const categorized = deduped.map(p => {
    const cat = determineCategory(p.tags);
    return { ...p, category: cat };
  }).filter(p => !!p.category);

  // Group and limit per category (increase from 12 to 25 for much better coverage)
  const grouped = {};
  for (const key of Object.keys(TOURIST_CATEGORIES)) grouped[key] = [];
  for (const p of categorized) {
    const key = p.category;
    if (!grouped[key]) grouped[key] = [];
    if (grouped[key].length < 25) grouped[key].push(p); // Increase from 12 to 25
  }
  const flat = Object.values(grouped).flat();
  
  console.log(`Final result: ${flat.length} landmarks in ${Object.keys(grouped).filter(k => grouped[k].length > 0).length} categories`);
  return { grouped, flat };
}

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
}

function toggleHomeSidebar() {
  document.getElementById("homeSidebar").classList.toggle("hidden");
}

function showHome() {
  document.getElementById('homeScreen').style.display = 'block';
  document.getElementById('mapContainer').style.display = 'none';
  document.getElementById("homeSidebar").classList.remove("hidden");
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("hamburger").classList.add("hidden");
  document.getElementById("mapContainer").classList.remove("sidebar-open");
  document.getElementById('sidebarOverlay').classList.add('show');
}

function showMap() {
  document.getElementById('homeScreen').style.display = 'none';
  document.getElementById('mapContainer').style.display = 'block';
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("homeSidebar").classList.add("hidden");
  document.getElementById("hamburger").classList.add("hidden");
  document.getElementById("mapContainer").classList.add("sidebar-open");
  document.getElementById('sidebarOverlay').classList.add('show');

  setTimeout(() => {
    if (!map) {
      map = L.map('map').setView([10.8505, 76.2711], 8);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLat = position.coords.latitude;
          const userLng = position.coords.longitude;
          const userLocation = [userLat, userLng];
          map.setView(userLocation, 13);
          L.marker(userLocation).addTo(map).bindPopup("You are here").openPopup();
        },
        (error) => {
          console.error("Geolocation error:", error.message);
          alert("Unable to retrieve your location.");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);
      
      // Setup popup management
      setupMapPopupManagement();
    } else {
      map.invalidateSize();
    }
  }, 300);
}

async function geocode(location) {
  const trimmed = (location || '').trim();
  if (!trimmed) return null;
  // Try Mapbox → Nominatim → Photon
  // Add proximity/country bias to improve Indian city results
  const center = map && typeof map.getCenter === 'function' ? map.getCenter() : null;
  const proximity = center ? `&proximity=${center.lng},${center.lat}` : '';
  const mapboxToken = 'pk.eyJ1IjoiamQxMjA2IiwiYSI6ImNtZGJxZGE0MzBuZXgycXIyaHZlNHhjMjkifQ.fhXRKJLNhYo5xB992ZIbVg';
  try {
    const mbUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json?limit=1&language=en&country=in${proximity}&access_token=${mapboxToken}`;
    const mbRes = await fetchWithTimeout(mbUrl, {}, 9000);
    if (mbRes.ok) {
      const mb = await mbRes.json();
      if (mb && mb.features && mb.features.length > 0) {
        const [lon, lat] = mb.features[0].geometry.coordinates;
        if (isFinite(lat) && isFinite(lon)) return [lat, lon];
      }
    }
  } catch (_) {}

  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&limit=1&countrycodes=in`;
    const res = await fetchWithTimeout(nomUrl, { headers: { 'Accept': 'application/json' } }, 12000);
    if (res.ok) {
  const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    }
  } catch (_) {}

  try {
    const phUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&limit=1`;
    const phRes = await fetchWithTimeout(phUrl, {}, 9000);
    if (phRes.ok) {
      const ph = await phRes.json();
      if (ph && ph.features && ph.features.length > 0) {
        const coords = ph.features[0].geometry.coordinates; // [lon,lat]
        if (coords && coords.length === 2) return [coords[1], coords[0]];
      }
    }
  } catch (_) {}

  return null;
}

async function getVehicleSuggestion(distance) {
  try {
    const res = await fetchWithTimeout("http://localhost:5000/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ distanceKm: parseFloat(distance) })
    }, 6000);
    return await res.json();
  } catch (err) {
    console.error("Suggestion fetch error:", err);
    return null;
  }
}
function adjustEmissionRate(baseRate, year) {
  const currentYear = new Date().getFullYear();
  let age = currentYear - year;

  if (age < 0) age = 0; // No negative age

  // Older vehicles emit more
  if (age > 0) {
    return baseRate * (1 + age * 0.015); // +1.5% per year older
  } else {
    // Newer tech - lower emissions
    const reduction = Math.min(0.2, Math.abs(age) * 0.01); // cap at 20%
    return baseRate * (1 - reduction);
  }
}


async function findRoute() {
  const sourceText = document.getElementById("source").value.trim();
  const destText = document.getElementById("destination").value.trim();
  const vehicleType = document.getElementById("vehicleType").value;
  const fuelType = document.getElementById("fuelType").value;
  const modelYear = parseInt(document.getElementById("modelYear").value) || 2020;
  const engineSizeLiters = parseFloat(document.getElementById("engineSizeLiters").value);
  const routeType = document.getElementById("routeType").value;
  const traffic = document.getElementById("traffic").value;
  const loadFactor = parseFloat(document.getElementById("loadFactor").value) || 1.0;
  const claimedEfficiency = parseFloat(document.getElementById("claimedEfficiency").value);
  const claimedEfficiencyUnit = document.getElementById("claimedEfficiencyUnit").value;
  const electricitySource = document.getElementById("electricitySource").value;

  if (!sourceText || !destText) {
    document.getElementById("info-box").innerText = "---";
    alert("Please enter both source and destination.");
    return;
  }
  
  // Validate form before proceeding
  if (typeof validateForm === 'function' && !validateForm()) {
    alert("Please fix the form errors before calculating the route.");
    return;
  }

  // Validate vehicle type and fuel type compatibility
  if (vehicleType === "electric" && fuelType !== "electric") {
    alert("Electric vehicles should have 'Electric' as fuel type.");
    return;
  }
  if (vehicleType === "hybrid" && fuelType !== "hybrid") {
    alert("Hybrid vehicles should have 'Hybrid' as fuel type.");
    return;
  }

  const sourceCoords = await enhancedGeocode(sourceText);
  const destCoords = await enhancedGeocode(destText);

  if (!sourceCoords || !destCoords) {
    alert("Could not locate one or both addresses.");
    return;
  }

  // Show loading state
  const calculateButton = document.querySelector('button[onclick="findRoute()"]');
  if (calculateButton) {
    calculateButton.classList.add('loading');
    calculateButton.disabled = true;
  }
  
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("homeSidebar").classList.add("hidden");

  // Clear previous layers
  if (sourceMarker) map.removeLayer(sourceMarker);
  if (destMarker) map.removeLayer(destMarker);
  // Remove all previous route layers
  routeLayers.forEach(layer => map.removeLayer(layer));
  routeLayers = [];
  
  // Cleanup any existing tourist route
  cleanupTouristRoute();

  sourceMarker = L.marker(sourceCoords).addTo(map).bindPopup("Source");
  destMarker = L.marker(destCoords).addTo(map).bindPopup("Destination");
  map.fitBounds([sourceCoords, destCoords], { padding: [50, 50] });

  const routeURL = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${sourceCoords[1]},${sourceCoords[0]};${destCoords[1]},${destCoords[0]}?geometries=geojson&overview=full&alternatives=true&access_token=pk.eyJ1IjoiamQxMjA2IiwiYSI6ImNtZGJxZGE0MzBuZXgycXIyaHZlNHhjMjkifQ.fhXRKJLNhYo5xB992ZIbVg`;
  const res = await fetchWithTimeout(routeURL, {}, 15000);
  let data = await res.json();

  // Fallback: if Mapbox gives only 1 route, force an alternate
  if (!data.routes || data.routes.length === 1) {
    console.warn("Only one route found — forcing alternate calculation...");
    const nudgedDest = [destCoords[0] + 0.002, destCoords[1] + 0.002]; // ~200m offset
    const altURL = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${sourceCoords[1]},${sourceCoords[0]};${nudgedDest[1]},${nudgedDest[0]}?geometries=geojson&overview=full&access_token=pk.eyJ1IjoiamQxMjA2IiwiYSI6ImNtZGJxZGE0MzBuZXgycXIyaHZlNHhjMjkifQ.fhXRKJLNhYo5xB992ZIbVg`;
    const altRes = await fetchWithTimeout(altURL, {}, 15000);
    const altData = await altRes.json();
    if (altData.routes && altData.routes.length > 0) {
      data.routes.push(altData.routes[0]);
    }
  }

  const mainRoute = data.routes[0];
  const distance = (mainRoute.distance / 1000).toFixed(2);
  const distanceUnit = 'km'; // Default to km since we're calculating from route
  
  // Use the emission calculator for accurate emissions
  let emissions = 0;
  let emissionBreakdown = null;
  
  try {
    // Prepare inputs for emission calculator
    const emissionInputs = {
      vehicleType: vehicleType,
      fuelType: fuelType,
      distance: distance,
      distanceUnit: distanceUnit,
      routeType: routeType,
      traffic: traffic,
      modelYear: modelYear,
      loadFactor: loadFactor,
      engineSizeLiters: engineSizeLiters,
      electricitySource: electricitySource
    };
    
    // Add claimed efficiency if provided
    if (claimedEfficiency && claimedEfficiencyUnit) {
      emissionInputs.claimedEfficiency = claimedEfficiency;
      emissionInputs.claimedEfficiencyUnit = claimedEfficiencyUnit;
    }
    
    // Calculate emissions using the emission calculator
    if (typeof EmissionCalculator !== 'undefined') {
      const result = EmissionCalculator.estimateEmissions(emissionInputs);
      emissions = result.totalEmissionsGramsCO2;
      emissionBreakdown = result.breakdown;
    } else {
      // Fallback to simple calculation if emission calculator not available
      const adjustedRate = adjustEmissionRate(emissionRates[vehicleType] || emissionRates.petrol, modelYear || 2020);
      emissions = (distance * adjustedRate);
    }
  } catch (error) {
    console.error("Emission calculation error:", error);
    // Fallback calculation
    const adjustedRate = adjustEmissionRate(emissionRates[vehicleType] || emissionRates.petrol, modelYear || 2020);
    emissions = (distance * adjustedRate);
  }
  
  const emissionsFormatted = emissions.toFixed(2);

  const suggestion = await getVehicleSuggestion(distance);

  // Generate eco tip
  let ecoTip = "";
  if (distance <= 5) {
    ecoTip = "🚶 Walk or 🚴 Cycle — zero CO₂ and great for your health!";
  } else if (distance <= 15) {
    ecoTip = "🚴 Try cycling or using an e-bike for a quick and eco-friendly trip!";
  } else if (distance <= 50) {
    ecoTip = "🚌 Consider public transport or carpooling to cut emissions.";
  } else {
    ecoTip = "⚡ For long trips, choose electric or hybrid vehicles to reduce CO₂.";
  }
  if (vehicleType === "petrol" || vehicleType === "diesel") {
    ecoTip += " 💡 Switching to electric can cut your emissions by up to 90%!";
  } else if (vehicleType === "truck") {
    ecoTip += " 📦 Plan efficient deliveries or use electric trucks where possible.";
  } else if (vehicleType === "electric") {
    ecoTip += " 🔋 You're already on the green path! Keep charging from renewable sources.";
  } else if (vehicleType === "bus") {
    ecoTip += " 🙌 Public transport helps reduce traffic and pollution.";
  }
  if (emissions > 50000) {
    ecoTip += " 🌍 This trip has a high carbon footprint — see if you can reduce frequency or combine trips.";
  }

  // Save to MongoDB
  fetch("http://localhost:5000/save-route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: sourceText,
      destination: destText,
      vehicleType,
      fuelType,
      modelYear,
      engineSizeLiters,
      distance: parseFloat(distance),
      distanceUnit,
      routeType,
      traffic,
      loadFactor,
      claimedEfficiency,
      claimedEfficiencyUnit,
      electricitySource,
      emissions: parseFloat(emissions),
      ecoTip, // Save tip as well
      routeSource: lastGeocodeProvider === 'tomtom' ? 'TomTom+OSM' : 'OSM'
    })
  })
    .then(res => res.json())
    .then(data => console.log(" Saved to MongoDB:", data))
    .catch(err => console.error(" Save error:", err));

  // Draw main route
  // Default route color (will update after traffic detection)
  const mainRouteLayer = L.geoJSON(mainRoute.geometry, {
    style: { color: "#16a34a", weight: 5 }
  }).addTo(map);
  routeLayers.push(mainRouteLayer);

  // Draw alternatives
  if (data.routes.length > 1) {
    data.routes.slice(1).forEach((altRoute, idx) => {
      const altLayer = L.geoJSON(altRoute.geometry, {
        style: { color: idx % 2 === 0 ? "red" : "blue", weight: 3, dashArray: "5,5" }
      }).addTo(map);
      routeLayers.push(altLayer);
    });
  }

  let infoHTML = `
    <strong>Distance:</strong> ${distance} ${distanceUnit} (Route: ${distance} km)<br>
    <strong>Vehicle:</strong> ${vehicleType.toUpperCase()} - ${fuelType}<br>
    <strong>Emissions:</strong> ${emissionsFormatted} g CO₂
  `;
  
  // Add detailed emission breakdown if available
  if (emissionBreakdown) {
    infoHTML += `<br><strong>Emission Details:</strong><br>`;
    infoHTML += `• Base consumption: ${emissionBreakdown.baseConsumptionPer100Km?.value || 'N/A'} ${emissionBreakdown.baseConsumptionPer100Km?.unit || ''}<br>`;
    infoHTML += `• Adjusted consumption: ${emissionBreakdown.adjustedConsumptionPer100Km?.value?.toFixed(2) || 'N/A'} ${emissionBreakdown.adjustedConsumptionPer100Km?.unit || ''}<br>`;
    if (emissionBreakdown.factorsApplied) {
      const factors = emissionBreakdown.factorsApplied;
      infoHTML += `• Factors: Age: ${factors.ageYears || 0}yr, Route: ${factors.routeType}, Traffic: ${factors.traffic}, Load: ${factors.loadFactor || 1.0}x<br>`;
    }
  }

  if (suggestion) {
    infoHTML += `<br><strong>Recommended:</strong> ${suggestion.best.type.toUpperCase()} (⏱ ${suggestion.best.time} hrs, 🌿 ${suggestion.best.emission}g CO₂)`;
    if (suggestion.alternatives?.length > 0) {
      infoHTML += `<br><em>Alternatives:</em><div class="vehicle-times">`;
      suggestion.alternatives.forEach(alt => {
        infoHTML += `<div>${alt.type.toUpperCase()}: ${alt.time} hrs, ${alt.emission}g CO₂</div>`;
      });
      infoHTML += `</div>`;
    }
  }

  // Add eco tip to info box
  infoHTML += `<br><strong style="color:green;">Eco Tip:</strong> ${ecoTip}`;

  // Detect API roles, overlay traffic tiles, and build traffic/weather snippet
  try { await ensureApiKeyRoles(); } catch(_) {}
  try { addTrafficTileOverlays(); } catch(_) {}
  let trafficSummary = null; let weatherPoints = [];
  try { trafficSummary = await fetchTrafficSummary(mainRoute.geometry); } catch(_) {}
  try { weatherPoints = await fetchWeatherAlongRoute(mainRoute.geometry); } catch(_) {}
  lastTrafficWeatherHtml = buildTrafficWeatherSnippet(trafficSummary, weatherPoints);
  // Replace with segment-by-segment coloring for precise visualization
  try { await colorizeRouteByTraffic(mainRoute.geometry, mainRouteLayer); } catch(_) {}

  // Show geocoding source info
  const sourceBadge = lastGeocodeProvider === 'tomtom' ? 'Enhanced with TomTom geocoding' : 'Using OSM geocoding';
  infoHTML += `<br><small style="opacity:0.8;">${sourceBadge}</small>`;
  if (lastTrafficWeatherHtml) infoHTML += lastTrafficWeatherHtml;

  const box = document.getElementById("info-box");
  box.innerHTML = `
    <div class="info-header">
      <span>Route Summary</span>
      <div class="info-actions">
        <button class="min-btn" onclick="document.getElementById('info-box').classList.toggle('collapsed')">—</button>
      </div>
    </div>
    <div class="info-body">${infoHTML}</div>
  `;

  // try to refresh recent list on home screen if present
  try {
    if (typeof loadRecent === 'function') {
      loadRecent();
    }
  } catch (_) {}
  
  // Remove loading state
  if (calculateButton) {
    calculateButton.classList.remove('loading');
    calculateButton.disabled = false;
  }
}

// Enhanced tourist route function: comprehensive attractions along the route
async function findTouristRoute() {
  const sourceText = document.getElementById("source").value.trim();
  const destText = document.getElementById("destination").value.trim();
  const vehicleType = document.getElementById("vehicleType").value;
  const fuelType = document.getElementById("fuelType").value;
  const modelYear = parseInt(document.getElementById("modelYear").value) || 2020;

  if (!sourceText || !destText) {
    document.getElementById("info-box").innerText = "---";
    alert("Please enter both source and destination.");
    return;
  }

  const sourceCoords = await enhancedGeocode(sourceText);
  const destCoords = await enhancedGeocode(destText);

  if (!sourceCoords || !destCoords) {
    alert("Could not locate one or both addresses.");
    return;
  }

  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("homeSidebar").classList.add("hidden");

  // Clear previous layers
  if (sourceMarker) map.removeLayer(sourceMarker);
  if (destMarker) map.removeLayer(destMarker);
  routeLayers.forEach(layer => map.removeLayer(layer));
  routeLayers = [];

  sourceMarker = L.marker(sourceCoords).addTo(map).bindPopup("Source");
  destMarker = L.marker(destCoords).addTo(map).bindPopup("Destination");
  map.fitBounds([sourceCoords, destCoords], { padding: [50, 50] });

  // Get the route first
  const routeURL = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${sourceCoords[1]},${sourceCoords[0]};${destCoords[1]},${destCoords[0]}?geometries=geojson&overview=full&alternatives=false&access_token=pk.eyJ1IjoiamQxMjA2IiwiYSI6ImNtZGJxZGE0MzBuZXgycXIyaHZlNHhjMjkifQ.fhXRKJLNhYo5xB992ZIbVg`;
  let data;
  try {
    const res = await fetchWithTimeout(routeURL, {}, 15000);
    data = await res.json();
  } catch (e) {
    alert('Failed to fetch route. Please try again.');
    console.error(e);
    return;
  }

  if (!data.routes || data.routes.length === 0) {
    alert("Could not find a route between these locations.");
    return;
  }

  const mainRoute = data.routes[0];
  const distanceKm = (mainRoute.distance / 1000).toFixed(2);
  const adjustedRate = adjustEmissionRate(emissionRates[vehicleType] || emissionRates.petrol, modelYear);
  const emissions = (distanceKm * adjustedRate).toFixed(2);

  // Draw the main route
  const mainRouteLayer = L.geoJSON(mainRoute.geometry, {
    style: { color: "#16a34a", weight: 6, opacity: 0.85 }
  }).addTo(map);
  routeLayers.push(mainRouteLayer);

  // Traffic + Weather for tourist flow (skip if taking too long)
  let tSummary = null; let wPoints = [];
  try { 
    const trafficPromise = ensureApiKeyRoles();
    const trafficTimeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Traffic timeout')), 8000); // 8 second timeout
    });
    await Promise.race([trafficPromise, trafficTimeoutPromise]);
  } catch(_) {}
  
  try { 
    const overlayPromise = addTrafficTileOverlays();
    const overlayTimeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Overlay timeout')), 5000); // 5 second timeout
    });
    await Promise.race([overlayPromise, overlayTimeoutPromise]);
  } catch(_) {}
  
  try { 
    const summaryPromise = fetchTrafficSummary(mainRoute.geometry);
    const summaryTimeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Summary timeout')), 6000); // 6 second timeout
    });
    tSummary = await Promise.race([summaryPromise, summaryTimeoutPromise]);
  } catch(_) {}
  
  try { 
    const weatherPromise = fetchWeatherAlongRoute(mainRoute.geometry);
    const weatherTimeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Weather timeout')), 6000); // 6 second timeout
    });
    wPoints = await Promise.race([weatherPromise, weatherTimeoutPromise]);
  } catch(_) {}
  
  lastTrafficWeatherHtml = buildTrafficWeatherSnippet(tSummary, wPoints);
  
  // Skip heavy traffic coloring for tourist routes to improve performance
  // try { await colorizeRouteByTraffic(mainRoute.geometry, mainRouteLayer); } catch(_) {}

  // Loading state with progress
  document.getElementById("info-box").innerHTML = `
    <div class="info-header">
      <span>Tourist Attractions</span>
      <div class="info-actions">
        <button class="min-btn" onclick="document.getElementById('info-box').classList.toggle('collapsed')">—</button>
      </div>
    </div>
    <div class="info-body">
      <div class="tourist-loading">
        <div class="spinner"></div>
        <div><strong>Searching attractions along your route...</strong><br><small>This may take a few seconds</small></div>
        <div class="progress-bar">
          <div class="progress-fill"></div>
        </div>
      </div>
    </div>
  `;

  // Simulate progress for better UX
  const progressFill = document.querySelector('.progress-fill');
  let progress = 0;
  const progressInterval = setInterval(() => {
    progress += Math.random() * 15;
    if (progress > 90) progress = 90;
    if (progressFill) progressFill.style.width = progress + '%';
  }, 200);

  // Find comprehensive places along the route from OSM
  const searchPromise = findAllTouristPlacesAlongRoute(mainRoute.geometry, 1200); // Increase from 800 to 1200
  
  // Add timeout to prevent hanging
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Search timeout')), 35000); // Increase from 25 to 35 seconds
  });
  
  let osmGrouped, osmFlat;
  try {
    console.log('Starting landmark search...');
    const result = await Promise.race([searchPromise, timeoutPromise]);
    osmGrouped = result.grouped;
    osmFlat = result.flat;
    console.log(`Landmark search completed: ${Object.keys(osmGrouped).filter(k => osmGrouped[k].length > 0).length} categories with landmarks`);
  } catch (error) {
    console.warn('OSM search failed or timed out:', error);
    // Try emergency fallback
    try {
      console.log('Attempting emergency fallback search...');
      const emergencyBbox = computeBufferedBbox(mainRoute.geometry, 0.15);
      const emergencyResults = await fallbackLandmarkSearch(emergencyBbox);
      osmGrouped = {};
      osmFlat = emergencyResults;
      
      // Categorize emergency results
      for (const place of emergencyResults) {
        const cat = place.category || 'monuments';
        if (!osmGrouped[cat]) osmGrouped[cat] = [];
        osmGrouped[cat].push(place);
      }
      console.log(`Emergency fallback found ${emergencyResults.length} landmarks`);
    } catch (emergencyError) {
      console.error('Emergency fallback also failed:', emergencyError);
      osmGrouped = {};
      osmFlat = [];
    }
  }

  // Fetch supplemental POIs from TomTom and merge
  let mergedGrouped = {};
  let mergedFlat = [];
  try {
    const tomPromise = fetchTomTomPOIs(mainRoute.geometry, vehicleType, osmGrouped);
    const tomTimeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('TomTom timeout')), 15000); // 15 second timeout
    });
    
    const tom = await Promise.race([tomPromise, tomTimeoutPromise]);
    lastTouristDataEnhanced = !!tom.enhanced;
    // initialize merged with OSM
    for (const key of Object.keys(TOURIST_CATEGORIES)) {
      mergedGrouped[key] = Array.isArray(osmGrouped[key]) ? [...osmGrouped[key]] : [];
    }
    // merge TomTom
    for (const key of Object.keys(TOURIST_CATEGORIES)) {
      const list = tom.grouped && Array.isArray(tom.grouped[key]) ? tom.grouped[key] : [];
              if (list.length) {
          mergedGrouped[key].push(...list);
          // dedupe and cap - increase limit for more landmarks
          mergedGrouped[key] = dedupeByLocation(mergedGrouped[key]).slice(0, 20); // Increase from 8 to 20
        }
    }
    mergedFlat = Object.values(mergedGrouped).flat();
  } catch (error) {
    console.warn('TomTom search failed or timed out:', error);
    lastTouristDataEnhanced = false;
    mergedGrouped = osmGrouped;
    mergedFlat = osmFlat || [];
  }

  // Display markers
  const displayedGrouped = displayTouristAttractions(mergedGrouped);

  // Save summary to backend (optional, keeps existing save behavior consistent)
  try {
  fetch("http://localhost:5000/save-route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: sourceText,
      destination: destText,
      vehicleType,
      modelYear,
        distance: parseFloat(distanceKm),
        emissions: parseFloat(emissions),
        routeSource: lastTouristDataEnhanced ? 'TomTom+OSM' : 'OSM'
      })
    }).catch(() => {});
  } catch (_) {}

  // Info panel - now use the displayedGrouped data
  if (!displayedGrouped || Object.keys(displayedGrouped).every(key => !displayedGrouped[key] || displayedGrouped[key].length === 0)) {
    document.getElementById("info-box").innerHTML = `
      <div class="info-header">
        <span>Tourist Attractions</span>
        <div class="info-actions">
          <button class="min-btn" onclick="document.getElementById('info-box').classList.toggle('collapsed')">—</button>
        </div>
      </div>
      <div class="info-body">
        <div class="tourist-info-panel">
          <div class="summary">
            <div><strong>Distance:</strong> ${distanceKm} km</div>
            <div><strong>${vehicleType.toUpperCase()} (${modelYear}) CO₂:</strong> ${emissions} g</div>
          </div>
          <div style="color:#e6fff4">No attractions found within ~1 km of this route currently. Overpass may be rate-limited; try again shortly.</div>
        </div>
      </div>
    `;
    
    // Update current data for real-time sync
    updateCurrentTouristData({
      distanceKm,
      emissions,
      vehicleType,
      modelYear,
      grouped: {},
      extraHtml: lastTrafficWeatherHtml || ''
    });
  } else {
    // Append traffic/weather snippet if available
    const addon = lastTrafficWeatherHtml || '';
    const touristData = {
      distanceKm,
      emissions,
      vehicleType,
      modelYear,
      grouped: displayedGrouped, // Use the displayed data
      extraHtml: addon
    };
    
    // Update current data for real-time sync
    updateCurrentTouristData(touristData);
    
    // Display the info
    displayTouristRouteInfo(touristData);
  }

  // Best effort: refresh recent list
  try { if (typeof loadRecent === 'function') loadRecent(); } catch (_) {}

  // Stop progress simulation
  clearInterval(progressInterval);
  
  // Start periodic refresh of tourist info box
  startTouristInfoBoxRefresh();
}

// Place markers on the map with category-specific styling and enhanced interaction
function displayTouristAttractions(grouped) {
  console.log('Displaying tourist attractions:', grouped);
  let totalMarkers = 0;
  
  // Clear existing markers first
  markerByPlaceId.forEach(marker => {
    try { map.removeLayer(marker); } catch(_) {}
  });
  markerByPlaceId.clear();
  
  // Close any existing popups
  closeAllPopups();
  
  Object.keys(grouped).forEach(key => {
    const cat = TOURIST_CATEGORIES[key];
    const places = grouped[key] || [];
    console.log(`Category ${key}: ${places.length} places`);
    
    places.forEach(async p => {
      const marker = L.marker([p.lat, p.lon], { icon: buildTouristDivIcon(key) }).addTo(map);
      markerByPlaceId.set(p.id || `${p.lat},${p.lon}`, marker);
      
      // Use enhanced marker interaction system
      setupMarkerInteraction(marker, p, key);
    });
    
    totalMarkers += places.length;
  });
  
  console.log(`Displayed ${totalMarkers} markers on map`);
  return grouped;
}

// Render the info panel with categorized counts and lists, ordered along the route
function displayTouristRouteInfo({ distanceKm, emissions, vehicleType, modelYear, grouped, extraHtml }) {
  let html = `
    <div class="tourist-info-panel">
      <div class="summary">
        <div><strong>Distance:</strong> ${distanceKm} km</div>
        <div><strong>${vehicleType.toUpperCase()} (${modelYear}) CO₂:</strong> ${emissions} g</div>
        ${lastTouristDataEnhanced ? '<div><small>Enhanced with TomTom data</small></div>' : '<div><small>Data from OSM</small></div>'}
        ${extraHtml ? `<div>${extraHtml}</div>` : ''}
      </div>
  `;

  // Count total landmarks found
  let totalLandmarks = 0;
  Object.keys(grouped).forEach(key => {
    if (grouped[key] && Array.isArray(grouped[key])) {
      totalLandmarks += grouped[key].length;
    }
  });

  // Add total count with enhanced styling
  if (totalLandmarks > 0) {
    html += `<div class="total-landmarks">
      <strong>🎯 Total Landmarks Found: ${totalLandmarks}</strong>
      <div style="font-size: 12px; margin-top: 4px; color: #1e40af;">
        Ordered from start (Madurai) to end (Chennai) along your route
      </div>
    </div>`;
  }

  // Display landmarks by category, ordered along the route
  Object.keys(TOURIST_CATEGORIES).forEach(key => {
    const cat = TOURIST_CATEGORIES[key];
    const items = grouped[key] || [];
    const count = items.length;
    if (count === 0) return; // skip empty
    
    html += `
      <div class="cat-section">
        <div class="cat-header">
          <span class="chip" style="background:${cat.color}22; color:${cat.color}">${cat.emoji}</span>
          ${cat.label} <span class="count">${count}</span>
        </div>
        <ul class="cat-list">
          ${items.map((p, index) => {
            const routeProgress = p.routeProgress || 0;
            const progressPercent = Math.round(routeProgress * 100);
            const distanceFromRoute = p.routeDistance ? Math.round(p.routeDistance) : '?';
            
            return `<li title="${p.name} - ${progressPercent}% along route, ${distanceFromRoute}m from route" 
                       data-place-id="${p.id}" 
                       data-route-progress="${routeProgress}"
                       data-distance-from-route="${distanceFromRoute}">
              <div class="place-name">${p.name}</div>
              <div class="place-distance">${progressPercent}%</div>
            </li>`;
          }).join('')}
        </ul>
      </div>
    `;
  });

  // If no landmarks found, show a message
  if (totalLandmarks === 0) {
    html += `<div style="text-align: center; padding: 20px; color: #6b7280;">
      <div style="font-size: 24px; margin-bottom: 10px;">🔍</div>
      <div><strong>No landmarks found</strong></div>
      <div style="font-size: 14px; margin-top: 5px;">Try adjusting your route or search parameters</div>
    </div>`;
  }

  html += `</div></div>`;
  const box = document.getElementById('info-box');
  box.innerHTML = `
    <div class="info-header">
      <span>Tourist Attractions</span>
      <div class="info-actions">
        <button class="min-btn" onclick="document.getElementById('info-box').classList.toggle('collapsed')">—</button>
      </div>
    </div>
    <div class="info-body">${html}</div>
  `;
  autoCollapseInfoBoxOnSmallScreens();

  // Enhanced click handlers for list items with route progress information
  try {
    const list = box.querySelectorAll('.cat-list li[data-place-id]');
    list.forEach(li => {
      li.addEventListener('click', () => {
        const pid = li.getAttribute('data-place-id');
        const routeProgress = li.getAttribute('data-route-progress');
        const distanceFromRoute = li.getAttribute('data-distance-from-route');
        const marker = markerByPlaceId.get(pid);
        
        if (marker && map) {
          const latlng = marker.getLatLng();
          
          // Pan to marker with appropriate zoom level
          map.setView(latlng, Math.max(map.getZoom(), 16));
          
          // Highlight the clicked item in the list
          box.querySelectorAll('.cat-list li').forEach(item => {
            item.classList.remove('highlighted');
          });
          li.classList.add('highlighted');
          
          // Open popup with route information
          try { 
            marker.openPopup(); 
          } catch(_) {}
          
          // Scroll the info box to keep the highlighted item visible
          li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    });
  } catch (_) {}
  
  // Add map click handler to refresh info box when markers are clicked
  try {
    if (map) {
      map.off('click', refreshTouristInfoBox);
      map.on('click', refreshTouristInfoBox);
    }
  } catch (_) {}
}

// Collapse info box by default on small screens for better map visibility
function autoCollapseInfoBoxOnSmallScreens() {
  try {
    const box = document.getElementById('info-box');
    if (!box) return;
    const isSmall = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    if (isSmall) box.classList.add('collapsed');
  } catch (_) {}
}

// Function to find green/nature places along a route
async function findGreenPlacesAlongRoute(routeGeometry, sourceCoords, destCoords) {
  const greenPlaces = [];
  
  try {
    // Extract waypoints from the route geometry
    const waypoints = routeGeometry.coordinates.map(coord => [coord[1], coord[0]]);
    
    // Search for green places near waypoints (every 5th point to avoid too many API calls)
    for (let i = 0; i < waypoints.length; i += 5) {
      const waypoint = waypoints[i];
      
      try {
        // Search for parks, forests, nature reserves, etc.
        const searchQueries = [
          'park',
          'forest', 
          'nature reserve',
          'botanical garden',
          'wildlife sanctuary',
          'green space',
          'trail',
          'lake',
          'river',
          'mountain',
          'beach'
        ];

        for (const query of searchQueries) {
          const places = await searchNearbyPlaces(waypoint[0], waypoint[1], query, 2000); // 2km radius
          greenPlaces.push(...places);
        }
      } catch (error) {
        console.log(`Error searching near waypoint ${i}:`, error);
      }
    }

    // Remove duplicates and limit results
    const uniquePlaces = removeDuplicatePlaces(greenPlaces);
    return uniquePlaces.slice(0, 30); // Return max 30 places for better coverage
  } catch (error) {
    console.error('Error in findGreenPlacesAlongRoute:', error);
    return [];
  }
}

// Function to search for places near a coordinate
async function searchNearbyPlaces(lat, lng, query, radius) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&lat=${lat}&lon=${lng}&radius=${radius}&limit=5`;
    const response = await fetch(url);
    const data = await response.json();
    
    return data.map(place => ({
      name: place.display_name.split(',')[0] || place.display_name,
      lat: parseFloat(place.lat),
      lng: parseFloat(place.lon),
      type: getPlaceType(query),
      description: getPlaceDescription(place.display_name, query)
    }));
  } catch (error) {
    console.error('Error searching places:', error);
    return [];
  }
}

// Function to get place type based on search query
function getPlaceType(query) {
  const typeMap = {
    'park': '🌳 Park',
    'forest': '🌲 Forest',
    'nature reserve': '🦅 Nature Reserve',
    'botanical garden': '🌸 Botanical Garden',
    'wildlife sanctuary': '🦌 Wildlife Sanctuary',
    'green space': '🌿 Green Space',
    'trail': '🥾 Trail',
    'lake': '🏞️ Lake',
    'river': '🌊 River',
    'mountain': '⛰️ Mountain',
    'beach': '🏖️ Beach'
  };
  return typeMap[query] || '🌿 Green Place';
}

// Function to get place description
function getPlaceDescription(displayName, query) {
  const parts = displayName.split(',');
  if (parts.length >= 2) {
    return parts.slice(1, 3).join(', ').trim();
  }
  return displayName;
}

// Function to remove duplicate places
function removeDuplicatePlaces(places) {
  const seen = new Set();
  return places.filter(place => {
    const key = `${place.lat.toFixed(4)}-${place.lng.toFixed(4)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// Function to calculate green route distance (including detours to green places)
function calculateGreenRouteDistance(routeGeometry, greenPlaces) {
  // For now, return the original route distance
  // In a more advanced version, this could calculate actual detours
  const coordinates = routeGeometry.coordinates;
  let totalDistance = 0;
  
  for (let i = 1; i < coordinates.length; i++) {
    const prev = coordinates[i-1];
    const curr = coordinates[i];
    const distance = calculateDistance(prev[1], prev[0], curr[1], curr[0]);
    totalDistance += distance;
  }
  
  return (totalDistance / 1000).toFixed(2); // Convert to km
}

// Function to calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}



// Focus map on a place when user clicks the popup button
function focusPlace(lat, lon) {
  try {
    if (!map) return;
    map.setView([lat, lon], Math.max(map.getZoom(), 16));
    const temp = L.circleMarker([lat, lon], { radius: 8, color: '#10b981', fillColor: '#10b981', fillOpacity: 0.9 });
    temp.addTo(map);
    setTimeout(() => { try { map.removeLayer(temp); } catch(_) {} }, 2000);
  } catch (_) {}
}

document.addEventListener("DOMContentLoaded", () => {
  const hamburger = document.getElementById("hamburger");
  const sidebar = document.getElementById("sidebar");
  const homeSidebar = document.getElementById("homeSidebar");
  const mapContainer = document.getElementById("mapContainer");
  const overlay = document.getElementById("sidebarOverlay");

  // Setup keyboard support for popups
  setupKeyboardPopupSupport();
  
  // Test landmark search functionality
  setTimeout(() => {
    testLandmarkSearch().then(success => {
      if (success) {
        console.log('✅ Landmark search test passed');
      } else {
        console.warn('⚠️ Landmark search test failed - landmarks may not be found');
      }
    });
  }, 2000); // Test after 2 seconds

  // Close buttons inside both sidebars
  const closeButtons = document.querySelectorAll('.close-btn');
  closeButtons.forEach(btn => btn.addEventListener('click', () => {
    sidebar.classList.remove('open');
    homeSidebar.classList.add('hidden');
    overlay.classList.remove('show');
    // Show hamburger icon only when no sidebars are visible
    document.getElementById("hamburger").classList.remove("hidden");
    // Remove sidebar-open class from map container
    document.getElementById("mapContainer").classList.remove("sidebar-open");
  }));

  hamburger.addEventListener("click", () => {
    if (mapContainer.style.display === "block") {
      sidebar.classList.toggle("open");
      overlay.classList.toggle('show', sidebar.classList.contains('open'));
      // Hide hamburger when map sidebar is open
      if (sidebar.classList.contains('open')) {
        hamburger.classList.add('hidden');
        document.getElementById("mapContainer").classList.add("sidebar-open");
      } else {
        hamburger.classList.remove('hidden');
        document.getElementById("mapContainer").classList.remove("sidebar-open");
      }
    } else {
      homeSidebar.classList.toggle("hidden");
      overlay.classList.toggle('show', !homeSidebar.classList.contains('hidden'));
      // Hide hamburger when home sidebar is open
      if (!homeSidebar.classList.contains('hidden')) {
        hamburger.classList.add('hidden');
      } else {
        hamburger.classList.remove('hidden');
      }
    }
  });

  // Clicking overlay closes any open sidebar
  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    homeSidebar.classList.add('hidden');
    overlay.classList.remove('show');
    // Show hamburger icon when sidebar is closed
    document.getElementById("hamburger").classList.remove("hidden");
    // Remove sidebar-open class from map container
    document.getElementById("mapContainer").classList.remove("sidebar-open");
  });
});

// Fill source with current location using Nominatim reverse geocoding
async function useCurrentLocationForSource() {
  try {
    if (!navigator.geolocation) {
      alert('Geolocation not supported on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      try {
        const res = await fetchWithTimeout(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`, { headers: { 'Accept': 'application/json' } }, 10000);
        const data = await res.json();
        const disp = data && (data.display_name || (data.address && (data.address.city || data.address.town || data.address.village)));
        document.getElementById('source').value = disp || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        // Center map and set a marker hint
        if (map) {
          map.setView([lat, lon], 13);
          L.marker([lat, lon]).addTo(map).bindPopup('Your current location').openPopup();
        }
      } catch (_) {
        document.getElementById('source').value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      }
    }, (err) => {
      console.error('geo error', err);
      alert('Unable to access your location. Please allow location permission.');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  } catch (e) {
    console.error(e);
  }
}

// Function to refresh the tourist info box with current data
function refreshTouristInfoBox() {
  try {
    const infoBox = document.getElementById('info-box');
    if (!infoBox) return;
    
    // Check if we have current tourist data
    if (window.currentTouristData) {
      const { distanceKm, emissions, vehicleType, modelYear, grouped, extraHtml } = window.currentTouristData;
      displayTouristRouteInfo({
        distanceKm,
        emissions,
        vehicleType,
        modelYear,
        grouped,
        extraHtml
      });
    }
  } catch (error) {
    console.warn('Error refreshing tourist info box:', error);
  }
}

// Function to update current tourist data for real-time sync
function updateCurrentTouristData(data) {
  window.currentTouristData = data;
}

// Function to handle marker clicks and highlight in info box
function handleMarkerClick(marker, placeId) {
  try {
    // Highlight the clicked item in the info box
    const infoBox = document.getElementById('info-box');
    if (infoBox) {
      // Remove previous highlights
      const prevHighlighted = infoBox.querySelectorAll('.highlighted');
      prevHighlighted.forEach(el => el.classList.remove('highlighted'));
      
      // Highlight the clicked item
      const listItem = infoBox.querySelector(`li[data-place-id="${placeId}"]`);
      if (listItem) {
        listItem.classList.add('highlighted');
        listItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    
    // Refresh the info box to ensure it's up to date
    refreshTouristInfoBox();
  } catch (error) {
    console.warn('Error handling marker click:', error);
  }
}

// Function to start periodic refresh of tourist info box
function startTouristInfoBoxRefresh() {
  // Clear any existing interval
  if (window.touristInfoBoxInterval) {
    clearInterval(window.touristInfoBoxInterval);
  }
  
  // Set up periodic refresh every 5 seconds
  window.touristInfoBoxInterval = setInterval(() => {
    if (window.currentTouristData) {
      refreshTouristInfoBox();
    }
  }, 5000);
}

// Function to stop periodic refresh
function stopTouristInfoBoxRefresh() {
  if (window.touristInfoBoxInterval) {
    clearInterval(window.touristInfoBoxInterval);
    window.touristInfoBoxInterval = null;
  }
}

// Function to cleanup tourist route resources
function cleanupTouristRoute() {
  stopTouristInfoBoxRefresh();
  window.currentTouristData = null;
  
  // Clear markers
  markerByPlaceId.forEach(marker => {
    try { map.removeLayer(marker); } catch(_) {}
  });
  markerByPlaceId.clear();
}

// Function to setup map popup management
function setupMapPopupManagement() {
  if (!map) return;
  
  // Close popups when map is clicked
  map.on('click', (e) => {
    // Only close if clicking on the map itself, not on markers
    if (e.originalEvent.target.classList.contains('leaflet-interactive') ||
        e.originalEvent.target.classList.contains('leaflet-map-pane')) {
      closeAllPopups();
    }
  });
  
  // Close popups when map is moved
  map.on('moveend', () => {
    closeAllPopups();
  });
  
  // Close popups when zooming
  map.on('zoomend', () => {
    closeAllPopups();
  });
  
  // Close popups when dragging starts
  map.on('dragstart', () => {
    closeAllPopups();
  });
}

// Function to handle keyboard interactions for popups
function setupKeyboardPopupSupport() {
  document.addEventListener('keydown', (e) => {
    // Escape key closes all popups
    if (e.key === 'Escape') {
      closeAllPopups();
    }
    
    // Tab key navigation support for popups
    if (e.key === 'Tab' && currentOpenPopup) {
      const popupElement = currentOpenPopup.getElement();
      if (popupElement) {
        const focusableElements = popupElement.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        
        if (focusableElements.length > 0) {
          if (e.shiftKey) {
            // Shift+Tab: focus previous element
            if (document.activeElement === focusableElements[0]) {
              e.preventDefault();
              focusableElements[focusableElements.length - 1].focus();
            }
          } else {
            // Tab: focus next element
            if (document.activeElement === focusableElements[focusableElements.length - 1]) {
              e.preventDefault();
              focusableElements[0].focus();
            }
          }
        }
      }
    }
  });
}

// Fallback landmark search using Nominatim when Overpass fails
async function fallbackLandmarkSearch(bbox) {
  console.log('Using fallback Nominatim search for landmarks...');
  const { south, west, north, east } = bbox;
  
  // Search queries for different types of landmarks
  const searchQueries = [
    'park', 'garden', 'museum', 'temple', 'church', 'mosque', 'hospital', 'school', 'university',
    'restaurant', 'cafe', 'hotel', 'shopping mall', 'market', 'bank', 'atm', 'fuel station',
    'charging station', 'lake', 'river', 'beach', 'forest', 'mountain', 'viewpoint', 'monument',
    'castle', 'fort', 'palace', 'ruins', 'cinema', 'theater', 'library', 'post office'
  ];
  
  const allPlaces = [];
  const centerLat = (south + north) / 2;
  const centerLon = (west + east) / 2;
  
  for (const query of searchQueries) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&viewbox=${west},${north},${east},${south}&bounded=1&limit=10`;
      const res = await fetchWithTimeout(url, {
        headers: { 'Accept': 'application/json' }
      }, 10000);
      
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          data.forEach(place => {
            if (place.lat && place.lon) {
              const category = determineCategoryFromNominatim(place, query);
              allPlaces.push({
                id: `nominatim/${place.place_id}`,
                lat: parseFloat(place.lat),
                lon: parseFloat(place.lon),
                name: place.display_name.split(',')[0] || place.display_name,
                tags: {
                  source: 'nominatim',
                  category: category,
                  display_name: place.display_name
                },
                category: category
              });
            }
          });
        }
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.warn(`Failed to search for "${query}":`, error.message);
      continue;
    }
  }
  
  // Remove duplicates and limit results
  const uniquePlaces = dedupeByLocation(allPlaces);
  console.log(`Fallback search found ${uniquePlaces.length} unique places`);
  return uniquePlaces;
}

// Determine category from Nominatim search results
function determineCategoryFromNominatim(place, query) {
  const displayName = place.display_name.toLowerCase();
  const placeType = place.type;
  
  // Map search queries to our categories
  if (query.includes('park') || query.includes('garden')) return 'parks';
  if (query.includes('museum')) return 'museums';
  if (query.includes('temple') || query.includes('church') || query.includes('mosque')) return 'temples';
  if (query.includes('hospital')) return 'hospitals';
  if (query.includes('restaurant')) return 'restaurants';
  if (query.includes('cafe')) return 'cafes';
  if (query.includes('hotel')) return 'hotels';
  if (query.includes('shopping') || query.includes('mall')) return 'malls';
  if (query.includes('market')) return 'markets';
  if (query.includes('bank') || query.includes('atm')) return 'atms';
  if (query.includes('fuel') || query.includes('station')) return 'fuel';
  if (query.includes('charging')) return 'ev';
  if (query.includes('lake') || query.includes('river')) return 'lakes';
  if (query.includes('beach')) return 'beaches';
  if (query.includes('forest') || query.includes('wood')) return 'forests';
  if (query.includes('mountain') || query.includes('peak')) return 'monuments';
  if (query.includes('castle') || query.includes('fort') || query.includes('palace')) return 'forts';
  if (query.includes('cinema') || query.includes('theater')) return 'cinemas';
  if (query.includes('library')) return 'museums';
  if (query.includes('monument')) return 'monuments';
  
  // Try to determine from place type and display name
  if (placeType === 'amenity') {
    if (displayName.includes('park')) return 'parks';
    if (displayName.includes('hospital')) return 'hospitals';
    if (displayName.includes('restaurant')) return 'restaurants';
    if (displayName.includes('cafe')) return 'cafes';
    if (displayName.includes('hotel')) return 'hotels';
    if (displayName.includes('school') || displayName.includes('university')) return 'museums';
  }
  
  if (placeType === 'tourism') {
    if (displayName.includes('museum')) return 'museums';
    if (displayName.includes('hotel')) return 'hotels';
    if (displayName.includes('attraction')) return 'monuments';
  }
  
  if (placeType === 'historic') {
    if (displayName.includes('castle')) return 'forts';
    if (displayName.includes('fort')) return 'forts';
    if (displayName.includes('palace')) return 'palaces';
    if (displayName.includes('monument')) return 'monuments';
  }
  
  if (placeType === 'leisure') {
    if (displayName.includes('park')) return 'parks';
    if (displayName.includes('garden')) return 'gardens';
  }
  
  if (placeType === 'natural') {
    if (displayName.includes('water')) return 'lakes';
    if (displayName.includes('wood') || displayName.includes('forest')) return 'forests';
    if (displayName.includes('beach')) return 'beaches';
  }
  
  // Default fallback
  return 'monuments';
}

// Test function to verify landmark search functionality
async function testLandmarkSearch() {
  console.log('Testing landmark search functionality...');
  
  // Test with a simple bbox around a known location (e.g., Delhi)
  const testBbox = {
    south: 28.4,
    west: 77.0,
    north: 28.8,
    east: 77.4
  };
  
  try {
    console.log('Testing fallback search...');
    const results = await fallbackLandmarkSearch(testBbox);
    console.log(`Fallback search test: Found ${results.length} landmarks`);
    
    if (results.length > 0) {
      console.log('Sample landmarks found:');
      results.slice(0, 5).forEach(place => {
        console.log(`- ${place.name} (${place.category}) at ${place.lat}, ${place.lon}`);
      });
    }
    
    return results.length > 0;
  } catch (error) {
    console.error('Landmark search test failed:', error);
    return false;
  }
}

// Function to order landmarks along the route from start to end
function orderLandmarksAlongRoute(landmarks, routeGeometry) {
  if (!landmarks || !landmarks.length || !routeGeometry) {
    return landmarks;
  }

  try {
    // Get route coordinates
    const routeCoords = routeGeometry.coordinates || [];
    if (routeCoords.length === 0) {
      console.warn('No route coordinates available for ordering');
      return landmarks;
    }

    // Calculate distance from start of route for each landmark
    const landmarksWithDistance = landmarks.map(landmark => {
      let minDistance = Infinity;
      let routeIndex = 0;

      // Find the closest point on the route for this landmark
      for (let i = 0; i < routeCoords.length; i++) {
        const routePoint = routeCoords[i];
        const distance = distancePointToPolylineMeters(
          landmark.lat, 
          landmark.lon, 
          [routePoint]
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          routeIndex = i;
        }
      }

      return {
        ...landmark,
        routeDistance: minDistance,
        routeIndex: routeIndex,
        routeProgress: i / (routeCoords.length - 1) // 0 = start, 1 = end
      };
    });

    // Sort by route progress (from start to end)
    landmarksWithDistance.sort((a, b) => {
      // Primary sort: route progress (start to end)
      if (Math.abs(a.routeProgress - b.routeProgress) > 0.1) {
        return a.routeProgress - b.routeProgress;
      }
      // Secondary sort: distance from route (closer landmarks first)
      return a.routeDistance - b.routeDistance;
    });

    console.log(`Ordered ${landmarksWithDistance.length} landmarks along route from start to end`);
    return landmarksWithDistance;
  } catch (error) {
    console.error('Error ordering landmarks along route:', error);
    return landmarks;
  }
}

// Enhanced function to find and order tourist places along the route
async function findAllTouristPlacesAlongRoute(routeGeometry, corridorMeters = 1200) {
  let allPlaces = await searchComprehensivePlaces(routeGeometry);
  if (!allPlaces.length) {
    console.log('Primary search returned no results, trying segmented search...');
    allPlaces = await searchComprehensivePlacesSegmented(routeGeometry);
  }
  
  if (!allPlaces.length) {
    console.warn('Both primary and segmented search failed, trying emergency fallback...');
    const emergencyBbox = computeBufferedBbox(routeGeometry, 0.1);
    allPlaces = await fallbackLandmarkSearch(emergencyBbox);
  }
  
  if (!allPlaces.length) {
    console.error('All search methods failed - no landmarks found');
    return { grouped: {}, flat: [] };
  }
  
  console.log(`Found ${allPlaces.length} total places before filtering`);
  
  // Filter places within corridor
  const withinCorridor = allPlaces.filter(p => {
    const d = distancePointToPolylineMeters(p.lat, p.lon, routeGeometry.coordinates);
    return d <= corridorMeters;
  });
  
  console.log(`${withinCorridor.length} places within ${corridorMeters}m corridor`);
  
  const deduped = dedupeByLocation(withinCorridor);
  const categorized = deduped.map(p => {
    const cat = determineCategory(p.tags);
    return { ...p, category: cat };
  }).filter(p => !!p.category);

  // Group and limit per category (increased for better coverage)
  const grouped = {};
  for (const key of Object.keys(TOURIST_CATEGORIES)) grouped[key] = [];
  
  for (const p of categorized) {
    const key = p.category;
    if (!grouped[key]) grouped[key] = [];
    if (grouped[key].length < 30) grouped[key].push(p); // Increased from 25 to 30
  }

  // Order landmarks within each category along the route
  Object.keys(grouped).forEach(key => {
    if (grouped[key].length > 0) {
      grouped[key] = orderLandmarksAlongRoute(grouped[key], routeGeometry);
    }
  });

  const flat = Object.values(grouped).flat();
  
  console.log(`Final result: ${flat.length} landmarks in ${Object.keys(grouped).filter(k => grouped[k].length > 0).length} categories, ordered along route`);
  return { grouped, flat };
}

// Enhanced popup management with better cursor interaction

// Function to close all open popups
function closeAllPopups() {
  if (currentOpenPopup) {
    try {
      currentOpenPopup.closePopup();
    } catch (_) {}
    currentOpenPopup = null;
  }
}

// Function to close popup after delay (for hover interactions)
function closePopupAfterDelay(popup, delay = 1500) {
  if (hoverTimeout) {
    clearTimeout(hoverTimeout);
  }
  hoverTimeout = setTimeout(() => {
    if (popup && popup.isOpen() && popup !== currentOpenPopup) {
      popup.closePopup();
    }
  }, delay);
}

// Function to handle popup open event
function onPopupOpen(popup) {
  closeAllPopups();
  currentOpenPopup = popup;
}

// Function to handle popup close event
function onPopupClose() {
  if (currentOpenPopup) {
    currentOpenPopup = null;
  }
}

// Enhanced marker hover and click handling
function setupMarkerInteraction(marker, place, category) {
  const cat = TOURIST_CATEGORIES[category];
  
  // Create enhanced popup content with route information
  const routeProgress = place.routeProgress || 0;
  const progressPercent = Math.round(routeProgress * 100);
  const distanceFromRoute = place.routeDistance ? Math.round(place.routeDistance) : '?';
  
  const popupContent = `
    <div class="tourist-popup">
      <div class="popup-header" style="border-bottom: 2px solid ${cat.color}; padding-bottom: 8px; margin-bottom: 12px;">
        <h4 style="margin: 0; color: ${cat.color}; font-size: 16px;">${cat.emoji} ${place.name}</h4>
        <div style="font-size: 12px; color: #666; margin-top: 4px;">${cat.label}</div>
      </div>
      <div class="popup-details">
        <div class="detail-row">
          <span class="detail-label">Route Progress:</span>
          <span class="detail-value">${progressPercent}% along route</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Distance from Route:</span>
          <span class="detail-value">${distanceFromRoute}m</span>
        </div>
        ${place.tags && place.tags.addr_full ? `
          <div class="detail-row">
            <span class="detail-label">Address:</span>
            <span class="detail-value">${place.tags.addr_full}</span>
          </div>
        ` : ''}
        ${place.tags && place.tags.phone ? `
          <div class="detail-row">
            <span class="detail-label">Phone:</span>
            <span class="detail-value">📞 ${place.tags.phone}</span>
          </div>
        ` : ''}
        ${place.tags && place.tags.website ? `
          <div class="detail-row">
            <span class="detail-label">Website:</span>
            <span class="detail-value">🌐 ${place.tags.website}</span>
          </div>
        ` : ''}
        ${place.tags && place.tags.opening_hours ? `
          <div class="detail-row">
            <span class="detail-label">Hours:</span>
            <span class="detail-value">🕒 ${place.tags.opening_hours}</span>
          </div>
        ` : ''}
      </div>
      <div class="popup-actions">
        <button class="primary-btn" onclick="navigateToLandmark(${place.lat}, ${place.lon})">📍 Navigate</button>
        <button class="secondary-btn" onclick="addToFavorites('${place.id}')">❤️ Save</button>
      </div>
    </div>
  `;

  // Bind popup with enhanced styling
  marker.bindPopup(popupContent, { 
    className: 'enhanced-popup',
    maxWidth: 300,
    minWidth: 250,
    closeButton: true,
    autoClose: false,
    closeOnClick: false
  });

  // Enhanced popup event handling
  marker.on('popupopen', () => onPopupOpen(marker.getPopup()));
  marker.on('popupclose', onPopupClose);

  // Enhanced hover interactions
  marker.on('mouseover', () => {
    lastHoveredMarker = marker;
    
    // Show popup on hover after a short delay
    setTimeout(() => {
      if (lastHoveredMarker === marker && !marker.isPopupOpen()) {
        marker.openPopup();
      }
    }, 300);
  });

  marker.on('mouseout', () => {
    if (lastHoveredMarker === marker) {
      lastHoveredMarker = null;
    }
    
    // Close popup after delay if not clicked
    if (marker.isPopupOpen() && marker.getPopup() !== currentOpenPopup) {
      closePopupAfterDelay(marker.getPopup(), 1000);
    }
  });

  // Enhanced click handling
  marker.on('click', () => {
    // Ensure popup stays open on click
    if (!marker.isPopupOpen()) {
      marker.openPopup();
    }
    
    // Highlight corresponding item in info box
    highlightInfoBoxItem(place.id);
  });

  return marker;
}

// Function to highlight corresponding item in info box
function highlightInfoBoxItem(placeId) {
  try {
    const infoBox = document.getElementById('info-box');
    if (!infoBox) return;
    
    // Remove previous highlights
    infoBox.querySelectorAll('.cat-list li').forEach(item => {
      item.classList.remove('highlighted');
    });
    
    // Find and highlight the corresponding item
    const listItem = infoBox.querySelector(`[data-place-id="${placeId}"]`);
    if (listItem) {
      listItem.classList.add('highlighted');
      listItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } catch (error) {
    console.error('Error highlighting info box item:', error);
  }
}

// Function to navigate to landmark (placeholder for future implementation)
function navigateToLandmark(lat, lng) {
  // This could open Google Maps, Apple Maps, or other navigation apps
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  window.open(url, '_blank');
}

// Function to add landmark to favorites (placeholder for future implementation)
function addToFavorites(placeId) {
  console.log('Adding to favorites:', placeId);
  // This could save to localStorage or send to backend
  alert('Favorite feature coming soon!');
}
