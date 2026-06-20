import { EditorPanel, EditorPanelBody, TagToken } from "@/features/dev/components";

import { viewToPath } from "@/utils/routing";
import { TAG_FIELD_LABELS } from "@/utils/data/tagRegistry";
import type { TagDetailPanelProps } from "./types";

export function TagDetailPanel({ selectedUsage }: TagDetailPanelProps) {
  return (
    <EditorPanel variant="subtle">
      <EditorPanelBody className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <TagToken label={selectedUsage.tag} variant="readonly" className="px-4 py-2 text-base font-semibold" />
          <span className="text-xs uppercase tracking-[0.28em] theme-text-faint">
            {TAG_FIELD_LABELS[selectedUsage.field]}
          </span>
        </div>
        <p className="mt-3 text-sm theme-text-muted">
          Used in <span className="font-semibold theme-text-secondary">{selectedUsage.count}</span> article{selectedUsage.count === 1 ? "" : "s"}.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide theme-accent-heading">Affected articles</h3>
        <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-xl border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-3 text-sm theme-text-muted">
          {selectedUsage.articleRefs.map((ref) => {
            const label = ref.title?.trim()?.length ? ref.title : `Article ${ref.index + 1}`;
            const identifier = typeof ref.id === "number" ? `#${ref.id}` : `Index ${ref.index + 1}`;
            const href = ref.slug ? viewToPath({ type: "substance", slug: ref.slug }) : undefined;

            if (!href) {
              return (
                <div key={`${ref.index}-${ref.id ?? "no-id"}`} className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--editor-panel-border)] theme-article-subsection-card px-3 py-2">
                  <span className="truncate theme-text-secondary">{label}</span>
                  <span className="text-xs uppercase tracking-[0.28em] theme-text-faint">{identifier}</span>
                </div>
              );
            }

            return (
              <a
                key={`${ref.index}-${ref.id ?? "no-id"}`}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--editor-panel-border)] theme-article-subsection-card-nested px-3 py-2 text-sm theme-text-secondary transition hover:border-[color:var(--theme-frosted-control-on-panel-hover-border)] hover:bg-[var(--theme-frosted-control-on-panel-hover-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)]"
              >
                <span className="truncate">{label}</span>
                <span className="text-xs uppercase tracking-[0.28em] theme-text-faint">{identifier}</span>
              </a>
            );
          })}
        </div>
      </div>
      </EditorPanelBody>
    </EditorPanel>
  );
}
