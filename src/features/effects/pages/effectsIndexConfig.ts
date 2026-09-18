import type { IconName } from "@/components/common/Icon";
import { EFFECT_CATEGORY_DEFINITIONS } from "@/data/effectCategoryDefinitions";
import { msg } from "@/i18n/messages";
import { icons } from "@/utils/iconNames";

export type TabId = "all" | "sensory" | "cognitive" | "physical" | "library" | "info";

export interface TabConfig {
  id: TabId;
  label: string;
  icon: IconName;
  filterTags: string[];
  blob?: string;
}

export interface SubcategoryConfig {
  key: string;
  title?: string;
  tags: string[];
}

export interface ParentCategoryConfig {
  key: string;
  routeSlug: string;
  title: string;
  displayTitle?: string;
  icon: IconName;
  columns: Record<string, number>;
  tab: TabId;
  subcategories: SubcategoryConfig[];
}

export interface FlatCategoryConfig {
  key: string;
  routeSlug: string;
  title: string;
  icon: IconName;
  tags: string[];
  tab: TabId;
}

export const TABS: TabConfig[] = [
  { id: "all", label: msg("All Effects"), icon: icons.subjectiveEffectIndex, filterTags: [] },
  {
    id: "sensory",
    label: msg("Sensory"),
    icon: "lucide:eye",
    filterTags: ["sensory", "visual", "auditory", "tactile", "smell and taste", "gustatory", "olfactory", "multisensory"],
    blob: "Sensory effects are subjective effects that directly alter a person's senses. These can include any combination of sight, sound, touch, taste, and smell.",
  },
  {
    id: "cognitive",
    label: msg("Cognitive"),
    icon: "fluent:thinking-24-regular",
    filterTags: ["cognitive"],
    blob: "Cognitive effects are subjective effects that directly alter or introduce new content to an element of a person's cognition.",
  },
  {
    id: "physical",
    label: msg("Physical"),
    icon: "lucide:activity",
    filterTags: ["physical", "uncomfortable"],
    blob: "Physical effects are subjective effects that directly affect part of a person's physical body.",
  },
  // The archive of long-form articles that the effect entries lean on: the
  // intensity scales, the substance guides, and the dream and meditation
  // pieces. Static curation lives in libraryConfig, so no filter tags.
  {
    id: "library",
    label: msg("Library"),
    icon: "lucide:book-open-text",
    filterTags: [],
    blob: "The long-form writing behind the index: the scales that grade how intense these effects are, the substance guides that walk an experience end to end, and the pieces on dreaming and meditation.",
  },
  // The index's thesis lives here rather than above the grid: the "All
  // Effects" view opens straight into the categories, and this tab carries
  // the full three-paragraph introduction for anyone who wants it.
  { id: "info", label: msg("More Info"), icon: "lucide:info", filterTags: [] },
];

