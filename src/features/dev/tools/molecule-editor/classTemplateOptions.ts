import chemicalIndexManual from "@data/substances/chemicalIndexManual.json";
import { buildChemicalClassTree } from "@/data/builders/chemicalClassTree";
import { resolveChemicalClassKey } from "@/data/indexes/chemicalClassLookup";
import {
  isDirectUrlOnlySubstance,
  isHiddenSubstance,
} from "@/schema/substance/substanceVisibilityPolicy";

export interface ClassTemplateOption {
  key: string;
  label: string;
}

interface ManualChemicalClass {
  key: string;
  label: string;
  parents?: string[];
}

interface ClassMembershipArticle {
  slug: string;
  title: string;
  priority?: string | null;
  index_categories?: string[] | null;
  classification?: unknown;
}

/** Canonical class-key vocabulary for template authoring. */
const MANUAL_CLASSES = chemicalIndexManual.classes as ManualChemicalClass[];
const CLASS_TREE = buildChemicalClassTree(MANUAL_CLASSES);

export const CLASS_TEMPLATE_OPTIONS: ClassTemplateOption[] = MANUAL_CLASSES
  .map((cls) => ({
    key: cls.key,
    label: cls.label,
  }))
  .sort((left, right) => left.label.localeCompare(right.label));

function extractChemicalClasses(classification: unknown): string[] {
  if (!classification || typeof classification !== "object") return [];
  const raw = (classification as { chemical_class?: unknown }).chemical_class;
  return Array.isArray(raw)
    ? raw.filter((value): value is string => typeof value === "string")
    : [];
}

/**
 * Rolled visible class members, following the public class tree's
 * most-specific placement rule. Pass `molblockSlugs` when the caller needs to
 * restrict the result to members that can seed an editable template.
 */
export function buildClassTemplateMemberOptions(
  classKey: string,
  articles: ClassMembershipArticle[],
  molblockSlugs?: ReadonlySet<string>,
): Array<{ slug: string; title: string }> {
  const eligibleKeys = new Set([classKey, ...CLASS_TREE.descendantsOf(classKey)]);

  const members = articles
    .filter((article) => {
      if (molblockSlugs && !molblockSlugs.has(article.slug)) return false;
      if (
        isHiddenSubstance(article.index_categories) ||
        isDirectUrlOnlySubstance(article.priority)
      ) {
        return false;
      }
      const matched = new Set(
        extractChemicalClasses(article.classification)
          .map(resolveChemicalClassKey)
          .filter((key): key is string => key !== null),
      );
      const mostSpecific = Array.from(matched).filter(
        (key) => !CLASS_TREE.descendantsOf(key).some((descendant) => matched.has(descendant)),
      );
      return mostSpecific.some((key) => eligibleKeys.has(key));
    })
    .map((article) => ({ slug: article.slug, title: article.title }));

  const uniqueMembers = new Map<string, { slug: string; title: string }>();
  for (const member of members) {
    if (!uniqueMembers.has(member.slug)) uniqueMembers.set(member.slug, member);
  }
  return Array.from(uniqueMembers.values()).sort((left, right) =>
    left.title.localeCompare(right.title),
  );
}
