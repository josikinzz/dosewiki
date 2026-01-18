import { memo, useEffect, useState } from "react";
import { Icon } from "../common/Icon";
import { Badge } from "@/components/ui/badge";
import { getMoleculeUrlByTitle } from "@/data/mappings/moleculeAssets";
import { getCategoryIcon } from "@/data/config/categoryIcons";
import type { SubstanceArticle } from "../../schema";

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
    <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-950/40 via-purple-950/30 to-slate-950/50 p-6 shadow-lg">
      {/* Preview badge indicator (only shown in dev context) */}
      {showPreviewBadge && (
        <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-2.5 py-1 text-xs text-fuchsia-300">
          <Icon icon="lucide:eye" size={12} />
          Preview
        </div>
      )}

      {/* Molecule SVG - floated right on md+, hidden on mobile (shown below title instead) */}
      {moleculeUrl && (
        <img
          src={moleculeUrl}
          alt={`${title} molecule structure`}
          className="hidden md:block md:float-right mb-3 h-48 w-48 object-contain drop-shadow-[0_8px_16px_rgba(192,132,252,0.3)] md:h-64 md:w-64"
        />
      )}

      {/* Title */}
      {hasTitle && (
        <h1 className="font-display text-[2.25rem] font-bold tracking-tight text-fuchsia-300 sm:text-[2.7rem]">{title}</h1>
      )}

      {/* Molecule SVG - centered below title on mobile only */}
      {moleculeUrl && (
        <div className="flex justify-center my-5 md:hidden">
          <img
            src={moleculeUrl}
            alt={`${title} molecule structure`}
            className="h-auto w-72 max-w-[85%] object-contain drop-shadow-[0_8px_16px_rgba(192,132,252,0.3)]"
          />
        </div>
      )}

      {/* Substitutive name */}
      {identification.substitutive_name && (
        <div className="mt-3 flex items-start gap-3 text-base text-white/60">
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
          <div className="mt-3 flex items-start gap-3 text-base text-white/60">
            <Icon icon="lucide:message-square-quote" size={20} className="mt-0.5 flex-shrink-0 text-fuchsia-300" />
            <span className="flex flex-wrap items-center gap-1">
              {visibleNames.map((name, index) => (
                <span key={`name-${name}-${index}`}>
                  {name}
                  {index < visibleNames.length - 1 ? ", " : ""}
                </span>
              ))}
              {hasMore && (
                <button
                  type="button"
                  onClick={() => setNamesExpanded(!namesExpanded)}
                  className="ml-1 inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-white/60 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white/80"
                >
                  <Icon icon="lucide:ellipsis" size={12} />
                  <Icon icon="lucide:chevron-down" size={12} className={`transition-transform ${namesExpanded ? "rotate-180" : ""}`} />
                </button>
              )}
            </span>
          </div>
        );
      })()}

      {/* Botanical name */}
      {identification.botanical_name && (
        <div className="mt-3 flex items-start gap-3 text-base text-white/60">
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
                <span className="mb-2 block text-sm font-medium uppercase tracking-wider text-white/50">
                  Psychoactive Class
                </span>
                <div className="flex flex-wrap gap-2">
                  {classification.psychoactive_class.map((cls) => {
                    const iconName = getCategoryIcon(getIconKeyFromClass(cls));
                    return (
                      <Badge
                        key={cls}
                        variant="secondary"
                        className={`gap-1.5 ${onSelectClassification ? "cursor-pointer hover:bg-fuchsia-500/30 transition-colors" : ""}`}
                        onClick={onSelectClassification ? () => onSelectClassification("psychoactive", cls) : undefined}
                      >
                        <Icon icon={iconName} size={14} />
                        {cls}
                      </Badge>
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
                <span className="mb-2 block text-sm font-medium uppercase tracking-wider text-white/50">
                  Chemical Class
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {classification.chemical_class.map((cls) => (
                    <Badge
                      key={cls}
                      variant="secondary"
                      className={onSelectClassification ? "cursor-pointer hover:bg-fuchsia-500/30 transition-colors" : ""}
                      onClick={onSelectClassification ? () => onSelectClassification("chemical", cls) : undefined}
                    >
                      {cls}
                    </Badge>
                  ))}
                  {hasExpandableDetails && (
                    <button
                      type="button"
                      onClick={() => setIsExpanded(!isExpanded)}
                      className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-white/60 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white/80"
                    >
                      <Icon icon="lucide:ellipsis" size={12} />
                      <Icon icon="lucide:chevron-down" size={12} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </button>
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
          <p className="text-sm text-white/60">
            <span className="font-semibold text-white/70">Common name:</span>{" "}
            {identification.common_name}
          </p>
        </div>
      )}

      {/* Expandable chemistry details */}
      {isExpanded && hasExpandableDetails && (
        <div className="mt-3 space-y-1">
          {identification.iupac_name && (
            <p className="text-sm text-white/50">
              <span className="font-semibold text-white/60">IUPAC:</span>{" "}
              <span className="break-all font-mono text-xs">{identification.iupac_name}</span>
            </p>
          )}
          {identification.cas_number && (
            <p className="text-sm text-white/50">
              <span className="font-semibold text-white/60">CAS:</span>{" "}
              {identification.cas_number}
            </p>
          )}
          {identification.molecular_formula && (
            <p className="text-sm text-white/50">
              <span className="font-semibold text-white/60">Formula:</span>{" "}
              {identification.molecular_formula}
            </p>
          )}
          {identification.molecular_weight && (
            <p className="text-sm text-white/50">
              <span className="font-semibold text-white/60">Molecular Weight:</span>{" "}
              {identification.molecular_weight.replace(/^Average:/, "").trim()}
            </p>
          )}
          {identification.smiles && (
            <p className="text-sm text-white/50">
              <span className="font-semibold text-white/60">SMILES:</span>{" "}
              <code className="break-all rounded bg-white/5 px-1 py-0.5 font-mono text-xs text-white/60">
                {identification.smiles}
              </code>
            </p>
          )}
          {identification.inchi_key && (
            <p className="text-sm text-white/50">
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
            onSelectCategory ? (
              <button
                key={cat}
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/50 transition-colors hover:bg-white/10 hover:text-white/70"
                onClick={() => onSelectCategory(cat)}
              >
                <Icon icon="lucide:tag" size={12} />
                {cat}
              </button>
            ) : (
              <span
                key={cat}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/50"
              >
                <Icon icon="lucide:tag" size={12} />
                {cat}
              </span>
            )
          ))}
        </div>
      )}

      {/* Summary */}
      {hasSummary && (
        <p className="mt-6 text-base leading-relaxed text-white/80">{summary}</p>
      )}

    </div>
  );
});
