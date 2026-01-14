import { memo } from "react";
import { BookOpen, FlaskConical, Stethoscope, Users, Sparkles, Globe, Lightbulb, Calendar, Award } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import type { SubstanceArticle } from "../../schema";

// Map common heading patterns to icons for visual consistency
const HEADING_ICON_MAP: Record<string, LucideIcon> = {
  // Discovery & synthesis related
  discovery: FlaskConical,
  synthesis: FlaskConical,
  origin: FlaskConical,
  invention: FlaskConical,
  creation: FlaskConical,
  development: FlaskConical,
  // Medical related
  medical: Stethoscope,
  clinical: Stethoscope,
  therapeutic: Stethoscope,
  pharmaceutical: Stethoscope,
  treatment: Stethoscope,
  // Cultural related
  cultural: Sparkles,
  counterculture: Sparkles,
  music: Sparkles,
  art: Sparkles,
  rave: Sparkles,
  psychedelic: Sparkles,
  // Indigenous/traditional
  indigenous: Globe,
  traditional: Globe,
  ceremonial: Globe,
  ritual: Globe,
  shamanic: Globe,
  // Notable figures
  notable: Users,
  figures: Users,
  people: Users,
  pioneers: Users,
  researchers: Users,
  // Timeline/history
  timeline: Calendar,
  history: Calendar,
  evolution: Calendar,
  internet: Calendar,
  era: Calendar,
  // Research/science
  research: Lightbulb,
  scientific: Lightbulb,
  studies: Lightbulb,
  // Legal/scheduling (though this should be in legality section)
  legal: Award,
  scheduling: Award,
  regulation: Award,
  recreational: Sparkles,
};

function getIconForHeading(heading: string): LucideIcon {
  const lowerHeading = heading.toLowerCase();
  
  for (const [keyword, icon] of Object.entries(HEADING_ICON_MAP)) {
    if (lowerHeading.includes(keyword)) {
      return icon;
    }
  }
  
  // Default icon if no match
  return BookOpen;
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
        <IconBadge icon={BookOpen} label="History & Culture" />
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
            const Icon = getIconForHeading(section.heading);
            return (
              <div
                key={idx}
                className="rounded-xl border border-white/10 bg-white/5 p-4"
              >
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
                  <Icon className="h-5 w-5 text-fuchsia-200" />
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
