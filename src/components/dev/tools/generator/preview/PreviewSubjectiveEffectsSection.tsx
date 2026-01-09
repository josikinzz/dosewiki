import { memo } from "react";
import { Brain, Eye, Ear, Hand, Sparkles, GitCompareArrows } from "lucide-react";
import { SectionCard } from "../../../../common/SectionCard";
import { IconBadge } from "../../../../common/IconBadge";
import { Badge } from "@/components/ui/badge";
import type { SubstanceArticle } from "../../../../../schema";

interface PreviewSubjectiveEffectsSectionProps {
  article: SubstanceArticle;
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

  const { comparisons } = article;

  const hasSensory = SENSORY_CATEGORIES.some(
    ({ key }) => subjective_effects.sensory[key as keyof typeof subjective_effects.sensory].length > 0
  );
  const hasCognitive = subjective_effects.cognitive.length > 0;
  const hasPhysical = subjective_effects.physical.length > 0;
  const hasComparisons = comparisons && comparisons.length > 0;
  const hasOverviewNote = subjective_effects.notes?.overview?.trim().length > 0;
  const hasSensoryNote = subjective_effects.notes?.sensory?.trim().length > 0;
  const hasCognitiveNote = subjective_effects.notes?.cognitive?.trim().length > 0;
  const hasPhysicalNote = subjective_effects.notes?.physical?.trim().length > 0;

  if (!hasSensory && !hasCognitive && !hasPhysical && !hasComparisons && !hasOverviewNote) {
    return null;
  }

  return (
    <SectionCard delay={0}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon={Sparkles} label="Subjective Effects" />
        Subjective Effects
      </h2>
      {/* Overview note as intro paragraph, or fallback to generic text */}
      <p className="mb-4 text-sm text-white/70 leading-relaxed">
        {hasOverviewNote
          ? subjective_effects.notes.overview
          : "Effects vary widely by individual, dose, and context."}
      </p>

      {/* 3-column grid layout */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 items-start">
        {/* Sensory Effects Card */}
        {hasSensory && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Eye className="h-4 w-4 text-fuchsia-200" />
              Sensory
            </h3>
            {hasSensoryNote && (
              <>
                <p className="mb-3 text-sm text-white/60 italic leading-relaxed">
                  {subjective_effects.notes.sensory}
                </p>
                <hr className="mb-3 border-white/10" />
              </>
            )}
            <div className="space-y-4">
              {SENSORY_CATEGORIES.map(({ key, label, icon: Icon }, idx) => {
                const effects = subjective_effects.sensory[key as keyof typeof subjective_effects.sensory];
                if (effects.length === 0) return null;

                // Track if this is the first visible category
                const isFirstVisible = SENSORY_CATEGORIES.slice(0, idx).every(
                  (cat) => subjective_effects.sensory[cat.key as keyof typeof subjective_effects.sensory].length === 0
                );

                return (
                  <div key={key} className={!isFirstVisible ? "border-t border-white/10 pt-4" : ""}>
                    <span className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-white/70">
                      {Icon && <Icon className="h-4 w-4 text-fuchsia-200/80" />}
                      {label}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {effects.map((effect, effectIdx) => (
                        <Badge key={effectIdx} variant="effect">
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
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Brain className="h-4 w-4 text-fuchsia-200" />
              Cognitive
            </h3>
            {hasCognitiveNote && (
              <>
                <p className="mb-3 text-sm text-white/60 italic leading-relaxed">
                  {subjective_effects.notes.cognitive}
                </p>
                <hr className="mb-3 border-white/10" />
              </>
            )}
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
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Hand className="h-4 w-4 text-fuchsia-200" />
              Physical
            </h3>
            {hasPhysicalNote && (
              <>
                <p className="mb-3 text-sm text-white/60 italic leading-relaxed">
                  {subjective_effects.notes.physical}
                </p>
                <hr className="mb-3 border-white/10" />
              </>
            )}
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

      {/* Comparisons Card - full width below grid */}
      {hasComparisons && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <GitCompareArrows className="h-4 w-4 text-fuchsia-200" />
            Comparisons
          </h3>
          <ul className="space-y-2">
            {comparisons.map((item, idx) => (
              <li key={idx} className="text-sm">
                <span className="font-medium text-fuchsia-300">{item.drug}</span>
                <span className="text-white/50"> — </span>
                <span className="text-white/70">{item.comparison}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
});
