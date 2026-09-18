import {
  THEME_EXPORT_FORMAT,
  emptyOverrides,
  type PaletteOverrides,
  type ThemeOverrides,
} from "./themeLabStorage";
import { lookKey, parseLookKey, type LabLook } from "./themeLabLook";
import type { ThemeDefaults } from "./presetBaselines";

/**
 * The lab's portable palette payload: what "copy colors" produces and what the
 * JSON box accepts back.
 *
 * Two properties matter:
 *
 * 1. **Stamped.** The payload records the look it was measured against — the
 *    visual style, as a `lookKey` string — so a paste can say where its numbers
 *    came from instead of arriving anonymous.
 * 2. **Idempotent.** Values are stored as the *diff* against what the target
 *    actually renders, so export → import of an untouched look yields zero edits
 *    rather than several hundred redundant ones.
 *
 * The stamp is a record, not an instruction: importing applies the payload to the
 * look the visitor is wearing. Navigating them somewhere else on paste would move
 * the appearance controls under them, and the literal colours in a payload paint
 * the same wherever they land. A pre-hue stamp (`style|accent|surface`) parses
 * through the same legacy mapping every stored key does.
 */

type ThemeExportPayload = {
  /** Format stamp — same number the stored envelope carries. */
  themeLab: number;
  /** The look these values were measured against, as `lookKey` writes it. */
  look: string;
  overrides: PaletteOverrides;
}

function buildThemeExport(look: LabLook, effective: PaletteOverrides): ThemeExportPayload {
  return { themeLab: THEME_EXPORT_FORMAT, look: lookKey(look), overrides: effective };
}

export function serializeThemeExport(look: LabLook, effective: PaletteOverrides): string {
  return JSON.stringify(buildThemeExport(look, effective), null, 2);
}

export type ParsedThemeImport = {
  /** The look the payload names, when it carried a stamp this build understands.
   *  `null` means "unstamped or unrecognised" — the values are taken at face
   *  value either way. */
  look: LabLook | null;
  /** Only the schemes the payload actually described; an omitted scheme keeps
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
  const stamped = record.overrides !== undefined || record.look !== undefined;
  const maps = (stamped ? record.overrides : record) as Record<string, unknown> | undefined;
  const dark = readThemeMap(maps?.dark);
  const light = readThemeMap(maps?.light);

  // Refuse rather than wipe both schemes to empty when neither key is usable.
  if (!dark && !light) {
    return { value: null, error: 'Needs a "dark" and/or "light" color object.' };
  }

  const overrides: Partial<PaletteOverrides> = {};
  if (dark) overrides.dark = dark;
  if (light) overrides.light = light;

  return { value: { look: stamped ? parseLookKey(record.look) : null, overrides }, error: null };
}

/** Keep only the tokens that actually differ from what the target renders. */
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
  /** Sampled values for the look being worn. There is no JS-side base layer to
   *  diff against any more — the accent, surface, style and scheme stylesheets
   *  decide what a token resolves to, and this is that reading. */
  baselines: ThemeDefaults | null;
  /** Edits already stored on the look being worn. */
  currentEdits: PaletteOverrides;
};

/**
 * Turn a parsed payload into the edit map to store on the look being worn.
 *
 * A scheme the payload omits keeps its existing edits: a paste that only
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
    next[theme] = diffThemeMap(payload, (id) => target.baselines?.[theme]?.[id]);
  }
  return next;
}
