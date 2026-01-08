import { memo } from "react";
import { Brain, Eye, Ear, Hand, Sparkles } from "lucide-react";
import { SectionCard } from "../../../../common/SectionCard";
import { IconBadge } from "../../../../common/IconBadge";
import { Badge } from "@/components/ui/badge";
import type { GeneratedArticle } from "../../../../../types/generatorSchema";

interface PreviewSubjectiveEffectsSectionProps {
  article: GeneratedArticle;
}

const SENSORY_CATEGORIES = [
  { key: "visual", label: "Visual", icon: Eye },
  { key: "auditory", label: "Auditory", icon: Ear },
  { key: "tactile", label: "Tactile", icon: Hand },
  { key: "olfactory", label: "Olfactory", icon: null },
  { key: "gustatory", label: "Gustatory", icon: null },
  { key: "multisensory", label: "Multisensory", icon: null },
] as const;

export const PreviewSubjectiveEffectsSection = memo(function PreviewSubjectiveEffectsSection({
  article,
}: PreviewSubjectiveEffectsSectionProps) {
  const { subjective_effects } = article;

  const hasSensory = SENSORY_CATEGORIES.some(
    ({ key }) => subjective_effects.sensory[key as keyof typeof subjective_effects.sensory].length > 0
  );
  const hasCognitive = subjective_effects.cognitive.length > 0;
  const hasPhysical = subjective_effects.physical.length > 0;

  if (!hasSensory && !hasCognitive && !hasPhysical) {
    return null;
  }

  return (
    <SectionCard delay={0}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon={Sparkles} label="Subjective Effects" />
        Subjective Effects
      </h2>
      <p className="mb-4 text-sm text-white/60">
        Effects vary widely by individual, dose, and context.
      </p>

      {/* 3-column masonry layout */}
      <div className="[column-gap:1.5rem] columns-1 md:columns-3">
        {/* Sensory Effects Card */}
        {hasSensory && (
          <div className="mb-4 break-inside-avoid rounded-xl border border-white/10 bg-white/5 p-4 last:mb-0">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Eye className="h-4 w-4 text-fuchsia-200" />
              Sensory
            </h3>
            <div className="space-y-3">
              {SENSORY_CATEGORIES.map(({ key, label, icon: Icon }) => {
                const effects = subjective_effects.sensory[key as keyof typeof subjective_effects.sensory];
                if (effects.length === 0) return null;
                return (
                  <div key={key}>
                    <span className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-white/60">
                      {Icon && <Icon className="h-3 w-3" />}
                      {label}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {effects.map((effect, idx) => (
                        <Badge key={idx} variant="effect">
                          {effect}
                        </Badge>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Cognitive Effects Card */}
        {hasCognitive && (
          <div className="mb-4 break-inside-avoid rounded-xl border border-white/10 bg-white/5 p-4 last:mb-0">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Brain className="h-4 w-4 text-fuchsia-200" />
              Cognitive
            </h3>
            <div className="flex flex-wrap gap-2">
              {subjective_effects.cognitive.map((effect, idx) => (
                <Badge key={idx} variant="effect">
                  {effect}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Physical Effects Card */}
        {hasPhysical && (
          <div className="mb-4 break-inside-avoid rounded-xl border border-white/10 bg-white/5 p-4 last:mb-0">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Hand className="h-4 w-4 text-fuchsia-200" />
              Physical
            </h3>
            <div className="flex flex-wrap gap-2">
              {subjective_effects.physical.map((effect, idx) => (
                <Badge key={idx} variant="effect">
                  {effect}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
});
