/**
 * Content type to `(type, format)`.
 *
 * An animated GIF is stored as `type: "image"`, which is what all six existing
 * gif rows do and what every gallery surface expects — `type: "video"` means an
 * `<video>` element with a poster frame, which a GIF is not. `image/jpeg` becomes
 * `jpg` because 52 rows spell it that way against 8 that say `jpeg`.
 */
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

/**
 * The corpus's marker for "nobody is credited".
 *
 * `Unknown` already sits on 20 replication rows, and both `hasKnownCreator` and
 * the contributor join read it as *not a person* — no profile, no contributor
 * page, no false credit. "Anonymous", an empty string and a missing field all
 * mean the same thing and must all arrive as that one string, or the corpus
 * grows a second spelling of absence that nothing special-cases.
 */
export function normalizeArtist(name, { marker = "Unknown", aliases = [] } = {}) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  const aliasSet = new Set([...aliases, ""].map((entry) => entry.toLowerCase()));
  if (!trimmed || aliasSet.has(trimmed.toLowerCase())) {
    return marker;
  }
  return trimmed;
}

/** Whether a credit names somebody, mirroring `hasKnownCreator` on the app side. */
export function isNamedCreator(artist, marker = "Unknown") {
  return Boolean(artist) && artist.trim().toLowerCase() !== marker.toLowerCase();
}

/**
 * `"<Title> by <Artist>"`, or `"<Title> (creator unknown)"` when nobody is named.
 * Both spellings already exist in the table; matching them keeps the gallery
 * caption identical to the rows beside it.
 */
export function buildCreditLine(title, artist, marker = "Unknown") {
  const cleanTitle = String(title ?? "").trim();
  return isNamedCreator(artist, marker)
    ? `${cleanTitle} by ${artist}`
    : `${cleanTitle} (creator unknown)`;
}

/**
 * Split the curation file's free-text `attribution` into the rights columns.
 *
 * The field is prose with a shape: an optional leading source URL, an optional
 * `(rightsholder X)` or `(creator unknown)` parenthetical, and commentary. Only
 * what is actually stated is carried across — an unstated licence stays unset
 * rather than becoming a guess, and `rights_status` is only asserted for the
 * public-domain case, which the text says outright.
 */
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

  // Whatever is left once the URL and the parenthetical are removed is the
  // human note — the rights caveats ("copyrighted fine art", a dead host, a
  // publication reference) that nothing else has a column for.
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

