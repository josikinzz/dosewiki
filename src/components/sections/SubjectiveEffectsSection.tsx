import { Sparkles } from "lucide-react";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import { Badge } from "@/components/ui/badge";

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
        <IconBadge icon={Sparkles} label="Subjective effects" />
        Subjective Effects
      </h2>
      <p className="mt-2 text-sm text-white/70">Effects vary widely by individual, dose, and context.</p>
      <div className="mt-4 flex flex-wrap gap-3 gap-fallback-wrap-3">
        {effects.map((effect) => {
          const isInteractive = Boolean(onEffectSelect);
          return isInteractive ? (
            <Badge
              key={effect}
              variant="effectInteractive"
              role="button"
              tabIndex={0}
              onClick={() => handleSelect(effect)}
              onKeyDown={(e) => e.key === "Enter" && handleSelect(effect)}
            >
              {effect}
            </Badge>
          ) : (
            <Badge key={effect} variant="effect">
              {effect}
            </Badge>
          );
        })}
      </div>
    </SectionCard>
  );
}

