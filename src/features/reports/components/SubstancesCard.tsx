import { memo } from "react";
import { Icon } from "@/components/common/Icon";
import { SectionCard } from "@/components/common/SectionCard";
import { IconBadge } from "@/components/common/IconBadge";
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
    <SectionCard delay={delay}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon="lucide:pill" label="Substances" />
        Substances
      </h2>

      <div className="space-y-3">
        {substances.map((substance, index) => (
          <div
            key={`${substance.name}-${index}`}
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-fuchsia-400/40 hover:bg-white/8"
          >
            {/* Substance name */}
            <div className="flex items-center gap-2">
              <Icon icon="lucide:beaker" className="h-4 w-4 text-fuchsia-200" />
              <span className="font-medium text-white/90">{substance.name}</span>
            </div>

            {/* Dose and ROA metadata */}
            {(substance.dose || substance.roa) && (
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {substance.dose && (
                  <span className="flex items-center gap-1.5 text-white/70">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Dose:</span>
                    <span className="font-mono text-xs">{substance.dose}</span>
                  </span>
                )}
                {substance.roa && (
                  <span className="flex items-center gap-1.5 text-white/70">
                    <Icon icon="lucide:syringe" className="h-3 w-3 text-white/40" />
                    <span className="text-xs">{substance.roa}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
});
