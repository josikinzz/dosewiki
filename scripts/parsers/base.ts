/**
 * Base parsing utilities shared across all source parsers
 * Contains regex helpers, section extraction, and normalization functions
 */

import type { DoseRange, DurationRange, ParserResult, NarrativeContent } from "./types";

// === Unit Normalization ===

const DOSE_UNIT_ALIASES: Record<string, string> = {
  "μg": "µg",
  "ug": "µg",
  "mcg": "µg",
  "micrograms": "µg",
  "microgram": "µg",
  "milligrams": "mg",
  "milligram": "mg",
  "grams": "g",
  "gram": "g",
  "milliliters": "ml",
  "milliliter": "ml",
  "mL": "ml",
};

const DURATION_UNIT_ALIASES: Record<string, string> = {
  "sec": "seconds",
  "secs": "seconds",
  "second": "seconds",
  "min": "minutes",
  "mins": "minutes",
  "minute": "minutes",
  "hr": "hours",
  "hrs": "hours",
  "hour": "hours",
  "h": "hours",
  "days": "days",
  "day": "days",
  "d": "days",
};

export function normalizeDoseUnit(unit: string): string {
  const normalized = unit.trim().toLowerCase();
  return DOSE_UNIT_ALIASES[normalized] || DOSE_UNIT_ALIASES[unit] || unit;
}

export function normalizeDurationUnit(unit: string): string {
  const normalized = unit.trim().toLowerCase();
  return DURATION_UNIT_ALIASES[normalized] || DURATION_UNIT_ALIASES[unit] || unit;
}

// === Dose Range Parsing ===

/**
 * Parse dose strings like "100-200mg", "15 - 75 µg", "250+", "<10mg"
 * Returns structured DoseRange or undefined if unparseable
 */
export function parseDoseRange(text: string): DoseRange | undefined {
  if (!text || text.trim() === "" || text.trim() === "-") return undefined;

  const cleaned = text.trim();

  // Pattern: "100-200mg" or "100 - 200 mg" or "100-200 mg"
  const rangeMatch = cleaned.match(
    /^([<>]?\s*[\d.]+)\s*[-–—to]+\s*([\d.]+)\s*(µg|ug|μg|mcg|mg|g|ml|mL)?$/i
  );
  if (rangeMatch) {
    const minStr = rangeMatch[1].replace(/[<>\s]/g, "");
    return {
      min: parseFloat(minStr),
      max: parseFloat(rangeMatch[2]),
      unit: normalizeDoseUnit(rangeMatch[3] || "mg"),
    };
  }

  // Pattern: "250+" or "250+mg" or ">250mg"
  const heavyMatch = cleaned.match(/^([>]?\s*[\d.]+)\s*\+?\s*(µg|ug|μg|mcg|mg|g|ml|mL)?$/i);
  if (heavyMatch && (cleaned.includes("+") || cleaned.includes(">"))) {
    return {
      min: parseFloat(heavyMatch[1].replace(/[>\s]/g, "")),
      unit: normalizeDoseUnit(heavyMatch[2] || "mg"),
    };
  }

  // Pattern: "<10mg" or "< 10 mg"
  const lessThanMatch = cleaned.match(/^<\s*([\d.]+)\s*(µg|ug|μg|mcg|mg|g|ml|mL)?$/i);
  if (lessThanMatch) {
    return {
      max: parseFloat(lessThanMatch[1]),
      unit: normalizeDoseUnit(lessThanMatch[2] || "mg"),
    };
  }

  // Pattern: single value "100mg" or "100 mg"
  const singleMatch = cleaned.match(/^([\d.]+)\s*(µg|ug|μg|mcg|mg|g|ml|mL)?$/i);
  if (singleMatch) {
    const value = parseFloat(singleMatch[1]);
    return {
      min: value,
      max: value,
      unit: normalizeDoseUnit(singleMatch[2] || "mg"),
    };
  }

  return undefined;
}

