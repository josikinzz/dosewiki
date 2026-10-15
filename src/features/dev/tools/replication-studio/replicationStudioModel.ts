export type StudioMediaType = "image" | "video" | "audio";
export type StudioRole = "replication" | "figure";

export const STUDIO_RIGHTS_STATUSES = [
  "unknown",
  "creator-retained",
  "explicit-license",
  "permission-granted",
  "public-domain",
] as const;
export type StudioRightsStatus = (typeof STUDIO_RIGHTS_STATUSES)[number];

export const RIGHTS_STATUS_LABELS: Record<StudioRightsStatus, string> = {
  unknown: "Unknown",
  "creator-retained": "Creator retains rights",
  "explicit-license": "Explicit license",
  "permission-granted": "Permission granted",
  "public-domain": "Public domain",
};

export const STUDIO_SETTABLE_RIGHTS: readonly StudioRightsStatus[] = ["unknown", "creator-retained"];

export type StudioPublicationState = "published" | "unpublished" | "duplicate-suppressed";

export type StudioRow = {
  id: string;
  slug: string;
  title: string;
  artist: string;
  artist_url: string | null;
  role: StudioRole;
  type: StudioMediaType;
  effect_slug: string | null;
  effect_name: string | null;
  effect_tags: string[];
  title_drugs?: {
    slug: string;
    name: string;
    class: "psychedelics" | "dissociatives" | "deliriants" | "other";
    matched_title_text: string;
  }[];
  title_class_mentions?: {
    class: "psychedelics" | "dissociatives" | "deliriants" | "other";
    matched_title_text: string;
  }[];
  credit_line: string | null;
  source_url?: string | null;
  rights_status?: StudioRightsStatus | null;
  publication_state?: StudioPublicationState;
  source_sha256?: string | null;
  width?: number | null;
  height?: number | null;
  url: string | null;
  thumbnail_url: string | null;
  preview_url?: string | null;
  format: string;
  duration: number | null;
  file_size: number | null;
  created_at: string;
  showcase_excluded?: boolean;
};

export type StudioEffectOption = { slug: string; name: string };

export type StudioGroupBy = "none" | "effect" | "artist" | "type";

export type StudioFacetKind = "type" | "role" | "artist" | "effect";

export type StudioFacets = Record<StudioFacetKind, string[]>;

export type StudioFilterState = {
  query: string;
  group: StudioGroupBy;
  facets: StudioFacets;
};

export type StudioFacetCount = { key: string; label: string; count: number };

export type StudioGroup = { key: string; label: string | null; rows: StudioRow[] };

export const EMPTY_STUDIO_FACETS: StudioFacets = {
  type: [],
  role: [],
  artist: [],
  effect: [],
};

export const NO_EFFECT_KEY = "__none__";

const TITLE_CASE = (value: string) => (value ? value[0].toUpperCase() + value.slice(1) : value);

