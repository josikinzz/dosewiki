import { useMemo, memo } from "react";
import { Icon, type IconName } from "../common/Icon";
import { IconBadge } from "../common/IconBadge";
import { PageHeader } from "../layout/PageHeader";
import { SectionCard } from "../common/SectionCard";
import { Button } from "@/components/ui/button";
import {
  getEffectCategoryDefinition,
  CATEGORY_SLUG_TO_TAGS,
} from "@/data/effectCategoryDefinitions";

/**
 * Minimal effect type for category display.
 */
interface EffectSummary {
  slug: string;
  name: string;
  tags: string[];
  summary?: string;
}

interface EffectCategoryPageProps {
  categorySlug: string;
  effects: EffectSummary[];
  onSelectEffect: (slug: string) => void;
  onNavigateBack: () => void;
}

/**
 * Category configuration for display.
 * Fallback for slugs not in the canonical definitions.
 */
interface CategoryInfo {
  title: string;
  description: string;
  icon: IconName;
  tags: string[];
}

const CATEGORY_INFO_FALLBACK: Record<string, CategoryInfo> = {
  "visual": {
    title: "Visual Effects",
    description: "Effects that alter visual perception, including amplifications, suppressions, distortions, and hallucinations.",
    icon: "lucide:eye",
    tags: ["visual"],
  },
  "auditory": {
    title: "Auditory Effects",
    description: "Effects that alter auditory perception, including sound distortions and hallucinations.",
    icon: "lucide:ear",
    tags: ["auditory"],
  },
  "cognitive": {
    title: "Cognitive Effects",
    description: "Effects that alter thought processes, memory, attention, and mental states.",
    icon: "fluent:thinking-24-regular",
    tags: ["cognitive"],
  },
  "physical": {
    title: "Physical Effects",
    description: "Effects that alter bodily sensations and physical processes.",
    icon: "lucide:activity",
    tags: ["physical"],
  },
  "tactile": {
    title: "Tactile Effects",
    description: "Effects that alter the sense of touch and bodily sensations.",
    icon: "lucide:hand",
    tags: ["tactile"],
  },
  "sensory": {
    title: "Sensory Effects",
    description: "Effects that alter any of the five senses.",
    icon: "lucide:sparkles",
    tags: ["sensory"],
  },
  "geometric": {
    title: "Geometric Patterns",
    description: "Visual patterns and form constants that appear during psychedelic experiences.",
    icon: "lucide:shapes",
    tags: ["geometric"],
  },
  "hallucinatory-state": {
    title: "Hallucinatory States",
    description: "Immersive visual experiences including transformations and autonomous entities.",
    icon: "custom:elf",
    tags: ["hallucinatory state"],
  },
  "amplification": {
    title: "Amplifications",
    description: "Effects that enhance or intensify normal perceptions and processes.",
    icon: "lucide:arrow-up",
    tags: ["amplification"],
  },
  "suppression": {
    title: "Suppressions",
    description: "Effects that reduce or diminish normal perceptions and processes.",
    icon: "lucide:arrow-down",
    tags: ["suppression"],
  },
  "distortion": {
    title: "Distortions",
    description: "Effects that warp or alter normal perceptions in unusual ways.",
    icon: "lucide:move",
    tags: ["distortion"],
  },
  "novel-state": {
    title: "Novel States",
    description: "Unique cognitive states that don't occur during normal consciousness.",
    icon: "lucide:lightbulb",
    tags: ["novel state"],
  },
  "psychological-state": {
    title: "Psychological States",
    description: "Effects that alter emotional and psychological experiences.",
    icon: "lucide:heart",
    tags: ["psychological state"],
  },
  "transpersonal-state": {
    title: "Transpersonal States",
    description: "Experiences that transcend ordinary personal identity boundaries.",
    icon: "lucide:infinity",
    tags: ["transpersonal state"],
  },
  "uncomfortable": {
    title: "Uncomfortable Effects",
    description: "Physical effects that may be unpleasant or distressing.",
    icon: "lucide:frown",
    tags: ["uncomfortable"],
  },
  "multisensory": {
    title: "Multisensory Effects",
    description: "Effects that involve multiple senses simultaneously.",
    icon: "lucide:cog",
    tags: ["multisensory"],
  },
  "smell-and-taste": {
    title: "Smell & Taste Effects",
    description: "Effects that alter olfactory and gustatory perception.",
    icon: "lucide:utensils",
    tags: ["smell and taste"],
  },
};

/**
 * Effect category page.
 * 
 * Displays all effects within a specific category.
 */
export const EffectCategoryPage = memo(function EffectCategoryPage({
  categorySlug,
  effects,
  onSelectEffect,
  onNavigateBack,
}: EffectCategoryPageProps) {
  // Get category info - prefer canonical definitions, then fallback, then generate
  const canonicalDef = getEffectCategoryDefinition(categorySlug);
  const canonicalTags = CATEGORY_SLUG_TO_TAGS[categorySlug];
  
  const categoryInfo: CategoryInfo = canonicalDef
    ? {
        title: canonicalDef.name,
        description: canonicalDef.description,
        icon: canonicalDef.icon,
        tags: canonicalTags || [categorySlug.replace(/-/g, " ")],
      }
    : CATEGORY_INFO_FALLBACK[categorySlug] || {
        title: categorySlug
          .split("-")
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" "),
        description: `Effects tagged with "${categorySlug}".`,
        icon: "lucide:tag" as IconName,
        tags: [categorySlug.replace(/-/g, " ")],
      };

  // Filter effects by category tags
  const filteredEffects = useMemo(() => {
    return effects
      .filter(effect =>
        categoryInfo.tags.some(tag =>
          effect.tags.some(t => t.toLowerCase() === tag.toLowerCase())
        )
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [effects, categoryInfo.tags]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0b0818] via-[#130e2b] to-[#0f0a1f]">
      <div className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12">
        {/* Back button */}
        <Button
          variant="ghostPill"
          size="pill"
          onClick={onNavigateBack}
          className="mb-6"
        >
          <Icon icon="lucide:arrow-left" size={16} />
          Back to Effects Index
        </Button>

        <PageHeader
          title={categoryInfo.title}
          icon={categoryInfo.icon}
          description={categoryInfo.description}
        />

        <SectionCard delay={0.05} className="bg-gradient-to-br from-fuchsia-950/30 to-transparent">
          <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
            <IconBadge icon={categoryInfo.icon} label={categoryInfo.title} />
            {categoryInfo.title}
            <span className="text-sm font-normal text-white/50">
              ({filteredEffects.length})
            </span>
          </h2>

          {filteredEffects.length > 0 ? (
            <div className="flex flex-wrap gap-2.5">
              {filteredEffects.map((effect) => (
                <Button
                  key={effect.slug}
                  variant="chip"
                  size="chip"
                  onClick={() => onSelectEffect(effect.slug)}
                >
                  {effect.name}
                </Button>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Icon icon="lucide:search-x" size={48} className="mx-auto mb-4 text-white/30" />
              <h3 className="text-lg font-semibold text-white/70 mb-2">No effects found</h3>
              <p className="text-sm text-white/50">
                No effects match this category.
              </p>
            </div>
          )}
        </SectionCard>
      </div>
    </main>
  );
});
