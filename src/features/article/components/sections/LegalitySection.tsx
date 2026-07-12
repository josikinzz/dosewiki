"use client";

import { memo } from "react";
import Masonry from "react-masonry-css";
import { ExpandableText } from "@/components/common/ArticleExpandable";
import {
  ArticleSection,
  ArticleSubsectionCard,
} from "@/components/common/ArticleSection";
import { AppImage } from "@/components/common/AppImage";
import { stripCitationTokens } from "@/lib/citations/referenceModel";
import usStateFlagMappings from "@/data/mappings/usStateFlagMappings.json";
import { CANONICAL_LEGAL_STATUSES } from "@/schema/substance/shared";
import { getCountryCode } from "@/utils/data/countryCodes";
import type { CountryLegality, SubstanceArticle, USStateLegality } from "@/schema";
import { ArticleText, CitedText } from "../CitedText";

// ============================================================================
// Status Color System
// ============================================================================

type StatusColor = "red" | "yellow" | "blue" | "green" | "gray";
type CanonicalLegalStatus = (typeof CANONICAL_LEGAL_STATUSES)[number];

const COLOR_CLASSES: Record<
  StatusColor,
  { className: string; tone: StatusColor }
> = {
  red: { className: "theme-semantic-danger-badge", tone: "red" },
  yellow: { className: "theme-semantic-caution-badge", tone: "yellow" },
  blue: { className: "theme-badge-surface", tone: "blue" },
  green: { className: "theme-evidence-surface", tone: "green" },
  gray: { className: "theme-article-subsection-card-nested theme-text-muted", tone: "gray" },
};

const CANONICAL_STATUS_DISPLAY: Record<
  CanonicalLegalStatus,
  { label: string; color: StatusColor }
> = {
  prohibited: { label: "Illegal", color: "red" },
  analog_covered: { label: "Illegal (analog/blanket ban)", color: "red" },
  precursor_controlled: { label: "Controlled precursor", color: "yellow" },
  prescription_only: { label: "Prescription only", color: "blue" },
  decriminalized: { label: "Decriminalized", color: "green" },
  legal_regulated: { label: "Legal (regulated)", color: "green" },
  unscheduled: { label: "Not scheduled", color: "green" },
  restricted_other: { label: "Restricted", color: "yellow" },
};

// Exact matches for common statuses (case-sensitive)
const STATUS_COLOR_MAP: Record<string, StatusColor> = {
  // Red - Strictly illegal (no medical use)
  Illegal: "red",
  Prohibited: "red",
  Banned: "red",
  Forbidden: "red",
  "Schedule I": "red",
  "Schedule I (CDSA)": "red",
  "Class A": "red",
  "Controlled (narcotic)": "red",
  "Illegal (NPSG)": "red",

  // Yellow - Controlled (regulated, has medical uses)
  Controlled: "yellow",
  "Controlled substance": "yellow",
  "Controlled (Verzeichnis E)": "yellow",
  "Controlled (NpSG)": "yellow",
  Scheduled: "yellow",
  "Schedule II": "yellow",
  "Schedule III": "yellow",
  "Schedule III (CDSA)": "yellow",
  "Schedule IV": "yellow",
  "Schedule IV (CDSA)": "yellow",
  "Schedule V": "yellow",
  "Class B": "yellow",
  "Class C": "yellow",
  "Class D": "yellow",
  "Anlage I BtMG": "yellow",
  "Anlage II BtMG": "yellow",
  "Anlage III BtMG": "yellow",
  "Tabella I": "yellow",
  "Tabella II": "yellow",
  "Tabella III": "yellow",
  "Tabella IV": "yellow",
  "List I": "yellow",
  "List II": "yellow",
  "List III": "yellow",
  "Category 1": "yellow",
  "Category 2": "yellow",
  "Category 3": "yellow",

  // Blue - Prescription/Medical
  "Prescription only": "blue",
  "Prescription required": "blue",
  "Medical use only": "blue",
  Regulated: "blue",
  Restricted: "blue",

  // Green - Legal/Uncontrolled
  Legal: "green",
  Unscheduled: "green",
  Uncontrolled: "green",
  "Not controlled": "green",
  "Not scheduled": "green",
  Decriminalized: "green",
};

