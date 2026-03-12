import { memo, useCallback } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
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

export const TableOfContentsSection = memo(function TableOfContentsSection({
  article,
}: TableOfContentsSectionProps) {
  const presentItems = TOC_ITEMS.filter((item) => item.isPresent(article));

  const handleClick = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  if (presentItems.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-xs">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
          Contents
        </h2>
        <nav>
          <ol className="space-y-1">
            {presentItems.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handleClick(item.id)}
                  className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-fuchsia-300"
                >
                  <span className="theme-toc-icon flex h-5 w-5 shrink-0 items-center justify-center text-white/30 group-hover:text-fuchsia-400/60">
                    <Icon icon={item.icon} size={14} />
                  </span>
                  <span className="flex-1">{item.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      </div>
    </div>
  );
});
