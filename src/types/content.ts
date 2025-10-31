import type { LucideIcon } from "lucide-react";

export type RouteKey = string;

export interface DoseEntryDetail {
  label: string;
  value: string;
}

export interface DoseEntry {
  label: string;
  value?: string;
  details?: DoseEntryDetail[];
  description?: string;
}

export interface RouteInfo {
  label: string;
  units?: string;
  dosage: DoseEntry[];
  duration: DoseEntry[];
}

export interface HeroBadge {
  icon: LucideIcon;
  label: string;
  categoryKey?: string;
}

export interface MoleculeAsset {
  filename: string;
  url: string;
  matchedField: string;
  matchedValue: string;
  resolution?: string;
  deduplicatedFrom?: string[];
}

export type NameVariantKind = "substitutive" | "iupac" | "botanical" | "alternative";

export interface NameVariant {
  kind: NameVariantKind;
  label: string;
  values: string[];
}

export type InteractionMatchType = "substance" | "alias" | "class" | "unknown";

export interface InteractionTarget {
  raw: string;
  display: string;
  slug: string;
  matchType: InteractionMatchType;
  rationale?: string;
  matchedSubstanceSlug?: string;
  matchedSubstanceName?: string;
  classKey?: string;
  classLabel?: string;
}

export interface InteractionGroup {
  label: string;
  severity: "danger" | "unsafe" | "caution";
  items: InteractionTarget[];
}

export interface ToleranceEntry {
  label: string;
  description: string;
}

export interface InfoSectionItem {
  label: string;
  value: string;
  href?: string;
  icon?: LucideIcon;
  chips?: InfoSectionItemChip[];
}

export interface InfoSection {
  title: string;
  icon: LucideIcon;
  items: InfoSectionItem[];
}

export interface InfoSectionItemChip {
  label: string;
  base: string;
  slug: string;
  qualifier?: string;
  qualifierSlug?: string;
}

export interface CitationEntry {
  label: string;
  href?: string;
}

export interface SubstanceContent {
  name: string;
  subtitle: string;
  aliases: string[];
  nameVariants: NameVariant[];
  moleculePlaceholder: string;
  moleculeAsset?: MoleculeAsset;
  moleculeAssets?: MoleculeAsset[];
  heroBadges: HeroBadge[];
  categoryKeys?: string[];
  dosageUnitsNote: string;
  routes: Record<RouteKey, RouteInfo>;
  routeOrder: RouteKey[];
  addictionSummary: string;
  subjectiveEffects: string[];
  interactions: InteractionGroup[];
  tolerance: ToleranceEntry[];
  notes: string;
  citations: CitationEntry[];
  infoSections?: InfoSection[];
  categories?: string[];
}
