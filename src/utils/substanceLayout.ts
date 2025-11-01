import type { InfoSection, InfoSectionItem, NameVariant } from "../types/content";

const MOLECULE_IDENTITY_LABELS = new Set([
  "substitutive name",
  "iupac name",
]);

const MOLECULE_CARD_LABELS = new Set([
  "chemical class",
  "psychoactive class",
  "mechanism of action",
  "half-life",
  "half life",
]);

const normalizeLabel = (value: string): string => value.toLowerCase().trim();

const sortByPreferredOrder = (items: InfoSectionItem[], preferredOrder: string[]): InfoSectionItem[] => {
  const orderMap = new Map<string, number>();
  preferredOrder.forEach((label, index) => {
    orderMap.set(label, index);
  });

  return items
    .slice()
    .sort((a, b) => {
      const aLabel = normalizeLabel(a.label);
      const bLabel = normalizeLabel(b.label);
      const aIndex = orderMap.get(aLabel) ?? preferredOrder.length;
      const bIndex = orderMap.get(bLabel) ?? preferredOrder.length;
      return aIndex - bIndex;
    });
};

export interface ExtractedInfoSections {
  filteredInfoSections: InfoSection[];
  moleculeIdentityEntries: InfoSectionItem[];
  moleculeCardEntries: InfoSectionItem[];
}

export function extractInfoSectionBuckets(infoSections?: InfoSection[]): ExtractedInfoSections {
  if (!infoSections || infoSections.length === 0) {
    return {
      filteredInfoSections: [],
      moleculeIdentityEntries: [],
      moleculeCardEntries: [],
    };
  }

  const moleculeIdentityEntries: InfoSectionItem[] = [];
  const moleculeCardEntries: InfoSectionItem[] = [];
  const filteredSections: InfoSection[] = [];

  infoSections.forEach((section) => {
    const retainedItems = (section.items ?? []).filter((item) => {
      const normalizedLabel = normalizeLabel(item.label);

      if (MOLECULE_IDENTITY_LABELS.has(normalizedLabel)) {
        moleculeIdentityEntries.push(item);
        return false;
      }

      if (MOLECULE_CARD_LABELS.has(normalizedLabel)) {
        moleculeCardEntries.push(item);
        return false;
      }

      return true;
    });

    if (retainedItems.length === 0) {
      return;
    }

    if (retainedItems.length === (section.items?.length ?? 0)) {
      filteredSections.push(section);
      return;
    }

    filteredSections.push({ ...section, items: retainedItems });
  });

  const identityOrder = ["substitutive name", "iupac name"];
  const cardOrder = [
    "psychoactive class",
    "mechanism of action",
    "chemical class",
    "half-life",
    "half life",
  ];

  return {
    filteredInfoSections: filteredSections,
    moleculeIdentityEntries: sortByPreferredOrder(moleculeIdentityEntries, identityOrder),
    moleculeCardEntries: sortByPreferredOrder(moleculeCardEntries, cardOrder),
  };
}

type HeroVariantKind = "botanical" | "alternative";

export interface HeroVariantLine {
  key: string;
  kind: HeroVariantKind;
  values: string[];
}

export function buildHeroVariantLines(nameVariants?: NameVariant[]): HeroVariantLine[] {
  if (!nameVariants || nameVariants.length === 0) {
    return [];
  }

  return nameVariants
    .map<HeroVariantLine | null>((variant, index) => {
      if (variant.kind !== "botanical" && variant.kind !== "alternative") {
        return null;
      }

      const values = variant.values
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

      if (values.length === 0) {
        return null;
      }

      return {
        key: `${variant.kind}-${index}`,
        kind: variant.kind,
        values,
      };
    })
    .filter((entry): entry is HeroVariantLine => Boolean(entry));
}
