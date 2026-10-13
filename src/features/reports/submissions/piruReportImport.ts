/**
 * Reads a session report handed over by Piru, an independent dose journal,
 * so the submission form can start filled in.
 *
 * Piru opens `/reports/submit#piru=<base64url of UTF-8 JSON>`. The payload
 * rides in the URL fragment, which browsers never send to a server, so the
 * report reaches dose.wiki only when the reader submits the form. Everything
 * in it is untrusted input: decoding is size-capped, every field is optional
 * and type-checked, unknown fields are ignored, and every string is plain
 * text with control characters removed and a length cap. The form renders
 * the values into inputs, so nothing is ever interpreted as markup.
 *
 * Payload v1 (all fields optional except `v`):
 *
 * ```json
 * {
 *   "v": 1,
 *   "source": "piru",
 *   "title": "…",
 *   "substances": [{ "name": "MDMA", "slug": "mdma", "dose": "120 mg", "roa": "oral" }],
 *   "introduction": "…",
 *   "timeline": {
 *     "onset": [{ "time": "T+0:30", "description": "…" }],
 *     "peak": [],
 *     "offset": []
 *   },
 *   "conclusion": "…",
 *   "tags": ["euphoria", "empathy"]
 * }
 * ```
 *
 * `tags` is free text, either a comma-separated string or an array of
 * strings; the form joins an array with commas.
 *
 * The payload has no subject, contact, or consent fields, and any such keys
 * are ignored: the reader fills those in and confirms them on the form.
 */

const PIRU_FRAGMENT_KEY = "piru";

/**
 * Encoded size cap. The intake endpoint accepts at most 128 KiB of JSON, and
 * base64 inflates by a third, so a payload at this cap decodes to well under
 * what the form could submit.
 */
export const MAX_PIRU_FRAGMENT_LENGTH = 128 * 1024;

const SUPPORTED_VERSION = 1;
const MAX_SUBSTANCES = 20;
const MAX_TIMELINE_ENTRIES = 40;

const FIELD_LIMITS = {
  title: 200,
  substanceName: 120,
  dose: 60,
  roa: 40,
  time: 16,
  description: 4_000,
  introduction: 40_000,
  conclusion: 20_000,
  tags: 500,
} as const;

type PiruTimelinePhase = "onset" | "peak" | "offset";

type PiruImportedSubstance = { name: string; dose: string; roa: string };
type PiruImportedTimelineEntry = { time: string; description: string };

export type PiruImportedReport = {
  title: string;
  substances: PiruImportedSubstance[];
  introduction: string;
  timeline: Record<PiruTimelinePhase, PiruImportedTimelineEntry[]>;
  conclusion: string;
  tags: string;
};

/**
 * Piru's route names onto the route vocabulary dose.wiki articles use
 * (`data/substances/routeSynonyms.json`). `other` carries no route, so it
 * leaves the field empty; an unlisted name is kept as written.
 */
const ROA_ALIASES: Readonly<Record<string, string>> = {
  oral: "oral",
  sublingual: "sublingual",
  buccal: "buccal",
  insufflated: "insufflated",
  insufflation: "insufflated",
  intranasal: "insufflated",
  inhaled: "inhaled",
  inhalation: "inhaled",
  smoked: "smoked",
  vaporized: "vaporized",
  vaporised: "vaporized",
  rectal: "rectal",
  intravenous: "intravenous",
  intramuscular: "intramuscular",
  subcutaneous: "subcutaneous",
  transdermal: "transdermal",
  other: "",
};

/** The `piru` value from a location hash (`#piru=…`), or `null`. */
export function readPiruFragment(hash: string): string | null {
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!body) return null;
  for (const part of body.split("&")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator) === PIRU_FRAGMENT_KEY)
      return part.slice(separator + 1);
  }
  return null;
}

