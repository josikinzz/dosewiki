import type { SubstanceArticle } from "@/schema";
import { ARTICLE_SECTION_LABELS } from "./ArticleSectionForm";

export type ArticleFieldChange = { path: string; before: unknown; after: unknown };
export function articleFieldChanges(before: SubstanceArticle, after: SubstanceArticle): ArticleFieldChange[] {
  const changes: ArticleFieldChange[] = [];
  const walk = (left: unknown, right: unknown, path: string) => {
    if (JSON.stringify(left) === JSON.stringify(right)) return;
    if (Array.isArray(left) && Array.isArray(right)) {
      const key = path.endsWith(".routes") ? "route" : path === "references" ? "id" : null;
      if (key) {
        const keyed = (items: unknown[]) => Object.fromEntries(items.map((item) => [String((item as Record<string, unknown>)[key]), item]));
        const a = keyed(left), b = keyed(right);
        if (JSON.stringify(Object.keys(a)) !== JSON.stringify(Object.keys(b))) changes.push({ path: `${path} order`, before: Object.keys(a), after: Object.keys(b) });
        for (const identity of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[identity], b[identity], `${path}[${identity}]`);
        return;
      }
    }
    if (left && right && typeof left === "object" && typeof right === "object" && !Array.isArray(left) && !Array.isArray(right)) {
      const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[key], b[key], `${path}.${key}`);
      return;
    }
    changes.push({ path, before: left, after: right });
  };
  for (const key of [...Object.keys(ARTICLE_SECTION_LABELS), "duration", "title"] as (keyof SubstanceArticle)[]) walk(before[key], after[key], key);
  return changes;
}
function displayValue(value: unknown): string {
  if (value === undefined || value === null) return "Not present";
  if (typeof value === "string") return value || "Empty";
  if (Array.isArray(value)) return value.map(displayValue).join("\n");
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${displayValue(item)}`).join("\n");
  return String(value);
}
export function ArticleChangeDiff({ before, after }: { before: SubstanceArticle; after: SubstanceArticle }) {
  const changes = articleFieldChanges(before, after);
  return <div className="min-w-0 space-y-5 [overflow-wrap:anywhere]" aria-label="Article change review">
    {changes.length === 0 ? <p className="theme-text-muted text-sm">No article fields changed.</p> : changes.map((change) => {
      const section = change.path.split(/[.[ ]/, 1)[0];
      const label = ARTICLE_SECTION_LABELS[section as keyof typeof ARTICLE_SECTION_LABELS] ?? (section === "duration" ? "Dosage and duration" : section === "title" ? "Title" : section);
      return <section key={change.path} className="min-w-0 space-y-2">
        <h3 className="theme-text-primary font-semibold">{label}</h3>
        {change.path !== section && <p className="theme-text-muted text-xs">{change.path}</p>}
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0"><h4 className="theme-text-muted text-sm">Before</h4><p className="theme-text-primary whitespace-pre-wrap text-sm">{displayValue(change.before)}</p></div>
          <div className="min-w-0"><h4 className="theme-text-muted text-sm">After</h4><p className="theme-text-primary whitespace-pre-wrap text-sm">{displayValue(change.after)}</p></div>
        </div>
      </section>;
    })}
  </div>;
}
