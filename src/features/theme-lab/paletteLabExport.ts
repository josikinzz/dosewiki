import { DEFAULT_ACCENT_ID, PRO_ACCENT_SEED_NAMES } from "@/theme/accents";
import { formatColor, parseColorToRgba } from "./colorUtils";
import {
  THEME_SHARE_FORMAT,
  emptyOverrides,
  type PaletteOverrides,
  type ThemeOverrides,
  type ThemeRef,
} from "./paletteLabStorage";
import type { ThemeDefaults } from "./presetBaselines";

/**
 * The lab's portable theme payload: what "copy colors" produces and what the
 * JSON box accepts back.
 *
 * Two properties matter and neither used to hold:
 *
 * 1. **Stamped.** The payload says which theme it describes, so pasting an
 *    export back re-selects that theme instead of silently re-labelling the
 *    look as edits on the default palette.
 * 2. **Idempotent.** Values are stored as the *diff* against the target theme's
 *    own values, so export → import of an untouched theme yields zero edits
 *    rather than several hundred redundant ones.
 *
 * The payload stays self-contained (every token it names carries its value), so
 * the same shape can back share codes without another format.
 */

export type ThemeExportPayload = {
  /** Format stamp — same number the stored envelope carries. */
  themeLab: number;
  /** The theme these values describe. */
  theme: ThemeRef;
  overrides: PaletteOverrides;
};

export function buildThemeExport(ref: ThemeRef, effective: PaletteOverrides): ThemeExportPayload {
  return { themeLab: THEME_SHARE_FORMAT, theme: ref, overrides: effective };
}

export function serializeThemeExport(ref: ThemeRef, effective: PaletteOverrides): string {
  return JSON.stringify(buildThemeExport(ref, effective), null, 2);
}

export type ParsedThemeImport = {
  /** The stamp, when the payload carried one. `null` means "unstamped" — those
   *  diff against whatever the visitor is currently wearing. */
  ref: ThemeRef | null;
  /** Only the themes the payload actually described; an omitted theme keeps
   *  whatever the visitor already had. */
  overrides: Partial<PaletteOverrides>;
};

/** One shape rather than a discriminated union: this repo compiles with
 *  `strictNullChecks` off, where union narrowing on a boolean tag is not
 *  reliable. A parse either yields a payload or an explanation. */
export type ThemeImportResult = { value: ParsedThemeImport | null; error: string | null };

function readThemeMap(value: unknown): ThemeOverrides | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result: ThemeOverrides = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") result[key] = entry;
  }
  return result;
}

function readRef(value: unknown): ThemeRef | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!id) return null;
  return { kind: record.kind === "custom" ? "custom" : "preset", id };
}

/**
 * Accepts a stamped payload or a bare `{dark, light}` blob (what every export
 * before this looked like, and what a hand-written paste tends to be).
 */
export function parseThemeImport(text: string): ThemeImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    return { value: null, error: "That isn't valid JSON." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { value: null, error: 'Needs a "dark" and/or "light" color object.' };
  }

  const record = parsed as Record<string, unknown>;
  const stamped = record.overrides !== undefined || record.theme !== undefined;
  const maps = (stamped ? record.overrides : record) as Record<string, unknown> | undefined;
  const dark = readThemeMap(maps?.dark);
  const light = readThemeMap(maps?.light);

  // Refuse rather than wipe both themes to empty when neither key is usable.
  if (!dark && !light) {
    return { value: null, error: 'Needs a "dark" and/or "light" color object.' };
  }

  const overrides: Partial<PaletteOverrides> = {};
  if (dark) overrides.dark = dark;
  if (light) overrides.light = light;

  return { value: { ref: stamped ? readRef(record.theme) : null, overrides }, error: null };
}

/** Keep only the tokens that actually differ from the theme's own value. */
function diffThemeMap(
  payload: ThemeOverrides,
  baseValue: (id: string) => string | undefined,
): ThemeOverrides {
  const result: ThemeOverrides = {};
  for (const [id, value] of Object.entries(payload)) {
    const base = baseValue(id);
    if (base !== undefined && base.trim() === value.trim()) continue;
    result[id] = value;
  }
  return result;
}

export type ImportTarget = {
  /** The target theme's own layer (preset literals, plus a custom slot's). */
  base: PaletteOverrides;
  /** Sampled values for the target theme — catches tokens the base derives
   *  rather than names. */
  baselines: ThemeDefaults | null;
  /** Edits already stored on the target theme. */
  currentEdits: PaletteOverrides;
};

