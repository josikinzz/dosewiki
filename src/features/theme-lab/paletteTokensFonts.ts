import type { EssentialGroup, PaletteGroup, PaletteToken } from "./paletteTokens";

/**
 * The typography group of the Theme Lab registry — the site's two font-family
 * variables, offered as an enumerated choice rather than a free-text field.
 *
 * Why this is a registry addition and not a styling refactor: every
 * `font-family` declaration the site makes already resolves through exactly two
 * custom properties. `--font-family-body` is on `<body>`; `--font-family-display`
 * is what the `theme-display`/`theme-heading` utilities and the Tailwind
 * `font-display` family read. Re-seating those two is the whole of a type swap —
 * it is literally what the Effect Index skin does to change its voice.
 *
 * The hard part is not the CSS, it is the *bytes*. `next/font` is a build-time
 * transform and only the built flavor's face is emitted, so a dose.wiki build
 * contains no Titillium Web at all. Rather than fight that pipeline into
 * shipping a face almost nobody will wear, the face is declared lazily: its
 * `@font-face` rules are registered the first time a visitor selects it (see
 * `./fontFaces.ts`), and a visitor who never touches the control pays nothing.
 *
 * Two independent reasons the files stay unfetched until they are chosen:
 * the declaration does not exist before the first selection, and even after it
 * does, a browser only downloads a face some rendered text actually resolves to.
 *
 * The type import is deliberately type-only: `paletteTokens.ts` imports this
 * module at runtime, so a value import back would close a cycle.
 */

/** One `@font-face` rule. `src` is a path under `public/`, or absent for a
 *  metric-matched local fallback face (which downloads nothing). */
export interface FontFaceSpec {
  family: string;
  weight: string;
  style: string;
  /** Public path of the woff2, omitted for a `local()`-only fallback face. */
  src?: string;
  /** `local()` source, used by the fallback face instead of a download. */
  local?: string;
  unicodeRange?: string;
  /** Metric overrides — only the fallback face carries these. */
  ascentOverride?: string;
  descentOverride?: string;
  lineGapOverride?: string;
  sizeAdjust?: string;
}

/** One offered face: what to write into the token, and what it costs. */
export interface FontChoice {
  id: string;
  label: string;
  hint: string;
  /**
   * The CSS font stack this choice writes. Empty for the "theme default"
   * choice, which is expressed as the *absence* of an override rather than as a
   * value — so a preset that ships its own face keeps it.
   */
  stack: string;
  /** Faces to register before this choice can render. Absent = costs nothing. */
  faces?: readonly FontFaceSpec[];
}

/** Google's `latin` subset split, as `next/font` emitted it for this face. */
const LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

/** Google's `latin-ext` subset split. */
const LATIN_EXT =
  "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF";

const TITILLIUM = "Titillium Web";
const TITILLIUM_FALLBACK = "Titillium Web Fallback";

function titilliumFace(weight: string, style: string, subset: "latin" | "latin-ext"): FontFaceSpec {
  return {
    family: TITILLIUM,
    weight,
    style,
    src: `/fonts/titillium-web/titillium-web-${weight}-${style}-${subset}.woff2`,
    unicodeRange: subset === "latin" ? LATIN : LATIN_EXT,
  };
}

/**
 * Titillium Web, plus the metric-matched local fallback that stands in while it
 * arrives.
 *
 * The overrides on that last face are `next/font`'s own computed values for
 * this face (they are in the Effect Index build's generated stylesheet
 * verbatim). They are the answer to the one real risk of loading a face late:
 * a persisted choice restores before paint, so on a cold cache the page paints
 * in the fallback and swaps once the woff2 lands. With Arial re-scaled to
 * Titillium's metrics, that swap changes letterforms and not line boxes.
 *
 * 400/600/700 upright plus 400 italic: `base.css` sets `font-synthesis: none`,
 * so any weight or slope with no real face would silently render upright and
 * regular rather than being faked. ~77 KB in total, and only for a visitor who
 * asked for it.
 */
const TITILLIUM_FACES: readonly FontFaceSpec[] = [
  titilliumFace("400", "normal", "latin"),
  titilliumFace("400", "normal", "latin-ext"),
  titilliumFace("600", "normal", "latin"),
  titilliumFace("600", "normal", "latin-ext"),
  titilliumFace("700", "normal", "latin"),
  titilliumFace("700", "normal", "latin-ext"),
  titilliumFace("400", "italic", "latin"),
  titilliumFace("400", "italic", "latin-ext"),
  {
    family: TITILLIUM_FALLBACK,
    weight: "400",
    style: "normal",
    local: "Arial",
    ascentOverride: "119.97%",
    descentOverride: "41.09%",
    lineGapOverride: "0%",
    sizeAdjust: "94.44%",
  },
];

/** The tail every stack ends with, so an unavailable face never lands on Times. */
const SYSTEM_SANS = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

/**
 * The offered faces, in the order the control lists them.
 *
 * "Theme default" first and always: it is the way back, and it is the only
 * entry whose meaning is *no override*. Everything after it is a real stack.
 *
 * Deliberately a closed list. Arbitrary or visitor-supplied families are out of
 * scope — a font name is a value the lab would then have to validate, share,
 * and render from someone else's machine.
 */
