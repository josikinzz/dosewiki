import { memo } from "react";
import Masonry from "react-masonry-css";
import { Beaker, Brain } from "lucide-react";
import { SectionCard } from "../../../../common/SectionCard";
import { IconBadge } from "../../../../common/IconBadge";
import type { GeneratedArticle } from "../../../../../types/generatorSchema";

const MASONRY_BREAKPOINTS = {
  default: 2,
  768: 1,
};

interface PreviewPharmacologySectionProps {
  article: GeneratedArticle;
}

export const PreviewPharmacologySection = memo(function PreviewPharmacologySection({
  article,
}: PreviewPharmacologySectionProps) {
  const { pharmacology } = article;

  const hasMoA = pharmacology.mechanism_of_action.length > 0;
  const hasReceptorBinding = Object.keys(pharmacology.receptor_binding).length > 0;
  const hasMetabolism = pharmacology.metabolism.trim().length > 0;
  const hasMetabolites = pharmacology.metabolites.length > 0;
  const hasHalfLife = pharmacology.half_life.trim().length > 0;
  const hasBioNotes = pharmacology.bioavailability_notes.trim().length > 0;

  const hasAnyContent =
    hasMoA || hasReceptorBinding || hasMetabolism || hasMetabolites || hasHalfLife || hasBioNotes;

  if (!hasAnyContent) {
    return null;
  }

  return (
    <SectionCard delay={0}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon={Beaker} label="Pharmacology" />
        Pharmacology
      </h2>

      <Masonry
        breakpointCols={MASONRY_BREAKPOINTS}
        className="flex w-full gap-4"
        columnClassName="flex flex-col gap-4"
      >
        {/* Mechanism of Action */}
        {hasMoA && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Brain className="h-4 w-4 text-fuchsia-200" />
              Mechanism of Action
            </h3>
            <ul className="space-y-2">
              {pharmacology.mechanism_of_action.map((moa, idx) => (
                <li key={idx} className="flex items-center gap-2 text-sm text-white/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400" />
                  {moa}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Receptor Binding */}
        {hasReceptorBinding && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 text-sm font-semibold text-white">Receptor Binding</h3>
            <div className="space-y-2">
              {Object.entries(pharmacology.receptor_binding).map(([receptor, value]) => (
                <div key={receptor} className="flex items-center justify-between text-sm">
                  <span className="text-white/60">{receptor}</span>
                  <span className="font-mono text-white/80">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metabolism & Metabolites */}
        {(hasMetabolism || hasMetabolites) && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 text-sm font-semibold text-white">Metabolism</h3>
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

        {/* Half-life & Bioavailability */}
        {(hasHalfLife || hasBioNotes) && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            {hasHalfLife && (
              <div className="mb-3">
                <span className="text-xs font-medium text-white/60">Half-life:</span>
                <p className="mt-1 text-sm text-white/80">{pharmacology.half_life}</p>
              </div>
            )}
            {hasBioNotes && (
              <div>
                <span className="text-xs font-medium text-white/60">Bioavailability Notes:</span>
                <p className="mt-1 text-sm text-white/80">{pharmacology.bioavailability_notes}</p>
              </div>
            )}
          </div>
        )}
      </Masonry>
    </SectionCard>
  );
});
