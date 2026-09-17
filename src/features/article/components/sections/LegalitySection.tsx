import { memo, type ReactNode } from "react";
import { AppImage } from "@/components/common/AppImage";
import { msg } from "@/i18n/messages";
import { stripCitationTokens } from "@/lib/citations/citationTokens";
import type {
  CountryLegality,
  SubstanceArticle,
  USStateLegality,
} from "@/schema";
import {
  CANONICAL_STATUS_LABELS,
  type CanonicalLegalStatus,
} from "@/schema/substance/legalStatuses";
import { getCountryCode } from "@/utils/data/countryCodes";
import usStateFlagMappings from "@data/substances/usStateFlagMappings.json";
import { buildFieldPath, EditableSlot, EditableValue } from "../../editing";
import { ArticleText, CitedText } from "../CitedText";
import { ArticleGapNotice } from "./ArticleGapNotice";
import {
  LegalityRowView,
  LegalitySectionView,
  ToneGroupHeading,
  type LegalityTone,
} from "./LegalitySectionView.client";

type LegalityEntry = CountryLegality | USStateLegality;
const STATUS_COLORS: Record<CanonicalLegalStatus, LegalityTone> = {
  prohibited: "red",
  analog_covered: "red",
  precursor_controlled: "yellow",
  prescription_only: "blue",
  decriminalized: "green",
  legal_regulated: "green",
  unscheduled: "gray",
  restricted_other: "yellow",
};
const EXACT: Record<string, LegalityTone> = {
  Illegal: "red",
  Prohibited: "red",
  Banned: "red",
  Forbidden: "red",
  "Schedule I": "red",
  "Schedule I (CDSA)": "red",
  "Class A": "red",
  "Controlled (narcotic)": "red",
  "Illegal (NPSG)": "red",
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
  "Prescription only": "blue",
  "Prescription required": "blue",
  "Medical use only": "blue",
  Regulated: "blue",
  Restricted: "blue",
  Legal: "green",
  Uncontrolled: "green",
  "Not controlled": "green",
  Decriminalized: "green",
  Unscheduled: "gray",
  "Not scheduled": "gray",
};
const PATTERNS: [RegExp, LegalityTone][] = [
  [/\billegal\b|\bprohibited\b|\bbanned\b|\bforbidden\b/i, "red"],
  [/\bclass\s*a\b/i, "red"],
  [/\bschedule\s*i\b(?!\s*i)/i, "red"],
  [/\bnarcotic\b/i, "red"],
  [/\bprescription\b|\bmedical\s*use\b/i, "blue"],
  [/\brestricted\b|\bregulated\b/i, "blue"],
  [/\bunscheduled\b|\bnot\s*scheduled\b/i, "gray"],
  [/\blegal\b|\buncontrolled\b|\bdecriminalized\b/i, "green"],
  [/\bnot\s*controlled\b/i, "green"],
  [/\bcontrolled\b|\bschedule\b|\bscheduled\b/i, "yellow"],
  [/\bclass\s*[b-z]\b/i, "yellow"],
  [/\banlage\b|\btabella\b|\blist\s*[ivx\d]/i, "yellow"],
  [/\bcategory\s*\d/i, "yellow"],
  [/\bverzeichnis\b|\bnpsg\b|\bbtmg\b/i, "yellow"],
];
const GROUPS: { tone: LegalityTone; label: string; title?: string }[] = [
  { tone: "red", label: msg("Illegal") },
  { tone: "yellow", label: msg("Controlled / restricted") },
  { tone: "blue", label: msg("Prescription") },
  { tone: "green", label: msg("Legal / decriminalized") },
  {
    tone: "gray",
    label: msg("Not scheduled"),
    title: msg("Not scheduled does not imply legal to possess or supply"),
  },
];

export function orderCountryLegalityEntries(
  entries: [string, CountryLegality][],
) {
  return [...entries].sort(([left], [right]) =>
    left === "United States"
      ? -1
      : right === "United States"
        ? 1
        : left.localeCompare(right),
  );
}

function badge(info: LegalityEntry) {
  const canonical = info.canonicalStatus;
  const raw = info.status ? stripCitationTokens(info.status) : "";
  let tone = canonical ? STATUS_COLORS[canonical] : EXACT[raw];
  if (!tone)
    tone = PATTERNS.find(([pattern]) => pattern.test(raw))?.[1] ?? "gray";
  return {
    tone,
    label: canonical ? CANONICAL_STATUS_LABELS[canonical] : raw,
    canonical,
    law: info.instrument?.trim() || info.designation?.trim(),
  };
}

