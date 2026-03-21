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
      <h2 className="theme-text-primary mb-4 flex items-center gap-3 text-lg font-semibold">
        <IconBadge icon="lucide:pill" label="Substances" />
        Substances
      </h2>

      <div className="space-y-3">
        {substances.map((substance, index) => (
          <div
            key={`${substance.name}-${index}`}
            className="theme-public-card-subtle rounded-xl border p-4 transition hover:border-[color:var(--theme-card-border-strong)] hover:bg-[color:color-mix(in_srgb,var(--theme-surface-strong)_76%,transparent)]"
          >
            {/* Substance name */}
            <div className="flex items-center gap-2">
              <Icon icon="lucide:beaker" className="h-4 w-4 text-[color:var(--theme-accent-soft)]" />
              <span className="theme-text-primary font-medium">{substance.name}</span>
            </div>

            {/* Dose and ROA metadata */}
            {(substance.dose || substance.roa) && (
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {substance.dose && (
                  <span className="theme-text-secondary flex items-center gap-1.5">
                    <span className="theme-text-faint text-[10px] font-semibold uppercase tracking-wider">Dose:</span>
                    <span className="font-mono text-xs">{substance.dose}</span>
                  </span>
                )}
                {substance.roa && (
                  <span className="theme-text-secondary flex items-center gap-1.5">
                    <Icon icon="lucide:syringe" className="theme-text-faint h-3 w-3" />
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
