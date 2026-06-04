import { memo } from "react";
import { Icon } from "@/components/common/Icon";
import { PublicContentSection } from "@/components/layout/PublicContentPrimitives";
import type { TripReportSubstance } from "@/types/tripReport";

interface SubstancesCardProps {
  substances: TripReportSubstance[];
}

/**
 * Displays the substances used in a trip report as a compact metadata list.
 */
export const SubstancesCard = memo(function SubstancesCard({ substances }: SubstancesCardProps) {
  if (substances.length === 0) {
    return null;
  }

  return (
    <PublicContentSection
      layout="plain"
      heading="Substances"
      icon="lucide:pill"
      className="space-y-4"
    >
      <div className="divide-y divide-white/[0.08]">
        {substances.map((substance, index) => (
          <div
            key={`${substance.name}-${index}`}
            className="py-3 first:pt-0 last:pb-0"
          >
            <div className="flex min-w-0 items-start gap-3">
              <Icon icon="lucide:beaker" className="theme-icon-accent mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="theme-text-primary break-words text-sm font-semibold">
                  {substance.name}
                </p>
                {substance.dose || substance.roa ? (
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    {substance.dose && (
                      <span className="theme-text-secondary flex items-center gap-1.5">
                        <span className="theme-text-faint text-[10px] font-semibold uppercase tracking-wider">
                          Dose:
                        </span>
                        <span className="font-mono text-xs">{substance.dose}</span>
                      </span>
                    )}
                    {substance.roa && (
                      <span className="theme-text-secondary flex items-center gap-1.5">
                        <span className="theme-text-faint text-[10px] font-semibold uppercase tracking-wider">
                          ROA:
                        </span>
                        <span className="text-xs">{substance.roa}</span>
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </PublicContentSection>
  );
});
