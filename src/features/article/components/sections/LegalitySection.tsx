import { memo, useState } from "react";
import Masonry from "react-masonry-css";
import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/common/SectionHeader";
import { getCountryCode } from "@/utils/data/countryCodes";
import type { SubstanceArticle } from "@/schema";

// ============================================================================
// Status Color System
// ============================================================================

type StatusColor = 'red' | 'yellow' | 'blue' | 'green' | 'gray';

const COLOR_CLASSES: Record<StatusColor, string> = {
  red: 'bg-red-500/20 text-red-300',
  yellow: 'bg-yellow-500/20 text-yellow-300',
  blue: 'bg-blue-500/20 text-blue-300',
  green: 'bg-emerald-500/20 text-emerald-300',
  gray: 'bg-white/10 text-white/70',
};

// Exact matches for common statuses (case-sensitive)
const STATUS_COLOR_MAP: Record<string, StatusColor> = {
  // Red - Strictly illegal (no medical use)
  'Illegal': 'red',
  'Prohibited': 'red',
  'Banned': 'red',
  'Forbidden': 'red',
  'Schedule I': 'red',
  'Schedule I (CDSA)': 'red',
  'Class A': 'red',
  'Controlled (narcotic)': 'red',
  'Illegal (NPSG)': 'red',

  // Yellow - Controlled (regulated, has medical uses)
  'Controlled': 'yellow',
  'Controlled substance': 'yellow',
  'Controlled (Verzeichnis E)': 'yellow',
  'Controlled (NpSG)': 'yellow',
  'Scheduled': 'yellow',
  'Schedule II': 'yellow',
  'Schedule III': 'yellow',
  'Schedule III (CDSA)': 'yellow',
  'Schedule IV': 'yellow',
  'Schedule IV (CDSA)': 'yellow',
  'Schedule V': 'yellow',
  'Class B': 'yellow',
  'Class C': 'yellow',
  'Class D': 'yellow',
  'Anlage I BtMG': 'yellow',
  'Anlage II BtMG': 'yellow',
  'Anlage III BtMG': 'yellow',
  'Tabella I': 'yellow',
  'Tabella II': 'yellow',
  'Tabella III': 'yellow',
  'Tabella IV': 'yellow',
  'List I': 'yellow',
  'List II': 'yellow',
  'List III': 'yellow',
  'Category 1': 'yellow',
  'Category 2': 'yellow',
  'Category 3': 'yellow',

  // Blue - Prescription/Medical
  'Prescription only': 'blue',
  'Prescription required': 'blue',
  'Medical use only': 'blue',
  'Regulated': 'blue',
  'Restricted': 'blue',

  // Green - Legal/Uncontrolled
  'Legal': 'green',
  'Unscheduled': 'green',
  'Uncontrolled': 'green',
  'Not controlled': 'green',
  'Not scheduled': 'green',
  'Decriminalized': 'green',
};

// Pattern fallbacks for variations (checked in order)
const STATUS_PATTERNS: [RegExp, StatusColor][] = [
  // Red patterns - check first
  [/\billegal\b|\bprohibited\b|\bbanned\b|\bforbidden\b/i, 'red'],
  [/\bclass\s*a\b/i, 'red'],
  [/\bschedule\s*i\b(?!\s*i)/i, 'red'],  // Schedule I but not II/III/IV
  [/\bnarcotic\b/i, 'red'],

  // Blue patterns - prescription/medical
  [/\bprescription\b|\bmedical\s*use\b/i, 'blue'],
  [/\brestricted\b|\bregulated\b/i, 'blue'],

  // Green patterns - legal/uncontrolled
  [/\blegal\b|\bunscheduled\b|\buncontrolled\b|\bdecriminalized\b/i, 'green'],
  [/\bnot\s*(controlled|scheduled)\b/i, 'green'],

  // Yellow patterns - catch-all for controlled substances (checked last)
  [/\bcontrolled\b|\bschedule\b|\bscheduled\b/i, 'yellow'],
  [/\bclass\s*[b-z]\b/i, 'yellow'],
  [/\banlage\b|\btabella\b|\blist\s*[ivx\d]/i, 'yellow'],
  [/\bcategory\s*\d/i, 'yellow'],
  [/\bverzeichnis\b|\bnpsg\b|\bbtmg\b/i, 'yellow'],
];

