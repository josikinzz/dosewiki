import type { EssentialGroup, PaletteGroup, PaletteToken } from "./paletteTokens";

export interface FontFaceSpec {
  family: string;
  weight: string;
  style: string;
  src?: string;
  local?: string;
  unicodeRange?: string;
  ascentOverride?: string;
  descentOverride?: string;
  lineGapOverride?: string;
  sizeAdjust?: string;
}

export interface FontChoice {
  id: string;
  label: string;
  hint: string;
  stack: string;
  faces?: readonly FontFaceSpec[];
}

const LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

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

const SYSTEM_SANS = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

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
    hint: "dose.wiki's own display face: geometric, wide-apertured, the headings you already know.",
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
    hint: "The formal, printed-looking face the Clinical style wears. Downloaded the first time you pick it.",
    stack: `"${TITILLIUM}", "${TITILLIUM_FALLBACK}", Inter, ${SYSTEM_SANS}`,
    faces: TITILLIUM_FACES,
  },
  {
    id: "serif",
    label: "Serif",
    hint: "Your system's book serif (Georgia or Times). Nothing to download.",
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

const DEFAULT_FONT_CHOICE: FontChoice = FONT_CHOICES[0];

const CHOICE_BY_ID = new Map(FONT_CHOICES.map((choice) => [choice.id, choice] as const));

export function getFontChoice(id: string): FontChoice | undefined {
  return CHOICE_BY_ID.get(id);
}

export function leadingFamily(stack: string): string {
  const head = stack.split(",")[0] ?? "";
  return head.trim().replace(/^["']|["']$/g, "").toLowerCase();
}

const CHOICE_BY_FAMILY = new Map(
  FONT_CHOICES.filter((choice) => choice.stack).map(
    (choice) => [leadingFamily(choice.stack), choice] as const,
  ),
);

export function fontChoiceForValue(value: string | undefined | null): FontChoice {
  if (!value) return DEFAULT_FONT_CHOICE;
  return CHOICE_BY_FAMILY.get(leadingFamily(value)) ?? DEFAULT_FONT_CHOICE;
}

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
  major: true,
  blurb:
    "The two faces the whole site is set in. Body is the reading text; display is headings, the wordmark, and the site's louder labels. Picking Titillium Web downloads it the first time; every other choice is already on your machine.",
  tokens: [
    font(
      "--font-family-body",
      "Body text face",
      "Paragraphs, tables, captions: everything you read rather than scan.",
    ),
    font(
      "--font-family-display",
      "Headings & display face",
      "Headings, section titles, the wordmark, and tracked-out labels.",
    ),
  ],
};

export const FONT_TOKEN_IDS: readonly string[] = FONT_GROUP.tokens.map((token) => token.id);

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

export const PRO_STYLE_FONTS: Record<string, string> = {
  "--font-family-body": getFontChoice("titillium")!.stack,
  "--font-family-display": getFontChoice("titillium")!.stack,
};
