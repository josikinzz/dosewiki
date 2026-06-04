import { memo } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { PublicContentSection } from "@/components/layout/PublicContentPrimitives";
import { Surface } from "@/components/ui/surface";
import type { TimelineEntry } from "@/types/tripReport";

type TimelinePhase = "onset" | "peak" | "offset";

interface TimelineSectionProps {
  phase: TimelinePhase;
  entries: TimelineEntry[];
  delay?: number;
}

const PHASE_CONFIG: Record<TimelinePhase, {
  label: string;
  icon: IconName;
  phaseSurface: string;
  timeColor: string;
  dotColor: string;
}> = {
  onset: {
    label: "Onset",
    icon: "lucide:sunrise",
    phaseSurface: "theme-report-phase-onset",
    timeColor: "theme-report-phase-onset-text",
    dotColor: "theme-report-phase-onset-dot",
  },
  peak: {
    label: "Peak",
    icon: "lucide:sun",
    phaseSurface: "theme-report-phase-peak",
    timeColor: "theme-report-phase-peak-text",
    dotColor: "theme-report-phase-peak-dot",
  },
  offset: {
    label: "Offset",
    icon: "lucide:sunset",
    phaseSurface: "theme-report-phase-offset",
    timeColor: "theme-report-phase-offset-text",
    dotColor: "theme-report-phase-offset-dot",
  },
};

/**
 * Displays a timeline section (onset, peak, or offset) with log entries.
 * Each entry is displayed as a styled card matching the substance article patterns.
 */
export const TimelineSection = memo(function TimelineSection({
  phase,
  entries,
  delay = 0,
}: TimelineSectionProps) {
  if (entries.length === 0) {
    return null;
  }

  const config = PHASE_CONFIG[phase];

  return (
    <PublicContentSection
      layout="card"
      delay={delay}
      heading={config.label}
      icon={config.icon}
      className={config.phaseSurface}
    >
      <div className="space-y-3">
        {entries.map((entry, index) => (
          <Surface
            key={`${phase}-${index}`}
            variant="subtle"
            padding="none"
            radius="lg"
            className={`theme-public-card-hover-quiet ${config.phaseSurface} p-4 transition`}
          >
            <div className="flex items-start gap-3">
              {/* Timeline dot/connector */}
              <div className="flex flex-col items-center pt-1.5">
                <span className={`h-2 w-2 rounded-full ${config.dotColor}`} />
                {index < entries.length - 1 && (
                  <span className="theme-divider mt-1 h-full w-px" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                {/* Time stamp */}
                {entry.time && (
                  <div className="mb-2 flex items-center gap-1.5">
                    <Icon icon="lucide:clock" className="theme-icon-muted h-3 w-3" />
                    <span className={`text-sm font-medium ${config.timeColor}`}>
                      {entry.time}
                    </span>
                  </div>
                )}

                {/* Description */}
                <p className="theme-text-secondary whitespace-pre-line text-sm leading-relaxed md:text-base">
                  {entry.description}
                </p>
              </div>
            </div>
          </Surface>
        ))}
      </div>
    </PublicContentSection>
  );
});
