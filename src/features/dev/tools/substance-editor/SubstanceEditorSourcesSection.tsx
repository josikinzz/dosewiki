import { Icon } from "@/components/common/Icon";
import { SectionCard } from "@/components/common/SectionCard";
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
}: SubstanceEditorSourcesSectionProps) {
  if (!substanceModule || availableSources.length === 0) {
    return null;
  }

  return (
    <>
      <SectionCard delay={0.3}>
        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex w-full items-center justify-between text-left transition-opacity hover:opacity-80"
        >
          <h2 className="theme-accent-heading flex items-center gap-2 text-lg font-semibold">
            <Icon icon="lucide:file-text" className="theme-icon-accent h-5 w-5" size={20} />
            Available Sources
            <span className="theme-text-muted text-sm font-normal">({availableSources.length})</span>
            {isLoadingSubstance && (
              <Icon icon="lucide:loader-2" className="theme-text-faint ml-2 h-4 w-4 animate-spin" size={16} />
            )}
          </h2>
          {sourcesExpanded ? (
            <Icon icon="lucide:chevron-down" className="theme-text-faint h-5 w-5" size={20} />
          ) : (
            <Icon icon="lucide:chevron-right" className="theme-text-faint h-5 w-5" size={20} />
          )}
        </button>
        {sourcesExpanded && (
          <>
            {(harmPotentialQuotes || pharmacologyQuotes || historyCultureQuotes) && (
              <div className="mb-4 mt-4 space-y-1">
                {harmPotentialQuotes && (
                  <p className="flex items-center gap-1.5 text-sm text-[color:var(--theme-evidence-text)]">
                    <Icon icon="lucide:check" className="h-3.5 w-3.5" size={14} />
                    Extracted harm potential quotes available for this substance
                  </p>
                )}
                {pharmacologyQuotes && (
                  <p className="flex items-center gap-1.5 text-sm text-[color:var(--theme-evidence-text)]">
                    <Icon icon="lucide:check" className="h-3.5 w-3.5" size={14} />
                    Extracted pharmacology quotes available for this substance
                  </p>
                )}
                {historyCultureQuotes && (
                  <p className="flex items-center gap-1.5 text-sm text-[color:var(--theme-evidence-text)]">
                    <Icon icon="lucide:check" className="h-3.5 w-3.5" size={14} />
                    Extracted history & culture quotes available for this substance
                  </p>
                )}
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
