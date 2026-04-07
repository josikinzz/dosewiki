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
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Icon icon="jam:repeat" size={20} className="text-fuchsia-200" />
        <h3 className="font-semibold text-white">Addiction & Dependence</h3>
      </div>

      {hasPsychological && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
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

      {hasPsychological && hasPhysical && (
        <div className="h-px bg-white/[0.06]" />
      )}

      {hasPhysical && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
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
  );
}
