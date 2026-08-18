import {
  BASE_ACCENT,
  BASE_SURFACE,
  isAccent,
  isSurface,
  type AccentId,
  type SurfaceId,
} from "@/theme";
import { paletteTokenRole, type PaletteRole } from "@/theme/paletteOwnership";
import { DEFAULT_PRESET_ID, getPreset, isKnownPresetId, mergeOverrides } from "./palettePresets";
import { ALL_TOKEN_IDS } from "./paletteTokens";
import {
  emptyOverrides,
  partitionOverrides,
  type PaletteOverrides,
  type RolePaletteOverrides,
  type ThemeOverrides,
} from "./paletteLabStorage";

/**
 * The Theme Lab's share codec: a theme ⇄ a compact code you can paste in chat or
 * hang off a link.
 *
 * **Versioned independently of the storage envelope.** The envelope is v3 and
 * will keep moving; a share code carries its own `v`, so a link minted today
 * still decodes after the envelope grows a v4. A code from a *newer* codec is
 * refused with an explanation rather than half-applied. Unknown extra fields in
 * a payload are ignored, which is what lets a later codec add fields that older
 * builds can still read the essentials of.
 *
 * **Compact by naming the palette it started from.** The decoded form is the
 * self-contained portable theme — the display name plus complete dark and light
 * token maps — but the wire form only carries what *diverges* from the named
 * shipped preset, because both ends ship the same preset table. A tweaked Abyss
 * is a couple of hundred characters instead of five kilobytes, and the decoder
 * re-merges the preset back in, so what comes out is the whole look. A preset id
 * this build doesn't ship degrades to the stock palette with the divergence
 * still applied, rather than failing.
 *
 * **The receiving path is the security boundary.** A share code is attacker
 * input: it arrives from a stranger's link and ends up as CSS declarations in a
 * style element. So the decoder enforces, in order, a hard length cap, a decoded
 * size cap, a token-count cap, the token registry as an allowlist (a payload
 * naming anything else is refused outright, not quietly filtered), and a value
 * screen: syntax that could escape the declaration is rejected outright, and
 * every CSS function in the value must be one of a short allowlist of pure
 * computations. Nothing here can add a rule, close the block it sits in, or make
 * the page fetch a remote asset.
 */

/** Wire format version. Bump only for a breaking payload change, and keep the
 *  old branch decodable — links are forever. */
export const THEME_SHARE_CODEC_VERSION = 2;

/** Query parameter a share link hangs the code off. */
export const THEME_SHARE_PARAM = "themelab";

/**
 * Hard ceiling on the code itself, checked before anything is decoded.
 *
 * Chosen from the *link* end rather than the theme end: 6000 characters keeps
 * the whole URL inside the 8kB request line that common proxies will carry, so
 * a link that decodes here is a link that arrives. It comfortably fits any
 * ordinary theme (a palette plus tweaks is a few hundred characters); a visitor
 * who has hand-edited hundreds of tokens is told their look is too big to link
 * rather than being handed a URL that silently truncates.
 */
export const MAX_SHARE_CODE_LENGTH = 6000;

/** Ceiling on the decoded JSON, so a short code cannot expand into a huge one. */
export const MAX_SHARE_PAYLOAD_BYTES = 64_000;

/** Ceiling on how many tokens one code may set, across both themes. Comfortably
 *  above "every token in the registry, twice". */
export const MAX_SHARE_TOKENS = 800;

/** Ceiling on one token's value. The longest shipped value (a scrollbar thumb
 *  gradient) is well under this. */
export const MAX_SHARE_VALUE_LENGTH = 400;

/** Longest display name a code may carry. Matches the slot name ceiling. */
export const MAX_SHARE_NAME_LENGTH = 40;

/**
 * A decoded share: the self-contained portable theme form.
 *
 * `overrides` is the *whole* look (base preset re-merged), which is exactly the
 * shape a custom slot stores, so applying one is an ordinary slot write.
 */
export type SharedTheme = {
  name: string;
  /** The shipped preset that paints underneath. Always an id this build has. */
  basePresetId: string;
  overrides: PaletteOverrides;
  surfaceId: SurfaceId;
  accentId: AccentId;
  roleOverrides: RolePaletteOverrides;
  /** True when the code named a palette this build no longer ships — the look
   *  still applies, over the stock palette. */
  unknownBase: boolean;
  /** How many tokens the code actually set, for the preview's summary line. */
  tokenCount: number;
};

/** One shape rather than a discriminated union: this repo compiles with
 *  `strictNullChecks` off, where narrowing on a boolean tag is unreliable. */
export type ShareDecodeResult = { value: SharedTheme | null; error: string | null };

const TOKEN_ALLOWLIST: ReadonlySet<string> = new Set(ALL_TOKEN_IDS);

/**
 * Syntax that could end the declaration, end the block, open a rule or at-rule,
 * start a comment, smuggle an escape sequence, or carry markup. None of it has
 * any place in a color, a length, or a font stack.
 */