export const PARENT_CATEGORIES: ParentCategoryConfig[] = [
  {
    key: "visual",
    routeSlug: "visual-effects",
    title: "Visual Effects",
    displayTitle: msg("Visual"),
    icon: "lucide:eye",
    columns: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 },
    tab: "sensory",
    subcategories: [
      { key: "visual-amp", title: msg("Amplifications"), tags: ["visual", "amplification"] },
      { key: "visual-supp", title: msg("Suppressions"), tags: ["visual", "suppression"] },
      { key: "visual-dist", title: msg("Distortions"), tags: ["visual", "distortion"] },
      { key: "visual-geo", title: msg("Geometric Patterns"), tags: ["visual", "geometric"] },
      { key: "visual-hall", title: msg("Hallucinatory States"), tags: ["visual", "hallucinatory state"] },
    ],
  },
  {
    key: "auditory",
    routeSlug: "auditory-effects",
    title: "Auditory Effects",
    displayTitle: msg("Auditory"),
    icon: "lucide:ear",
    columns: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 },
    tab: "sensory",
    subcategories: [{ key: "auditory-all", tags: ["auditory"] }],
  },
  {
    key: "tactile",
    routeSlug: "tactile-effects",
    title: "Tactile Effects",
    displayTitle: msg("Tactile"),
    icon: "lucide:hand",
    columns: { "1": 0, "2": 0, "3": 0, "4": 1, "5": 1, "6": 1 },
    tab: "sensory",
    subcategories: [{ key: "tactile-all", tags: ["tactile"] }],
  },
  {
    key: "smell-taste",
    routeSlug: "smell-and-taste-effects",
    title: "Smell & Taste Effects",
    displayTitle: msg("Smell & Taste"),
    icon: "lucide:utensils",
    columns: { "1": 0, "2": 0, "3": 0, "4": 1, "5": 1, "6": 1 },
    tab: "sensory",
    subcategories: [
      { key: "gustatory", title: msg("Gustatory Effects"), tags: ["gustatory"] },
      { key: "olfactory", title: msg("Olfactory Effects"), tags: ["olfactory"] },
    ],
  },
  {
    key: "multisensory",
    routeSlug: "multisensory-effects",
    title: "Multisensory Effects",
    displayTitle: msg("Multisensory"),
    icon: "lucide:cog",
    columns: { "1": 0, "2": 0, "3": 0, "4": 1, "5": 1, "6": 1 },
    tab: "sensory",
    subcategories: [{ key: "multisensory-all", tags: ["multisensory"] }],
  },
  {
    key: "cognitive",
    routeSlug: "cognitive-effects",
    title: "Cognitive Effects",
    displayTitle: msg("Cognitive"),
    icon: "fluent:thinking-24-regular",
    columns: { "1": 0, "2": 1, "3": 1, "4": 2, "5": 2, "6": 2 },
    tab: "cognitive",
    subcategories: [
      { key: "cog-amp", title: msg("Amplifications"), tags: ["cognitive", "amplification"] },
      { key: "cog-supp", title: msg("Suppressions"), tags: ["cognitive", "suppression"] },
      { key: "cog-novel", title: msg("Novel States"), tags: ["cognitive", "novel"] },
      { key: "cog-psych", title: msg("Psychological States"), tags: ["cognitive", "psychological state"] },
      { key: "cog-trans", title: msg("Transpersonal States"), tags: ["cognitive", "transpersonal state"] },
    ],
  },
  {
    key: "physical",
    routeSlug: "physical-effects",
    title: "Physical Effects",
    displayTitle: msg("Physical"),
    icon: "lucide:activity",
    columns: { "1": 0, "2": 1, "3": 2, "4": 3, "5": 3, "6": 3 },
    tab: "physical",
    subcategories: [
      { key: "phys-amp", title: msg("Amplifications"), tags: ["physical", "amplification"] },
      { key: "phys-supp", title: msg("Suppressions"), tags: ["physical", "suppression"] },
      { key: "phys-alt", title: msg("Alterations"), tags: ["physical", "alteration"] },
      { key: "phys-bodily", title: msg("Uncomfortable Bodily Effects"), tags: ["uncomfortable", "bodily"] },
      { key: "phys-cardio", title: msg("Cardiovascular"), tags: ["uncomfortable", "cardiovascular"] },
      { key: "phys-neuro", title: msg("Neurological"), tags: ["uncomfortable", "neurological"] },
    ],
  },
];

