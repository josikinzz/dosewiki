import { memo } from "react";
import { Sparkles } from "lucide-react";
import type { EffectSummary } from "../../data/library";
import { PageHeader } from "../sections/PageHeader";
import { SectionCard } from "../common/SectionCard";
import { Button } from "@/components/ui/button";

interface EffectsPageProps {
  effects: EffectSummary[];
  onSelectEffect: (effectSlug: string) => void;
}

export const EffectsPage = memo(function EffectsPage({ effects, onSelectEffect }: EffectsPageProps) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12">
      <PageHeader
        title="Subjective Effects"
        icon={Sparkles}
        description="Browse the catalog of subjective effects reported across substances. Select an effect to explore compounds associated with it."
      />
      <SectionCard delay={0.05}>
        <div className="flex items-center gap-3">
          <Sparkles className="h-6 w-6 text-fuchsia-200" aria-hidden="true" focusable="false" />
          <h2 className="text-lg font-semibold text-fuchsia-300">All Effects</h2>
        </div>
        <div className="mt-4 flex flex-wrap gap-2.5">
          {effects.map((effect) => (
            <Button
              key={effect.slug}
              variant="chip"
              size="chip"
              onClick={() => onSelectEffect(effect.slug)}
            >
              {effect.name}
              <span className="ml-2 text-white/50">({effect.total})</span>
            </Button>
          ))}
          {effects.length === 0 && (
            <p className="text-sm text-white/70">No subjective effects recorded in the dataset.</p>
          )}
        </div>
      </SectionCard>
    </div>
  );
});

