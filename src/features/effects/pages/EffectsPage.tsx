import Link from "next/link";
import { memo } from "react";
import { Icon } from "@/components/common/Icon";
import { PublicNameChip } from "@/components/common/PublicTokens";
import type { EffectSummary } from "@/data/builders/library";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { publicHref } from "@/utils/publicHref";
import { icons } from "@/utils/iconNames";

interface EffectsPageProps {
  effects: EffectSummary[];
}

export const EffectsPage = memo(function EffectsPage({ effects }: EffectsPageProps) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12">
      <PageHeader
        title="Subjective Effects"
        icon={icons.subjectiveEffectIndex}
        description="Browse the catalog of subjective effects reported across substances. Select an effect to explore compounds associated with it."
      />
      <SectionCard delay={0.05}>
        <div className="flex items-center gap-3">
          <Icon icon={icons.subjectiveEffectIndex} size={24} className="theme-accent-heading" />
          <h2 className="theme-accent-heading text-lg font-semibold">All Effects</h2>
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
              <span className="theme-text-faint ml-1">({effect.total})</span>
            </PublicNameChip>
          ))}
          {effects.length === 0 && (
            <p className="theme-text-muted text-sm">No subjective effects recorded in the dataset.</p>
          )}
        </div>
      </SectionCard>
    </div>
  );
});

