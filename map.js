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
  const points = sampleRoutePoints(routeGeometry, 6);
  if (!points.length) return { grouped: {}, flat: [], enhanced: false };
  const [primary, secondary] = getTomTomKeyPair();
  const keyToUse = primary || secondary;
  if (!keyToUse) return { grouped: {}, flat: [], enhanced: false };

  // Limit categories to avoid hitting daily limits; skip categories already saturated from OSM
  const categoryKeys = Object.keys(TOMTOM_CATEGORY_MAP).filter(key => {
    const arr = existingGrouped && existingGrouped[key];
    return !arr || arr.length < 15;
  });

  // If EV, ensure we include charging stations first
  const orderedCats = vehicleType === 'electric'
    ? ['ev', ...categoryKeys.filter(k => k !== 'ev')]
    : categoryKeys;

  const aggregate = [];
  let anySuccess = false;
  for (const p of points) {
    for (const cat of orderedCats) {
      // soft cap to keep requests in check
      if (aggregate.length > 500) break;
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
    if (grouped[key].length < 15) grouped[key].push(place);
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
function computeBufferedBbox(routeGeometry, bufferDeg = 0.05) {
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
    [out:json][timeout:15];
    (
      node["leisure"~"park|garden|nature_reserve"](${south},${west},${north},${east});
      way["leisure"~"park|garden|nature_reserve"](${south},${west},${north},${east});
      relation["leisure"~"park|garden|nature_reserve"](${south},${west},${north},${east});

      node["natural"~"beach|water"](${south},${west},${north},${east});
      way["natural"~"beach|water"](${south},${west},${north},${east});
      relation["natural"~"beach|water"](${south},${west},${north},${east});

      node["waterway"="river"](${south},${west},${north},${east});
      way["waterway"="river"](${south},${west},${north},${east});
      relation["waterway"="river"](${south},${west},${north},${east});

      node["tourism"~"monument|museum|attraction|hotel"](${south},${west},${north},${east});
      way["tourism"~"monument|museum|attraction|hotel"](${south},${west},${north},${east});
      relation["tourism"~"monument|museum|attraction|hotel"](${south},${west},${north},${east});

      node["amenity"~"charging_station|fuel|hospital|atm|toilets|restaurant|cafe|cinema|marketplace"](${south},${west},${north},${east});
      way["amenity"~"charging_station|fuel|hospital|atm|toilets|restaurant|cafe|cinema|marketplace"](${south},${west},${north},${east});
      relation["amenity"~"charging_station|fuel|hospital|atm|toilets|restaurant|cafe|cinema|marketplace"](${south},${west},${north},${east});

      node["historic"~"palace|castle|fort|monument"](${south},${west},${north},${east});
      way["historic"~"palace|castle|fort|monument"](${south},${west},${north},${east});
      relation["historic"~"palace|castle|fort|monument"](${south},${west},${north},${east});

      node["natural"~"wood|forest"](${south},${west},${north},${east});
      way["natural"~"wood|forest"](${south},${west},${north},${east});
      relation["natural"~"wood|forest"](${south},${west},${north},${east});

      node["shop"~"mall|supermarket"](${south},${west},${north},${east});
      way["shop"~"mall|supermarket"](${south},${west},${north},${east});
      relation["shop"~"mall|supermarket"](${south},${west},${north},${east});
    );
    out center 120;
  `;
}

// Call Overpass API and return normalized elements
async function searchComprehensivePlaces(routeGeometry) {
  try {
    const bbox = computeBufferedBbox(routeGeometry, 0.03);
    const query = buildOverpassQuery(bbox);
    let data;
    try {
      const res = await fetchWithTimeout('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: new URLSearchParams({ data: query })
      }, 20000);
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      data = await res.json();
    } catch (e1) {
      console.warn('Primary Overpass failed, trying mirror...');
      const res2 = await fetchWithTimeout('https://overpass.kumi.systems/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: new URLSearchParams({ data: query })
      }, 20000);
      if (!res2.ok) throw new Error(`Overpass Mirror HTTP ${res2.status}`);
      data = await res2.json();
    }
    if (!data.elements) return [];
    const elements = data.elements
      .map(el => {
        const lat = el.lat || (el.center && el.center.lat);
        const lon = el.lon || (el.center && el.center.lon);
        const tags = el.tags || {};
        if (lat == null || lon == null) return null;
        return { id: `${el.type}/${el.id}`, lat, lon, tags, name: getPlaceName(tags) };
      })
      .filter(Boolean);
    return elements;
  } catch (e) {
    console.error('Overpass error:', e);
    return [];
  }
}

// Fallback: segment the route and query smaller windows to capture near-route POIs
async function searchComprehensivePlacesSegmented(routeGeometry) {
  const coords = routeGeometry.coordinates; // [lon,lat]
  if (!coords || coords.length === 0) return [];

  // Sample up to 12 evenly spaced points along the route
  const maxSamples = 12;
  const step = Math.max(1, Math.floor(coords.length / maxSamples));
  const samples = [];
  for (let i = 0; i < coords.length; i += step) samples.push(coords[i]);
  if (samples[samples.length - 1] !== coords[coords.length - 1]) samples.push(coords[coords.length - 1]);

  const aggregate = [];
  for (let i = 0; i < samples.length; i++) {
    const [lon, lat] = samples[i];
    // Small bbox around sample point
    const bbox = { south: lat - 0.02, west: lon - 0.02, north: lat + 0.02, east: lon + 0.02 };
    const query = buildOverpassQuery(bbox);
    try {
      const res = await fetchWithTimeout('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: new URLSearchParams({ data: query })
      }, 15000);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.elements)) {
          for (const el of data.elements) {
            const latEl = el.lat || (el.center && el.center.lat);
            const lonEl = el.lon || (el.center && el.center.lon);
            const tags = el.tags || {};
            if (latEl == null || lonEl == null) continue;
            aggregate.push({ id: `${el.type}/${el.id}`, lat: latEl, lon: lonEl, tags, name: getPlaceName(tags) });
          }
        }
      }
    } catch (e) {
      // try mirror quickly for this segment
      try {
        const res2 = await fetchWithTimeout('https://overpass.kumi.systems/api/interpreter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: new URLSearchParams({ data: query })
        }, 15000);
        if (res2.ok) {
          const data2 = await res2.json();
          if (data2 && Array.isArray(data2.elements)) {
            for (const el of data2.elements) {
              const latEl = el.lat || (el.center && el.center.lat);
              const lonEl = el.lon || (el.center && el.center.lon);
              const tags = el.tags || {};
              if (latEl == null || lonEl == null) continue;
              aggregate.push({ id: `${el.type}/${el.id}`, lat: latEl, lon: lonEl, tags, name: getPlaceName(tags) });
            }
          }
        }
      } catch (_) {}
    }
    // Soft cap to avoid overload
    if (aggregate.length > 600) break;
  }
  return aggregate;
}

// Filter all places to those along the route and categorize
async function findAllTouristPlacesAlongRoute(routeGeometry, corridorMeters = 1000) {
  let allPlaces = await searchComprehensivePlaces(routeGeometry);
  if (!allPlaces.length) {
    // Fallback to segmented strategy when bbox query returns empty or is rate-limited
    allPlaces = await searchComprehensivePlacesSegmented(routeGeometry);
  }
  if (!allPlaces.length) return { grouped: {}, flat: [] };
  const withinCorridor = allPlaces.filter(p => {
    const d = distancePointToPolylineMeters(p.lat, p.lon, routeGeometry.coordinates);
    return d <= corridorMeters;
  });
  const deduped = dedupeByLocation(withinCorridor);
  const categorized = deduped.map(p => {
    const cat = determineCategory(p.tags);
    return { ...p, category: cat };
  }).filter(p => !!p.category);

  // Group and limit per category
  const grouped = {};
  for (const key of Object.keys(TOURIST_CATEGORIES)) grouped[key] = [];
  for (const p of categorized) {
    const key = p.category;
    if (!grouped[key]) grouped[key] = [];
    if (grouped[key].length < 15) grouped[key].push(p);
  }
  const flat = Object.values(grouped).flat();
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
  const vehicleYear = parseInt(document.getElementById("vehicleYear").value);

  if (!sourceText || !destText) {
    document.getElementById("info-box").innerText = "---";
    alert("Please enter both source and destination.");
    return;
  }

  if (!vehicleYear || vehicleYear < 1980 || vehicleYear > new Date().getFullYear()) {
    alert("Please enter a valid vehicle make year.");
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
  // Remove all previous route layers
  routeLayers.forEach(layer => map.removeLayer(layer));
  routeLayers = [];

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
  const adjustedRate = adjustEmissionRate(emissionRates[vehicleType], vehicleYear);
  const emissions = (distance * adjustedRate).toFixed(2);

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
      vehicleYear,
      distance: parseFloat(distance),
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
    <strong>Distance:</strong> ${distance} km<br>
    <strong>${vehicleType.toUpperCase()} (${vehicleYear}) Emissions:</strong> ${emissions} g CO₂
  `;

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
}

// Enhanced tourist route function: comprehensive attractions along the route
async function findTouristRoute() {
  const sourceText = document.getElementById("source").value.trim();
  const destText = document.getElementById("destination").value.trim();
  const vehicleType = document.getElementById("vehicleType").value;
  const vehicleYear = parseInt(document.getElementById("vehicleYear").value);

  if (!sourceText || !destText) {
    document.getElementById("info-box").innerText = "---";
    alert("Please enter both source and destination.");
    return;
  }

  if (!vehicleYear || vehicleYear < 1980 || vehicleYear > new Date().getFullYear()) {
    alert("Please enter a valid vehicle make year.");
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
  const adjustedRate = adjustEmissionRate(emissionRates[vehicleType], vehicleYear);
  const emissions = (distanceKm * adjustedRate).toFixed(2);

  // Draw the main route
  const mainRouteLayer = L.geoJSON(mainRoute.geometry, {
    style: { color: "#16a34a", weight: 6, opacity: 0.85 }
  }).addTo(map);
  routeLayers.push(mainRouteLayer);

  // Traffic + Weather for tourist flow
  try { await ensureApiKeyRoles(); } catch(_) {}
  try { addTrafficTileOverlays(); } catch(_) {}
  let tSummary = null; let wPoints = [];
  try { tSummary = await fetchTrafficSummary(mainRoute.geometry); } catch(_) {}
  try { wPoints = await fetchWeatherAlongRoute(mainRoute.geometry); } catch(_) {}
  lastTrafficWeatherHtml = buildTrafficWeatherSnippet(tSummary, wPoints);
  // Replace with segment-by-segment coloring for tourist flow
  try { await colorizeRouteByTraffic(mainRoute.geometry, mainRouteLayer); } catch(_) {}

  // Loading state
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
      </div>
    </div>
  `;

  // Find comprehensive places along the route from OSM
  const { grouped: osmGrouped, flat: osmFlat } = await findAllTouristPlacesAlongRoute(mainRoute.geometry, 1500);

  // Fetch supplemental POIs from TomTom and merge
  let mergedGrouped = {};
  let mergedFlat = [];
  try {
    const tom = await fetchTomTomPOIs(mainRoute.geometry, vehicleType, osmGrouped);
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
        // dedupe and cap
        mergedGrouped[key] = dedupeByLocation(mergedGrouped[key]).slice(0, 15);
      }
    }
    mergedFlat = Object.values(mergedGrouped).flat();
  } catch (_) {
    lastTouristDataEnhanced = false;
    mergedGrouped = osmGrouped;
    mergedFlat = osmFlat || [];
  }

  // Display markers
  displayTouristAttractions(mergedGrouped);

  // Save summary to backend (optional, keeps existing save behavior consistent)
  try {
  fetch("http://localhost:5000/save-route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: sourceText,
      destination: destText,
      vehicleType,
      vehicleYear,
        distance: parseFloat(distanceKm),
        emissions: parseFloat(emissions),
        routeSource: lastTouristDataEnhanced ? 'TomTom+OSM' : 'OSM'
      })
    }).catch(() => {});
  } catch (_) {}

  // Info panel
  if (!mergedFlat || mergedFlat.length === 0) {
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
            <div><strong>${vehicleType.toUpperCase()} (${vehicleYear}) CO₂:</strong> ${emissions} g</div>
          </div>
          <div style="color:#e6fff4">No attractions found within ~1 km of this route currently. Overpass may be rate-limited; try again shortly.</div>
        </div>
      </div>
    `;
  } else {
    // Append traffic/weather snippet if available
    const addon = lastTrafficWeatherHtml || '';
    displayTouristRouteInfo({
      distanceKm,
      emissions,
      vehicleType,
      vehicleYear,
      grouped: mergedGrouped,
      extraHtml: addon
    });
  }

  // Best effort: refresh recent list
  try { if (typeof loadRecent === 'function') loadRecent(); } catch (_) {}
}

// Place markers on the map with category-specific styling
function displayTouristAttractions(grouped) {
  Object.keys(grouped).forEach(key => {
    const cat = TOURIST_CATEGORIES[key];
    const places = grouped[key] || [];
    places.forEach(async p => {
      const marker = L.marker([p.lat, p.lon], { icon: buildTouristDivIcon(key) }).addTo(map);
      markerByPlaceId.set(p.id || `${p.lat},${p.lon}`, marker);
      const name = p.name || 'Unnamed';
      const details = [];
      if (p.tags.addr_full) details.push(p.tags.addr_full);
      if (p.tags.opening_hours) details.push(`Hours: ${p.tags.opening_hours}`);
      if (p.tags.phone) details.push(`☎ ${p.tags.phone}`);
      if (p.tags.website) details.push(`<a href="${p.tags.website}" target="_blank">Website</a>`);
      const osmUrl = `https://www.openstreetmap.org/${p.id}`;
      // Try fetch an image
      let imgUrl = null;
      try { imgUrl = await fetchPlaceImage(p); } catch(_) {}
      const popupHtml = buildPlacePopupHtml(cat, name, details, osmUrl, p.lat, p.lon, imgUrl);
      marker.bindPopup(popupHtml, { maxWidth: 280 });
      routeLayers.push(marker);
    });
  });
}

// Render the info panel with categorized counts and lists
function displayTouristRouteInfo({ distanceKm, emissions, vehicleType, vehicleYear, grouped, extraHtml }) {
  let html = `
    <div class="tourist-info-panel">
      <div class="summary">
        <div><strong>Distance:</strong> ${distanceKm} km</div>
        <div><strong>${vehicleType.toUpperCase()} (${vehicleYear}) CO₂:</strong> ${emissions} g</div>
        ${lastTouristDataEnhanced ? '<div><small>Enhanced with TomTom data</small></div>' : '<div><small>Data from OSM</small></div>'}
        ${extraHtml ? `<div>${extraHtml}</div>` : ''}
    </div>
      <div class="categories">
  `;

  Object.keys(TOURIST_CATEGORIES).forEach(key => {
    const cat = TOURIST_CATEGORIES[key];
    const items = (grouped[key] || []).slice(0, 6);
    const count = grouped[key] ? grouped[key].length : 0;
    if (count === 0) return; // skip empty
    html += `
      <div class="cat-section">
        <div class="cat-header"><span class="chip" style="background:${cat.color}22; color:${cat.color}">${cat.emoji}</span>${cat.label} <span class="count">${count}</span></div>
        <ul class="cat-list">
          ${items.map(p => `<li title="${p.name}" data-place-id="${p.id}">${p.name}</li>`).join('')}
        </ul>
      </div>
    `;
  });

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

  // Attach click handlers for list items to pan/zoom and open popup
  try {
    const list = box.querySelectorAll('.cat-list li[data-place-id]');
    list.forEach(li => {
      li.addEventListener('click', () => {
        const pid = li.getAttribute('data-place-id');
        const marker = markerByPlaceId.get(pid);
        if (marker && map) {
          const latlng = marker.getLatLng();
          map.setView(latlng, Math.max(map.getZoom(), 16));
          try { marker.openPopup(); } catch(_) {}
        }
      });
    });
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
    return uniquePlaces.slice(0, 15); // Return max 15 places
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
