"use client";

import { memo, type ReactNode, useId, useState } from "react";
import Masonry from "react-masonry-css";
import { ExpandableText } from "@/components/common/ArticleExpandable";
import {
  ArticleSection,
  ArticleSubsectionCard,
} from "@/components/common/ArticleSection";
import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";
import { stripCitationTokens } from "@/lib/citations/citationTokens";
import usStateFlagMappings from "@/data/mappings/usStateFlagMappings.json";
import { CANONICAL_LEGAL_STATUSES } from "@/schema/substance/shared";
import { getCountryCode } from "@/utils/data/countryCodes";
import type { CountryLegality, SubstanceArticle, USStateLegality } from "@/schema";
import { buildFieldPath, EditableSlot, EditableValue } from "../../editing";
import { ArticleText, CitedText } from "../CitedText";
import { ArticleGapNotice } from "./ArticleGapNotice";

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
  blue: { className: "", tone: "blue" },
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

export function orderCountryLegalityEntries(
  entries: [string, CountryLegality][],
) {
  return [...entries].sort(([left], [right]) => {
    if (left === "United States") return -1;
    if (right === "United States") return 1;
    return left.localeCompare(right);
  });
}

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

const DESIGNATION_LIKE_PATTERN =
  /(schedule|sched\.|list|lista|liste|klasse|class|annex|anexo|anhang|anlage|table|tabella|tabela|tabla|category|categor|verzeichnis|f\u00f6rteckning|golongan|saraksts|narkotika|\u03a0\u03af\u03bd\u03b1\u03ba\u03b1\u03c2|\u0421\u043f\u0438\u0441\u043e\u043a|\u76ee\u5f55|\u4ed8\u8868|\u6307\u5b9a)|\b[IVX]{1,4}\b|\d/i;

/**
 * A derived shorthand only qualifies as a badge when it reads like a
 * schedule/list designation; agency or law names stay off the badge.
 */
function resolveDesignation(explicit: string | undefined, instrument: string | undefined): string | undefined {
  if (explicit) return explicit;
  if (!instrument) return undefined;
  const shorthand = getInstrumentShorthand(instrument);
  return DESIGNATION_LIKE_PATTERN.test(shorthand) ? shorthand : undefined;
}

interface LegalitySectionProps {
  article: SubstanceArticle;
}

type LegalityEntry = CountryLegality | USStateLegality;

/**
 * The prose note under a country, state, or city.
 *
 * `notesPath` is absent wherever the entry's own record key is not in scope, and
 * an entry without one renders exactly as it always did. Note that only `notes`
 * is editable here: the badge beside it shows a canonical label *derived* from
 * `canonicalStatus`, not the stored status, so making it editable would write
 * display text ("Illegal") into a data field.
 */
function EditableLegalityNotes({
  children,
  label,
  notesPath,
  value,
}: {
  children: ReactNode;
  label: string;
  notesPath?: string;
  value: string;
}) {
  if (!notesPath) return <>{children}</>;
  return (
    <EditableValue as="div" label={label} path={notesPath} value={value}>
      {children}
    </EditableValue>
  );
}

type BadgeSize = "sm" | "xs";

/**
 * Pills never wrap mid-label: `truncate` pins them to a single line so the flex
 * row pushes a badge that does not fit onto the next line, and only a badge
 * wider than the whole row degrades to an ellipsis.
 */
const BADGE_BASE = "theme-status-badge max-w-full truncate rounded-full font-medium";

const BADGE_SIZE_CLASSES: Record<BadgeSize, { status: string; designation: string }> = {
  sm: {
    status: "px-2 py-0.5 text-[10px]",
    designation: "px-1.5 py-0.5 font-mono text-[9px]",
  },
  xs: {
    status: "px-1.5 py-px text-[9px]",
    designation: "px-1 py-px font-mono text-[8px]",
  },
};

/**
 * Everything the card and the state row derive from one entry's status fields,
 * resolved once so both surfaces badge an entry identically.
 */
function resolveLegalityBadges(info: LegalityEntry) {
  const canonicalStatus = info.canonicalStatus
    ? CANONICAL_STATUS_DISPLAY[info.canonicalStatus]
    : undefined;
  const displayStatus = info.status ? stripCitationTokens(info.status) : "";
  const statusColor = canonicalStatus
    ? COLOR_CLASSES[canonicalStatus.color]
    : displayStatus
      ? getStatusColor(displayStatus)
      : COLOR_CLASSES.gray;
  const instrument = info.instrument?.trim();
  const designation = canonicalStatus
    ? resolveDesignation(info.designation, instrument)
    : undefined;

  return {
    canonicalStatus,
    statusColor,
    hasStatusBadge: Boolean(canonicalStatus || info.status?.trim()),
    statusLabel: canonicalStatus ? canonicalStatus.label : displayStatus,
    designation,
    showDesignation: Boolean(
      designation
        && canonicalStatus
        && designation.toLowerCase() !== canonicalStatus.label.toLowerCase(),
    ),
    instrument,
    showInstrumentCitation: Boolean(canonicalStatus && instrument && designation !== instrument),
  };
}

