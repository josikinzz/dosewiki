/**
 * Editorial content shown for a substance-index category tab.
 *
 * Source of truth for per-category `definition`/`warning` is
 * `data/substances/psychoactiveIndexManual.json`. Umbrella "super-category"
 * tabs (Hallucinogens, Depressants) are defined in code alongside their
 * tab config in `DosagesPage`. Both are projected into this shape.
 *
 * Strings are single-paragraph Markdown. This content is only used to render
 * the intro blurb on the substance index; it is not stored in Postgres.
 */
export interface CategoryTabContent {
  /** Markdown paragraph defining the category. */
  definition?: string;
  /** Optional Markdown warning specific to the category (surfaced later). */
  warning?: string;
}

/** True when there is anything worth rendering for a tab. */
export function hasCategoryTabContent(
  content: CategoryTabContent | undefined,
): content is CategoryTabContent {
  return Boolean(content && (content.definition?.trim() || content.warning?.trim()));
}
