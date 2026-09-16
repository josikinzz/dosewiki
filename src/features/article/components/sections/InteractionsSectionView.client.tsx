"use client";

import { SmartLink } from "@/components/common/SmartLink";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon, type IconName } from "@/components/common/Icon";
import { PublicNameChip } from "@/components/common/PublicTokens";
import { ArticleSection } from "@/components/common/ArticleSection";
import { SUBSTANCE_SECTION_ICONS } from "@/schema/substance/sectionManifest";
import { isPlainLeftClick } from "@/utils/navigation";
import {
  memo,
  useCallback,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { msg, useT } from "@/i18n/client";

const SOURCE = {
  href: "https://combo.tripsit.me/",
  label: "TripSit",
  faviconSrc: "/favicons/tripsit.png",
};

export interface InteractionRow {
  raw: string;
  substance: string;
  substanceSlug: string;
  rationale: ReactNode | null;
  hasPublicRoute: boolean;
}
export interface InteractionGroup {
  key: string;
  label: string;
  icon: IconName;
  borderClass: string;
  bgClass: string;
  iconClass: string;
  priority: string;
  badgeClass: string;
  definition: string;
  rows: InteractionRow[];
}
export interface InteractionsSectionViewProps {
  groups: InteractionGroup[];
  onSelectInteraction?: (substance: string) => void;
}

function InteractionBadge({
  item,
  expanded,
  toggle,
  onSelectInteraction,
  tone,
}: {
  item: InteractionRow;
  expanded: boolean;
  toggle: () => void;
  onSelectInteraction?: (substance: string) => void;
  tone: string;
}) {
  const t = useT();
  const href = item.hasPublicRoute ? `/${item.substanceSlug}` : null;
  const panelId = `interaction-${item.substanceSlug}-${tone}`;
  const onClick = onSelectInteraction
    ? (event: MouseEvent<HTMLAnchorElement>) => {
        if (!isPlainLeftClick(event)) return;
        event.preventDefault();
        onSelectInteraction(item.substance);
      }
    : undefined;
  const expandedNameClassName =
    "theme-accent-heading pr-8 text-sm font-semibold transition-colors";
  if (expanded && item.rationale)
    return (
      <div
        id={panelId}
        className="theme-inline-expanded-card theme-interaction-expanded-card relative my-1 flex w-full flex-col items-start gap-2 rounded-lg px-4 py-3"
      >
        <ExpandButton
          isExpanded
          onToggle={toggle}
          variant="card"
          className={`theme-interaction-expanded-toggle theme-interaction-expanded-toggle-${tone} theme-text-secondary absolute top-3 right-3`}
          ariaLabel={t("Collapse {{substance}} interaction rationale", {
            substance: item.substance,
          })}
          ariaControls={panelId}
        />
        {href ? (
          <SmartLink
            href={href}
            onClick={onClick}
            className={`${expandedNameClassName} theme-focus-ring hover:opacity-90`}
          >
            {item.substance}
          </SmartLink>
        ) : (
          <span className={expandedNameClassName}>{item.substance}</span>
        )}
        <p className="theme-reveal-enter theme-text-muted text-sm leading-relaxed">
          {item.rationale}
        </p>
      </div>
    );
  return (
    <PublicNameChip interactive={Boolean(href) || Boolean(item.rationale)}>
      {href ? (
        <SmartLink
          href={href}
          onClick={onClick}
          className="theme-focus-ring text-current transition hover:opacity-90"
        >
          {item.substance}
        </SmartLink>
      ) : (
        <span>{item.substance}</span>
      )}
      {item.rationale && (
        <ExpandButton
          isExpanded={false}
          onToggle={toggle}
          variant="inline"
          className="theme-text-secondary min-h-0 p-0"
          ariaLabel={t("Expand {{substance}} interaction rationale", {
            substance: item.substance,
          })}
          ariaControls={panelId}
        />
      )}
    </PublicNameChip>
  );
}

export function InteractionsSourceFooter({
  elsewhere = false,
}: {
  elsewhere?: boolean;
}) {
  const t = useT();
  return (
    <ArticleSection.SourceFooter
      source={{
        ...SOURCE,
        prefix: t(elsewhere ? msg("Check") : msg("Powered by")),
      }}
    />
  );
}

export const InteractionsSectionView = memo(function InteractionsSectionView({
  groups,
  onSelectInteraction,
}: InteractionsSectionViewProps) {
  const t = useT();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const toggle = useCallback(
    (key: string) =>
      setExpandedItems((previous) => {
        const next = new Set(previous);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );
  return (
    <ArticleSection
      id="interactions"
      icon={SUBSTANCE_SECTION_ICONS.interactions}
      heading={t("Interactions")}
      headerClassName="theme-accent-icon-scope"
    >
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <div
            key={group.key}
            className={`rounded-xl p-4 ${group.borderClass} ${group.bgClass}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="theme-text-primary flex items-center gap-2 font-semibold">
                <Icon
                  icon={group.icon}
                  size={20}
                  className={`theme-accent-icon ${group.iconClass}`}
                />
                {t(group.label)}
              </h3>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${group.badgeClass}`}
              >
                <Icon icon="lucide:shield-alert" size={12} />
                {t(group.priority)}
              </span>
            </div>
            <p className="theme-text-faint mt-2 text-xs leading-relaxed">
              {t(group.definition)}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {group.rows.map((item) => (
                <InteractionBadge
                  key={item.raw}
                  item={item}
                  expanded={expandedItems.has(item.raw)}
                  toggle={() => toggle(item.raw)}
                  onSelectInteraction={onSelectInteraction}
                  tone={group.key}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <InteractionsSourceFooter />
    </ArticleSection>
  );
});
