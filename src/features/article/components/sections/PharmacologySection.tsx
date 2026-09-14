"use client";

import { SmartLink } from "@/components/common/SmartLink";
import { memo } from "react";
import { ExpandableList } from "@/components/common/ArticleExpandable";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon, type IconName } from "@/components/common/Icon";
import {
  extractCitationTokens,
  stripCitationTokens,
} from "@/lib/citations/citationTokens";
import { cn } from "@/lib/utils";
import type { SubstanceArticle } from "@/schema";
import { SUBSTANCE_SECTION_ICONS } from "@/schema/substance/sectionManifest";
import { isPlainLeftClick } from "@/utils/navigation";
import { EditableSlot, EditableValue } from "../../editing";
import { ArticleText, CitationMarker } from "../CitedText";
import { ArticleSection } from "@/components/common/ArticleSection";
import { normalizePharmacologySection } from "../../../../../lib/article/normalization.mjs";
import { projectMetaboliteDisplay } from "@/lib/article/scientificFieldPolicy.mjs";
import { useT } from "@/i18n/client";
import {
  ArticleGapNotice,
  ArticleSubsectionGapNotice,
} from "./ArticleGapNotice";
import type { SubsectionGapPolicyKey } from "./articleGapCopy";
import {
  getMechanismPath,
  parseMechanismEntry,
  splitMechanismActivity,
} from "./pharmacologyMechanisms";

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

/** Shared with translation extraction so canonical and explanatory spans agree. */
const parseMetabolite = projectMetaboliteDisplay;

interface PharmacologySectionProps {
  article: SubstanceArticle;
  /** Called when a mechanism of action is clicked */
  onSelectMechanism?: (slug: string, qualifier?: string) => void;
}

