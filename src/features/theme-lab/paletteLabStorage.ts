import type { ColorScheme } from "@/theme";
import { DEFAULT_PRESET_ID } from "./palettePresets";
import { CHROME_DARK_CLASS, PALETTE_ATTRIBUTE } from "./presetStylesheet";

/**
 * Theme Lab persistence and DOM application — the two ends of the feature's
 * only real contract: *stored envelope in → applied document state out*.
 *
 * This module deliberately owns no React and no component state. The panel used
 * to hold all of it, which meant a saved look only ever applied once the panel
 * had been opened; the runtime (`paletteLabRuntime.ts`) now uses these helpers
 * as the tool route mounts, and the panel became a subscriber.
 */

/** localStorage key. Historical, load-bearing: never rename it — every saved
 *  visitor look lives under it. */
export const PALETTE_LAB_STORAGE_KEY = "dosewiki-palette-lab";

/** Id of the `<style>` element the lab injects into `<head>`. */
export const PALETTE_LAB_OVERRIDE_STYLE_ID = "palette-lab-overrides";

/** Re-exported beside the helper that writes it; defined with the generator
 *  that compiles the preset blocks it switches on. */
export { PALETTE_ATTRIBUTE };

/** Debounce before a change is written to storage. */
export const PALETTE_LAB_PERSIST_DELAY_MS = 300;

export type ThemeOverrides = Record<string, string>;

/** One override map per theme, in the exact shape the injected style element
 *  and the presets both use. */
export type PaletteOverrides = Record<ColorScheme, ThemeOverrides>;

/**
 * Which theme the visitor is wearing: a shipped preset, or one of their own
 * saved slots. Kept as a tagged reference (rather than a bare id) so custom
 * slots and shipped presets can never collide, and so an unknown/renamed id
 * survives round-tripping instead of being silently rewritten.
 */
export type ThemeRef = { kind: "preset" | "custom"; id: string };

/**
 * A named theme the visitor saved themselves. Self-contained per theme so a
 * slot keeps rendering even if the preset it started from is retired.
 *
 * Schema only in this release — the save-as UI is a separate ticket. It rides
 * in the v3 envelope now so adding that UI needs no further migration.
 */
export type CustomThemeSlot = {
  id: string;
  name: string;
  overrides: PaletteOverrides;
  /** The shipped preset the slot diverged from, when it had one. */
  basePresetId?: string;
};

/** Version of the portable share/export payload this envelope speaks. Carried
 *  now (schema only) so the share codec ticket needs no v4. */
export const THEME_SHARE_FORMAT = 1;

/**
 * v3 localStorage envelope.
 *
 * The v2 envelope held *one* global edit map, so applying a preset had to wipe
 * the visitor's edits. v3 keys edits by the theme they diverge from, which
 * makes preset switching pure navigation.
 *
 * Migration is lossless in both directions of the visitor's expectations:
 * v2's `{presetId, overrides}` becomes that preset's own edit map, and a v1
 * bare `{dark, light}` blob becomes edits on the default preset.
 */
export type StoredEnvelopeV3 = {
  version: 3;
  activeThemeRef: ThemeRef;
  /** Edit maps keyed by `themeKey()` — a bare preset id, or `custom:<slot id>`. */
  editsByPreset: Record<string, PaletteOverrides>;
  customThemes: CustomThemeSlot[];
  shareFormat: number;
};

export function emptyOverrides(): PaletteOverrides {
  return { dark: {}, light: {} };
}

/** Storage key for a theme's edit map. Namespaced for custom slots so a slot id
 *  can never shadow a shipped preset id. */
export function themeKey(ref: ThemeRef): string {
  return ref.kind === "custom" ? `custom:${ref.id}` : ref.id;
}

export function presetRef(id: string): ThemeRef {
  return { kind: "preset", id };
}

export function defaultThemeRef(): ThemeRef {
  return presetRef(DEFAULT_PRESET_ID);
}

export function sameThemeRef(a: ThemeRef, b: ThemeRef): boolean {
  return a.kind === b.kind && a.id === b.id;
}

function defaultEnvelope(): StoredEnvelopeV3 {
  return {
    version: 3,
    activeThemeRef: defaultThemeRef(),
    editsByPreset: {},
    customThemes: [],
    shareFormat: THEME_SHARE_FORMAT,
  };
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

/** Drop themes whose edit map is empty, so browsing every preset does not leave
 *  a row of `{}` behind in the envelope. */
export function pruneEdits(
  edits: Record<string, PaletteOverrides>,
): Record<string, PaletteOverrides> {
  const result: Record<string, PaletteOverrides> = {};
  for (const [key, value] of Object.entries(edits)) {
    if (!isEmptyOverrides(value)) result[key] = value;
  }
  return result;
}

function readThemeRef(value: unknown): ThemeRef | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!id) return null;
  return { kind: record.kind === "custom" ? "custom" : "preset", id };
}

function readEditsByPreset(value: unknown): Record<string, PaletteOverrides> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, PaletteOverrides> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!key) continue;
    result[key] = readOverrides(entry);
  }
  return pruneEdits(result);
}

function readCustomThemes(value: unknown): CustomThemeSlot[] {
  if (!Array.isArray(value)) return [];
  const slots: CustomThemeSlot[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id) continue;
    const name = typeof record.name === "string" && record.name.trim() ? record.name : id;
    const slot: CustomThemeSlot = { id, name, overrides: readOverrides(record.overrides) };
    if (typeof record.basePresetId === "string") slot.basePresetId = record.basePresetId;
    slots.push(slot);
  }
  return slots;
}

