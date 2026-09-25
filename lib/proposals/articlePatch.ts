/**
 * The structured patch an article change carries: one entry per changed field,
 * addressed by a stable path. Authors see it in the page before they submit,
 * and approvers read the same entries in Change Review, so both describe the
 * change the same way.
 *
 * Paths use the identity of keyed entries rather than their position, so a
 * reordered route reads as a reorder and not as every route changing:
 * `dosage.routes[oral].dose_ranges.moderate`, `references[doi-1]`.
 */

export type ArticleFieldChange = { path: string; before: unknown; after: unknown };

/** The changed fields of one article in a proposal, keyed by its slug. */
export type ArticlePatch = { slug: string; changes: ArticleFieldChange[] };

/**
 * The article fields a patch covers, in reading order. The editor's section
 * keys plus the two fields that live inside another section's form.
 */
export const ARTICLE_PATCH_FIELDS = [
  "summary", "identification", "classification", "dosage", "subjective_effects", "comparisons",
  "reagent_testing", "pharmacology", "interactions", "tolerance", "harm_potential", "history_culture",
  "legality", "references", "duration", "title",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A dose range or duration stage: one value to a reader, never three fields. */
export function isRangeValue(value: unknown): value is { min: number | null; max: number | null; unit: string } {
  return isRecord(value) && "min" in value && "max" in value && typeof value.unit === "string";
}

/** Every field that differs between two versions of one article. */
export function articleFieldChanges(before: unknown, after: unknown): ArticleFieldChange[] {
  const left = isRecord(before) ? before : {};
  const right = isRecord(after) ? after : {};
  const changes: ArticleFieldChange[] = [];
  const walk = (a: unknown, b: unknown, path: string) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      const key = path.endsWith(".routes") ? "route" : path === "references" ? "id" : null;
      if (key) {
        const keyed = (items: unknown[]) => Object.fromEntries(items.map((item) => [String((item as Record<string, unknown>)[key]), item]));
        const x = keyed(a), y = keyed(b);
        if (JSON.stringify(Object.keys(x)) !== JSON.stringify(Object.keys(y))) changes.push({ path: `${path} order`, before: Object.keys(x), after: Object.keys(y) });
        for (const identity of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[identity], y[identity], `${path}[${identity}]`);
        return;
      }
    }
    if (isRecord(a) && isRecord(b) && !isRangeValue(a) && !isRangeValue(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[key], b[key], `${path}.${key}`);
      return;
    }
    changes.push({ path, before: a, after: b });
  };
  for (const key of ARTICLE_PATCH_FIELDS) walk(left[key], right[key], key);
  return changes;
}

/** A stored patch as it came back from storage, or null when it is not one. */
export function readArticlePatches(value: unknown): ArticlePatch[] | null {
  if (!Array.isArray(value)) return null;
  const patches: ArticlePatch[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.slug !== "string" || !Array.isArray(entry.changes)) return null;
    const changes: ArticleFieldChange[] = [];
    for (const change of entry.changes) {
      if (!isRecord(change) || typeof change.path !== "string") return null;
      changes.push({ path: change.path, before: change.before, after: change.after });
    }
    patches.push({ slug: entry.slug, changes });
  }
  return patches;
}
