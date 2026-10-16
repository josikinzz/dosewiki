import type { ColorScheme } from "@/theme";
import { CHROME_DARK_CLASS } from "@/theme/chromeDark";
import { paletteTokenRole } from "@/theme/paletteOwnership";
import { DEFAULT_LOOK, lookKey, parseLookKey } from "./themeLabLook";

export const THEME_LAB_STORAGE_KEY = "dosewiki-palette-lab";

export const THEME_LAB_OVERRIDE_STYLE_ID = "theme-lab-overrides";

export const THEME_LAB_PERSIST_DELAY_MS = 300;

export const BLUR_TOKEN_ID = "--theme-backdrop-blur";

export function blurDisabledIn(overrides: PaletteOverrides): boolean {
  return (
    overrides.dark[BLUR_TOKEN_ID]?.trim() === "off" ||
    overrides.light[BLUR_TOKEN_ID]?.trim() === "off"
  );
}

export type ThemeOverrides = Record<string, string>;

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

export const THEME_EXPORT_FORMAT = 1;

export type StoredEnvelopeV5 = {
  version: 5;
  editsByLook: Record<string, PaletteOverrides>;
  roleEditsByLook: Record<string, RolePaletteOverrides>;
};

export function emptyOverrides(): PaletteOverrides {
  return { dark: {}, light: {} };
}

function defaultEnvelope(): StoredEnvelopeV5 {
  return { version: 5, editsByLook: {}, roleEditsByLook: {} };
}

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

export function pruneEdits(
  edits: Record<string, PaletteOverrides>,
): Record<string, PaletteOverrides> {
  const result: Record<string, PaletteOverrides> = {};
  for (const [key, value] of Object.entries(edits)) {
    if (!isEmptyOverrides(value)) result[key] = value;
  }
  return result;
}

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

function legacyActiveEditKey(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const ref = value as Record<string, unknown>;
  const id = typeof ref.id === "string" ? ref.id.trim() : "";
  if (!id) return null;
  return ref.kind === "custom" ? `custom:${id}` : id;
}

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

  let overrides: PaletteOverrides;
  if (record.version === 3 || record.version === 4) {
    const activeKey = legacyActiveEditKey(record.activeThemeRef);
    const maps = (record.editsByPreset ?? {}) as Record<string, unknown>;
    overrides = readOverrides(activeKey === null ? undefined : maps[activeKey]);
  } else if (record.version === 2) {
    overrides = readOverrides(record.overrides);
  } else {
    overrides = readOverrides(record);
  }

  const wornRetiredColourway =
    LEGACY_NON_BASE_COLOURWAY_IDS[record.activeAccentId as string] === true ||
    LEGACY_NON_BASE_COLOURWAY_IDS[record.activeSurfaceId as string] === true;
  const editsByLook = wornRetiredColourway
    ? {}
    : pruneEdits({ [lookKey(DEFAULT_LOOK)]: overrides });
  return { version: 5, editsByLook, roleEditsByLook: roleMirror(editsByLook) };
}

export function serializeEnvelope(envelope: Pick<StoredEnvelopeV5, "editsByLook">): string {
  const editsByLook = pruneEdits(envelope.editsByLook);
  return JSON.stringify({
    version: 5,
    editsByLook,
    roleEditsByLook: roleMirror(editsByLook),
  });
}

export function readStoredEnvelope(): {
  envelope: StoredEnvelopeV5;
  available: boolean;
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

export function writeSerializedEnvelope(serialized: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(THEME_LAB_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

export function userLayerSelector(theme: ColorScheme): string {
  const rank = "[data-theme][data-theme][data-theme]";
  const own = `html[data-theme="${theme}"]${rank}`;
  if (theme !== "dark") return own;
  return `${own},html[data-theme="light"]${rank} .${CHROME_DARK_CLASS}`;
}

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
