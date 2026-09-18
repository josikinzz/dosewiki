const SOURCE_ID_ALIASES = new Map([
  ["erowid", "erowid"],
  ["psychonautwiki", "psychonautwiki"],
  ["psychonaut wiki", "psychonautwiki"],
  ["tripsit factsheets", "tripsit-factsheets"],
  ["tripsit factsheet", "tripsit-factsheets"],
  ["tripsit wiki", "tripsit-wiki"],
  ["wikipedia", "wikipedia"],
  ["drug users bible", "drugusersbible"],
  ["drug user's bible", "drugusersbible"],
  ["the drug classroom", "thedrugclassroom"],
  ["disregard everything i say", "disregardeverythingisay"],
  ["isomer design", "isomerdesign"],
  ["saferparty", "saferparty"],
]);

export function clipText(value, maxChars) {
  if (typeof value !== "string") return "";
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n...[truncated]`;
}

export function normalizeTextNeedle(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeSourceLookupKey(value) {
  return normalizeTextNeedle(value).replace(/[^a-z0-9]+/g, " ").trim();
}

export function canonicalizeSourceId(value) {
  const normalized = normalizeSourceLookupKey(value);
  if (!normalized) return null;
  if (SOURCE_ID_ALIASES.has(normalized)) {
    return SOURCE_ID_ALIASES.get(normalized);
  }

  const compact = normalized.replace(/\s+/g, "");
  if (SOURCE_ID_ALIASES.has(compact)) {
    return SOURCE_ID_ALIASES.get(compact);
  }

  return compact || null;
}

export function selectYear(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

export function dedupeStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values ?? []) {
    const normalized = String(value ?? "").trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
