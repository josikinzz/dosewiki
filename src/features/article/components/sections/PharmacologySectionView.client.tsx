"use client";

import { SmartLink } from "@/components/common/SmartLink";
import { ExpandableList } from "@/components/common/ArticleExpandable";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon, type IconName } from "@/components/common/Icon";
import { ArticleSection } from "@/components/common/ArticleSection";
import { cn } from "@/lib/utils";
import { SUBSTANCE_SECTION_ICONS } from "@/schema/substance/sectionManifest";
import { isPlainLeftClick } from "@/utils/navigation";
import { memo, type MouseEvent, type ReactNode } from "react";
import { useT } from "@/i18n/client";

export interface PharmacologyBindingRow {
  site: string;
  activity: string;
  qualifier?: string;
  mechanismLink?: { href: string; baseSlug: string; qualifierSlug?: string };
  affinity: string;
  efficacy: string;
}

export interface PharmacologyMetaboliteRow {
  name: string;
  abbreviation?: string;
  qualifications: string[];
  status?: "active" | "inactive";
}

export interface PharmacologySectionViewProps {
  hasSummary: boolean;
  hasPharmacodynamics: boolean;
  hasPharmacokinetics: boolean;
  pharmacodynamicsContent: ReactNode;
  missingPharmacodynamicsSlot: ReactNode;
  pharmacokineticsContent: ReactNode;
  missingPharmacokineticsSlot: ReactNode;
  halfLifeContent: ReactNode;
  bindingRows: PharmacologyBindingRow[];
  bindingTitleAdornment: ReactNode;
  metaboliteRows: PharmacologyMetaboliteRow[];
  metaboliteTitleAdornment: ReactNode;
  subsectionGapNotice: ReactNode;
  onSelectMechanism?: (slug: string, qualifier?: string) => void;
}

function CollapsedToggle({ icon, title }: { icon: IconName; title: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 pr-0.5 text-xs font-semibold uppercase tracking-wide theme-text-primary">
      <Icon icon={icon} size={15} className="shrink-0 theme-icon-muted" />
      <span className="min-w-0">{title}</span>
    </span>
  );
}

