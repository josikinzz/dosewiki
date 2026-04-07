import Link from "next/link";
import { memo, useEffect, useState } from "react";
import { AppImage } from "@/components/common/AppImage";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { badgeVariants } from "@/components/ui/badge";
import { getMoleculeUrlByTitle } from "@/data/mappings/moleculeAssets";
import { getCategoryIcon } from "@/data/config/categoryIcons";
import { cn } from "@/lib/utils";
import type { SubstanceArticle } from "@/schema";
import { isPlainLeftClick } from "@/utils/navigation";

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
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || label;
  return `/${type}/${slug}`;
}

interface HeroSectionProps {
  article: SubstanceArticle;
  /** Called when a category tag is clicked */
  onSelectCategory?: (categoryKey: string) => void;
  /** Called when a classification badge is clicked */
  onSelectClassification?: (type: "psychoactive" | "chemical", label: string) => void;
  /** Whether to show the "Preview" indicator badge (default: true in dev context) */
  showPreviewBadge?: boolean;
}

export const HeroSection = memo(function HeroSection({
  article,
  onSelectCategory,
  onSelectClassification,
  showPreviewBadge = true,
}: HeroSectionProps) {
  const { title, identification, classification, summary, index_categories } = article;

  const [isExpanded, setIsExpanded] = useState(false);
  const [namesExpanded, setNamesExpanded] = useState(false);
  const [moleculeUrl, setMoleculeUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    getMoleculeUrlByTitle(title)
      .then((url) => {
        if (isMounted) {
          setMoleculeUrl(url);
        }
      })
      .catch(() => {
        if (isMounted) {
          setMoleculeUrl(null);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [title]);

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

  // Check if there are expandable chemistry details
  const hasExpandableDetails =
    identification.iupac_name ||
    identification.cas_number ||
    identification.molecular_formula ||
    identification.molecular_weight ||
    identification.smiles ||
    identification.inchi_key;

  if (!hasTitle && !hasIdentification && !hasClassification && !hasSummary) {
    return null;
  }

  return (
    <div className="theme-article-hero relative overflow-hidden rounded-2xl border p-6 shadow-2xl ring-1 ring-white/5 sm:p-8">
      {/* Preview badge indicator (only shown in dev context) */}
      {showPreviewBadge && (
        <div className="type-chip-label absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-2.5 py-1 text-fuchsia-300">
          <Icon icon="lucide:eye" size={12} />
          Preview
        </div>
      )}

      {/* Molecule SVG - floated right on md+, hidden on mobile (shown below title instead) */}
      {moleculeUrl && (
        <AppImage
          src={moleculeUrl}
          alt={`${title} molecule structure`}
          width={256}
          height={256}
          className="theme-molecule-image hidden md:block md:float-right mb-3 h-48 w-48 object-contain drop-shadow-[0_8px_16px_rgba(192,132,252,0.3)] md:h-64 md:w-64"
        />
      )}

      {/* Title */}
      {hasTitle && (
        <h1 className="type-page-title theme-accent-heading max-w-[12ch]">{title}</h1>
      )}

      {/* Molecule SVG - centered below title on mobile only */}
      {moleculeUrl && (
        <div className="flex justify-center my-5 md:hidden">
          <AppImage
            src={moleculeUrl}
            alt={`${title} molecule structure`}
            width={288}
            height={288}
            className="theme-molecule-image h-auto w-72 max-w-[85%] object-contain drop-shadow-[0_8px_16px_rgba(192,132,252,0.3)]"
          />
        </div>
      )}

      {/* Substitutive name */}
      {identification.substitutive_name && (
        <div className="type-supporting-copy theme-text-secondary mt-3 flex items-start gap-3 type-reading-measure">
          <Icon icon="lucide:book-open-text" size={20} className="mt-0.5 flex-shrink-0 text-fuchsia-300" />
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
            <Icon icon="lucide:message-square-quote" size={20} className="mt-0.5 flex-shrink-0 text-fuchsia-300" />
            <span className="flex flex-wrap items-center gap-1">
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
                  className="type-chip-label ml-2 text-white/70 hover:text-white"
                  ariaLabel={namesExpanded ? "Collapse alternative names" : "Expand alternative names"}
                />
              )}
            </span>
          </div>
        );
      })()}

      {/* Botanical name */}
      {identification.botanical_name && (
        <div className="type-supporting-copy theme-text-secondary mt-3 flex items-start gap-3 type-reading-measure">
          <Icon icon="lucide:leaf" size={20} className="mt-0.5 flex-shrink-0 text-fuchsia-300" />
          <span className="italic">{identification.botanical_name}</span>
        </div>
      )}

      {/* Classification badges */}
      {hasClassification && (
        <div className="mt-6 space-y-4">
          {classification.psychoactive_class.length > 0 && (
            <div className="flex items-start gap-3">
              <Icon icon="lucide:brain-cog" size={20} className="mt-0.5 flex-shrink-0 text-fuchsia-300" />
              <div>
                <span className="type-meta-label mb-2 block text-white/58">
                  Psychoactive Class
                </span>
                <div className="flex flex-wrap gap-2">
                  {classification.psychoactive_class.map((cls) => {
                    const iconName = getCategoryIcon(getIconKeyFromClass(cls));
                    return (
                      <Link
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
                        className={cn(
                          badgeVariants({ variant: "ghostPill" }),
                          "gap-1.5 hover:bg-fuchsia-500/10 hover:text-white hover:border-fuchsia-500/30 transition-all",
                        )}
                      >
                        <Icon icon={iconName} size={14} />
                        {cls}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {classification.chemical_class.length > 0 && (
            <div className="flex items-start gap-3">
              <Icon icon="lucide:flask-conical" size={20} className="mt-0.5 flex-shrink-0 text-fuchsia-300" />
              <div>
                <span className="type-meta-label mb-2 block text-white/58">
                  Chemical Class
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {classification.chemical_class.map((cls) => (
                    <Link
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
                      className={cn(
                        badgeVariants({ variant: "ghostPill" }),
                        "gap-1.5 hover:bg-fuchsia-500/10 hover:text-white hover:border-fuchsia-500/30 transition-all",
                      )}
                    >
                      {cls}
                    </Link>
                  ))}
                  {hasExpandableDetails && (
                    <ExpandButton
                      isExpanded={isExpanded}
                      onToggle={() => setIsExpanded(!isExpanded)}
                      className="type-chip-label text-white/70 hover:text-white"
                      ariaLabel={isExpanded ? "Collapse chemistry details" : "Expand chemistry details"}
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
          <p className="type-detail-copy text-white/60">
            <span className="font-semibold text-white/70">Common name:</span>{" "}
            {identification.common_name}
          </p>
        </div>
      )}

      {/* Expandable chemistry details */}
      {isExpanded && hasExpandableDetails && (
        <div className="numeric-tabular mt-3 space-y-1">
          {identification.iupac_name && (
            <p className="type-detail-copy text-white/50">
              <span className="font-semibold text-white/60">IUPAC:</span>{" "}
              <span className="break-all font-mono text-xs">{identification.iupac_name}</span>
            </p>
          )}
          {identification.cas_number && (
            <p className="type-detail-copy text-white/50">
              <span className="font-semibold text-white/60">CAS:</span>{" "}
              {identification.cas_number}
            </p>
          )}
          {identification.molecular_formula && (
            <p className="type-detail-copy text-white/50">
              <span className="font-semibold text-white/60">Formula:</span>{" "}
              {identification.molecular_formula}
            </p>
          )}
          {identification.molecular_weight && (
            <p className="type-detail-copy text-white/50">
              <span className="font-semibold text-white/60">Molecular Weight:</span>{" "}
              {identification.molecular_weight.replace(/^Average:/, "").trim()}
            </p>
          )}
          {identification.smiles && (
            <p className="type-detail-copy text-white/50">
              <span className="font-semibold text-white/60">SMILES:</span>{" "}
              <code className="break-all rounded bg-white/5 px-1 py-0.5 font-mono text-xs text-white/60">
                {identification.smiles}
              </code>
            </p>
          )}
          {identification.inchi_key && (
            <p className="type-detail-copy text-white/50">
              <span className="font-semibold text-white/60">InChI Key:</span>{" "}
              <code className="break-all rounded bg-white/5 px-1 py-0.5 font-mono text-xs text-white/60">
                {identification.inchi_key}
              </code>
            </p>
          )}
        </div>
      )}

      {/* Index categories */}
      {hasCategories && (
        <div className="mt-5 flex flex-wrap gap-2">
          {index_categories.map((cat) => (
            <Link
              key={cat}
              href={`/category/${encodeURIComponent(cat)}`}
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
              className="type-chip-label inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
            >
              <Icon icon="lucide:tag" size={12} />
              {cat}
            </Link>
          ))}
        </div>
      )}

      {/* Summary */}
      {hasSummary && (
        <p className="mt-8 border-t border-white/[0.06] pt-6 text-sm leading-relaxed text-white/75 whitespace-pre-wrap">
          <strong className="font-semibold text-fuchsia-300">{summary!.split(/\s/)[0]}</strong>{" "}{summary!.slice(summary!.split(/\s/)[0].length).trimStart()}
        </p>
      )}

    </div>
  );
});