function getStatusColor(status: string): string {
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
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const toggleExpanded = (countryName: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(countryName)) {
        next.delete(countryName);
      } else {
        next.add(countryName);
      }
      return next;
    });
  };

  const hasInternational = legality.international.length > 0;
  const countries = Object.entries(legality.countries);
  const hasCountries = countries.length > 0;

  if (!hasInternational && !hasCountries) {
    return null;
  }

  return (
    <div className="space-y-6 pt-12">
      <SectionHeader icon="lucide:scale" title="Legality" />

      {/* International */}
      {hasInternational && (
        <div className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-white">
            <Icon icon="lucide:globe" size={16} className="text-fuchsia-200" />
            International
          </h3>
          <div className="space-y-2">
            {legality.international.map((item, idx) => (
              <p key={idx} className="text-sm text-white/80">
                {item}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Countries */}
      {hasCountries && (
        <div className="mt-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
            <Icon icon="lucide:map-pin" size={20} className="text-fuchsia-200" />
            By Country
          </h3>
          <Masonry
            breakpointCols={MASONRY_BREAKPOINTS}
            className="flex w-full gap-3"
            columnClassName="flex flex-col gap-3"
          >
            {countries.map(([countryName, info]) => {
              const countryCode = getCountryCode(countryName);
              const isExpanded = expandedCards.has(countryName);
              const hasNotes = info.notes?.trim().length > 0;

              // Always show status as badge when present
              const showStatusAsBadge = Boolean(info.status?.trim());

              // Display text is just the notes (status goes in badge)
              const displayText = info.notes || "";

              // Rough estimate: 4 lines at ~60 chars per line
              const isLongText = displayText.length > 240;

              // Status badge color using lookup table
              const statusColor = info.status ? getStatusColor(info.status) : COLOR_CLASSES.gray;

              return (
                <div
                  key={countryName}
                  className="relative rounded-xl border border-white/10 bg-white/5 p-3 scale-100 transition-all duration-200 hover:scale-[1.02] hover:bg-white/10 hover:border-white/20 hover:shadow-lg hover:shadow-black/20"
                >
                  {countryCode && (
                    <img
                      src={`/flags/${countryCode}.svg`}
                      alt={`${countryName} flag`}
                      className="absolute right-3 top-3 h-6 w-6 rounded-full ring-1 ring-white/20 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4)]"
                    />
                  )}
                  <div className={`flex items-center gap-2 ${countryCode ? "pr-8" : ""}`}>
                    <span className="font-medium text-white">{countryName}</span>
                    {showStatusAsBadge && info.status && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor}`}>
                        {info.status}
                      </span>
                    )}
                  </div>
                  {displayText && (
                    <p className={cn(
                      "mt-1 text-xs leading-[1.125rem] text-white/70 whitespace-pre-line",
                      !isExpanded && isLongText && "max-h-[3.375rem] overflow-hidden"
                    )}>
                      {displayText}
                    </p>
                  )}
                  {isLongText && displayText && (
                    <button
                      onClick={() => toggleExpanded(countryName)}
                      className="mt-1.5 flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/60 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white/80"
                      aria-label={isExpanded ? "Collapse" : "Expand"}
                    >
                      <Icon icon="lucide:ellipsis" size={14} />
                      <Icon icon="lucide:chevron-down" size={14} className={cn("transition-transform", isExpanded && "rotate-180")} />
                    </button>
                  )}
                </div>
              );
            })}
          </Masonry>
        </div>
      )}
    </div>
  );
});
