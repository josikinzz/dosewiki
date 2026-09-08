import { useMemo, useRef, useState } from "react";

import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Surface } from "@/components/ui/surface";
import { EditorNotice, EditorSection, EditorStatusPill } from "@/features/dev/components";
import type { EditorSectionProps } from "@/features/dev/components";
import type { SubstanceArticle } from "@/schema";
import { buildEditorReferenceDiagnostics } from "@/lib/citations/editorReferenceDiagnostics";

type EditorCitationDiagnosticsPanelProps = {
  article: SubstanceArticle;
  compact?: boolean;
  headingLevel?: EditorSectionProps["headingLevel"];
};

function WarningList({
  title,
  ids,
  summary,
  collapsible = false,
  headingLevel,
}: {
  title: string;
  ids: string[];
  /** Compact one-line label shown while a collapsible list is collapsed. */
  summary?: string;
  /** Collapse the badge list behind a show/hide toggle (collapsed by default). */
  collapsible?: boolean;
  headingLevel: 3 | 4 | 5;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  if (ids.length === 0) return null;

  const badges = (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => (
        <EditorStatusPill key={`${title}-${id}`} tone="caution" className="max-w-full" title={id}>
          <span className="truncate">{id}</span>
        </EditorStatusPill>
      ))}
    </div>
  );

  if (!collapsible) {
    return <EditorNotice headingLevel={headingLevel} notice={{ tone: "warning", title, message: badges }} />;
  }

  return (
    <EditorNotice
      headingLevel={headingLevel}
      notice={{
        tone: "warning",
        title: (
          <button
            type="button"
            onClick={() => setIsExpanded((value) => !value)}
            aria-expanded={isExpanded}
            className="theme-editor-disclosure-trigger -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 py-0.5 text-left"
          >
            <span className="min-w-0">{summary || title}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-normal">
              {isExpanded ? "Hide" : "Show"}
              <ExpandIndicator isExpanded={isExpanded} />
            </span>
          </button>
        ),
        message: isExpanded ? badges : null,
      }}
    />
  );
}

/**
 * The diagnostics walk every prose field in the article, so a memo keyed on the
 * article object alone never hits when the caller re-derives that object each
 * render (RHF form values). Key on a content signature instead.
 */
function useCitationDiagnostics(article: SubstanceArticle) {
  const signature = useMemo(() => {
    try {
      return JSON.stringify(article);
    } catch {
      return null;
    }
  }, [article]);

  const cacheRef = useRef<{ signature: string | null; article: SubstanceArticle } | null>(null);
  if (
    !cacheRef.current ||
    signature === null ||
    cacheRef.current.signature !== signature
  ) {
    cacheRef.current = { signature, article };
  }
  const stableArticle = cacheRef.current.article;

  return useMemo(() => buildEditorReferenceDiagnostics(stableArticle), [stableArticle]);
}

export function EditorCitationDiagnosticsPanel({
  article,
  compact = false,
  headingLevel,
}: EditorCitationDiagnosticsPanelProps) {
  const diagnostics = useCitationDiagnostics(article);
  const previewLimit = compact ? 4 : 8;
  const prosePreviews = diagnostics.prosePreviews.slice(0, previewLimit);
  const routePreviews = diagnostics.routePreviews.slice(0, previewLimit);
  const warningHeadingLevel = headingLevel === "h4" ? 5 : headingLevel === "h3" ? 4 : 3;

  return (
    <EditorSection icon="lucide:brackets" title="Citation token preview" headingLevel={headingLevel}>
      <div className="flex flex-wrap items-center gap-2">
        <EditorStatusPill tone="neutral">
          {article.references?.length ?? 0} structured {(article.references?.length ?? 0) === 1 ? "reference" : "references"}
        </EditorStatusPill>
        <EditorStatusPill tone="neutral">
          {diagnostics.prosePreviews.length} tokenized text {diagnostics.prosePreviews.length === 1 ? "field" : "fields"}
        </EditorStatusPill>
        <EditorStatusPill tone="neutral">
          {diagnostics.routePreviews.length} route {diagnostics.routePreviews.length === 1 ? "linkage" : "linkages"}
        </EditorStatusPill>
      </div>

      {/* Warnings are rare; stack them full-width instead of leaving empty grid cells */}
      <div className="space-y-3">
        <WarningList headingLevel={warningHeadingLevel} title="Unknown inline reference IDs" ids={diagnostics.unknownInlineReferenceIds} />
        <WarningList headingLevel={warningHeadingLevel} title="Unknown route reference IDs" ids={diagnostics.unknownStructuredReferenceIds} />
        <WarningList
          headingLevel={warningHeadingLevel}
          title="Structured references with no current links"
          ids={diagnostics.orphanedReferenceIds}
          collapsible
          summary={`${diagnostics.orphanedReferenceIds.length} structured reference${
            diagnostics.orphanedReferenceIds.length === 1 ? " has" : "s have"
          } no inline links`}
        />
        <WarningList headingLevel={warningHeadingLevel} title="Adjacent duplicate cite tokens" ids={diagnostics.duplicateAdjacentTokenIds} />
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