export const FLAT_CATEGORIES: FlatCategoryConfig[] = [
  { key: "visual-amplifications", routeSlug: "visual-amplifications", title: msg("Visual Amplifications"), icon: "lucide:arrow-up", tags: ["visual", "amplification"], tab: "sensory" },
  { key: "visual-suppressions", routeSlug: "visual-suppressions", title: msg("Visual Suppressions"), icon: "lucide:arrow-down", tags: ["visual", "suppression"], tab: "sensory" },
  { key: "visual-distortions", routeSlug: "visual-distortions", title: msg("Visual Distortions"), icon: "lucide:move", tags: ["visual", "distortion"], tab: "sensory" },
  { key: "geometric-patterns", routeSlug: "geometric-patterns", title: msg("Geometric Patterns"), icon: "lucide:shapes", tags: ["visual", "geometric"], tab: "sensory" },
  { key: "hallucinatory-states", routeSlug: "hallucinatory-states", title: msg("Hallucinatory States"), icon: "custom:elf", tags: ["visual", "hallucinatory state"], tab: "sensory" },
  { key: "auditory", routeSlug: "auditory-effects", title: msg("Auditory Effects"), icon: "lucide:ear", tags: ["auditory"], tab: "sensory" },
  { key: "tactile", routeSlug: "tactile-effects", title: msg("Tactile Effects"), icon: "lucide:hand", tags: ["tactile"], tab: "sensory" },
  { key: "gustatory", routeSlug: "smell-and-taste-effects", title: msg("Gustatory Effects"), icon: "lucide:cookie", tags: ["gustatory"], tab: "sensory" },
  { key: "olfactory", routeSlug: "smell-and-taste-effects", title: msg("Olfactory Effects"), icon: "lucide:flower-2", tags: ["olfactory"], tab: "sensory" },
  { key: "multisensory", routeSlug: "multisensory-effects", title: msg("Multisensory Effects"), icon: "lucide:cog", tags: ["multisensory"], tab: "sensory" },
  { key: "cognitive-amplifications", routeSlug: "cognitive-amplifications", title: msg("Amplifications"), icon: "lucide:arrow-up", tags: ["cognitive", "amplification"], tab: "cognitive" },
  { key: "cognitive-suppressions", routeSlug: "cognitive-suppressions", title: msg("Suppressions"), icon: "lucide:arrow-down", tags: ["cognitive", "suppression"], tab: "cognitive" },
  { key: "novel-states", routeSlug: "novel-cognitive-states", title: msg("Novel States"), icon: "lucide:lightbulb", tags: ["cognitive", "novel"], tab: "cognitive" },
  { key: "psychological-states", routeSlug: "psychological-states", title: msg("Psychological States"), icon: "lucide:heart", tags: ["cognitive", "psychological state"], tab: "cognitive" },
  { key: "transpersonal-states", routeSlug: "transpersonal-states", title: msg("Transpersonal States"), icon: "lucide:infinity", tags: ["cognitive", "transpersonal state"], tab: "cognitive" },
  { key: "physical-amplifications", routeSlug: "physical-amplifications", title: msg("Amplifications"), icon: "lucide:arrow-up", tags: ["physical", "amplification"], tab: "physical" },
  { key: "physical-suppressions", routeSlug: "physical-suppressions", title: msg("Suppressions"), icon: "lucide:arrow-down", tags: ["physical", "suppression"], tab: "physical" },
  { key: "physical-alterations", routeSlug: "physical-alterations", title: msg("Alterations"), icon: "lucide:refresh-cw", tags: ["physical", "alteration"], tab: "physical" },
  { key: "uncomfortable-bodily", routeSlug: "uncomfortable-bodily-effects", title: msg("Uncomfortable Bodily Effects"), icon: "lucide:frown", tags: ["uncomfortable", "bodily"], tab: "physical" },
  { key: "cardiovascular", routeSlug: "cardiovascular-effects", title: msg("Cardiovascular Effects"), icon: "lucide:heart-pulse", tags: ["uncomfortable", "cardiovascular"], tab: "physical" },
  { key: "neurological", routeSlug: "neurological-effects", title: msg("Neurological Effects"), icon: "fluent:thinking-24-regular", tags: ["uncomfortable", "neurological"], tab: "physical" },
];

function normalizeCategoryLabel(label: string): string {
  return label.trim().toLowerCase().replace(/&/g, "and").replace(/[-\s]+/g, " ");
}

const CATEGORY_ICONS_BY_LABEL = new Map<string, IconName | null>();

// Flat titles can be shared; only retain aliases that agree on the icon.
for (const category of FLAT_CATEGORIES) {
  for (const label of [category.key, category.routeSlug, category.title]) {
    const key = normalizeCategoryLabel(label);
    const existing = CATEGORY_ICONS_BY_LABEL.get(key);
    CATEGORY_ICONS_BY_LABEL.set(
      key,
      existing === undefined || existing === category.icon ? category.icon : null,
    );
  }
}

// A broad category owns its route, even when several flat panels link to it.
for (const category of PARENT_CATEGORIES) {
  for (const label of [
    category.key,
    category.routeSlug,
    category.title,
    category.displayTitle,
  ]) {
    if (label) CATEGORY_ICONS_BY_LABEL.set(normalizeCategoryLabel(label), category.icon);
  }
}

for (const category of EFFECT_CATEGORY_DEFINITIONS) {
  const icon = CATEGORY_ICONS_BY_LABEL.get(normalizeCategoryLabel(category.slug)) ?? category.icon;
  for (const label of [category.slug, category.name]) {
    const key = normalizeCategoryLabel(label);
    if (!CATEGORY_ICONS_BY_LABEL.has(key)) CATEGORY_ICONS_BY_LABEL.set(key, icon);
  }
}

for (const tab of TABS) {
  if (tab.id !== "sensory" && tab.id !== "cognitive" && tab.id !== "physical") continue;
  for (const label of [tab.id, tab.label]) {
    const key = normalizeCategoryLabel(label);
    if (!CATEGORY_ICONS_BY_LABEL.has(key)) CATEGORY_ICONS_BY_LABEL.set(key, tab.icon);
  }
}

/** Match canonical category keys, slugs, titles, and unambiguous display labels. */
export function resolveEffectCategoryIcon(label: string): IconName | undefined {
  return CATEGORY_ICONS_BY_LABEL.get(normalizeCategoryLabel(label)) ?? undefined;
}
