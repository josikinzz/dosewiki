import type { IconName } from "../components/common/Icon";
import { msg } from "@/i18n/messages";

export interface SubcategoryMeta {
  label: string;
  icon?: IconName;
}

export const SENSORY_CATEGORIES = [
  { key: "visual", label: msg("Visual"), icon: "lucide:eye" as IconName },
  { key: "auditory", label: msg("Auditory"), icon: "lucide:ear" as IconName },
  { key: "tactile", label: msg("Tactile"), icon: "lucide:hand" as IconName },
  { key: "olfactory", label: msg("Olfactory"), icon: null },
  { key: "gustatory", label: msg("Gustatory"), icon: null },
  { key: "multisensory", label: msg("Multisensory"), icon: null },
] as const;

const SUPPRESSIONS: SubcategoryMeta = { label: msg("Suppressions"), icon: "lucide:arrow-down" };
const DISTORTIONS: SubcategoryMeta = { label: msg("Distortions"), icon: "icon-park-outline:distortion" };
const HALLUCINATORY: SubcategoryMeta = { label: msg("Hallucinatory States"), icon: "custom:elf" };
const STIMULATION: SubcategoryMeta = { label: msg("Stimulation"), icon: "lucide:zap" };
const SEDATION: SubcategoryMeta = { label: msg("Sedation"), icon: "lucide:moon" };
const IMPAIRMENT: SubcategoryMeta = { label: msg("Impairment"), icon: "lucide:cloud-fog" };
const COORDINATION: SubcategoryMeta = { label: msg("Coordination"), icon: "lucide:footprints" };
const DISSOCIATIVE: SubcategoryMeta = { label: msg("Dissociative"), icon: "lucide:link-2-off" };
const COMFORTABLE: SubcategoryMeta = { label: msg("Comfortable"), icon: "lucide:armchair" };

const SUBCATEGORY_REGISTRY: Record<string, SubcategoryMeta> = {
  enhancements: { label: msg("Enhancements"), icon: "lucide:arrow-up" },
  suppressions: SUPPRESSIONS,
  suppression: SUPPRESSIONS,
  distortions: DISTORTIONS,
  distortion: DISTORTIONS,
  geometry: { label: msg("Geometry"), icon: "lucide:shapes" },
  hallucinatory: HALLUCINATORY,
  hallucinatorystates: HALLUCINATORY,
  hallucinations: HALLUCINATORY,
  emotional: { label: msg("Emotional"), icon: "lucide:heart" },
  social: { label: msg("Social"), icon: "lucide:users" },
  transpersonal: { label: msg("Transpersonal"), icon: "lucide:sparkles" },
  perception: { label: msg("Perception"), icon: "lucide:scan-eye" },
  analytical: { label: msg("Analytical"), icon: "lucide:brain-circuit" },
  impairment: IMPAIRMENT,
  impairing: IMPAIRMENT,
  disconnective: { label: msg("Disconnective"), icon: "lucide:unplug" },
  dissociative: DISSOCIATIVE,
  dissociating: DISSOCIATIVE,
  stimulation: STIMULATION,
  stimulating: STIMULATION,
  sedation: SEDATION,
  sedating: SEDATION,
  cardiovascular: { label: msg("Cardiovascular"), icon: "lucide:heart-pulse" },
  autonomic: { label: msg("Autonomic"), icon: "lucide:droplets" },
  uncomfortable: { label: msg("Uncomfortable"), icon: "lucide:frown" },
  bodily: { label: msg("Bodily"), icon: "lucide:person-standing" },
  comfortable: COMFORTABLE,
  comfort: COMFORTABLE,
  coordination: COORDINATION,
  motor: COORDINATION,
  euphoria: { label: msg("Euphoria"), icon: "lucide:smile" },
  relaxation: { label: msg("Relaxation"), icon: "lucide:leaf" },
  sleep: { label: msg("Sleep"), icon: "lucide:bed" },
  respiratory: { label: msg("Respiratory"), icon: "lucide:wind" },
  temperature: { label: msg("Temperature"), icon: "lucide:thermometer" },
  "1takingoff": { label: msg("1. Taking Off"), icon: "lucide:trending-up" },
  "2thewaitingroom": { label: msg("2. The Waiting Room"), icon: "lucide:hourglass" },
  "3theotherside": { label: msg("3. The Other Side"), icon: "lucide:house" },
  "4comingdown": { label: msg("4. Coming Down"), icon: "lucide:trending-down" },
};

export const SUBCATEGORY_LABELS: readonly string[] = [
  ...new Set([...SENSORY_CATEGORIES, ...Object.values(SUBCATEGORY_REGISTRY)].map(({ label }) => label)),
];

const FLAT_SUBCATEGORY_KEYS = new Set(["general", "other"]);

function normalizeSubcategoryKey(key: string): string {
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

export function resolveSubcategory(key: string): SubcategoryMeta {
  return (
    SUBCATEGORY_REGISTRY[normalizeSubcategoryKey(key)] ?? {
      label: titleCaseSubcategoryKey(key),
    }
  );
}
