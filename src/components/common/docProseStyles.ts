/**
 * The docs-surface prose recipe: the class strings that make `/docs/how` read
 * the way it does.
 *
 * That page's format is the house style for long reading: sections opened by a
 * hairline rule and a restrained accent heading, subheads that step down in
 * weight rather than size, body copy on a comfortable measure, and tables ruled
 * rather than boxed. Emphasis lives in the typography and the rules; card
 * chrome is reserved for things that are genuinely panels.
 *
 * The values are `/docs/how`'s own, lifted unchanged. `/docs/code` and
 * `/docs/license` still carry their own near-copies with three different
 * section-heading treatments between them; unifying those is a separate change,
 * since it would alter how they render.
 */

/** Section opener: hairline rule, generous lead-in, anchor clearance. */
export const DOC_SECTION_CLASS = "scroll-mt-24 border-t border-dose-border pt-10";

/** Faint tabular section numeral, for surfaces whose sections are numbered. */
export const DOC_SECTION_NUM_CLASS =
  "theme-text-faint mr-3 text-[0.65em] font-semibold tabular-nums";

export const DOC_SECTION_HEADING_CLASS = "type-doc-section-title theme-accent-heading";

// The base class carries no margin: Tailwind emits .mb-0 before .mb-2, so a
// trailing "mb-0" can never cancel a composed mb-2. Rows that align a subhead
// against an icon use the base directly.
export const DOC_SUBHEAD_BASE_CLASS = "theme-text-primary text-lg font-semibold leading-snug";
export const DOC_SUBHEAD_CLASS = `${DOC_SUBHEAD_BASE_CLASS} mb-2`;

/**
 * The level below a subhead: body size, still bold. Accent is spent on section
 * headings, so depth reads through weight instead of a second accent tone.
 */
export const DOC_MINOR_HEADING_CLASS = "text-base font-semibold leading-snug";

export const DOC_PROSE_CLASS = "theme-text-secondary leading-7";
export const DOC_LIST_CLASS = "theme-text-secondary space-y-2 leading-7";

/**
 * Ruled table: uppercase tracked header row, hairline row rules, quiet zebra.
 * `DOC_TABLE_CLASS` sets no minimum width - a table with a known-wide layout
 * composes its own `min-w-*` so narrow tables are not forced to scroll.
 */
export const DOC_TABLE_WRAP_CLASS = "overflow-hidden";
export const DOC_TABLE_SCROLL_CLASS =
  "overflow-x-auto max-sm:[mask-image:linear-gradient(to_left,transparent,black_2.5rem)]";
export const DOC_TABLE_CLASS =
  "w-full border-collapse text-left text-sm [&_tbody_small]:mt-1 [&_tbody_td]:border-b [&_tbody_td]:border-dose-border [&_tbody_td]:p-4 [&_tbody_td]:align-top [&_tbody_td:first-child]:min-w-[12rem] [&_tbody_td:first-child]:font-semibold [&_tbody_td:first-child]:text-dose-text [&_tbody_tr:last-child_td]:border-b-0";
export const DOC_TABLE_HEAD_ROW_CLASS = "border-b border-dose-border bg-dose-surface-muted/55";
export const DOC_TH_CLASS =
  "theme-text-muted px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em]";
export const DOC_TR_CLASS = "align-top odd:bg-dose-surface-muted/35 even:bg-dose-surface/20";
