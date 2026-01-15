import { memo, useState } from "react";
import Masonry from "react-masonry-css";
import { Icon } from "../common/Icon";
import { cn } from "@/lib/utils";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import { getCountryCode } from "../../utils/data/countryCodes";
import type { SubstanceArticle } from "../../schema";

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
    <SectionCard delay={0}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon="lucide:scale" label="Legality" />
        Legality
      </h2>

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
        <div>
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

              // Only show status as badge if it's short (1-2 words)
              const statusWordCount = info.status?.trim().split(/\s+/).length || 0;
              const showStatusAsBadge = statusWordCount <= 2 && hasNotes;

              // Build display text: if status is long, show it first, then notes
              let displayText: string;
              if (showStatusAsBadge) {
                displayText = info.notes || info.status;
              } else if (hasNotes) {
                displayText = `${info.status}\n\n${info.notes}`;
              } else {
                displayText = info.status;
              }

              // Rough estimate: 4 lines at ~60 chars per line
              const isLongText = displayText.length > 240;

              // Status badge color based on status text
              const statusLower = info.status?.toLowerCase() || "";
              const statusColor = statusLower.includes("illegal") || statusLower.includes("prohibited")
                ? "bg-red-500/20 text-red-300"
                : statusLower.includes("legal") || statusLower.includes("uncontrolled")
                ? "bg-emerald-500/20 text-emerald-300"
                : statusLower.includes("controlled") || statusLower.includes("schedule")
                ? "bg-amber-500/20 text-amber-300"
                : "bg-white/10 text-white/70";

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
                  <div className={`flex items-center gap-2 ${countryCode ? "pr-8" : ""}`}>
                    <span className="font-medium text-white">{countryName}</span>
                    {showStatusAsBadge && info.status && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor}`}>
                        {info.status}
                      </span>
                    )}
                  </div>
                  <p className={cn(
                    "mt-1 text-xs leading-[1.125rem] text-white/70 whitespace-pre-line",
                    !isExpanded && isLongText && "max-h-[3.375rem] overflow-hidden"
                  )}>
                    {displayText}
                  </p>
                  {isLongText && (
                    <div className="flex justify-end mt-1">
                      <button
                        onClick={() => toggleExpanded(countryName)}
                        className="flex items-center gap-0.5 text-white/50 hover:text-white/70 transition-colors"
                        aria-label={isExpanded ? "Collapse" : "Expand"}
                      >
                        <Icon icon="lucide:ellipsis" size={16} />
                        <Icon icon="lucide:chevron-down" size={16} className={cn("transition-transform", isExpanded && "rotate-180")} />
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
