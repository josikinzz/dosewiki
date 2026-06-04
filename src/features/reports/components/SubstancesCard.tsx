import { memo } from "react";
import {
  PublicContentSection,
  PublicFactTile,
} from "@/components/layout/PublicContentPrimitives";
import type { TripReportSubstance } from "@/types/tripReport";

interface SubstancesCardProps {
  substances: TripReportSubstance[];
  delay?: number;
}

/**
 * Displays the substances used in a trip report as individual tiles.
 */
export const SubstancesCard = memo(function SubstancesCard({ substances, delay = 0 }: SubstancesCardProps) {
  if (substances.length === 0) {
    return null;
  }

  return (
    <PublicContentSection
      layout="card"
      delay={delay}
      heading="Substances"
      icon="lucide:pill"
    >
      <div className="space-y-3">
        {substances.map((substance, index) => (
          <PublicFactTile
            key={`${substance.name}-${index}`}
            icon="lucide:beaker"
            label="Substance"
            value={substance.name}
            meta={
              substance.dose || substance.roa ? (
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {substance.dose && (
                  <span className="theme-text-secondary flex items-center gap-1.5">
                    <span className="theme-text-faint text-[10px] font-semibold uppercase tracking-wider">Dose:</span>
                    <span className="font-mono text-xs">{substance.dose}</span>
                  </span>
                )}
                {substance.roa && (
                  <span className="theme-text-secondary flex items-center gap-1.5">
                    <span className="theme-text-faint text-[10px] font-semibold uppercase tracking-wider">ROA:</span>
                    <span className="text-xs">{substance.roa}</span>
                  </span>
                )}
              </div>
              ) : null
            }
            className="p-4"
          />
        ))}
      </div>
    </PublicContentSection>
  );
});
