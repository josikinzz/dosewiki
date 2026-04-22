import type { IconName } from "@/components/common/Icon";

export type TabId = "all" | "sensory" | "cognitive" | "physical";

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
  title: string;
  icon: IconName;
  columns: Record<string, number>;
  tab: TabId;
  subcategories: SubcategoryConfig[];
}

export interface FlatCategoryConfig {
  key: string;
  title: string;
  icon: IconName;
  tags: string[];
  tab: TabId;
}

export const TABS: TabConfig[] = [
  { id: "all", label: "All Effects", icon: "lucide:sparkles", filterTags: [] },
  {
    id: "sensory",
    label: "Sensory",
    icon: "lucide:eye",
    filterTags: ["sensory", "visual", "auditory", "tactile", "smell and taste", "gustatory", "olfactory", "multisensory"],
    blob: "Sensory effects are subjective effects that directly alter a person's senses. These can include any combination of sight, sound, touch, taste, and smell.",
  },
  {
    id: "cognitive",
    label: "Cognitive",
    icon: "fluent:thinking-24-regular",
    filterTags: ["cognitive"],
    blob: "Cognitive effects are subjective effects that directly alter or introduce new content to an element of a person's cognition.",
  },
  {
    id: "physical",
    label: "Physical",
    icon: "lucide:activity",
    filterTags: ["physical", "uncomfortable"],
    blob: "Physical effects are subjective effects that directly affect part of a person's physical body.",
  },
];

export const PARENT_CATEGORIES: ParentCategoryConfig[] = [
  {
    key: "visual",
    title: "Visual Effects",
    icon: "lucide:eye",
    columns: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 },
    tab: "sensory",
    subcategories: [
      { key: "visual-amp", title: "Amplifications", tags: ["visual", "amplification"] },
      { key: "visual-supp", title: "Suppressions", tags: ["visual", "suppression"] },
      { key: "visual-dist", title: "Distortions", tags: ["visual", "distortion"] },
      { key: "visual-geo", title: "Geometric Patterns", tags: ["visual", "geometric"] },
      { key: "visual-hall", title: "Hallucinatory States", tags: ["visual", "hallucinatory state"] },
    ],
  },
  {
    key: "auditory",
    title: "Auditory Effects",
    icon: "lucide:ear",
    columns: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 },
    tab: "sensory",
    subcategories: [{ key: "auditory-all", tags: ["auditory"] }],
  },
  {
    key: "tactile",
    title: "Tactile Effects",
    icon: "lucide:hand",
    columns: { "1": 0, "2": 0, "3": 0, "4": 1, "5": 1, "6": 1 },
    tab: "sensory",
    subcategories: [{ key: "tactile-all", tags: ["tactile"] }],
  },
  {
    key: "smell-taste",
    title: "Smell & Taste Effects",
    icon: "lucide:utensils",
    columns: { "1": 0, "2": 0, "3": 0, "4": 1, "5": 1, "6": 1 },
    tab: "sensory",
    subcategories: [
      { key: "gustatory", title: "Gustatory Effects", tags: ["gustatory"] },
      { key: "olfactory", title: "Olfactory Effects", tags: ["olfactory"] },
    ],
  },
  {
    key: "multisensory",
    title: "Multisensory Effects",
    icon: "lucide:cog",
    columns: { "1": 0, "2": 0, "3": 0, "4": 1, "5": 1, "6": 1 },
    tab: "sensory",
    subcategories: [{ key: "multisensory-all", tags: ["multisensory"] }],
  },
  {
    key: "cognitive",
    title: "Cognitive Effects",
    icon: "fluent:thinking-24-regular",
    columns: { "1": 0, "2": 1, "3": 1, "4": 2, "5": 2, "6": 2 },
    tab: "cognitive",
    subcategories: [
      { key: "cog-amp", title: "Amplifications", tags: ["cognitive", "amplification"] },
      { key: "cog-supp", title: "Suppressions", tags: ["cognitive", "suppression"] },
      { key: "cog-novel", title: "Novel States", tags: ["cognitive", "novel"] },
      { key: "cog-psych", title: "Psychological States", tags: ["cognitive", "psychological state"] },
      { key: "cog-trans", title: "Transpersonal States", tags: ["cognitive", "transpersonal state"] },
    ],
  },
  {
    key: "physical",
    title: "Physical Effects",
    icon: "lucide:activity",
    columns: { "1": 0, "2": 1, "3": 2, "4": 3, "5": 3, "6": 3 },
    tab: "physical",
    subcategories: [
      { key: "phys-amp", title: "Amplifications", tags: ["physical", "amplification"] },
      { key: "phys-supp", title: "Suppressions", tags: ["physical", "suppression"] },
      { key: "phys-alt", title: "Alterations", tags: ["physical", "alteration"] },
      { key: "phys-bodily", title: "Uncomfortable Bodily Effects", tags: ["uncomfortable", "bodily"] },
      { key: "phys-cardio", title: "Cardiovascular", tags: ["uncomfortable", "cardiovascular"] },
      { key: "phys-neuro", title: "Neurological", tags: ["uncomfortable", "neurological"] },
    ],
  },
];

