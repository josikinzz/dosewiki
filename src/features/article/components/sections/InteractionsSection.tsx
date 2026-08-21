"use client";

import Link from "next/link";
import { memo, useState, useCallback, useMemo, type MouseEvent } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon, type IconName } from "@/components/common/Icon";
import { PublicNameChip } from "@/components/common/PublicTokens";
import type { SubstanceArticle } from "@/schema";
import { isPlainLeftClick } from "@/utils/navigation";
import { slugify } from "@/utils/slug";
import { CitedText } from "../CitedText";
import { ArticleSection } from "@/components/common/ArticleSection";
import { ArticleGapNotice } from "./ArticleGapNotice";

const INTERACTIONS_SOURCE = {
  href: "https://combo.tripsit.me/",
  label: "TripSit",
  faviconSrc: "/favicons/tripsit.png",
};

/**
 * Same destination, different claim: with no table to attribute, "Powered by"
 * would credit a source for data the page does not have.
 */
const INTERACTIONS_ELSEWHERE = { ...INTERACTIONS_SOURCE, prefix: "Check" };

interface InteractionsSectionProps {
  article: SubstanceArticle;
  /** Canonical public article slugs; interaction groups without a page render as text. */
  linkableSubstanceSlugs?: readonly string[];
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
  priority: string;
  badgeClass: string;
  definition: string;
}> = [
    {
      key: "dangerous",
      label: "Dangerous",
      icon: "lucide:skull",
      borderClass: "theme-interaction-danger",
      bgClass: "",
      iconClass: "text-[color:var(--theme-semantic-danger-badge-text)]",
      priority: "Highest risk",
      badgeClass: "theme-interaction-severity-badge-danger",
      definition: "These combinations are considered extremely harmful and should always be avoided. Reactions to these drugs taken in combination are highly unpredictable and have a potential to cause death.",
    },
    {
      key: "unsafe",
      label: "Unsafe",
      icon: "lucide:hospital",
      borderClass: "theme-interaction-unsafe",
      bgClass: "",
      iconClass: "text-[color:var(--theme-semantic-unsafe-badge-text)]",
      priority: "Avoid",
      badgeClass: "theme-interaction-severity-badge-unsafe",
      definition: "There is considerable risk of physical harm when taking these combinations, they should be avoided where possible.",
    },
    {
      key: "caution",
      label: "Caution",
      icon: "lucide:triangle-alert",
      borderClass: "theme-interaction-caution",
      bgClass: "",
      iconClass: "text-[color:var(--theme-semantic-caution-badge-text)]",
      priority: "Use caution",
      badgeClass: "theme-interaction-severity-badge-caution",
      definition: "These combinations are not usually physically harmful, but may produce undesirable effects, such as physical discomfort or overstimulation. Extreme use may cause physical health issues. Synergistic effects may be unpredictable. Care should be taken when choosing to use this combination.",
    },
  ];

