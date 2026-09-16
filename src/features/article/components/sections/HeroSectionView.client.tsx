"use client";

import { SmartLink } from "@/components/common/SmartLink";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MoleculeImage } from "@/components/pages/MoleculeImage";
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
import {
  READER_LEADING_PROPERTY,
  READER_TRACKING_PROPERTY,
  TEXT_SIZE_PROPERTY,
} from "@/theme/appearanceTypography";
import { EditableSlot, EditableValue } from "../../editing";

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

function getClassificationHref(
  type: "psychoactive" | "chemical",
  label: string,
) {
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
  /** Called when a category tag is clicked */
  onSelectCategory?: (categoryKey: string) => void;
  /** Called when a classification badge is clicked */
  onSelectClassification?: (
    type: "psychoactive" | "chemical",
    label: string,
  ) => void;
  /** Canonical public category keys; omitted in editor previews that own navigation. */
  linkableCategoryKeys?: readonly string[];
  /** Whether to show the "Preview" indicator badge (default: true in dev context) */
  showPreviewBadge?: boolean;
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
}: HeroSectionViewProps) {
  const t = useT();
  const moleculeAlt = chemistryPresentation.molecule.hasLookupTitle
    ? t(MOLECULE_ALT_MESSAGE, {
        title: chemistryPresentation.molecule.lookupTitle,
      })
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
  const hasCategories = indexCategories.length > 0;
  const hasExpandableDetails = chemistryPresentation.hasIdentifiers;

  useIsomorphicLayoutEffect(() => {
    const heroElement = heroRef.current;
    const titleElement = titleRef.current;

    if (!heroElement || !titleElement) {
      return;
    }

    let frameId: number | null = null;
    const measurePlacement = () => {
      frameId = null;
      const heroRect = heroElement.getBoundingClientRect();
      if (heroRect.width === 0) return;

      const heroStyle = getComputedStyle(heroElement);
      const borderRightWidth =
        Number.parseFloat(heroStyle.borderRightWidth) || 0;
      const paddingRight = Number.parseFloat(heroStyle.paddingRight) || 0;
      const contentRight = heroRect.right - borderRightWidth - paddingRight;
      const moleculeLeft = contentRight - 256;

      // Measure the title once at its natural single-line size. Restoring both
      // overrides before state updates keeps ResizeObserver from feeding the
      // fitted result back into another synchronous fitting loop.
      const previousWhiteSpace = titleElement.style.whiteSpace;
      const previousFontSize = titleElement.style.fontSize;
      titleElement.style.whiteSpace = "nowrap";
      titleElement.style.fontSize = "";
      const naturalFontSize =
        Number.parseFloat(getComputedStyle(titleElement).fontSize) || 0;
      const titleRange = document.createRange();
      titleRange.selectNodeContents(titleElement);
      const titleRect = titleRange.getBoundingClientRect();
      titleElement.style.fontSize = "var(--type-size-section)";
      const minFontSize =
        Number.parseFloat(getComputedStyle(titleElement).fontSize) || 0;
      titleElement.style.whiteSpace = previousWhiteSpace;
      titleElement.style.fontSize = previousFontSize;

      if (moleculeUrl) {
        const nextBelowTitle =
          titleRect.right > moleculeLeft - TITLE_MOLECULE_GAP_PX;
        setMoleculeBelowTitle((current) =>
          current === nextBelowTitle ? current : nextBelowTitle,
        );
      }

      const isDesktop =
        typeof window.matchMedia !== "function" ||
        window.matchMedia("(min-width: 768px)").matches;
      const availableWidth = contentRight - titleRect.left;
      const overflows = titleRect.width > availableWidth;
      let nextTitleFitPx: number | null = null;
      if (
        !isDesktop &&
        overflows &&
        titleRect.width > 0 &&
        naturalFontSize > 0
      ) {
        const fitted = naturalFontSize * (availableWidth / titleRect.width);
        const fittedFloor = Math.floor(fitted * 4) / 4;
        nextTitleFitPx = Math.max(minFontSize, fittedFloor);
      }
      setTitleFitPx((current) =>
        current === nextTitleFitPx ? current : nextTitleFitPx,
      );
    };
    const scheduleMeasurement = () => {
      if (frameId === null) {
        frameId = window.requestAnimationFrame(measurePlacement);
      }
    };

    // The layout effect retains the pre-paint initial fit while every later
    // signal is coalesced to at most one measurement per animation frame.
    measurePlacement();

    // Only the hero's own width is an input. The title's box is this effect's
    // output: measuring rewrites its font size, so observing the title would
    // report that write back and fit forever. Width-only comparison also
    // drops the height changes a finished fit causes.
    let lastWidth = heroElement.getBoundingClientRect().width;
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width;
            if (width === undefined || width === lastWidth) return;
            lastWidth = width;
            scheduleMeasurement();
          });
    resizeObserver?.observe(heroElement);

    const rootStyle = document.documentElement.style;
    let textScale = rootStyle.getPropertyValue(TEXT_SIZE_PROPERTY);
    let tracking = rootStyle.getPropertyValue(READER_TRACKING_PROPERTY);
    let leading = rootStyle.getPropertyValue(READER_LEADING_PROPERTY);
    const appearanceObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver((records) => {
            const nextTextScale =
              rootStyle.getPropertyValue(TEXT_SIZE_PROPERTY);
            const nextTracking = rootStyle.getPropertyValue(
              READER_TRACKING_PROPERTY,
            );
            const nextLeading = rootStyle.getPropertyValue(
              READER_LEADING_PROPERTY,
            );
            const typographyChanged =
              nextTextScale !== textScale ||
              nextTracking !== tracking ||
              nextLeading !== leading;
            textScale = nextTextScale;
            tracking = nextTracking;
            leading = nextLeading;
            if (
              typographyChanged ||
              records.some((record) => record.attributeName !== "style")
            ) {
              scheduleMeasurement();
            }
          });
    appearanceObserver?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [
        "style",
        "data-font",
        "data-reader-leading",
        "data-theme",
        "data-visual-style",
      ],
    });

    window.addEventListener("resize", scheduleMeasurement);
    document.fonts?.addEventListener("loadingdone", scheduleMeasurement);

    let active = true;
    void document.fonts?.ready.then(() => {
      if (active) scheduleMeasurement();
    });

    return () => {
      active = false;
      resizeObserver?.disconnect();
      appearanceObserver?.disconnect();
      window.removeEventListener("resize", scheduleMeasurement);
      document.fonts?.removeEventListener("loadingdone", scheduleMeasurement);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
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
      {moleculeUrl && hasTitle && moleculeBelowTitle && (
        <DesktopMoleculeImage
          src={moleculeUrl}
          alt={moleculeAlt}
          placement="below-title"
        />
      )}

      {stubBanner}

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

      {/* Alternative names - directly under title */}
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
              </span>
            </div>
          );
        })()}

      {/* Botanical name */}
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

      {/* Classification badges */}
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

      {/* Identification details - always visible */}
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

      {/* Expandable chemistry details */}
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

      {/* Keep the summary in one citation pass. Splitting translated prose on
          whitespace can swallow an entire Chinese sentence and breaks marker
          suppression across the split. */}
      {summaryContent}
    </div>
  );
});
