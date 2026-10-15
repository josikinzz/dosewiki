import { getCategoryIcon } from "@/data/config/categoryIcons";
import { msg } from "@/i18n/messages";
import type { IconName } from "@/components/common/Icon";
import type { PublicSegmentedTabItem } from "@/components/layout/PublicSegmentedTabs";
import type { CategoryTabContent } from "@/data/categoryTabContent";

export const SUBSTANCE_INDEX_ICON = "streamline-ultimate:science-molecule-strucutre-bold" satisfies IconName;

export type SubstanceIndexSuperTab = {
  id: string;
  label: string;
  icon: IconName;
  memberKeys: readonly string[];
  content: CategoryTabContent;
};

export const SUBSTANCE_INDEX_SUPER_TABS: readonly SubstanceIndexSuperTab[] = [
  {
    id: "super:hallucinogens",
    label: msg("Hallucinogens"),
    icon: getCategoryIcon("hallucinogen"),
    memberKeys: ["psychedelic", "dissociative", "deliriant", "hallucinogen"],
    content: {
      definition: msg(
        '**Hallucinogens** are a class of psychoactive substances that produce strong changes in perception, mood, and thought. The experience often feels like a different state of consciousness, not a stronger or weaker version of normal awareness. There are three subclasses of hallucinogens: psychedelics, dissociatives, and deliriants. Each subclass acts on a different brain system and produces a different type of experience. The name comes from the Latin *hallucinari*, which means "to wander in the mind."',
      ),
      warning: "",
    },
  },
  {
    id: "super:depressants",
    label: msg("Depressants"),
    icon: getCategoryIcon("depressant"),
    memberKeys: ["gabaergic", "opioid"],
    content: {
      definition: msg(
        '**Depressants** (also known as "downers") are a class of psychoactive substances that slow the central nervous system. They produce relaxation, calm, less anxiety, drowsiness, and lower inhibition. Most depressants strengthen GABA, the main inhibitory or "braking" system of the brain. The word "depressant" means lower nervous-system activity. It does not mean sadness.',
      ),
      warning: "",
    },
  },
];

export const SUBSTANCE_INDEX_TAB_ORDER: readonly string[] = [
  "super:hallucinogens",
  "psychedelic",
  "dissociative",
  "deliriant",
  "cannabinoid",
  "entactogen",
  "stimulant",
  "nootropic",
  "super:depressants",
  "gabaergic",
  "opioid",
  "antidepressant",
  "antipsychotic",
];

export type SubstanceIndexTabGroup = { key: string; name: string; icon: IconName };

const SUBSTANCE_INDEX_SUPER_TAB_PREFIX = "super:"

export function resolveSubstanceIndexSuperTabs(
  hasCategory: (key: string) => boolean,
): SubstanceIndexSuperTab[] {
  return SUBSTANCE_INDEX_SUPER_TABS.filter((tab) => tab.memberKeys.some(hasCategory));
}

export function buildSubstanceIndexTabItems(
  groups: readonly SubstanceIndexTabGroup[],
): PublicSegmentedTabItem[] {
  const groupsByKey = new Map(groups.map((group) => [group.key, group]));
  const items: PublicSegmentedTabItem[] = [
    { id: "all", label: msg("All"), icon: SUBSTANCE_INDEX_ICON, prominence: "major" },
  ];

  for (const entry of SUBSTANCE_INDEX_TAB_ORDER) {
    if (entry.startsWith(SUBSTANCE_INDEX_SUPER_TAB_PREFIX)) {
      const superTab = SUBSTANCE_INDEX_SUPER_TABS.find((tab) => tab.id === entry);
      if (superTab && superTab.memberKeys.some((key) => groupsByKey.has(key))) {
        items.push({ id: superTab.id, label: superTab.label, icon: superTab.icon, prominence: "major" });
      }
      continue;
    }

    const group = groupsByKey.get(entry);
    if (!group) continue;
    items.push({
      id: group.key,
      label: group.name,
      icon: group.icon,
      ...(entry === "cannabinoid" ? { breakAfter: true, breakAfterClassName: "hidden xl:block" } : {}),
    });
  }

  return items;
}

export function orderCategoriesForAllTab<T extends { key: string }>(groups: readonly T[]): T[] {
  const byKey = new Map(groups.map((group) => [group.key, group]));
  const seen = new Set<string>();
  const ordered: T[] = [];

  for (const entry of SUBSTANCE_INDEX_TAB_ORDER) {
    if (entry.startsWith(SUBSTANCE_INDEX_SUPER_TAB_PREFIX)) continue;
    const group = byKey.get(entry);
    if (group && !seen.has(entry)) {
      ordered.push(group);
      seen.add(entry);
    }
  }

  for (const group of groups) {
    if (seen.has(group.key)) continue;
    ordered.push(group);
    seen.add(group.key);
  }

  return ordered;
}
