import {
  DOSAGE_ORDER,
  DOSAGE_ROUTE_ORDER,
  DOSE_RANGE_ORDER,
  DOSE_RANGES_ORDER,
  PLATEAU_DOSE_ORDER,
  PLATEAU_DOSING_ORDER,
} from './orders.mjs';
import { orderObject, reorderOrderedRecord } from './core.mjs';

function reorderDoseRange(doseRange, options) { if (!doseRange) return doseRange;
return orderObject(doseRange, DOSE_RANGE_ORDER, { ...options, context: 'dose_range' }); }

function reorderDoseRanges(doseRanges, options) { if (!doseRanges) return doseRanges;
return reorderOrderedRecord(doseRanges, DOSE_RANGES_ORDER, (entry) => reorderDoseRange(entry, options)); }

function reorderPlateauDose(plateauDose, options) { if (!plateauDose) return plateauDose;
return orderObject(plateauDose, PLATEAU_DOSE_ORDER, { ...options, context: 'plateau_dose' }); }

function reorderPlateauDosing(plateauDosing, options) { if (plateauDosing === null || plateauDosing === undefined) return plateauDosing;
const result = {};
for (const plateau of PLATEAU_DOSING_ORDER) {
  if (Object.prototype.hasOwnProperty.call(plateauDosing, plateau)) {
    result[plateau] = plateau === 'notes'
      ? plateauDosing[plateau]
      : reorderPlateauDose(plateauDosing[plateau], options);
  }
}
for (const key of Object.keys(plateauDosing)) {
  if (!PLATEAU_DOSING_ORDER.includes(key)) {
    result[key] = plateauDosing[key];
  }
}
return result; }

function reorderDosageRoute(route, options) { if (!route) return route;
const result = { ...route };
if (result.dose_ranges) {
  result.dose_ranges = reorderDoseRanges(result.dose_ranges, options);
}
return orderObject(result, DOSAGE_ROUTE_ORDER, { ...options, context: 'dosage_route' }); }

export function reorderDosage(dosage, options) {
  if (!dosage) return dosage;
  const result = { ...dosage };
  if (Array.isArray(result.routes)) {
    result.routes = result.routes.map((route) => reorderDosageRoute(route, options));
  }
  if (result.plateau_dosing) {
    result.plateau_dosing = reorderPlateauDosing(result.plateau_dosing, options);
  }
  return orderObject(result, DOSAGE_ORDER, { ...options, context: 'dosage' });
}
