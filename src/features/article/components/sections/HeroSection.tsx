"use client";

import Link from "next/link";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MoleculeImage } from "@/components/pages/MoleculeImage";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { PublicNameChip } from "@/components/common/PublicTokens";
import {
  MOLECULE_ALT_FALLBACK_MESSAGE,
  MOLECULE_ALT_MESSAGE,
  buildArticleChemistryPresentation,
} from "@/data/builders/articleChemistryPresentation";
import { useT } from "@/i18n/client";
import { getCategoryIcon } from "@/data/config/categoryIcons";
import type { SubstanceArticle } from "@/schema";
import type { ArticleChemistryPresentation } from "@/data/builders/articleChemistryPresentation";
import type { MoleculeAsset } from "@/types/content";
import { isPlainLeftClick } from "@/utils/navigation";
import { publicHref } from "@/utils/publicHref";
import { EditableSlot, EditableValue } from "../../editing";
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
const TITLE_MOLECULE_GAP_PX = 16;
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

interface DesktopMoleculeImageProps {
  alt: string;
  placement: "top" | "below-title";
  src: string;
}

function DesktopMoleculeImage({
  alt,
  placement,
  src,
}: DesktopMoleculeImageProps) {
  return (
    <div
      data-hero-molecule-layout={placement}
      className={`mb-3 hidden w-48 md:float-right md:block md:w-64${
        placement === "below-title" ? " md:mt-4" : ""
      }`}
    >
      <MoleculeImage
        src={src}
        alt={alt}
        width={256}
        height={256}
        priority
        sizes="(min-width: 768px) 16rem, 0px"
        className="theme-molecule-image h-48 w-48 object-contain drop-shadow-[0_8px_16px_color-mix(in_srgb,var(--theme-accent)_30%,transparent)] md:h-64 md:w-64"
      />
    </div>
  );
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
  /** Canonical public category keys; omitted in editor previews that own navigation. */
  linkableCategoryKeys?: readonly string[];
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
  linkableCategoryKeys,
  showPreviewBadge = true,
}: HeroSectionProps) {
  const t = useT();
  const { title, identification, classification, summary, index_categories } = article;
  const chemistryPresentation = providedChemistryPresentation ?? buildArticleChemistryPresentation(article);
  const moleculeAlt = chemistryPresentation.molecule.hasLookupTitle
    ? t(MOLECULE_ALT_MESSAGE, { title: chemistryPresentation.molecule.lookupTitle })
    : t(MOLECULE_ALT_FALLBACK_MESSAGE);

  const [isExpanded, setIsExpanded] = useState(false);
  const [namesExpanded, setNamesExpanded] = useState(false);
  const [moleculeBelowTitle, setMoleculeBelowTitle] = useState(false);
  const [titleFitPx, setTitleFitPx] = useState<number | null>(null);
  const alternativeNamesPanelId = "hero-alternative-names";
  const chemistryDetailsPanelId = "hero-chemistry-details";
  const resolvedMoleculeAsset = moleculeAsset ?? moleculeAssets?.[0];
  const heroRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
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

  useIsomorphicLayoutEffect(() => {
    const heroElement = heroRef.current;
    const titleElement = titleRef.current;

    if (!heroElement || !titleElement) {
      return;
    }

    const updatePlacement = () => {
      const heroRect = heroElement.getBoundingClientRect();
      if (heroRect.width === 0) {
        return;
      }

      const heroStyle = getComputedStyle(heroElement);
      const borderRightWidth =
        Number.parseFloat(heroStyle.borderRightWidth) || 0;
      const paddingRight = Number.parseFloat(heroStyle.paddingRight) || 0;
      const contentRight = heroRect.right - borderRightWidth - paddingRight;
      const moleculeLeft = contentRight - 256;
      // Measure the title as if it were a single line at its natural size.
      // Once the floated molecule (or a fitted font) wraps or shrinks the
      // title, measuring the laid-out text never detects the condition that
      // caused it, so both overrides are stripped for the measurement.
      const previousWhiteSpace = titleElement.style.whiteSpace;
      const previousFontSize = titleElement.style.fontSize;
      titleElement.style.whiteSpace = "nowrap";
      titleElement.style.fontSize = "";
      const naturalFontSize =
        Number.parseFloat(getComputedStyle(titleElement).fontSize) || 0;
      const titleRange = document.createRange();
      titleRange.selectNodeContents(titleElement);
      const titleRect = titleRange.getBoundingClientRect();
      const titleContentRight = titleRect.right;
      // The floor is the section-heading size ("Dosage & Duration" etc.),
      // resolved through the same element so the clamp() in the variable
      // yields real pixels.
      titleElement.style.fontSize = "var(--type-size-section)";
      const minFontSize =
        Number.parseFloat(getComputedStyle(titleElement).fontSize) || 0;
      titleElement.style.whiteSpace = previousWhiteSpace;
      titleElement.style.fontSize = previousFontSize;
      if (moleculeUrl) {
        setMoleculeBelowTitle(
          titleContentRight > moleculeLeft - TITLE_MOLECULE_GAP_PX,
        );
      }
      // Below md the molecule never floats, so a title that reaches the hero
      // edge would break mid-word. Instead, scale the font down just enough
      // to fill the width; glyph and tracking metrics are em-relative, so
      // width scales linearly with font-size. The section-heading size is the
      // floor: below it the title keeps that size and wraps.
      const isDesktop =
        typeof window.matchMedia !== "function" ||
        window.matchMedia("(min-width: 768px)").matches;
      const availableWidth = contentRight - titleRect.left;
      const overflows = titleRect.width > availableWidth;
      if (isDesktop || !overflows || titleRect.width <= 0 || naturalFontSize <= 0) {
        setTitleFitPx(null);
      } else {
        const fitted = naturalFontSize * (availableWidth / titleRect.width);
        // Round down a step so subpixel rasterization can't push the last
        // glyph past the edge and trigger the mid-word break being avoided.
        const fittedFloor = Math.floor(fitted * 4) / 4;
        setTitleFitPx(Math.max(minFontSize, fittedFloor));
      }
    };

    updatePlacement();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => updatePlacement());
    resizeObserver?.observe(heroElement);
    resizeObserver?.observe(titleElement);

    const appearanceObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => updatePlacement());
    appearanceObserver?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-font", "data-visual-style"],
    });

    window.addEventListener("resize", updatePlacement);
    document.fonts?.addEventListener("loadingdone", updatePlacement);

    let active = true;
    void document.fonts?.ready.then(() => {
      if (active) {
        updatePlacement();
      }
    });

    return () => {
      active = false;
      resizeObserver?.disconnect();
      appearanceObserver?.disconnect();
      window.removeEventListener("resize", updatePlacement);
      document.fonts?.removeEventListener("loadingdone", updatePlacement);
    };
  }, [moleculeUrl, title]);

  if (!hasTitle && !hasIdentification && !hasClassification && !hasSummary) {
    return null;
  }

  return (
    <div
      id="introduction"
      ref={heroRef}
      className="theme-article-hero relative scroll-mt-6 overflow-hidden rounded-2xl p-6 shadow-[var(--theme-elevation-2xl)] sm:p-8"
    >
      {/* Preview badge indicator (only shown in dev context) */}
      {showPreviewBadge && (
        <div className="type-chip-label theme-badge-surface absolute right-4 top-4 flex items-center gap-1.5 rounded-full px-2.5 py-1">
          <Icon icon="lucide:eye" size={12} />
          {t("Preview")}
        </div>
      )}
      {/* Molecule SVG - floated right on md+, moved below a title that needs its row */}
      {moleculeUrl && (!hasTitle || !moleculeBelowTitle) && (
        <DesktopMoleculeImage
          src={moleculeUrl}
          alt={moleculeAlt}
          placement="top"
        />
      )}

      {/* Title */}
      {hasTitle && (
        <h1
          ref={titleRef}
          data-hero-title-scale={titleFitPx === null ? "normal" : "fitted"}
          className="type-page-title theme-accent-heading text-4xl sm:text-5xl md:text-6xl"
          style={titleFitPx === null ? undefined : { fontSize: `${titleFitPx}px` }}
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
      {moleculeUrl && hasTitle && moleculeBelowTitle && (
        <DesktopMoleculeImage
          src={moleculeUrl}
          alt={moleculeAlt}
          placement="below-title"
        />
      )}



      {/* Stub status qualifies the whole article, so it sits with the title
          rather than below the hero. */}
      <ArticleStubBanner article={article} className="mt-4 type-reading-measure" />


      {/* Molecule SVG - centered below title on mobile only */}
      {moleculeUrl && (
        <div className="flex justify-center my-5 md:hidden">
          <MoleculeImage
            src={moleculeUrl}
            alt={moleculeAlt}
            width={288}
            height={288}
            priority
            sizes="(max-width: 767px) min(85vw, 18rem), 0px"
            className="theme-molecule-image h-auto w-72 max-w-[85%] object-contain drop-shadow-[0_8px_16px_color-mix(in_srgb,var(--theme-accent)_30%,transparent)]"
          />
        </div>
      )}

      {/* Substitutive name */}
      {identification.substitutive_name && (
        <div className="type-supporting-copy theme-text-secondary mt-3 flex items-start gap-3 type-reading-measure">
          <Icon icon="lucide:book-open-text" size={20} className="theme-icon-accent mt-0.5 flex-shrink-0" />
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
                  ariaLabel={namesExpanded ? t("Collapse alternative names") : t("Expand alternative names")}
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

      {/* Classification badges */}
      {hasClassification && (
        <div className="mt-6 space-y-4">
          {classification.psychoactive_class.length > 0 && (
            <div className="flex items-start gap-3">
              <Icon icon="lucide:brain-cog" size={20} className="theme-icon-accent mt-0.5 flex-shrink-0" />
              <div>
                <span className="type-meta-label theme-text-faint mb-2 block">
                  {t("Psychoactive Class")}
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
              <Icon icon="lucide:flask-conical" size={20} className="theme-icon-accent mt-0.5 flex-shrink-0" />
              <div>
                <span className="type-meta-label theme-text-faint mb-2 block">
                  {t("Chemical Class")}
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
                      {t(cls)}
                    </PublicNameChip>
                  ))}
                  {hasExpandableDetails && (
                    <ExpandButton
                      isExpanded={isExpanded}
                      onToggle={() => setIsExpanded(!isExpanded)}
                      label={t("Details")}
                      className="type-chip-label"
                      ariaLabel={isExpanded ? t("Collapse chemistry details") : t("Expand chemistry details")}
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
            <span className="theme-text-primary font-semibold">{t("Common name:")}</span>{" "}
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

      {/* Expandable chemistry details */}
      {isExpanded && hasExpandableDetails && (
        <div id={chemistryDetailsPanelId} className="numeric-tabular mt-3 space-y-1">
          {chemistryPresentation.identifiers.map((identifier) => (
            <p key={identifier.key} className="type-detail-copy theme-text-muted">
              <span className="theme-text-secondary font-semibold">{t(identifier.label)}:</span>{" "}
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
          {index_categories.map((cat) => {
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
                {t(cat)}
              </PublicNameChip>
            );
          })}
        </div>
      )}

      {/* Keep the summary in one citation pass. Splitting translated prose on
          whitespace can swallow an entire Chinese sentence and breaks marker
          suppression across the split. */}
      {hasSummary && (
        <EditableValue as="div" label="Summary" path="summary" value={summary}>
          <p
            className={`theme-article-hero-summary theme-text-primary mt-8 pt-6 text-sm leading-relaxed whitespace-pre-wrap break-words${
              moleculeUrl ? " theme-article-hero-summary--has-molecule" : ""
            }`}
          >
            <CitedText text={summary!} article={article} />
          </p>
        </EditableValue>
      )}
      {!hasSummary && (
        <EditableSlot
          className="mt-8"
          emptyLabel="Add a summary"
          label="Summary"
          path="summary"
          value={summary ?? ""}
        />
      )}

    </div>
  );
});