/**
 * Parse dose string that may include unit at the end of range
 * "100-200" + "mg" => DoseRange
 */
export function parseDoseRangeWithUnit(value: string, fallbackUnit: string = "mg"): DoseRange | undefined {
  const result = parseDoseRange(value);
  if (result && !result.unit) {
    result.unit = normalizeDoseUnit(fallbackUnit);
  }
  return result;
}

// === Duration Range Parsing ===

/**
 * Parse duration strings like "15-30 minutes", "2-4 hours", "1-2h"
 * Also handles HH:MM format (e.g., "00:05 – 00:30") used by Drug Classroom
 */
export function parseDurationRange(text: string): DurationRange | undefined {
  if (!text || text.trim() === "" || text.trim() === "-") return undefined;

  const cleaned = text.trim();

  // Pattern: HH:MM – HH:MM format (Drug Classroom style)
  // e.g., "00:05 – 00:30" means 5-30 minutes, "01:00 – 03:00" means 1-3 hours
  const hhmmRangeMatch = cleaned.match(
    /^(\d{1,2}):(\d{2})\s*[-–—]+\s*(\d{1,2}):(\d{2})$/
  );
  if (hhmmRangeMatch) {
    const minHours = parseInt(hhmmRangeMatch[1], 10);
    const minMins = parseInt(hhmmRangeMatch[2], 10);
    const maxHours = parseInt(hhmmRangeMatch[3], 10);
    const maxMins = parseInt(hhmmRangeMatch[4], 10);

    const minTotalMins = minHours * 60 + minMins;
    const maxTotalMins = maxHours * 60 + maxMins;

    // If both values are >= 60 minutes and divisible by 60, use hours
    if (minTotalMins >= 60 && maxTotalMins >= 60 && minTotalMins % 60 === 0 && maxTotalMins % 60 === 0) {
      return {
        min: minTotalMins / 60,
        max: maxTotalMins / 60,
        unit: "hours",
      };
    }
    // Otherwise use minutes
    return {
      min: minTotalMins,
      max: maxTotalMins,
      unit: "minutes",
    };
  }

  // Pattern: "Under X seconds/minutes" or "under 30 seconds"
  const underMatch = cleaned.match(
    /^under\s+([\d.]+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|h|days?|d)?$/i
  );
  if (underMatch) {
    return {
      max: parseFloat(underMatch[1]),
      unit: normalizeDurationUnit(underMatch[2] || "minutes"),
    };
  }

  // Pattern: "15-30 minutes" or "2 - 4 hours" or "20-30 seconds"
  const rangeMatch = cleaned.match(
    /^([\d.]+)\s*[-–—to]+\s*([\d.]+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|h|days?|d)?$/i
  );
  if (rangeMatch) {
    return {
      min: parseFloat(rangeMatch[1]),
      max: parseFloat(rangeMatch[2]),
      unit: normalizeDurationUnit(rangeMatch[3] || "hours"),
    };
  }

  // Pattern: "30+ minutes" or ">2 hours"
  const minOnlyMatch = cleaned.match(/^([>]?\s*[\d.]+)\s*\+?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|h|days?|d)?$/i);
  if (minOnlyMatch && (cleaned.includes("+") || cleaned.includes(">"))) {
    return {
      min: parseFloat(minOnlyMatch[1].replace(/[>\s]/g, "")),
      unit: normalizeDurationUnit(minOnlyMatch[2] || "hours"),
    };
  }

  // Pattern: "<30 minutes"
  const maxOnlyMatch = cleaned.match(/^<\s*([\d.]+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|h|days?|d)?$/i);
  if (maxOnlyMatch) {
    return {
      max: parseFloat(maxOnlyMatch[1]),
      unit: normalizeDurationUnit(maxOnlyMatch[2] || "hours"),
    };
  }

  // Pattern: single value "30 minutes" or "20 seconds"
  const singleMatch = cleaned.match(/^([\d.]+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|h|days?|d)?$/i);
  if (singleMatch) {
    const value = parseFloat(singleMatch[1]);
    return {
      min: value,
      max: value,
      unit: normalizeDurationUnit(singleMatch[2] || "hours"),
    };
  }

  return undefined;
}

