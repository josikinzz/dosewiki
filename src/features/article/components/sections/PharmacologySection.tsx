"use client";

import Link from "next/link";
import { memo } from "react";
import { ExpandableList } from "@/components/common/ArticleExpandable";
import { Icon, type IconName } from "@/components/common/Icon";
import { cn } from "@/lib/utils";
import type { SubstanceArticle } from "@/schema";
import { isPlainLeftClick } from "@/utils/navigation";
import { publicHref } from "@/utils/publicHref";
import { ArticleText } from "../CitedText";
import { ArticleSection } from "@/components/common/ArticleSection";
import { normalizePharmacologySection } from "../../../../../lib/article/normalization.js";

// Convert mechanism text to slug for navigation
function mechanismToSlug(moa: string): string {
  return moa
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Parse mechanism entry to extract base name and optional qualifier
function parseMechanismEntry(entry: string): {
  base: string;
  qualifier?: string;
} {
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

function CollapsedPharmacologyToggle({
  icon,
  title,
}: {
  icon: IconName;
  title: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 pr-0.5 text-xs font-semibold uppercase tracking-wide theme-text-primary">
      <Icon icon={icon} size={15} className="shrink-0 theme-icon-muted" />
      <span className="min-w-0">{title}</span>
    </span>
  );
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
  const pharmacology = normalizePharmacologySection(article.pharmacology);

  const pharmacodynamicsText =
    pharmacology.pharmacodynamics?.trim().length > 0
      ? pharmacology.pharmacodynamics
      : (pharmacology.summary ?? "");
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
    <ArticleSection
      id="pharmacology"
      icon="mingcute:settings-6-line"
      heading="Pharmacology"
    >
      {hasPharmacodynamics && (
        <ArticleSection.Group
          icon="lucide:brain-circuit"
          heading="Pharmacodynamics"
        >
          {hasSummary && (
            <div className="space-y-3">
              {summaryParagraphs.map((paragraph, idx) => (
                <ArticleText key={idx} text={paragraph} article={article} />
              ))}
            </div>
          )}

          {hasReceptorProfile && (
            <ExpandableList
              ariaLabelBase="receptor profile"
              defaultExpanded={false}
              collapsedCount={pharmacology.receptor_profile.length}
              items={pharmacology.receptor_profile}
              className="space-y-3"
              collapsedToggleContent={
                <CollapsedPharmacologyToggle
                  icon="lucide:cog"
                  title="Receptor Profile"
                />
              }
              toggleButtonClassName={({ isExpanded }) =>
                isExpanded ? undefined : "gap-2 px-3.5 py-1.5"
              }
              toggleClassName="pt-1.5"
            >
              {({ isExpanded, items }) => {
                if (!isExpanded) {
                  return null;
                }

                return (
                  <ArticleSection.InfoCard
                    icon="lucide:cog"
                    title="Receptor Profile"
                    variant="subtle"
                    padding="sm"
                    contentClassName="space-y-1"
                  >
                    {items.map((entry, idx) => {
                      const tag = entry.tag;
                      const { base, qualifier } = tag
                        ? parseMechanismEntry(tag)
                        : { base: entry.receptor, qualifier: undefined };
                      const mechanismLink = tag
                        ? getMechanismPath(base, qualifier)
                        : undefined;

                      const nameContent = (
                        <>
                          {base}
                          {qualifier && (
                            <span className="rounded-full bg-fuchsia-500/20 px-1.5 py-0.5 text-[10px] font-medium theme-accent-emphasis">
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
                            idx % 2 === 1 && "theme-article-subsection-card",
                          )}
                        >
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            {mechanismLink ? (
                              <Link
                                href={mechanismLink.href}
                                className="flex flex-wrap items-center gap-1.5 font-medium theme-text-primary transition-colors  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                                onClick={(event) => {
                                  if (
                                    !onSelectMechanism ||
                                    !isPlainLeftClick(event)
                                  ) {
                                    return;
                                  }
                                  event.preventDefault();
                                  onSelectMechanism(
                                    mechanismLink.baseSlug,
                                    mechanismLink.qualifierSlug,
                                  );
                                }}
                              >
                                {nameContent}
                              </Link>
                            ) : (
                              <span className="flex flex-wrap items-center gap-1.5 font-medium theme-text-primary">
                                {nameContent}
                              </span>
                            )}
                          </div>
                          {(entry.affinity || entry.efficacy) && (
                            <div className="flex shrink-0 flex-col items-end gap-0.5">
                              {entry.affinity && (
                                <span className="font-mono text-xs theme-text-faint">
                                  {entry.affinity}
                                </span>
                              )}
                              {entry.efficacy && (
                                <span className="text-xs theme-text-faint">
                                  {entry.efficacy}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </ArticleSection.InfoCard>
                );
              }}
            </ExpandableList>
          )}
        </ArticleSection.Group>
      )}

      {hasPharmacokineticsBlock && (
        <ArticleSection.Group
          icon="material-symbols:metabolism-rounded"
          heading="Pharmacokinetics"
        >
          {hasPharmacokinetics && (
            <ArticleText
              text={pharmacology.pharmacokinetics}
              article={article}
            />
          )}

          {hasMetabolites && (
            <ExpandableList
              ariaLabelBase="metabolites"
              defaultExpanded={false}
              collapsedCount={pharmacology.metabolites.length}
              items={pharmacology.metabolites}
              className="space-y-3"
              collapsedToggleContent={
                <CollapsedPharmacologyToggle
                  icon="lucide:flask-conical"
                  title="Metabolites"
                />
              }
              toggleButtonClassName={({ isExpanded }) =>
                isExpanded ? undefined : "gap-2 px-3.5 py-1.5"
              }
              toggleClassName="pt-1.5"
            >
              {({ isExpanded, items }) => {
                if (!isExpanded) {
                  return null;
                }

                return (
                  <ArticleSection.InfoCard
                    icon="lucide:flask-conical"
                    title="Metabolites"
                    variant="subtle"
                    padding="sm"
                    contentClassName="space-y-1"
                  >
                    {items.map((met, idx) => {
                      const parsed = parseMetabolite(met);
                      return (
                        <div
                          key={idx}
                          className={cn(
                            "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm",
                            idx % 2 === 1 && "theme-article-subsection-card",
                          )}
                        >
                          <span className="min-w-0 theme-text-secondary">
                            {parsed.name}
                          </span>
                          {(parsed.abbreviation ||
                            parsed.isActive !== undefined) && (
                            <div className="flex shrink-0 items-center gap-2">
                              {parsed.abbreviation && (
                                <span className="font-mono text-xs theme-text-faint">
                                  {parsed.abbreviation}
                                </span>
                              )}
                              {parsed.isActive === true && (
                                <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                                  active
                                </span>
                              )}
                              {parsed.isActive === false && (
                                <span className="rounded-full theme-article-subsection-card-nested px-1.5 py-0.5 text-[10px] font-medium theme-text-faint">
                                  inactive
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </ArticleSection.InfoCard>
                );
              }}
            </ExpandableList>
          )}
        </ArticleSection.Group>
      )}
    </ArticleSection>
  );
});
