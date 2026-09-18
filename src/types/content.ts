import type { IconName } from "@/components/common/Icon";
import type { ArticleChemistryPresentation } from "@/data/builders/articleChemistryPresentation";

export type RouteKey = string;

interface DoseEntryDetail { label: string;
value: string; }

interface DoseEntry { label: string;
value?: string;
details?: DoseEntryDetail[];
description?: string; }

export interface RouteInfo {
  label: string;
  units?: string;
  dosage: DoseEntry[];
  duration: DoseEntry[];
  bioavailability?: string;
  notes?: string;
}

export interface HeroBadge {
  icon: IconName;
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

type NameVariantKind = "substitutive" | "iupac" | "botanical" | "alternative"

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

interface InfoSectionItem { label: string;
value: string;
href?: string;
icon?: IconName;
chips?: InfoSectionItemChip[]; }

export interface InfoSection {
  title: string;
  icon: IconName;
  items: InfoSectionItem[];
}

export interface InfoSectionItemChip {
  label: string;
  base: string;
  slug: string;
  qualifier?: string;
  qualifierSlug?: string;
}

interface CitationEntry { label: string;
href?: string; }

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
  /**
   * Canonical effect slug per entry in `subjectiveEffects`, positionally aligned,
   * or null where the name resolves to no single effect. Drives the effect ->
   * substances join so it agrees with the substance -> effect link.
   */
  subjectiveEffectSlugs?: (string | null)[];
  interactions: InteractionGroup[];
  tolerance: ToleranceEntry[];
  reagentTesting: Record<string, string>;
  chemistryPresentation?: ArticleChemistryPresentation;
  notes: string;
  sourceCitations: CitationEntry[];
  citations: CitationEntry[];
  infoSections?: InfoSection[];
  categories?: string[];
}
