import { Icon, type IconName } from "@/components/common/Icon";
import { PageHeader } from "@/components/layout/PageHeader";
import { CategoryGrid } from "@/features/article/components/sections/CategoryGrid";
import type { DosageCategoryGroup, DrugListEntry } from "../../data/builders/library";
import type { SubstanceLookupEntry } from "../../data/LightweightDataProvider";
import { getCategoryIcon } from "../../data/config/categoryIcons";
import type { CategoryLayout } from "../../hooks/useCategoryLayout";

type IndexSortKey = "psychoactive" | "chemical" | "mechanism";

interface SortOption {
  key: IndexSortKey;
  label: string;
  icon: IconName;
  disabled?: boolean;
}

const SORT_OPTIONS: SortOption[] = [
  {
    key: "psychoactive",
    label: "Psychoactive class",
    icon: "lucide:brain-circuit",
  },
  {
    key: "chemical",
    label: "Chemical class",
    icon: "lucide:hexagon",
    disabled: true,
  },
  {
    key: "mechanism",
    label: "Mechanism of action",
    icon: "lucide:cog",
    disabled: true,
  },
];

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
          if (!entry || entry.priority === "low") return null;
          return { name: entry.name, slug: entry.slug };
        })
        .filter((d): d is DrugListEntry => d !== null);

      return { name: section.label, drugs };
    }).filter((s) => s.drugs.length > 0);

    // Top-level drugs not in sections
    const topLevelDrugs: DrugListEntry[] = category.drugs
      .map((slug) => {
        const entry = lookup.get(slug);
        if (!entry || entry.priority === "low") return null;
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
  const sortKey: IndexSortKey = "psychoactive";
  const lookup = new Map<string, SubstanceLookupEntry>(
    substances.map((substance) => [substance.slug, substance]),
  );
  const substanceCount = substances.filter((substance) => substance.priority !== "low").length;

  const psychoactiveGroups = buildGroupsFromLayout(layout, lookup);

  // Other tabs remain disabled until dedicated public datasets are wired in.
  const psychoactiveClassCount = psychoactiveGroups.length;

  const formatLabel = (count: number, singular: string, plural: string) =>
    `${count} ${count === 1 ? singular : plural}`;

  // Resolve which groups to show
  const resolvedGroups = psychoactiveGroups;

  return (
    <div className="mx-auto w-full px-4 pb-20 pt-12 2xl:px-8">
      <div className="mx-auto max-w-3xl md:max-w-4xl">
        <div>
          <PageHeader
            title="Substance Index"
            icon="lucide:flask-conical"
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

        {/* Sort Tabs */}
        <div>
          <div role="tablist" aria-label="Substance index views" className="mt-2 mb-4 flex justify-center">
            <div className="flex h-auto flex-wrap gap-1 rounded-2xl bg-white/[0.035] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_36px_-28px_rgba(0,0,0,0.55)]">
              {SORT_OPTIONS.map((option) => (
                <div
                  key={option.key}
                  role="tab"
                  aria-selected={option.key === sortKey}
                  aria-disabled={option.disabled}
                  className={`inline-flex items-center gap-2.5 rounded-xl px-5 py-2.5 text-[0.9375rem] font-medium transition-[background-color,color,box-shadow,opacity] duration-300 ${
                    option.key === sortKey
                      ? "bg-[color:var(--theme-surface-muted)] text-white shadow-[inset_0_0_0_1px_rgba(244,114,182,0.18)]"
                      : "text-white/68"
                  } ${option.disabled ? "opacity-55" : "hover:bg-white/[0.05] hover:text-white"}`}
                >
                  <Icon icon={option.icon} size={18} />
                  {option.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div>
        <CategoryGrid
          groups={resolvedGroups}
          drugHrefPrefix="/"
          categoryHrefPrefix={sortKey === "psychoactive" ? "/category/" : undefined}
        />
      </div>
    </div>
  );
}