// === Section Extraction ===

/**
 * Extract content between markdown headers
 * Returns map of header name → content
 */
export function extractSections(
  content: string,
  headerLevel: number = 2
): Map<string, string> {
  const sections = new Map<string, string>();
  const headerPattern = new RegExp(`^${"#".repeat(headerLevel)}\\s+(.+)$`, "gm");

  const matches: { name: string; start: number; end: number }[] = [];
  let match;

  while ((match = headerPattern.exec(content)) !== null) {
    matches.push({
      name: match[1].trim(),
      start: match.index + match[0].length,
      end: content.length,
    });
  }

  // Set end positions
  for (let i = 0; i < matches.length - 1; i++) {
    matches[i].end = matches[i + 1].start - matches[i + 1].name.length - headerLevel - 2;
  }

  for (const m of matches) {
    sections.set(m.name.toLowerCase(), content.slice(m.start, m.end).trim());
  }

  return sections;
}

/**
 * Extract content for a specific section by name (case-insensitive)
 */
export function extractSection(
  content: string,
  sectionName: string,
  headerLevel: number = 2
): string | undefined {
  const sections = extractSections(content, headerLevel);
  return sections.get(sectionName.toLowerCase());
}

/**
 * Extract subsections within a section
 */
export function extractSubsections(
  sectionContent: string,
  subHeaderLevel: number = 3
): Map<string, string> {
  return extractSections(sectionContent, subHeaderLevel);
}

// === Bullet List Parsing ===

/**
 * Extract bullet list items from markdown
 * Returns array of strings (stripped of bullet markers)
 */
export function extractBulletList(content: string): string[] {
  const lines = content.split("\n");
  const items: string[] = [];

  for (const line of lines) {
    const match = line.match(/^\s*[-*•]\s+(.+)$/);
    if (match) {
      items.push(match[1].trim());
    }
  }

  return items;
}

/**
 * Extract labeled bullet items like "- **Label:** Value" or "- Label: Value"
 * Handles TripSit format where colon is inside bold: "- **Common:** 100-150ug"
 */
export function extractLabeledBullets(
  content: string
): Array<{ label: string; value: string }> {
  const items: Array<{ label: string; value: string }> = [];
  const lines = content.split("\n");

  for (const line of lines) {
    // Pattern 1: "- **Label:** Value" (TripSit format - colon inside bold)
    const boldWithColon = line.match(
      /^\s*[-*•]\s+\*\*([^*]+):\*\*\s*(.+)$/
    );
    if (boldWithColon) {
      items.push({
        label: boldWithColon[1].trim(),
        value: boldWithColon[2].trim(),
      });
      continue;
    }

    // Pattern 2: "- **Label**: Value" or "- **Label** Value" (colon outside bold)
    const boldWithoutColon = line.match(
      /^\s*[-*•]\s+\*\*([^*]+)\*\*:?\s*(.+)$/
    );
    if (boldWithoutColon) {
      items.push({
        label: boldWithoutColon[1].trim(),
        value: boldWithoutColon[2].trim(),
      });
      continue;
    }

    // Pattern 3: "- Label: Value" (no bold, with colon)
    const plainLabel = line.match(
      /^\s*[-*•]\s+([^:]+):\s*(.+)$/
    );
    if (plainLabel) {
      items.push({
        label: plainLabel[1].trim(),
        value: plainLabel[2].trim(),
      });
      continue;
    }

    // Pattern 4: "*Label* : Value" (DEIS italic format)
    const italicLabel = line.match(
      /^\s*\*([^*]+)\*\s*:\s*(.+)$/
    );
    if (italicLabel) {
      items.push({
        label: italicLabel[1].trim(),
        value: italicLabel[2].trim(),
      });
    }
  }

  return items;
}

// === Table Parsing ===

