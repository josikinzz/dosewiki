import { memo, useState } from "react";
import { Icon, type IconName } from "../common/Icon";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import type { SubstanceArticle } from "../../schema";

interface InteractionsSectionProps {
  article: SubstanceArticle;
  /** Called when an interaction substance is clicked */
  onSelectInteraction?: (substance: string) => void;
}

const INTERACTION_CATEGORIES: Array<{
  key: string;
  label: string;
  icon: IconName;
  borderClass: string;
  bgClass: string;
  iconClass: string;
  definition: string;
}> = [
  {
    key: "dangerous",
    label: "Dangerous",
    icon: "lucide:skull",
    borderClass: "ring-1 ring-rose-500/30",
    bgClass: "bg-rose-500/10",
    iconClass: "text-rose-300",
    definition: "These combinations are considered extremely harmful and should always be avoided. Reactions to these drugs taken in combination are highly unpredictable and have a potential to cause death.",
  },
  {
    key: "unsafe",
    label: "Unsafe",
    icon: "lucide:hospital",
    borderClass: "ring-1 ring-orange-500/30",
    bgClass: "bg-orange-500/10",
    iconClass: "text-orange-300",
    definition: "There is considerable risk of physical harm when taking these combinations, they should be avoided where possible.",
  },
  {
    key: "caution",
    label: "Caution",
    icon: "lucide:triangle-alert",
    borderClass: "ring-1 ring-amber-500/30",
    bgClass: "bg-amber-500/10",
    iconClass: "text-amber-300",
    definition: "These combinations are not usually physically harmful, but may produce undesirable effects, such as physical discomfort or overstimulation. Extreme use may cause physical health issues. Synergistic effects may be unpredictable. Care should be taken when choosing to use this combination.",
  },
];

export const InteractionsSection = memo(function InteractionsSection({
  article,
  onSelectInteraction,
}: InteractionsSectionProps) {
  const { interactions } = article;

  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpand = (key: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const hasDangerous = interactions.dangerous.length > 0;
  const hasUnsafe = interactions.unsafe.length > 0;
  const hasCaution = interactions.caution.length > 0;

  if (!hasDangerous && !hasUnsafe && !hasCaution) {
    return null;
  }

  return (
    <SectionCard delay={0}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon="lucide:blend" label="Interactions" />
        Interactions
      </h2>

      {/* Single column layout */}
      <div className="flex flex-col gap-4">
        {INTERACTION_CATEGORIES.map(({ key, label, icon, borderClass, bgClass, iconClass, definition }) => {
          const items = interactions[key as keyof typeof interactions];
          if (items.length === 0) return null;

          return (
            <div
              key={key}
              className={`rounded-xl p-4 ${borderClass} ${bgClass}`}
            >
              <h3 className="flex items-center gap-2 font-semibold text-white">
                <Icon icon={icon} size={20} className={iconClass} />
                {label}
              </h3>
              <p className="mt-2 text-xs text-white/50 leading-relaxed">{definition}</p>
              {(() => {
                // Parse all items to extract substance and rationale
                const parsed = items.map((item) => {
                  const match = item.match(/^(.+?)\s*\((.+)\)$/);
                  return {
                    raw: item,
                    substance: match ? match[1].trim() : item,
                    rationale: match ? match[2].trim() : null,
                  };
                });

                return (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {parsed.map((item) => {
                      const isExpanded = expandedItems.has(item.raw);
                      const hasRationale = !!item.rationale;

                      // Expanded state - full-width inline card
                      if (isExpanded && hasRationale) {
                        return (
                          <div
                            key={item.raw}
                            className="relative flex w-full flex-col items-start gap-2 rounded-lg bg-black/20 ring-1 ring-white/10 px-4 py-3 my-1"
                          >
                            <button
                              onClick={() => toggleExpand(item.raw)}
                              className="absolute top-3 right-3 flex items-center gap-0.5 rounded p-1 transition hover:bg-white/10"
                              aria-label={`Collapse ${item.substance}`}
                            >
                              <Icon icon="lucide:ellipsis" size={12} className="text-white/85" />
                              <Icon icon="lucide:chevron-down" size={12} className="text-white/85 rotate-180" />
                            </button>
                            <span className="text-sm font-semibold text-white pr-8">
                              {item.substance}
                            </span>
                            <p className="text-sm text-white/60 leading-relaxed">
                              {item.rationale}
                            </p>
                          </div>
                        );
                      }

                      // Collapsed state - compact badge
                      return (
                        <span
                          key={item.raw}
                          className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1 text-sm font-medium text-white/85 ring-1 ring-white/10"
                        >
                          {onSelectInteraction ? (
                            <button
                              type="button"
                              className="hover:text-fuchsia-300 transition-colors"
                              onClick={() => onSelectInteraction(item.substance)}
                            >
                              {item.substance}
                            </button>
                          ) : (
                            <span>{item.substance}</span>
                          )}
                          {hasRationale && (
                            <button
                              onClick={() => toggleExpand(item.raw)}
                              className="flex items-center gap-0.5 rounded p-0.5 transition hover:bg-white/10"
                              aria-label={`Expand ${item.substance}`}
                            >
                              <Icon icon="lucide:ellipsis" size={12} className="text-white/85" />
                              <Icon icon="lucide:chevron-down" size={12} className="text-white/85" />
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* Attribution footer */}
      <div className="mt-4 flex justify-end">
        <a
          href="https://combo.tripsit.me/"
          target="_blank"
          rel="noopener noreferrer"
          className="group relative flex items-center gap-2.5 rounded-full bg-white/[0.04] pl-3 pr-4 py-1.5 ring-1 ring-white/10 hover:ring-fuchsia-400/30 hover:bg-white/[0.06] transition"
        >
          <span className="text-xs text-white/50 group-hover:text-white/60 transition">Powered by</span>
          <img src="/favicons/tripsit.png" alt="" className="h-5 w-5 rounded" />
          <span className="text-xs font-semibold text-fuchsia-200 group-hover:text-fuchsia-100 transition -ml-1">
            TripSit
          </span>
          <Icon icon="lucide:external-link" size={12} className="text-white/30 group-hover:text-white/50 transition -ml-1" />
        </a>
      </div>
    </SectionCard>
  );
});
