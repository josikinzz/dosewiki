import { Icon } from "@/components/common/Icon";
import { NormalizedHarmPotential } from "./HarmPotentialUtils";
import { RiskLevelBadge } from "./HarmPotentialBadges";

interface AddictionSubsectionProps {
  addiction: NormalizedHarmPotential['addiction'];
}

export function AddictionSubsection({ addiction }: AddictionSubsectionProps) {
  const hasPsychological = !!addiction.psychological.description;
  const hasPhysical = !!addiction.physical_dependence.description;

  if (!hasPsychological && !hasPhysical) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Icon icon="jam:repeat" size={20} className="text-rose-300" />
          <h3 className="font-semibold text-white">Addiction & Dependence</h3>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>
      
      <div className="columns-1 gap-4 space-y-4 md:columns-2">
        {hasPsychological && (
          <div className="break-inside-avoid flex flex-col rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/20">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon icon="icon-park-outline:emotion-unhappy" size={18} className="text-fuchsia-300" />
                <span className="text-sm font-semibold text-white">Psychological</span>
              </div>
              <RiskLevelBadge level={addiction.psychological.level} />
            </div>
            <p className="text-sm leading-relaxed text-white/80">
              {addiction.psychological.description}
            </p>
          </div>
        )}

        {hasPhysical && (
          <div className="break-inside-avoid flex flex-col rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/20">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon icon="covid:graph-cured-decreasing" size={18} className="text-fuchsia-300" />
                <span className="text-sm font-semibold text-white">Physical</span>
              </div>
              <RiskLevelBadge level={addiction.physical_dependence.level} />
            </div>
            <p className="text-sm leading-relaxed text-white/80">
              {addiction.physical_dependence.description}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
