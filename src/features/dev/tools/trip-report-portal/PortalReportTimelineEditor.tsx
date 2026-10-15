"use client";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";
import type {
  TripReportEditableFields,
  TripReportTimelinePhase,
} from "../../../../../server/lib/tripReportEditing";

type Phase = {
  key: keyof TripReportEditableFields;
  label: string;
  addLabel: string;
  kind: "prose" | "timeline";
  dot: string;
  text: string;
};

const PHASES: readonly Phase[] = [
  {
    key: "introduction",
    label: "Introduction",
    addLabel: "Add an introduction",
    kind: "prose",
    dot: "theme-portal-prose-phase-dot",
    text: "theme-portal-prose-phase-text",
  },
  {
    key: "onset",
    label: "Onset",
    addLabel: "Add an onset entry",
    kind: "timeline",
    dot: "theme-report-phase-onset-dot",
    text: "theme-report-phase-onset-text",
  },
  {
    key: "peak",
    label: "Peak",
    addLabel: "Add a peak entry",
    kind: "timeline",
    dot: "theme-report-phase-peak-dot",
    text: "theme-report-phase-peak-text",
  },
  {
    key: "offset",
    label: "Offset",
    addLabel: "Add an offset entry",
    kind: "timeline",
    dot: "theme-report-phase-offset-dot",
    text: "theme-report-phase-offset-text",
  },
  {
    key: "conclusion",
    label: "Conclusion",
    addLabel: "Add a conclusion",
    kind: "prose",
    dot: "theme-portal-prose-phase-dot",
    text: "theme-portal-prose-phase-text",
  },
];

const GROWING_TEXT = "[field-sizing:content] max-h-[70vh] text-[16px] leading-6 md:text-sm";

export function PortalReportTimelineEditor({
  draft,
  onChange,
}: {
  draft: TripReportEditableFields;
  onChange: (next: TripReportEditableFields) => void;
}) {
  function patch(next: Partial<TripReportEditableFields>) {
    onChange({ ...draft, ...next });
  }

  function patchTimeline(
    phase: TripReportTimelinePhase,
    entries: TripReportEditableFields[TripReportTimelinePhase],
  ) {
    onChange({ ...draft, [phase]: entries });
  }

  return (
    <div className="theme-report-rail relative space-y-1 pl-8">
      {PHASES.map((phase) =>
        phase.kind === "prose" ? (
          <ProseBlock
            key={phase.key}
            phase={phase}
            value={(draft[phase.key] as string | undefined) ?? null}
            onChange={(value) => patch({ [phase.key]: value } as Partial<TripReportEditableFields>)}
          />
        ) : (
          <TimelineBlock
            key={phase.key}
            phase={phase}
            entries={draft[phase.key as TripReportTimelinePhase]}
            onChange={(entries) => patchTimeline(phase.key as TripReportTimelinePhase, entries)}
          />
        ),
      )}
    </div>
  );
}

function PhaseMarker({ tone }: { tone: string }) {
  return (
    <span
      aria-hidden="true"
      className={`theme-report-rail-marker absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full ${tone}`}
    />
  );
}

function AddButton({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="theme-portal-ghost-pill theme-focus-ring inline-flex min-h-8 items-center gap-1.5 rounded-pill border border-dashed px-3 py-1 text-xs font-medium transition-colors [@media(pointer:coarse)]:min-h-11"
    >
      <Icon icon="lucide:plus" size={13} className="shrink-0" />
      {children}
    </button>
  );
}

function PhaseHeading({ phase, count }: { phase: Phase; count?: number }) {
  return (
    <div className="relative flex items-center gap-2">
      <PhaseMarker tone={phase.dot} />
      <h4 className={`font-display text-base font-semibold ${phase.text}`}>{phase.label}</h4>
      {count !== undefined ? (
        <span className="theme-text-faint text-xs tabular-nums">
          <span className="sr-only">, </span>
          {count} {count === 1 ? "entry" : "entries"}
        </span>
      ) : null}
    </div>
  );
}