export const FLAT_CATEGORIES: FlatCategoryConfig[] = [
  { key: "visual-amplifications", title: "Visual Amplifications", icon: "lucide:arrow-up", tags: ["visual", "amplification"], tab: "sensory" },
  { key: "visual-suppressions", title: "Visual Suppressions", icon: "lucide:arrow-down", tags: ["visual", "suppression"], tab: "sensory" },
  { key: "visual-distortions", title: "Visual Distortions", icon: "lucide:move", tags: ["visual", "distortion"], tab: "sensory" },
  { key: "geometric-patterns", title: "Geometric Patterns", icon: "lucide:shapes", tags: ["visual", "geometric"], tab: "sensory" },
  { key: "hallucinatory-states", title: "Hallucinatory States", icon: "custom:elf", tags: ["visual", "hallucinatory state"], tab: "sensory" },
  { key: "auditory", title: "Auditory Effects", icon: "lucide:ear", tags: ["auditory"], tab: "sensory" },
  { key: "tactile", title: "Tactile Effects", icon: "lucide:hand", tags: ["tactile"], tab: "sensory" },
  { key: "gustatory", title: "Gustatory Effects", icon: "lucide:cookie", tags: ["gustatory"], tab: "sensory" },
  { key: "olfactory", title: "Olfactory Effects", icon: "lucide:flower-2", tags: ["olfactory"], tab: "sensory" },
  { key: "multisensory", title: "Multisensory Effects", icon: "lucide:cog", tags: ["multisensory"], tab: "sensory" },
  { key: "cognitive-amplifications", title: "Amplifications", icon: "lucide:arrow-up", tags: ["cognitive", "amplification"], tab: "cognitive" },
  { key: "cognitive-suppressions", title: "Suppressions", icon: "lucide:arrow-down", tags: ["cognitive", "suppression"], tab: "cognitive" },
  { key: "novel-states", title: "Novel States", icon: "lucide:lightbulb", tags: ["cognitive", "novel"], tab: "cognitive" },
  { key: "psychological-states", title: "Psychological States", icon: "lucide:heart", tags: ["cognitive", "psychological state"], tab: "cognitive" },
  { key: "transpersonal-states", title: "Transpersonal States", icon: "lucide:infinity", tags: ["cognitive", "transpersonal state"], tab: "cognitive" },
  { key: "physical-amplifications", title: "Amplifications", icon: "lucide:arrow-up", tags: ["physical", "amplification"], tab: "physical" },
  { key: "physical-suppressions", title: "Suppressions", icon: "lucide:arrow-down", tags: ["physical", "suppression"], tab: "physical" },
  { key: "physical-alterations", title: "Alterations", icon: "lucide:refresh-cw", tags: ["physical", "alteration"], tab: "physical" },
  { key: "uncomfortable-bodily", title: "Uncomfortable Bodily Effects", icon: "lucide:frown", tags: ["uncomfortable", "bodily"], tab: "physical" },
  { key: "cardiovascular", title: "Cardiovascular Effects", icon: "lucide:heart-pulse", tags: ["uncomfortable", "cardiovascular"], tab: "physical" },
  { key: "neurological", title: "Neurological Effects", icon: "fluent:thinking-24-regular", tags: ["uncomfortable", "neurological"], tab: "physical" },
];
