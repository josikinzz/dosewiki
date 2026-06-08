import { memo } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { PublicContentSection } from "@/components/layout/PublicContentPrimitives";
import type { TimelineEntry } from "@/types/tripReport";

type TimelinePhase = "onset" | "peak" | "offset";

interface TimelineSectionProps {
  phase: TimelinePhase;
  entries: TimelineEntry[];
}

const PHASE_CONFIG: Record<TimelinePhase, {
  label: string;
  icon: IconName;
  timeColor: string;
  dotColor: string;
}> = {
  onset: {
    label: "Onset",
    icon: "lucide:sunrise",
    timeColor: "theme-report-phase-onset-text",
    dotColor: "theme-report-phase-onset-dot",
  },
  peak: {
    label: "Peak",
    icon: "lucide:sun",
    timeColor: "theme-report-phase-peak-text",
    dotColor: "theme-report-phase-peak-dot",
  },
  offset: {
    label: "Offset",
    icon: "lucide:sunset",
    timeColor: "theme-report-phase-offset-text",
    dotColor: "theme-report-phase-offset-dot",
  },
};

/**
 * Displays a timeline section (onset, peak, or offset) with log entries.
 * Entries use an open timestamp rail so long narrative reports read like articles.
 */
export const TimelineSection = memo(function TimelineSection({
  phase,
  entries,
}: TimelineSectionProps) {
  if (entries.length === 0) {
    return null;
  }

  const config = PHASE_CONFIG[phase];

  return (
    <PublicContentSection
      layout="card"
      heading={config.label}
      icon={config.icon}
      className="space-y-5"
    >
      <ol className="space-y-0">
        {entries.map((entry, index) => (
          <li
            key={`${phase}-${index}`}
            className="grid gap-3 border-t border-dose-divider py-5 first:border-t-0 first:pt-0 sm:grid-cols-[7rem_1fr]"
          >
            <div className="flex items-center gap-2 sm:items-start sm:pt-1">
              <span className={`h-2 w-2 rounded-full ${config.dotColor}`} />
              {entry.time ? (
                <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${config.timeColor}`}>
                  <Icon icon="lucide:clock" className="theme-icon-muted h-3 w-3" />
                  {entry.time}
                </span>
              ) : (
                <span className={`text-sm font-medium ${config.timeColor}`}>
                  Entry {index + 1}
                </span>
              )}
            </div>

            <div className="min-w-0">
              <p className="theme-text-secondary whitespace-pre-line text-sm leading-relaxed md:text-base">
                {entry.description}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </PublicContentSection>
  );
});
