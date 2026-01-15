import { memo } from "react";
import { Icon, type IconName } from "../common/Icon";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import type { SubstanceArticle } from "../../schema";

// Map common heading patterns to icons for visual consistency
const HEADING_ICON_MAP: Record<string, IconName> = {
  // Discovery & synthesis related
  discovery: "lucide:flask-conical",
  synthesis: "lucide:flask-conical",
  origin: "lucide:flask-conical",
  invention: "lucide:flask-conical",
  creation: "lucide:flask-conical",
  development: "lucide:flask-conical",
  // Medical related
  medical: "lucide:stethoscope",
  clinical: "lucide:stethoscope",
  therapeutic: "lucide:stethoscope",
  pharmaceutical: "lucide:stethoscope",
  treatment: "lucide:stethoscope",
  // Cultural related
  cultural: "lucide:sparkles",
  counterculture: "lucide:sparkles",
  music: "lucide:sparkles",
  art: "lucide:sparkles",
  rave: "lucide:sparkles",
  psychedelic: "lucide:sparkles",
  // Indigenous/traditional
  indigenous: "lucide:globe",
  traditional: "lucide:globe",
  ceremonial: "lucide:globe",
  ritual: "lucide:globe",
  shamanic: "lucide:globe",
  // Notable figures
  notable: "lucide:users",
  figures: "lucide:users",
  people: "lucide:users",
  pioneers: "lucide:users",
  researchers: "lucide:users",
  // Timeline/history
  timeline: "lucide:calendar",
  history: "lucide:calendar",
  evolution: "lucide:calendar",
  internet: "lucide:calendar",
  era: "lucide:calendar",
  // Research/science
  research: "lucide:lightbulb",
  scientific: "lucide:lightbulb",
  studies: "lucide:lightbulb",
  // Legal/scheduling (though this should be in legality section)
  legal: "lucide:award",
  scheduling: "lucide:award",
  regulation: "lucide:award",
  recreational: "lucide:sparkles",
};

function getIconForHeading(heading: string): IconName {
  const lowerHeading = heading.toLowerCase();
  
  for (const [keyword, icon] of Object.entries(HEADING_ICON_MAP)) {
    if (lowerHeading.includes(keyword)) {
      return icon;
    }
  }
  
  // Default icon if no match
  return "lucide:book-open";
}

interface HistoryCultureSectionProps {
  article: SubstanceArticle;
}

export const HistoryCultureSection = memo(function HistoryCultureSection({
  article,
}: HistoryCultureSectionProps) {
  const { history_culture } = article;

  // Return null if history_culture is not present (optional field)
  if (!history_culture) {
    return null;
  }

  const hasContent = history_culture.content?.trim().length > 0;
  
  // Filter out empty sections
  const sections = history_culture.sections?.filter(
    (section) => section.heading.trim().length > 0 && section.content.trim().length > 0
  ) ?? [];

  // Nothing to show
  if (!hasContent && sections.length === 0) {
    return null;
  }

  return (
    <SectionCard delay={0}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon="lucide:book-open" label="History & Culture" />
        History & Culture
      </h2>

      {/* Freeform content (no subsections) */}
      {hasContent && sections.length === 0 && (
        <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">
          {history_culture.content}
        </p>
      )}

      {/* Subsections as stacked cards */}
      {sections.length > 0 && (
        <div className="flex flex-col gap-4">
          {sections.map((section, idx) => {
            const sectionIcon = getIconForHeading(section.heading);
            return (
              <div
                key={idx}
                className="rounded-xl border border-white/10 bg-white/5 p-4"
              >
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
                  <Icon icon={sectionIcon} size={20} className="text-fuchsia-200" />
                  {section.heading}
                </h3>
                <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{section.content}</p>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
});
