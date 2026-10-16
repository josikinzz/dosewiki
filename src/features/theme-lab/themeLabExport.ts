import {
  THEME_EXPORT_FORMAT,
  emptyOverrides,
  type PaletteOverrides,
  type ThemeOverrides,
} from "./themeLabStorage";
import { lookKey, parseLookKey, type LabLook } from "./themeLabLook";
import type { ThemeDefaults } from "./presetBaselines";

type ThemeExportPayload = {
  themeLab: number;
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
  look: LabLook | null;
  overrides: Partial<PaletteOverrides>;
};

export type ThemeImportResult = { value: ParsedThemeImport | null; error: string | null };

function readThemeMap(value: unknown): ThemeOverrides | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result: ThemeOverrides = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") result[key] = entry;
  }
  return result;
}

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

  if (!dark && !light) {
    return { value: null, error: 'Needs a "dark" and/or "light" color object.' };
  }

  const overrides: Partial<PaletteOverrides> = {};
  if (dark) overrides.dark = dark;
  if (light) overrides.light = light;

  return { value: { look: stamped ? parseLookKey(record.look) : null, overrides }, error: null };
}

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
  baselines: ThemeDefaults | null;
  currentEdits: PaletteOverrides;
};

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
