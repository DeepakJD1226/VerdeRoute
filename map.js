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
}

function showMap() {
  document.getElementById('homeScreen').style.display = 'none';
  document.getElementById('mapContainer').style.display = 'block';
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("homeSidebar").classList.add("hidden");

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
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.length > 0 ? [parseFloat(data[0].lat), parseFloat(data[0].lon)] : null;
}

async function getVehicleSuggestion(distance) {
  try {
    const res = await fetch("http://localhost:3000/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ distanceKm: parseFloat(distance) })
    });
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

  const sourceCoords = await geocode(sourceText);
  const destCoords = await geocode(destText);

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
  const res = await fetch(routeURL);
  let data = await res.json();

  // Fallback: if Mapbox gives only 1 route, force an alternate
  if (!data.routes || data.routes.length === 1) {
    console.warn("Only one route found — forcing alternate calculation...");
    const nudgedDest = [destCoords[0] + 0.002, destCoords[1] + 0.002]; // ~200m offset
    const altURL = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${sourceCoords[1]},${sourceCoords[0]};${nudgedDest[1]},${nudgedDest[0]}?geometries=geojson&overview=full&access_token=pk.eyJ1IjoiamQxMjA2IiwiYSI6ImNtZGJxZGE0MzBuZXgycXIyaHZlNHhjMjkifQ.fhXRKJLNhYo5xB992ZIbVg`;
    const altRes = await fetch(altURL);
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
      ecoTip // Save tip as well
    })
  })
    .then(res => res.json())
    .then(data => console.log(" Saved to MongoDB:", data))
    .catch(err => console.error(" Save error:", err));

  // Draw main route
  const mainRouteLayer = L.geoJSON(mainRoute.geometry, {
    style: { color: "green", weight: 5 }
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

  document.getElementById("info-box").innerHTML = infoHTML;
}



document.addEventListener("DOMContentLoaded", () => {
  const hamburger = document.getElementById("hamburger");
  const sidebar = document.getElementById("sidebar");
  const homeSidebar = document.getElementById("homeSidebar");
  const mapContainer = document.getElementById("mapContainer");

  hamburger.addEventListener("click", () => {
    if (mapContainer.style.display === "block") {
      sidebar.classList.toggle("open");
    } else {
      homeSidebar.classList.toggle("hidden");
    }
  });
});
