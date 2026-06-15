/**
 * The Palette Lab token registry.
 *
 * This is purely *which* tokens to expose and how to label/group them — the
 * actual default values are read live from the stylesheet at runtime so the
 * tool can never drift from `src/styles/site-colors.css`.
 *
 * kind:
 *   "color"    — a single solid color → editable on the HSV wheel
 *   "channels" — a bare `R G B` primitive seed (composes with alpha via
 *                rgb(var(--c-x) / a)) → also editable on the HSV wheel
 *   "raw"      — a gradient / shadow / multi-stop value → editable as raw text
 *
 * Groups flagged `major: true` start expanded; the rest start collapsed,
 * matching "major colors by default, less essential stuff collapsed."
 */

export type TokenKind = "color" | "channels" | "raw";

export interface PaletteToken {
  /** CSS custom property name, including the leading `--`. */
  id: string;
  /** Human label shown in the row. */
  label: string;
  kind: TokenKind;
  /** Optional one-line hint shown when the token is selected. */
  hint?: string;
}

export interface PaletteGroup {
  id: string;
  title: string;
  /** Expanded by default when true. */
  major?: boolean;
  blurb?: string;
  tokens: PaletteToken[];
}

const color = (id: string, label: string, hint?: string): PaletteToken => ({
  id,
  label,
  kind: "color",
  hint,
});
const raw = (id: string, label: string, hint?: string): PaletteToken => ({
  id,
  label,
  kind: "raw",
  hint,
});
const channels = (id: string, label: string, hint?: string): PaletteToken => ({
  id,
  label,
  kind: "channels",
  hint,
});

