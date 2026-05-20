import Link from "next/link";
import { memo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { SectionHeader } from "@/components/common/SectionHeader";
import { cn } from "@/lib/utils";
import type { SubstanceArticle } from "@/schema";
import { isPlainLeftClick } from "@/utils/navigation";
import { publicHref } from "@/utils/publicHref";
import { CitedText } from "../CitedText";
import { normalizePharmacologySection } from "../../../../../lib/article/normalization.js";

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

function getMechanismPath(base: string, qualifier?: string) {
  const baseSlug = mechanismToSlug(base);
  const qualifierSlug = qualifier ? mechanismToSlug(qualifier) : undefined;

  return {
    baseSlug,
    qualifierSlug,
    href: publicHref.mechanism(baseSlug, qualifierSlug),
  };
}

/** Parse metabolite strings like "Name (Abbreviation, active)" into structured data */
function parseMetabolite(raw: string): {
  name: string;
  abbreviation?: string;
  isActive?: boolean;
} {
  const match = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (!match) return { name: raw.trim() };

  const name = match[1].trim();
  const parenContent = match[2].trim();
  const parts = parenContent.split(/,\s*/);

  const isActive = parts.some((p) => /^active$/i.test(p.trim()));
  const isInactive = parts.some((p) => /^inactive$/i.test(p.trim()));
  const abbrevParts = parts.filter(
    (p) => !/^(active|inactive)$/i.test(p.trim()),
  );
  const abbreviation =
    abbrevParts.length > 0 ? abbrevParts.join(", ") : undefined;

  return {
    name,
    abbreviation: abbreviation || undefined,
    isActive: isActive ? true : isInactive ? false : undefined,
  };
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
  const [isReceptorProfileExpanded, setIsReceptorProfileExpanded] = useState(false);
  const [isMetabolitesExpanded, setIsMetabolitesExpanded] = useState(false);
  const pharmacology = normalizePharmacologySection(article.pharmacology);

  const pharmacodynamicsText = pharmacology.pharmacodynamics?.trim().length > 0
    ? pharmacology.pharmacodynamics
    : pharmacology.summary ?? "";
  const hasSummary = pharmacodynamicsText.trim().length > 0;
  const hasReceptorProfile = pharmacology.receptor_profile?.length > 0;
  const hasPharmacokinetics = pharmacology.pharmacokinetics?.trim().length > 0;
  const hasMetabolites = pharmacology.metabolites?.length > 0;
  const summaryParagraphs = hasSummary
    ? pharmacodynamicsText
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
                <p key={idx}><CitedText text={paragraph} article={article} /></p>
              ))}
            </div>
          )}

          <AnimatePresence>
            {hasReceptorProfile && isReceptorProfileExpanded && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <h4 className="mb-3 flex items-center gap-2 font-semibold text-white">
                    <Icon icon="lucide:cog" size={20} className="text-fuchsia-200" />
                    Receptor Profile
                  </h4>
                  <div className="space-y-1">
                    {pharmacology.receptor_profile.map((entry, idx) => {
                      const tag = entry.tag;
                      const { base, qualifier } = tag
                        ? parseMechanismEntry(tag)
                        : { base: entry.receptor, qualifier: undefined };
                      const mechanismLink = tag ? getMechanismPath(base, qualifier) : undefined;

                      const nameContent = (
                        <>
                          {base}
                          {qualifier && (
                            <span className="rounded-full bg-fuchsia-500/20 px-1.5 py-0.5 text-[10px] font-medium text-fuchsia-300">
                              {qualifier}
                            </span>
                          )}
                        </>
                      );

                      return (
                        <div
                          key={idx}
                          className={cn(
                            "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm",
                            idx % 2 === 1 && "bg-white/5",
                          )}
                        >
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            {mechanismLink ? (
                              <Link
                                href={mechanismLink.href}
                                className="flex flex-wrap items-center gap-1.5 font-medium text-white/90 transition-colors hover:text-fuchsia-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                                onClick={(event) => {
                                  if (!onSelectMechanism || !isPlainLeftClick(event)) {
                                    return;
                                  }
                                  event.preventDefault();
                                  onSelectMechanism(mechanismLink.baseSlug, mechanismLink.qualifierSlug);
                                }}
                              >
                                {nameContent}
                              </Link>
                            ) : (
                              <span className="flex flex-wrap items-center gap-1.5 font-medium text-white/90">
                                {nameContent}
                              </span>
                            )}
                          </div>
                          {(entry.affinity || entry.efficacy) && (
                            <div className="flex shrink-0 flex-col items-end gap-0.5">
                              {entry.affinity && (
                                <span className="font-mono text-xs text-white/50">
                                  {entry.affinity}
                                </span>
                              )}
                              {entry.efficacy && (
                                <span className="text-xs text-white/40">
                                  {entry.efficacy}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {hasReceptorProfile && (
            <div className="flex justify-center pt-1.5">
              <ExpandButton
                isExpanded={isReceptorProfileExpanded}
                onToggle={() => setIsReceptorProfileExpanded((expanded) => !expanded)}
                label="Receptor Profile"
                ariaLabel={isReceptorProfileExpanded ? "Collapse receptor profile" : "Expand receptor profile"}
              />
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
              <p><CitedText text={pharmacology.pharmacokinetics} article={article} /></p>
            </div>
          )}

          <AnimatePresence>
            {hasMetabolites && isMetabolitesExpanded && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <h4 className="mb-3 flex items-center gap-2 font-semibold text-white">
                    <Icon icon="lucide:flask-conical" size={20} className="text-fuchsia-200" />
                    Metabolites
                  </h4>
                  <div className="space-y-1">
                    {pharmacology.metabolites.map((met, idx) => {
                      const parsed = parseMetabolite(met);
                      return (
                        <div
                          key={idx}
                          className={cn(
                            "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm",
                            idx % 2 === 1 && "bg-white/5",
                          )}
                        >
                          <span className="min-w-0 text-white/80">
                            {parsed.name}
                          </span>
                          {(parsed.abbreviation ||
                            parsed.isActive !== undefined) && (
                            <div className="flex shrink-0 items-center gap-2">
                              {parsed.abbreviation && (
                                <span className="font-mono text-xs text-white/45">
                                  {parsed.abbreviation}
                                </span>
                              )}
                              {parsed.isActive === true && (
                                <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                                  active
                                </span>
                              )}
                              {parsed.isActive === false && (
                                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/50">
                                  inactive
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {hasMetabolites && (
            <div className="flex justify-center pt-1.5">
              <ExpandButton
                isExpanded={isMetabolitesExpanded}
                onToggle={() => setIsMetabolitesExpanded((expanded) => !expanded)}
                label="Metabolites"
                ariaLabel={isMetabolitesExpanded ? "Collapse metabolites" : "Expand metabolites"}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
});