// Pattern fallbacks for variations (checked in order)
const STATUS_PATTERNS: [RegExp, StatusColor][] = [
  // Red patterns - check first
  [/\billegal\b|\bprohibited\b|\bbanned\b|\bforbidden\b/i, "red"],
  [/\bclass\s*a\b/i, "red"],
  [/\bschedule\s*i\b(?!\s*i)/i, "red"], // Schedule I but not II/III/IV
  [/\bnarcotic\b/i, "red"],

  // Blue patterns - prescription/medical
  [/\bprescription\b|\bmedical\s*use\b/i, "blue"],
  [/\brestricted\b|\bregulated\b/i, "blue"],

  // Green patterns - legal/uncontrolled
  [/\blegal\b|\bunscheduled\b|\buncontrolled\b|\bdecriminalized\b/i, "green"],
  [/\bnot\s*(controlled|scheduled)\b/i, "green"],

  // Yellow patterns - catch-all for controlled substances (checked last)
  [/\bcontrolled\b|\bschedule\b|\bscheduled\b/i, "yellow"],
  [/\bclass\s*[b-z]\b/i, "yellow"],
  [/\banlage\b|\btabella\b|\blist\s*[ivx\d]/i, "yellow"],
  [/\bcategory\s*\d/i, "yellow"],
  [/\bverzeichnis\b|\bnpsg\b|\bbtmg\b/i, "yellow"],
];

function getStatusColor(status: string): {
  className: string;
  tone: StatusColor;
} {
  // Try exact match first
  const exactMatch = STATUS_COLOR_MAP[status];
  if (exactMatch) {
    return COLOR_CLASSES[exactMatch];
  }

  // Try pattern matching
  for (const [pattern, color] of STATUS_PATTERNS) {
    if (pattern.test(status)) {
      return COLOR_CLASSES[color];
    }
  }

  // Fallback to gray
  return COLOR_CLASSES.gray;
}

const MASONRY_BREAKPOINTS = {
  default: 2,
  640: 1,
};

/**
 * Produces the compact, country-specific designation displayed beside a
 * canonical legality category.
 */
export function getInstrumentShorthand(instrument: string): string {
  const firstSegment = instrument.split(";", 1)[0]?.split(",", 1)[0]?.trim() ?? "";

  if (firstSegment.length <= 40) {
    return firstSegment;
  }

  const wordBoundary = firstSegment.lastIndexOf(" ", 40);
  const truncated = wordBoundary > 0
    ? firstSegment.slice(0, wordBoundary).trimEnd()
    : firstSegment.slice(0, 40).trimEnd();

  return `${truncated}…`;
}

interface LegalitySectionProps {
  article: SubstanceArticle;
}

type LegalityEntry = CountryLegality | USStateLegality;

interface LegalityEntryCardProps {
  article: SubstanceArticle;
  name: string;
  info: LegalityEntry;
  flagSrc?: string;
  cities?: Record<string, CountryLegality>;
  nested?: boolean;
}

function LegalityEntryCard({
  article,
  name,
  info,
  flagSrc,
  cities,
  nested = false,
}: LegalityEntryCardProps) {
  const canonicalStatus = info.canonicalStatus
    ? CANONICAL_STATUS_DISPLAY[info.canonicalStatus]
    : undefined;
  const showStatusAsBadge = Boolean(canonicalStatus || info.status?.trim());
  const displayText = info.notes || "";
  const isLongText = displayText.length > 480;
  const displayStatus = info.status ? stripCitationTokens(info.status) : "";
  const statusColor = canonicalStatus
    ? COLOR_CLASSES[canonicalStatus.color]
    : displayStatus
      ? getStatusColor(displayStatus)
      : COLOR_CLASSES.gray;
  const instrument = info.instrument?.trim();
  const designation = canonicalStatus
    ? info.designation || (instrument ? getInstrumentShorthand(instrument) : undefined)
    : undefined;
  const showDesignation = designation && canonicalStatus
    ? designation.toLowerCase() !== canonicalStatus.label.toLowerCase()
    : false;
  const showInstrumentCitation = Boolean(canonicalStatus && instrument && designation !== instrument);

  return (
    <ArticleSubsectionCard
      padding="xs"
      variant="nested"
      className={`theme-public-card-hover-quiet relative min-w-0 ${nested ? "theme-article-subsection-card-nested" : ""}`}
    >
      {flagSrc && (
        <AppImage
          src={flagSrc}
          alt={`${name} flag`}
          width={24}
          height={24}
          className="theme-country-flag absolute right-3 top-3 h-6 w-6"
        />
      )}
      <div className={`flex ${canonicalStatus ? "flex-wrap " : ""}items-center gap-2 ${flagSrc ? "pr-8" : ""}`}>
        <span className={canonicalStatus ? "min-w-0 break-words font-medium theme-text-primary" : "font-medium theme-text-primary"}>
          {name}
        </span>
        {showStatusAsBadge && (canonicalStatus || info.status) && (
          <span
            className={canonicalStatus
              ? `theme-status-badge inline-flex max-w-full break-words rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor.className}`
              : `theme-status-badge rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor.className}`}
            data-badge-tone={statusColor.tone}
          >
            {canonicalStatus ? canonicalStatus.label : <CitedText text={info.status} article={article} />}
          </span>
        )}
        {showDesignation && (
          <span
            className="theme-status-badge inline-flex max-w-full break-words rounded-full px-1.5 py-0.5 font-mono text-[9px] font-medium"
            data-badge-tone="gray"
          >
            {designation}
          </span>
        )}
      </div>
      {showInstrumentCitation && instrument && (
        <div
          className="mt-1 break-words text-[11px] italic leading-[1.125rem] theme-text-muted"
          data-testid="legality-instrument-citation"
        >
          <CitedText text={instrument} article={article} />
        </div>
      )}
      {displayText && (isLongText ? (
        <ExpandableText
          ariaLabelBase={`${name} legality notes`}
          className="mt-1"
          contentClassName="whitespace-pre-line text-xs leading-[1.125rem] theme-text-muted"
          maxLines={6}
        >
          <CitedText text={displayText} article={article} />
        </ExpandableText>
      ) : (
        <ArticleText
          as="div"
          text={displayText}
          article={article}
          tone="muted"
          className="mt-1 whitespace-pre-line text-xs leading-[1.125rem] theme-text-muted"
        />
      ))}
      {cities && Object.keys(cities).length > 0 && (
        <div className="mt-3 space-y-2 border-l border-dose-border-subtle pl-3" data-testid="legality-city-list">
          {Object.entries(cities).map(([cityName, cityInfo]) => (
            <LegalityEntryCard
              key={cityName}
              article={article}
              name={cityName}
              info={cityInfo}
              nested
            />
          ))}
        </div>
      )}
    </ArticleSubsectionCard>
  );
}

