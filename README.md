# GreenRoute — Eco‑friendly Route Planner

A simple, full‑stack app to plan routes and estimate CO₂ emissions, with smart suggestions for greener travel.

- Frontend: `index.html` + `style.css` + `map.js` (Leaflet + OpenStreetMap + Mapbox Directions)
- Backend: `server.js` (Node.js + Express + MongoDB via Mongoose)

---

## 🇮🇳 தமிழ் (TA)

### திட்ட அறிமுகம்
GreenRoute உங்கள் பயண தூரத்தை வைத்து CO₂ வெளிப்பாட்டை கணக்கிட்டு, குறைந்த மாசு உருவாக்கும் முறைகளை பரிந்துரைக்கும். குறுகிய தூரங்களுக்கு நடந்து செல்ல/சைக்கிள், நடுத்தர தூரங்களுக்கு பஸ்/கார்‑பூலிங், நீண்ட தூரங்களுக்கு மின்சார வாகனம் போன்ற மாற்றுகளை உங்களுக்காக வரிசைப்படுத்தி காட்டும்.

### முக்கிய அம்சங்கள்
- **வரைபடம்**: Leaflet + OpenStreetMap
- **சுற்றுச்சூழல் கணக்கீடு**: வாகன வகை + வருடம் அடிப்படையில் CO₂/கிமீ
- **சர்வர் API**: பயண பரிந்துரை, வரலாறு சேமிப்பு, அண்மைய பயணங்கள்
- **UI**: ஹோம் + மேப், ஹாம்பர்கர் சைடு‑பார், லைட்/டார்க் தீம், கீபோர்டு ஷார்ட்கட்ஸ்

### தேவையானவை
- Node.js (v18+ பரிந்துரை)
- MongoDB (local: `mongodb://127.0.0.1:27017`)
- Mapbox Directions API டோக்கன் (இலவச கணக்கு போதுமானது)

### எப்படி இயக்குவது
1) Backend
```bash
npm install
npm start
# Server: http://localhost:5000
```
2) Frontend
- `index.html`‑ஐ நேரடியாக browser‑ல் திறக்கலாம், அல்லது VS Code Live Server போன்றவற்றில் serve செய்யலாம்.

### கட்டாய அமைப்புகள்
- `map.js`‑ல் Mapbox access token இரு இடங்களில் உள்ளது. உங்கள் டோக்கனை பதிலிடுங்கள்:
  - `map.js` → `access_token=...` (driving‑traffic URL) — 2 இடங்கள்
- Backend port இயல்பு 5000. `map.js`‑இல் vehicle suggestion fetch தற்போது `http://localhost:3000/suggest` ஆக உள்ளது. இரண்டு வழிகள்:
  - `map.js`‑இல் `3000`‑ஐ `5000` ஆக மாற்றவும்; அல்லது
  - Backend‑ஐ 3000‑ல் ஓட்டவும் (PORT மாற்றம் தேவையானால் `server.js`‑ஐ திருத்தவும்)

### கீபோர்டு ஷார்ட்கட்ஸ்
- `H`: Home menu
- `M`: Map
- `/`: Source field focus

### பொதுவான பிரச்சினைகள்
- MongoDB ஓடவில்லை → `npm start` லாகில் "MongoDB connected" வரவில்லை
- Mapbox டோக்கன் தவறு → பாதை வரையப்படாது / API error
- CORS/Port mismatch → frontend fetch 5000‑க்கு செல்லும் படி உறுதிசெய்க
- Nominatim rate‑limit → பல தடவைகள் முயற்சி செய்தால் சிறிது நேரம் காத்திருந்து முயலவும்

---

## 🇬🇧 English (EN)

### Overview
GreenRoute estimates CO₂ emissions for your trip and suggests greener alternatives based on distance, vehicle type, and simple speed assumptions.

### Features
- **Map**: Leaflet + OpenStreetMap, Mapbox Directions for routing
- **Emission calc**: grams per km by vehicle type, adjusted by vehicle year
- **APIs**: Suggest best mode, save trips, fetch recent trips
- **UX**: Home + Map views, sidebar, dark mode, keyboard shortcuts

### Stack
- Frontend: HTML/CSS/JS, Leaflet, OSM, Nominatim Geocoding, Mapbox Directions
- Backend: Node.js, Express, CORS, Mongoose/MongoDB

### Prerequisites
- Node.js 18+
- MongoDB running locally on `mongodb://127.0.0.1:27017`
- Mapbox Directions API access token

### Run
Backend:
```bash
npm install
npm start
# http://localhost:5000
```
Frontend:
- Open `index.html` directly in a browser or via a static server (e.g., Live Server).

### Configuration
- Mapbox token: replace both occurrences of `access_token=...` in `map.js`.
- Ports: backend uses `5000` by default. In `map.js`, the suggestion call is:
```js
fetch("http://localhost:3000/suggest", { ... })
```
Change `3000` → `5000` to match the backend, or update `server.js` to listen on `3000`.
- MongoDB DB name: `ecoFindDB` in `server.js`. Change if needed.

### API Reference
- POST `/suggest`
  - Body: `{ "distanceKm": number }`
  - Response: `{ best: { type, emission, time }, alternatives: Array<{ type, emission, time }> }`
- POST `/save-route`
  - Body: `{ source, destination, vehicleType, vehicleYear, distance, emissions }`
  - Response: `{ message, data }`
- GET `/recent-routes?limit=10`
  - Response: `{ items: Array<RouteData> }`

### Data Model (`server.js`)
```js
{
  source: String,
  destination: String,
  vehicleType: String,
  vehicleYear: Number,
  distance: Number,
  emissions: Number,
  date: Date
}
```

### Emission logic (`map.js`/`server.js`)
- Base emission rates (g/km) for: petrol, diesel, electric, bike, bus, truck, electric_truck, walking, cycling
- Time = distance / averageSpeed (km/h)
- Vehicle year adjustment: older vehicles emit more (+1.5% per year)

### Keyboard Shortcuts
- `H` opens the Home menu
- `M` switches to Map
- `/` focuses the Source input

### Example requests
```bash
# Suggest best mode
curl -X POST http://localhost:5000/suggest \
  -H "Content-Type: application/json" \
  -d '{"distanceKm": 12.5}'

# Save a route
curl -X POST http://localhost:5000/save-route \
  -H "Content-Type: application/json" \
  -d '{
    "source":"A", "destination":"B",
    "vehicleType":"petrol", "vehicleYear":2018,
    "distance":12.5, "emissions": 2400
  }'

# Recent routes
curl http://localhost:5000/recent-routes?limit=5
```

### Notes on third‑party services
- Geocoding uses Nominatim (be mindful of rate limits and usage policy)
- Routing uses Mapbox Directions API (supply your own token)

### License
ISC (see `package.json`).

### Acknowledgements
- OpenStreetMap contributors, Leaflet, Mapbox, MongoDB, Express

---

Happy green driving! 🌿
