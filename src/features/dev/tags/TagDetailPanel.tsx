import { Icon } from "@/components/common/Icon";

import {
  EditorSection,
  EditorStatusPill,
  TagToken,
} from "@/features/dev/components";

import { viewToPath } from "@/utils/routing";
import { TAG_FIELD_LABELS } from "@/utils/data/tagRegistry";
import { articleCount } from "./tagEditorStateMachine";
import type { TagDetailPanelProps } from "./types";

export function TagDetailPanel({ selectedUsage }: TagDetailPanelProps) {
  return (
    <EditorSection
      icon="lucide:tag"
      title="Selected tag"
      description="The tag as written, its field, and every article that carries it."
      actions={(
        <EditorStatusPill tone="neutral">{articleCount(selectedUsage.count)}</EditorStatusPill>
      )}
      delay={0.1}
    >
      <div className="flex flex-wrap items-center gap-3">
        <TagToken label={selectedUsage.tag} variant="readonly" className="px-4 py-2 text-base font-semibold" />
        <span className="text-xs uppercase tracking-[0.28em] theme-text-faint">
          {TAG_FIELD_LABELS[selectedUsage.field]}
        </span>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide theme-accent-heading">Affected articles</h3>
        <div className="theme-deep-list-surface theme-deep-list-divide mt-2 max-h-48 divide-y overflow-y-auto rounded-xl border text-sm theme-text-muted">
          {selectedUsage.articleRefs.map((ref) => {
            const label = ref.title?.trim()?.length ? ref.title : `Article ${ref.index + 1}`;
            const identifier = typeof ref.id === "number" ? `#${ref.id}` : `Index ${ref.index + 1}`;
            const href = ref.slug ? viewToPath({ type: "substance", slug: ref.slug }) : undefined;

            if (!href) {
              return (
                <div key={`${ref.index}-${ref.id ?? "no-id"}`} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="truncate theme-text-secondary">{label}</span>
                  <span className="text-xs tabular-nums theme-text-faint">{identifier}</span>
                </div>
              );
            }

            return (
              <a
                key={`${ref.index}-${ref.id ?? "no-id"}`}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="theme-deep-list-row theme-focus-ring-inset flex items-center justify-between gap-3 px-3 py-2 text-sm theme-text-secondary transition"
              >
                <span className="truncate">{label}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums theme-text-faint">
                  {identifier}
                  <Icon icon="lucide:external-link" size={12} />
                  <span className="sr-only">(opens in new tab)</span>
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </EditorSection>
  );
}