/** Memoized interaction badge component */
const InteractionBadge = memo(function InteractionBadge({
  item,
  hasPublicRoute,
  isExpanded,
  onToggleExpand,
  onSelectInteraction,
  article,
  tone,
}: {
  item: {
    raw: string;
    substance: string;
    substanceSlug: string;
    rationale: string | null;
  };
  hasPublicRoute: boolean;
  isExpanded: boolean;
  onToggleExpand: (key: string) => void;
  onSelectInteraction?: (substance: string) => void;
  article: SubstanceArticle;
  tone: string;
}) {
  const hasRationale = !!item.rationale;
  const href = hasPublicRoute ? `/${item.substanceSlug}` : null;
  const panelId = `interaction-${item.substanceSlug}-${tone}`;

  const handleToggle = useCallback(() => {
    onToggleExpand(item.raw);
  }, [onToggleExpand, item.raw]);

  const handleSelect = useCallback(() => {
    onSelectInteraction?.(item.substance);
  }, [onSelectInteraction, item.substance]);

  const linkClickHandler = onSelectInteraction
    ? (event: MouseEvent<HTMLAnchorElement>) => {
        if (!isPlainLeftClick(event)) {
          return;
        }

        event.preventDefault();
        handleSelect();
      }
    : undefined;

  const expandedNameClassName =
    "theme-accent-heading pr-8 text-sm font-semibold transition-colors";
  const collapsedNameClassName =
    "theme-focus-ring text-current transition hover:opacity-90";

  // Expanded state - full-width inline card
  if (isExpanded && hasRationale) {
    return (
      <div
        id={panelId}
        className="theme-inline-expanded-card theme-interaction-expanded-card relative my-1 flex w-full flex-col items-start gap-2 rounded-lg px-4 py-3"
      >
        <ExpandButton
          isExpanded={true}
          onToggle={handleToggle}
          variant="card"
          className={`theme-interaction-expanded-toggle theme-interaction-expanded-toggle-${tone} theme-text-secondary absolute top-3 right-3`}
          ariaLabel={`Collapse ${item.substance} interaction rationale`}
          ariaControls={panelId}
        />
        {href ? (
          <Link
            href={href}
            onClick={linkClickHandler}
            className={`${expandedNameClassName} theme-focus-ring hover:opacity-90`}
          >
            {item.substance}
          </Link>
        ) : (
          <span className={expandedNameClassName}>{item.substance}</span>
        )}
        <p className="theme-text-muted text-sm leading-relaxed">
          <CitedText text={item.rationale ?? ""} article={article} />
        </p>
      </div>
    );
  }

  // Collapsed state - compact badge
  return (
    <PublicNameChip interactive={Boolean(href) || hasRationale}>
      {href ? (
        <Link
          href={href}
          onClick={linkClickHandler}
          className={collapsedNameClassName}
        >
          {item.substance}
        </Link>
      ) : (
        <span>{item.substance}</span>
      )}
      {hasRationale && (
        <ExpandButton
          isExpanded={false}
          onToggle={handleToggle}
          variant="inline"
          className="theme-text-secondary min-h-0 p-0"
          ariaLabel={`Expand ${item.substance} interaction rationale`}
          ariaControls={panelId}
        />
      )}
    </PublicNameChip>
  );
});

export const InteractionsSection = memo(function InteractionsSection({
  article,
  linkableSubstanceSlugs = [],
  onSelectInteraction,
}: InteractionsSectionProps) {
  const { interactions } = article;
  const linkableSubstanceSlugSet = useMemo(
    () => new Set(linkableSubstanceSlugs),
    [linkableSubstanceSlugs],
  );

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
          substanceSlug: slugify(match ? match[1].trim() : item),
        };
      });

    return {
      dangerous: parseItems(interactions.dangerous),
      unsafe: parseItems(interactions.unsafe),
      caution: parseItems(interactions.caution),
    };
  }, [interactions.dangerous, interactions.unsafe, interactions.caution]);

  // A missing combination table is the case a reader most needs told about, so
  // the section states the gap and keeps the source pill rather than vanishing.
  if (!hasDangerous && !hasUnsafe && !hasCaution) {
    return (
      <ArticleGapNotice
        article={article}
        section="interactions"
        footer={<ArticleSection.SourceFooter source={INTERACTIONS_ELSEWHERE} />}
      />
    );
  }

  return (
    <ArticleSection
      id="interactions"
      icon="lucide:blend"
      heading="Interactions"
      headerClassName="theme-accent-icon-scope"
    >
      {/* Single column layout */}
      <div className="flex flex-col gap-4">
        {INTERACTION_CATEGORIES.map(({ key, label, icon, borderClass, bgClass, iconClass, priority, badgeClass, definition }) => {
          const items = parsedInteractions[key as keyof typeof parsedInteractions];
          if (items.length === 0) return null;

          return (
            <div
              key={key}
              className={`rounded-xl p-4 ${borderClass} ${bgClass}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="theme-text-primary flex items-center gap-2 font-semibold">
                  <Icon icon={icon} size={20} className={`theme-accent-icon ${iconClass}`} />
                  {label}
                </h3>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${badgeClass}`}>
                  <Icon icon="lucide:shield-alert" size={12} />
                  {priority}
                </span>
              </div>
              <p className="theme-text-faint mt-2 text-xs leading-relaxed">{definition}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {items.map((item) => (
                  <InteractionBadge
                    key={item.raw}
                    item={item}
                    hasPublicRoute={linkableSubstanceSlugSet.has(item.substanceSlug)}
                    isExpanded={expandedItems.has(item.raw)}
                    onToggleExpand={toggleExpand}
                    onSelectInteraction={onSelectInteraction}
                    article={article}
                    tone={key}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <ArticleSection.SourceFooter source={INTERACTIONS_SOURCE} />
    </ArticleSection>
  );
});
