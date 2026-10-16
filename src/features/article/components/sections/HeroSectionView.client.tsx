"use client";

import { SmartLink } from "@/components/common/SmartLink";
import { memo, useRef, useState, type ReactNode } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { PublicNameChip } from "@/components/common/PublicTokens";
import {
  MOLECULE_ALT_FALLBACK_MESSAGE,
  MOLECULE_ALT_MESSAGE,
} from "@/data/builders/articleChemistryPresentation";
import { useT } from "@/i18n/client";
import { getCategoryIcon } from "@/data/config/categoryIcons";
import type { SubstanceArticle } from "@/schema";
import type { ArticleChemistryPresentation } from "@/data/builders/articleChemistryPresentation";
import type { MoleculeAsset } from "@/types/content";
import { isPlainLeftClick } from "@/utils/navigation";
import { publicHref } from "@/utils/publicHref";
import { EditableSlot, EditableValue } from "../../editing";
import {
  DesktopMoleculeImage,
  MobileMoleculeImage,
} from "./heroMoleculeImages.client";
import { useHeroTitleFit } from "./heroTitleFit.client";

const MAX_VISIBLE_NAMES = 5;

function getIconKeyFromClass(className: string): string {
  return className
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim()
    .toLowerCase();
}

function getClassificationHref(
  type: "psychoactive" | "chemical",
  label: string,
) {
  return publicHref.classification(type, label);
}

