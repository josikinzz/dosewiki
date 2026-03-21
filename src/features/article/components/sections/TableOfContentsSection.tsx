import { memo } from "react";
import type { IconName } from "@/components/common/Icon";
import {
  PublicTableOfContents,
  type PublicTableOfContentsItem,
} from "@/components/common/PublicTableOfContents";
import type { SubstanceArticle } from "@/schema";

interface TableOfContentsSectionProps {
  article: SubstanceArticle;
}

interface TocItem {
  id: string;
  label: string;
  icon: IconName;
  isPresent: (article: SubstanceArticle) => boolean;
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
      return hasSensory || hasCognitive || hasPhysical;
    },
  },
  {
    id: "reagent-testing",
    label: "Reagent Testing",
    icon: "lucide:pipette",
    isPresent: (a) => a.reagent_testing && Object.keys(a.reagent_testing).length > 0,
  },
  {
    id: "pharmacology",
    label: "Pharmacology",
    icon: "mingcute:settings-6-line",
    isPresent: (a) => {
      const p = a.pharmacology;
      if (!p) return false;
      return (
        p.pharmacodynamics?.trim().length > 0 ||
        p.summary?.trim().length > 0 ||
        p.receptor_profile?.length > 0 ||
        p.pharmacokinetics?.trim().length > 0 ||
        p.metabolites?.length > 0
      );
    },
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

const SAFETY_CRITICAL_ITEM_IDS = new Set(["reagent-testing"]);

export const TableOfContentsSection = memo(function TableOfContentsSection({
  article,
}: TableOfContentsSectionProps) {
  const presentItems: PublicTableOfContentsItem[] = TOC_ITEMS.filter((item) => item.isPresent(article)).map(
    (item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      tone: SAFETY_CRITICAL_ITEM_IDS.has(item.id) ? "warning" : "default",
    }),
  );

  if (presentItems.length === 0) {
    return null;
  }

  return <PublicTableOfContents items={presentItems} />;
});