export const FONT_CHOICES: readonly FontChoice[] = [
  {
    id: "default",
    label: "Theme default",
    hint: "Whatever face this theme ships with. Clears your choice rather than pinning one.",
    stack: "",
  },
  {
    id: "blinker",
    label: "Blinker",
    hint: "dose.wiki's own display face — geometric, wide-apertured, the headings you already know.",
    stack: `var(--font-display), Inter, ${SYSTEM_SANS}`,
  },
  {
    id: "inter",
    label: "Inter",
    hint: "The site's reading face: a neutral UI sans, and the default for body text.",
    stack: `Inter, ${SYSTEM_SANS}`,
  },
  {
    id: "titillium",
    label: "Titillium Web",
    hint: "The formal, printed-looking face the Pro style wears. Downloaded the first time you pick it.",
    stack: `"${TITILLIUM}", "${TITILLIUM_FALLBACK}", Inter, ${SYSTEM_SANS}`,
    faces: TITILLIUM_FACES,
  },
  {
    id: "serif",
    label: "Serif",
    hint: "Your system's book serif — Georgia or Times. Nothing to download.",
    stack: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  },
  {
    id: "mono",
    label: "Monospace",
    hint: "Your system's code face, at one width per character. Nothing to download.",
    stack:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
];

/** The "no override" choice — the one every unrecognised value resolves to. */
const DEFAULT_FONT_CHOICE: FontChoice = FONT_CHOICES[0];

const CHOICE_BY_ID = new Map(FONT_CHOICES.map((choice) => [choice.id, choice] as const));

export function getFontChoice(id: string): FontChoice | undefined {
  return CHOICE_BY_ID.get(id);
}

/**
 * The leading family of a stack, normalized: quotes stripped, lower-cased.
 *
 * Matching on the head rather than the whole string is what makes recognition
 * survive the round trip through `getComputedStyle`, which substitutes `var()`
 * references and re-spaces the list. It also means a stack that arrives from an
 * older build with a different tail still reads as the same face.
 */
export function leadingFamily(stack: string): string {
  const head = stack.split(",")[0] ?? "";
  return head.trim().replace(/^["']|["']$/g, "").toLowerCase();
}

const CHOICE_BY_FAMILY = new Map(
  FONT_CHOICES.filter((choice) => choice.stack).map(
    (choice) => [leadingFamily(choice.stack), choice] as const,
  ),
);

/**
 * Which offered face a token's current value is wearing.
 *
 * Anything unrecognised — an empty value, a computed `__Blinker_1a2b3c` from
 * `next/font`'s hashed family name, a stack from a preset we do not ship a
 * choice for — is "Theme default". That is the honest answer: the visitor has
 * not pinned a face, so the way back is the way they are already facing.
 */
export function fontChoiceForValue(value: string | undefined | null): FontChoice {
  if (!value) return DEFAULT_FONT_CHOICE;
  return CHOICE_BY_FAMILY.get(leadingFamily(value)) ?? DEFAULT_FONT_CHOICE;
}

/** Every face that has to exist for these values to render as written. */
export function facesForValues(values: Iterable<string | undefined | null>): FontChoice[] {
  const seen = new Set<string>();
  const result: FontChoice[] = [];
  for (const value of values) {
    const choice = fontChoiceForValue(value);
    if (!choice.faces || seen.has(choice.id)) continue;
    seen.add(choice.id);
    result.push(choice);
  }
  return result;
}

const font = (id: string, label: string, hint?: string): PaletteToken => ({
  id,
  label,
  kind: "font",
  hint,
});

export const FONT_GROUP: PaletteGroup = {
  id: "fonts",
  title: "Typography",
  // Expanded on open, like corner roundness: type is the second shape axis the
  // lab offers, and a collapsed pair of rows reads as one more color group.
  major: true,
  blurb:
    "The two faces the whole site is set in. Body is the reading text; display is headings, the wordmark, and the site's louder labels. Picking Titillium Web downloads it the first time — every other choice is already on your machine.",
  tokens: [
    font(
      "--font-family-body",
      "Body text face",
      "Paragraphs, tables, captions — everything you read rather than scan.",
    ),
    font(
      "--font-family-display",
      "Headings & display face",
      "Headings, section titles, the wordmark, and tracked-out labels.",
    ),
  ],
};

/** Ids in this group, in registry order. */
export const FONT_TOKEN_IDS: readonly string[] = FONT_GROUP.tokens.map((token) => token.id);

/** The plain-language entry point: the same two pickers, in the Essentials view. */
export const FONT_ESSENTIALS: EssentialGroup = {
  id: "essentials-fonts",
  title: "Fonts",
  blurb:
    "Change what the site is set in. Body is the text you read; headings are the text you scan.",
  items: [
    {
      id: "--font-family-body",
      label: "Reading face",
      hint: "Article text, tables, and captions across every page.",
    },
    {
      id: "--font-family-display",
      label: "Heading face",
      hint: "Headings, the wordmark, and the site's larger type.",
    },
  ],
};

/**
 * The Pro skin's type, restated as font-token values.
 *
 * That skin re-points both families at Titillium; the same swap comes out of
 * these two tokens with no component or stylesheet touched, which is the
 * self-check that this control is wired to the real mechanism. Test-facing only
 * — the Pro stylesheet is untouched by the lab, which writes a user layer over
 * it and never edits the file.
 */
export const PRO_STYLE_FONTS: Record<string, string> = {
  "--font-family-body": getFontChoice("titillium")!.stack,
  "--font-family-display": getFontChoice("titillium")!.stack,
};
