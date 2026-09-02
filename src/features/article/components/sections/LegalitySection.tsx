"use client";

import { memo, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { ArticleSection } from "@/components/common/ArticleSection";
import { AppImage } from "@/components/common/AppImage";
import { ExpandButton } from "@/components/common/ExpandButton";
import { cn } from "@/lib/utils";
import { stripCitationTokens } from "@/lib/citations/citationTokens";
import usStateFlagMappings from "@/data/mappings/usStateFlagMappings.json";
// Deep-import the Zod-free status type instead of `@/schema/substance/shared`,
// which would drag the Zod graph into this client component's bundle.
import { CANONICAL_STATUS_LABELS, type CanonicalLegalStatus } from "@/schema/substance/legalStatuses";
import { SUBSTANCE_SECTION_ICONS } from "@/schema/substance/sectionManifest";
import { getCountryCode } from "@/utils/data/countryCodes";
import type { CountryLegality, SubstanceArticle, USStateLegality } from "@/schema";
import { buildFieldPath, EditableSlot, EditableValue } from "../../editing";
import { ArticleText, CitedText } from "../CitedText";
import { ArticleGapNotice } from "./ArticleGapNotice";

// ============================================================================
// Status Color System
// ============================================================================

type StatusColor = "red" | "yellow" | "blue" | "green" | "gray";

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

const CANONICAL_STATUS_COLORS: Record<CanonicalLegalStatus, StatusColor> = {
  prohibited: "red",
  analog_covered: "red",
  precursor_controlled: "yellow",
  prescription_only: "blue",
  decriminalized: "green",
  legal_regulated: "green",
  unscheduled: "gray",
  restricted_other: "yellow",
};

const CANONICAL_STATUS_DISPLAY = Object.fromEntries(
  Object.entries(CANONICAL_STATUS_LABELS).map(([status, label]) => [
    status,
    { label, color: CANONICAL_STATUS_COLORS[status as CanonicalLegalStatus] },
  ]),
) as Record<CanonicalLegalStatus, { label: string; color: StatusColor }>;

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

  // Green - Affirmatively legal/uncontrolled
  Legal: "green",
  Uncontrolled: "green",
  "Not controlled": "green",
  Decriminalized: "green",

  // Gray - Unscheduled status does not imply legality
  Unscheduled: "gray",
  "Not scheduled": "gray",
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

  // Gray patterns - unscheduled status does not imply legality
  [/\bunscheduled\b|\bnot\s*scheduled\b/i, "gray"],

  // Green patterns - affirmatively legal/uncontrolled
  [/\blegal\b|\buncontrolled\b|\bdecriminalized\b/i, "green"],
  [/\bnot\s*controlled\b/i, "green"],

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

/**
 * The country list renders as one group per tone, ordered most restrictive
 * first. Headers name the tone family, not any specific status string, and
 * double as the aggregate summary via each group's count.
 */
const TONE_GROUPS: { tone: StatusColor; label: string; title?: string }[] = [
  { tone: "red", label: "Illegal" },
  { tone: "yellow", label: "Controlled / restricted" },
  { tone: "blue", label: "Prescription" },
  { tone: "green", label: "Legal / decriminalized" },
  {
    tone: "gray",
    label: "Not scheduled",
    title: "Not scheduled does not imply legal to possess or supply",
  },
];

export function orderCountryLegalityEntries(
  entries: [string, CountryLegality][],
) {
  return [...entries].sort(([left], [right]) => {
    if (left === "United States") return -1;
    if (right === "United States") return 1;
    return left.localeCompare(right);
  });
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

type StatusSize = "sm" | "xs";

/**
 * Statuses render as tone-colored text, not pills: real status labels run
 * long and a wrapping pill breaks the one-line row. Tone arrives via
 * `theme-status-text`, which colors the label and its `bg-current` tick from
 * the same semantic inks as the badge tones, keyed off `data-badge-tone`.
 * The statutory instrument stays out of the collapsed row entirely; it
 * renders as the quote-styled law line once the row is expanded.
 */
const STATUS_SIZE_CLASSES: Record<StatusSize, string> = {
  sm: "text-[10px] tracking-[0.09em]",
  xs: "text-[9px] tracking-[0.08em]",
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
  // The expanded law line prefers the full statutory instrument; an explicit
  // designation stands in when no instrument was recorded.
  const lawText = info.instrument?.trim() || info.designation?.trim();

  return {
    canonicalStatus,
    statusColor,
    hasStatusBadge: Boolean(canonicalStatus || info.status?.trim()),
    statusLabel: canonicalStatus ? canonicalStatus.label : displayStatus,
    lawText,
    showLaw: Boolean(canonicalStatus && lawText),
  };
}

function LegalityStatusLine({
  article,
  info,
  size,
}: {
  article: SubstanceArticle;
  info: LegalityEntry;
  size: StatusSize;
}) {
  const { canonicalStatus, hasStatusBadge, statusColor, statusLabel } =
    resolveLegalityBadges(info);

  return (
    <>
      {hasStatusBadge && (
        <span
          className={cn(
            "theme-status-text inline-flex max-w-[60%] shrink-0 items-center gap-1.5 font-semibold uppercase",
            STATUS_SIZE_CLASSES[size],
          )}
          data-badge-tone={statusColor.tone}
          title={statusLabel || undefined}
        >
          <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-current" />
          <span className="truncate">
            {canonicalStatus ? canonicalStatus.label : <CitedText text={info.status} article={article} />}
          </span>
        </span>
      )}
    </>
  );
}

type LegalityRowVariant = "country" | "state" | "city";

const ROW_VARIANT: Record<
  LegalityRowVariant,
  {
    header: string;
    name: string;
    statusSize: StatusSize;
    toggle: string;
    details: string;
  }
> = {
  country: {
    header: "flex min-w-0 items-center gap-2 rounded-lg py-2.5 transition-colors hover:bg-dose-surface-muted/40",
    name: "shrink-0 whitespace-nowrap text-sm font-medium theme-text-primary",
    statusSize: "sm",
    toggle: "px-2 py-1",
    details: "min-w-0 pb-3 pl-7",
  },
  state: {
    header: "-mx-2 flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-dose-surface-muted/40",
    name: "shrink-0 whitespace-nowrap text-xs font-medium theme-text-primary",
    statusSize: "xs",
    toggle: "px-1.5 py-0.5",
    details: "mt-2 min-w-0",
  },
  city: {
    header: "-mx-2 flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-dose-surface-muted/40",
    name: "shrink-0 whitespace-nowrap text-xs font-medium theme-text-primary",
    statusSize: "xs",
    toggle: "px-1.5 py-0.5",
    details: "mt-2 min-w-0",
  },
};

/**
 * One collapsible legality row: flag + name + status badges + chevron, with
 * the instrument citation, prose note, nested rows, and any footer behind the
 * disclosure. Collapsed details stay in the DOM (upgraded to
 * `hidden="until-found"` after hydration) so find-in-page still matches the
 * prose and, in supporting browsers, `beforematch` expands the row.
 */
function LegalityRow({
  article,
  name,
  info,
  flag,
  variant,
  pathParts,
  footer,
}: {
  article: SubstanceArticle;
  name: string;
  info: LegalityEntry;
  flag?: ReactNode;
  variant: LegalityRowVariant;
  /**
   * Decoded path parts addressing this entry, e.g.
   * `["legality", "usStates", "Florida"]`. Omit to leave the row read-only.
   * Every part is a data-chosen record key, so it is encoded by
   * `buildFieldPath` rather than interpolated.
   */
  pathParts?: readonly string[];
  footer?: ReactNode;
}) {
  const detailsId = useId();
  const detailsRef = useRef<HTMLDivElement | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const { lawText, showLaw } = resolveLegalityBadges(info);
  const styles = ROW_VARIANT[variant];
  const displayText = info.notes || "";
  // Entry-level citationNeeded renders as the same free-floating gray
  // `[citation-needed]` marker used in article prose, appended to the note so
  // CitedText's suppression rules apply (a note ending on a resolved citation
  // shows no marker). The raw note - not the sentinel - seeds the editor.
  const renderText = info.citationNeeded && displayText
    ? `${displayText} [citation-needed]`
    : displayText;
  const notesPath = pathParts ? buildFieldPath(...pathParts, "notes") : undefined;
  // Only `usStates.*.cities.*` is allow-listed, so a city never nests further.
  const cityPathParts = pathParts && variant === "state" ? pathParts : undefined;

  useEffect(() => {
    const el = detailsRef.current;
    if (!el) return;
    const expand = () => setIsExpanded(true);
    el.addEventListener("beforematch", expand);
    return () => el.removeEventListener("beforematch", expand);
  }, []);

  // SSR emits the boolean `hidden`; after hydration the collapsed state is
  // expressed as `hidden="until-found"`. React never rewrites the attribute
  // while `hidden` stays `true` in JSX, so the upgrade survives re-renders.
  useEffect(() => {
    const el = detailsRef.current;
    if (!el) return;
    if (isExpanded) {
      el.removeAttribute("hidden");
    } else {
      el.setAttribute("hidden", "until-found");
    }
  }, [isExpanded]);

  return (
    <div
      className={cn(
        "min-w-0",
        variant === "city" && "pl-4",
        // Countries carry no divider; a collapsed row is delimited by its
        // flag and rhythm alone, and an expanded row becomes a soft nested
        // surface that contains its law line, prose, and state rows. The
        // constant -mx-2/px-2 geometry keeps text aligned in both states.
        variant === "country" && "-mx-2 rounded-xl px-2 transition-colors",
        variant === "country" && isExpanded && "my-1 bg-dose-surface-muted/55",
      )}
    >
      {/*
        The whole header toggles: the chevron alone is a small, distant
        target. Links inside the status line keep their own behavior, and the
        nested ExpandButton remains the accessible keyboard control, so the
        div's pointer handler is a pointer-only convenience enlargement.
      */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className={cn(styles.header, "cursor-pointer select-none")}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a, button")) return;
          setIsExpanded((expanded) => !expanded);
        }}
      >
        {flag}
        <span className={styles.name}>{name}</span>
        <LegalityStatusLine article={article} info={info} size={styles.statusSize} />
        <ExpandButton
          variant="faint"
          isExpanded={isExpanded}
          onToggle={() => setIsExpanded((expanded) => !expanded)}
          ariaControls={detailsId}
          ariaLabel={isExpanded ? `Hide details for ${name}` : `Show details for ${name}`}
          className={cn("shrink-0", styles.toggle)}
        />
      </div>
      <div id={detailsId} ref={detailsRef} hidden className={styles.details}>
        {showLaw && lawText && (
          <div
            className="min-w-0 break-words border-l border-dose-border pl-2.5 text-[11px] italic leading-relaxed theme-text-muted"
            data-testid="legality-instrument-citation"
          >
            <CitedText text={lawText} article={article} />
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
              text={renderText}
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
          <div className="mt-3 space-y-1 border-l border-dose-border pl-2" data-testid="legality-city-list">
            {Object.entries(info.cities).map(([cityName, cityInfo]) => (
              <LegalityRow
                key={cityName}
                article={article}
                name={cityName}
                info={cityInfo}
                variant="city"
                pathParts={cityPathParts ? [...cityPathParts, "cities", cityName] : undefined}
              />
            ))}
          </div>
        )}
        {footer}
      </div>
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
      <div className="space-y-1">{states.map(([stateName, stateInfo]) => {
        // Mapping values carry the file extension: detailed seal flags are
        // rasterized to small webp (they render at 24x16); simple geometric
        // flags stay as tiny svg.
        const flagFile = usStateFlagMappings[stateName as keyof typeof usStateFlagMappings];
        return (
          <LegalityRow
            key={stateName}
            article={article}
            name={stateName}
            info={stateInfo}
            variant="state"
            flag={flagFile ? (
              <img
                src={`/flags/us/${flagFile}`}
                alt={`${stateName} flag`}
                width={24}
                height={16}
                loading="lazy"
                decoding="async"
                className="h-4 w-6 shrink-0 overflow-hidden rounded-sm object-cover object-center"
              />
            ) : undefined}
            pathParts={["legality", "usStates", stateName]}
          />
        );
      })}</div>
    </div>
  );
}

/**
 * Overline header for one tone group: label, count, and a gradient rule that
 * fades out to the right, matching the section-heading hairline.
 */
function ToneGroupHeading({ label, count, title }: { label: string; count: number; title?: string }) {
  return (
    <div className="mb-1 flex items-center gap-2" title={title}>
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] theme-text-muted">
        {label}
      </span>
      <span className="font-mono text-[10px] tabular-nums theme-text-faint">{count}</span>
      <div aria-hidden className="theme-horizontal-divider flex-1" />
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

  const toneGroups = TONE_GROUPS.map((group) => ({
    ...group,
    entries: countries.filter(
      ([, info]) => resolveLegalityBadges(info).statusColor.tone === group.tone,
    ),
  })).filter((group) => group.entries.length > 0);

  if (!hasInternational && !hasCountries && !hasUsStates) {
    return <ArticleGapNotice article={article} section="legality" />;
  }

  return (
    <ArticleSection
      id="legality"
      icon={SUBSTANCE_SECTION_ICONS["legality"]}
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
          {hasCountries && (
            <div className="space-y-6">
              {toneGroups.map((group) => (
                <section key={group.tone} className="min-w-0">
                  <ToneGroupHeading
                    label={group.label}
                    count={group.entries.length}
                    title={group.title}
                  />
                  {/*
                    Two independently flowing columns, split column-major so
                    each column reads alphabetically top to bottom. Unlike a
                    shared grid, expanding a row only grows its own column;
                    the neighbor never gains phantom space.
                  */}
                  <div className="min-w-0 sm:flex sm:gap-10">
                    {[
                      group.entries.slice(0, Math.ceil(group.entries.length / 2)),
                      group.entries.slice(Math.ceil(group.entries.length / 2)),
                    ].map((column, columnIndex) => (
                      <div key={columnIndex} className="min-w-0 sm:w-0 sm:flex-1">
                        {column.map(([countryName, info]) => {
                          const countryCode = getCountryCode(countryName);
                          return (
                            <div key={countryName} className="min-w-0">
                              <LegalityRow
                                article={article}
                                name={countryName}
                                info={info}
                                variant="country"
                                pathParts={["legality", "countries", countryName]}
                                flag={countryCode ? (
                                  <AppImage
                                    src={`/flags/${countryCode}.svg`}
                                    alt={`${countryName} flag`}
                                    width={24}
                                    height={24}
                                    className="theme-country-flag h-5 w-5 shrink-0"
                                  />
                                ) : undefined}
                                footer={countryName === "United States" && hasUsStates ? (
                                  <USStatesFooter
                                    article={article}
                                    note={legality.usStatesNote}
                                    states={usStateEntries}
                                  />
                                ) : undefined}
                              />
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </ArticleSection.Group>
      )}
    </ArticleSection>
  );
});
