import { memo } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
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
 * One phase (onset, peak, or offset) of the report timeline. Renders as open
 * typography on the shared timeline rail: a phase heading marked by a large
 * dot, then entries whose timestamps hang on the rail. No card containers —
 * the narrative reads as one continuous article.
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
    <section className="relative">
      <h2 className={`relative flex items-center gap-2.5 text-xl font-bold tracking-tight ${config.timeColor}`}>
        <span className={`theme-report-rail-marker absolute -left-[2.04rem] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full ${config.dotColor}`} />
        <Icon icon={config.icon} size={22} />
        {config.label}
      </h2>
      <ol className="mt-5 space-y-6">
        {entries.map((entry, index) => (
          <li key={`${phase}-${index}`} className="relative">
            <span className={`theme-report-rail-marker absolute -left-[1.91rem] top-[0.45rem] h-2 w-2 rounded-full ${config.dotColor}`} />
            <p className={`font-mono text-xs font-medium ${config.timeColor}`}>
              {entry.time ?? `Entry ${index + 1}`}
            </p>
            <p className="theme-text-secondary mt-1.5 whitespace-pre-line text-[0.9375rem] leading-[1.75]">
              {entry.description}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
});