/**
 * Parse markdown table into array of row objects
 * First row is treated as headers
 */
export function parseMarkdownTable(
  content: string
): Array<Record<string, string>> {
  const lines = content.split("\n").filter((l) => l.includes("|"));
  if (lines.length < 2) return [];

  // Extract headers from first row
  const headerLine = lines[0];
  const headers = headerLine
    .split("|")
    .map((h) => h.trim())
    .filter((h) => h && !h.match(/^[-:]+$/));

  // Skip separator row (|----|---|)
  const dataLines = lines.slice(2);

  return dataLines.map((line) => {
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c !== "");

    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header.toLowerCase()] = cells[i] || "";
    });
    return row;
  });
}

/**
 * Parse label-value tables where each row is | Label | Value |
 * This format is used by TripSit Wiki, where separators appear
 * after data rows (non-standard).
 *
 * Example:
 * | Common | 60-160μg |
 * | --- | --- |
 * | Strong | 300μg+ |
 *
 * Returns: [["Common", "60-160μg"], ["Strong", "300μg+"]]
 */
export function parseLabelValueTable(content: string): Array<[string, string]> {
  const results: Array<[string, string]> = [];
  const lines = content.split("\n");

  for (const line of lines) {
    // Skip separator rows (|---|---|)
    if (/^\s*\|[\s-:|]+\|\s*$/.test(line)) continue;

    // Skip non-table lines
    if (!line.includes("|")) continue;

    // Parse table row: | Label | Value |
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c !== "");

    if (cells.length >= 2) {
      const label = cells[0];
      const value = cells[1];
      // Skip if label looks like a separator or header keyword
      if (
        label &&
        value &&
        !label.match(/^[-:]+$/) &&
        !label.match(/^(category|dose|label|value)$/i)
      ) {
        results.push([label, value]);
      }
    }
  }

  return results;
}

// === Route Normalization ===

const ROUTE_ALIASES: Record<string, string> = {
  oral: "Oral",
  "by mouth": "Oral",
  swallowed: "Oral",
  sublingual: "Sublingual",
  "under tongue": "Sublingual",
  buccal: "Sublingual",
  insufflated: "Insufflated",
  snorted: "Insufflated",
  intranasal: "Insufflated",
  nasal: "Insufflated",
  inhaled: "Inhaled",
  smoked: "Smoked",
  vaporized: "Smoked",
  vaped: "Smoked",
  intravenous: "Intravenous",
  iv: "Intravenous",
  injected: "Intravenous",
  intramuscular: "Intramuscular",
  im: "Intramuscular",
  rectal: "Rectal",
  plugged: "Rectal",
  transdermal: "Transdermal",
  topical: "Transdermal",
};

export function normalizeRoute(route: string): string {
  // Strip parenthetical descriptions like "(tentative)", "(mushrooms)", "(most common route)"
  // Examples: "Oral (mushrooms)" → "Oral", "Intranasal (tentative)" → "Intranasal"
  const stripped = route.replace(/\s*\([^)]*\)\s*/g, "").trim();
  const lower = stripped.toLowerCase().trim();
  return ROUTE_ALIASES[lower] || stripped.charAt(0).toUpperCase() + stripped.slice(1).toLowerCase();
}

// === Empty Result Factory ===

export function createEmptyParserResult(): ParserResult {
  return {
    dosage: [],
    duration: [],
    effects: [],
    interactions: [],
    legal: [],
    internationalLaw: [],
    narrativeContent: {
      experienceReports: [],
      synthesis: [],
      qualitativeComments: [],
      generalNotes: [],
    },
    sectionsExtracted: [],
  };
}

export function createEmptyNarrativeContent(): NarrativeContent {
  return {
    experienceReports: [],
    synthesis: [],
    qualitativeComments: [],
    generalNotes: [],
  };
}

// === Effect Category Detection ===

