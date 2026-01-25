import { memo, useState } from "react";
import Masonry from "react-masonry-css";
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
  const { pharmacology } = article;
  const [showReceptorBinding, setShowReceptorBinding] = useState(false);

  const hasMoA = pharmacology.mechanism_of_action?.length > 0;
  const hasReceptorBinding = pharmacology.receptor_binding && Object.keys(pharmacology.receptor_binding).length > 0;
  const hasMetabolism = pharmacology.metabolism?.trim().length > 0;
  const hasMetabolites = pharmacology.metabolites?.length > 0;

  const hasAnyContent =
    hasMoA || hasReceptorBinding || hasMetabolism || hasMetabolites;

  if (!hasAnyContent) {
    return null;
  }

  return (
    <div id="pharmacology" className="space-y-6 pt-12 scroll-mt-6">
      <SectionHeader icon="mingcute:settings-6-line" title="Pharmacology" />

      <Masonry
        breakpointCols={MASONRY_BREAKPOINTS}
        className="flex w-full gap-4"
        columnClassName="flex flex-col gap-4"
      >
        {/* Mechanism of Action (with expandable Receptor Binding) */}
        {hasMoA && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 scale-100 transition-all duration-200 hover:scale-[1.02] hover:bg-white/10 hover:border-white/20 hover:shadow-lg hover:shadow-black/20">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
              <Icon icon="lucide:cog" size={20} className="text-fuchsia-200" />
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
                  <>
                    <div className="mt-4 mb-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    <ul className="space-y-2">
                      {Object.entries(pharmacology.receptor_binding).map(([receptor, value]) => (
                        <li key={receptor} className="flex items-center gap-2 text-sm text-white/80">
                          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-fuchsia-400" />
                          {receptor} {value}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <button
                  onClick={() => setShowReceptorBinding(!showReceptorBinding)}
                  className="mt-3 flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/60 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white/80"
                >
                  <Icon icon="lucide:ellipsis" size={14} />
                  <Icon icon="lucide:chevron-down" size={14}
                    className={`transition-transform ${showReceptorBinding ? "rotate-180" : ""}`}
                  />
                </button>
              </>
            )}
          </div>
        )}

        {/* Standalone Mechanism of Action from receptor binding (only when no MoA exists) */}
        {!hasMoA && hasReceptorBinding && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 scale-100 transition-all duration-200 hover:scale-[1.02] hover:bg-white/10 hover:border-white/20 hover:shadow-lg hover:shadow-black/20">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
              <Icon icon="lucide:cog" size={20} className="text-fuchsia-200" />
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
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 scale-100 transition-all duration-200 hover:scale-[1.02] hover:bg-white/10 hover:border-white/20 hover:shadow-lg hover:shadow-black/20">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
              <Icon icon="material-symbols:metabolism-rounded" size={20} className="text-fuchsia-200" />
              Metabolism
            </h3>
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
    </div>
  );
});