function ProseBlock({
  phase,
  onChange,
  value,
}: {
  phase: Phase;
  onChange: (value: string | undefined) => void;
  value: string | null;
}) {
  if (value === null || value === undefined) {
    return (
      <div className="relative py-2">
        <PhaseMarker tone={phase.dot} />
        <AddButton onClick={() => onChange("")}>{phase.addLabel}</AddButton>
      </div>
    );
  }

  return (
    <div className="relative py-2.5">
      <PhaseHeading phase={phase} />
      <Textarea
        aria-label={phase.label}
        value={value}
        rows={4}
        className={cn("mt-2 min-h-28", GROWING_TEXT)}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function TimelineBlock({
  phase,
  entries,
  onChange,
}: {
  phase: Phase;
  entries: TripReportEditableFields["onset"];
  onChange: (entries: TripReportEditableFields["onset"]) => void;
}) {
  const label = phase.label;
  function addEntry() {
    onChange([...entries, { description: "" }]);
  }

  if (entries.length === 0) {
    return (
      <div className="relative py-2">
        <PhaseMarker tone={phase.dot} />
        <AddButton onClick={addEntry}>{phase.addLabel}</AddButton>
      </div>
    );
  }

  return (
    <div className="relative py-2.5">
      <PhaseHeading phase={phase} count={entries.length} />

      <ol className="mt-2 space-y-4">
        {entries.map((entry, index) => (
          <li key={index} className="relative">
            <span
              aria-hidden="true"
              className={`theme-report-rail-marker theme-report-rail-marker-sm absolute top-[1.1rem] h-2 w-2 rounded-full ${phase.dot}`}
            />
            <div className="mb-1.5 flex items-center gap-1">
              <Input
                aria-label={`${label} entry ${index + 1} timestamp`}
                value={entry.time ?? ""}
                placeholder="T+0:00"
                inputSize="sm"
                className="w-28 font-mono tabular-nums"
                onChange={(event) =>
                  onChange(
                    entries.map((item, at) =>
                      at === index ? { ...item, time: event.target.value } : item,
                    ),
                  )
                }
              />
              <span className="flex-1" />
              <Button
                type="button"
                variant="iconGhost"
                size="icon"
                className={cn("size-8", TOUCH_ICON)}
                disabled={index === 0}
                aria-label={`Move ${label} entry ${index + 1} earlier`}
                title="Move earlier"
                onClick={() => onChange(swap(entries, index, index - 1))}
              >
                <Icon icon="lucide:arrow-up" size={16} />
              </Button>
              <Button
                type="button"
                variant="iconGhost"
                size="icon"
                className={cn("size-8", TOUCH_ICON)}
                disabled={index === entries.length - 1}
                aria-label={`Move ${label} entry ${index + 1} later`}
                title="Move later"
                onClick={() => onChange(swap(entries, index, index + 1))}
              >
                <Icon icon="lucide:arrow-down" size={16} />
              </Button>
              <Button
                type="button"
                variant="iconGhost"
                size="icon"
                className={cn("size-8", TOUCH_ICON)}
                aria-label={`Remove ${label} entry ${index + 1}`}
                title="Remove entry"
                onClick={() => onChange(entries.filter((_, at) => at !== index))}
              >
                <Icon icon="lucide:trash-2" size={15} />
              </Button>
            </div>
            <Textarea
              aria-label={`${label} entry ${index + 1} text`}
              value={entry.description}
              rows={2}
              className={cn("min-h-16", GROWING_TEXT)}
              onChange={(event) =>
                onChange(
                  entries.map((item, at) =>
                    at === index ? { ...item, description: event.target.value } : item,
                  ),
                )
              }
            />
          </li>
        ))}
      </ol>
      <div className="mt-3">
        <AddButton onClick={addEntry} label={`Add entry to ${label}`}>
          Add entry
        </AddButton>
      </div>
    </div>
  );
}

function swap<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
