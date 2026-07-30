"use client";

import Link from "next/link";
import { memo, useState } from "react";
import { AppImage } from "@/components/common/AppImage";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { PublicNameChip } from "@/components/common/PublicTokens";
import { buildArticleChemistryPresentation } from "@/data/builders/articleChemistryPresentation";
import { getCategoryIcon } from "@/data/config/categoryIcons";
import type { SubstanceArticle } from "@/schema";
import type { ArticleChemistryPresentation } from "@/data/builders/articleChemistryPresentation";
import type { MoleculeAsset } from "@/types/content";
import { isPlainLeftClick } from "@/utils/navigation";
import { publicHref } from "@/utils/publicHref";
import { CitedText } from "../CitedText";
import { ArticleStubBanner } from "./ArticleGapNotice";

const MAX_VISIBLE_NAMES = 5;

/**
 * Strips parenthetical qualifiers from a class name for icon lookup.
 * e.g., "Entactogen (Mild)" -> "entactogen"
 */
function getIconKeyFromClass(className: string): string {
  return className
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim()
    .toLowerCase();
}

function getClassificationHref(type: "psychoactive" | "chemical", label: string) {
  return publicHref.classification(type, label);
}

interface HeroSectionProps {
  article: SubstanceArticle;
  chemistryPresentation?: ArticleChemistryPresentation;
  moleculeAsset?: MoleculeAsset;
  moleculeAssets?: MoleculeAsset[];
  /** Called when a category tag is clicked */
  onSelectCategory?: (categoryKey: string) => void;
  /** Called when a classification badge is clicked */
  onSelectClassification?: (type: "psychoactive" | "chemical", label: string) => void;
  /** Whether to show the "Preview" indicator badge (default: true in dev context) */
  showPreviewBadge?: boolean;
}

