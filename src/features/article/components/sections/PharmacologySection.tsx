import { memo, useState } from "react";
import Masonry from "react-masonry-css";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { SectionHeader } from "@/components/common/SectionHeader";
import type { SubstanceArticle } from "@/schema";

const MASONRY_BREAKPOINTS = {
  default: 2,
  768: 1,
};

// Convert mechanism text to slug for navigation
function mechanismToSlug(moa: string): string {
  return moa.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Parse mechanism entry to extract base name and optional qualifier
function parseMechanismEntry(entry: string): { base: string; qualifier?: string } {
  const match = entry.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (match) {
    const base = match[1].trim();
    const qualifier = match[2]?.trim();
    if (base.length > 0) {
      return {
        base,
        qualifier: qualifier && qualifier.length > 0 ? qualifier : undefined,
      };
    }
  }
  return { base: entry.trim() };
}

interface PharmacologySectionProps {
  article: SubstanceArticle;
  /** Called when a mechanism of action is clicked */
  onSelectMechanism?: (slug: string, qualifier?: string) => void;
}

export const PharmacologySection = memo(function PharmacologySection({
  article,
  onSelectMechanism,
}: PharmacologySectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { pharmacology } = article;

  const hasSummary = pharmacology.summary?.trim().length > 0;
  const hasReceptorProfile = pharmacology.receptor_profile?.length > 0;
  const hasPharmacokinetics = pharmacology.pharmacokinetics?.trim().length > 0;
  const hasMetabolites = pharmacology.metabolites?.length > 0;
  const summaryParagraphs = hasSummary
    ? pharmacology.summary
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
    : [];
  const hasAdditionalSummary = summaryParagraphs.length > 1;
  const hasSupplementaryCards =
    hasReceptorProfile || hasPharmacokinetics || hasMetabolites;
  const canCollapse = hasSummary && (hasAdditionalSummary || hasSupplementaryCards);
  const visibleSummaryParagraphs = canCollapse && !isExpanded
    ? summaryParagraphs.slice(0, 1)
    : summaryParagraphs;

  const hasAnyContent =
    hasSummary || hasReceptorProfile || hasPharmacokinetics || hasMetabolites;

  if (!hasAnyContent) {
    return null;
  }

  return (
    <div id="pharmacology" className="space-y-6 pt-12 scroll-mt-6">
      <SectionHeader icon="mingcute:settings-6-line" title="Pharmacology" />

      {/* Plain-language summary */}
      {hasSummary && (
        <div className="space-y-3 text-sm leading-relaxed text-white/80">
          {visibleSummaryParagraphs.map((paragraph, idx) => (
            <p key={idx}>{paragraph}</p>
          ))}

          {canCollapse && !isExpanded && (
            <div className="flex justify-center pt-1.5">
              <ExpandButton
                isExpanded={isExpanded}
                onToggle={() => setIsExpanded(true)}
              />
            </div>
          )}
        </div>
      )}

      {(isExpanded || !canCollapse) && (
        <>
          <Masonry
            breakpointCols={MASONRY_BREAKPOINTS}
            className="flex w-full gap-4"
            columnClassName="flex flex-col gap-4"
          >
            {/* Receptor Profile (merged MoA + binding) */}
            {hasReceptorProfile && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 scale-100 transition-all duration-200 hover:scale-[1.02] hover:bg-white/10 hover:border-white/20 hover:shadow-lg hover:shadow-black/20">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
                  <Icon icon="lucide:cog" size={20} className="text-fuchsia-200" />
                  Receptor Profile
                </h3>
                <ul className="space-y-2">
                  {pharmacology.receptor_profile.map((entry, idx) => {
                    const tag = entry.tag;
                    const { base, qualifier } = tag
                      ? parseMechanismEntry(tag)
                      : { base: entry.receptor, qualifier: undefined };

                    const affinityText = [entry.affinity, entry.efficacy]
                      .filter(Boolean)
                      .join(", ");

                    return (
                      <li key={idx} className="flex items-center gap-2 text-sm text-white/80">
                        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-fuchsia-400" />
                        {onSelectMechanism && tag ? (
                          <button
                            type="button"
                            className="flex flex-wrap items-center gap-1.5 text-left transition-colors hover:text-fuchsia-300"
                            onClick={() => onSelectMechanism(mechanismToSlug(tag))}
                          >
                            {base}
                            {qualifier && (
                              <span className="rounded-full bg-fuchsia-500/20 px-1.5 py-0.5 text-[10px] font-medium text-fuchsia-300">
                                {qualifier}
                              </span>
                            )}
                            {affinityText && (
                              <span className="text-white/50"> — {affinityText}</span>
                            )}
                          </button>
                        ) : (
                          <span className="flex flex-wrap items-center gap-1.5">
                            {base}
                            {qualifier && (
                              <span className="rounded-full bg-fuchsia-500/20 px-1.5 py-0.5 text-[10px] font-medium text-fuchsia-300">
                                {qualifier}
                              </span>
                            )}
                            {affinityText && (
                              <span className="text-white/50"> — {affinityText}</span>
                            )}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Pharmacokinetics & Metabolites */}
            {(hasPharmacokinetics || hasMetabolites) && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 scale-100 transition-all duration-200 hover:scale-[1.02] hover:bg-white/10 hover:border-white/20 hover:shadow-lg hover:shadow-black/20">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
                  <Icon icon="material-symbols:metabolism-rounded" size={20} className="text-fuchsia-200" />
                  Pharmacokinetics
                </h3>
                {hasPharmacokinetics && (
                  <p className="text-sm text-white/80">{pharmacology.pharmacokinetics}</p>
                )}
                {hasMetabolites && (
                  <div className="mt-3">
                    <span className="text-xs font-medium text-white/60">Metabolites:</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {pharmacology.metabolites.map((met, idx) => (
                        <span
                          key={idx}
                          className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70"
                        >
                          {met}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Masonry>

          {canCollapse && (
            <div className="flex justify-center pt-1.5">
              <ExpandButton
                isExpanded={isExpanded}
                onToggle={() => setIsExpanded((expanded) => !expanded)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
});
