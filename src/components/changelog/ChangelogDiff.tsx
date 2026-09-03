import { cn } from "@/lib/utils";

interface ChangelogDiffProps {
  /** Unified-diff-style text: `+`/`-` change lines, `@@` hunk or path lines. */
  markdown: string;
  /** Element id, for `aria-controls` from the expander that reveals it. */
  id: string;
  /** Row key prefix; keeps line keys unique when several diffs mount at once. */
  keyPrefix: string;
  className?: string;
}

/**
 * The stored change diff, one line per row, coloured by prefix. Shared by the
 * contributor profile history and the article page's recent-changes rows so
 * the same edit reads identically on both surfaces.
 */
export function ChangelogDiff({ markdown, id, keyPrefix, className }: ChangelogDiffProps) {
  return (
    <div id={id} className={cn("theme-code-surface overflow-x-auto border-t border-dose-border p-4", className)}>
      <pre className="font-mono text-xs leading-relaxed" aria-label="Diff of changed lines">
        <code>
          {markdown.split("\n").map((line, index) => {
            const isAdded = line.startsWith("+");
            const isRemoved = line.startsWith("-");
            const isHunk = line.startsWith("@@");
            const lineClass = isHunk
              ? "text-[color:var(--theme-semantic-info-badge-text)]"
              : isAdded
                ? "bg-[color:var(--editor-code-line-add-bg)] text-[color:var(--editor-code-line-add-text)]"
                : isRemoved
                  ? "bg-[color:var(--editor-code-line-remove-bg)] text-[color:var(--editor-code-line-remove-text)]"
                  : "theme-text-muted";

            return (
              <div
                key={`${keyPrefix}-line-${index}`}
                className={`${lineClass} ${isAdded || isRemoved ? "-mx-2 rounded px-2" : ""}`}
              >
                {isAdded ? <span className="sr-only">Added: </span> : null}
                {isRemoved ? <span className="sr-only">Removed: </span> : null}
                {line.trim().length > 0 ? line : "\u00A0"}
              </div>
            );
          })}
        </code>
      </pre>
    </div>
  );
}