function rowMatchesQuery(row: StudioRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return [row.title, row.artist, row.slug, row.effect_name ?? "", row.effect_slug ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export function filterStudioRows(rows: readonly StudioRow[], state: StudioFilterState): StudioRow[] {
  const type = new Set(state.facets.type);
  const role = new Set(state.facets.role);
  const artist = new Set(state.facets.artist);
  const effect = new Set(state.facets.effect);

  return rows.filter((row) => {
    if (!rowMatchesQuery(row, state.query)) return false;
    if (type.size > 0 && !type.has(row.type)) return false;
    if (role.size > 0 && !role.has(row.role)) return false;
    if (artist.size > 0 && !artist.has(row.artist)) return false;
    if (effect.size > 0 && !effect.has(row.effect_slug ?? NO_EFFECT_KEY)) return false;
    return true;
  });
}

function byCountThenLabel(a: readonly [string, StudioRow[]], b: readonly [string, StudioRow[]]) {
  return b[1].length - a[1].length || a[0].localeCompare(b[0]);
}

export function groupStudioRows(rows: readonly StudioRow[], group: StudioGroupBy): StudioGroup[] {
  if (group === "none") {
    return [{ key: "all", label: null, rows: [...rows] }];
  }

  const buckets = new Map<string, StudioRow[]>();
  for (const row of rows) {
    const label = group === "effect"
      ? row.effect_name ?? "No effect"
      : group === "artist"
        ? row.artist
        : TITLE_CASE(row.type);
    const bucket = buckets.get(label);
    if (bucket) {
      bucket.push(row);
    } else {
      buckets.set(label, [row]);
    }
  }

  return [...buckets.entries()]
    .sort(byCountThenLabel)
    .map(([label, groupRows]) => ({ key: label, label, rows: groupRows }));
}

export function liveFacetCounts(
  rows: readonly StudioRow[],
  state: StudioFilterState,
  kind: StudioFacetKind,
): Map<string, number> {
  const others = filterStudioRows(rows, { ...state, facets: { ...state.facets, [kind]: [] } });
  const counts = new Map<string, number>();
  for (const row of others) {
    const key = facetKeyOf(row, kind);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function facetKeyOf(row: StudioRow, kind: StudioFacetKind): string {
  return kind === "type"
    ? row.type
    : kind === "role"
      ? row.role
      : kind === "artist"
        ? row.artist
        : row.effect_slug ?? NO_EFFECT_KEY;
}

export function facetCounts(
  rows: readonly StudioRow[],
  kind: StudioFacetKind,
  effectNames: ReadonlyMap<string, string>,
): StudioFacetCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = facetKeyOf(row, kind);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const label = (key: string) => {
    if (kind === "effect") {
      return key === NO_EFFECT_KEY ? "No effect" : effectNames.get(key) ?? key;
    }
    if (kind === "type" || kind === "role") {
      return TITLE_CASE(key);
    }
    return key;
  };

  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: label(key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function toggleFacetValue(facets: StudioFacets, kind: StudioFacetKind, key: string): StudioFacets {
  const current = facets[kind];
  const next = current.includes(key) ? current.filter((value) => value !== key) : [...current, key];
  return { ...facets, [kind]: next };
}

export function activeFacetCount(facets: StudioFacets): number {
  return facets.type.length + facets.role.length + facets.artist.length + facets.effect.length;
}

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 80;

const UNDECOMPOSABLE_LATIN: Record<string, string> = {
  "ł": "l", "đ": "d", "ð": "d", "ø": "o", "þ": "th", "ß": "ss", "æ": "ae", "œ": "oe", "ı": "i", "ħ": "h", "ŋ": "n", "ĸ": "k",
};

export function kebab(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[łđðøþßæœıħŋĸ]/g, (character) => UNDECOMPOSABLE_LATIN[character] ?? character)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildReplicationSlug(
  title: string,
  artist: string,
  takenSlugs: Iterable<string>,
): string {
  const titlePart = kebab(title);
  const artistPart = kebab(artist);
  const joined = [titlePart, artistPart].filter(Boolean).join("-");
  const base = (joined || "untitled-media").slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, "")
    || "untitled-media";

  const taken = new Set(takenSlugs);
  if (!taken.has(base)) {
    return base;
  }
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base.slice(0, MAX_SLUG_LENGTH - String(suffix).length - 1)}-${suffix}`
      .replace(/-+/g, "-");
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Could not find a free slug for "${title}".`);
}

export function isValidReplicationSlug(slug: string): boolean {
  return KEBAB_CASE.test(slug);
}

export function inferMediaType(file: { type: string; name: string }): StudioMediaType {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/") || /\.mp3$/i.test(file.name)) return "audio";
  return "image";
}

export function fileFormat(name: string): string {
  const extension = name.split(".").pop() ?? "";
  return extension.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
}

export function formatDuration(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function isUnpublished(row: Pick<StudioRow, "publication_state">): boolean {
  return row.publication_state === "unpublished";
}

export const LOW_RESOLUTION_MIN_EDGE = 800;

export function isLowResolution(width: number, height: number): boolean {
  return Math.min(width, height) < LOW_RESOLUTION_MIN_EDGE;
}

export async function fileSha256(file: Blob): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