export const PharmacologySectionView = memo(function PharmacologySectionView(
  props: PharmacologySectionViewProps,
) {
  const t = useT();
  const renderMechanismPart = (row: PharmacologyBindingRow, text: string) => {
    const className =
      "theme-focus-ring font-medium theme-text-primary transition-colors";
    if (!row.mechanismLink) return <span className={className}>{text}</span>;
    const onClick = props.onSelectMechanism
      ? (event: MouseEvent<HTMLAnchorElement>) => {
          if (!isPlainLeftClick(event)) return;
          event.preventDefault();
          props.onSelectMechanism?.(
            row.mechanismLink!.baseSlug,
            row.mechanismLink!.qualifierSlug,
          );
        }
      : undefined;
    return (
      <SmartLink
        href={row.mechanismLink.href}
        className={className}
        onClick={onClick}
      >
        {text}
      </SmartLink>
    );
  };

  const bindingNodes = props.bindingRows.map((row, idx) => (
    <div
      key={idx}
      className={cn(
        "theme-pharmacology-table-row flex flex-col items-start gap-1 rounded-lg px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3",
        idx % 2 === 1 && "theme-pharmacology-table-row-alt",
      )}
    >
      <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 sm:w-auto">
        {row.site && renderMechanismPart(row, row.site)}
        {row.activity && renderMechanismPart(row, row.activity)}
        {row.qualifier && (
          <span className="theme-receptor-qualifier-badge whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium theme-accent-emphasis">
            {row.qualifier}
          </span>
        )}
      </div>
      {(row.affinity || row.efficacy) && (
        <div className="flex w-full min-w-0 flex-col items-start gap-0.5 sm:w-auto sm:items-end sm:text-right">
          {row.affinity && (
            <span className="break-words font-mono text-xs theme-text-faint">
              {row.affinity}
            </span>
          )}
          {row.efficacy && (
            <span className="break-words text-xs theme-text-faint">
              {row.efficacy}
            </span>
          )}
        </div>
      )}
    </div>
  ));
  const metaboliteNodes = props.metaboliteRows.map((row, idx) => (
    <div
      key={idx}
      className={cn(
        "theme-pharmacology-table-row flex flex-col items-start gap-1 rounded-lg px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3",
        idx % 2 === 1 && "theme-pharmacology-table-row-alt",
      )}
    >
      <span className="flex w-full min-w-0 flex-wrap items-center gap-1.5 theme-text-secondary sm:w-auto">
        {row.name}
      </span>
      {(row.abbreviation || row.status || row.qualifications.length > 0) && (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {row.abbreviation && (
            <span className="break-words font-mono text-xs theme-text-faint">
              {row.abbreviation}
            </span>
          )}
          {row.qualifications.length > 0 && (
            <span className="text-xs theme-text-subtle">
              {row.qualifications.join(", ")}
            </span>
          )}
          {row.status === "active" && (
            <span className="theme-metabolite-status-badge theme-metabolite-status-badge-active whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium">
              {t("active")}
            </span>
          )}
          {row.status === "inactive" && (
            <span className="theme-metabolite-status-badge theme-metabolite-status-badge-inactive whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium theme-text-faint">
              {t("inactive")}
            </span>
          )}
        </div>
      )}
    </div>
  ));

  return (
    <ArticleSection
      id="pharmacology"
      icon={SUBSTANCE_SECTION_ICONS.pharmacology}
      heading={t("Pharmacology")}
    >
      {props.hasPharmacodynamics && (
        <ArticleSection.Group
          icon="lucide:brain-circuit"
          heading={t("Pharmacodynamics")}
        >
          {props.pharmacodynamicsContent}
          {props.missingPharmacodynamicsSlot}
          {bindingNodes.length > 0 && (
            <ExpandableList
              ariaLabelBase={t("binding sites")}
              defaultExpanded={!props.hasSummary}
              collapsedCount={bindingNodes.length}
              hideToggleWhenExpanded
              items={bindingNodes}
              className="space-y-3"
              collapsedToggleContent={
                <CollapsedToggle icon="lucide:key" title={t("Binding Sites")} />
              }
              toggleButtonClassName={({ isExpanded }) =>
                isExpanded ? undefined : "gap-2 px-3.5 py-1.5"
              }
              toggleClassName="pt-1.5"
            >
              {({ hiddenCount, isExpanded, items, toggle }) =>
                isExpanded ? (
                  <ArticleSection.InfoCard
                    icon="lucide:key"
                    title={t("Binding Sites")}
                    titleAdornment={props.bindingTitleAdornment}
                    accessory={
                      <ExpandButton
                        isExpanded
                        onToggle={toggle}
                        variant="count"
                        count={hiddenCount}
                        className="theme-control-pill-quiet"
                        ariaLabel={t("Collapse binding sites")}
                      />
                    }
                    variant="subtle"
                    padding="sm"
                    contentClassName="space-y-1"
                  >
                    {items}
                  </ArticleSection.InfoCard>
                ) : null
              }
            </ExpandableList>
          )}
        </ArticleSection.Group>
      )}
      {!props.hasPharmacodynamics && props.missingPharmacodynamicsSlot}
      <ArticleSection.Group
        icon="material-symbols:metabolism-rounded"
        heading={t("Pharmacokinetics")}
      >
        {props.hasPharmacokinetics && props.pharmacokineticsContent}
        {props.missingPharmacokineticsSlot}
        {props.halfLifeContent && (
          <ArticleSection.InfoCard
            icon="lucide:trending-down"
            title={t("Half-life")}
            variant="subtle"
            padding="sm"
          >
            {props.halfLifeContent}
          </ArticleSection.InfoCard>
        )}
        {metaboliteNodes.length > 0 && (
          <ExpandableList
            ariaLabelBase={t("metabolites")}
            defaultExpanded={!props.hasPharmacokinetics}
            collapsedCount={metaboliteNodes.length}
            hideToggleWhenExpanded
            items={metaboliteNodes}
            className="space-y-3"
            collapsedToggleContent={
              <CollapsedToggle
                icon="material-symbols:track-changes-rounded"
                title={t("Metabolites")}
              />
            }
            toggleButtonClassName={({ isExpanded }) =>
              isExpanded ? undefined : "gap-2 px-3.5 py-1.5"
            }
            toggleAdornment
          >
            {({ hiddenCount, isExpanded, items, toggle }) =>
              isExpanded ? (
                <ArticleSection.InfoCard
                  icon="material-symbols:track-changes-rounded"
                  title={t("Metabolites")}
                  titleAdornment={props.metaboliteTitleAdornment}
                  accessory={
                    <ExpandButton
                      isExpanded
                      onToggle={toggle}
                      variant="count"
                      count={hiddenCount}
                      className="theme-control-pill-quiet"
                      ariaLabel={t("Collapse metabolites")}
                    />
                  }
                  variant="subtle"
                  padding="sm"
                  contentClassName="space-y-1"
                >
                  {items}
                </ArticleSection.InfoCard>
              ) : null
            }
          </ExpandableList>
        )}
        {props.subsectionGapNotice}
      </ArticleSection.Group>
    </ArticleSection>
  );
});
