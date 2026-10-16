const PIRU_FRAGMENT_KEY = "piru";

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

const INVISIBLE_CHARACTERS =
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u061C\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

function plainText(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  const cleaned = value
    .replace(/\r\n?|[\u2028\u2029]/g, "\n")
    .replace(INVISIBLE_CHARACTERS, "")
    .trim();
  return Array.from(cleaned).slice(0, limit).join("").trim();
}

export function mapPiruRoa(value: unknown): string {
  const text = plainText(value, FIELD_LIMITS.roa).toLowerCase();
  return Object.prototype.hasOwnProperty.call(ROA_ALIASES, text) ? ROA_ALIASES[text] : text;
}

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
