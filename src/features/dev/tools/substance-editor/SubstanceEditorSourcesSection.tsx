import { Icon } from "@/components/common/Icon";
import { SectionCard } from "@/components/common/SectionCard";
import { EditorStatusPill } from "@/features/dev/components";
import { SourcePreviewModal } from "./SourcePreviewModal";
import { SourcePreviewTile } from "./SourcePreviewTile";
import type { SourceInfo, SubstanceModule } from "@/hooks/useArticleSources";
import type { ExtractedSourceInfo } from "@/utils/sectionSources";

type SubstanceEditorSourcesSectionProps = {
  substanceModule: SubstanceModule | null;
  availableSources: SourceInfo[];
  sourcesExpanded: boolean;
  isLoadingSubstance: boolean;
  harmPotentialQuotes: string | null;
  pharmacologyQuotes: string | null;
  historyCultureQuotes: string | null;
  onToggleExpanded: () => void;
  onOpenSourcePreview: (sourceId: string) => void;
  fullscreenSource: SourceInfo | undefined;
  fullscreenSourceContent: string | null;
  onCloseSourcePreview: () => void;
  getSourceContent: (sourceId: string) => string | null;
  harmPotentialSources: ExtractedSourceInfo | null;
  pharmacologySources: ExtractedSourceInfo | null;
  historyCultureSources: ExtractedSourceInfo | null;
};

export function SubstanceEditorSourcesSection({
  substanceModule,
  availableSources,
  sourcesExpanded,
  isLoadingSubstance,
  harmPotentialQuotes,
  pharmacologyQuotes,
  historyCultureQuotes,
  onToggleExpanded,
  onOpenSourcePreview,
  fullscreenSource,
  fullscreenSourceContent,
  onCloseSourcePreview,
  getSourceContent,
  harmPotentialSources,
  pharmacologySources,
  historyCultureSources,
}: SubstanceEditorSourcesSectionProps) {
  if (!substanceModule || availableSources.length === 0) {
    return null;
  }

  const quotePacks = [
    {
      label: "Harm potential",
      available: Boolean(harmPotentialQuotes),
      count: harmPotentialSources?.count,
    },
    {
      label: "Pharmacology",
      available: Boolean(pharmacologyQuotes),
      count: pharmacologySources?.count,
    },
    {
      label: "History & culture",
      available: Boolean(historyCultureQuotes),
      count: historyCultureSources?.count,
    },
  ];
  const availableQuotePacks = quotePacks.filter((pack) => pack.available);

  return (
    <>
      <SectionCard delay={0.3}>
        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex w-full items-start justify-between gap-4 text-left transition-opacity hover:opacity-80"
        >
          <div className="space-y-1">
            <h2 className="theme-accent-heading flex flex-wrap items-center gap-2 text-lg font-semibold">
              <Icon icon="lucide:file-text" className="theme-icon-accent h-5 w-5" size={20} />
              Available Sources
              <span className="theme-text-muted text-sm font-normal">({availableSources.length})</span>
              {isLoadingSubstance && (
                <Icon icon="lucide:loader-2" className="theme-text-faint ml-1 h-4 w-4 animate-spin" size={16} />
              )}
            </h2>
            <p className="theme-text-faint text-sm">
              Inspect source text and extracted quote packs before applying generated content.
            </p>
          </div>
          {sourcesExpanded ? (
            <Icon icon="lucide:chevron-down" className="theme-text-faint h-5 w-5" size={20} />
          ) : (
            <Icon icon="lucide:chevron-right" className="theme-text-faint h-5 w-5" size={20} />
          )}
        </button>
        {sourcesExpanded && (
          <>
            {availableQuotePacks.length > 0 && (
              <div className="mt-4 rounded-xl border border-dose-border bg-dose-surface-muted p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="theme-text-muted text-xs font-medium uppercase tracking-wide">
                    Extracted quote packs
                  </p>
                  <EditorStatusPill tone="success" icon="lucide:check">
                    {availableQuotePacks.length} ready
                  </EditorStatusPill>
                </div>
                <div className="flex flex-wrap gap-2">
                  {availableQuotePacks.map((pack) => (
                    <EditorStatusPill key={pack.label} tone="neutral">
                      {pack.label}
                      {pack.count ? ` · ${pack.count} sources` : ""}
                    </EditorStatusPill>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {availableSources.map((source) => (
                <SourcePreviewTile
                  key={source.id}
                  title={source.displayName}
                  content={getSourceContent(source.id)}
                  onOpenFullscreen={() => onOpenSourcePreview(source.id)}
                />
              ))}
            </div>
          </>
        )}
      </SectionCard>

      {fullscreenSource ? (
        <SourcePreviewModal
          source={fullscreenSource}
          content={fullscreenSourceContent}
          onClose={onCloseSourcePreview}
        />
      ) : null}
    </>
  );
}
