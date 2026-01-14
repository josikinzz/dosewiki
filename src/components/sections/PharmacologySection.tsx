import { memo, useState } from "react";
import Masonry from "react-masonry-css";
import { Brain, ChevronDown, Ellipsis, UserRoundCog } from "lucide-react";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import type { SubstanceArticle } from "../../schema";

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
  const { pharmacology } = article;
  const [showReceptorBinding, setShowReceptorBinding] = useState(false);

  const hasMoA = pharmacology.mechanism_of_action.length > 0;
  const hasReceptorBinding = Object.keys(pharmacology.receptor_binding).length > 0;
  const hasMetabolism = pharmacology.metabolism.trim().length > 0;
  const hasMetabolites = pharmacology.metabolites.length > 0;

  const hasAnyContent =
    hasMoA || hasReceptorBinding || hasMetabolism || hasMetabolites;

  if (!hasAnyContent) {
    return null;
  }

  return (
    <SectionCard delay={0}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon={UserRoundCog} label="Pharmacology" />
        Pharmacology
      </h2>

      <Masonry
        breakpointCols={MASONRY_BREAKPOINTS}
        className="flex w-full gap-4"
        columnClassName="flex flex-col gap-4"
      >
        {/* Mechanism of Action (with expandable Receptor Binding) */}
        {hasMoA && (
          <div className="relative rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
              <Brain className="h-5 w-5 text-fuchsia-200" />
              Mechanism of Action
            </h3>
            <ul className="space-y-2">
              {pharmacology.mechanism_of_action.map((moa, idx) => {
                const { base, qualifier } = parseMechanismEntry(moa);
                return (
                  <li key={idx} className="flex items-center gap-2 text-sm text-white/80">
                    <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-fuchsia-400" />
                    {onSelectMechanism ? (
                      <button
                        type="button"
                        className="flex flex-wrap items-center gap-1.5 text-left transition-colors hover:text-fuchsia-300"
                        onClick={() => onSelectMechanism(mechanismToSlug(moa))}
                      >
                        {base}
                        {qualifier && (
                          <span className="rounded-full bg-fuchsia-500/20 px-1.5 py-0.5 text-[10px] font-medium text-fuchsia-300">
                            {qualifier}
                          </span>
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
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Expandable additional mechanisms from receptor binding data */}
            {hasReceptorBinding && (
              <>
                {showReceptorBinding && (
                  <ul className="mt-4 space-y-2 border-t border-white/10 pt-4 pb-6">
                    {Object.entries(pharmacology.receptor_binding).map(([receptor, value]) => (
                      <li key={receptor} className="flex items-center gap-2 text-sm text-white/80">
                        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-fuchsia-400" />
                        {receptor} {value}
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  onClick={() => setShowReceptorBinding(!showReceptorBinding)}
                  className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-white/60 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white/80"
                >
                  <Ellipsis className="h-3 w-3" />
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${showReceptorBinding ? "rotate-180" : ""}`}
                  />
                </button>
              </>
            )}
          </div>
        )}

        {/* Standalone Mechanism of Action from receptor binding (only when no MoA exists) */}
        {!hasMoA && hasReceptorBinding && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
              <Brain className="h-5 w-5 text-fuchsia-200" />
              Mechanism of Action
            </h3>
            <ul className="space-y-2">
              {Object.entries(pharmacology.receptor_binding).map(([receptor, value]) => (
                <li key={receptor} className="flex items-center gap-2 text-sm text-white/80">
                  <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-fuchsia-400" />
                  {receptor} {value}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Metabolism & Metabolites */}
        {(hasMetabolism || hasMetabolites) && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 font-semibold text-white">Metabolism</h3>
            {hasMetabolism && (
              <p className="text-sm text-white/80">{pharmacology.metabolism}</p>
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
    </SectionCard>
  );
});
