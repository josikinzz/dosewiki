import { Sparkles } from "lucide-react";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";

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
      <h2 className="flex items-center gap-3 text-xl font-semibold text-fuchsia-300">
        <IconBadge icon={Sparkles} label="Subjective effects" />
        Subjective Effects
      </h2>
      <p className="mt-2 text-sm text-white/70">Effects vary widely by individual, dose, and context.</p>
      <div className="mt-4 flex flex-wrap gap-2.5">
        {effects.map((effect) => {
          const isInteractive = Boolean(onEffectSelect);
          return isInteractive ? (
            <button
              key={effect}
              type="button"
              onClick={() => handleSelect(effect)}
              className="rounded-full bg-white/10 px-3.5 py-1.5 text-xs text-white/85 ring-1 ring-white/10 transition hover:bg-white/12 hover:text-fuchsia-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
            >
              {effect}
            </button>
          ) : (
            <span
              key={effect}
              className="rounded-full bg-white/10 px-3.5 py-1.5 text-xs text-white/85 ring-1 ring-white/10"
            >
              {effect}
            </span>
          );
        })}
      </div>
    </SectionCard>
  );
}

