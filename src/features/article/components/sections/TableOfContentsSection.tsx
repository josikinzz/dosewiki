import { memo } from "react";
import type { IconName } from "@/components/common/Icon";
import {
  PublicTableOfContents,
  type PublicTableOfContentsItem,
} from "@/components/common/PublicTableOfContents";
import { useReagentData } from "@/hooks/useReagentData";
import type { SubstanceArticle } from "@/schema";
import { hasPharmacologyContent } from "../../../../../lib/article/normalization.js";

interface TableOfContentsSectionProps {
  article: SubstanceArticle;
}

interface TocItem {
  id: string;
  label: string;
  icon: IconName;
  isPresent: (article: SubstanceArticle) => boolean;
}

function hasStaticReagentData(article: SubstanceArticle): boolean {
  return Boolean(
    article.reagent_testing &&
    Object.values(article.reagent_testing).some((value) => value?.trim().length > 0),
  );
}

const TOC_ITEMS: TocItem[] = [
  {
    id: "dosage-duration",
    label: "Dosage & Duration",
    icon: "lucide:chart-no-axes-combined",
    isPresent: (a) => a.dosage?.routes?.length > 0 || a.duration?.routes?.length > 0,
  },
  {
    id: "subjective-effects",
    label: "Subjective Effects",
    icon: "lucide:sparkles",
    isPresent: (a) => {
      const se = a.subjective_effects;
      if (!se) return false;
      const hasSensory = se.sensory && Object.values(se.sensory).some(
        (sense) => sense?.subcategories && Object.keys(sense.subcategories).length > 0
      );
      const hasCognitive = se.cognitive && Object.keys(se.cognitive).length > 0;
      const hasPhysical = se.physical && Object.keys(se.physical).length > 0;
      const hasProgressiveStages = se.progressive_stages && Object.keys(se.progressive_stages).length > 0;
      const hasOverview = se.notes?.overview?.trim().length > 0;
      const hasComparisons = (a.comparisons?.length ?? 0) > 0;
      return hasSensory || hasCognitive || hasPhysical || hasProgressiveStages || hasOverview || hasComparisons;
    },
  },
  {
    id: "reagent-testing",
    label: "Reagent Testing",
    icon: "lucide:pipette",
    isPresent: hasStaticReagentData,
  },
  {
    id: "pharmacology",
    label: "Pharmacology",
    icon: "mingcute:settings-6-line",
    isPresent: (a) => hasPharmacologyContent(a.pharmacology),
  },
  {
    id: "interactions",
    label: "Interactions",
    icon: "lucide:blend",
    isPresent: (a) => {
      const i = a.interactions;
      if (!i) return false;
      return (
        i.dangerous?.length > 0 ||
        i.unsafe?.length > 0 ||
        i.caution?.length > 0
      );
    },
  },
  {
    id: "tolerance",
    label: "Tolerance",
    icon: "lucide:trending-up",
    isPresent: (a) => {
      const t = a.tolerance;
      if (!t) return false;
      return (
        t.full_tolerance?.trim().length > 0 ||
        t.half_tolerance?.trim().length > 0 ||
        t.baseline_tolerance?.trim().length > 0 ||
        t.cross_tolerance?.length > 0
      );
    },
  },
  {
    id: "harm-potential",
    label: "Harm Potential",
    icon: "lucide:ambulance",
    isPresent: (a) => {
      const hp = a.harm_potential;
      if (!hp) return false;
      return (
        hp.addiction !== undefined ||
        hp.toxicity !== undefined ||
        hp.psychosis !== undefined ||
        hp.seizure !== undefined
      );
    },
  },
  {
    id: "history-culture",
    label: "History & Culture",
    icon: "lucide:book-open",
    isPresent: (a) => {
      const hc = a.history_culture;
      if (!hc) return false;
      return hc.content?.trim().length > 0 || (hc.sections?.length ?? 0) > 0;
    },
  },
  {
    id: "legality",
    label: "Legality",
    icon: "lucide:scale",
    isPresent: (a) => {
      const l = a.legality;
      if (!l) return false;
      return (
        l.international?.length > 0 ||
        (l.countries && Object.keys(l.countries).length > 0)
      );
    },
  },
  {
    id: "sources",
    label: "Sources",
    icon: "lucide:library",
    isPresent: (a) => (a.source_citations?.length ?? 0) > 0 || a.citations?.length > 0,
  },
];

export const TableOfContentsSection = memo(function TableOfContentsSection({
  article,
}: TableOfContentsSectionProps) {
  const hasStaticReagentEntries = hasStaticReagentData(article);
  const substanceName = article.identification?.common_name || article.title || "";
  const aliases = article.identification?.alternative_names || [];
  const { data: reagentApiData, isLoading: isLoadingReagentData } = useReagentData(
    hasStaticReagentEntries ? "" : substanceName,
    hasStaticReagentEntries ? [] : aliases,
  );
  const hasApiReagentData = (reagentApiData?.reagents?.length ?? 0) > 0;

  const presentItems: PublicTableOfContentsItem[] = TOC_ITEMS.filter((item) => {
    if (item.id === "reagent-testing") {
      return hasStaticReagentEntries || isLoadingReagentData || hasApiReagentData;
    }

    return item.isPresent(article);
  }).map(
    (item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
    }),
  );

  if (presentItems.length === 0) {
    return null;
  }

  return <PublicTableOfContents items={presentItems} />;
});