export const HeroSection = memo(function HeroSection({
  article,
  chemistryPresentation: providedChemistryPresentation,
  moleculeAsset,
  moleculeAssets,
  onSelectCategory,
  onSelectClassification,
  showPreviewBadge = true,
}: HeroSectionProps) {
  const { title, identification, classification, summary, index_categories } = article;
  const chemistryPresentation = providedChemistryPresentation ?? buildArticleChemistryPresentation(article);

  const [isExpanded, setIsExpanded] = useState(false);
  const [namesExpanded, setNamesExpanded] = useState(false);
  const alternativeNamesPanelId = "hero-alternative-names";
  const chemistryDetailsPanelId = "hero-chemistry-details";
  const resolvedMoleculeAsset = moleculeAsset ?? moleculeAssets?.[0];
  const moleculeUrl = resolvedMoleculeAsset?.url ?? null;

  const hasTitle = title.trim().length > 0;
  const hasIdentification =
    identification.common_name ||
    identification.substitutive_name ||
    identification.iupac_name ||
    identification.smiles;
  const hasClassification =
    classification.psychoactive_class.length > 0 ||
    classification.chemical_class.length > 0;
  const hasSummary = summary?.trim().length > 0;
  const hasCategories = index_categories.length > 0;

  const hasExpandableDetails = chemistryPresentation.hasIdentifiers;

  if (!hasTitle && !hasIdentification && !hasClassification && !hasSummary) {
    return null;
  }

  return (
    <div className="theme-article-hero relative overflow-hidden rounded-2xl p-6 shadow-[var(--theme-elevation-2xl)] sm:p-8">
      {/* Preview badge indicator (only shown in dev context) */}
      {showPreviewBadge && (
        <div className="type-chip-label theme-badge-surface absolute right-4 top-4 flex items-center gap-1.5 rounded-full px-2.5 py-1">
          <Icon icon="lucide:eye" size={12} />
          Preview
        </div>
      )}

      {/* Molecule SVG - floated right on md+, hidden on mobile (shown below title instead) */}
      {moleculeUrl && (
        <AppImage
          src={moleculeUrl}
          alt={chemistryPresentation.molecule.alt}
          width={256}
          height={256}
          priority
          unoptimized
          sizes="(min-width: 768px) 16rem, 0px"
          className="theme-molecule-image hidden md:block md:float-right mb-3 h-48 w-48 object-contain drop-shadow-[0_8px_16px_color-mix(in_srgb,var(--theme-accent)_30%,transparent)] md:h-64 md:w-64"
        />
      )}

      {/* Title */}
      {hasTitle && (
        <h1 className="type-page-title theme-accent-heading max-w-[12ch] text-4xl sm:text-5xl md:text-6xl">{title}</h1>
      )}

      {/* Stub status qualifies the whole article, so it sits with the title
          rather than below the hero. */}
      <ArticleStubBanner article={article} className="mt-4 type-reading-measure" />


      {/* Molecule SVG - centered below title on mobile only */}
      {moleculeUrl && (
        <div className="flex justify-center my-5 md:hidden">
          <AppImage
            src={moleculeUrl}
            alt={chemistryPresentation.molecule.alt}
            width={288}
            height={288}
            priority
            unoptimized
            sizes="(max-width: 767px) min(85vw, 18rem), 0px"
            className="theme-molecule-image h-auto w-72 max-w-[85%] object-contain drop-shadow-[0_8px_16px_color-mix(in_srgb,var(--theme-accent)_30%,transparent)]"
          />
        </div>
      )}

      {/* Substitutive name */}
      {identification.substitutive_name && (
        <div className="type-supporting-copy theme-text-secondary mt-3 flex items-start gap-3 type-reading-measure">
          <Icon icon="lucide:book-open-text" size={20} className="theme-icon-accent mt-0.5 flex-shrink-0" />
          <span>{identification.substitutive_name}</span>
        </div>
      )}

      {/* Alternative names - directly under title */}
      {identification.alternative_names && identification.alternative_names.length > 0 && (() => {
        const names = identification.alternative_names;
        const hasMore = names.length > MAX_VISIBLE_NAMES;
        const visibleNames = namesExpanded ? names : names.slice(0, MAX_VISIBLE_NAMES);

        return (
          <div className="type-supporting-copy theme-text-secondary mt-3 flex items-start gap-3 type-reading-measure">
            <Icon icon="lucide:message-square-quote" size={20} className="theme-icon-accent mt-0.5 flex-shrink-0" />
            <span id={alternativeNamesPanelId} className="flex flex-wrap items-center gap-1">
              {visibleNames.map((name, index) => (
                <span key={`name-${name}-${index}`}>
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
                  ariaLabel={namesExpanded ? "Collapse alternative names" : "Expand alternative names"}
                  ariaControls={alternativeNamesPanelId}
                />
              )}
            </span>
          </div>
        );
      })()}

      {/* Botanical name */}
      {identification.botanical_name && (
        <div className="type-supporting-copy theme-text-secondary mt-3 flex items-start gap-3 type-reading-measure">
          <Icon icon="lucide:leaf" size={20} className="theme-icon-accent mt-0.5 flex-shrink-0" />
          <span className="italic">{identification.botanical_name}</span>
        </div>
      )}

      {/* Classification badges */}
      {hasClassification && (
        <div className="mt-6 space-y-4">
          {classification.psychoactive_class.length > 0 && (
            <div className="flex items-start gap-3">
              <Icon icon="lucide:brain-cog" size={20} className="theme-icon-accent mt-0.5 flex-shrink-0" />
              <div>
                <span className="type-meta-label theme-text-faint mb-2 block">
                  Psychoactive Class
                </span>
                <div className="flex flex-wrap gap-2">
                  {classification.psychoactive_class.map((cls) => {
                    const iconName = getCategoryIcon(getIconKeyFromClass(cls));
                    return (
                      <PublicNameChip
                        as={Link}
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
                        {cls}
                      </PublicNameChip>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {classification.chemical_class.length > 0 && (
            <div className="flex items-start gap-3">
              <Icon icon="lucide:flask-conical" size={20} className="theme-icon-accent mt-0.5 flex-shrink-0" />
              <div>
                <span className="type-meta-label theme-text-faint mb-2 block">
                  Chemical Class
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {classification.chemical_class.map((cls) => (
                    <PublicNameChip
                      as={Link}
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
                      {cls}
                    </PublicNameChip>
                  ))}
                  {hasExpandableDetails && (
                    <ExpandButton
                      isExpanded={isExpanded}
                      onToggle={() => setIsExpanded(!isExpanded)}
                      label="Details"
                      className="type-chip-label"
                      ariaLabel={isExpanded ? "Collapse chemistry details" : "Expand chemistry details"}
                      ariaControls={chemistryDetailsPanelId}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Identification details - always visible */}
      {identification.common_name && identification.common_name !== title && (
        <div className="mt-6 space-y-1">
          <p className="type-detail-copy theme-text-secondary">
            <span className="theme-text-primary font-semibold">Common name:</span>{" "}
            {identification.common_name}
          </p>
        </div>
      )}

      {/* Expandable chemistry details */}
      {isExpanded && hasExpandableDetails && (
        <div id={chemistryDetailsPanelId} className="numeric-tabular mt-3 space-y-1">
          {chemistryPresentation.identifiers.map((identifier) => (
            <p key={identifier.key} className="type-detail-copy theme-text-muted">
              <span className="theme-text-secondary font-semibold">{identifier.label}:</span>{" "}
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

      {/* Index categories */}
      {hasCategories && (
        <div className="mt-5 flex flex-wrap gap-2">
          {index_categories.map((cat) => (
            <PublicNameChip
              as={Link}
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
              {cat}
            </PublicNameChip>
          ))}
        </div>
      )}

      {/* Summary */}
      {hasSummary && (
        <p
          className={`theme-article-hero-summary theme-text-primary mt-8 pt-6 text-sm leading-relaxed whitespace-pre-wrap${
            moleculeUrl ? " theme-article-hero-summary--has-molecule" : ""
          }`}
        >
          <strong className="theme-accent-heading font-semibold">{summary!.split(/\s/)[0]}</strong>{" "}
          <CitedText text={summary!.slice(summary!.split(/\s/)[0].length).trimStart()} article={article} />
        </p>
      )}

    </div>
  );
});
