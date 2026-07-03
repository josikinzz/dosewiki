/**
 * Effect category definitions extracted from EffectIndex.
 * 
 * These provide descriptions for effect category pages at /effects/category/{slug}.
 */

import type { IconName } from "../components/common/Icon";

export interface EffectCategoryDefinition {
  slug: string;
  name: string;
  description: string;
  icon: IconName;
}

/**
 * All 24 effect category definitions from EffectIndex.
 */
export const EFFECT_CATEGORY_DEFINITIONS: EffectCategoryDefinition[] = [
  // Visual Categories
  {
    slug: "visual-effects",
    name: "Visual Effects",
    description: "Visual effects are defined as any subjective effect that directly alters a person's sense of sight.",
    icon: "lucide:eye",
  },
  {
    slug: "visual-amplifications",
    name: "Visual Amplifications",
    description: "Visual amplifications are defined as any subjective effect that increases, enhances, accelerates, or intensifies a facet of a person's sense of sight.",
    icon: "lucide:arrow-up",
  },
  {
    slug: "visual-suppressions",
    name: "Visual Suppressions",
    description: "Visual suppressions are defined as any subjective effect that decreases a person's ability to perceive the external environment through their sense of sight.",
    icon: "lucide:arrow-down",
  },
  {
    slug: "visual-distortions",
    name: "Visual Distortions",
    description: "Visual distortions are defined as any subjective effect that alters the perception or appearance of pre-existing visual data without adding any entirely new content.",
    icon: "lucide:move",
  },
  {
    slug: "geometric-patterns",
    name: "Geometric Patterns",
    description: "Geometric patterns are defined as any subjective effect that introduces complex arrays of shapes, colours, symbols, patterns, geometry, form constants, and fractals to one's field of vision.",
    icon: "lucide:shapes",
  },
  {
    slug: "hallucinatory-states",
    name: "Hallucinatory Effects",
    description: "Hallucinatory states are defined as any subjective effect that changes the perception or appearance of pre-existing sensory data by adding entirely new content in a manner similar to that of dreams.",
    icon: "custom:elf",
  },
  
  // Sensory Categories
  {
    slug: "auditory-effects",
    name: "Auditory Effects",
    description: "Effects that directly alter a person's sense of hearing.",
    icon: "lucide:ear",
  },
  {
    slug: "smell-and-taste-effects",
    name: "Smell & Taste Effects",
    description: "Smell and taste effects are defined as any subjective effect that directly alters either a person's sense of smell or taste.",
    icon: "lucide:utensils",
  },
  {
    slug: "tactile-effects",
    name: "Tactile Effects",
    description: "Tactile effects are defined as any subjective effect that directly alters a person's sense of touch.",
    icon: "lucide:hand",
  },
  {
    slug: "multisensory-effects",
    name: "Multisensory Effects",
    description: "Multisensory effects are defined as any subjective effect that directly alters two or more senses at a time.",
    icon: "lucide:cog",
  },
  {
    slug: "disconnective-effects",
    name: "Disconnective Effects",
    description: "Disconnective effects are defined as any subjective effect that feels as if it disconnects one from the external environment, their senses, and/or their consciousness.",
    icon: "lucide:unplug",
  },
  
  // Cognitive Categories
  {
    slug: "cognitive-effects",
    name: "Cognitive Effects",
    description: "Cognitive effects are subjective effects that directly alter or introduce new content to an element of a person's cognition.",
    icon: "fluent:thinking-24-regular",
  },
  {
    slug: "cognitive-amplifications",
    name: "Cognitive Amplifications",
    description: "Cognitive amplifications are defined as any subjective effect that increases, enhances, accelerates, or intensifies a facet of a person's cognition.",
    icon: "lucide:arrow-up",
  },
  {
    slug: "cognitive-suppressions",
    name: "Cognitive Suppressions",
    description: "Cognitive suppressions are defined as any subjective effect that decreases the intensity of a facet of a person's cognition.",
    icon: "lucide:arrow-down",
  },
  {
    slug: "novel-cognitive-states",
    name: "Novel Cognitive States",
    description: "Novel cognitive states are defined as any cognitive effect that does not merely amplify or suppress familiar states of mind; rather, it induces an experience that is qualitatively different from that of ordinary consciousness.",
    icon: "lucide:lightbulb",
  },
  {
    slug: "psychological-states",
    name: "Psychological States",
    description: "Psychological states are defined as any cognitive effect that is either established within the psychological literature or arises as a result of the complex interplay between more simplistic components such as cognitive enhancements and suppressions.",
    icon: "lucide:heart",
  },
  {
    slug: "transpersonal-states",
    name: "Transpersonal States",
    description: "Transpersonal states are defined as any subjective effect that feels as if it alters a person's cognition in a manner that relates to their place in the universe, the inner workings of reality or consciousness, and/or the context of their existence. The highest manifestations of these effects fall under what are commonly known as 'peak', 'transcendent' or 'transformative' experiences.",
    icon: "lucide:infinity",
  },
  
  // Physical Categories
  {
    slug: "physical-effects",
    name: "Physical Effects",
    description: "Physical effects are subjective effects that directly alter a person's perception of their physical body or its physiological functions.",
    icon: "lucide:activity",
  },
  {
    slug: "physical-amplifications",
    name: "Physical Amplifications",
    description: "Physical amplifications are defined as any subjective effect that increases, enhances, accelerates, or intensifies a facet of a person's physical body.",
    icon: "lucide:arrow-up",
  },
  {
    slug: "physical-suppressions",
    name: "Physical Suppressions",
    description: "Physical suppressions are defined as any subjective effect that decreases or reduces a facet of a person's physical body.",
    icon: "lucide:arrow-down",
  },
  {
    slug: "physical-alterations",
    name: "Physical Alterations",
    description: "Physical alterations are defined as any subjective effect that changes a facet of a person's physical body in a manner which is not uncomfortable and does not involve a clearly definable enhancement or suppression.",
    icon: "lucide:cog",
  },
  {
    slug: "uncomfortable-physical-effects",
    name: "Uncomfortable Physical Effects",
    description: "Uncomfortable physical effects are defined as any substance-induced alteration of a person's physical state that is unpleasant, undesirable, painful, or otherwise a source of distress.",
    icon: "lucide:frown",
  },
  {
    slug: "cardiovascular-effects",
    name: "Cardiovascular Effects",
    description: "Cardiovascular effects are defined as any uncomfortable physical effect that relates to the heart and blood vessels.",
    icon: "lucide:heart-pulse",
  },
  {
    slug: "neurological-effects",
    name: "Neurological Effects",
    description: "Neurological effects are defined as any uncomfortable physical effect that relates to the brain and its blood vessels.",
    icon: "lucide:brain",
  },
  {
    slug: "uncomfortable-bodily-effects",
    name: "Uncomfortable Bodily Effects",
    description: "Uncomfortable bodily effects are defined as any uncomfortable physical effect that relates to the overall body and cannot be categorized as cardiovascular or cerebrovascular.",
    icon: "lucide:person-standing",
  },
];

