import { useMemo } from "react";

import { Icon } from "@/components/common/Icon";
import { Surface } from "@/components/ui/surface";
import { EditorStatusPill } from "@/features/dev/components";
import type { SubstanceArticle } from "@/schema";
import { buildEditorReferenceDiagnostics } from "@/lib/citations/editorReferenceDiagnostics";

type EditorCitationDiagnosticsPanelProps = {
  article: SubstanceArticle;
  compact?: boolean;
};

function WarningList({
  title,
  ids,
}: {
  title: string;
  ids: string[];
}) {
  if (ids.length === 0) return null;
  return (
    <div className="rounded-xl border border-[color:var(--theme-warning-border)] bg-[var(--theme-warning-bg)] p-3">
      <p className="flex items-center gap-2 text-sm font-medium text-[color:var(--theme-warning-text-strong)]">
        <Icon icon="lucide:triangle-alert" size={16} className="text-[color:var(--theme-warning-text)]" />
        {title}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {ids.map((id) => (
          <EditorStatusPill key={`${title}-${id}`} tone="caution">
            {id}
          </EditorStatusPill>
        ))}
      </div>
    </div>
  );
}

export function EditorCitationDiagnosticsPanel({
  article,
  compact = false,
}: EditorCitationDiagnosticsPanelProps) {
  const diagnostics = useMemo(() => buildEditorReferenceDiagnostics(article), [article]);
  const previewLimit = compact ? 4 : 8;
  const prosePreviews = diagnostics.prosePreviews.slice(0, previewLimit);
  const routePreviews = diagnostics.routePreviews.slice(0, previewLimit);

  return (
    <Surface variant="subtle" padding="sm" radius="xl" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="theme-text-secondary flex items-center gap-2 text-sm font-semibold">
          <Icon icon="lucide:brackets" size={16} className="theme-icon-accent" />
          Citation token preview
        </p>
        <EditorStatusPill tone="neutral">
          {article.references?.length ?? 0} structured references
        </EditorStatusPill>
        <EditorStatusPill tone="neutral">
          {diagnostics.prosePreviews.length} tokenized text fields
        </EditorStatusPill>
        <EditorStatusPill tone="neutral">
          {diagnostics.routePreviews.length} route linkages
        </EditorStatusPill>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <WarningList title="Unknown inline reference IDs" ids={diagnostics.unknownInlineReferenceIds} />
        <WarningList title="Unknown route reference IDs" ids={diagnostics.unknownStructuredReferenceIds} />
        <WarningList title="Structured references with no current links" ids={diagnostics.orphanedReferenceIds} />
        <WarningList title="Adjacent duplicate cite tokens" ids={diagnostics.duplicateAdjacentTokenIds} />
      </div>

      {routePreviews.length > 0 && (
        <div className="space-y-2">
          <p className="theme-text-faint text-xs font-medium uppercase tracking-wider">
            Route reference preview
          </p>
          <div className="space-y-2">
            {routePreviews.map((preview) => (
              <Surface
                key={`${preview.kind}-${preview.routeIndex}-${preview.routeLabel}`}
                variant="subtle"
                padding="xs"
                radius="lg"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="theme-text-secondary text-sm font-medium">{preview.routeLabel}</span>
                  <span className="theme-badge-surface inline-flex items-center rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wider ring-1">
                    {preview.kind}
                  </span>
                  {preview.hasMultipleReferences && (
                    <EditorStatusPill tone="caution">
                      More than one reference ID
                    </EditorStatusPill>
                  )}
                </div>
                <p className="theme-text-muted mt-1 text-sm">{preview.renderedLabels.join(", ")}</p>
              </Surface>
            ))}
          </div>
        </div>
      )}

      {prosePreviews.length > 0 && (
        <div className="space-y-2">
          <p className="theme-text-faint text-xs font-medium uppercase tracking-wider">
            Numbered prose preview
          </p>
          <div className="space-y-2">
            {prosePreviews.map((preview) => (
              <Surface key={preview.path} variant="subtle" padding="xs" radius="lg">
                <p className="theme-text-faint text-xs">{preview.path}</p>
                <p className="theme-text-secondary mt-1 text-sm">{preview.renderedText}</p>
              </Surface>
            ))}
          </div>
        </div>
      )}
    </Surface>
  );
}
