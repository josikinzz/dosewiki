import type { ColorScheme } from "@/theme";
import { CHROME_DARK_CLASS } from "@/theme/chromeDark";
import { paletteTokenRole } from "@/theme/paletteOwnership";
import { DEFAULT_LOOK, lookKey, parseLookKey } from "./themeLabLook";

/**
 * Theme Lab persistence and DOM application — the two ends of the feature's
 * only real contract: *stored envelope in → applied document state out*.
 *
 * This module deliberately owns no React and no component state. The panel used
 * to hold all of it, which meant a saved look only ever applied once the panel
 * had been opened; the runtime (`themeLabRuntime.ts`) now uses these helpers
 * as the tool route mounts, and the panel became a subscriber.
 */

/** localStorage key. The string keeps the tool's old word on purpose: it is
 *  persisted reader data, and every saved visitor look lives under it. Renaming
 *  it would silently discard every reader's theme. */
export const THEME_LAB_STORAGE_KEY = "dosewiki-palette-lab";

/** Id of the `<style>` element the lab injects into `<head>`. */
export const THEME_LAB_OVERRIDE_STYLE_ID = "theme-lab-overrides";

/** Debounce before a change is written to storage. */
export const THEME_LAB_PERSIST_DELAY_MS = 300;

/** Sentinel shared by the prepaint restore, runtime and editor controls. */
export const BLUR_TOKEN_ID = "--theme-backdrop-blur";

export function blurDisabledIn(overrides: PaletteOverrides): boolean {
  return (
    overrides.dark[BLUR_TOKEN_ID]?.trim() === "off" ||
    overrides.light[BLUR_TOKEN_ID]?.trim() === "off"
  );
}

export type ThemeOverrides = Record<string, string>;

/** One override map per colour scheme, in the exact shape the injected style
 *  element uses. */
export type PaletteOverrides = Record<ColorScheme, ThemeOverrides>;
type RolePaletteOverrides = {
  surfaceOverrides: PaletteOverrides;
  accentOverrides: PaletteOverrides;
  semanticOverrides: PaletteOverrides;
  residualOverrides: PaletteOverrides;
}

export function partitionOverrides(overrides: PaletteOverrides): RolePaletteOverrides {
  const result: RolePaletteOverrides = {
    surfaceOverrides: emptyOverrides(),
    accentOverrides: emptyOverrides(),
    semanticOverrides: emptyOverrides(),
    residualOverrides: emptyOverrides(),
  };
  for (const theme of ["dark", "light"] as const) {
    for (const [token, value] of Object.entries(overrides[theme] ?? {})) {
      const role = paletteTokenRole(token);
      result[`${role}Overrides`][theme][token] = value;
    }
  }
  return result;
}

/** Version of the portable export payload the copy/export path stamps. The
 *  envelope no longer carries it: nothing but that payload is portable. */
export const THEME_EXPORT_FORMAT = 1;

/**
 * v5 localStorage envelope: one edit map per look, and nothing else.
 *
 * The lab used to carry its own competing theme system — a named-preset
 * reference, saved custom slots, a share format — so the envelope had to record
 * *which* of those the visitor was wearing. The four appearance axes own that
 * now, and the reader's own controls persist them; all the lab still has of its
 * own is the tokens the visitor changed, filed under the look (`LabLook`, in
 * `./themeLabLook`) they changed them on.
 *
 * Which look is *active* is therefore not stored here at all — it is read off
 * the live appearance context by `ThemeLabRuntimeMount`.
 */
export type StoredEnvelopeV5 = {
  version: 5;
  editsByLook: Record<string, PaletteOverrides>;
  /** Role-partitioned mirror of `editsByLook`, derived on write. Serialized so a
   *  consumer can tell a surface edit from an accent edit without re-deriving
   *  token ownership. */
  roleEditsByLook: Record<string, RolePaletteOverrides>;
};

export function emptyOverrides(): PaletteOverrides {
  return { dark: {}, light: {} };
}

function defaultEnvelope(): StoredEnvelopeV5 {
  return { version: 5, editsByLook: {}, roleEditsByLook: {} };
}

/** Keep only string-valued entries: a hand-edited or corrupted blob must not be
 *  able to inject objects/numbers into the generated CSS. */
function readThemeMap(value: unknown): ThemeOverrides {
  if (!value || typeof value !== "object") return {};
  const result: ThemeOverrides = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") result[key] = entry;
  }
  return result;
}

function readOverrides(value: unknown): PaletteOverrides {
  const maps = (value ?? {}) as Record<string, unknown>;
  return { dark: readThemeMap(maps.dark), light: readThemeMap(maps.light) };
}

export function isEmptyOverrides(overrides: PaletteOverrides): boolean {
  return Object.keys(overrides.dark).length === 0 && Object.keys(overrides.light).length === 0;
}

/** Drop looks whose edit map is empty, so browsing between styles does not
 *  leave a row of `{}` behind in the envelope. */