/**
 * Turn a parsed payload into the edit map to store on the target theme.
 *
 * A theme the payload omits keeps its existing edits: a paste that only
 * describes dark must not silently reset light.
 */
export function editsFromImport(
  parsed: ParsedThemeImport,
  target: ImportTarget,
): PaletteOverrides {
  const next = emptyOverrides();
  for (const theme of ["dark", "light"] as const) {
    const payload = parsed.overrides[theme];
    if (!payload) {
      next[theme] = target.currentEdits[theme] ?? {};
      continue;
    }
    next[theme] = diffThemeMap(
      payload,
      (id) => target.base[theme]?.[id] ?? target.baselines?.[theme]?.[id],
    );
  }
  return next;
}

/* ---------------------------------------------------------------- accent entry */

/**
 * The other thing an editor takes out of the lab: one entry for the accent table
 * in `src/theme/accents.ts`.
 *
 * A share code carries a look to another browser; this carries a tuned accent
 * back into the repository, which is the only place an accent can actually ship
 * from. Same sending surface, because both answer "I am done tuning — now what?"
 *
 * Only the swatch and the Pro seeds are measured. `id`, `label` and `funPresetId`
 * are the combination the values were read in, offered as a starting point: a new
 * accent needs an id added to `AccentId` first, and the emitted comment says so.
 */
export type AccentEntryDraft = {
  /** The accent the seeds were measured under — the value of `data-accent`, or
   *  the default when the attribute is absent. */
  id: string;
  label: string;
  /** The accent's own Fun half when it declares one, else the colourway being
   *  worn — the best guess for an accent that does not exist yet. */
  funPresetId: string;
  /** Measured Fun-dark `--theme-accent`: the swatch is a measurement, not a choice. */
  swatch: string;
  /** Rendered `--ei-*` seeds per colour scheme. Keys outside
   *  {@link PRO_ACCENT_SEED_NAMES} are ignored, which is what keeps light at nine
   *  declarations and dark at eight. */
  pro: { light: Record<string, string>; dark: Record<string, string> };
};

/** Normalize a sampled value the way the lab writes colors: hex when opaque,
 *  `rgba()` when not. A value the canvas cannot read (a gradient, an empty
 *  sample) is emitted verbatim rather than dropped, so a bad seed is visible in
 *  the paste instead of silently missing from it. */
function accentValue(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim();
  const rgba = parseColorToRgba(trimmed);
  return rgba ? formatColor(rgba) : trimmed;
}

function seedBlock(scheme: "light" | "dark", values: Record<string, string>): string {
  return [
    `    ${scheme}: {`,
    ...PRO_ACCENT_SEED_NAMES[scheme].map(
      (id) => `      ${JSON.stringify(id)}: ${JSON.stringify(accentValue(values[id]))},`,
    ),
    "    },",
  ].join("\n");
}

/**
 * Serialize a draft as the `Accent` literal `accents.ts` declares — ready to
 * paste, with the comment discipline that file's own entries carry stubbed out
 * rather than skipped. `blue` is the worked example the header points at.
 */
export function serializeAccentEntry(draft: AccentEntryDraft): string {
  // `default` is a reserved word, and `accents.ts` already calls its own entry
  // `defaultAccent`; every other id is a bare identifier.
  const binding = draft.id === DEFAULT_ACCENT_ID ? "defaultAccent" : draft.id;
  return [
    "/**",
    ` * ${draft.label} — TODO: replace this paragraph. Say what the accent IS, not what it`,
    " * contains: the hue angle both halves share, the floors it clears (canvas ≥ 4.5:1, and",
    " * Pro's own 7.4:1 base / 9.2:1 strong on charcoal), and every value that departs from a",
    " * pure rotation, with the reason. `blue` is the worked example — an entry that lists only",
    " * hexes tells the next editor nothing.",
    " *",
    " * `id`, `label` and `funPresetId` are the combination these values were measured in, not a",
    " * decision: a new accent needs its own id added to `AccentId` and its own Fun colourway.",
    " */",
    `const ${binding}: Accent = {`,
    `  id: ${JSON.stringify(draft.id)},`,
    `  label: ${JSON.stringify(draft.label)},`,
    "  // Measured, not chosen: the rendered Fun-dark `--theme-accent`.",
    `  swatch: ${JSON.stringify(accentValue(draft.swatch))},`,
    `  funPresetId: ${JSON.stringify(draft.funPresetId)},`,
    "  pro: {",
    seedBlock("light", draft.pro.light),
    seedBlock("dark", draft.pro.dark),
    "  },",
    "};",
    "",
  ].join("\n");
}
