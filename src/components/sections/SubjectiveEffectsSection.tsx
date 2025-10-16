import { Eye } from "lucide-react";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import { BADGE_BASE_CLASSES, BADGE_INTERACTIVE_CLASSES } from "../common/badgeStyles";

interface SubjectiveEffectsSectionProps {
  effects: string[];
  onEffectSelect?: (effect: string) => void;
}

export function SubjectiveEffectsSection({ effects, onEffectSelect }: SubjectiveEffectsSectionProps) {
  const handleSelect = (effect: string) => {
    if (onEffectSelect) {
      onEffectSelect(effect);
    }
  };

  return (
    <SectionCard delay={0.15}>
      <h2 className="flex items-center gap-3 gap-fallback-row-3 text-xl font-semibold text-fuchsia-300">
        <IconBadge icon={Eye} label="Subjective effects" />
        Subjective Effects
      </h2>
      <p className="mt-2 text-sm text-white/70">Effects vary widely by individual, dose, and context.</p>
      <div className="mt-4 flex flex-wrap gap-3 gap-fallback-wrap-3">
        {effects.map((effect) => {
          const isInteractive = Boolean(onEffectSelect);
          return isInteractive ? (
            <button
              key={effect}
              type="button"
              onClick={() => handleSelect(effect)}
              className={BADGE_INTERACTIVE_CLASSES}
            >
              {effect}
            </button>
          ) : (
            <span
              key={effect}
              className={BADGE_BASE_CLASSES}
            >
              {effect}
            </span>
          );
        })}
      </div>
    </SectionCard>
  );
}