export const PALETTE_GROUPS: PaletteGroup[] = [
  {
    id: "primitives",
    title: "Primitive seeds",
    major: true,
    blurb:
      "The base palette the whole theme is built from. Edit a seed to recolor every token that references it. Channel seeds drive the dark theme and all alpha tints; the hex ramp stops are opaque brand/semantic colors. (Hue-angle seeds live in the CSS.)",
    tokens: [
      channels("--c-brand", "Brand magenta", "Fuchsia-500. Dark brand borders, glows, scrollbar, logo."),
      channels("--c-accent", "Accent lilac", "Fuchsia-300. Accent text and hover rings."),
      channels("--c-violet", "Violet", "Selected/informational and report offset."),
      channels("--c-violet-bright", "Violet — bright"),
      channels("--c-plum-deep", "Plum — deep", "Recurring dark gradient base."),
      channels("--c-emerald", "Emerald", "Success / evidence."),
      channels("--c-emerald-bright", "Emerald — bright"),
      channels("--c-emerald-deep", "Emerald — deep", "Light-mode success borders/text."),
      channels("--c-amber", "Amber", "Caution."),
      channels("--c-amber-bright", "Amber — bright"),
      channels("--c-amber-deep", "Amber — deep"),
      channels("--c-orange", "Orange", "Unsafe."),
      channels("--c-rose", "Rose", "Danger."),
      channels("--c-rose-bright", "Rose — bright"),
      channels("--c-rose-deep", "Rose — deep"),
      channels("--c-blue", "Blue", "Info."),
      channels("--c-blue-deep", "Blue — deep"),
      channels("--c-plum-pink", "Plum-pink", "Light report peak."),
      channels("--c-violet-deep", "Violet — deep"),
      channels("--c-white", "White"),
      channels("--c-black", "Black"),
      color("--c-fuchsia-200", "Fuchsia 200"),
      color("--c-fuchsia-400", "Fuchsia 400"),
      color("--c-fuchsia-600", "Fuchsia 600"),
      color("--c-fuchsia-700", "Fuchsia 700"),
      color("--c-violet-200", "Violet 200"),
      color("--c-violet-700", "Violet 700"),
      color("--c-emerald-100", "Emerald 100"),
      color("--c-emerald-200", "Emerald 200"),
      color("--c-emerald-700", "Emerald 700"),
      color("--c-emerald-800", "Emerald 800"),
      color("--c-amber-100", "Amber 100"),
      color("--c-amber-200", "Amber 200"),
      color("--c-amber-700", "Amber 700"),
      color("--c-amber-800", "Amber 800"),
      color("--c-rose-100", "Rose 100"),
      color("--c-rose-200", "Rose 200"),
      color("--c-rose-700", "Rose 700"),
      color("--c-rose-800", "Rose 800"),
      color("--c-blue-200", "Blue 200"),
    ],
  },
  {
    id: "canvas",
    title: "Page canvas",
    major: true,
    blurb: "The color behind everything. Sets the overall mood.",
    tokens: [
      color("--theme-body-bg", "Body background", "The base page color."),
      color("--theme-page-start", "Page gradient — top"),
      color("--theme-page-mid", "Page gradient — middle"),
      color("--theme-page-end", "Page gradient — bottom"),
      color("--theme-page-halo-top", "Halo — top glow", "Subtle ambient glow; lower alpha = flatter."),
      color("--theme-page-halo-left", "Halo — left glow"),
      color("--theme-page-halo-right", "Halo — right glow"),
      color("--theme-page-edge-vignette", "Edge vignette"),
    ],
  },
  {
    id: "text",
    title: "Text",
    major: true,
    blurb: "Reading hierarchy, from headings down to the quietest labels.",
    tokens: [
      color("--theme-text-primary", "Primary — headings"),
      color("--theme-text-secondary", "Secondary — body"),
      color("--theme-text-muted", "Muted — supporting"),
      color("--theme-text-faint", "Faint — labels"),
      color("--theme-text-ghost", "Ghost — dividers"),
    ],
  },
  {
    id: "accent",
    title: "Accent",
    major: true,
    blurb: "The fuchsia/purple brand color: links, active tabs, focus rings.",
    tokens: [
      color("--theme-accent-strong", "Accent — strong"),
      color("--theme-accent", "Accent — base"),
      color("--theme-accent-soft", "Accent — soft"),
      color("--theme-accent-muted", "Accent — muted"),
    ],
  },
  {
    id: "logo",
    title: "Logo",
    major: true,
    blurb: "The dose.wiki wordmark gradient stops and its glow.",
    tokens: [
      color("--site-logo-stop-1", "Logo stop 1"),
      color("--site-logo-stop-2", "Logo stop 2"),
      color("--site-logo-stop-3", "Logo stop 3"),
      color("--site-logo-stop-4", "Logo stop 4"),
      color("--theme-logo-shadow", "Logo glow"),
      color("--theme-logo-shadow-hover", "Logo glow — hover"),
    ],
  },
  {
    id: "borders",
    title: "Borders, rings & shadows",
    blurb: "Outlines, focus rings, card rims, and depth.",
    tokens: [
      color("--theme-border-subtle", "Border — subtle"),
      color("--theme-border-strong", "Border — strong"),
      color("--theme-card-border", "Card border"),
      color("--theme-card-border-strong", "Card border — strong"),
      color("--theme-divider", "Divider"),
      color("--theme-ring-soft", "Ring — soft"),
      color("--theme-shadow-soft", "Shadow — soft"),
      color("--theme-shadow-strong", "Shadow — strong"),
    ],
  },
  {
    id: "surfaces",
    title: "Surfaces & fields",
    blurb: "Cards, chrome rails, menus, and form controls.",
    tokens: [
      color("--theme-surface-soft", "Surface — soft"),
      color("--theme-surface-muted", "Surface — muted"),
      color("--theme-surface-strong", "Surface — strong"),
      color("--theme-surface-deep", "Surface — deep"),
      color("--theme-chrome-surface", "Chrome surface"),
      color("--theme-chrome-surface-strong", "Chrome surface — strong"),
      color("--theme-chrome-border", "Chrome border"),
      color("--theme-menu-surface", "Menu / popover surface"),
      color("--theme-field-surface", "Field surface"),
      color("--theme-field-surface-alt", "Field surface — alt"),
      color("--theme-field-border", "Field border"),
      color("--theme-field-on-chrome-surface", "Field on chrome"),
      color("--theme-field-on-chrome-border", "Field on chrome — border"),
      color("--theme-field-on-panel-surface", "Field on panel"),
      color("--theme-field-on-panel-surface-alt", "Field on panel — alt"),
    ],
  },
  {
    id: "frosted",
    title: "Frosted panels & controls",
    blurb: "The glassy panel material. Borders are colors; bodies/shadows are gradients.",
    tokens: [
      color("--theme-frosted-panel-border", "Panel border"),
      raw("--theme-frosted-panel-bg", "Panel body"),
      raw("--theme-frosted-panel-shadow", "Panel shadow"),
      color("--theme-frosted-panel-hover-border", "Panel hover — border"),
      raw("--theme-frosted-panel-hover-bg", "Panel hover — body"),
      raw("--theme-frosted-panel-hover-shadow", "Panel hover — shadow"),
      color("--theme-frosted-control-border", "Control border"),
      raw("--theme-frosted-control-bg", "Control body"),
      raw("--theme-frosted-control-shadow", "Control shadow"),
      color("--theme-frosted-control-hover-border", "Control hover — border"),
      raw("--theme-frosted-control-hover-bg", "Control hover — body"),
      raw("--theme-frosted-control-hover-shadow", "Control hover — shadow"),
      color("--theme-frosted-control-on-panel-border", "On-panel control — border"),
      raw("--theme-frosted-control-on-panel-bg", "On-panel control — body"),
      raw("--theme-frosted-control-on-panel-shadow", "On-panel control — shadow"),
      color("--theme-frosted-control-on-panel-hover-border", "On-panel hover — border"),
      raw("--theme-frosted-control-on-panel-hover-bg", "On-panel hover — body"),
      raw("--theme-frosted-control-on-panel-hover-shadow", "On-panel hover — shadow"),
    ],
  },
  {
    id: "informational",
    title: "Informational panels",
    blurb: "Neutral plum and violet 'selected/info' containers used in articles.",
    tokens: [
      color("--theme-article-neutral-panel-border", "Neutral panel — border"),
      raw("--theme-article-neutral-panel-bg", "Neutral panel — body"),
      raw("--theme-article-neutral-panel-shadow", "Neutral panel — shadow"),
      color("--theme-article-route-active-border", "Active route — border"),
      raw("--theme-article-route-active-bg", "Active route — body"),
      color("--theme-article-route-active-text", "Active route — text"),
      color("--theme-article-reference-control-border", "Reference control — border"),
      raw("--theme-article-reference-control-bg", "Reference control — body"),
      color("--theme-article-reference-control-text", "Reference control — text"),
    ],
  },
  {
    id: "scrollbar",
    title: "Scrollbar",
    blurb: "The frosted pink scrollbar. Solid tokens feed Firefox; gradients feed WebKit.",
    tokens: [
      color("--theme-scroll-track", "Track (Firefox)"),
      raw("--theme-scroll-track-bg", "Track body"),
      color("--theme-scroll-track-border", "Track rim"),
      color("--theme-scroll-thumb", "Thumb (Firefox)"),
      color("--theme-scroll-thumb-hover", "Thumb hover (Firefox)"),
      raw("--theme-scroll-thumb-bg", "Thumb body"),
      raw("--theme-scroll-thumb-hover-bg", "Thumb hover — body"),
      color("--theme-scroll-thumb-glow", "Thumb glow"),
    ],
  },
  {
    id: "ambient",
    title: "Selection",
    blurb: "Highlighted (selected) text.",
    tokens: [color("--theme-selection", "Text selection")],
  },
  {
    id: "safety",
    title: "Safety ramp — alerts",
    blurb: "Harm-reduction signal colors. Keep clearly distinct from the brand accent.",
    tokens: [
      color("--theme-success-bg", "Success — fill"),
      color("--theme-success-bg-strong", "Success — fill strong"),
      color("--theme-success-border", "Success — border"),
      color("--theme-success-border-strong", "Success — border strong"),
      color("--theme-success-text", "Success — text"),
      color("--theme-success-text-strong", "Success — text strong"),
      color("--theme-success-ring", "Success — ring"),
      color("--theme-warning-bg", "Warning — fill"),
      color("--theme-warning-bg-strong", "Warning — fill strong"),
      color("--theme-warning-border", "Warning — border"),
      color("--theme-warning-border-strong", "Warning — border strong"),
      color("--theme-warning-text", "Warning — text"),
      color("--theme-warning-text-strong", "Warning — text strong"),
      color("--theme-warning-ring", "Warning — ring"),
      color("--theme-danger-bg", "Danger — fill"),
      color("--theme-danger-bg-strong", "Danger — fill strong"),
      color("--theme-danger-border", "Danger — border"),
      color("--theme-danger-border-strong", "Danger — border strong"),
      color("--theme-danger-text", "Danger — text"),
      color("--theme-danger-text-strong", "Danger — text strong"),
      color("--theme-danger-ring", "Danger — ring"),
      color("--theme-evidence-bg", "Evidence — fill"),
      color("--theme-evidence-bg-strong", "Evidence — fill strong"),
      color("--theme-evidence-border", "Evidence — border"),
      color("--theme-evidence-border-strong", "Evidence — border strong"),
      color("--theme-evidence-text", "Evidence — text"),
      color("--theme-evidence-text-strong", "Evidence — text strong"),
      color("--theme-evidence-ring", "Evidence — ring"),
    ],
  },
  {
    id: "badges",
    title: "Safety ramp — badges & cards",
    blurb: "Chip and panel variants. Bodies/shadows are gradients (raw).",
    tokens: [
      color("--theme-semantic-danger-card-border", "Danger card — border"),
      raw("--theme-semantic-danger-card-bg", "Danger card — body"),
      color("--theme-semantic-unsafe-card-border", "Unsafe card — border"),
      raw("--theme-semantic-unsafe-card-bg", "Unsafe card — body"),
      color("--theme-semantic-caution-card-border", "Caution card — border"),
      raw("--theme-semantic-caution-card-bg", "Caution card — body"),
      color("--theme-semantic-danger-badge-border", "Danger badge — border"),
      raw("--theme-semantic-danger-badge-bg", "Danger badge — body"),
      color("--theme-semantic-danger-badge-text", "Danger badge — text"),
      color("--theme-semantic-danger-badge-glow", "Danger badge — glow"),
      color("--theme-semantic-unsafe-badge-border", "Unsafe badge — border"),
      raw("--theme-semantic-unsafe-badge-bg", "Unsafe badge — body"),
      color("--theme-semantic-unsafe-badge-text", "Unsafe badge — text"),
      color("--theme-semantic-unsafe-badge-glow", "Unsafe badge — glow"),
      color("--theme-semantic-caution-badge-border", "Caution badge — border"),
      raw("--theme-semantic-caution-badge-bg", "Caution badge — body"),
      color("--theme-semantic-caution-badge-text", "Caution badge — text"),
      color("--theme-semantic-caution-badge-glow", "Caution badge — glow"),
      color("--theme-semantic-info-badge-border", "Info badge — border"),
      raw("--theme-semantic-info-badge-bg", "Info badge — body"),
      color("--theme-semantic-info-badge-text", "Info badge — text"),
      color("--theme-semantic-info-badge-glow", "Info badge — glow"),
      color("--theme-semantic-success-badge-text", "Success badge — text"),
      raw("--theme-semantic-success-badge-bg", "Success badge — body"),
    ],
  },
  {
    id: "report",
    title: "Trip reports",
    blurb: "Trip-report bylines and onset / peak / offset duration phases.",
    tokens: [
      color("--theme-report-substance-text", "Substance text"),
      color("--theme-report-metadata-text", "Metadata text"),
      color("--theme-report-featured-text", "Featured text"),
      color("--theme-report-phase-onset-text", "Onset — text"),
      color("--theme-report-phase-peak-text", "Peak — text"),
      color("--theme-report-phase-offset-text", "Offset — text"),
      color("--theme-report-phase-onset-bg", "Onset — fill"),
      color("--theme-report-phase-peak-bg", "Peak — fill"),
      color("--theme-report-phase-offset-bg", "Offset — fill"),
      color("--theme-report-phase-onset-border", "Onset — border"),
      color("--theme-report-phase-peak-border", "Peak — border"),
      color("--theme-report-phase-offset-border", "Offset — border"),
      color("--theme-report-phase-onset-dot", "Onset — dot"),
      color("--theme-report-phase-peak-dot", "Peak — dot"),
      color("--theme-report-phase-offset-dot", "Offset — dot"),
    ],
  },
  {
    id: "json",
    title: "JSON syntax",
    blurb: "Code/JSON viewer token colors.",
    tokens: [
      color("--theme-json-string", "String"),
      color("--theme-json-number", "Number"),
      color("--theme-json-boolean", "Boolean"),
      color("--theme-json-null", "Null"),
      color("--theme-json-window-danger", "Window — danger"),
      color("--theme-json-window-warning", "Window — warning"),
      color("--theme-json-window-success", "Window — success"),
    ],
  },
  {
    id: "misc",
    title: "Misc accents",
    blurb: "Name chips, skip link, autofill, backdrop, table rows, and one-offs.",
    tokens: [
      color("--theme-name-chip-bg", "Name chip — fill"),
      color("--theme-name-chip-bg-hover", "Name chip — fill hover"),
      color("--theme-name-chip-text", "Name chip — text"),
      color("--theme-name-chip-text-hover", "Name chip — text hover"),
      color("--theme-name-chip-ring", "Name chip — ring"),
      color("--theme-name-chip-ring-hover", "Name chip — ring hover"),
      color("--theme-skip-link-bg", "Skip link — fill"),
      color("--theme-skip-link-text", "Skip link — text"),
      color("--theme-autofill-bg", "Autofill — fill"),
      color("--theme-autofill-text", "Autofill — text"),
      color("--theme-backdrop-safe", "Modal backdrop"),
      color("--theme-table-row-alt", "Striped table row"),
      color("--theme-flag-ring", "Flag pin — ring"),
      raw("--theme-flag-shadow", "Flag pin — shadow"),
      raw("--theme-header-shadow", "Header drop shadow"),
      color("--theme-profile-markdown-quote-bg", "Profile quote — fill"),
      color("--theme-profile-markdown-quote-border", "Profile quote — border"),
    ],
  },
];

/** Flat list of every token id the lab manages, in registry order. */
export const ALL_TOKEN_IDS: string[] = PALETTE_GROUPS.flatMap((group) =>
  group.tokens.map((token) => token.id),
);

const TOKEN_BY_ID = new Map<string, PaletteToken>(
  PALETTE_GROUPS.flatMap((group) => group.tokens.map((token) => [token.id, token] as const)),
);

export function getToken(id: string): PaletteToken | undefined {
  return TOKEN_BY_ID.get(id);
}
