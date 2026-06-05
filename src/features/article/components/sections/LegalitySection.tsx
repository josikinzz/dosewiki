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
import { getCountryCode } from "@/utils/data/countryCodes";
import type { SubstanceArticle } from "@/schema";
import { ArticleText, CitedText } from "../CitedText";

// ============================================================================
// Status Color System
// ============================================================================

type StatusColor = "red" | "yellow" | "blue" | "green" | "gray";

const COLOR_CLASSES: Record<
  StatusColor,
  { className: string; tone: StatusColor }
> = {
  red: { className: "bg-red-500/20 text-red-300", tone: "red" },
  yellow: { className: "bg-yellow-500/20 text-yellow-300", tone: "yellow" },
  blue: { className: "bg-blue-500/20 text-blue-300", tone: "blue" },
  green: { className: "bg-emerald-500/20 text-emerald-300", tone: "green" },
  gray: { className: "theme-article-subsection-card-nested theme-text-muted", tone: "gray" },
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

interface LegalitySectionProps {
  article: SubstanceArticle;
}

export const LegalitySection = memo(function LegalitySection({
  article,
}: LegalitySectionProps) {
  const { legality } = article;
  const hasInternational = legality.international.length > 0;
  const countries = Object.entries(legality.countries);
  const hasCountries = countries.length > 0;

  if (!hasInternational && !hasCountries) {
    return null;
  }

  return (
    <ArticleSection
      id="legality"
      icon="lucide:scale"
      heading="Legality"
      headerClassName="theme-safety-priority-heading"
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
      {hasCountries && (
        <ArticleSection.Group
          icon="lucide:map-pin"
          heading="By Country"
          className="mt-4"
          headingClassName="font-semibold normal-case tracking-normal"
        >
          <Masonry
            breakpointCols={MASONRY_BREAKPOINTS}
            className="flex w-full gap-4"
            columnClassName="flex flex-col gap-4"
          >
            {countries.map(([countryName, info]) => {
              const countryCode = getCountryCode(countryName);

              // Always show status as badge when present
              const showStatusAsBadge = Boolean(info.status?.trim());

              // Display text is just the notes (status goes in badge)
              const displayText = info.notes || "";

              // Rough estimate: 4 lines at ~60 chars per line
              const isLongText = displayText.length > 240;

              // Status badge color using lookup table
              const displayStatus = info.status
                ? stripCitationTokens(info.status)
                : "";
              const statusColor = displayStatus
                ? getStatusColor(displayStatus)
                : COLOR_CLASSES.gray;

              return (
                <ArticleSubsectionCard
                  key={countryName}
                  padding="xs"
                  variant="nested"
                  className="theme-public-card-hover-quiet relative"
                >
                  {countryCode && (
                    <AppImage
                      src={`/flags/${countryCode}.svg`}
                      alt={`${countryName} flag`}
                      width={24}
                      height={24}
                      className="absolute right-3 top-3 h-6 w-6 rounded-full ring-1 ring-white/20 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4)]"
                    />
                  )}
                  <div
                    className={`flex items-center gap-2 ${countryCode ? "pr-8" : ""}`}
                  >
                    <span className="font-medium theme-text-primary">
                      {countryName}
                    </span>
                    {showStatusAsBadge && info.status && (
                      <span
                        className={`theme-status-badge rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor.className}`}
                        data-badge-tone={statusColor.tone}
                      >
                        <CitedText text={info.status} article={article} />
                      </span>
                    )}
                  </div>
                  {displayText &&
                    (isLongText ? (
                      <ExpandableText
                        ariaLabelBase={`${countryName} legality notes`}
                        className="mt-1"
                        contentClassName="whitespace-pre-line text-xs leading-[1.125rem] theme-text-muted"
                        maxLines={3}
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
                </ArticleSubsectionCard>
              );
            })}
          </Masonry>
        </ArticleSection.Group>
      )}
    </ArticleSection>
  );
});
