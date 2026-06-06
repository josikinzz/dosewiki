import Link from "next/link";
import { memo } from "react";
import { Icon } from "@/components/common/Icon";
import { PublicNameChip } from "@/components/common/PublicTokens";
import type { EffectSummary } from "@/data/builders/library";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { publicHref } from "@/utils/publicHref";

interface EffectsPageProps {
  effects: EffectSummary[];
}

export const EffectsPage = memo(function EffectsPage({ effects }: EffectsPageProps) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12">
      <PageHeader
        title="Subjective Effects"
        icon="lucide:sparkles"
        description="Browse the catalog of subjective effects reported across substances. Select an effect to explore compounds associated with it."
      />
      <SectionCard delay={0.05}>
        <div className="flex items-center gap-3">
          <Icon icon="lucide:sparkles" size={24} className="text-fuchsia-200" />
          <h2 className="text-lg font-semibold text-fuchsia-300">All Effects</h2>
        </div>
        <div className="mt-4 flex flex-wrap gap-2.5">
          {effects.map((effect) => (
            <PublicNameChip
              key={effect.slug}
              as={Link}
              href={publicHref.effect(effect.slug)}
              interactive
            >
              {effect.name}
              <span className="ml-1 text-white/50">({effect.total})</span>
            </PublicNameChip>
          ))}
          {effects.length === 0 && (
            <p className="text-sm text-white/70">No subjective effects recorded in the dataset.</p>
          )}
        </div>
      </SectionCard>
    </div>
  );
});

