import { diffWords } from "diff";
import { formatDose } from "@/features/article/components/sections/dosageDurationModel";
import {
  articleFieldChanges,
  isRangeValue,
  type ArticleFieldChange,
} from "../../../../lib/proposals/articlePatch";
import { fieldPlaceWords, sectionLabel } from "./changeNote";

export { articleFieldChanges, type ArticleFieldChange };

/** Short enough to read as one line: "10-20 mg to 15-25 mg". */
const INLINE_LIMIT = 60;

function keyWords(key: string): string {
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** One value of a change as a person reads it: a range as a dose, a list as names. */
export function displayValue(value: unknown, path: string): string {
  if (value === undefined || value === null) return "Not present";
  if (isRangeValue(value)) return formatDose(value, path.endsWith(".threshold"));
  if (typeof value === "string") return value || "Empty";
  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    return value.every((item) => typeof item !== "object" || item === null)
      ? value.map((item) => displayValue(item, path)).join(", ")
      : value.map((item) => displayValue(item, path)).join("\n");
  }
  if (typeof value === "object") {
    return Object.entries(value).map(([key, item]) => `${keyWords(key)}: ${displayValue(item, `${path}.${key}`)}`).join("\n");
  }
  return String(value);
}

const fitsInline = (text: string) => text.length <= INLINE_LIMIT && !text.includes("\n");

function ChangeRow({ change }: { change: ArticleFieldChange }) {
  const place = change.path.endsWith(" order") ? "Order" : fieldPlaceWords(change.path);
  const before = displayValue(change.before, change.path);
  const after = displayValue(change.after, change.path);
  if (fitsInline(before) && fitsInline(after)) {
    return <p className="theme-text-primary min-w-0 text-sm" data-testid="article-change">
      {place && <span className="font-medium">{place}: </span>}
      <span className="theme-text-muted">{before}</span> to <span>{after}</span>
    </p>;
  }
  // Long prose marks the words that changed, so a reader never compares two
  // paragraphs by eye: removed words in Before, added words in After.
  const parts = typeof change.before === "string" && typeof change.after === "string" ? diffWords(before, after) : null;
  const marked = (side: "before" | "after") => parts
    ? parts.map((part, index) => {
      if (side === "before" ? part.added : part.removed) return null;
      if (part.added || part.removed) {
        return part.added
          ? <ins key={index} className="rounded-chip bg-[var(--editor-code-line-add-bg)] text-[var(--editor-code-line-add-text)] no-underline"><span className="sr-only">added: </span>{part.value}</ins>
          : <del key={index} className="rounded-chip bg-[var(--editor-code-line-remove-bg)] text-[var(--editor-code-line-remove-text)]"><span className="sr-only">removed: </span>{part.value}</del>;
      }
      return <span key={index}>{part.value}</span>;
    })
    : side === "before" ? before : after;
  return <div className="min-w-0 space-y-2" data-testid="article-change">
    {place && <p className="theme-text-primary text-sm font-medium">{place}</p>}
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <div className="min-w-0"><h4 className="theme-text-muted text-sm">Before</h4><p className="theme-text-primary whitespace-pre-wrap text-sm">{marked("before")}</p></div>
      <div className="min-w-0"><h4 className="theme-text-muted text-sm">After</h4><p className="theme-text-primary whitespace-pre-wrap text-sm">{marked("after")}</p></div>
    </div>
  </div>;
}

/**
 * The one reading of an article change, for the author in the page and the
 * approver in Change Review alike. Each changed field names its place in
 * words ("Oral › Dose ranges › Moderate") under its section, then its value
 * before and after. Takes either two article versions or a stored patch.
 */
export function ArticleChangeDiff(props: { before: unknown; after: unknown } | { changes: ArticleFieldChange[] }) {
  const changes = "changes" in props ? props.changes : articleFieldChanges(props.before, props.after);
  const sections: Array<{ label: string; changes: ArticleFieldChange[] }> = [];
  for (const change of changes) {
    const label = sectionLabel(change.path);
    const group = sections.find((entry) => entry.label === label);
    if (group) group.changes.push(change); else sections.push({ label, changes: [change] });
  }
  return <div className="min-w-0 space-y-5 [overflow-wrap:anywhere]" aria-label="Article change review">
    {changes.length === 0 ? <p className="theme-text-muted text-sm">No article fields changed.</p> : sections.map((section) => (
      <section key={section.label} className="min-w-0 space-y-3">
        <h3 className="theme-text-primary font-semibold">{section.label}</h3>
        {section.changes.map((change) => <ChangeRow key={change.path} change={change} />)}
      </section>
    ))}
  </div>;
}
