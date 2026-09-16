/**
 * Pure browse/organize logic for the Replication Studio.
 *
 * Everything here is a function of the loaded corpus and the studio's filter
 * state, with no React and no Postgres, so the parts that decide what the grid
 * shows and what a new row is called can be tested directly.
 */

export type StudioMediaType = "image" | "video" | "audio";
export type StudioRole = "replication" | "figure";

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
  rights_status?: string | null;
  url: string | null;
  thumbnail_url: string | null;
  /** Low-resolution muted video rendition used for bounded preview playback. */
  preview_url?: string | null;
  format: string;
  duration: number | null;
  file_size: number | null;
  created_at: string;
  /** Retired from every substance showcase candidate pool. */
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

/** The effect bucket a row with no `effect_slug` falls into, in facets and groups alike. */
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

/**
 * A facet with nothing checked means "no opinion", not "match nothing" — the
 * rail starts empty and must not hide the corpus before anything is chosen.
 * Facets of different kinds intersect; values within one kind union.
 */
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

/** Biggest group first, then alphabetical, so the corpus's shape is visible at a glance. */
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

/**
 * Facet counts are computed over the whole corpus rather than the filtered set,
 * so a checked facet does not rewrite the numbers beside its own siblings while
 * you are still deciding.
 */
export function facetCounts(
  rows: readonly StudioRow[],
  kind: StudioFacetKind,
  effectNames: ReadonlyMap<string, string>,
): StudioFacetCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = kind === "type"
      ? row.type
      : kind === "role"
        ? row.role
        : kind === "artist"
          ? row.artist
          : row.effect_slug ?? NO_EFFECT_KEY;
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

/* ------------------------------------------------------------------- slugs */

/** The slug shape every public replication URL and `gallery_order` entry uses. */
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 80;

/**
 * Latin letters that are not an accented base letter plus a combining mark, so
 * NFKD leaves them intact and the `[^a-z0-9]` sweep below would drop them from
 * the middle of a name. The corpus already contains the answers these produce
 * ("…-zdzislaw-beksinski"), so a name goes on reading as itself in the URL.
 */
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

/**
 * Build the slug for a newly uploaded asset the way the corpus already reads:
 * kebab title, then the artist, because "untitled" and "geometry" are titles
 * several artists have used and the slug is the public URL.
 *
 * Collisions are resolved by suffixing `-2`, `-3`, … rather than by failing:
 * the tray creates rows one at a time and a second copy of a title is a normal
 * thing to upload, not an error. Postgres still refuses a duplicate on insert, so
 * a slug that races another session fails there rather than silently shadowing.
 */
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

/* ------------------------------------------------------------------ upload */

/** What a dropped file will become, decided from its MIME type then its name. */
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