function Row({
  article,
  name,
  info,
  variant,
  pathParts,
  flag,
  footer,
}: {
  article: SubstanceArticle;
  name: string;
  info: LegalityEntry;
  variant: "country" | "state" | "city";
  pathParts?: readonly string[];
  flag?: ReactNode;
  footer?: ReactNode;
}) {
  const resolved = badge(info);
  const note = info.notes || "";
  const renderText =
    info.citationNeeded && note ? `${note} [citation-needed]` : note;
  const notesPath = pathParts
    ? buildFieldPath(...pathParts, "notes")
    : undefined;
  const cityBase = pathParts && variant === "state" ? pathParts : undefined;
  const cities =
    "cities" in info && info.cities ? Object.entries(info.cities) : [];
  const details = (
    <>
      {resolved.canonical && resolved.law ? (
        <div
          className="min-w-0 break-words border-l border-dose-border pl-2.5 text-[11px] italic leading-relaxed theme-text-muted"
          data-testid="legality-instrument-citation"
        >
          <CitedText text={resolved.law} article={article} />
        </div>
      ) : null}
      {note ? (
        notesPath ? (
          <EditableValue
            as="div"
            label={`${name} legality notes`}
            path={notesPath}
            value={note}
          >
            <ArticleText
              as="div"
              text={renderText}
              article={article}
              tone="muted"
              className="mt-1 min-w-0 whitespace-pre-line break-words text-sm leading-relaxed theme-text-muted"
            />
          </EditableValue>
        ) : (
          <ArticleText
            as="div"
            text={renderText}
            article={article}
            tone="muted"
            className="mt-1 min-w-0 whitespace-pre-line break-words text-sm leading-relaxed theme-text-muted"
          />
        )
      ) : notesPath ? (
        <EditableSlot
          className="mt-1"
          emptyLabel={`Add ${name} legality notes`}
          label={`${name} legality notes`}
          path={notesPath}
          value=""
        />
      ) : null}
      {cities.length ? (
        <div
          className="mt-3 space-y-1 border-l border-dose-border pl-2"
          data-testid="legality-city-list"
        >
          {cities.map(([city, cityInfo]) => (
            <Row
              key={city}
              article={article}
              name={city}
              info={cityInfo}
              variant="city"
              pathParts={cityBase ? [...cityBase, "cities", city] : undefined}
            />
          ))}
        </div>
      ) : null}
      {footer}
    </>
  );
  return (
    <LegalityRowView
      name={name}
      variant={variant}
      flag={flag}
      statusTone={resolved.tone}
      statusTitle={resolved.label}
      statusLabel={
        resolved.canonical ? (
          resolved.label
        ) : info.status ? (
          <CitedText text={info.status} article={article} />
        ) : undefined
      }
      details={details}
    />
  );
}

function States({
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
      <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] theme-text-muted">
        {msg("By state")}
      </div>
      {note ? (
        <div
          className="mb-4 min-w-0 break-words text-sm leading-relaxed theme-text-muted"
          data-testid="us-states-summary"
        >
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
      <div className="space-y-1">
        {states.map(([name, info]) => {
          const file =
            usStateFlagMappings[name as keyof typeof usStateFlagMappings];
          return (
            <Row
              key={name}
              article={article}
              name={name}
              info={info}
              variant="state"
              flag={
                file ? (
                  <img
                    src={`/flags/us/${file}`}
                    alt={`${name} flag`}
                    width={24}
                    height={16}
                    loading="lazy"
                    decoding="async"
                    className="h-4 w-6 shrink-0 overflow-hidden rounded-sm object-cover object-center"
                  />
                ) : undefined
              }
              pathParts={["legality", "usStates", name]}
            />
          );
        })}
      </div>
    </div>
  );
}

export const LegalitySection = memo(function LegalitySection({
  article,
}: {
  article: SubstanceArticle;
}) {
  const legality = article.legality;
  const countries = orderCountryLegalityEntries(
    Object.entries(legality.countries),
  );
  const states = Object.entries(legality.usStates ?? {});
  if (!legality.international.length && !countries.length && !states.length)
    return <ArticleGapNotice article={article} section="legality" />;
  const international = legality.international.length ? (
    <div className="space-y-2">
      {legality.international.map((item, index) => (
        <EditableValue
          key={index}
          as="div"
          label={`International legality entry ${index + 1}`}
          path={buildFieldPath("legality", "international", index)}
          value={item}
        >
          <ArticleText text={item} article={article} />
        </EditableValue>
      ))}
    </div>
  ) : undefined;
  const groups = GROUPS.map((group) => ({
    ...group,
    entries: countries.filter(([, info]) => badge(info).tone === group.tone),
  })).filter((group) => group.entries.length);
  const countryGroups =
    countries.length || states.length ? (
      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.tone} className="min-w-0">
            <ToneGroupHeading
              label={group.label}
              count={group.entries.length}
              title={group.title}
            />
            <div className="min-w-0 sm:flex sm:gap-10">
              {[
                group.entries.slice(0, Math.ceil(group.entries.length / 2)),
                group.entries.slice(Math.ceil(group.entries.length / 2)),
              ].map((column, index) => (
                <div key={index} className="min-w-0 sm:w-0 sm:flex-1">
                  {column.map(([name, info]) => {
                    const code = getCountryCode(name);
                    return (
                      <div key={name} className="min-w-0">
                        <Row
                          article={article}
                          name={name}
                          info={info}
                          variant="country"
                          pathParts={["legality", "countries", name]}
                          flag={
                            code ? (
                              <AppImage
                                src={`/flags/${code}.svg`}
                                alt={`${name} flag`}
                                width={24}
                                height={24}
                                className="theme-country-flag h-5 w-5 shrink-0"
                              />
                            ) : undefined
                          }
                          footer={
                            name === "United States" && states.length ? (
                              <States
                                article={article}
                                note={legality.usStatesNote}
                                states={states}
                              />
                            ) : undefined
                          }
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
    ) : undefined;
  return (
    <LegalitySectionView
      internationalContent={international}
      countryGroups={countryGroups}
    />
  );
});
