/*
  Vehicle Emission Calculator (UMD)

  Exports:
    - estimateEmissions(inputs, overrides?) -> { totalEmissionsGramsCO2, breakdown }
    - createCalculator(overrides?) -> { estimate(inputs) }

  Inputs object (all strings are case-insensitive):
    - vehicleType: 'car' | 'bike' | 'bus' | 'truck' | 'electric' | 'hybrid' | ...
    - fuelType: 'petrol' | 'diesel' | 'cng' | 'electric' | 'hybrid' | 'lpg' | 'ethanol' | ...
    - distance: number
    - distanceUnit?: 'km' | 'mile' (default: 'km')
    - routeType?: 'city' | 'highway' (default: 'city')
    - traffic?: 'normal' | 'stop_and_go' | 'light' (default: 'normal')
    - modelYear?: number
    - vehicleAgeYears?: number (if both provided, ageYears wins)
    - loadFactor?: number (1.0 means baseline load; >1 increases consumption)
    - engineSizeLiters?: number (optional, used to gently scale fuel use)
    - electricitySource?: 'grid_avg' | 'coal' | 'gas' | 'hydro' | 'wind' | 'solar' | 'nuclear' (default: 'grid_avg')
    - claimedEfficiency?: number (e.g., 6.5)
    - claimedEfficiencyUnit?:
        'l_per_100km' | 'km_per_liter' | 'mpg' | 'kwh_per_100km' | 'wh_per_km' | 'kg_per_100km'

  Notes:
    - For liquid fuels, consumption is in liters per 100 km.
    - For CNG, consumption is in kg per 100 km.
    - For electric, consumption is in kWh per 100 km.
*/

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EmissionCalculator = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Default configuration values and factors.
   */
  const DEFAULTS = {
    // Emission factors in kg CO2 per unit of fuel/energy
    fuelEmissionFactorsKgPerUnit: {
      petrol: 2.31, // kg CO2 / liter
      gasoline: 2.31,
      diesel: 2.68, // kg CO2 / liter
      lpg: 1.51, // kg CO2 / liter
      ethanol: 1.50, // very rough tank-to-wheel; lifecycle varies widely
      cng: 2.75, // kg CO2 / kg
      // electric handled via electricityEmissionFactorsKgPerKwh
    },

    // Emission factors for electricity generation in kg CO2 per kWh
    electricityEmissionFactorsKgPerKwh: {
      grid_avg: 0.45,
      coal: 0.82,
      gas: 0.45,
      hydro: 0.02,
      wind: 0.012,
      solar: 0.045,
      nuclear: 0.012,
    },

    // Baseline consumption by vehicle/fuel type
    // Units:
    //  - l_per_100km for liquid fuels (petrol, diesel, lpg, ethanol)
    //  - kg_per_100km for CNG
    //  - kwh_per_100km for electric
    baseConsumptionPer100Km: {
      car: {
        petrol: { unit: 'l_per_100km', value: 7.5 },
        gasoline: { unit: 'l_per_100km', value: 7.5 },
        diesel: { unit: 'l_per_100km', value: 6.0 },
        cng: { unit: 'kg_per_100km', value: 5.0 },
        lpg: { unit: 'l_per_100km', value: 9.0 },
        hybrid: { unit: 'l_per_100km', value: 4.0 },
        electric: { unit: 'kwh_per_100km', value: 17 },
      },
      bike: {
        petrol: { unit: 'l_per_100km', value: 3.0 },
        gasoline: { unit: 'l_per_100km', value: 3.0 },
        electric: { unit: 'kwh_per_100km', value: 5.0 }, // e-motorcycle
      },
      bus: {
        diesel: { unit: 'l_per_100km', value: 30 },
        cng: { unit: 'kg_per_100km', value: 28 },
        electric: { unit: 'kwh_per_100km', value: 120 },
      },
      truck: {
        diesel: { unit: 'l_per_100km', value: 35 },
        cng: { unit: 'kg_per_100km', value: 30 },
        electric: { unit: 'kwh_per_100km', value: 150 },
      },
      electric: {
        electric: { unit: 'kwh_per_100km', value: 17 },
      },
      hybrid: {
        hybrid: { unit: 'l_per_100km', value: 4.0 },
      },
    },

    // Adjustment settings
    adjustments: {
      // Per-year degradation in efficiency (positive means more consumption)
      ageDegradationRatePerYear: 0.005, // +0.5% per year
      ageDegradationMax: 0.30, // clamp at +30%

      // Engine size influence (liters). Relative to a nominal 2.0L for cars, 12.0L trucks, etc.
      engineSizeInfluence: {
        car: { nominalLiters: 2.0, effectPerDeltaLiter: 0.05 }, // +5% per +1.0L delta
        bike: { nominalLiters: 0.25, effectPerDeltaLiter: 0.10 },
        bus: { nominalLiters: 10.0, effectPerDeltaLiter: 0.02 },
        truck: { nominalLiters: 12.0, effectPerDeltaLiter: 0.02 },
      },

      // Route and traffic multipliers
      routeTypeMultipliers: {
        city: 1.15,
        highway: 0.90,
      },
      trafficMultipliers: {
        normal: 1.0,
        stop_and_go: 1.30,
        light: 0.90,
      },

      // Load factor handling
      // For heavy vehicles, each +100% load increases consumption by ~40% (clamped)
      heavyVehicleLoadEffectPerExtraLoad: 0.40,
      heavyVehicleLoadEffectClamp: { min: -0.30, max: 0.60 },

      // For cars/bikes, load has modest effect
      lightVehicleLoadEffectPerExtraLoad: 0.10,
      lightVehicleLoadEffectClamp: { min: -0.15, max: 0.25 },
    },
  };

  /**
   * Create a deep-ish merged copy of defaults and overrides.
   */
  function mergeDefaults(defaults, overrides) {
    if (!overrides) return JSON.parse(JSON.stringify(defaults));
    const result = JSON.parse(JSON.stringify(defaults));
    Object.keys(overrides).forEach(function (key) {
      if (overrides[key] && typeof overrides[key] === 'object' && !Array.isArray(overrides[key])) {
        result[key] = Object.assign({}, result[key] || {}, overrides[key]);
      } else {
        result[key] = overrides[key];
      }
    });
    return result;
  }

  /**
   * Normalize string to lower snake-like format.
   */
  function norm(value) {
    if (value == null) return undefined;
    return String(value).trim().toLowerCase().replace(/\s+/g, '_');
  }

  /**
   * Convert distance to kilometers.
   */
  function toKm(distance, unit) {
    if (distance == null || isNaN(distance)) return 0;
    const u = norm(unit) || 'km';
    if (u === 'km' || u === 'kilometer' || u === 'kilometers') return distance;
    if (u === 'mile' || u === 'miles' || u === 'mi') return distance * 1.60934;
    return distance; // default assume km
  }

  /**
   * Convert claimed efficiency to canonical per-100km in the appropriate unit.
   * Returns { value: number, unit: 'l_per_100km' | 'kwh_per_100km' | 'kg_per_100km' }
   */
  function toPer100KmEfficiency(value, unit) {
    if (value == null || isNaN(value)) return null;
    const u = norm(unit);
    if (!u) return null;

    if (u === 'l_per_100km') return { value: value, unit: 'l_per_100km' };
    if (u === 'kwh_per_100km') return { value: value, unit: 'kwh_per_100km' };
    if (u === 'kg_per_100km') return { value: value, unit: 'kg_per_100km' };

    if (u === 'km_per_liter' || u === 'kmpl') {
      if (value === 0) return null;
      return { value: 100 / value, unit: 'l_per_100km' };
    }

    if (u === 'mpg') {
      if (value === 0) return null;
      const milesPerGallon = value;
      const kmPerLiter = (milesPerGallon * 1.60934) / 3.78541;
      return { value: 100 / kmPerLiter, unit: 'l_per_100km' };
    }

    if (u === 'wh_per_km') {
      return { value: (value * 100) / 1000, unit: 'kwh_per_100km' };
    }

    return null;
  }

  /**
   * Resolve a baseline consumption per 100 km for the combo of vehicle and fuel.
   */
  function getBaselineConsumptionPer100Km(vehicleType, fuelType, config) {
    const vt = norm(vehicleType) || 'car';
    const ft = norm(fuelType) || 'petrol';

    const byVehicle = config.baseConsumptionPer100Km[vt];
    if (byVehicle && byVehicle[ft]) return byVehicle[ft];

    // Fallbacks: hybrid -> petrol baseline with better value; electric -> generic
    if (ft === 'hybrid') {
      return { unit: 'l_per_100km', value: 4.5 };
    }
    if (ft === 'electric') {
      return { unit: 'kwh_per_100km', value: 17 };
    }

    // Generic car petrol as last resort
    return { unit: 'l_per_100km', value: 7.5 };
  }

  /**
   * Adjust consumption by age, engine size, route, traffic, and load.
   */
  function applyAdjustments(consumption, vehicleType, inputs, config) {
    const vt = norm(vehicleType) || 'car';
    const route = norm(inputs.routeType) || 'city';
    const traffic = norm(inputs.traffic) || 'normal';
    const loadFactor = typeof inputs.loadFactor === 'number' ? inputs.loadFactor : 1.0;

    let multiplier = 1.0;

    // Age effect
    const ageYears = resolveVehicleAgeYears(inputs);
    if (ageYears > 0) {
      const inc = Math.min(
        ageYears * config.adjustments.ageDegradationRatePerYear,
        config.adjustments.ageDegradationMax
      );
      multiplier *= 1 + inc;
    }

    // Engine size effect (if provided)
    if (typeof inputs.engineSizeLiters === 'number' && inputs.engineSizeLiters > 0) {
      const spec = config.adjustments.engineSizeInfluence[vt];
      if (spec) {
        const deltaLiters = inputs.engineSizeLiters - spec.nominalLiters;
        multiplier *= 1 + deltaLiters * spec.effectPerDeltaLiter;
      }
    }

    // Route and traffic
    const routeMul = config.adjustments.routeTypeMultipliers[route] || 1.0;
    const trafficMul = config.adjustments.trafficMultipliers[traffic] || 1.0;
    multiplier *= routeMul * trafficMul;

    // Load effects
    const extraLoad = loadFactor - 1.0;
    if (extraLoad !== 0) {
      const isHeavy = vt === 'bus' || vt === 'truck';
      if (isHeavy) {
        const per = config.adjustments.heavyVehicleLoadEffectPerExtraLoad;
        const clamp = config.adjustments.heavyVehicleLoadEffectClamp;
        const eff = clampValue(extraLoad * per, clamp.min, clamp.max);
        multiplier *= 1 + eff;
      } else {
        const per = config.adjustments.lightVehicleLoadEffectPerExtraLoad;
        const clamp = config.adjustments.lightVehicleLoadEffectClamp;
        const eff = clampValue(extraLoad * per, clamp.min, clamp.max);
        multiplier *= 1 + eff;
      }
    }

    return { unit: consumption.unit, value: consumption.value * multiplier, appliedMultiplier: multiplier };
  }

  /**
   * Clamp a numeric value between min and max.
   */
  function clampValue(value, min, max) {
    if (min != null && value < min) return min;
    if (max != null && value > max) return max;
    return value;
  }

  /**
   * Resolve vehicle age in years from inputs.
   */
  function resolveVehicleAgeYears(inputs) {
    if (typeof inputs.vehicleAgeYears === 'number') return Math.max(0, inputs.vehicleAgeYears);
    if (typeof inputs.modelYear === 'number' && inputs.modelYear > 1900) {
      const now = new Date().getFullYear();
      return Math.max(0, now - inputs.modelYear);
    }
    return 0;
  }

  /**
   * Compute total fuel/energy consumed for the trip.
   */
  function computeConsumed(distanceKm, consumptionPer100Km) {
    const per100 = consumptionPer100Km.value;
    const unit = consumptionPer100Km.unit;
    const consumed = (per100 * distanceKm) / 100;
    return { amount: consumed, unit: unit };
  }

  /**
   * Compute CO2 emissions in grams for the consumed fuel/energy.
   */
  function computeEmissionsGrams(consumed, fuelType, electricitySource, config) {
    const ft = norm(fuelType) || 'petrol';
    const source = norm(electricitySource) || 'grid_avg';

    if (ft === 'electric') {
      const kgPerKwh = config.electricityEmissionFactorsKgPerKwh[source] != null
        ? config.electricityEmissionFactorsKgPerKwh[source]
        : config.electricityEmissionFactorsKgPerKwh.grid_avg;
      const totalKg = consumed.amount * kgPerKwh; // amount is kWh
      return totalKg * 1000;
    }

    // Hybrid assumed to use liquid fuel; handled by baseline selection
    let kgPerUnit = config.fuelEmissionFactorsKgPerUnit[ft];
    if (kgPerUnit == null) {
      // Fallback to petrol factor
      kgPerUnit = config.fuelEmissionFactorsKgPerUnit.petrol;
    }
    const totalKg = consumed.amount * kgPerUnit;
    return totalKg * 1000;
  }

  /**
   * Estimate emissions (grams CO2) for a given trip and vehicle.
   */
  function estimateEmissions(inputs, overrides) {
    const config = mergeDefaults(DEFAULTS, overrides);

    if (!inputs || typeof inputs !== 'object') {
      throw new Error('inputs must be a non-null object');
    }

    const vt = norm(inputs.vehicleType) || 'car';
    const ft = norm(inputs.fuelType) || (vt === 'electric' ? 'electric' : 'petrol');
    const electricitySource = inputs.electricitySource || 'grid_avg';

    const distanceKm = toKm(inputs.distance || 0, inputs.distanceUnit);
    if (distanceKm <= 0) {
      return {
        totalEmissionsGramsCO2: 0,
        breakdown: {
          reason: 'non-positive distance',
        },
      };
    }

    // Determine baseline or use claimed efficiency
    let baseConsumption = getBaselineConsumptionPer100Km(vt, ft, config);
    if (typeof inputs.claimedEfficiency === 'number' && inputs.claimedEfficiency > 0 && inputs.claimedEfficiencyUnit) {
      const converted = toPer100KmEfficiency(inputs.claimedEfficiency, inputs.claimedEfficiencyUnit);
      if (converted && isUnitCompatibleWithFuel(converted.unit, ft)) {
        baseConsumption = converted;
      }
    }

    // Adjust based on conditions
    const adjustedConsumption = applyAdjustments(baseConsumption, vt, inputs, config);

    // Compute consumption and emissions
    const consumed = computeConsumed(distanceKm, adjustedConsumption);
    const grams = computeEmissionsGrams(consumed, ft, electricitySource, config);

    return {
      totalEmissionsGramsCO2: grams,
      breakdown: {
        vehicleType: vt,
        fuelType: ft,
        electricitySource: norm(electricitySource) || 'grid_avg',
        distanceKm: distanceKm,
        baseConsumptionPer100Km: baseConsumption,
        adjustedConsumptionPer100Km: adjustedConsumption,
        consumed: consumed,
        factorsApplied: {
          ageYears: resolveVehicleAgeYears(inputs),
          routeType: norm(inputs.routeType) || 'city',
          traffic: norm(inputs.traffic) || 'normal',
          loadFactor: typeof inputs.loadFactor === 'number' ? inputs.loadFactor : 1.0,
          engineSizeLiters: typeof inputs.engineSizeLiters === 'number' ? inputs.engineSizeLiters : undefined,
        },
      },
    };
  }

  /**
   * Validate that the provided efficiency unit is compatible with the fuel type.
   */
  function isUnitCompatibleWithFuel(unit, fuelType) {
    const ft = norm(fuelType) || 'petrol';
    if (unit === 'kwh_per_100km') return ft === 'electric';
    if (unit === 'kg_per_100km') return ft === 'cng';
    if (unit === 'l_per_100km') return ft !== 'electric' && ft !== 'cng';
    return false;
  }

  /**
   * Factory to create a calculator instance with fixed overrides.
   */
  function createCalculator(overrides) {
    const fixedConfig = mergeDefaults(DEFAULTS, overrides);
    return {
      estimate: function (inputs) {
        return estimateEmissions(inputs, fixedConfig);
      },
    };
  }

  return {
    estimateEmissions: estimateEmissions,
    createCalculator: createCalculator,
    DEFAULTS: DEFAULTS,
  };
});


