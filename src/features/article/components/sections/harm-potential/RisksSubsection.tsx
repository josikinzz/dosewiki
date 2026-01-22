import { Icon } from "@/components/common/Icon";
import { NormalizedHarmPotential } from "./HarmPotentialUtils";
import { RiskLevelBadge } from "./HarmPotentialBadges";

interface RisksSubsectionProps {
  risks: NormalizedHarmPotential['risks'];
}

export function PsychosisRiskSubsection({ risks }: RisksSubsectionProps) {
  const { psychosis } = risks;
  const hasPsychosis = (psychosis.description || "").trim().length > 0;

  if (!hasPsychosis) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon icon="tabler:mood-crazy-happy" size={20} className="text-rose-300" />
            <h3 className="font-semibold text-white">Psychosis Risk</h3>
          </div>
          <RiskLevelBadge level={psychosis.level} />
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      <p className="text-sm leading-relaxed text-white/80">
        {psychosis.description}
      </p>
    </div>
  );
}

export function SeizureRiskSubsection({ risks }: RisksSubsectionProps) {
  const { seizure } = risks;
  const hasSeizure = (seizure.description || "").trim().length > 0;

  if (!hasSeizure) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon icon="mage:zap" size={20} className="text-rose-300" />
            <h3 className="font-semibold text-white">Seizure Risk</h3>
          </div>
          <RiskLevelBadge level={seizure.level} />
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      <p className="text-sm leading-relaxed text-white/80">
        {seizure.description}
      </p>
    </div>
  );
}

// Legacy export for backward compatibility - now just renders both subsections
export function RisksSubsection({ risks }: RisksSubsectionProps) {
  const { psychosis, seizure } = risks;

  const hasPsychosis = (psychosis.description || "").trim().length > 0;
  const hasSeizure = (seizure.description || "").trim().length > 0;

  if (!hasPsychosis && !hasSeizure) return null;

  return (
    <>
      <PsychosisRiskSubsection risks={risks} />
      <SeizureRiskSubsection risks={risks} />
    </>
  );
}
