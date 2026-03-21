import Link from "next/link";
import { memo, useState, useCallback, useMemo } from "react";
import { AppImage } from "@/components/common/AppImage";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon, type IconName } from "@/components/common/Icon";
import { SectionHeader } from "@/components/common/SectionHeader";
import type { SubstanceArticle } from "@/schema";
import { isPlainLeftClick } from "@/utils/navigation";
import { slugify } from "@/utils/slug";

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

/** Memoized interaction badge component */
const InteractionBadge = memo(function InteractionBadge({
  item,
  isExpanded,
  onToggleExpand,
  onSelectInteraction,
}: {
  item: { raw: string; substance: string; rationale: string | null };
  isExpanded: boolean;
  onToggleExpand: (key: string) => void;
  onSelectInteraction?: (substance: string) => void;
}) {
  const hasRationale = !!item.rationale;
  const href = `/${slugify(item.substance)}`;

  const handleToggle = useCallback(() => {
    onToggleExpand(item.raw);
  }, [onToggleExpand, item.raw]);

  const handleSelect = useCallback(() => {
    onSelectInteraction?.(item.substance);
  }, [onSelectInteraction, item.substance]);

  // Expanded state - full-width inline card
  if (isExpanded && hasRationale) {
    return (
      <div
        className="theme-inline-expanded-card relative my-1 flex w-full flex-col items-start gap-2 rounded-lg px-4 py-3"
      >
        <ExpandButton
          isExpanded={true}
          onToggle={handleToggle}
          variant="compact"
          className="absolute top-3 right-3 text-white/85"
          ariaLabel={`Collapse ${item.substance}`}
        />
        <Link
          href={href}
          onClick={
            onSelectInteraction
              ? (event) => {
                  if (!isPlainLeftClick(event)) {
                    return;
                  }

                  event.preventDefault();
                  handleSelect();
                }
              : undefined
          }
          className="pr-8 text-sm font-semibold text-white transition-colors hover:text-fuchsia-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
        >
          {item.substance}
        </Link>
        <p className="text-sm text-white/60 leading-relaxed">
          {item.rationale}
        </p>
      </div>
    );
  }

  // Collapsed state - compact badge
  return (
    <span
      className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1 text-sm font-medium text-white/85 ring-1 ring-white/10"
    >
      <Link
        href={href}
        onClick={
          onSelectInteraction
            ? (event) => {
                if (!isPlainLeftClick(event)) {
                  return;
                }

                event.preventDefault();
                handleSelect();
              }
            : undefined
        }
        className="transition-colors hover:text-fuchsia-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
      >
        {item.substance}
      </Link>
      {hasRationale && (
        <ExpandButton
          isExpanded={false}
          onToggle={handleToggle}
          variant="compact"
          className="text-white/85"
          ariaLabel={`Expand ${item.substance}`}
        />
      )}
    </span>
  );
});

export const InteractionsSection = memo(function InteractionsSection({
  article,
  onSelectInteraction,
}: InteractionsSectionProps) {
  const { interactions } = article;

  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((key: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const hasDangerous = interactions.dangerous.length > 0;
  const hasUnsafe = interactions.unsafe.length > 0;
  const hasCaution = interactions.caution.length > 0;

  // Pre-parse all interactions with useMemo to avoid regex parsing on every render
  const parsedInteractions = useMemo(() => {
    const parseItems = (items: string[]) =>
      items.map((item) => {
        const match = item.match(/^(.+?)\s*\((.+)\)$/);
        return {
          raw: item,
          substance: match ? match[1].trim() : item,
          rationale: match ? match[2].trim() : null,
        };
      });

    return {
      dangerous: parseItems(interactions.dangerous),
      unsafe: parseItems(interactions.unsafe),
      caution: parseItems(interactions.caution),
    };
  }, [interactions.dangerous, interactions.unsafe, interactions.caution]);

  if (!hasDangerous && !hasUnsafe && !hasCaution) {
    return null;
  }

  return (
    <div id="interactions" className="space-y-6 pt-12 scroll-mt-6">
      <SectionHeader icon="lucide:blend" title="Interactions" className="theme-accent-icon-scope" />

      {/* Single column layout */}
      <div className="flex flex-col gap-4">
        {INTERACTION_CATEGORIES.map(({ key, label, icon, borderClass, bgClass, iconClass, definition }) => {
          const items = parsedInteractions[key as keyof typeof parsedInteractions];
          if (items.length === 0) return null;

          return (
            <div
              key={key}
              className={`rounded-xl p-4 ${borderClass} ${bgClass}`}
            >
              <h3 className="flex items-center gap-2 font-semibold text-white">
                <Icon icon={icon} size={20} className={`theme-accent-icon ${iconClass}`} />
                {label}
              </h3>
              <p className="mt-2 text-xs text-white/50 leading-relaxed">{definition}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {items.map((item) => (
                  <InteractionBadge
                    key={item.raw}
                    item={item}
                    isExpanded={expandedItems.has(item.raw)}
                    onToggleExpand={toggleExpand}
                    onSelectInteraction={onSelectInteraction}
                  />
                ))}
              </div>
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
          <AppImage src="/favicons/tripsit.png" alt="" width={20} height={20} className="h-5 w-5 rounded" />
          <span className="text-xs font-semibold text-fuchsia-200 group-hover:text-fuchsia-100 transition -ml-1">
            TripSit
          </span>
          <Icon icon="lucide:external-link" size={12} className="theme-external-link-badge-icon text-white/30 group-hover:text-white/50 transition -ml-1" />
        </a>
      </div>
    </div>
  );
});
