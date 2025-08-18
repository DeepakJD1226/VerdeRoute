const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// ==== MONGODB CONNECTION ====
// Replace "ecoFindDB" with your preferred DB name
mongoose.connect("mongodb://127.0.0.1:27017/ecoFindDB", {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("MongoDB connected"))
.catch(err => console.error("MongoDB connection error:", err));

// ==== SCHEMA & MODEL ====
const routeSchema = new mongoose.Schema({
  source: String,
  destination: String,
  vehicleType: String,
  vehicleYear: Number,
  distance: Number,
  emissions: Number,
  date: { type: Date, default: Date.now }
});

const RouteData = mongoose.model("RouteData", routeSchema);

// ==== EMISSION RATES & SPEEDS ====
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

// ==== ROUTE SUGGESTION ====
app.post('/suggest', (req, res) => {
  const { distanceKm } = req.body;
  if (!distanceKm) {
    return res.status(400).json({ error: 'Missing distanceKm' });
  }

  const suggestions = Object.keys(emissionRates).map(type => {
    const emission = (distanceKm * emissionRates[type]).toFixed(2);
    const time = (distanceKm / averageSpeeds[type]).toFixed(2);
    return { type, emission: parseFloat(emission), time };
  });

  suggestions.sort((a, b) => a.emission - b.emission);
  const best = suggestions[0];
  const alternatives = suggestions.slice(1);

  res.json({ best, alternatives });
});

// ==== SAVE ROUTE TO MONGODB ====
app.post("/save-route", async (req, res) => {
  try {
    const { source, destination, vehicleType, vehicleYear, distance, emissions } = req.body;

    if (!source || !destination || !vehicleType || !vehicleYear || !distance || emissions === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const newRoute = new RouteData({
      source,
      destination,
      vehicleType,
      vehicleYear,
      distance,
      emissions
    });

    const savedRoute = await newRoute.save();
    res.json({ message: "Route saved successfully", data: savedRoute });
  } catch (err) {
    console.error(" Save route error:", err);
    res.status(500).json({ error: "Failed to save route" });
  }
});

// ==== ROOT ====
app.get('/', (req, res) => {
  res.send('GreenRoute backend is running');
});

// ==== START SERVER ====
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
