import { ROUTE_NORMALIZE, SOURCE_PRIORITY, DURATION_SOURCE_PRIORITY } from "./config.mjs";

export { slugify } from "../../lib/slug.mjs";

export function normalizeRoute(route) {
  if (!route) return "Oral";
  const key = route.toLowerCase().trim();
  return ROUTE_NORMALIZE[key] || (route.charAt(0).toUpperCase() + route.slice(1));
}

export function normalizeUnit(unit) {
  if (!unit) return "mg";
  return unit.toLowerCase()
    .replace(/^ug$/i, "µg")
    .replace(/^mcg$/i, "µg");
}

export function cleanBioavailability(bio) {
  if (!bio) return "";
  return bio.replace(/(\d+(?:-\d+)?%)\d*$/, "$1").trim();
}

export function getSourcePriority(source) {
  const idx = SOURCE_PRIORITY.indexOf(source);
  return idx === -1 ? SOURCE_PRIORITY.length : idx;
}

export function getDurationSourcePriority(source) {
  const idx = DURATION_SOURCE_PRIORITY.indexOf(source);
  return idx === -1 ? DURATION_SOURCE_PRIORITY.length : idx;
}

export function hasExistingDosage(article) {
  return article.dosage?.routes?.length > 0;
}

export function hasExistingDuration(article) {
  return article.duration?.routes?.length > 0;
}
