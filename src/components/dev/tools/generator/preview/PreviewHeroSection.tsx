import { memo, useMemo } from "react";
import { Eye, FlaskConical, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import moleculeMappings from "@/data/mappings/moleculeSvgMappings.json";
import type { GeneratedArticle } from "../../../../../types/generatorSchema";

interface PreviewHeroSectionProps {
  article: GeneratedArticle;
}

// Get molecule URL by matching article title
function getMoleculeUrl(title: string): string | null {
  if (!title.trim()) return null;
  const normalizedTitle = title.toLowerCase().trim();
  const match = moleculeMappings.mappings.find(
    (m) => m.articleTitle.toLowerCase() === normalizedTitle
  );
  return match ? `/molecules/${encodeURI(match.filename)}` : null;
}

export const PreviewHeroSection = memo(function PreviewHeroSection({
  article,
}: PreviewHeroSectionProps) {
  const { title, identification, classification, summary, index_categories } = article;

  const moleculeUrl = useMemo(() => getMoleculeUrl(title), [title]);

  const hasTitle = title.trim().length > 0;
  const hasIdentification =
    identification.common_name ||
    identification.substitutive_name ||
    identification.iupac_name ||
    identification.smiles;
  const hasClassification =
    classification.psychoactive_class.length > 0 ||
    classification.chemical_class.length > 0;
  const hasSummary = summary.trim().length > 0;
  const hasCategories = index_categories.length > 0;

  if (!hasTitle && !hasIdentification && !hasClassification && !hasSummary) {
    return null;
  }

  return (
    <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-950/40 via-purple-950/30 to-slate-950/50 p-6 shadow-lg">
      {/* Preview badge indicator */}
      <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-2.5 py-1 text-xs text-fuchsia-300">
        <Eye className="h-3 w-3" />
        Preview
      </div>

      {/* Molecule SVG - floated right for text wrapping */}
      {moleculeUrl && (
        <img
          src={moleculeUrl}
          alt={`${title} molecule structure`}
          className="float-right ml-6 mb-3 h-40 w-40 object-contain drop-shadow-[0_8px_16px_rgba(192,132,252,0.3)] md:h-56 md:w-56"
        />
      )}

      {/* Title */}
      {hasTitle && (
        <h1 className="text-3xl font-bold text-white">{title}</h1>
      )}

      {/* Identification details */}
      {hasIdentification && (
        <div className="mt-4 space-y-1.5">
          {identification.common_name && identification.common_name !== title && (
            <p className="text-sm text-white/60">
              <span className="font-medium text-white/80">Common name:</span>{" "}
              {identification.common_name}
            </p>
          )}
          {identification.substitutive_name && (
            <p className="text-sm text-white/60">
              <span className="font-medium text-white/80">Substitutive name:</span>{" "}
              {identification.substitutive_name}
            </p>
          )}
          {identification.iupac_name && (
            <p className="text-sm text-white/60">
              <span className="font-medium text-white/80">IUPAC:</span>{" "}
              <span className="font-mono text-xs">{identification.iupac_name}</span>
            </p>
          )}
          {identification.cas_number && (
            <p className="text-sm text-white/60">
              <span className="font-medium text-white/80">CAS:</span>{" "}
              {identification.cas_number}
            </p>
          )}
          {identification.alternative_names && identification.alternative_names.length > 0 && (
            <p className="text-sm text-white/60">
              <span className="font-medium text-white/80">Also known as:</span>{" "}
              {identification.alternative_names.join(", ")}
            </p>
          )}
          {identification.molecular_formula && (
            <p className="text-sm text-white/60">
              <span className="font-medium text-white/80">Formula:</span>{" "}
              {identification.molecular_formula}
              {identification.molecular_weight && (
                <span className="ml-2 text-white/40">({identification.molecular_weight})</span>
              )}
            </p>
          )}
          {identification.smiles && (
            <p className="text-sm text-white/60">
              <span className="font-medium text-white/80">SMILES:</span>{" "}
              <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-white/70">
                {identification.smiles}
              </code>
            </p>
          )}
          {identification.inchi_key && (
            <p className="text-sm text-white/60">
              <span className="font-medium text-white/80">InChI Key:</span>{" "}
              <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-white/70">
                {identification.inchi_key}
              </code>
            </p>
          )}
        </div>
      )}

      {/* Classification badges */}
      {hasClassification && (
        <div className="mt-5 flex flex-wrap gap-2">
          {classification.psychoactive_class.map((cls) => (
            <Badge key={cls} variant="secondary" className="gap-1.5">
              <FlaskConical className="h-3 w-3" />
              {cls}
            </Badge>
          ))}
          {classification.chemical_class.map((cls) => (
            <Badge key={cls} variant="outline" className="gap-1.5">
              {cls}
            </Badge>
          ))}
        </div>
      )}

      {/* Index categories */}
      {hasCategories && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {index_categories.map((cat) => (
            <span
              key={cat}
              className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-xs text-white/50"
            >
              <Tag className="h-2.5 w-2.5" />
              {cat}
            </span>
          ))}
        </div>
      )}

      {/* Summary */}
      {hasSummary && (
        <p className="mt-5 text-sm leading-relaxed text-white/80">{summary}</p>
      )}
    </div>
  );
});