/**
 * Parse whatever is in storage into a v3 envelope. Never throws: junk, a v1
 * blob, a v2 envelope, and an unknown (renamed / retired) preset id all degrade
 * to something renderable rather than losing the visitor's edits.
 *
 * An unknown id is *preserved*, not overwritten: the visitor keeps their saved
 * reference (and their edits under it) while `getPreset` renders the fallback.
 */
export function parseStoredEnvelope(raw: string | null | undefined): StoredEnvelopeV3 {
  if (!raw) return defaultEnvelope();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultEnvelope();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return defaultEnvelope();

  const record = parsed as Record<string, unknown>;

  if (record.version === 3) {
    return {
      version: 3,
      activeThemeRef: readThemeRef(record.activeThemeRef) ?? defaultThemeRef(),
      editsByPreset: readEditsByPreset(record.editsByPreset),
      customThemes: readCustomThemes(record.customThemes),
      shareFormat:
        typeof record.shareFormat === "number" ? record.shareFormat : THEME_SHARE_FORMAT,
    };
  }

  // v2 carried one global edit map plus the preset it sat on; v1 was the bare
  // `{dark, light}` map itself, which is edits on the default preset.
  const isV2 = record.version === 2;
  const presetId =
    isV2 && typeof record.presetId === "string" && record.presetId.trim()
      ? record.presetId
      : DEFAULT_PRESET_ID;
  const overrides = readOverrides(isV2 ? record.overrides : record);

  return {
    version: 3,
    activeThemeRef: presetRef(presetId),
    editsByPreset: pruneEdits({ [presetId]: overrides }),
    customThemes: [],
    shareFormat: THEME_SHARE_FORMAT,
  };
}

export function serializeEnvelope(envelope: StoredEnvelopeV3): string {
  return JSON.stringify({ ...envelope, editsByPreset: pruneEdits(envelope.editsByPreset) });
}

/**
 * Read the saved envelope. `available` is false when storage itself is
 * unreachable (private mode, blocked cookies, a hostile extension) — the panel
 * surfaces that instead of promising the look is "saved to this browser".
 */
export function readStoredEnvelope(): {
  envelope: StoredEnvelopeV3;
  available: boolean;
  /** Exactly what was in storage, so a legacy shape can be rewritten in place. */
  raw: string | null;
} {
  if (typeof window === "undefined") {
    return { envelope: defaultEnvelope(), available: false, raw: null };
  }
  try {
    const raw = window.localStorage.getItem(PALETTE_LAB_STORAGE_KEY);
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
    window.localStorage.setItem(PALETTE_LAB_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

/**
 * Selector for the visitor's own layer in one theme.
 *
 * `data-theme` is named twice on purpose. The repetition is what makes this
 * (0,2,1) — exactly level with the generated preset blocks
 * (`html[data-palette="…"][data-theme="…"]`), so an explicit edit beats the
 * preset it diverges from by source order (this element is appended to `<head>`
 * after the stylesheet) instead of by out-specifying it. Matching on the
 * doubled attribute rather than on `[data-palette]` also keeps the layer
 * applying when no preset is worn at all, and lets the baseline sampler strip
 * the palette attribute without silencing the layer it is staging.
 *
 * The dark layer carries a second selector: a {@link CHROME_DARK_CLASS} subtree
 * wears the visitor's dark edits even while the root is light, so their tuning
 * of the chrome follows the dark header onto a light page. It is (0,3,1),
 * level with the generated preset island and again winning on source order.
 * The sampler is unaffected — that selector can never match the root element.
 */
export function userLayerSelector(theme: ColorScheme): string {
  const own = `html[data-theme="${theme}"][data-theme]`;
  if (theme !== "dark") return own;
  return `${own},html[data-theme="light"][data-theme] .${CHROME_DARK_CLASS}`;
}

/** The lab's CSS shape: one attribute-scoped block per theme. Exported so the
 *  baseline sampler can stage a theme's own layer the same way it renders. */
export function buildOverrideCss(overrides: PaletteOverrides): string {
  const block = (theme: ColorScheme, map: ThemeOverrides) => {
    const entries = Object.entries(map);
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
  let element = document.getElementById(PALETTE_LAB_OVERRIDE_STYLE_ID) as HTMLStyleElement | null;
  if (!element) {
    if (!css) return;
    element = document.createElement("style");
    element.id = PALETTE_LAB_OVERRIDE_STYLE_ID;
    document.head.appendChild(element);
  }
  if (element.textContent !== css) element.textContent = css;
}

/**
 * Name the shipped preset on the root element, which is what turns on that
 * preset's compiled block. Written with the id exactly as saved — the same
 * value the pre-paint bootstrap can arrive at without shipping the preset list
 * — so hydration never has to rewrite the attribute the bootstrap already set.
 * An unknown or retired id simply matches no block, which is the stock look.
 */
/** `html[data-blur="off"]` — the attribute the blur kill rule keys on. */
export const BLUR_ATTRIBUTE = "data-blur";

export function writeBlurAttribute(disabled: boolean): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (disabled) {
    if (root.getAttribute(BLUR_ATTRIBUTE) !== "off") root.setAttribute(BLUR_ATTRIBUTE, "off");
    return;
  }
  root.removeAttribute(BLUR_ATTRIBUTE);
}

export function writePaletteAttribute(presetId: string): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (presetId) {
    if (root.getAttribute(PALETTE_ATTRIBUTE) !== presetId) {
      root.setAttribute(PALETTE_ATTRIBUTE, presetId);
    }
    return;
  }
  root.removeAttribute(PALETTE_ATTRIBUTE);
}
