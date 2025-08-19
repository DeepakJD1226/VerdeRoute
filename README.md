# GreenRoute — Eco‑friendly Route Planner

A simple full‑stack app to plan routes and estimate CO₂ emissions, with smart suggestions for greener travel.

- Frontend: `index.html` + `style.css` + `map.js` (Leaflet + OpenStreetMap + Mapbox Directions)
- Backend: `server.js` (Node.js + Express + MongoDB via Mongoose)

---

## Overview
GreenRoute estimates CO₂ emissions for a trip and suggests greener alternatives based on distance, vehicle type, and average speed assumptions. It stores past trips and displays recent history on the home screen.

## Features
- Map with Leaflet + OpenStreetMap tiles
- Routing via Mapbox Directions API (main + alternate routes)
- Emission calculation by vehicle type, adjusted by vehicle year
- Suggestions API for best mode (emissions + time)
- Save routes to MongoDB and list recent routes
- Home/Map views, sidebar UI, dark mode, keyboard shortcuts

## Tech Stack
- Frontend: HTML, CSS, JavaScript, Leaflet, Nominatim (geocoding), Mapbox Directions
- Backend: Node.js, Express, CORS, Mongoose/MongoDB

## Prerequisites
- Node.js 18+
- MongoDB running locally on `mongodb://127.0.0.1:27017`
- Mapbox Directions API access token

## Quick Start
Backend:
```bash
npm install
npm start
# Backend runs at http://localhost:5000
```
Frontend:
- Open `index.html` directly in your browser, or serve statically (e.g., VS Code Live Server).

## Configuration
- Mapbox token: replace both occurrences of `access_token=...` in `map.js` (two URLs).
- Port alignment: backend defaults to `5000`. In `map.js`, the suggestions call is:
```js
fetch("http://localhost:3000/suggest", { ... })
```
Change `3000` to `5000` to match the backend, or update `server.js` to listen on port `3000`.
- Database name: `ecoFindDB` in `server.js`. Adjust if you prefer a different DB name.

## Keyboard Shortcuts
- `H` — open Home menu
- `M` — switch to Map view
- `/` — focus the Source input

## API Reference
- POST `/suggest`
  - Body: `{ "distanceKm": number }`
  - Returns: `{ best: { type, emission, time }, alternatives: Array<{ type, emission, time }> }`
- POST `/save-route`
  - Body: `{ source, destination, vehicleType, vehicleYear, distance, emissions }`
  - Returns: `{ message, data }`
- GET `/recent-routes?limit=10`
  - Returns: `{ items: Array<RouteData> }`

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

## How Emissions Are Calculated
- Base emission rates (g/km) for these types: `petrol`, `diesel`, `electric`, `bike`, `bus`, `truck`, `electric_truck`, `walking`, `cycling`
- Time estimate = distance / averageSpeed (km/h)
- Vehicle year adjustment: older vehicles emit more (+1.5% per year older)

## Example Requests
```bash
# Suggest the best mode
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

## Troubleshooting
- MongoDB not connected: ensure MongoDB is running; look for "MongoDB connected" in server logs
- Mapbox token error: routes won’t render; replace the token in `map.js`
- CORS/port mismatch: align the frontend fetch URL with the backend port (5000 by default)
- Nominatim rate limit: if geocoding fails repeatedly, wait a bit and retry

## Notes on Third‑party Services
- Geocoding via Nominatim (respect usage policy and rate limits)
- Routing via Mapbox Directions (requires a valid access token)

## License
ISC (see `package.json`).

## Acknowledgements
OpenStreetMap contributors, Leaflet, Mapbox, MongoDB, Express

---

Happy green driving! 🌿
