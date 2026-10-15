const MEDIA_TYPES = Object.freeze({
  "image/jpeg": { type: "image", format: "jpg" },
  "image/png": { type: "image", format: "png" },
  "image/gif": { type: "image", format: "gif" },
  "image/webp": { type: "image", format: "webp" },
  "video/mp4": { type: "video", format: "mp4" },
  "video/quicktime": { type: "video", format: "mov" },
  "audio/mpeg": { type: "audio", format: "mp3" },
  "audio/ogg": { type: "audio", format: "ogg" },
});

export function mediaTypeFromContentType(contentType) {
  if (typeof contentType !== "string") {
    return null;
  }
  return MEDIA_TYPES[contentType.split(";")[0].trim().toLowerCase()] ?? null;
}

export function normalizeArtist(name, { marker = "Unknown", aliases = [] } = {}) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  const aliasSet = new Set([...aliases, ""].map((entry) => entry.toLowerCase()));
  if (!trimmed || aliasSet.has(trimmed.toLowerCase())) {
    return marker;
  }
  return trimmed;
}

export function isNamedCreator(artist, marker = "Unknown") {
  return Boolean(artist) && artist.trim().toLowerCase() !== marker.toLowerCase();
}

export function buildCreditLine(title, artist, marker = "Unknown") {
  const cleanTitle = String(title ?? "").trim();
  return isNamedCreator(artist, marker)
    ? `${cleanTitle} by ${artist}`
    : `${cleanTitle} (creator unknown)`;
}

export function parseAttribution(attribution) {
  const text = typeof attribution === "string" ? attribution.trim() : "";
  if (!text) {
    return {};
  }

  const parsed = {};

  const urlMatch = text.match(/https?:\/\/\S+?(?=\s|$)/);
  if (urlMatch) {
    parsed.source_url = urlMatch[0].replace(/[.,;]$/, "");
  }

  const rightsholderMatch = text.match(/\(\s*rightsholder\s+([^)]+?)\s*\)/i);
  if (rightsholderMatch) {
    parsed.rightsholder = rightsholderMatch[1].trim();
  }

  if (/public domain/i.test(text)) {
    parsed.rights_status = "public-domain";
  }

  const remainder = text
    .replace(urlMatch?.[0] ?? "", "")
    .replace(rightsholderMatch?.[0] ?? "", "")
    .replace(/\(\s*creator unknown\s*\)/i, "")
    .replace(/^[\s—–-]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (remainder && remainder !== text.trim()) {
    parsed.permission_notes = remainder;
  } else if (remainder && !urlMatch && !rightsholderMatch) {
    parsed.permission_notes = remainder;
  }

  return parsed;
}