function decodeBase64UrlUtf8(encoded: string): string | null {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(encoded)) return null;
  const base64 = encoded
    .replace(/=+$/, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Characters removed from imported text: C0 and C1 controls other than newline
 * and tab; bidi embeddings, overrides, isolates and marks (U+202A–U+202E,
 * U+2066–U+2069, U+200E, U+200F, U+061C), which would let a crafted report
 * reorder how its text displays; and invisible characters (zero-width space,
 * word joiner and invisible operators, byte order mark, soft hyphen). Zero-width
 * joiner and non-joiner stay: emoji sequences and several scripts need them.
 */
const INVISIBLE_CHARACTERS =
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u061C\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/**
 * Plain text: strings only, line endings unified (including the Unicode line
 * and paragraph separators), invisible and bidi control characters removed
 * (see `INVISIBLE_CHARACTERS`), trimmed, and cut at `limit` characters.
 */
function plainText(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  const cleaned = value
    .replace(/\r\n?|[\u2028\u2029]/g, "\n")
    .replace(INVISIBLE_CHARACTERS, "")
    .trim();
  return Array.from(cleaned).slice(0, limit).join("").trim();
}

/** A Piru route name in the article vocabulary; see `ROA_ALIASES`. */
export function mapPiruRoa(value: unknown): string {
  const text = plainText(value, FIELD_LIMITS.roa).toLowerCase();
  return ROA_ALIASES[text] ?? text;
}

/**
 * Piru's `T+H:MM` as the form's `T+HH:MM` (`T+0:30` → `T+00:30`); a note
 * written before the first dose keeps its minus (`T-0:15` → `T-00:15`). Any
 * other shape is kept as written, since the field is free text.
 */
export function normalizePiruTime(value: unknown): string {
  const text = plainText(value, FIELD_LIMITS.time);
  const match = /^T([+-])(\d{1,3}):([0-5]\d)$/.exec(text);
  return match ? `T${match[1]}${match[2].padStart(2, "0")}:${match[3]}` : text;
}

function readSubstances(value: unknown): PiruImportedSubstance[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((entry) => ({
      name: plainText(entry.name, FIELD_LIMITS.substanceName),
      dose: plainText(entry.dose, FIELD_LIMITS.dose),
      roa: mapPiruRoa(entry.roa),
    }))
    .filter((entry) => entry.name.length > 0)
    .slice(0, MAX_SUBSTANCES);
}

function readTimelinePhase(value: unknown): PiruImportedTimelineEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((entry) => ({
      time: normalizePiruTime(entry.time),
      description: plainText(entry.description, FIELD_LIMITS.description),
    }))
    .filter((entry) => entry.description.length > 0 || entry.time.length > 0)
    .slice(0, MAX_TIMELINE_ENTRIES);
}

function readTags(value: unknown): string {
  if (Array.isArray(value)) {
    return plainText(
      value.filter((tag): tag is string => typeof tag === "string").join(", "),
      FIELD_LIMITS.tags,
    );
  }
  return plainText(value, FIELD_LIMITS.tags);
}

/**
 * The report in a `piru` fragment value, or `null` when it is oversized, not
 * base64url, not UTF-8, not JSON, not an object, or a version this form does
 * not read.
 */
export function decodePiruReport(encoded: string): PiruImportedReport | null {
  if (encoded.length === 0 || encoded.length > MAX_PIRU_FRAGMENT_LENGTH)
    return null;
  const json = decodeBase64UrlUtf8(encoded);
  if (json === null) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(payload) || payload.v !== SUPPORTED_VERSION) return null;

  const timeline = isRecord(payload.timeline) ? payload.timeline : {};
  return {
    title: plainText(payload.title, FIELD_LIMITS.title),
    substances: readSubstances(payload.substances),
    introduction: plainText(payload.introduction, FIELD_LIMITS.introduction),
    timeline: {
      onset: readTimelinePhase(timeline.onset),
      peak: readTimelinePhase(timeline.peak),
      offset: readTimelinePhase(timeline.offset),
    },
    conclusion: plainText(payload.conclusion, FIELD_LIMITS.conclusion),
    tags: readTags(payload.tags),
  };
}

/** Whether the report uses the detailed format's fields (phases or a conclusion). */
export function piruReportNeedsDetailedFormat(
  report: PiruImportedReport,
): boolean {
  return (
    report.conclusion.length > 0 ||
    report.timeline.onset.length > 0 ||
    report.timeline.peak.length > 0 ||
    report.timeline.offset.length > 0
  );
}