export const LegalitySection = memo(function LegalitySection({
  article,
}: LegalitySectionProps) {
  const { legality } = article;
  const hasInternational = legality.international.length > 0;
  const countries = Object.entries(legality.countries);
  const hasCountries = countries.length > 0;
  const usStates = legality.usStates ?? {};
  const usStateEntries = Object.entries(usStates);
  const hasUsStates = usStateEntries.length > 0;
  const unitedStates = legality.countries["United States"];
  const generalCountries = hasUsStates
    ? countries.filter(([countryName]) => countryName !== "United States")
    : countries;

  if (!hasInternational && !hasCountries && !hasUsStates) {
    return null;
  }

  return (
    <ArticleSection
      id="legality"
      icon="lucide:scale"
      heading="Legality"
    >
      {/* International */}
      {hasInternational && (
        <ArticleSection.Group
          icon="lucide:globe"
          heading="International"
          className="mb-4"
          headingClassName="font-semibold normal-case tracking-normal"
        >
          <div className="space-y-2">
            {legality.international.map((item, idx) => (
              <ArticleText key={idx} text={item} article={article} />
            ))}
          </div>
        </ArticleSection.Group>
      )}

      {/* Countries */}
      {(hasCountries || hasUsStates) && (
        <ArticleSection.Group
          icon="lucide:map-pin"
          heading="By Country"
          className="mt-4"
          headingClassName="font-semibold normal-case tracking-normal"
        >
          {hasUsStates && (
            <div className="mb-4 rounded-2xl border border-dose-border-subtle p-3" data-testid="us-states-subsection">
              <div className="mb-3 text-xs font-semibold theme-text-primary">United States — by state</div>
              {unitedStates && (
                <div className="mb-3">
                  <LegalityEntryCard
                    article={article}
                    name="United States"
                    info={unitedStates}
                    flagSrc={`/flags/${getCountryCode("United States")}.svg`}
                  />
                </div>
              )}
              {legality.usStatesNote && (
                <div
                  className="mb-3 rounded-xl border border-dose-border-subtle px-3 py-2 text-xs leading-[1.125rem] theme-text-muted"
                  data-testid="us-states-summary"
                >
                  <CitedText text={legality.usStatesNote} article={article} />
                </div>
              )}
              <Masonry
                breakpointCols={MASONRY_BREAKPOINTS}
                className="flex w-full gap-4"
                columnClassName="flex min-w-0 flex-1 flex-col gap-4"
              >
                {usStateEntries.map(([stateName, stateInfo]) => (
                  <LegalityEntryCard
                    key={stateName}
                    article={article}
                    name={stateName}
                    info={stateInfo}
                    flagSrc={usStateFlagMappings[stateName as keyof typeof usStateFlagMappings]
                      ? `/flags/us/${usStateFlagMappings[stateName as keyof typeof usStateFlagMappings]}`
                      : undefined}
                    cities={stateInfo.cities}
                  />
                ))}
              </Masonry>
            </div>
          )}
          {generalCountries.length > 0 && (
            <Masonry
              breakpointCols={MASONRY_BREAKPOINTS}
              className="flex w-full gap-4"
              columnClassName="flex min-w-0 flex-1 flex-col gap-4"
            >
              {generalCountries.map(([countryName, info]) => {
                const countryCode = getCountryCode(countryName);
                return (
                  <LegalityEntryCard
                    key={countryName}
                    article={article}
                    name={countryName}
                    info={info}
                    flagSrc={countryCode ? `/flags/${countryCode}.svg` : undefined}
                  />
                );
              })}
            </Masonry>
          )}
        </ArticleSection.Group>
      )}
    </ArticleSection>
  );
});