/**
 * Get an effect category definition by slug.
 */
export function getEffectCategoryDefinition(slug: string): EffectCategoryDefinition | undefined {
  return EFFECT_CATEGORY_DEFINITIONS.find(def => def.slug === slug);
}

/**
 * Slug-to-tag-group mapping for filtering effects.
 *
 * Each inner group is matched with AND semantics; groups are matched with OR
 * semantics. This keeps broad category pages such as smell-and-taste useful
 * while preserving specific pages such as visual-amplifications.
 */
export const CATEGORY_SLUG_TO_TAG_GROUPS: Record<string, string[][]> = {
  "visual-effects": [["visual"]],
  "visual-amplifications": [["visual", "amplification"]],
  "visual-suppressions": [["visual", "suppression"]],
  "visual-distortions": [["visual", "distortion"]],
  "geometric-patterns": [["visual", "geometric"]],
  "hallucinatory-states": [["visual", "hallucinatory state"]],
  "auditory-effects": [["auditory"]],
  "smell-and-taste-effects": [["gustatory"], ["olfactory"], ["smell and taste"]],
  "tactile-effects": [["tactile"]],
  "multisensory-effects": [["multisensory"]],
  "disconnective-effects": [["disconnective"]],
  "cognitive-effects": [["cognitive"]],
  "cognitive-amplifications": [["cognitive", "amplification"]],
  "cognitive-suppressions": [["cognitive", "suppression"]],
  "novel-cognitive-states": [["cognitive", "novel"]],
  "psychological-states": [["cognitive", "psychological state"]],
  "transpersonal-states": [["cognitive", "transpersonal state"]],
  "physical-effects": [["physical"]],
  "physical-amplifications": [["physical", "amplification"]],
  "physical-suppressions": [["physical", "suppression"]],
  "physical-alterations": [["physical", "alteration"]],
  "uncomfortable-physical-effects": [["physical", "uncomfortable"]],
  "cardiovascular-effects": [["uncomfortable", "cardiovascular"]],
  "neurological-effects": [["uncomfortable", "neurological"]],
  "uncomfortable-bodily-effects": [["uncomfortable", "bodily"]],
};

export const CATEGORY_SLUG_TO_TAGS: Record<string, string[]> = Object.fromEntries(
  Object.entries(CATEGORY_SLUG_TO_TAG_GROUPS).map(([slug, groups]) => [
    slug,
    Array.from(new Set(groups.flat())),
  ]),
);

export function effectMatchesCategorySlug(
  effect: { tags: string[] },
  categorySlug: string,
): boolean {
  const tagGroups = CATEGORY_SLUG_TO_TAG_GROUPS[categorySlug];

  if (!tagGroups) {
    return false;
  }

  const effectTags = new Set(effect.tags.map((tag) => tag.toLowerCase()));

  return tagGroups.some((group) =>
    group.every((tag) => effectTags.has(tag.toLowerCase())),
  );
}
