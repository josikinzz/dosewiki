import { Icon } from "@/components/common/Icon";
import { SectionCard } from "@/components/common/SectionCard";
import { Button } from "@/components/ui/button";
import { SourcePreviewModal } from "./SourcePreviewModal";
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
          <h2 className="flex items-center gap-2 text-lg font-semibold text-fuchsia-200">
            <Icon icon="lucide:file-text" className="h-5 w-5 text-fuchsia-300" size={20} />
            Available Sources
            <span className="text-sm font-normal text-white/50">({availableSources.length})</span>
            {isLoadingSubstance && (
              <Icon icon="lucide:loader-2" className="ml-2 h-4 w-4 animate-spin text-white/40" size={16} />
            )}
          </h2>
          {sourcesExpanded ? (
            <Icon icon="lucide:chevron-down" className="h-5 w-5 text-white/40" size={20} />
          ) : (
            <Icon icon="lucide:chevron-right" className="h-5 w-5 text-white/40" size={20} />
          )}
        </button>
        {sourcesExpanded && (
          <>
            {(harmPotentialQuotes || pharmacologyQuotes || historyCultureQuotes) && (
              <div className="mb-4 mt-4 space-y-1">
                {harmPotentialQuotes && (
                  <p className="text-sm text-emerald-300">
                    ✓ Extracted harm potential quotes available for this substance
                  </p>
                )}
                {pharmacologyQuotes && (
                  <p className="text-sm text-emerald-300">
                    ✓ Extracted pharmacology quotes available for this substance
                  </p>
                )}
                {historyCultureQuotes && (
                  <p className="text-sm text-emerald-300">
                    ✓ Extracted history & culture quotes available for this substance
                  </p>
                )}
              </div>
            )}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {availableSources.map((source) => {
                const content = getSourceContent(source.id);
                return (
                  <div
                    key={source.id}
                    className="relative aspect-square rounded-xl border border-white/10 bg-slate-950/60"
                  >
                    <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                      <span className="truncate text-sm font-medium text-white">{source.displayName}</span>
                      <Button
                        variant="iconSmall"
                        onClick={() => onOpenSourcePreview(source.id)}
                        title="Open fullscreen"
                      >
                        <Icon icon="lucide:maximize-2" className="h-4 w-4" size={16} />
                      </Button>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 top-10 overflow-auto p-3">
                      <pre className="whitespace-pre-wrap font-mono text-xs text-white/70">
                        {content ?? "Loading..."}
                      </pre>
                    </div>
                  </div>
                );
              })}
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
