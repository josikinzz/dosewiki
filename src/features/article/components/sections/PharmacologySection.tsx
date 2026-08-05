"use client";

import Link from "next/link";
import { memo } from "react";
import { ExpandableList } from "@/components/common/ArticleExpandable";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon, type IconName } from "@/components/common/Icon";
import {
  extractCitationTokens,
  stripCitationTokens,
} from "@/lib/citations/referenceModel";
import { cn } from "@/lib/utils";
import type { SubstanceArticle } from "@/schema";
import { isPlainLeftClick } from "@/utils/navigation";
import { publicHref } from "@/utils/publicHref";
import { EditableSlot, EditableValue } from "../../editing";
import { ArticleText, CitationMarker } from "../CitedText";
import { ArticleSection } from "@/components/common/ArticleSection";
import { normalizePharmacologySection } from "../../../../../lib/article/normalization.mjs";
import {
  ArticleGapNotice,
  ArticleSubsectionGapNotice,
} from "./ArticleGapNotice";
import type { SubsectionGapPolicyKey } from "./articleGapCopy";

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

/**
 * Activity phrases that can trail a binding-site name in a mechanism label.
 * Ordered longest-first so "partial agonist" wins over "agonist" and
 * "reuptake inhibitor" over "inhibitor".
 */
const MECHANISM_ACTIVITY_PHRASES = [
  "positive allosteric modulator",
  "negative allosteric modulator",
  "allosteric modulator",
  "reuptake inhibitor",
  "releasing agent",
  "partial agonist",
  "inverse agonist",
  "co-agonist",
  "antagonist",
  "modulator",
  "inhibitor",
  "agonist",
  "blocker",
  "ligand",
  "agent",
];

/**
 * Splits "5-HT2A receptor agonist" into the site ("5-HT2A receptor") and the
 * activity ("agonist") so the row's citation marker can sit beside the binding
 * site itself rather than trailing the whole mechanism. Labels that carry no
 * recognised activity phrase — a bare target like "TAAR1", or free prose — stay
 * whole and keep the marker at the end.
 */