const UNSAFE_SYNTAX = /[;{}<>\\@]|\/\*|\*\//;

/**
 * The only CSS functions a shared value may use — an allowlist, deliberately,
 * because a denylist here is a losing game.
 *
 * Every entry is a pure computation: a reference, some arithmetic, a color, or
 * a gradient. Everything else is refused, and the ones that matter are the
 * image-producing functions — `url()`, `image-set()`, `-webkit-image-set()`,
 * `cross-fade()`, `image()`, `element()`, `paint()`, `src()`. Several palette
 * tokens land in properties that accept an `<image>` (the scrollbar thumb's
 * `background` shorthand in `src/styles/base.css`, for one), so any of those
 * would make the recipient's browser fetch an attacker-chosen URL. That is the
 * worst case this codec has: a share link auto-previews when it is opened, so
 * the request would fire — leaking IP, user agent, and the fact that the link
 * was opened — *before* the visitor has accepted or declined anything.
 *
 * Vendor-prefixed spellings are not listed: nothing this tool emits uses one,
 * and the prefixed image functions are exactly what the screen is for.
 */
const ALLOWED_FUNCTIONS: ReadonlySet<string> = new Set([
  // References and arithmetic.
  "var",
  "calc",
  "clamp",
  "min",
  "max",
  // Colors.
  "color",
  "color-mix",
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  // Gradients.
  "linear-gradient",
  "radial-gradient",
  "conic-gradient",
  "repeating-linear-gradient",
  "repeating-radial-gradient",
  "repeating-conic-gradient",
]);

/** Every identifier that opens a paren, prefixes and all, so `-webkit-image-set(`
 *  is read as one name rather than as an allowed tail. Whitespace before the
 *  paren counts, since a lenient parser may still treat it as a function. */
