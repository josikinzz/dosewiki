/**
 * Single source of truth for subjective-effects subcategory presentation:
 * canonical keys, display labels, icons, and alias resolution. Consumed by
 * the public article renderer (subjectiveEffectsShared.tsx) and the /dev
 * editor; the generation prompt's "Effect Vocabulary" section
 * (src/data/config/sectionPrompts/subjectiveEffects.md) mirrors the
 * canonical keys and should be updated alongside this file.
 *
 * Deliberately separate from src/data/effectCategoryDefinitions.ts, which
 * describes the /effects/category/* taxonomy pages, not article subcategory
 * groupings.
 */

import type { IconName } from "../components/common/Icon";

export interface SubcategoryMeta {
  label: string;
  icon?: IconName;
}

export const SENSORY_CATEGORIES = [
  { key: "visual", label: "Visual", icon: "lucide:eye" as IconName },
  { key: "auditory", label: "Auditory", icon: "lucide:ear" as IconName },
  { key: "tactile", label: "Tactile", icon: "lucide:hand" as IconName },
  { key: "olfactory", label: "Olfactory", icon: null },
  { key: "gustatory", label: "Gustatory", icon: null },
  { key: "multisensory", label: "Multisensory", icon: null },
] as const;

// Shared meta objects so alias keys can never drift from their canonical entry.
const SUPPRESSIONS: SubcategoryMeta = { label: "Suppressions", icon: "lucide:arrow-down" };
const DISTORTIONS: SubcategoryMeta = { label: "Distortions", icon: "icon-park-outline:distortion" };
const HALLUCINATORY: SubcategoryMeta = { label: "Hallucinatory States", icon: "custom:elf" };
const STIMULATION: SubcategoryMeta = { label: "Stimulation", icon: "lucide:zap" };
const SEDATION: SubcategoryMeta = { label: "Sedation", icon: "lucide:moon" };
const IMPAIRMENT: SubcategoryMeta = { label: "Impairment", icon: "lucide:cloud-fog" };
const COORDINATION: SubcategoryMeta = { label: "Coordination", icon: "lucide:footprints" };
const DISSOCIATIVE: SubcategoryMeta = { label: "Dissociative", icon: "lucide:link-2-off" };
const COMFORTABLE: SubcategoryMeta = { label: "Comfortable", icon: "lucide:armchair" };

/**
 * Keyed by normalized form (see normalizeSubcategoryKey) so the same entry
 * matches whatever casing/spacing the data or a generation model emits.
 * Canonical keys come first in each block; alias keys map to the same meta.
 */
const SUBCATEGORY_REGISTRY: Record<string, SubcategoryMeta> = {
  // Sensory
  enhancements: { label: "Enhancements", icon: "lucide:arrow-up" },
  suppressions: SUPPRESSIONS,
  suppression: SUPPRESSIONS,
  distortions: DISTORTIONS,
  distortion: DISTORTIONS,
  geometry: { label: "Geometry", icon: "lucide:shapes" },
  hallucinatory: HALLUCINATORY,
  hallucinatorystates: HALLUCINATORY,
  hallucinations: HALLUCINATORY,
  // Cognitive
  emotional: { label: "Emotional", icon: "lucide:heart" },
  social: { label: "Social", icon: "lucide:users" },
  transpersonal: { label: "Transpersonal", icon: "lucide:sparkles" },
  perception: { label: "Perception", icon: "lucide:scan-eye" },
  analytical: { label: "Analytical", icon: "lucide:brain-circuit" },
  impairment: IMPAIRMENT,
  impairing: IMPAIRMENT,
  disconnective: { label: "Disconnective", icon: "lucide:unplug" },
  dissociative: DISSOCIATIVE,
  dissociating: DISSOCIATIVE,
  // Physical
  stimulation: STIMULATION,
  stimulating: STIMULATION,
  sedation: SEDATION,
  sedating: SEDATION,
  cardiovascular: { label: "Cardiovascular", icon: "lucide:heart-pulse" },
  autonomic: { label: "Autonomic", icon: "lucide:droplets" },
  uncomfortable: { label: "Uncomfortable", icon: "lucide:frown" },
  bodily: { label: "Bodily", icon: "lucide:person-standing" },
  comfortable: COMFORTABLE,
  comfort: COMFORTABLE,
  coordination: COORDINATION,
  motor: COORDINATION,
  euphoria: { label: "Euphoria", icon: "lucide:smile" },
  relaxation: { label: "Relaxation", icon: "lucide:leaf" },
  sleep: { label: "Sleep", icon: "lucide:bed" },
  respiratory: { label: "Respiratory", icon: "lucide:wind" },
  temperature: { label: "Temperature", icon: "lucide:thermometer" },
  // Progressive stages (legacy numeric-prefixed keys)
  "1takingoff": { label: "1. Taking Off", icon: "lucide:trending-up" },
  "2thewaitingroom": { label: "2. The Waiting Room", icon: "lucide:hourglass" },
  "3theotherside": { label: "3. The Other Side", icon: "lucide:house" },
  "4comingdown": { label: "4. Coming Down", icon: "lucide:trending-down" },
};

/** Keys that are grouping artifacts, not real subcategories: always render flat. */
const FLAT_SUBCATEGORY_KEYS = new Set(["general", "other"]);

export function normalizeSubcategoryKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function isFlatSubcategoryKey(key: string): boolean {
  return FLAT_SUBCATEGORY_KEYS.has(normalizeSubcategoryKey(key));
}

function titleCaseSubcategoryKey(key: string): string {
  const cleaned = key.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return key;
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Resolve a raw subcategory key to its display label and (optional) icon.
 * Unknown keys — genuinely novel terms the taxonomy has no entry for — still
 * get a presentable Title Case label instead of a raw lowercase token.
 */
export function resolveSubcategory(key: string): SubcategoryMeta {
  return (
    SUBCATEGORY_REGISTRY[normalizeSubcategoryKey(key)] ?? {
      label: titleCaseSubcategoryKey(key),
    }
  );
}
