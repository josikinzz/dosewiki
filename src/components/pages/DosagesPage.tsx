import { memo, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Icon, type IconName } from "@/components/common/Icon";
import { PageHeader } from "@/components/layout/PageHeader";
import { CategoryGrid } from "@/features/article/components/sections";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DosageCategoryGroup, DrugListEntry } from "../../data/builders/library";
import { useLightweightData } from "../../data/LightweightDataProvider";
import { getCategoryIcon } from "../../data/config/categoryIcons";
import { useLazyLibrary } from "../../hooks/useLazyLibrary";
import { cn } from "@/lib/utils";

const containerAnimation = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemAnimation = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 20
    }
  }
};

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
  onSelectDrug: (slug: string) => void;
  onSelectCategory?: (categoryKey: string) => void;
}

/**
 * Build DosageCategoryGroup[] from category layout and slug lookup.
 * This avoids loading all 679 articles just to render the home page.
 */
function buildGroupsFromLayout(
  layout: ReturnType<typeof useLightweightData>["layout"],
  lookup: ReturnType<typeof useLightweightData>["lookup"]
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

export const DosagesPage = memo(function DosagesPage({
  onSelectDrug,
  onSelectCategory,
}: DosagesPageProps) {
  const [sortKey, setSortKey] = useState<IndexSortKey>("psychoactive");

  // Lightweight data from context (always available)
  const { layout, lookup, substanceCount } = useLightweightData();

  // Lazy-load full library only when switching away from psychoactive
  const needsFullLibrary = sortKey !== "psychoactive";
  const { library, isLoading: libraryLoading } = useLazyLibrary(needsFullLibrary);

  // Build psychoactive groups from lightweight data
  const psychoactiveGroups = useMemo(
    () => buildGroupsFromLayout(layout, lookup),
    [layout, lookup]
  );

  // Get counts from lightweight data or library
  const psychoactiveClassCount = psychoactiveGroups.length;
  const chemicalClassCount = library?.chemicalClassIndexGroups.length ?? 0;
  const mechanismCount = library?.mechanismIndexGroups.length ?? 0;

  const formatLabel = (count: number, singular: string, plural: string) =>
    `${count} ${count === 1 ? singular : plural}`;

  // Resolve which groups to show
  const resolvedGroups = useMemo(() => {
    if (sortKey === "psychoactive") {
      return psychoactiveGroups;
    }

    // For other tabs, we need the full library
    if (!library) {
      return []; // Will show loading
    }

    if (sortKey === "chemical") {
      return library.chemicalClassIndexGroups;
    }
    if (sortKey === "mechanism") {
      return library.mechanismIndexGroups;
    }

    return psychoactiveGroups;
  }, [sortKey, psychoactiveGroups, library]);

  // Show loading state for chemical/mechanism tabs
  if (needsFullLibrary && libraryLoading) {
    return (
      <div className="mx-auto w-full px-4 pb-20 pt-12 2xl:px-8">
        <div className="mx-auto max-w-3xl md:max-w-4xl">
          <PageHeader
            title="Substance Index"
            icon="lucide:flask-conical"
            description="Loading..."
          />
          <div className="mt-12 flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-fuchsia-500 border-t-transparent" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full px-4 pb-20 pt-12 2xl:px-8">
      <motion.div
        className="mx-auto max-w-3xl md:max-w-4xl"
        initial="hidden"
        animate="visible"
        variants={containerAnimation}
      >
        <motion.div variants={itemAnimation}>
          <PageHeader
            title="Substance Index"
            icon="lucide:flask-conical"
            description={
              <>
                Browse {" "}
                <span className="font-bold text-fuchsia-200">
                  {formatLabel(substanceCount, "compound", "compounds")}
                </span>
                {" "} and organize them across {" "}
                <span className="font-bold text-fuchsia-200">
                  {formatLabel(psychoactiveClassCount, "psychoactive class", "psychoactive classes")}
                </span>
                {chemicalClassCount > 0 && (
                  <>
                    ,{" "}
                    <span className="font-bold text-fuchsia-200">
                      {formatLabel(chemicalClassCount, "chemical class", "chemical classes")}
                    </span>
                  </>
                )}
                {mechanismCount > 0 && (
                  <>
                    , and{" "}
                    <span className="font-bold text-fuchsia-200">
                      {formatLabel(mechanismCount, "mechanism of action", "mechanisms of action")}
                    </span>
                  </>
                )}
                .{" "}
                Open any entry to explore detailed dosage tables, durational timelines, psychopharmacological data, and general harm reduction information.
              </>
            }
          />
        </motion.div>

        {/* Sort Tabs */}
        <motion.div variants={itemAnimation}>
          <Tabs value={sortKey} onValueChange={(v) => setSortKey(v as IndexSortKey)} className="mt-2 mb-4 flex justify-center">
            <TabsList className="flex-wrap h-auto bg-white/5 border border-white/10 p-1.5 rounded-2xl gap-1">
              {SORT_OPTIONS.map((option) => (
                <TabsTrigger
                  key={option.key}
                  value={option.key}
                  disabled={option.disabled}
                  className={cn(
                    "gap-2.5 px-5 py-2.5 rounded-xl transition-all duration-300 data-[state=active]:bg-fuchsia-500/20 data-[state=active]:text-fuchsia-200 data-[state=active]:shadow-none hover:bg-white/5 disabled:opacity-30",
                    "text-[0.9375rem] font-medium text-white/60"
                  )}
                >
                  <Icon icon={option.icon} size={18} />
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>


        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <CategoryGrid
          groups={resolvedGroups}
          onSelectDrug={onSelectDrug}
          onSelectCategory={sortKey === "psychoactive" ? onSelectCategory : undefined}
        />
      </motion.div>
    </div>
  );
});
