import { memo, useMemo } from "react";
import type { IconName } from "../common/Icon";
import { IndexCard, IndexCardSection, IndexCardList, IndexCardListItem } from "../common/IndexCard";

/** Icons for subcategory types - provides visual identity for each subcategory */
const SUBCATEGORY_ICONS: Record<string, IconName> = {
  // Visual subcategories
  "Amplifications": "lucide:arrow-up",
  "Suppressions": "lucide:arrow-down",
  "Distortions": "icon-park-outline:distortion",
  "Geometric Patterns": "lucide:shapes",
  "Hallucinatory States": "custom:elf",
  // Cognitive subcategories
  "Novel States": "lucide:lightbulb",
  "Psychological States": "lucide:heart",
  "Transpersonal States": "lucide:infinity",
  // Physical subcategories
  "Alterations": "lucide:cog",
  "Uncomfortable Bodily Effects": "lucide:frown",
  "Cardiovascular": "lucide:heart-pulse",
  "Neurological": "fluent:thinking-24-regular",
  // Sensory subcategories
  "Gustatory Effects": "lucide:cookie",
  "Olfactory Effects": "lucide:flower-2",
};

interface EffectLink {
  name: string;
  slug: string;
  tags: string[];
}

interface SubcategoryConfig {
  key?: string;
  title?: string;
  tags: string[];
}

interface ParentCategoryCardProps {
  title: string;
  icon: IconName;
  subcategories: SubcategoryConfig[];
  effects: EffectLink[];
  onSelectEffect: (slug: string) => void;
}

/**
 * Hierarchical category card containing subcategory sections.
 * 
 * Used for the "All" tab to display parent categories (Visual Effects,
 * Cognitive Effects, Physical Effects) with nested subcategory sections.
 */
export const ParentCategoryCard = memo(function ParentCategoryCard({
  title,
  icon,
  subcategories,
  effects,
  onSelectEffect,
}: ParentCategoryCardProps) {
  // Group effects by subcategory
  const subcategoryData = useMemo(() => {
    return subcategories.map(sub => {
      const matchingEffects = effects.filter(effect => {
        const effectTags = effect.tags.map(t => t.toLowerCase());
        return sub.tags.every(tag => effectTags.includes(tag.toLowerCase()));
      });
      
      return {
        ...sub,
        effects: matchingEffects.sort((a, b) => a.name.localeCompare(b.name)),
      };
    }).filter(sub => sub.effects.length > 0);
  }, [subcategories, effects]);

  // Calculate total effect count
  const totalEffects = useMemo(() => {
    const uniqueSlugs = new Set(subcategoryData.flatMap(sub => sub.effects.map(e => e.slug)));
    return uniqueSlugs.size;
  }, [subcategoryData]);

  if (subcategoryData.length === 0) {
    return null;
  }

  // Check if we have multiple titled subcategories (need visual separation)
  const titledSubcategories = subcategoryData.filter(sub => sub.title);
  const hasMultipleTitledSections = titledSubcategories.length > 1;

  return (
    <IndexCard title={title} icon={icon} count={totalEffects}>
      <div className={hasMultipleTitledSections ? "space-y-6" : ""}>
        {subcategoryData.map((sub, idx) => (
          <IndexCardSection
            key={sub.key || sub.title || idx}
            title={sub.title}
            icon={sub.title ? SUBCATEGORY_ICONS[sub.title] : undefined}
            count={sub.effects.length}
            showDivider={hasMultipleTitledSections && idx > 0}
          >
            <IndexCardList>
              {sub.effects.map((effect) => (
                <IndexCardListItem
                  key={effect.slug}
                  label={effect.name}
                  onClick={() => onSelectEffect(effect.slug)}
                />
              ))}
            </IndexCardList>
          </IndexCardSection>
        ))}
      </div>
    </IndexCard>
  );
});
