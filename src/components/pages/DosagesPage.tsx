import { PageHeader } from "@/components/layout/PageHeader";
import type { IconName } from "@/components/common/Icon";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { CategoryGrid } from "@/features/article/components/sections/CategoryGrid";
import type { DosageCategoryGroup, DrugListEntry } from "../../data/builders/library";
import type { SubstanceLookupEntry } from "../../data/LightweightDataProvider";
import { getCategoryIcon } from "../../data/config/categoryIcons";
import type { CategoryLayout } from "../../hooks/useCategoryLayout";
import { isLowPrioritySubstance } from "@/schema";

const SUBSTANCE_INDEX_ICON = "streamline-ultimate:science-molecule-strucutre-bold" satisfies IconName;

interface DosagesPageProps {
  layout: CategoryLayout;
  substances: SubstanceLookupEntry[];
}

/**
 * Build DosageCategoryGroup[] from category layout and slug lookup.
 * This avoids loading all 679 articles just to render the home page.
 */
function buildGroupsFromLayout(
  layout: CategoryLayout,
  lookup: Map<string, SubstanceLookupEntry>
): DosageCategoryGroup[] {
  return layout.categories.map((category) => {
    const sections = category.sections.map((section) => {
      const drugs: DrugListEntry[] = section.drugs
        .map((slug) => {
          const entry = lookup.get(slug);
          if (!entry || isLowPrioritySubstance(entry.priority)) return null;
          return { name: entry.name, slug: entry.slug };
        })
        .filter((d): d is DrugListEntry => d !== null);

      return { name: section.label, drugs };
    }).filter((s) => s.drugs.length > 0);

    // Top-level drugs not in sections
    const topLevelDrugs: DrugListEntry[] = category.drugs
      .map((slug) => {
        const entry = lookup.get(slug);
        if (!entry || isLowPrioritySubstance(entry.priority)) return null;
        return { name: entry.name, slug: entry.slug };
      })
      .filter((d): d is DrugListEntry => d !== null);

    // Combine sections and top-level
    const allSections = topLevelDrugs.length > 0 && sections.length > 0
      ? [{ name: "General", drugs: topLevelDrugs }, ...sections]
      : sections;

    const allDrugs = allSections.length > 0
      ? allSections.flatMap((s) => s.drugs)
      : topLevelDrugs;

    return {
      key: category.key,
      name: category.label,
      icon: getCategoryIcon(category.iconKey),
      total: allDrugs.length,
      drugs: allDrugs,
      sections: allSections.length > 0 ? allSections : undefined,
      columns: category.columns,
    } satisfies DosageCategoryGroup;
  }).filter((g) => g.total > 0 || g.key === "miscellaneous");
}

export function DosagesPage({ layout, substances }: DosagesPageProps) {
  const lookup = new Map<string, SubstanceLookupEntry>(
    substances.map((substance) => [substance.slug, substance]),
  );
  const substanceCount = substances.filter((substance) => !isLowPrioritySubstance(substance.priority)).length;

  const psychoactiveGroups = buildGroupsFromLayout(layout, lookup);

  // Other tabs remain disabled until dedicated public datasets are wired in.
  const psychoactiveClassCount = psychoactiveGroups.length;

  const formatLabel = (count: number, singular: string, plural: string) =>
    `${count} ${count === 1 ? singular : plural}`;

  // Resolve which groups to show
  const resolvedGroups = psychoactiveGroups;

  return (
    <PublicContentShell width="wide" focusTarget className="max-w-none 2xl:px-8">
      <div className="mx-auto max-w-3xl md:max-w-4xl">
        <div>
          <PageHeader
            title="Substance Index"
            icon={SUBSTANCE_INDEX_ICON}
            showSpotlight={false}
            descriptionClassName="type-lead theme-accent-emphasis-scope theme-text-secondary mx-auto max-w-[90ch] text-balance"
            description={
              <>
                Browse {" "}
                <strong>{formatLabel(substanceCount, "substance article", "substance articles")}</strong>
                {" "} focused on education and harm reduction, organized across {" "}
                <strong>{formatLabel(psychoactiveClassCount, "psychoactive class", "psychoactive classes")}</strong>
                .
                <br />
                Open any page below to explore detailed information including: {" "}
                <em>dosage &amp; duration, subjective effects, reagent testing, pharmacology, interactions, harm potential, history &amp; culture, legality, and further reading.</em>
              </>
            }
          />
        </div>
      </div>

      <div>
        <CategoryGrid
          groups={resolvedGroups}
          drugHrefPrefix="/"
          categoryHrefPrefix="/category/"
        />
      </div>
    </PublicContentShell>
  );
}
