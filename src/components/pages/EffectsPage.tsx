import { memo } from "react";
import { Sparkles } from "lucide-react";
import type { EffectSummary } from "../../data/library";
import { PageHeader } from "../sections/PageHeader";
import { SectionCard } from "../common/SectionCard";

interface EffectsPageProps {
  effects: EffectSummary[];
  onSelectEffect: (effectSlug: string) => void;
}

export const EffectsPage = memo(function EffectsPage({ effects, onSelectEffect }: EffectsPageProps) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-20 pt-10">
      <PageHeader
        title="Subjective Effects"
        description="Browse the catalog of subjective effects reported across substances. Select an effect to explore compounds associated with it."
      />
      <SectionCard delay={0.05}>
        <div className="flex items-center gap-3">
          <Sparkles className="h-6 w-6 text-fuchsia-200" aria-hidden="true" focusable="false" />
          <h2 className="text-lg font-semibold text-fuchsia-300">All Effects</h2>
        </div>
        <div className="mt-4 flex flex-wrap gap-2.5">
          {effects.map((effect) => (
            <button
              key={effect.slug}
              type="button"
              onClick={() => onSelectEffect(effect.slug)}
              className="rounded-full bg-white/10 px-3.5 py-1.5 text-xs text-white/85 ring-1 ring-white/10 transition hover:bg-white/12 hover:text-fuchsia-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
            >
              {effect.name}
              <span className="ml-2 text-white/50">({effect.total})</span>
            </button>
          ))}
          {effects.length === 0 && (
            <p className="text-sm text-white/70">No subjective effects recorded in the dataset.</p>
          )}
        </div>
      </SectionCard>
    </div>
  );
});

