import type { SaveArticlePayload } from "@/hooks/useApiMutations";
import type { DevSaveDraft } from "./devSaveCommand";

export type CommitScopeDataset = {
  id: string;
  label: string;
  count: number;
  countLabel: string;
  diff: string;
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

type KeyedRow = { key?: unknown };

function categoriesOf(value: unknown): KeyedRow[] {
  if (!value || typeof value !== "object") return [];
  const categories = (value as { categories?: unknown }).categories;
  return Array.isArray(categories) ? (categories as KeyedRow[]) : [];
}

export function countChangedCategories(original: unknown, updated: unknown): number {
  const before = new Map(categoriesOf(original).map((row, index) => [String(row.key ?? index), JSON.stringify(row)]));
  const after = new Map(categoriesOf(updated).map((row, index) => [String(row.key ?? index), JSON.stringify(row)]));
  let changed = 0;
  for (const [key, value] of after) {
    if (before.get(key) !== value) changed += 1;
  }
  for (const key of before.keys()) {
    if (!after.has(key)) changed += 1;
  }
  return Math.max(changed, 1);
}

export function buildCommitScope(draft: DevSaveDraft): CommitScopeDataset[] {
  const scope: CommitScopeDataset[] = [];
  const dataset = draft.changelog.dataset;
  if (dataset.sections.length > 0 && dataset.markdown.trim().length > 0) {
    scope.push({
      id: "articles",
      label: "Tags",
      count: dataset.sections.length,
      countLabel: plural(dataset.sections.length, "article", "articles"),
      diff: dataset.markdown,
    });
  }
  for (const layout of draft.layouts) {
    if (!layout.changelog.hasChanges) continue;
    const count = countChangedCategories(layout.originalData, layout.data);
    scope.push({
      id: `layout:${layout.type}`,
      label: `Index layout: ${layout.label}`,
      count,
      countLabel: plural(count, "category", "categories"),
      diff: layout.changelog.markdown,
    });
  }
  return scope;
}

export function withChangeNote(payload: SaveArticlePayload, note: string): SaveArticlePayload {
  const trimmed = note.trim();
  if (!trimmed) return payload;
  const markdown = payload.changelog?.markdown.trim() ?? "";
  return {
    ...payload,
    changelog: {
      markdown: markdown ? `Note: ${trimmed}\n\n${markdown}` : `Note: ${trimmed}`,
      articles: payload.changelog?.articles ?? [],
    },
  };
}
