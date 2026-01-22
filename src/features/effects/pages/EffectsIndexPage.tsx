import { useState, useMemo, memo } from "react";
import { motion } from "framer-motion";
import { Icon, type IconName } from "@/components/common/Icon";
import { IconBadge } from "@/components/common/IconBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { EffectCategoryCard } from "../components/EffectCategoryCard";
import { ParentCategoryCard } from "../components/ParentCategoryCard";
import { SEIIntroSection } from "../components/SEIIntroSection";
import { useResponsiveColumnCount } from "@/hooks/useResponsiveColumnCount";
import { useSubjectiveEffects } from "@/hooks/useSubjectiveEffects";
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

/**
 * Minimal effect type for index display.
 */
interface EffectSummary {
  slug: string;
  name: string;
  tags: string[];
}

interface EffectsIndexPageProps {
  onSelectEffect: (slug: string) => void;
}

type TabId = "all" | "sensory" | "cognitive" | "physical";

interface TabConfig {
  id: TabId;
  label: string;
  icon: IconName;
  filterTags: string[];
  blob?: string;
}

const TABS: TabConfig[] = [
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

/**
 * Subcategory configuration.
 */
interface SubcategoryConfig {
  key: string;
  title?: string;
  tags: string[];
}

/**
 * Parent category configuration for hierarchical layout.
 * Uses responsive column assignments similar to CategoryGrid.
 */
interface ParentCategoryConfig {
  key: string;
  title: string;
  icon: IconName;
  /** Responsive column assignments by column count */
  columns: Record<string, number>;
  tab: TabId;
  subcategories: SubcategoryConfig[];
}

/**
 * Hierarchical category configuration matching original EffectIndex.
 * Column assignments are responsive - key is column count, value is target column (0-indexed).
 */
const PARENT_CATEGORIES: ParentCategoryConfig[] = [
  // Sensory categories
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
    subcategories: [
      { key: "auditory-all", tags: ["auditory"] },
    ],
  },
  {
    key: "tactile",
    title: "Tactile Effects",
    icon: "lucide:hand",
    columns: { "1": 0, "2": 0, "3": 0, "4": 1, "5": 1, "6": 1 },
    tab: "sensory",
    subcategories: [
      { key: "tactile-all", tags: ["tactile"] },
    ],
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
    subcategories: [
      { key: "multisensory-all", tags: ["multisensory"] },
    ],
  },

  // Cognitive category
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

  // Physical category
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

/**
 * Flat category configuration for Sensory/Cognitive/Physical tabs.
 * Each subcategory becomes its own card.
 */
interface FlatCategoryConfig {
  key: string;
  title: string;
  icon: IconName;
  tags: string[];
  tab: TabId;
}

const FLAT_CATEGORIES: FlatCategoryConfig[] = [
  // Sensory - Visual subcategories
  { key: "visual-amplifications", title: "Visual Amplifications", icon: "lucide:arrow-up", tags: ["visual", "amplification"], tab: "sensory" },
  { key: "visual-suppressions", title: "Visual Suppressions", icon: "lucide:arrow-down", tags: ["visual", "suppression"], tab: "sensory" },
  { key: "visual-distortions", title: "Visual Distortions", icon: "lucide:move", tags: ["visual", "distortion"], tab: "sensory" },
  { key: "geometric-patterns", title: "Geometric Patterns", icon: "lucide:shapes", tags: ["visual", "geometric"], tab: "sensory" },
  { key: "hallucinatory-states", title: "Hallucinatory States", icon: "custom:elf", tags: ["visual", "hallucinatory state"], tab: "sensory" },

  // Sensory - Other
  { key: "auditory", title: "Auditory Effects", icon: "lucide:ear", tags: ["auditory"], tab: "sensory" },
  { key: "tactile", title: "Tactile Effects", icon: "lucide:hand", tags: ["tactile"], tab: "sensory" },
  { key: "gustatory", title: "Gustatory Effects", icon: "lucide:cookie", tags: ["gustatory"], tab: "sensory" },
  { key: "olfactory", title: "Olfactory Effects", icon: "lucide:flower-2", tags: ["olfactory"], tab: "sensory" },
  { key: "multisensory", title: "Multisensory Effects", icon: "lucide:cog", tags: ["multisensory"], tab: "sensory" },

  // Cognitive
  { key: "cognitive-amplifications", title: "Amplifications", icon: "lucide:arrow-up", tags: ["cognitive", "amplification"], tab: "cognitive" },
  { key: "cognitive-suppressions", title: "Suppressions", icon: "lucide:arrow-down", tags: ["cognitive", "suppression"], tab: "cognitive" },
  { key: "novel-states", title: "Novel States", icon: "lucide:lightbulb", tags: ["cognitive", "novel"], tab: "cognitive" },
  { key: "psychological-states", title: "Psychological States", icon: "lucide:heart", tags: ["cognitive", "psychological state"], tab: "cognitive" },
  { key: "transpersonal-states", title: "Transpersonal States", icon: "lucide:infinity", tags: ["cognitive", "transpersonal state"], tab: "cognitive" },

  // Physical
  { key: "physical-amplifications", title: "Amplifications", icon: "lucide:arrow-up", tags: ["physical", "amplification"], tab: "physical" },
  { key: "physical-suppressions", title: "Suppressions", icon: "lucide:arrow-down", tags: ["physical", "suppression"], tab: "physical" },
  { key: "physical-alterations", title: "Alterations", icon: "lucide:refresh-cw", tags: ["physical", "alteration"], tab: "physical" },
  { key: "uncomfortable-bodily", title: "Uncomfortable Bodily Effects", icon: "lucide:frown", tags: ["uncomfortable", "bodily"], tab: "physical" },
  { key: "cardiovascular", title: "Cardiovascular Effects", icon: "lucide:heart-pulse", tags: ["uncomfortable", "cardiovascular"], tab: "physical" },
  { key: "neurological", title: "Neurological Effects", icon: "fluent:thinking-24-regular", tags: ["uncomfortable", "neurological"], tab: "physical" },
];

/**
 * Tabbed effects index page.
 *
 * "All" tab: 3-column layout with hierarchical parent category cards.
 * Sensory/Cognitive/Physical tabs: Flat card layout with subcategories as individual cards.
 */
export const EffectsIndexPage = memo(function EffectsIndexPage({
  onSelectEffect,
}: EffectsIndexPageProps) {
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const columnCount = useResponsiveColumnCount({ limitColumns: true });

  // Fetch effects from Convex at route level
  const { effects: convexEffects, isLoading } = useSubjectiveEffects();

  // Map Convex effects to local type
  const effects: EffectSummary[] = useMemo(() => {
    return convexEffects.map(e => ({ slug: e.slug, name: e.name, tags: e.tags }));
  }, [convexEffects]);

  const activeTabConfig = TABS.find(t => t.id === activeTab);

  // Filter effects by tab
  const filteredEffects = useMemo(() => {
    const tab = TABS.find(t => t.id === activeTab);
    if (!tab || tab.filterTags.length === 0) {
      return effects;
    }

    return effects.filter(effect =>
      effect.tags.some(tag =>
        tab.filterTags.includes(tag.toLowerCase())
      )
    );
  }, [effects, activeTab]);

  // For "all" tab: get categories grouped by responsive column
  const categoriesByColumn = useMemo(() => {
    if (activeTab !== "all") return new Map<number, ParentCategoryConfig[]>();

    const columns = new Map<number, ParentCategoryConfig[]>();

    // Initialize all columns
    for (let i = 0; i < columnCount; i++) {
      columns.set(i, []);
    }

    // Distribute categories to columns based on responsive assignments
    PARENT_CATEGORIES.forEach((cat, index) => {
      let targetColumn: number;
      if (cat.columns && cat.columns[String(columnCount)] !== undefined) {
        targetColumn = cat.columns[String(columnCount)] % columnCount;
      } else {
        // Fallback to round-robin
        targetColumn = index % columnCount;
      }
      columns.get(targetColumn)?.push(cat);
    });

    return columns;
  }, [activeTab, columnCount]);

  // For other tabs: get flat categories with effects
  const flatCategoriesWithEffects = useMemo(() => {
    if (activeTab === "all") return [];

    return FLAT_CATEGORIES
      .filter(cat => cat.tab === activeTab)
      .map(cat => {
        const matchingEffects = filteredEffects.filter(effect => {
          const effectTags = effect.tags.map(t => t.toLowerCase());
          return cat.tags.every(catTag => effectTags.includes(catTag.toLowerCase()));
        });

        return {
          ...cat,
          effects: matchingEffects.sort((a, b) => a.name.localeCompare(b.name)),
        };
      })
      .filter(cat => cat.effects.length > 0);
  }, [filteredEffects, activeTab]);

  // Distribute flat categories across columns
  const flatCategoriesByColumn = useMemo(() => {
    if (activeTab === "all") return new Map<number, typeof flatCategoriesWithEffects>();

    const columns = new Map<number, typeof flatCategoriesWithEffects>();

    // Initialize all columns
    for (let i = 0; i < columnCount; i++) {
      columns.set(i, []);
    }

    // Round-robin distribution for flat categories
    flatCategoriesWithEffects.forEach((cat, index) => {
      const targetColumn = index % columnCount;
      columns.get(targetColumn)?.push(cat);
    });

    return columns;
  }, [flatCategoriesWithEffects, activeTab, columnCount]);

  // Show loading state while fetching (AFTER all hooks)
  if (isLoading && effects.length === 0) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fuchsia-500 border-t-transparent" />
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
            title="Subjective Effect Index"
            icon="lucide:sparkles"
          />

          {/* Creator Attribution - Moved closer to title */}
          <div className="-mt-14 mb-12 flex justify-center relative z-10">
            <button
              type="button"
              onClick={() => {
                const path = "/contributors/josie";
                window.history.pushState({}, "", path);
                window.dispatchEvent(new PopStateEvent("popstate"));
              }}
              className="group flex items-center gap-2.5 rounded-full bg-white/[0.04] pl-2 pr-4 py-1.5 ring-1 ring-white/10 hover:ring-fuchsia-400/30 hover:bg-white/[0.08] transition-all cursor-pointer shadow-lg shadow-black/10 hover:shadow-fuchsia-500/10 backdrop-blur-md"
            >
              <img
                src="/profile-avatars/josie/avatar.webp"
                alt="Josie Kins"
                className="h-6 w-6 rounded-full object-cover ring-2 ring-white/10 group-hover:ring-fuchsia-400/50 transition"
              />
              <span className="text-xs font-medium text-white/50 group-hover:text-white/80 transition">
                created by <span className="font-bold text-fuchsia-200 group-hover:text-fuchsia-100">Josie Kins</span>, 2011
              </span>
            </button>
          </div>
        </motion.div>

        {/* Intro Section */}
        <motion.div variants={itemAnimation}>
          <SEIIntroSection
            effectCount={effects.length}
            tabBlob={activeTab !== "all" ? activeTabConfig?.blob : undefined}
          />
        </motion.div>

        {/* Tab Navigation */}
        <motion.div variants={itemAnimation}>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)} className="mb-4 flex justify-center">
            <TabsList className="flex-wrap h-auto bg-white/5 border border-white/10 p-1.5 rounded-2xl gap-1">
              {TABS.map(tab => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={cn(
                    "gap-2.5 px-5 py-2.5 rounded-xl transition-all duration-300 data-[state=active]:bg-fuchsia-500/20 data-[state=active]:text-fuchsia-200 data-[state=active]:shadow-none hover:bg-white/5",
                    "text-[0.9375rem] font-medium text-white/60"
                  )}
                >
                  <Icon icon={tab.icon} size={18} />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

        </motion.div>
      </motion.div>

      {/* ALL TAB: Responsive column layout */}
      {activeTab === "all" && (() => {
        const nonEmptyCols = Array.from({ length: columnCount })
          .map((_, i) => ({ index: i, cats: categoriesByColumn.get(i) ?? [] }))
          .filter(col => col.cats.length > 0);
        return (
          <motion.div
            className="mx-auto grid w-full max-w-[1600px] gap-4 px-4"
            style={{ gridTemplateColumns: `repeat(${nonEmptyCols.length}, minmax(0, 1fr))` }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            {nonEmptyCols.map((col) => (
              <div key={col.index} className="flex flex-col gap-4">
                {col.cats.map(cat => (
                  <ParentCategoryCard
                    key={cat.key}
                    title={cat.title}
                    icon={cat.icon}
                    subcategories={cat.subcategories}
                    effects={effects}
                    onSelectEffect={onSelectEffect}
                  />
                ))}
              </div>
            ))}
          </motion.div>
        );
      })()}

      {/* SENSORY/COGNITIVE/PHYSICAL TABS: Responsive column layout */}
      {activeTab !== "all" && (() => {
        const nonEmptyCols = Array.from({ length: columnCount })
          .map((_, i) => ({ index: i, cats: flatCategoriesByColumn.get(i) ?? [] }))
          .filter(col => col.cats.length > 0);
        return (
          <motion.div
            className="mx-auto grid w-full max-w-[1600px] gap-4 px-4"
            style={{ gridTemplateColumns: `repeat(${nonEmptyCols.length}, minmax(0, 1fr))` }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            {nonEmptyCols.map((col) => (
              <div key={col.index} className="flex flex-col gap-4">
                {col.cats.map(cat => (
                  <EffectCategoryCard
                    key={cat.key}
                    title={cat.title}
                    icon={cat.icon}
                    effects={cat.effects}
                    onSelectEffect={onSelectEffect}
                  />
                ))}
              </div>
            ))}
          </motion.div>
        );
      })()}

      {/* Empty State */}
      {filteredEffects.length === 0 && (
        <SectionCard>
          <div className="text-center py-8">
            <Icon icon="lucide:search-x" size={48} className="mx-auto mb-4 text-white/30" />
            <h3 className="text-lg font-semibold text-white/70 mb-2">No effects found</h3>
            <p className="text-sm text-white/50">
              No subjective effects have been imported yet. Run the migration script to populate this index.
            </p>
          </div>
        </SectionCard>
      )}
    </div>
  );
});