export function pruneEdits(
  edits: Record<string, PaletteOverrides>,
): Record<string, PaletteOverrides> {
  const result: Record<string, PaletteOverrides> = {};
  for (const [key, value] of Object.entries(edits)) {
    if (!isEmptyOverrides(value)) result[key] = value;
  }
  return result;
}

/**
 * Read a stored `editsByLook` map, keeping only entries whose key names a look
 * this build still renders.
 *
 * A key naming a retired look is dropped rather than preserved: the map's
 * values are literal colours, and there is no look left to apply them to, so
 * keeping them could only mean painting them over some *other* live palette.
 */
function readEditsByLook(value: unknown): Record<string, PaletteOverrides> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, PaletteOverrides> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const look = parseLookKey(key);
    if (!look) continue;
    result[lookKey(look)] = readOverrides(entry);
  }
  return pruneEdits(result);
}

function roleMirror(
  edits: Record<string, PaletteOverrides>,
): Record<string, RolePaletteOverrides> {
  return Object.fromEntries(
    Object.entries(edits).map(([key, value]) => [key, partitionOverrides(value)]),
  );
}

/** Storage key a v3/v4 envelope filed the active theme's edits under: bare
 *  preset id, or `custom:<id>` for a saved slot. */
function legacyActiveEditKey(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const ref = value as Record<string, unknown>;
  const id = typeof ref.id === "string" ? ref.id.trim() : "";
  if (!id) return null;
  return ref.kind === "custom" ? `custom:${id}` : id;
}

/** Every retired non-base colourway id a pre-v5 envelope could have recorded.
 *  A stored id outside this table (junk, or the base ids) always degraded to
 *  the base look, which is the one palette that still ships. */
const LEGACY_NON_BASE_COLOURWAY_IDS: Record<string, true> = {
  blue: true,
  green: true,
  red: true,
  amber: true,
  neutral: true,
  teal: true,
  abyss: true,
  canopy: true,
  garnet: true,
  sunset: true,
  graphite: true,
};

/**
 * Parse whatever is in storage into a v5 envelope. Never throws: junk, a v1
 * `{dark, light}` blob, a v2 `{presetId, overrides}` envelope, and a v3/v4
 * `{activeThemeRef, editsByPreset, customThemes}` envelope all degrade to
 * something renderable.
 *
 * Migration from any pre-v5 shape is **best-effort and lossy, on purpose**. Only
 * the edit map for the theme the visitor was last wearing survives, filed under
 * the look their stored axes describe. Every other preset's map and every custom
 * slot is dropped, because the named looks those maps diverged from no longer
 * exist — their values are literal colours sampled against a palette this build
 * does not ship, so re-filing them under a live look would paint one theme's
 * colours over a different one. Losing an edit the visitor cannot see any more is
 * the cheaper failure.
 */
export function parseStoredEnvelope(raw: string | null | undefined): StoredEnvelopeV5 {
  if (!raw) return defaultEnvelope();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultEnvelope();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return defaultEnvelope();

  const record = parsed as Record<string, unknown>;

  if (record.version === 5) {
    const editsByLook = readEditsByLook(record.editsByLook);
    return { version: 5, editsByLook, roleEditsByLook: roleMirror(editsByLook) };
  }

  // Pre-v5: find the one edit map that was being worn, then re-file it.
  let overrides: PaletteOverrides;
  if (record.version === 3 || record.version === 4) {
    const activeKey = legacyActiveEditKey(record.activeThemeRef);
    const maps = (record.editsByPreset ?? {}) as Record<string, unknown>;
    overrides = readOverrides(activeKey === null ? undefined : maps[activeKey]);
  } else if (record.version === 2) {
    overrides = readOverrides(record.overrides);
  } else {
    // v1 was the bare `{dark, light}` map itself.
    overrides = readOverrides(record);
  }

  // The colourway axes the legacy envelope recorded. Visual style was never in
  // the envelope — the lab's route was pinned to Fun for the whole life of these
  // shapes — so a visitor worn onto the base colourway (or one whose envelope
  // recorded nothing) re-files under the Fun look. A named alternate colourway
  // was retired with the hue axis: its edits are literal colours sampled against
  // a palette this build does not ship, so they are dropped rather than painted
  // over the base palette. Hardcoded legacy ids, not live imports: these strings
  // exist only inside old storage blobs now.
  const wornRetiredColourway =
    LEGACY_NON_BASE_COLOURWAY_IDS[record.activeAccentId as string] === true ||
    LEGACY_NON_BASE_COLOURWAY_IDS[record.activeSurfaceId as string] === true;
  const editsByLook = wornRetiredColourway
    ? {}
    : pruneEdits({ [lookKey(DEFAULT_LOOK)]: overrides });
  return { version: 5, editsByLook, roleEditsByLook: roleMirror(editsByLook) };
}

/**
 * Serialize an envelope. Only the edit maps are an input: the version stamp and
 * the role-partitioned mirror are derived here, so a caller holding live state
 * (the runtime's store snapshot) can hand it over without assembling — or being
 * able to disagree with — either.
 */
