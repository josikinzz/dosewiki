import type { ThemeName } from "@/theme";
import { DEFAULT_PRESET_ID, isKnownPresetId, type PalettePresetId } from "./palettePresets";

/**
 * Palette Lab persistence and DOM application — the two ends of the feature's
 * only real contract: *stored envelope in → applied document state out*.
 *
 * This module deliberately owns no React and no component state. The panel used
 * to hold all of it, which meant a saved look only ever applied once the panel
 * had been opened; the always-mounted runtime (`paletteLabRuntime.ts`) now uses
 * these helpers on page load instead, and the panel became a subscriber.
 */

/** localStorage key. Historical, load-bearing: never rename it — every saved
 *  visitor look lives under it. */
export const PALETTE_LAB_STORAGE_KEY = "dosewiki-palette-lab";

/** Id of the `<style>` element the lab injects into `<head>`. */
export const PALETTE_LAB_OVERRIDE_STYLE_ID = "palette-lab-overrides";

/** Debounce before a change is written to storage. */
export const PALETTE_LAB_PERSIST_DELAY_MS = 300;

export type ThemeOverrides = Record<string, string>;

/** One override map per theme, in the exact shape the injected style element
 *  and the presets both use. */
export type PaletteOverrides = Record<ThemeName, ThemeOverrides>;

/** v2 localStorage envelope: active preset + the user's own edits on top.
 *  v1 blobs (bare `{dark, light}` maps) migrate losslessly as user edits on the
 *  default preset. */
export type StoredEnvelopeV2 = {
  version: 2;
  presetId: PalettePresetId;
  overrides: PaletteOverrides;
};

export function emptyOverrides(): PaletteOverrides {
  return { dark: {}, light: {} };
}

function defaultEnvelope(): StoredEnvelopeV2 {
  return { version: 2, presetId: DEFAULT_PRESET_ID, overrides: emptyOverrides() };
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

/**
 * Parse whatever is in storage into a v2 envelope. Never throws: junk, a v1
 * blob, and an unknown (renamed / retired) preset id all degrade to something
 * renderable rather than losing the visitor's edits.
 */
export function parseStoredEnvelope(raw: string | null | undefined): StoredEnvelopeV2 {
  if (!raw) return defaultEnvelope();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultEnvelope();
  }
  if (!parsed || typeof parsed !== "object") return defaultEnvelope();

  const record = parsed as Record<string, unknown>;
  const isV2 = record.version === 2;
  // v1 was the bare `{dark, light}` map itself.
  const maps = (isV2 ? record.overrides : record) as Record<string, unknown> | null | undefined;
  const rawId = isV2 && typeof record.presetId === "string" ? record.presetId : undefined;

  return {
    version: 2,
    presetId: isKnownPresetId(rawId) ? rawId : DEFAULT_PRESET_ID,
    overrides: { dark: readThemeMap(maps?.dark), light: readThemeMap(maps?.light) },
  };
}

export function serializeEnvelope(envelope: StoredEnvelopeV2): string {
  return JSON.stringify(envelope);
}

/**
 * Read the saved envelope. `available` is false when storage itself is
 * unreachable (private mode, blocked cookies, a hostile extension) — the panel
 * surfaces that instead of promising the look is "saved to this browser".
 */
export function readStoredEnvelope(): {
  envelope: StoredEnvelopeV2;
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

function buildOverrideCss(overrides: PaletteOverrides): string {
  const block = (selector: string, map: ThemeOverrides) => {
    const entries = Object.entries(map);
    if (entries.length === 0) return "";
    return `${selector}{${entries.map(([key, value]) => `${key}:${value};`).join("")}}`;
  };
  return (
    block('html[data-theme="dark"]', overrides.dark) +
    block('html[data-theme="light"]', overrides.light)
  );
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