function splitMechanismActivity(base: string): {
  site: string;
  activity?: string;
} {
  const lower = base.toLowerCase();
  for (const phrase of MECHANISM_ACTIVITY_PHRASES) {
    if (!lower.endsWith(` ${phrase}`)) continue;
    const site = base.slice(0, base.length - phrase.length - 1).trimEnd();
    if (site.length > 0) {
      return { site, activity: base.slice(base.length - phrase.length) };
    }
  }
  return { site: base };
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

function uniqueCitationIds(text: string | null | undefined): string[] {
  if (!text?.includes("[cite:")) {
    return [];
  }

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const token of extractCitationTokens(text)) {
    if (!seen.has(token.id)) {
      seen.add(token.id);
      ids.push(token.id);
    }
  }
  return ids;
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

  // What is actually stored, as opposed to what the normalizer hands back. The
  // normalizer falls back to `summary` for pharmacodynamics and to `metabolism`
  // for pharmacokinetics, so an edit seeded from its output would offer to save
  // one field's prose into a different field.
  const storedPharmacodynamics = article.pharmacology?.pharmacodynamics ?? "";
  const storedPharmacokinetics = article.pharmacology?.pharmacokinetics ?? "";
  const hasStoredPharmacodynamics = storedPharmacodynamics.trim().length > 0;
  const hasStoredPharmacokinetics = storedPharmacokinetics.trim().length > 0;

  const pharmacodynamicsText =
    pharmacology.pharmacodynamics?.trim().length > 0
      ? pharmacology.pharmacodynamics
      : (pharmacology.summary ?? "");
  const hasSummary = pharmacodynamicsText.trim().length > 0;
  const hasBindingSites = pharmacology.binding_sites.length > 0;
  const hasPharmacokinetics = pharmacology.pharmacokinetics?.trim().length > 0;
  const hasMetabolites = pharmacology.metabolites?.length > 0;
  const summaryParagraphs = hasSummary
    ? pharmacodynamicsText
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
    : [];
  const hasPharmacodynamics = hasSummary || hasBindingSites;

  const hasAnyContent =
    hasSummary || hasBindingSites || hasPharmacokinetics || hasMetabolites;

  // An empty pharmacokinetics slot only gets a marker once the section itself
  // renders. When the whole section is empty the gap notice below already
  // states the absence, and repeating it per slot inside a notice that replaced
  // the section would say the same thing three times.
  const emptyPharmacokineticsSlots: SubsectionGapPolicyKey[] = [
    ...(hasPharmacokinetics ? [] : (["pharmacokinetics"] as const)),
    ...(hasMetabolites ? [] : (["metabolites"] as const)),
  ];

  if (!hasAnyContent) {
    return <ArticleGapNotice article={article} section="pharmacology" />;
  }

  // One field split on blank lines, so the editable unit is the whole block. A
  // per-paragraph editor would write that paragraph over every other one.
  const pharmacodynamicsBody = hasSummary ? (
    <div className="space-y-3">
      {summaryParagraphs.map((paragraph, idx) => (
        <ArticleText key={idx} text={paragraph} article={article} />
      ))}
    </div>
  ) : null;

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
          {/* Editable only when the stored field is the source of what is on
              screen. When it is empty the paragraphs are `summary` on loan, and
              an editor there would save that borrowed prose into
              `pharmacology.pharmacodynamics` as though it had been written for
              it. */}
          {hasStoredPharmacodynamics ? (
            <EditableValue
              as="div"
              label="Pharmacodynamics"
              path="pharmacology.pharmacodynamics"
              value={storedPharmacodynamics}
            >
              {pharmacodynamicsBody}
            </EditableValue>
          ) : (
            pharmacodynamicsBody
          )}

          {!hasStoredPharmacodynamics && (
            <EditableSlot
              emptyLabel="Add pharmacodynamics"
              label="Pharmacodynamics"
              path="pharmacology.pharmacodynamics"
              value={storedPharmacodynamics}
            />
          )}

          {hasBindingSites && (
            <ExpandableList
              ariaLabelBase="binding sites"
              defaultExpanded={!hasSummary}
              collapsedCount={pharmacology.binding_sites.length}
              hideToggleWhenExpanded
              items={pharmacology.binding_sites}
              className="space-y-3"
              collapsedToggleContent={
                <CollapsedPharmacologyToggle
                  icon="lucide:key"
                  title="Binding Sites"
                />
              }
              toggleButtonClassName={({ isExpanded }) =>
                isExpanded ? undefined : "gap-2 px-3.5 py-1.5"
              }
              // Never the section adornment: the pharmacokinetics group now
              // always follows, so the adornment's `-mb-8` would pull that
              // heading into the toggle instead of collapsing trailing space.
              toggleClassName="pt-1.5"
            >
              {({ hiddenCount, isExpanded, items, toggle }) => {
                if (!isExpanded) {
                  return null;
                }

                return (
                  <ArticleSection.InfoCard
                    icon="lucide:key"
                    title="Binding Sites"
                    accessory={
                      <ExpandButton
                        isExpanded
                        onToggle={toggle}
                        variant="count"
                        count={hiddenCount}
                        className="theme-control-pill-quiet"
                        ariaLabel="Collapse binding sites"
                      />
                    }
                    variant="subtle"
                    padding="sm"
                    contentClassName="space-y-1"
                  >
                    {items.map((entry, idx) => {
                      const tag = entry.tag;
                      const mechanismText = stripCitationTokens(
                        tag || entry.target,
                      );
                      const { base, qualifier } = mechanismText
                        ? parseMechanismEntry(mechanismText)
                        : { base: "", qualifier: undefined };
                      const mechanismLink =
                        tag && base
                          ? getMechanismPath(base, qualifier)
                          : undefined;
                      // Affinity and efficacy carry their own `[cite:...]`
                      // tokens as often as the receptor name does, so they get
                      // the same treatment: stripped before display, and their
                      // ids folded into the row's single marker cluster.
                      const affinityText = stripCitationTokens(
                        entry.affinity ?? "",
                      );
                      const efficacyText = stripCitationTokens(
                        entry.efficacy ?? "",
                      );
                      const referenceIds = uniqueCitationIds(
                        [tag || entry.target, entry.affinity, entry.efficacy]
                          .filter(Boolean)
                          .join(" "),
                      );

                      // The marker cites the binding site, so it sits with the
                      // site name; the activity phrase trails it. A citation is
                      // itself a link, so the label cannot be one anchor — the
                      // two halves link to the same mechanism page separately.
                      const { site, activity } = splitMechanismActivity(base);
                      const labelClassName =
                        "font-medium theme-text-primary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400";
                      const renderLabelPart = (text: string) =>
                        mechanismLink ? (
                          <Link
                            href={mechanismLink.href}
                            className={labelClassName}
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
                            {text}
                          </Link>
                        ) : (
                          <span className={labelClassName}>{text}</span>
                        );

                      return (
                        <div
                          key={idx}
                          className={cn(
                            // Stacked until there is room for two columns. An
                            // affinity string like "IC50 59 uM (serotonin
                            // substrate), 5,000 uM (...)" is wider than a phone
                            // viewport on its own, so a value column that
                            // refuses to shrink drags it off the screen edge.
                            "theme-pharmacology-table-row flex flex-col items-start gap-1 rounded-lg px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3",
                            idx % 2 === 1 && "theme-pharmacology-table-row-alt",
                          )}
                        >
                          <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 sm:w-auto">
                            <span className="inline-flex min-w-0 items-center">
                              {site && renderLabelPart(site)}
                              <CitationMarker
                                article={article}
                                referenceIds={referenceIds}
                              />
                            </span>
                            {activity && renderLabelPart(activity)}
                            {qualifier && (
                              <span className="theme-receptor-qualifier-badge whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium theme-accent-emphasis">
                                {qualifier}
                              </span>
                            )}
                          </div>
                          {(affinityText || efficacyText) && (
                            <div className="flex w-full min-w-0 flex-col items-start gap-0.5 sm:w-auto sm:items-end sm:text-right">
                              {affinityText && (
                                <span className="break-words font-mono text-xs theme-text-faint">
                                  {affinityText}
                                </span>
                              )}
                              {efficacyText && (
                                <span className="break-words text-xs theme-text-faint">
                                  {efficacyText}
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

      {/* The group above disappears entirely when there is neither prose nor
          binding-site data, taking its prompt with it, so the section carries a
          second one for that case. The two conditions are exclusive. */}
      {!hasPharmacodynamics && (
        <EditableSlot
          emptyLabel="Add pharmacodynamics"
          label="Pharmacodynamics"
          path="pharmacology.pharmacodynamics"
          value={storedPharmacodynamics}
        />
      )}

      {/* Always rendered once the section has any content. A pharmacokinetics
          heading with nothing under it used to disappear silently, which reads
          identically to a substance whose kinetics nobody has ever measured. */}
      <ArticleSection.Group
        icon="material-symbols:metabolism-rounded"
        heading="Pharmacokinetics"
      >
        {hasPharmacokinetics &&
          (hasStoredPharmacokinetics ? (
            <EditableValue
              as="div"
              label="Pharmacokinetics"
              path="pharmacology.pharmacokinetics"
              value={storedPharmacokinetics}
            >
              <ArticleText
                text={pharmacology.pharmacokinetics}
                article={article}
              />
            </EditableValue>
          ) : (
            // The text on screen is legacy `metabolism`, which this path does
            // not address; the prompt below offers the real field instead.
            <ArticleText
              text={pharmacology.pharmacokinetics}
              article={article}
            />
          ))}

        {!hasStoredPharmacokinetics && (
          <EditableSlot
            emptyLabel="Add pharmacokinetics"
            label="Pharmacokinetics"
            path="pharmacology.pharmacokinetics"
            value={storedPharmacokinetics}
          />
        )}

        {hasMetabolites && (
          <ExpandableList
            ariaLabelBase="metabolites"
            defaultExpanded={!hasPharmacokinetics}
            collapsedCount={pharmacology.metabolites.length}
            hideToggleWhenExpanded
            items={pharmacology.metabolites}
            className="space-y-3"
            collapsedToggleContent={
              <CollapsedPharmacologyToggle
                icon="material-symbols:track-changes-rounded"
                title="Metabolites"
              />
            }
            toggleButtonClassName={({ isExpanded }) =>
              isExpanded ? undefined : "gap-2 px-3.5 py-1.5"
            }
            toggleAdornment
          >
            {({ hiddenCount, isExpanded, items, toggle }) => {
              if (!isExpanded) {
                return null;
              }

              return (
                <ArticleSection.InfoCard
                  icon="material-symbols:track-changes-rounded"
                  title="Metabolites"
                  accessory={
                    <ExpandButton
                      isExpanded
                      onToggle={toggle}
                      variant="count"
                      count={hiddenCount}
                      className="theme-control-pill-quiet"
                      ariaLabel="Collapse metabolites"
                    />
                  }
                  variant="subtle"
                  padding="sm"
                  contentClassName="space-y-1"
                >
                  {items.map((met, idx) => {
                    const parsed = parseMetabolite(stripCitationTokens(met));
                    const referenceIds = uniqueCitationIds(met);
                    return (
                      <div
                        key={idx}
                        className={cn(
                          "theme-pharmacology-table-row flex flex-col items-start gap-1 rounded-lg px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3",
                          idx % 2 === 1 && "theme-pharmacology-table-row-alt",
                        )}
                      >
                        <span className="flex w-full min-w-0 flex-wrap items-center gap-1.5 theme-text-secondary sm:w-auto">
                          {parsed.name}
                          <CitationMarker
                            article={article}
                            referenceIds={referenceIds}
                          />
                        </span>
                        {(parsed.abbreviation ||
                          parsed.isActive !== undefined) && (
                          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                            {parsed.abbreviation && (
                              <span className="break-words font-mono text-xs theme-text-faint">
                                {parsed.abbreviation}
                              </span>
                            )}
                            {parsed.isActive === true && (
                              <span className="theme-metabolite-status-badge theme-metabolite-status-badge-active whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                                active
                              </span>
                            )}
                            {parsed.isActive === false && (
                              <span className="theme-metabolite-status-badge theme-metabolite-status-badge-inactive whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium theme-text-faint">
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

        {/* Last in the group, so the chips read as the slots left over after
            what is documented rather than as a header for it. */}
        <ArticleSubsectionGapNotice
          article={article}
          slots={emptyPharmacokineticsSlots}
          parentGapKey="pharmacology"
        />
      </ArticleSection.Group>
    </ArticleSection>
  );
});