export function serializeEnvelope(envelope: Pick<StoredEnvelopeV5, "editsByLook">): string {
  const editsByLook = pruneEdits(envelope.editsByLook);
  return JSON.stringify({
    version: 5,
    editsByLook,
    roleEditsByLook: roleMirror(editsByLook),
  });
}

/**
 * Read the saved envelope. `available` is false when storage itself is
 * unreachable (private mode, blocked cookies, a hostile extension) — the panel
 * surfaces that instead of promising the look is "saved to this browser".
 */
export function readStoredEnvelope(): {
  envelope: StoredEnvelopeV5;
  available: boolean;
  /** Exactly what was in storage, so a legacy shape can be rewritten in place. */
  raw: string | null;
} {
  if (typeof window === "undefined") {
    return { envelope: defaultEnvelope(), available: false, raw: null };
  }
  try {
    const raw = window.localStorage.getItem(THEME_LAB_STORAGE_KEY);
    return { envelope: parseStoredEnvelope(raw), available: true, raw };
  } catch {
    return { envelope: defaultEnvelope(), available: false, raw: null };
  }
}

/** Write a pre-serialized envelope. Returns false when the write failed, which
 *  is the signal the panel turns into an honest status line. */
export function writeSerializedEnvelope(serialized: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(THEME_LAB_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

/**
 * Selector for the visitor's own layer in one colour scheme.
 *
 * `data-theme` is named four times on purpose. The repetition is the whole rank:
 * it puts this layer at (0,4,1), one step above the highest block any stylesheet
 * emits — the generated Pro chroma block
 * `html[data-chroma][data-theme="…"][data-visual-style="pro"]` at (0,3,1),
 * rung 4 of the ladder `proTheme.test.ts` pins. Out-specifying rung 4 rather
 * than tying it is deliberate. A tie would leave the visitor's own edits winning
 * only because this element is appended to `<head>` after the bundled sheets,
 * and where a bundler drops a generated CSS chunk is not something this module
 * controls; a strict win needs nothing but the selector. Source order still
 * decides between the stylesheets themselves, but it stopped being load-bearing
 * here.
 *
 * Keying on the repeated `data-theme` rather than on any of the other appearance
 * attributes is what keeps the layer applying on every look the reader can reach:
 * one selector out-ranks the chroma and visual-style blocks alike, without this
 * module having to know which combination is worn.
 *
 * The dark layer carries a second selector: a {@link CHROME_DARK_CLASS} subtree
 * wears the visitor's dark edits even while the root is light, so their tuning
 * of the chrome follows the dark header onto a light page. It takes the same
 * repetition and lands at (0,5,1), keeping it one step above the root selector
 * exactly as before. The sampler is unaffected — that selector can never match
 * the root element.
 */
export function userLayerSelector(theme: ColorScheme): string {
  // Applied to both selectors from one place so the chrome subtree can never
  // drift below the root layer it is meant to out-rank.
  const rank = "[data-theme][data-theme][data-theme]";
  const own = `html[data-theme="${theme}"]${rank}`;
  if (theme !== "dark") return own;
  return `${own},html[data-theme="light"]${rank} .${CHROME_DARK_CLASS}`;
}

/** The lab's CSS shape: one attribute-scoped block per colour scheme. Exported so
 *  the baseline sampler can stage a layer the same way it renders. */
export function buildOverrideCss(overrides: PaletteOverrides): string {
  const block = (theme: ColorScheme, map: ThemeOverrides) => {
    const entries = Object.entries(map).filter(([key, value]) =>
      /^--[a-zA-Z0-9_-]+$/.test(key) && !/[;{}]/.test(value),
    );
    if (entries.length === 0) return "";
    return `${userLayerSelector(theme)}{${entries.map(([key, value]) => `${key}:${value};`).join("")}}`;
  };
  return block("dark", overrides.dark) + block("light", overrides.light);
}

/**
 * Apply the overrides to the document. The element is only created once there
 * is something to inject, so a visitor who never customized keeps a clean head;
 * an existing element is always updated (including to empty) so clearing edits
 * really clears them.
 */
export function writeOverrideStyle(overrides: PaletteOverrides): void {
  if (typeof document === "undefined") return;
  const css = buildOverrideCss(overrides);
  let element = document.getElementById(THEME_LAB_OVERRIDE_STYLE_ID) as HTMLStyleElement | null;
  if (!element) {
    if (!css) return;
    element = document.createElement("style");
    element.id = THEME_LAB_OVERRIDE_STYLE_ID;
    document.head.appendChild(element);
  }
  if (element.textContent !== css) element.textContent = css;
}

/** `html[data-blur="off"]` — the attribute the blur kill rule keys on. */
const BLUR_ATTRIBUTE = "data-blur"

export function writeBlurAttribute(disabled: boolean): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (disabled) {
    if (root.getAttribute(BLUR_ATTRIBUTE) !== "off") root.setAttribute(BLUR_ATTRIBUTE, "off");
    return;
  }
  root.removeAttribute(BLUR_ATTRIBUTE);
}