const POSITIVE_INDICATORS = [
  "euphoria",
  "empathy",
  "sociability",
  "relaxation",
  "creativity",
  "energy",
  "focus",
  "confidence",
  "pleasure",
  "bliss",
  "love",
  "enhanced",
  "increased",
  "heightened",
];

const NEGATIVE_INDICATORS = [
  "anxiety",
  "paranoia",
  "nausea",
  "headache",
  "insomnia",
  "confusion",
  "dizziness",
  "tremor",
  "sweating",
  "vasoconstriction",
  "tachycardia",
  "dehydration",
  "muscle tension",
  "jaw clenching",
  "decreased",
  "impaired",
  "difficulty",
  "suppression",
];

export function detectEffectCategory(
  effectName: string
): "positive" | "neutral" | "negative" {
  const lower = effectName.toLowerCase();

  for (const indicator of NEGATIVE_INDICATORS) {
    if (lower.includes(indicator)) return "negative";
  }

  for (const indicator of POSITIVE_INDICATORS) {
    if (lower.includes(indicator)) return "positive";
  }

  return "neutral";
}

// === Legal Status Parsing ===

const COUNTRY_ALIASES: Record<string, string> = {
  // United States
  usa: "United States",
  us: "United States",
  "u.s.": "United States",
  "u.s.a.": "United States",
  "united states": "United States",
  "united states of america": "United States",
  america: "United States",
  // United Kingdom
  uk: "United Kingdom",
  "u.k.": "United Kingdom",
  "united kingdom": "United Kingdom",
  gb: "United Kingdom",
  "great britain": "United Kingdom",
  britain: "United Kingdom",
  england: "United Kingdom",
  // Germany
  de: "Germany",
  germany: "Germany",
  deutschland: "Germany",
  // France
  fr: "France",
  france: "France",
  // Canada
  ca: "Canada",
  canada: "Canada",
  // Australia
  au: "Australia",
  australia: "Australia",
  // Netherlands
  nl: "Netherlands",
  netherlands: "Netherlands",
  "the netherlands": "Netherlands",
  holland: "Netherlands",
  // Switzerland
  ch: "Switzerland",
  switzerland: "Switzerland",
  schweiz: "Switzerland",
  suisse: "Switzerland",
  // Italy
  it: "Italy",
  italy: "Italy",
  italia: "Italy",
  // Spain
  es: "Spain",
  spain: "Spain",
  espana: "Spain",
  españa: "Spain",
  // Brazil
  br: "Brazil",
  brazil: "Brazil",
  brasil: "Brazil",
  // Sweden
  se: "Sweden",
  sweden: "Sweden",
  sverige: "Sweden",
  // Norway
  no: "Norway",
  norway: "Norway",
  norge: "Norway",
  // Denmark
  dk: "Denmark",
  denmark: "Denmark",
  danmark: "Denmark",
  // Austria
  at: "Austria",
  austria: "Austria",
  österreich: "Austria",
  osterreich: "Austria",
  // Belgium
  be: "Belgium",
  belgium: "Belgium",
  belgique: "Belgium",
  belgie: "Belgium",
  // Poland
  pl: "Poland",
  poland: "Poland",
  polska: "Poland",
  // Czech Republic
  cz: "Czech Republic",
  "czech republic": "Czech Republic",
  czechia: "Czech Republic",
  // Russia
  ru: "Russia",
  russia: "Russia",
  "russian federation": "Russia",
  // Japan
  jp: "Japan",
  japan: "Japan",
  // China
  cn: "China",
  china: "China",
  // New Zealand
  nz: "New Zealand",
  "new zealand": "New Zealand",
  // Portugal
  pt: "Portugal",
  portugal: "Portugal",
  // Ireland
  ie: "Ireland",
  ireland: "Ireland",
  // Finland
  fi: "Finland",
  finland: "Finland",
  // Hungary
  hu: "Hungary",
  hungary: "Hungary",
  // Israel
  il: "Israel",
  israel: "Israel",
  // South Africa
  za: "South Africa",
  "south africa": "South Africa",
  // Mexico
  mx: "Mexico",
  mexico: "Mexico",
  // Argentina
  ar: "Argentina",
  argentina: "Argentina",
  // India
  in: "India",
  india: "India",
  // Singapore
  sg: "Singapore",
  singapore: "Singapore",
  // Latvia
  lv: "Latvia",
  latvia: "Latvia",
  // Romania
  ro: "Romania",
  romania: "Romania",
  // Slovakia
  sk: "Slovakia",
  slovakia: "Slovakia",
  // Slovenia
  si: "Slovenia",
  slovenia: "Slovenia",
  // Croatia
  hr: "Croatia",
  croatia: "Croatia",
  // Estonia
  ee: "Estonia",
  estonia: "Estonia",
  // Lithuania
  lt: "Lithuania",
  lithuania: "Lithuania",
  // Greece
  gr: "Greece",
  greece: "Greece",
  // Turkey
  tr: "Turkey",
  turkey: "Turkey",
  // Thailand
  th: "Thailand",
  thailand: "Thailand",
  // South Korea
  kr: "South Korea",
  "south korea": "South Korea",
  korea: "South Korea",
  // Taiwan
  tw: "Taiwan",
  taiwan: "Taiwan",
  // Hong Kong
  hk: "Hong Kong",
  "hong kong": "Hong Kong",
  // Malaysia
  my: "Malaysia",
  malaysia: "Malaysia",
  // Indonesia
  id: "Indonesia",
  indonesia: "Indonesia",
  // Philippines
  ph: "Philippines",
  philippines: "Philippines",
  // Vietnam
  vn: "Vietnam",
  vietnam: "Vietnam",
  // Colombia
  co: "Colombia",
  colombia: "Colombia",
  // Chile
  cl: "Chile",
  chile: "Chile",
  // Peru
  pe: "Peru",
  peru: "Peru",
  // Ecuador
  ec: "Ecuador",
  ecuador: "Ecuador",
  // Uruguay
  uy: "Uruguay",
  uruguay: "Uruguay",
};

