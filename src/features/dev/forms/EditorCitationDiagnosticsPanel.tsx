import { useMemo } from "react";

import { Icon } from "@/components/common/Icon";
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
    <div className="rounded-xl border border-amber-500/30 bg-[color-mix(in_srgb,#f59e0b_10%,var(--theme-panel-base))] p-3">
      <p className="flex items-center gap-2 text-sm font-medium text-amber-200">
        <Icon icon="lucide:triangle-alert" size={16} className="text-amber-300" />
        {title}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {ids.map((id) => (
          <span
            key={`${title}-${id}`}
            className="rounded-full border border-amber-400/30 bg-[color-mix(in_srgb,#f59e0b_10%,var(--theme-control-base))] px-2.5 py-1 text-xs text-amber-100"
          >
            {id}
          </span>
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
    <section className="space-y-4 rounded-2xl border border-white/10 bg-[color-mix(in_srgb,#020617_40%,var(--theme-panel-base))] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-white/80">
          <Icon icon="lucide:brackets" size={16} className="text-fuchsia-300" />
          Citation token preview
        </p>
        <span className="rounded-full border border-white/10 bg-[color-mix(in_srgb,#fff_5%,var(--theme-control-base))] px-2.5 py-1 text-xs text-white/60">
          {article.references?.length ?? 0} structured references
        </span>
        <span className="rounded-full border border-white/10 bg-[color-mix(in_srgb,#fff_5%,var(--theme-control-base))] px-2.5 py-1 text-xs text-white/60">
          {diagnostics.prosePreviews.length} tokenized text fields
        </span>
        <span className="rounded-full border border-white/10 bg-[color-mix(in_srgb,#fff_5%,var(--theme-control-base))] px-2.5 py-1 text-xs text-white/60">
          {diagnostics.routePreviews.length} route linkages
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <WarningList title="Unknown inline reference IDs" ids={diagnostics.unknownInlineReferenceIds} />
        <WarningList title="Unknown route reference IDs" ids={diagnostics.unknownStructuredReferenceIds} />
        <WarningList title="Structured references with no current links" ids={diagnostics.orphanedReferenceIds} />
        <WarningList title="Adjacent duplicate cite tokens" ids={diagnostics.duplicateAdjacentTokenIds} />
      </div>

      {routePreviews.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-white/45">
            Route reference preview
          </p>
          <div className="space-y-2">
            {routePreviews.map((preview) => (
              <div
                key={`${preview.kind}-${preview.routeIndex}-${preview.routeLabel}`}
                className="rounded-xl border border-white/10 bg-[color-mix(in_srgb,#fff_3%,var(--theme-panel-base))] px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-white/80">{preview.routeLabel}</span>
                  <span className="rounded-full bg-[color-mix(in_srgb,#fff_5%,var(--theme-control-base))] px-2 py-0.5 text-[11px] uppercase tracking-wider text-white/45">
                    {preview.kind}
                  </span>
                  {preview.hasMultipleReferences && (
                    <span className="rounded-full bg-[color-mix(in_srgb,#f59e0b_10%,var(--theme-control-base))] px-2 py-0.5 text-[11px] text-amber-200">
                      More than one reference ID
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-white/65">{preview.renderedLabels.join(", ")}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {prosePreviews.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-white/45">
            Numbered prose preview
          </p>
          <div className="space-y-2">
            {prosePreviews.map((preview) => (
              <div
                key={preview.path}
                className="rounded-xl border border-white/10 bg-[color-mix(in_srgb,#fff_3%,var(--theme-panel-base))] px-3 py-2"
              >
                <p className="text-xs text-white/45">{preview.path}</p>
                <p className="mt-1 text-sm text-white/80">{preview.renderedText}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