function LegalityBadges({
  article,
  info,
  size,
}: {
  article: SubstanceArticle;
  info: LegalityEntry;
  size: BadgeSize;
}) {
  const { canonicalStatus, hasStatusBadge, statusColor, statusLabel, designation, showDesignation } =
    resolveLegalityBadges(info);
  const sizeClasses = BADGE_SIZE_CLASSES[size];

  return (
    <>
      {hasStatusBadge && (
        <span
          className={cn(BADGE_BASE, sizeClasses.status, statusColor.className)}
          data-badge-tone={statusColor.tone}
          title={statusLabel || undefined}
        >
          {canonicalStatus ? canonicalStatus.label : <CitedText text={info.status} article={article} />}
        </span>
      )}
      {showDesignation && (
        <span
          className={cn(BADGE_BASE, sizeClasses.designation)}
          data-badge-tone="gray"
          title={designation}
        >
          {designation}
        </span>
      )}
      {info.citationNeeded && (
        <span
          className={cn(BADGE_BASE, sizeClasses.status, COLOR_CLASSES.yellow.className)}
          data-badge-tone={COLOR_CLASSES.yellow.tone}
        >
          Citation needed
        </span>
      )}
    </>
  );
}

interface LegalityEntryCardProps {
  article: SubstanceArticle;
  name: string;
  info: LegalityEntry;
  flagSrc?: string;
  footer?: ReactNode;
  /** Field path of this entry's `notes`; omit to leave the note read-only. */
  notesPath?: string;
}

function LegalityEntryCard({
  article,
  name,
  info,
  flagSrc,
  footer,
  notesPath,
}: LegalityEntryCardProps) {
  const { instrument, showInstrumentCitation } = resolveLegalityBadges(info);
  const displayText = info.notes || "";
  const isLongText = displayText.length > 480;

  return (
    <ArticleSubsectionCard
      padding="xs"
      variant="nested"
      className="theme-public-card-hover-quiet relative min-w-0"
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
      <div className={`flex min-w-0 flex-wrap items-center gap-2 ${flagSrc ? "pr-8" : ""}`}>
        <span className="min-w-0 break-words font-medium theme-text-primary">{name}</span>
        <LegalityBadges article={article} info={info} size="sm" />
      </div>
      {showInstrumentCitation && instrument && (
        <div
          className="mt-1 break-words text-[11px] italic leading-[1.125rem] theme-text-muted"
          data-testid="legality-instrument-citation"
        >
          <CitedText text={instrument} article={article} />
        </div>
      )}
      {displayText ? (isLongText ? (
        <ExpandableText
          ariaLabelBase={`${name} legality notes`}
          className="mt-1"
          contentClassName="whitespace-pre-line text-sm leading-relaxed theme-text-muted"
          maxLines={6}
        >
          {/* The clamp is CSS-only, so the full raw note is what seeds the editor. */}
          <EditableLegalityNotes
            label={`${name} legality notes`}
            notesPath={notesPath}
            value={displayText}
          >
            <CitedText text={displayText} article={article} />
          </EditableLegalityNotes>
        </ExpandableText>
      ) : (
        <EditableLegalityNotes
          label={`${name} legality notes`}
          notesPath={notesPath}
          value={displayText}
        >
          <ArticleText
            as="div"
            text={displayText}
            article={article}
            tone="muted"
            className="mt-1 whitespace-pre-line text-sm leading-relaxed theme-text-muted"
          />
        </EditableLegalityNotes>
      )) : notesPath ? (
        <EditableSlot
          className="mt-1"
          emptyLabel={`Add ${name} legality notes`}
          label={`${name} legality notes`}
          path={notesPath}
          value=""
        />
      ) : null}
      {footer}
    </ArticleSubsectionCard>
  );
}

