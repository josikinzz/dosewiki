import { memo, useState } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { SectionHeader } from "@/components/common/SectionHeader";
import type { SubstanceArticle } from "@/schema";

// Convert mechanism text to slug for navigation
function mechanismToSlug(moa: string): string {
  return moa.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Parse mechanism entry to extract base name and optional qualifier
function parseMechanismEntry(entry: string): { base: string; qualifier?: string } {
  const match = entry.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (match) {
    const base = match[1].trim();
    const qualifier = match[2]?.trim();
    if (base.length > 0) {
      return {
        base,
        qualifier: qualifier && qualifier.length > 0 ? qualifier : undefined,
      };
    }
  }
  return { base: entry.trim() };
}

interface PharmacologySectionProps {
  article: SubstanceArticle;
  /** Called when a mechanism of action is clicked */
  onSelectMechanism?: (slug: string, qualifier?: string) => void;
}

export const PharmacologySection = memo(function PharmacologySection({
  article,
  onSelectMechanism,
}: PharmacologySectionProps) {
  const [isMetabolitesExpanded, setIsMetabolitesExpanded] = useState(false);
  const { pharmacology } = article;

  const hasSummary = pharmacology.summary?.trim().length > 0;
  const hasReceptorProfile = pharmacology.receptor_profile?.length > 0;
  const hasPharmacokinetics = pharmacology.pharmacokinetics?.trim().length > 0;
  const hasMetabolites = pharmacology.metabolites?.length > 0;
  const summaryParagraphs = hasSummary
    ? pharmacology.summary
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
    : [];
  const hasPharmacodynamics = hasSummary || hasReceptorProfile;
  const hasPharmacokineticsBlock = hasPharmacokinetics || hasMetabolites;

  const hasAnyContent =
    hasSummary || hasReceptorProfile || hasPharmacokinetics || hasMetabolites;

  if (!hasAnyContent) {
    return null;
  }

  return (
    <div id="pharmacology" className="space-y-6 pt-12 scroll-mt-6">
      <SectionHeader icon="mingcute:settings-6-line" title="Pharmacology" />

      {hasPharmacodynamics && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Icon icon="lucide:brain-circuit" size={18} className="text-fuchsia-200" />
            <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-white/45">
              Pharmacodynamics
            </h3>
          </div>

          {hasSummary && (
            <div className="space-y-3 text-sm leading-relaxed text-white/80">
              {summaryParagraphs.map((paragraph, idx) => (
                <p key={idx}>{paragraph}</p>
              ))}
            </div>
          )}

          {hasReceptorProfile && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 scale-100 transition-all duration-200 hover:scale-[1.02] hover:bg-white/10 hover:border-white/20 hover:shadow-lg hover:shadow-black/20">
              <h4 className="mb-3 flex items-center gap-2 font-semibold text-white">
                <Icon icon="lucide:cog" size={20} className="text-fuchsia-200" />
                Receptor Profile
              </h4>
              <ul className="space-y-2">
                {pharmacology.receptor_profile.map((entry, idx) => {
                  const tag = entry.tag;
                  const { base, qualifier } = tag
                    ? parseMechanismEntry(tag)
                    : { base: entry.receptor, qualifier: undefined };
                  const detailItems = [entry.affinity, entry.efficacy].filter(Boolean);

                  return (
                    <li key={idx} className="flex gap-2 text-sm text-white/80">
                      <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-fuchsia-400" />
                      <div className="min-w-0 flex-1">
                        {onSelectMechanism && tag ? (
                          <button
                            type="button"
                            className="flex flex-wrap items-center gap-1.5 text-left transition-colors hover:text-fuchsia-300"
                            onClick={() => onSelectMechanism(mechanismToSlug(tag))}
                          >
                            {base}
                            {qualifier && (
                              <span className="rounded-full bg-fuchsia-500/20 px-1.5 py-0.5 text-[10px] font-medium text-fuchsia-300">
                                {qualifier}
                              </span>
                            )}
                          </button>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {base}
                            {qualifier && (
                              <span className="rounded-full bg-fuchsia-500/20 px-1.5 py-0.5 text-[10px] font-medium text-fuchsia-300">
                                {qualifier}
                              </span>
                            )}
                          </div>
                        )}

                        {detailItems.length > 0 && (
                          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-white/55 marker:text-white/35">
                            {detailItems.map((detail, detailIdx) => (
                              <li key={detailIdx} className="leading-relaxed">
                                {detail}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {hasPharmacokineticsBlock && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Icon icon="material-symbols:metabolism-rounded" size={18} className="text-fuchsia-200" />
            <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-white/45">
              Pharmacokinetics
            </h3>
          </div>

          {hasPharmacokinetics && (
            <div className="space-y-3 text-sm leading-relaxed text-white/80">
              <p>{pharmacology.pharmacokinetics}</p>
            </div>
          )}

          {hasMetabolites && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 scale-100 transition-all duration-200 hover:scale-[1.02] hover:bg-white/10 hover:border-white/20 hover:shadow-lg hover:shadow-black/20">
              <h4 className="mb-3 flex items-center gap-2 font-semibold text-white">
                <Icon icon="lucide:flask-conical" size={20} className="text-fuchsia-200" />
                Metabolites
              </h4>

              {isMetabolitesExpanded && (
                <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                  <ul className="list-disc space-y-2.5 pl-5 marker:text-fuchsia-300">
                    {pharmacology.metabolites.map((met, idx) => (
                      <li key={idx} className="text-sm leading-relaxed text-white/75">
                        {met}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className={`flex justify-center ${isMetabolitesExpanded ? "mt-4" : ""}`}>
                <ExpandButton
                  isExpanded={isMetabolitesExpanded}
                  onToggle={() => setIsMetabolitesExpanded((expanded) => !expanded)}
                />
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
});