const FUNCTION_NAME = /([\w-]+)\s*\(/g;

/**
 * True for any value the receiving path must not apply. Everything the palette
 * legitimately uses — `var()`, `color-mix()`, `oklch()`, `linear-gradient()`,
 * hex colors, lengths, quoted font stacks — passes.
 */
function isUnsafeValue(value: string): boolean {
  if (UNSAFE_SYNTAX.test(value)) return true;
  for (const [, name] of value.matchAll(FUNCTION_NAME)) {
    if (!ALLOWED_FUNCTIONS.has(name.toLowerCase())) return true;
  }
  return false;
}

/** Shared token-id prefixes, squeezed to one character on the wire. Every
 *  registry id starts with `--`, so these sigils can never collide with a
 *  literal id and the mapping is reversible without a marker. */
const KEY_PREFIXES: readonly (readonly [string, string])[] = [
  ["--theme-", "~"],
  ["--c-", "^"],
  ["--h-", "!"],
];

function packKey(id: string): string {
  for (const [prefix, sigil] of KEY_PREFIXES) {
    if (id.startsWith(prefix)) return sigil + id.slice(prefix.length);
  }
  return id;
}

function unpackKey(key: string): string {
  for (const [prefix, sigil] of KEY_PREFIXES) {
    if (key.startsWith(sigil)) return prefix + key.slice(sigil.length);
  }
  return key;
}

/* ------------------------------------------------------------------ base64url */

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Returns null for anything that is not valid base64url — a truncated link, a
 *  chat client's trailing punctuation, a hand-typed near-miss. */
function fromBase64Url(code: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return null;
  const padded = code.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------------- encode */

/** Keep only what diverges from the named preset — the other end has the same
 *  preset table and merges it back in. */
function deltaAgainst(map: ThemeOverrides, base: Record<string, string>): Record<string, string> {
  const packed: Record<string, string> = {};
  for (const [id, value] of Object.entries(map ?? {})) {
    if (typeof value !== "string") continue;
    if (!TOKEN_ALLOWLIST.has(id)) continue;
    const baseValue = base?.[id];
    if (baseValue !== undefined && baseValue.trim() === value.trim()) continue;
    packed[packKey(id)] = value;
  }
  return packed;
}

export type ShareSource = {
  name: string;
  basePresetId: string;
  surfaceId?: SurfaceId;
  accentId?: AccentId;
  /** The complete look being shared, both themes. */
  overrides: PaletteOverrides;
};

/**
 * Encode a theme as a share code. The result is URL-safe with no escaping, so
 * it can be pasted raw into a query string or a chat message.
 */
/** Whether a minted code is inside the cap the receiving path enforces — the
 *  sending UI asks before offering a link it knows would be refused. */
export function shareCodeFits(code: string): boolean {
  return code.length > 0 && code.length <= MAX_SHARE_CODE_LENGTH;
}

export function encodeSharedTheme(source: ShareSource): string {
  const preset = getPreset(source.basePresetId);
  const roles = partitionOverrides(source.overrides);
  const encodeRole = (overrides: PaletteOverrides) => ({
    d: deltaAgainst(overrides.dark, preset.overrides.dark),
    l: deltaAgainst(overrides.light, preset.overrides.light),
  });
  const payload = {
    v: THEME_SHARE_CODEC_VERSION,
    n: source.name.slice(0, MAX_SHARE_NAME_LENGTH),
    b: preset.id,
    s: source.surfaceId ?? BASE_SURFACE,
    a: source.accentId ?? BASE_ACCENT,
    r: {
      s: encodeRole(roles.surfaceOverrides),
      a: encodeRole(roles.accentOverrides),
      m: encodeRole(roles.semanticOverrides),
      x: encodeRole(roles.residualOverrides),
    },
  };
  return toBase64Url(JSON.stringify(payload));
}

/* --------------------------------------------------------------------- decode */

function readMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, string>;
}

/**
 * Decode a share code into the portable theme form, or explain why not.
 *
 * Every rejection here is a message a visitor can act on, because the only way
 * they ever see one is by following someone else's link.
 */
export function decodeSharedTheme(rawCode: string): ShareDecodeResult {
  const code = (rawCode ?? "").trim();
  if (!code) return { value: null, error: "Paste a Theme Lab share code first." };
  if (code.length > MAX_SHARE_CODE_LENGTH) {
    return { value: null, error: "That share code is too large to be a theme — ignoring it." };
  }

  const json = fromBase64Url(code);
  if (json === null) return { value: null, error: "That isn’t a Theme Lab share code." };
  if (json.length > MAX_SHARE_PAYLOAD_BYTES) {
    return { value: null, error: "That share code is too large to be a theme — ignoring it." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { value: null, error: "That isn’t a Theme Lab share code." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { value: null, error: "That isn’t a Theme Lab share code." };
  }

  const record = parsed as Record<string, unknown>;
  if (record.v !== 1 && record.v !== THEME_SHARE_CODEC_VERSION) {
    return {
      value: null,
      error: "That share code was made by a newer Theme Lab — this site can’t read it yet.",
    };
  }

  const rawBase = typeof record.b === "string" ? record.b.trim() : "";
  const knownBase = isKnownPresetId(rawBase);
  const preset = getPreset(knownBase ? rawBase : DEFAULT_PRESET_ID);

  const delta = emptyOverrides();
  let tokenCount = 0;
  const roleKeys: readonly [string, PaletteRole | "residual"][] = [
    ["s", "surface"],
    ["a", "accent"],
    ["m", "semantic"],
    ["x", "residual"],
  ];
  const hasRoleEnvelope = record.v === 2 && record.r && typeof record.r === "object";
  const sources: readonly ["dark" | "light", unknown, PaletteRole | "residual"][] =
    !hasRoleEnvelope
      ? [
          ["dark", record.d, "residual"],
          ["light", record.l, "residual"],
        ]
      : roleKeys.flatMap(([key, role]) => {
          const bucket = (record.r as Record<string, unknown>)[key] as
            | Record<string, unknown>
            | undefined;
          return [
            ["dark", bucket?.d, role],
            ["light", bucket?.l, role],
          ] as const;
        });
  for (const [theme, rawMap, expectedRole] of sources) {
    for (const [packedId, value] of Object.entries(readMap(rawMap))) {
      const id = unpackKey(packedId);
      if (!TOKEN_ALLOWLIST.has(id)) {
        return {
          value: null,
          error: "That share code sets something that isn’t a Theme Lab color — ignoring it.",
        };
      }
      if (record.v === 2 && expectedRole !== "residual" && paletteTokenRole(id) !== expectedRole) {
        return { value: null, error: "That share code puts a color in the wrong palette role." };
      }
      if (typeof value !== "string" || !value.trim()) {
        return { value: null, error: "That share code has a color the Theme Lab can’t read." };
      }
      if (value.length > MAX_SHARE_VALUE_LENGTH || isUnsafeValue(value)) {
        return { value: null, error: "That share code has a value the Theme Lab won’t apply." };
      }
      tokenCount += 1;
      if (tokenCount > MAX_SHARE_TOKENS) {
        return { value: null, error: "That share code is too large to be a theme — ignoring it." };
      }
      delta[theme][id] = value;
    }
  }

  const name =
    typeof record.n === "string"
      ? record.n.replace(/\s+/g, " ").trim().slice(0, MAX_SHARE_NAME_LENGTH)
      : "";

  return {
    value: {
      name: name || "Shared theme",
      basePresetId: preset.id,
      surfaceId: isSurface(record.s as string) ? (record.s as SurfaceId) : BASE_SURFACE,
      accentId: isAccent(record.a as string) ? (record.a as AccentId) : BASE_ACCENT,
      // Self-contained on the way out: the preset the code named, with the
      // shared divergence on top.
      overrides: mergeOverrides(preset.overrides, delta) as PaletteOverrides,
      roleOverrides: partitionOverrides(mergeOverrides(preset.overrides, delta) as PaletteOverrides),
      unknownBase: Boolean(rawBase) && !knownBase,
      tokenCount,
    },
    error: null,
  };
}