function LegalityStateRow({
  article,
  name,
  info,
  flagSrc,
  city = false,
  pathParts,
}: {
  article: SubstanceArticle;
  name: string;
  info: LegalityEntry;
  flagSrc?: string;
  city?: boolean;
  /**
   * Decoded path parts addressing this entry, e.g.
   * `["legality", "usStates", "Florida"]`. Omit to leave the row read-only.
   * Every part is a data-chosen record key, so it is encoded by
   * `buildFieldPath` rather than interpolated.
   */
  pathParts?: readonly string[];
}) {
  const detailsId = useId();
  const [isExpanded, setIsExpanded] = useState(false);
  const { instrument, showInstrumentCitation } = resolveLegalityBadges(info);
  const displayText = info.notes || "";
  const notesPath = pathParts ? buildFieldPath(...pathParts, "notes") : undefined;
  // Only `usStates.*.cities.*` is allow-listed, so a city never nests further.
  const cityPathParts = pathParts && !city ? pathParts : undefined;

  return (
    <div className={city ? "min-w-0 pl-4" : "min-w-0"}>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {flagSrc && (
          <img
            src={flagSrc}
            alt={`${name} flag`}
            width={24}
            height={16}
            className="h-4 w-6 shrink-0 overflow-hidden rounded-sm object-cover object-center"
          />
        )}
        <span className="min-w-0 break-words text-xs font-medium theme-text-primary">{name}</span>
        <LegalityBadges article={article} info={info} size="xs" />
        <button
          type="button"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          aria-controls={detailsId}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? `Hide details for ${name}` : `Show details for ${name}`}
          className="theme-control-pill-faint ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dose-accent-strong"
        >
          <Icon
            icon="lucide:chevron-down"
            size={13}
            className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>
      {isExpanded && (
        <div id={detailsId} className="mt-2 min-w-0">
          {showInstrumentCitation && instrument && (
            <div
              className="min-w-0 break-words text-[11px] italic leading-relaxed theme-text-muted"
              data-testid="legality-instrument-citation"
            >
              <CitedText text={instrument} article={article} />
            </div>
          )}
          {displayText ? (
            <EditableLegalityNotes
              label={`${name} legality notes`}
              notesPath={notesPath}
              value={displayText}
            >
              <ArticleText
                as="div"
                text={displayText}
                article={article}
                tone="muted"
                className="mt-1 min-w-0 whitespace-pre-line break-words text-sm leading-relaxed theme-text-muted"
              />
            </EditableLegalityNotes>
          ) : notesPath ? (
            <EditableSlot
              className="mt-1"
              emptyLabel={`Add ${name} legality notes`}
              label={`${name} legality notes`}
              path={notesPath}
              value=""
            />
          ) : null}
          {"cities" in info && info.cities && Object.keys(info.cities).length > 0 && (
            <div className="mt-3 space-y-3 border-l border-dose-border-subtle pl-2" data-testid="legality-city-list">
              {Object.entries(info.cities).map(([cityName, cityInfo]) => (
                <LegalityStateRow
                  key={cityName}
                  article={article}
                  name={cityName}
                  info={cityInfo}
                  city
                  pathParts={cityPathParts ? [...cityPathParts, "cities", cityName] : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function USStatesFooter({
  article,
  note,
  states,
}: {
  article: SubstanceArticle;
  note?: string;
  states: [string, USStateLegality][];
}) {
  return (
    <div className="mt-4 pt-4">
      <div className="theme-horizontal-divider mb-3" />
      <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] theme-text-muted">By state</div>
      {note ? (
        <div className="mb-4 min-w-0 break-words text-sm leading-relaxed theme-text-muted" data-testid="us-states-summary">
          <EditableValue
            as="div"
            label="US states legality summary"
            path="legality.usStatesNote"
            value={note}
          >
            <CitedText text={note} article={article} />
          </EditableValue>
        </div>
      ) : (
        <EditableSlot
          className="mb-4"
          emptyLabel="Add a US states legality summary"
          label="US states legality summary"
          path="legality.usStatesNote"
          value=""
        />
      )}
      <div className="space-y-3">
        {states.map(([stateName, stateInfo]) => (
          <LegalityStateRow
            key={stateName}
            article={article}
            name={stateName}
            info={stateInfo}
            flagSrc={usStateFlagMappings[stateName as keyof typeof usStateFlagMappings]
              ? `/flags/us/${usStateFlagMappings[stateName as keyof typeof usStateFlagMappings]}`
              : undefined}
            pathParts={["legality", "usStates", stateName]}
          />
        ))}
      </div>
    </div>
  );
}

export const LegalitySection = memo(function LegalitySection({
  article,
}: LegalitySectionProps) {
  const { legality } = article;
  const hasInternational = legality.international.length > 0;
  const countries = orderCountryLegalityEntries(Object.entries(legality.countries));
  const hasCountries = countries.length > 0;
  const usStates = legality.usStates ?? {};
  const usStateEntries = Object.entries(usStates);
  const hasUsStates = usStateEntries.length > 0;

  if (!hasInternational && !hasCountries && !hasUsStates) {
    return <ArticleGapNotice article={article} section="legality" />;
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
              <EditableValue
                key={idx}
                as="div"
                label={`International legality entry ${idx + 1}`}
                path={buildFieldPath("legality", "international", idx)}
                value={item}
              >
                <ArticleText text={item} article={article} />
              </EditableValue>
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
          {countries.length > 0 && (
            <Masonry
              breakpointCols={MASONRY_BREAKPOINTS}
              className="flex w-full gap-4"
              columnClassName="flex min-w-0 flex-1 flex-col gap-4"
            >
              {countries.map(([countryName, info]) => {
                const countryCode = getCountryCode(countryName);
                return (
                  <LegalityEntryCard
                    key={countryName}
                    article={article}
                    name={countryName}
                    info={info}
                    notesPath={buildFieldPath("legality", "countries", countryName, "notes")}
                    flagSrc={countryCode ? `/flags/${countryCode}.svg` : undefined}
                    footer={countryName === "United States" && hasUsStates ? (
                      <USStatesFooter
                        article={article}
                        note={legality.usStatesNote}
                        states={usStateEntries}
                      />
                    ) : undefined}
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
