/**
 * Color parsing/serialization helpers for the Theme Lab.
 *
 * The site's color tokens are authored in a mix of formats (#hex, rgba(),
 * oklch(), color-mix()). To drive an HSV wheel we need a single, reliable way
 * to turn ANY CSS color string into sRGB. Rather than ship an oklch math
 * library, we rasterize one pixel on a canvas and read it back — the browser
 * resolves every color syntax to sRGB bytes for us.
 *
 * On the way out we serialize to #hex (opaque) or rgba() (translucent): both
 * are universally valid CSS and easy for a human or an agent to read. The
 * integrating agent re-expresses them as oklch per the palette rules.
 */

export type Rgba = { r: number; g: number; b: number; a: number };
export type Hsv = { h: number; s: number; v: number };

let probeCanvas: HTMLCanvasElement | null = null;
let probeCtx: CanvasRenderingContext2D | null = null;
const colorParseCache = new Map<string, Rgba | null>();
const COLOR_PARSE_CACHE_LIMIT = 4000;

function getProbe(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!probeCtx) {
    probeCanvas = document.createElement("canvas");
    probeCanvas.width = 1;
    probeCanvas.height = 1;
    probeCtx = probeCanvas.getContext("2d", { willReadFrequently: true });
  }
  return probeCtx;
}

/**
 * Resolve any CSS color string to sRGB bytes + straight alpha (0–1).
 * Returns null for empty input or strings the canvas cannot interpret.
 */
export function parseColorToRgba(input: string): Rgba | null {
  const value = input.trim();
  if (colorParseCache.has(value)) return colorParseCache.get(value) ?? null;

  const cache = (result: Rgba | null) => {
    if (colorParseCache.size >= COLOR_PARSE_CACHE_LIMIT) colorParseCache.clear();
    colorParseCache.set(value, result);
    return result;
  };

  if (!value) return cache(null);

  const ctx = getProbe();
  if (!ctx) return cache(null);

  // Detect invalid input: an unparseable fillStyle is silently ignored, so we
  // seed two distinct sentinels and confirm the value actually "took".
  ctx.fillStyle = "#010203";
  ctx.fillStyle = value;
  const firstAttempt = ctx.fillStyle;
  ctx.fillStyle = "#040506";
  ctx.fillStyle = value;
  if (ctx.fillStyle !== firstAttempt) return cache(null);

  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  return cache({ r: data[0], g: data[1], b: data[2], a: Math.round((data[3] / 255) * 1000) / 1000 });
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function channelToHex(channel: number): string {
  return clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0");
}

export function rgbToHex({ r, g, b }: Pick<Rgba, "r" | "g" | "b">): string {
  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
}

/** Accepts #rgb, #rrggbb, #rgba, #rrggbbaa (with or without leading #). */
export function hexToRgba(hex: string): Rgba | null {
  const cleaned = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) return null;

  let r: number;
  let g: number;
  let b: number;
  let a = 1;

  if (cleaned.length === 3 || cleaned.length === 4) {
    r = parseInt(cleaned[0] + cleaned[0], 16);
    g = parseInt(cleaned[1] + cleaned[1], 16);
    b = parseInt(cleaned[2] + cleaned[2], 16);
    if (cleaned.length === 4) a = parseInt(cleaned[3] + cleaned[3], 16) / 255;
  } else if (cleaned.length === 6 || cleaned.length === 8) {
    r = parseInt(cleaned.slice(0, 2), 16);
    g = parseInt(cleaned.slice(2, 4), 16);
    b = parseInt(cleaned.slice(4, 6), 16);
    if (cleaned.length === 8) a = parseInt(cleaned.slice(6, 8), 16) / 255;
  } else {
    return null;
  }

  return { r, g, b, a: Math.round(a * 1000) / 1000 };
}

/**
 * Parse a bare `R G B` channel triple — the form used by the `--c-*` primitive
 * seeds so they can compose with any alpha via `rgb(var(--c-x) / a)`. Commas or
 * whitespace separate the channels; alpha (if any) is ignored.
 */
export function parseChannelsToRgba(input: string): Rgba | null {
  const parts = input.trim().split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((n) => Number.isNaN(n))) return null;
  return {
    r: clamp(parts[0], 0, 255),
    g: clamp(parts[1], 0, 255),
    b: clamp(parts[2], 0, 255),
    a: 1,
  };
}

/** Serialize back to a bare `R G B` channel triple (alpha is dropped). */
export function formatChannels({ r, g, b }: Pick<Rgba, "r" | "g" | "b">): string {
  return `${clamp(Math.round(r), 0, 255)} ${clamp(Math.round(g), 0, 255)} ${clamp(Math.round(b), 0, 255)}`;
}

export function rgbToHsv({ r, g, b }: Pick<Rgba, "r" | "g" | "b">): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  return { h, s, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Pick<Rgba, "r" | "g" | "b"> {
  const c = v * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  const m = v - c;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function roundAlpha(a: number): number {
  return Math.round(clamp(a, 0, 1) * 1000) / 1000;
}

/** Serialize for CSS/JSON: #hex when opaque, rgba() when translucent. */
export function formatColor({ r, g, b, a }: Rgba): string {
  const alpha = roundAlpha(a);
  if (alpha >= 1) return rgbToHex({ r, g, b });
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

/** A compact "#rrggbb · 72%" readout for swatch rows. */
export function describeColor(rgba: Rgba): string {
  const hex = rgbToHex(rgba);
  const alpha = roundAlpha(rgba.a);
  return alpha >= 1 ? hex : `${hex} · ${Math.round(alpha * 100)}%`;
}