export function normalizeCountry(country: string): string {
  const lower = country.toLowerCase().trim();
  return COUNTRY_ALIASES[lower] || country;
}

/**
 * Clean "citation needed" markers from text
 */
function cleanCitationNeeded(text: string): string {
  if (!text) return text;
  return text
    .replace(/\s*\[?citation needed\]?\s*/gi, " ")
    .replace(/\s*\[?\[citation needed\]\]?\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Extract legal classification (status) and additional notes from a full legal text.
 *
 * Examples:
 * - "Schedule I controlled substance" → { status: "Schedule I", notes: "controlled substance" }
 * - "Class A drug under the Misuse of Drugs Act" → { status: "Class A", notes: "drug under the Misuse of Drugs Act" }
 * - "Illegal since 2015" → { status: "Illegal since 2015", notes: "" }
 */
export function extractStatusAndNotes(fullText: string): { status: string; notes: string } {
  if (!fullText || fullText.trim() === "") {
    return { status: "", notes: "" };
  }

  // Clean citation needed markers first
  const text = cleanCitationNeeded(fullText.trim());

  // Try to extract classification patterns (Schedule X, Class X, Anlage X, etc.)
  const classificationPatterns = [
    /^(Schedule\s+[IVX0-9]+)/i,
    /^(Class\s+[A-C])/i,
    /^(Anlage\s+[IVX0-9]+)/i,
    /^(List\s+[IVX0-9]+)/i,
    /^(Tabella\s+[IVX0-9]+)/i,
    /^(Förteckning\s+[IVX0-9]+)/i,
    /^(Category\s+[A-Z0-9]+)/i,
    /^(Controlled)/i,
    /^(Prohibited)/i,
    /^(Illegal)/i,
    /^(Legal)/i,
    /^(Uncontrolled)/i,
    /^(Decriminalized)/i,
    /^(Not scheduled)/i,
  ];

  for (const pattern of classificationPatterns) {
    const match = text.match(pattern);
    if (match) {
      const status = match[1];
      const remainder = text.slice(match[0].length).replace(/^[\s,\-–:]+/, "").trim();
      return { status, notes: remainder };
    }
  }

  // If no classification found and text is short, use it as status
  if (text.length < 80) {
    return { status: text, notes: "" };
  }

  // For longer text, use first sentence as status (no length limit)
  const sentenceEnd = text.search(/[.!?](?:\s|$)/);
  if (sentenceEnd > 0) {
    return {
      status: text.slice(0, sentenceEnd + 1).trim(),
      notes: text.slice(sentenceEnd + 1).trim()
    };
  }

  // No sentence break found - use full text as status (no truncation)
  return { status: text, notes: "" };
}

// === Interaction Severity Detection ===

export function detectInteractionSeverity(
  text: string
): "dangerous" | "unsafe" | "caution" | "low-risk-synergy" | "low-risk-decrease" | "low-risk-no-synergy" {
  const lower = text.toLowerCase();

  if (
    lower.includes("dangerous") ||
    lower.includes("fatal") ||
    lower.includes("life-threatening") ||
    lower.includes("serotonin syndrome") ||
    lower.includes("death")
  ) {
    return "dangerous";
  }

  if (
    lower.includes("unsafe") ||
    lower.includes("avoid") ||
    lower.includes("do not combine") ||
    lower.includes("serious")
  ) {
    return "unsafe";
  }

  if (
    lower.includes("caution") ||
    lower.includes("care") ||
    lower.includes("monitor") ||
    lower.includes("reduce dose")
  ) {
    return "caution";
  }

  if (lower.includes("synergy") || lower.includes("enhance") || lower.includes("potentiate")) {
    return "low-risk-synergy";
  }

  if (lower.includes("decrease") || lower.includes("diminish") || lower.includes("reduce effect")) {
    return "low-risk-decrease";
  }

  return "low-risk-no-synergy";
}

// === Text Cleaning ===

/**
 * Regex pattern for markdown links that handles URLs containing parentheses
 * e.g., [Lithium](http://en.wikipedia.org/wiki/Lithium_(medication))
 *
 * Pattern explanation:
 * - \[([^\]]+)\] - Capture link text (anything except ])
 * - \( - Opening paren of URL
 * - ([^()]*(?:\([^)]*\)[^()]*)*) - URL content that may contain balanced parens
 *   - [^()]* - Characters that aren't ( or )
 *   - (?:\([^)]*\)[^()]*)* - Zero or more (content) groups followed by non-paren chars
 * - \) - Closing paren of URL
 */
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^()]*(?:\([^)]*\)[^()]*)*)\)/g;

