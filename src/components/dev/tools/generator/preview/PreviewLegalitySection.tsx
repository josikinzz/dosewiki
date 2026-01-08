import { memo } from "react";
import Masonry from "react-masonry-css";
import { Globe, Scale } from "lucide-react";
import { SectionCard } from "../../../../common/SectionCard";
import { IconBadge } from "../../../../common/IconBadge";
import type { GeneratedArticle } from "../../../../../types/generatorSchema";

const MASONRY_BREAKPOINTS = {
  default: 3,
  1024: 2,
  640: 1,
};

interface PreviewLegalitySectionProps {
  article: GeneratedArticle;
}

// Country code to full name mapping
const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  UK: "United Kingdom",
  DE: "Germany",
  FR: "France",
  AU: "Australia",
  CA: "Canada",
  NL: "Netherlands",
  CH: "Switzerland",
  AT: "Austria",
  BE: "Belgium",
  ES: "Spain",
  IT: "Italy",
  JP: "Japan",
  NZ: "New Zealand",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  PL: "Poland",
  PT: "Portugal",
  BR: "Brazil",
  MX: "Mexico",
  RU: "Russia",
  CN: "China",
  IN: "India",
  ZA: "South Africa",
};

function getCountryName(code: string): string {
  return COUNTRY_NAMES[code] || code;
}

export const PreviewLegalitySection = memo(function PreviewLegalitySection({
  article,
}: PreviewLegalitySectionProps) {
  const { legality } = article;

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
          <ul className="space-y-1">
            {legality.international.map((item, idx) => (
              <li key={idx} className="flex items-center gap-2 text-sm text-white/80">
                <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Countries */}
      {hasCountries && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-white">By Country</h3>
          <Masonry
            breakpointCols={MASONRY_BREAKPOINTS}
            className="flex w-full gap-3"
            columnClassName="flex flex-col gap-3"
          >
            {countries.map(([code, info]) => (
              <div
                key={code}
                className="rounded-xl border border-white/10 bg-white/5 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white">{getCountryName(code)}</span>
                  <span className="text-xs text-white/40">{code}</span>
                </div>
                <p className="mt-1 text-sm text-white/80">{info.status}</p>
                {info.notes && (
                  <p className="mt-1 text-xs text-white/50">{info.notes}</p>
                )}
              </div>
            ))}
          </Masonry>
        </div>
      )}
    </SectionCard>
  );
});
