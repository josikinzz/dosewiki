import { memo, useState } from "react";
import Masonry from "react-masonry-css";
import { Globe, MapPin, Scale } from "lucide-react";
import { SectionCard } from "../../../../common/SectionCard";
import { IconBadge } from "../../../../common/IconBadge";
import type { SubstanceArticle } from "../../../../../schema";

const MASONRY_BREAKPOINTS = {
  default: 2,
  640: 1,
};

interface PreviewLegalitySectionProps {
  article: SubstanceArticle;
}

// Country name to ISO 3166-1 alpha-2 code mapping for flags
const COUNTRY_CODES: Record<string, string> = {
  "United States": "us",
  "United Kingdom": "gb",
  "Germany": "de",
  "France": "fr",
  "Australia": "au",
  "Canada": "ca",
  "Netherlands": "nl",
  "Switzerland": "ch",
  "Austria": "at",
  "Belgium": "be",
  "Spain": "es",
  "Italy": "it",
  "Japan": "jp",
  "New Zealand": "nz",
  "Sweden": "se",
  "Norway": "no",
  "Denmark": "dk",
  "Finland": "fi",
  "Poland": "pl",
  "Portugal": "pt",
  "Brazil": "br",
  "Mexico": "mx",
  "Russia": "ru",
  "Chile": "cl",
  "China": "cn",
  "India": "in",
  "South Africa": "za",
  "Argentina": "ar",
  "Bangladesh": "bd",
  "Bulgaria": "bg",
  "Croatia": "hr",
  "Cyprus": "cy",
  "Czech Republic": "cz",
  "Djibouti": "dj",
  "Egypt": "eg",
  "Estonia": "ee",
  "Ethiopia": "et",
  "European Union": "european_union",
  "Greece": "gr",
  "Hong Kong": "hk",
  "Hungary": "hu",
  "Iceland": "is",
  "Indonesia": "id",
  "Ireland": "ie",
  "Israel": "il",
  "Kenya": "ke",
  "Latvia": "lv",
  "Lithuania": "lt",
  "Luxembourg": "lu",
  "Malaysia": "my",
  "Morocco": "ma",
  "Romania": "ro",
  "Saudi Arabia": "sa",
  "Singapore": "sg",
  "Slovakia": "sk",
  "Slovenia": "si",
  "Somalia": "so",
  "South Korea": "kr",
  "Taiwan": "tw",
  "Thailand": "th",
  "Turkey": "tr",
  "Uganda": "ug",
  "Ukraine": "ua",
  "United Arab Emirates": "ae",
  "Vietnam": "vn",
  "Yemen": "ye",
  "Zambia": "zm",
};

function getCountryCode(name: string): string | null {
  // Direct lookup
  if (COUNTRY_CODES[name]) return COUNTRY_CODES[name];

  // Handle US states (e.g., "United States - Arizona")
  if (name.startsWith("United States - ")) return "us";

  // Handle Tasmania
  if (name.includes("Tasmania")) return "au";

  return null;
}

export const PreviewLegalitySection = memo(function PreviewLegalitySection({
  article,
}: PreviewLegalitySectionProps) {
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
    <SectionCard delay={0}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon={Scale} label="Legality" />
        Legality
      </h2>

      {/* International */}
      {hasInternational && (
        <div className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
            <Globe className="h-4 w-4 text-fuchsia-200" />
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
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <MapPin className="h-4 w-4 text-fuchsia-200" />
            By Country
          </h3>
          <Masonry
            breakpointCols={MASONRY_BREAKPOINTS}
            className="flex w-full gap-3"
            columnClassName="flex flex-col gap-3"
          >
            {countries.map(([countryName, info]) => {
              // Merge status and notes into single text, avoiding duplication
              const fullText = info.notes && !info.status.includes(info.notes.slice(0, 20))
                ? `${info.status} ${info.notes}`.trim()
                : info.status || info.notes || "";

              const countryCode = getCountryCode(countryName);
              const isExpanded = expandedCards.has(countryName);
              // Rough estimate: 4 lines at ~60 chars per line
              const isLongText = fullText.length > 240;

              return (
                <div
                  key={countryName}
                  className="relative rounded-xl border border-white/10 bg-white/5 p-3"
                >
                  {countryCode && (
                    <img
                      src={`/flags/${countryCode}.svg`}
                      alt={`${countryName} flag`}
                      className="absolute right-3 top-3 h-6 w-6 rounded-full ring-1 ring-white/20 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4)]"
                    />
                  )}
                  <span className={`font-medium text-white ${countryCode ? "pr-8" : ""}`}>{countryName}</span>
                  <p className={`mt-1 text-xs text-white/70 ${!isExpanded && isLongText ? "line-clamp-4" : ""}`}>
                    {fullText}
                  </p>
                  {isLongText && (
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={() => toggleExpanded(countryName)}
                        className="text-xs text-fuchsia-400 hover:text-fuchsia-300 transition-colors"
                      >
                        {isExpanded ? "Show less" : "Show more..."}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </Masonry>
        </div>
      )}
    </SectionCard>
  );
});