/**
 * Strip markdown links from text, keeping only the link text
 * Use this BEFORE applying sentence-boundary regexes to avoid URL periods causing truncation
 * Handles URLs containing parentheses like Wikipedia links: Lithium_(medication)
 */
export function stripMarkdownLinks(text: string): string {
  return text.replace(MARKDOWN_LINK_PATTERN, "$1");
}

export function cleanMarkdown(text: string): string {
  return text
    // Remove complete markdown links [text](url) - handles URLs with parentheses
    .replace(MARKDOWN_LINK_PATTERN, "$1")
    // Remove incomplete markdown links [text](partial... (missing closing paren)
    .replace(/\[([^\]]+)\]\([^)]*$/g, "$1")
    // Remove orphaned brackets [text] not followed by (
    .replace(/\[([^\]]+)\](?!\()/g, "$1")
    // Remove bold
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    // Remove italic
    .replace(/\*([^*]+)\*/g, "$1")
    // Remove code backticks
    .replace(/`([^`]+)`/g, "$1")
    // Remove header markers
    .replace(/#+\s*/g, "")
    // Remove leftover opening brackets at start or closing brackets at end
    .replace(/^\[|\]$/g, "")
    .trim();
}

export function stripReferences(text: string): string {
  return text.replace(/\[\d+\]/g, "").trim();
}
