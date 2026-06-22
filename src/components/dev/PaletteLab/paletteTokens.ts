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
    blurb:
      "Secondary fills — fields, menus, chrome rails, hover/inset surfaces. Many are faint semi-transparent overlays; the big visible panels come from Panel color (Frosted group). Chrome-surface tokens only show in light mode.",
    tokens: [
      color("--theme-surface-soft", "Surface — soft"),
      color("--theme-surface-muted", "Surface — muted"),
      color("--theme-surface-strong", "Surface — strong"),
      color("--theme-surface-deep", "Surface — deep"),
      color("--theme-chrome-surface", "Chrome surface"),
      color("--theme-chrome-surface-strong", "Chrome surface — strong"),
      color("--theme-chrome-border", "Chrome border"),
      color("--theme-chrome-rail-base", "Top bar color", "Base color for the header, mobile navigation, and footer rails."),
      raw("--theme-chrome-rail-bg", "Top bar body"),
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
    blurb:
      "The glassy panel material. Edit Panel color to retint the whole panel fill; borders are colors, bodies/shadows are gradients derived from it.",
    tokens: [
      color("--theme-panel-base", "Panel color", "Base color the frosted panel fill is built from — drives the whole panel body."),
      color("--theme-frosted-panel-border", "Panel border"),
      raw("--theme-frosted-panel-bg", "Panel body"),
      raw("--theme-frosted-panel-shadow", "Panel shadow"),
      color("--theme-frosted-panel-hover-border", "Panel hover — border"),
      raw("--theme-frosted-panel-hover-bg", "Panel hover — body"),
      raw("--theme-frosted-panel-hover-shadow", "Panel hover — shadow"),
      color("--theme-control-base", "Chip & button color", "Base color the chip / button / pill fill is built from — drives the whole control body."),
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
      color("--theme-route-active-base", "Active tab color", "Base color the active index / dosage-duration tab fill is built from."),
      color("--theme-article-route-active-border", "Active route — border"),
      raw("--theme-article-route-active-bg", "Active route — body"),
      color("--theme-article-route-active-text", "Active route — text"),
      color("--theme-article-reference-control-border", "Reference control — border"),
      raw("--theme-article-reference-control-bg", "Reference control — body"),
      color("--theme-article-reference-control-text", "Reference control — text"),
    ],
  },
  {
    id: "page-specific",
    title: "Page-specific colors",
    blurb: "Distinctive colors for individual page types — dose scale, section headings, avatars, index bullets, home cards.",
    tokens: [
      color("--theme-dose-tier-threshold", "Dose bar — threshold"),
      color("--theme-dose-tier-light", "Dose bar — light"),
      color("--theme-dose-tier-moderate", "Dose bar — moderate"),
      color("--theme-dose-tier-strong", "Dose bar — strong"),
      color("--theme-dose-tier-heavy", "Dose bar — heavy"),
      color("--theme-plateau-tier-first", "Plateau bar — first"),
      color("--theme-plateau-tier-second", "Plateau bar — second"),
      color("--theme-plateau-tier-third", "Plateau bar — third"),
      color("--theme-plateau-tier-fourth", "Plateau bar — fourth"),
      color("--theme-plateau-tier-fifth", "Plateau bar — fifth (Sigma)"),
      color("--theme-section-heading", "Section heading"),
      color("--theme-avatar-gradient-from", "Avatar gradient — start"),
      color("--theme-avatar-gradient-to", "Avatar gradient — end"),
      color("--theme-index-card-bullet", "Index list bullet"),
      color("--theme-construction-banner-text", "Construction banner text"),
      color("--theme-home-nav-card-border", "Home nav card edge"),
      color("--theme-header-nav-active-bg", "Header — active nav fill"),
      color("--theme-header-nav-active-border", "Header — active nav edge"),
      color("--theme-toggle-pill-bg", "Footer — theme toggle"),
      color("--theme-search-overlay-bg", "Search — result panel"),
      color("--theme-search-highlight-bg", "Search — match highlight"),
      color("--theme-search-highlight-text", "Search — match text"),
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

/**
 * The curated "Essentials" view — a small, plainly-named set of high-impact
 * knobs for a non-technical color person. Each item points at a token that
 * already exists in PALETTE_GROUPS (so `getToken` resolves its `kind`), but
 * carries its own friendly label/hint tuned for someone who thinks in roles
 * ("the page background"), not CSS variables.
 *
 * Wherever a *seed* drives a whole family (e.g. `--c-brand` recolors every
 * brand-pink border, glow, the scrollbar, and the logo at once) we expose the
 * seed, so one edit cascades. Mood surfaces that aren't seed-driven (page bg,
 * text) point at their semantic token directly.
 */
export interface EssentialItem {
  /** Token id, already defined in PALETTE_GROUPS. */
  id: string;
  /** Friendly, non-technical name. */
  label: string;
  /** Plain-English description of what this knob recolors. */
  hint: string;
}

export interface EssentialGroup {
  id: string;
  title: string;
  blurb?: string;
  items: EssentialItem[];
}

export const ESSENTIALS: EssentialGroup[] = [
  {
    id: "essentials-core",
    title: "The basics",
    blurb: "The handful of colors that set the whole mood. Start here.",
    items: [
      { id: "--theme-body-bg", label: "Page background", hint: "The base color behind every page." },
      { id: "--theme-panel-base", label: "Panel color", hint: "The frosted panels that most content sits in." },
      { id: "--theme-field-surface", label: "Input fields", hint: "Search box and form-field backgrounds." },
      { id: "--theme-control-base", label: "Chips & buttons", hint: "Effect badges, buttons, and pills (the frosted control material)." },
      { id: "--theme-route-active-base", label: "Active tabs", hint: "The selected tab on indexes and above dosage/duration tables." },
      { id: "--theme-text-primary", label: "Heading text", hint: "Headings and the boldest text." },
      { id: "--theme-text-secondary", label: "Body text", hint: "The main reading text." },
      { id: "--theme-accent", label: "Links", hint: "Link color and active highlights." },
      { id: "--theme-section-heading", label: "Section headings", hint: "The fuchsia section/heading accents (e.g. effect & article section titles)." },
    ],
  },
  {
    id: "essentials-brand",
    title: "Brand color",
    blurb: "The signature pink. Editing a brand color recolors many things at once across the whole site.",
    items: [
      {
        id: "--c-brand",
        label: "Brand pink",
        hint: "Drives card & panel borders, the scrollbar, glows, and the logo all at once.",
      },
      {
        id: "--c-accent",
        label: "Accent lilac",
        hint: "The softer pink for emphasis text and hover highlights.",
      },
    ],
  },
  {
    id: "essentials-safety",
    title: "Safety signals",
    blurb: "Harm-reduction colors. Keep these clearly distinct from each other and from the brand pink.",
    items: [
      { id: "--c-emerald", label: "Success / safe", hint: "Green for safe and success messages." },
      { id: "--c-amber", label: "Caution", hint: "Amber for caution notes." },
      { id: "--c-orange", label: "Unsafe", hint: "Orange for unsafe warnings." },
      { id: "--c-rose", label: "Danger", hint: "Red for danger and risk." },
      { id: "--c-blue", label: "Info", hint: "Blue for neutral information." },
    ],
  },
  {
    id: "essentials-article",
    title: "Substance article",
    blurb: "Colors specific to drug article pages, roughly top to bottom. (Effect chips, dosing tabs and panels are the global knobs above.)",
    items: [
      { id: "--theme-article-neutral-panel-border", label: "Info panel edge", hint: "Outline of neutral info panels — reagent rows, the contents list, data chips." },
      { id: "--theme-article-reference-control-text", label: "Cite button text", hint: "Text on inline reference / citation buttons." },
      { id: "--theme-success-bg", label: "Harm — safe fill", hint: "Fill of safe / low-risk callouts in Harm Potential. (Hue follows Success above.)" },
      { id: "--theme-warning-bg", label: "Harm — caution fill", hint: "Fill of caution callouts." },
      { id: "--theme-danger-bg", label: "Harm — danger fill", hint: "Fill of danger callouts and interaction warnings." },
      { id: "--theme-evidence-bg", label: "Harm — evidence fill", hint: "Fill of sourced-evidence callouts." },
    ],
  },
  {
    id: "essentials-reports",
    title: "Trip reports",
    blurb: "Trip report cards and the onset / peak / offset duration timeline.",
    items: [
      { id: "--theme-report-substance-text", label: "Substance byline", hint: "The substance name on a report card." },
      { id: "--theme-report-metadata-text", label: "Date & author", hint: "Report metadata bylines." },
      { id: "--theme-report-featured-text", label: "Featured tag", hint: "The 'featured' label color." },
      { id: "--theme-report-phase-onset-text", label: "Onset phase", hint: "Onset color in the duration timeline (also on article duration)." },
      { id: "--theme-report-phase-peak-text", label: "Peak phase", hint: "Peak color in the duration timeline." },
      { id: "--theme-report-phase-offset-text", label: "Offset phase", hint: "Offset color in the duration timeline." },
    ],
  },
  {
    id: "essentials-data",
    title: "Data & code viewer",
    blurb: "The JSON / code viewer on the data archive and about pages.",
    items: [
      { id: "--theme-json-string", label: "Strings", hint: "Quoted string values." },
      { id: "--theme-json-number", label: "Numbers", hint: "Numeric values." },
      { id: "--theme-json-boolean", label: "Booleans", hint: "true / false values." },
      { id: "--theme-json-null", label: "Null", hint: "null values." },
    ],
  },
  {
    id: "essentials-homepage",
    title: "Homepage",
    blurb: "Distinctive homepage colors. (The big logo, page background and search use the global knobs above.)",
    items: [
      { id: "--theme-home-nav-card-border", label: "Nav card edge", hint: "Outline of the Substances / Effects / Reports / About cards." },
      { id: "--theme-construction-banner-text", label: "Construction banner", hint: "The amber 'under construction' banner text." },
    ],
  },
  {
    id: "essentials-index",
    title: "Index pages",
    blurb: "The substance / effect / category browse pages.",
    items: [
      { id: "--theme-index-card-bullet", label: "List bullet", hint: "The bullet dot beside each item in an index card." },
    ],
  },
  {
    id: "essentials-dose-scale",
    title: "Dose & plateau scale",
    blurb: "The dosage/duration table row fills, plus the colored dose-scale and plateau bars on substance articles.",
    items: [
      {
        id: "--theme-field-on-panel-surface",
        label: "Dosage/duration table rows",
        hint: "The main row fill behind dosage and duration table entries.",
      },
      {
        id: "--theme-field-on-panel-surface-alt",
        label: "Alternate dosage/duration rows",
        hint: "The alternating row fill used in dosage and duration tables, including the color behind the dose bars.",
      },
      { id: "--theme-dose-tier-threshold", label: "Threshold", hint: "Threshold dose bar." },
      { id: "--theme-dose-tier-light", label: "Light", hint: "Light dose bar." },
      { id: "--theme-dose-tier-moderate", label: "Moderate", hint: "Moderate dose bar." },
      { id: "--theme-dose-tier-strong", label: "Strong", hint: "Strong dose bar." },
      { id: "--theme-dose-tier-heavy", label: "Heavy", hint: "Heavy dose bar." },
      { id: "--theme-plateau-tier-fifth", label: "Plateau — Sigma", hint: "The danger 'Sigma' fifth-plateau bar." },
    ],
  },
  {
    id: "essentials-about",
    title: "About & profiles",
    blurb: "About, docs, and contributor pages.",
    items: [
      { id: "--theme-avatar-gradient-from", label: "Avatar start", hint: "Contributor/founder avatar gradient (top)." },
      { id: "--theme-avatar-gradient-to", label: "Avatar end", hint: "Contributor/founder avatar gradient (bottom)." },
    ],
  },
  {
    id: "essentials-header",
    title: "Header",
    blurb: "The top navigation bar and its active item.",
    items: [
      { id: "--theme-chrome-rail-base", label: "Top bar", hint: "The header surface, mobile navigation panel, and footer rail." },
      { id: "--theme-header-nav-active-bg", label: "Active nav fill", hint: "Background of the current-page nav item." },
      { id: "--theme-header-nav-active-border", label: "Active nav edge", hint: "Outline of the current-page nav item." },
    ],
  },
  {
    id: "essentials-footer",
    title: "Footer",
    blurb: "The site footer. (The footer surface itself is Panel color above.)",
    items: [
      { id: "--theme-toggle-pill-bg", label: "Theme toggle", hint: "The light/dark toggle pill background." },
    ],
  },
  {
    id: "essentials-search",
    title: "Search",
    blurb: "The search dropdown and results.",
    items: [
      { id: "--theme-search-overlay-bg", label: "Result panel", hint: "Background of the search dropdown / results panel." },
      { id: "--theme-search-highlight-bg", label: "Match highlight", hint: "Background behind matched search text." },
      { id: "--theme-search-highlight-text", label: "Match text", hint: "Color of matched search text." },
    ],
  },
];

const ESSENTIAL_BY_ID = new Map<string, EssentialItem>(
  ESSENTIALS.flatMap((group) => group.items.map((item) => [item.id, item] as const)),
);

/** Flat list of every token id surfaced in the Essentials view, in order. */
export const ESSENTIAL_IDS: string[] = ESSENTIALS.flatMap((group) =>
  group.items.map((item) => item.id),
);

export function getEssential(id: string): EssentialItem | undefined {
  return ESSENTIAL_BY_ID.get(id);
}

/**
 * Tokens that are only ever consumed behind `html[data-theme="light"]` (or that
 * dark mode paints another way), so editing them while the dark theme is active
 * does nothing visible. Derived from a static stylesheet audit (2026-06-15) of
 * every `var(--theme-*)` reference under `src/`. Dark mode is the flat/frosted
 * base regime; light mode re-skins the page gradient, halos, header chrome, and
 * menu fills. RE-AUDIT this list if the theme CSS changes (no dark-only tokens
 * exist today). The lab tags/dims these when the off-theme is being edited.
 */
export const LIGHT_ONLY_TOKENS: ReadonlySet<string> = new Set([
  "--theme-chrome-surface",
  "--theme-chrome-surface-strong",
  "--theme-chrome-border",
  "--theme-menu-surface",
  "--theme-page-halo-top",
  "--theme-page-halo-left",
  "--theme-page-halo-right",
  "--theme-page-edge-vignette",
]);

/**
 * Eyedropper redirects: when a click resolves to a derived/gradient token,
 * send the editor to the friendly base color that drives it instead. The
 * frosted-panel fill is a `raw` gradient built from `--theme-panel-base`, so a
 * click on any panel should land on "Panel color", not a textarea of CSS.
 */
export const PICK_REDIRECTS: Record<string, string> = {
  "--theme-frosted-panel-bg": "--theme-panel-base",
  "--theme-frosted-panel-hover-bg": "--theme-panel-base",
  "--theme-chrome-rail-bg": "--theme-chrome-rail-base",
  "--theme-frosted-control-bg": "--theme-control-base",
  "--theme-frosted-control-hover-bg": "--theme-control-base",
  "--theme-article-route-active-bg": "--theme-route-active-base",
};

/** Which theme a token actually affects: "both" (default), or a single theme. */
export function tokenThemeScope(id: string): "both" | "light" | "dark" {
  if (LIGHT_ONLY_TOKENS.has(id)) return "light";
  return "both";
}

/** True when editing `theme` won't visibly change this token (it's scoped to
 *  the other theme). `theme` is the active theme name ("dark" | "light"). */
export function isInertInTheme(id: string, theme: string): boolean {
  const scope = tokenThemeScope(id);
  return scope !== "both" && scope !== theme;
}