export const PharmacologySection = memo(function PharmacologySection({
  article,
  onSelectMechanism,
}: PharmacologySectionProps) {
  const t = useT();
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
  const halfLife = pharmacology.half_life?.trim() ?? "";
  const hasHalfLife = halfLife.length > 0;
  const summaryParagraphs = hasSummary
    ? pharmacodynamicsText
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
    : [];
  const hasPharmacodynamics = hasSummary || hasBindingSites;

  const hasAnyContent =
    hasSummary || hasBindingSites || hasPharmacokinetics || hasMetabolites || hasHalfLife;

  // An empty pharmacokinetics slot only gets a marker once the section itself
  // renders. When the whole section is empty the gap notice below already
  // states the absence, and repeating it per slot inside a notice that replaced
  // the section would say the same thing three times.
  const emptyPharmacokineticsSlots: SubsectionGapPolicyKey[] = [
    ...(hasPharmacokinetics ? [] : (["pharmacokinetics"] as const)),
    ...(hasMetabolites ? [] : (["metabolites"] as const)),
  ];

  // These cards cite as a table, not as a list of independent claims: the same
  // handful of papers back every row, so a marker per row repeated the same two
  // numbers eight times. Gather each card's references into one cluster on its
  // title instead. Order follows the render-order walk in `citationPlacement`
  // (row order, then mechanism -> affinity -> efficacy), so the numbers read
  // ascending. Computed from the full list rather than the expanded slice, so
  // collapsing rows never drops a reference.
  const bindingSiteReferenceIds = uniqueCitationIds(
    pharmacology.binding_sites
      .flatMap((entry) => [entry.tag || entry.target, entry.affinity, entry.efficacy])
      .filter(Boolean)
      .join(" "),
  );
  const metaboliteReferenceIds = uniqueCitationIds(
    (pharmacology.metabolites ?? []).join(" "),
  );

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
      icon={SUBSTANCE_SECTION_ICONS["pharmacology"]}
      heading={t("Pharmacology")}
    >
      {hasPharmacodynamics && (
        <ArticleSection.Group
          icon="lucide:brain-circuit"
          heading={t("Pharmacodynamics")}
        >
          {/* Editable only when the stored field is the source of what is on
              screen. When it is empty the paragraphs are `summary` on loan, and
              an editor there would save that borrowed prose into
              `pharmacology.pharmacodynamics` as though it had been written for
              it. */}
          {hasStoredPharmacodynamics ? (
            <EditableValue
              as="div"
              label={t("Pharmacodynamics")}
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
              emptyLabel={t("Add pharmacodynamics")}
              label={t("Pharmacodynamics")}
              path="pharmacology.pharmacodynamics"
              value={storedPharmacodynamics}
            />
          )}

          {hasBindingSites && (
            <ExpandableList
              ariaLabelBase={t("binding sites")}
              defaultExpanded={!hasSummary}
              collapsedCount={pharmacology.binding_sites.length}
              hideToggleWhenExpanded
              items={pharmacology.binding_sites}
              className="space-y-3"
              collapsedToggleContent={
                <CollapsedPharmacologyToggle
                  icon="lucide:key"
                  title={t("Binding Sites")}
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
                    title={t("Binding Sites")}
                    titleAdornment={
                      <CitationMarker
                        article={article}
                        referenceIds={bindingSiteReferenceIds}
                      />
                    }
                    accessory={
                      <ExpandButton
                        isExpanded
                        onToggle={toggle}
                        variant="count"
                        count={hiddenCount}
                        className="theme-control-pill-quiet"
                        ariaLabel={t("Collapse binding sites")}
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
                      // ids gathered into the card's title cluster.
                      const affinityText = stripCitationTokens(
                        entry.affinity ?? "",
                      );
                      const efficacyText = stripCitationTokens(
                        entry.efficacy ?? "",
                      );

                      // The marker cites the binding site, so it sits with the
                      // site name; the activity phrase trails it. A citation is
                      // itself a link, so the label cannot be one anchor — the
                      // two halves link to the same mechanism page separately.
                      const { site, activity } = splitMechanismActivity(base);
                      const labelClassName =
                        "theme-focus-ring font-medium theme-text-primary transition-colors";
                      const renderLabelPart = (text: string) =>
                        mechanismLink ? (
                          <SmartLink
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
                          </SmartLink>
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
                            {site && renderLabelPart(site)}
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
          emptyLabel={t("Add pharmacodynamics")}
          label={t("Pharmacodynamics")}
          path="pharmacology.pharmacodynamics"
          value={storedPharmacodynamics}
        />
      )}

      {/* Always rendered once the section has any content. A pharmacokinetics
          heading with nothing under it used to disappear silently, which reads
          identically to a substance whose kinetics nobody has ever measured. */}
      <ArticleSection.Group
        icon="material-symbols:metabolism-rounded"
        heading={t("Pharmacokinetics")}
      >
        {hasPharmacokinetics &&
          (hasStoredPharmacokinetics ? (
            <EditableValue
              as="div"
              label={t("Pharmacokinetics")}
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
            emptyLabel={t("Add pharmacokinetics")}
            label={t("Pharmacokinetics")}
            path="pharmacology.pharmacokinetics"
            value={storedPharmacokinetics}
          />
        )}
        {hasHalfLife && (
          <ArticleSection.InfoCard
            icon="lucide:trending-down"
            title={t("Half-life")}
            variant="subtle"
            padding="sm"
          >
            <EditableValue
              as="div"
              label={t("Half-life")}
              path="pharmacology.half_life"
              value={article.pharmacology?.half_life ?? ""}
            >
              <ArticleText text={halfLife} article={article} />
            </EditableValue>
          </ArticleSection.InfoCard>
        )}


        {hasMetabolites && (
          <ExpandableList
            ariaLabelBase={t("metabolites")}
            defaultExpanded={!hasPharmacokinetics}
            collapsedCount={pharmacology.metabolites.length}
            hideToggleWhenExpanded
            items={pharmacology.metabolites}
            className="space-y-3"
            collapsedToggleContent={
              <CollapsedPharmacologyToggle
                icon="material-symbols:track-changes-rounded"
                title={t("Metabolites")}
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
                  title={t("Metabolites")}
                  titleAdornment={
                    <CitationMarker
                      article={article}
                      referenceIds={metaboliteReferenceIds}
                    />
                  }
                  accessory={
                    <ExpandButton
                      isExpanded
                      onToggle={toggle}
                      variant="count"
                      count={hiddenCount}
                      className="theme-control-pill-quiet"
                      ariaLabel={t("Collapse metabolites")}
                    />
                  }
                  variant="subtle"
                  padding="sm"
                  contentClassName="space-y-1"
                >
                  {items.map((met, idx) => {
                    const parsed = parseMetabolite(stripCitationTokens(met));
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
                        </span>
                        {(parsed.abbreviation ||
                          parsed.status ||
                          parsed.qualifications.length > 0) && (
                          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                            {parsed.abbreviation && (
                              <span className="break-words font-mono text-xs theme-text-faint">
                                {parsed.abbreviation}
                              </span>
                            )}
                            {parsed.qualifications.length > 0 && (
                              <span className="text-xs theme-text-subtle">
                                {parsed.qualifications.join(", ")}
                              </span>
                            )}
                            {parsed.status === "active" && (
                              <span className="theme-metabolite-status-badge theme-metabolite-status-badge-active whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                                {t("active")}
                              </span>
                            )}
                            {parsed.status === "inactive" && (
                              <span className="theme-metabolite-status-badge theme-metabolite-status-badge-inactive whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium theme-text-faint">
                                {t("inactive")}
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
