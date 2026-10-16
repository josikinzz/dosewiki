export type ArticleFieldChange = { path: string; before: unknown; after: unknown };

export type ArticlePatch = { slug: string; changes: ArticleFieldChange[] };

export const ARTICLE_PATCH_FIELDS = [
  "summary", "identification", "classification", "dosage", "subjective_effects", "comparisons",
  "reagent_testing", "pharmacology", "interactions", "tolerance", "harm_potential", "history_culture",
  "legality", "references", "duration", "title",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function isRangeValue(value: unknown): value is { min: number | null; max: number | null; unit: string } {
  return isRecord(value) && "min" in value && "max" in value && typeof value.unit === "string";
}

export function articleArrayIdentity(path: string): string | null {
  return path.endsWith(".routes") ? "route" : path === "references" ? "id" : null;
}

export function fieldChangesAt(
  before: unknown, after: unknown, path: string,
  identity: (path: string) => string | null = articleArrayIdentity,
): ArticleFieldChange[] {
  const changes: ArticleFieldChange[] = [];
  const walk = (a: unknown, b: unknown, path: string) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      const key = identity(path);
      if (key) {
        const keyed = (items: unknown[]) => Object.fromEntries(items.map((item) => [String((item as Record<string, unknown>)[key]), item]));
        const x = keyed(a), y = keyed(b);
        if (JSON.stringify(Object.keys(x)) !== JSON.stringify(Object.keys(y))) changes.push({ path: `${path} order`, before: Object.keys(x), after: Object.keys(y) });
        for (const identity of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[identity], y[identity], `${path}[${identity}]`);
        return;
      }
    }
    if (isRecord(a) && isRecord(b) && !isRangeValue(a) && !isRangeValue(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[key], b[key], path ? `${path}.${key}` : key);
      return;
    }
    changes.push({ path, before: a, after: b });
  };
  walk(before, after, path);
  return changes;
}

export function articleFieldChanges(before: unknown, after: unknown): ArticleFieldChange[] {
  const left = isRecord(before) ? before : {};
  const right = isRecord(after) ? after : {};
  return ARTICLE_PATCH_FIELDS.flatMap((key) => fieldChangesAt(left[key], right[key], key));
}

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
