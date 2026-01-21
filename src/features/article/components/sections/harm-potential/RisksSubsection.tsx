import { Icon } from "@/components/common/Icon";
import { NormalizedHarmPotential } from "./HarmPotentialUtils";
import { RiskLevelBadge } from "./HarmPotentialBadges";

interface RisksSubsectionProps {
  risks: NormalizedHarmPotential['risks'];
}

export function RisksSubsection({ risks }: RisksSubsectionProps) {
  const { psychosis, seizure } = risks;
  
  const hasPsychosis = (psychosis.description || "").trim().length > 0;
  const hasSeizure = (seizure.description || "").trim().length > 0;
  
  if (!hasPsychosis && !hasSeizure) return null;

  return (
    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 shadow-lg shadow-rose-900/10">
      <div className="mb-4 flex items-center gap-2 border-b border-rose-500/20 pb-3">
        <Icon icon="streamline:dangerous-zone-sign-remix" size={24} className="text-rose-400" />
        <h3 className="text-lg font-semibold text-rose-100">Acute Risks</h3>
      </div>
      
      <div className="flex flex-col gap-4">
        {hasPsychosis && (
          <div className="flex flex-col rounded-lg bg-rose-500/10 p-4 ring-1 ring-inset ring-rose-500/20">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon icon="tabler:mood-crazy-happy" size={18} className="text-rose-300" />
                <span className="font-semibold text-rose-200">Psychosis Risk</span>
              </div>
              <RiskLevelBadge level={psychosis.level} />
            </div>
            <p className="text-sm leading-relaxed text-rose-100/90">{psychosis.description}</p>
          </div>
        )}
        
        {hasSeizure && (
          <div className="flex flex-col rounded-lg bg-rose-500/10 p-4 ring-1 ring-inset ring-rose-500/20">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon icon="mage:zap" size={18} className="text-rose-300" />
                <span className="font-semibold text-rose-200">Seizure Risk</span>
              </div>
              <RiskLevelBadge level={seizure.level} />
            </div>
            <p className="text-sm leading-relaxed text-rose-100/90">{seizure.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}
