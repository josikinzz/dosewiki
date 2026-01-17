import { memo } from "react";
import { Icon, type IconName } from "../common/Icon";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import type { TimelineEntry } from "../../types/tripReport";

type TimelinePhase = "onset" | "peak" | "offset";

interface TimelineSectionProps {
  phase: TimelinePhase;
  entries: TimelineEntry[];
  delay?: number;
}

const PHASE_CONFIG: Record<TimelinePhase, {
  label: string;
  icon: IconName;
  sectionBorder: string;
  sectionBg: string;
  iconBadgeBg: string;
  entryBorder: string;
  entryBg: string;
  timeColor: string;
  dotColor: string;
}> = {
  onset: {
    label: "Onset",
    icon: "lucide:sunrise",
    sectionBorder: "border-emerald-400/30",
    sectionBg: "bg-emerald-500/5",
    iconBadgeBg: "bg-emerald-500/20",
    entryBorder: "border-emerald-400/20",
    entryBg: "bg-emerald-500/5",
    timeColor: "text-emerald-300",
    dotColor: "bg-emerald-400",
  },
  peak: {
    label: "Peak",
    icon: "lucide:sun",
    sectionBorder: "border-fuchsia-400/30",
    sectionBg: "bg-fuchsia-500/5",
    iconBadgeBg: "bg-fuchsia-500/20",
    entryBorder: "border-fuchsia-400/20",
    entryBg: "bg-fuchsia-500/5",
    timeColor: "text-fuchsia-300",
    dotColor: "bg-fuchsia-400",
  },
  offset: {
    label: "Offset",
    icon: "lucide:sunset",
    sectionBorder: "border-violet-400/30",
    sectionBg: "bg-violet-500/5",
    iconBadgeBg: "bg-violet-500/20",
    entryBorder: "border-violet-400/20",
    entryBg: "bg-violet-500/5",
    timeColor: "text-violet-300",
    dotColor: "bg-violet-400",
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
    <SectionCard delay={delay} className={`${config.sectionBorder} ${config.sectionBg}`}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon={config.icon} label={config.label} className={config.iconBadgeBg} />
        {config.label}
      </h2>

      <div className="space-y-3">
        {entries.map((entry, index) => (
          <div
            key={`${phase}-${index}`}
            className={`rounded-xl border ${config.entryBorder} ${config.entryBg} p-4 transition hover:bg-white/5`}
          >
            <div className="flex items-start gap-3">
              {/* Timeline dot/connector */}
              <div className="flex flex-col items-center pt-1.5">
                <span className={`h-2 w-2 rounded-full ${config.dotColor}`} />
                {index < entries.length - 1 && (
                  <span className="mt-1 h-full w-px bg-white/10" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                {/* Time stamp */}
                {entry.time && (
                  <div className="mb-2 flex items-center gap-1.5">
                    <Icon icon="lucide:clock" className="h-3 w-3 text-white/40" />
                    <span className={`text-sm font-medium ${config.timeColor}`}>
                      {entry.time}
                    </span>
                  </div>
                )}

                {/* Description */}
                <p className="text-sm md:text-base leading-relaxed text-white/80 whitespace-pre-line">
                  {entry.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
});