export interface HeroSectionViewProps {
  title: SubstanceArticle["title"];
  identification: SubstanceArticle["identification"];
  classification: SubstanceArticle["classification"];
  indexCategories: SubstanceArticle["index_categories"];
  chemistryPresentation: ArticleChemistryPresentation;
  moleculeAsset?: MoleculeAsset;
  moleculeAssets?: MoleculeAsset[];
  summaryContent: ReactNode;
  hasSummary: boolean;
  stubBanner: ReactNode;
  onSelectCategory?: (categoryKey: string) => void;
  onSelectClassification?: (
    type: "psychoactive" | "chemical",
    label: string,
  ) => void;
  linkableCategoryKeys?: readonly string[];
  showPreviewBadge?: boolean;
  nameRowAction?: ReactNode;
}
export const HeroSectionView = memo(function HeroSectionView({
  title,
  identification,
  classification,
  indexCategories,
  chemistryPresentation,
  moleculeAsset,
  moleculeAssets,
  summaryContent,
  stubBanner,
  hasSummary,
  onSelectCategory,
  onSelectClassification,
  linkableCategoryKeys,
  showPreviewBadge = true,
  nameRowAction,
}: HeroSectionViewProps) {
  const t = useT();
  const moleculeAlt = chemistryPresentation.molecule.hasLookupTitle
    ? t(MOLECULE_ALT_MESSAGE, {
        title: chemistryPresentation.molecule.lookupTitle,
      })
    : t(MOLECULE_ALT_FALLBACK_MESSAGE);

  const [isExpanded, setIsExpanded] = useState(false);
  const [namesExpanded, setNamesExpanded] = useState(false);
  const alternativeNamesPanelId = "hero-alternative-names";
  const chemistryDetailsPanelId = "hero-chemistry-details";
  const resolvedMoleculeAsset = moleculeAsset ?? moleculeAssets?.[0];
  const heroRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const moleculeUrl = resolvedMoleculeAsset?.url ?? null;
  const { moleculeBelowTitle, moleculeTopOffset, titleFitPx } =
    useHeroTitleFit({ heroRef, titleRef, moleculeUrl, title });

  const hasTitle = title.trim().length > 0;
  const hasIdentification =
    identification.common_name ||
    identification.substitutive_name ||
    identification.iupac_name ||
    identification.smiles;
  const hasClassification =
    classification.psychoactive_class.length > 0 ||
    classification.chemical_class.length > 0;
  const hasCategories = indexCategories.length > 0;
  const hasExpandableDetails = chemistryPresentation.hasIdentifiers;

  if (!hasTitle && !hasIdentification && !hasClassification && !hasSummary) {
    return null;
  }

  return (
    <div
      id="introduction"
      ref={heroRef}
      className="theme-article-hero relative scroll-mt-6 overflow-hidden rounded-2xl p-6 shadow-[var(--theme-elevation-2xl)] sm:p-8"
    >
      {showPreviewBadge && (
        <div className="type-chip-label theme-badge-surface absolute right-4 top-4 flex items-center gap-1.5 rounded-full px-2.5 py-1">
          <Icon icon="lucide:eye" size={12} />
          {t("Preview")}
        </div>
      )}
      {moleculeUrl && (
        <DesktopMoleculeImage
          key={`desktop:${moleculeUrl}`}
          src={moleculeUrl}
          alt={moleculeAlt}
          placement={hasTitle && moleculeBelowTitle ? "below-title" : "top"}
          topOffset={moleculeTopOffset}
        />
      )}

      {hasTitle && (
        <h1
          ref={titleRef}
          data-hero-title-scale={titleFitPx === null ? "normal" : "fitted"}
          className="type-page-title theme-accent-heading text-4xl sm:text-5xl md:text-6xl"
          style={
            titleFitPx === null ? undefined : { fontSize: `${titleFitPx}px` }
          }
        >
          <EditableValue label="Title" path="title" value={title}>
            {title}
          </EditableValue>
        </h1>
      )}
      {!hasTitle && (
        <EditableSlot
          emptyLabel="Add a title"
          label="Title"
          path="title"
          value={title ?? ""}
        />
      )}
      {stubBanner}

      {moleculeUrl && (
        <MobileMoleculeImage key={`mobile:${moleculeUrl}`} src={moleculeUrl} alt={moleculeAlt} />
      )}

      {identification.substitutive_name && (
        <div className="type-supporting-copy theme-text-secondary mt-3 flex items-start gap-3 type-reading-measure">
          <Icon
            icon="lucide:book-open-text"
            size={20}
            className="theme-icon-accent mt-0.5 flex-shrink-0"
          />
          <span>
            <EditableValue
              label="Substitutive name"
              path="identification.substitutive_name"
              value={identification.substitutive_name}
            >
              {identification.substitutive_name}
            </EditableValue>
          </span>
        </div>
      )}
      {!identification.substitutive_name && (
        <EditableSlot
          className="mt-3"
          emptyLabel="Add a substitutive name"
          label="Substitutive name"
          path="identification.substitutive_name"
          value={identification.substitutive_name ?? ""}
        />
      )}

      {identification.alternative_names &&
        identification.alternative_names.length > 0 &&
        (() => {
          const names = identification.alternative_names;
          const hasMore = names.length > MAX_VISIBLE_NAMES;
          const visibleNames = namesExpanded
            ? names
            : names.slice(0, MAX_VISIBLE_NAMES);

          return (
            <div className="type-supporting-copy theme-text-secondary mt-3 flex items-start gap-3 type-reading-measure">
              <Icon
                icon="lucide:message-square-quote"
                size={20}
                className="theme-icon-accent mt-0.5 flex-shrink-0"
              />
              <span
                id={alternativeNamesPanelId}
                className="flex flex-wrap items-center gap-1"
              >
                {visibleNames.map((name, index) => (
                  <span
                    key={`name-${name}-${index}`}
                    className={
                      index >= MAX_VISIBLE_NAMES
                        ? "theme-reveal-enter"
                        : undefined
                    }
                  >
                    {name}
                    {index < visibleNames.length - 1 ? ", " : ""}
                  </span>
                ))}
                {hasMore && (
                  <ExpandButton
                    isExpanded={namesExpanded}
                    onToggle={() => setNamesExpanded(!namesExpanded)}
                    variant="count"
                    count={names.length - MAX_VISIBLE_NAMES}
                    className="type-chip-label ml-2"
                    ariaLabel={
                      namesExpanded
                        ? t("Collapse alternative names")
                        : t("Expand alternative names")
                    }
                    ariaControls={alternativeNamesPanelId}
                  />
                )}
                {nameRowAction ? (
                  <span className="ml-2 inline-flex empty:hidden">
                    {nameRowAction}
                  </span>
                ) : null}
              </span>
            </div>
          );
        })()}
      {nameRowAction && !identification.alternative_names?.length ? (
        <div className="mt-3 flex empty:hidden">{nameRowAction}</div>
      ) : null}

      {identification.botanical_name && (
        <div className="type-supporting-copy theme-text-secondary mt-3 flex items-start gap-3 type-reading-measure">
          <Icon
            icon="lucide:leaf"
            size={20}
            className="theme-icon-accent mt-0.5 flex-shrink-0"
          />
          <span className="italic">
            <EditableValue
              label="Botanical name"
              path="identification.botanical_name"
              value={identification.botanical_name}
            >
              {identification.botanical_name}
            </EditableValue>
          </span>
        </div>
      )}
      {!identification.botanical_name && (
        <EditableSlot
          className="mt-3"
          emptyLabel="Add a botanical name"
          label="Botanical name"
          path="identification.botanical_name"
          value={identification.botanical_name ?? ""}
        />
      )}

      {hasClassification && (
        <div className="mt-6 space-y-4">
          {classification.psychoactive_class.length > 0 && (
            <div className="flex items-start gap-3">
              <Icon
                icon="lucide:brain-cog"
                size={20}
                className="theme-icon-accent mt-0.5 flex-shrink-0"
              />
              <div>
                <span className="type-meta-label theme-text-faint mb-2 block">
                  {t("Psychoactive Class")}
                </span>
                <div className="flex flex-wrap gap-2">
                  {classification.psychoactive_class.map((cls) => {
                    const iconName = getCategoryIcon(getIconKeyFromClass(cls));
                    return (
                      <PublicNameChip
                        as={SmartLink}
                        key={cls}
                        href={getClassificationHref("psychoactive", cls)}
                        onClick={
                          onSelectClassification
                            ? (event) => {
                                if (!isPlainLeftClick(event)) {
                                  return;
                                }

                                event.preventDefault();
                                onSelectClassification("psychoactive", cls);
                              }
                            : undefined
                        }
                        icon={iconName}
                        interactive
                      >
                        {t(cls)}
                      </PublicNameChip>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {classification.chemical_class.length > 0 && (
            <div className="flex items-start gap-3">
              <Icon
                icon="lucide:flask-conical"
                size={20}
                className="theme-icon-accent mt-0.5 flex-shrink-0"
              />
              <div>
                <span className="type-meta-label theme-text-faint mb-2 block">
                  {t("Chemical Class")}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {classification.chemical_class.map((cls) => (
                    <PublicNameChip
                      as={SmartLink}
                      key={cls}
                      href={getClassificationHref("chemical", cls)}
                      onClick={
                        onSelectClassification
                          ? (event) => {
                              if (!isPlainLeftClick(event)) {
                                return;
                              }

                              event.preventDefault();
                              onSelectClassification("chemical", cls);
                            }
                          : undefined
                      }
                      interactive
                    >
                      {t(cls)}
                    </PublicNameChip>
                  ))}
                  {hasExpandableDetails && (
                    <ExpandButton
                      isExpanded={isExpanded}
                      onToggle={() => setIsExpanded(!isExpanded)}
                      label={t("Details")}
                      className="type-chip-label"
                      ariaLabel={
                        isExpanded
                          ? t("Collapse chemistry details")
                          : t("Expand chemistry details")
                      }
                      ariaControls={chemistryDetailsPanelId}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {identification.common_name && identification.common_name !== title && (
        <div className="mt-6 space-y-1">
          <p className="type-detail-copy theme-text-secondary">
            <span className="theme-text-primary font-semibold">
              {t("Common name:")}
            </span>{" "}
            <EditableValue
              label="Common name"
              path="identification.common_name"
              value={identification.common_name}
            >
              {identification.common_name}
            </EditableValue>
          </p>
        </div>
      )}
      {!identification.common_name && (
        <EditableSlot
          className="mt-6"
          emptyLabel="Add a common name"
          label="Common name"
          path="identification.common_name"
          value={identification.common_name ?? ""}
        />
      )}

      {isExpanded && hasExpandableDetails && (
        <div
          id={chemistryDetailsPanelId}
          className="theme-reveal-enter numeric-tabular mt-3 space-y-1"
        >
          {chemistryPresentation.identifiers.map((identifier) => (
            <p
              key={identifier.key}
              className="type-detail-copy theme-text-muted"
            >
              <span className="theme-text-secondary font-semibold">
                {t(identifier.label)}:
              </span>{" "}
              {identifier.format === "code" ? (
                <code className="theme-chemistry-identifier-code theme-public-card-subtle break-all rounded px-1 py-0.5 font-mono text-xs">
                  {identifier.value}
                </code>
              ) : (
                identifier.value
              )}
            </p>
          ))}
        </div>
      )}

      {hasCategories && (
        <div className="mt-5 flex flex-wrap gap-2">
          {indexCategories.map((cat) => {
            const isLinkable =
              !linkableCategoryKeys ||
              linkableCategoryKeys.includes(cat.trim().toLowerCase());

            if (!isLinkable) {
              return (
                <PublicNameChip key={cat} icon="lucide:tag">
                  {t(cat)}
                </PublicNameChip>
              );
            }

            return (
              <PublicNameChip
                as={SmartLink}
                key={cat}
                href={publicHref.category(cat)}
                onClick={
                  onSelectCategory
                    ? (event) => {
                        if (!isPlainLeftClick(event)) {
                          return;
                        }

                        event.preventDefault();
                        onSelectCategory(cat);
                      }
                    : undefined
                }
                icon="lucide:tag"
                interactive
              >
                {t(cat)}
              </PublicNameChip>
            );
          })}
        </div>
      )}

      {summaryContent}
    </div>
  );
});
