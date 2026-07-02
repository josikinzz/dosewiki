import { useMemo, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Surface } from "@/components/ui/surface";
import { EditorSection, EditorStatusPill } from "@/features/dev/components";
import type { SubstanceArticle } from "@/schema";
import { buildEditorReferenceDiagnostics } from "@/lib/citations/editorReferenceDiagnostics";

type EditorCitationDiagnosticsPanelProps = {
  article: SubstanceArticle;
  compact?: boolean;
};

function WarningList({
  title,
  ids,
  summary,
  collapsible = false,
}: {
  title: string;
  ids: string[];
  /** Compact one-line label shown while a collapsible list is collapsed. */
  summary?: string;
  /** Collapse the badge list behind a show/hide toggle (collapsed by default). */
  collapsible?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  if (ids.length === 0) return null;

  const headerContent = (
    <>
      <Icon icon="lucide:triangle-alert" size={16} className="shrink-0 theme-warning-text" />
      <span className="min-w-0">{(collapsible && summary) || title}</span>
    </>
  );

  return (
    <div className="rounded-xl border border-[color:var(--theme-warning-border)] bg-[var(--theme-warning-bg)] p-3">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          aria-expanded={isExpanded}
          className="flex w-full items-center gap-2 text-left text-sm font-medium theme-warning-text-strong"
        >
          {headerContent}
          <span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-normal theme-warning-text">
            {isExpanded ? "Hide" : "Show"}
            <Icon icon={isExpanded ? "lucide:chevron-down" : "lucide:chevron-right"} size={14} />
          </span>
        </button>
      ) : (
        <p className="flex items-center gap-2 text-sm font-medium theme-warning-text-strong">
          {headerContent}
        </p>
      )}
      {(!collapsible || isExpanded) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {ids.map((id) => (
            <EditorStatusPill key={`${title}-${id}`} tone="caution" className="max-w-full" title={id}>
              <span className="truncate">{id}</span>
            </EditorStatusPill>
          ))}
        </div>
      )}
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
    <EditorSection icon="lucide:brackets" title="Citation token preview">
      <div className="flex flex-wrap items-center gap-2">
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

      {/* Warnings are rare; stack them full-width instead of leaving empty grid cells */}
      <div className="space-y-3">
        <WarningList title="Unknown inline reference IDs" ids={diagnostics.unknownInlineReferenceIds} />
        <WarningList title="Unknown route reference IDs" ids={diagnostics.unknownStructuredReferenceIds} />
        <WarningList
          title="Structured references with no current links"
          ids={diagnostics.orphanedReferenceIds}
          collapsible
          summary={`${diagnostics.orphanedReferenceIds.length} structured reference${
            diagnostics.orphanedReferenceIds.length === 1 ? " has" : "s have"
          } no inline links`}
        />
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
                  <EditorStatusPill tone="neutral">{preview.kind}</EditorStatusPill>
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
    </EditorSection>
  );
}
