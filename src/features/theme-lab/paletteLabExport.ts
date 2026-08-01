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
