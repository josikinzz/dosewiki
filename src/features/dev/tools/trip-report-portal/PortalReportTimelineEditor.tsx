"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  TripReportEditableFields,
  TripReportTimelinePhase,
} from "../../../../../server/lib/tripReportEditing";

const PHASES: {
  key: keyof TripReportEditableFields;
  label: string;
  kind: "prose" | "timeline";
  dot: string;
  text: string;
}[] = [
  {
    key: "introduction",
    label: "Introduction",
    kind: "prose",
    dot: "theme-portal-prose-phase-dot",
    text: "theme-portal-prose-phase-text",
  },
  {
    key: "onset",
    label: "Onset",
    kind: "timeline",
    dot: "theme-report-phase-onset-dot",
    text: "theme-report-phase-onset-text",
  },
  {
    key: "peak",
    label: "Peak",
    kind: "timeline",
    dot: "theme-report-phase-peak-dot",
    text: "theme-report-phase-peak-text",
  },
  {
    key: "offset",
    label: "Offset",
    kind: "timeline",
    dot: "theme-report-phase-offset-dot",
    text: "theme-report-phase-offset-text",
  },
  {
    key: "conclusion",
    label: "Conclusion / Aftermath",
    kind: "prose",
    dot: "theme-portal-prose-phase-dot",
    text: "theme-portal-prose-phase-text",
  },
];

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
    <div className="theme-report-rail relative space-y-2 pl-8">
      {PHASES.map((phase) =>
        phase.kind === "prose" ? (
          <ProseBlock
            key={phase.key}
            label={phase.label}
            dot={phase.dot}
            text={phase.text}
            value={(draft[phase.key] as string | undefined) ?? null}
            onChange={(value) => patch({ [phase.key]: value } as Partial<TripReportEditableFields>)}
          />
        ) : (
          <TimelineBlock
            key={phase.key}
            label={phase.label}
            dot={phase.dot}
            text={phase.text}
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

function GhostPill({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="theme-portal-ghost-pill inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1 text-xs transition-colors [@media(pointer:coarse)]:min-h-11"
    >
      {children}
    </button>
  );
}

function ProseBlock({
  dot,
  label,
  onChange,
  text,
  value,
}: {
  dot: string;
  label: string;
  onChange: (value: string | undefined) => void;
  text: string;
  value: string | null;
}) {
  if (value === null || value === undefined) {
    return (
      <div className="relative py-1.5">
        <PhaseMarker tone={dot} />
        <GhostPill onClick={() => onChange("")}>+ {label}</GhostPill>
      </div>
    );
  }

  return (
    <div className="relative py-2.5">
      <div className="relative flex items-center gap-2">
        <PhaseMarker tone={dot} />
        <h4 className={`font-display text-base font-semibold ${text}`}>{label}</h4>
      </div>
      <Textarea
        aria-label={label}
        value={value}
        className="mt-2 min-h-28"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function TimelineBlock({
  dot,
  entries,
  label,
  onChange,
  text,
}: {
  dot: string;
  entries: TripReportEditableFields["onset"];
  label: string;
  onChange: (entries: TripReportEditableFields["onset"]) => void;
  text: string;
}) {
  function addEntry() {
    onChange([...entries, { description: "" }]);
  }

  if (entries.length === 0) {
    return (
      <div className="relative py-1.5">
        <PhaseMarker tone={dot} />
        <GhostPill onClick={addEntry}>+ {label}</GhostPill>
      </div>
    );
  }

  return (
    <div className="relative py-2.5">
      <div className="relative flex items-center gap-2">
        <PhaseMarker tone={dot} />
        <h4 className={`font-display text-base font-semibold ${text}`}>{label}</h4>
        <span className="text-dose-text-ghost font-mono text-[11px]">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
        <span className="flex-1" />
        <Button type="button" variant="ghost" size="sm" onClick={addEntry}>
          + entry
        </Button>
      </div>

      <div className="mt-2 space-y-3">
        {entries.map((entry, index) => (
          <div key={index} className="relative">
            <span
              aria-hidden="true"
              className={`theme-report-rail-marker theme-report-rail-marker-sm absolute top-[0.55rem] h-2 w-2 rounded-full ${dot}`}
            />
            <div className="mb-1.5 flex items-center gap-1.5">
              <Input
                aria-label={`${label} entry ${index + 1} timestamp`}
                value={entry.time ?? ""}
                placeholder="T+0:00"
                className="w-full md:w-28 font-mono"
                onChange={(event) =>
                  onChange(
                    entries.map((item, at) =>
                      at === index ? { ...item, time: event.target.value } : item,
                    ),
                  )
                }
              />
              <span className="flex-1" />
              {/* Reordering within a phase, because chronology is the content. */}
              <Button
                type="button"
                variant="iconGhost"
                size="icon"
                disabled={index === 0}
                aria-label={`Move ${label} entry ${index + 1} earlier`}
                title="Move earlier"
                onClick={() => onChange(swap(entries, index, index - 1))}
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="iconGhost"
                size="icon"
                disabled={index === entries.length - 1}
                aria-label={`Move ${label} entry ${index + 1} later`}
                title="Move later"
                onClick={() => onChange(swap(entries, index, index + 1))}
              >
                ↓
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove ${label} entry ${index + 1}`}
                onClick={() => onChange(entries.filter((_, at) => at !== index))}
              >
                Remove
              </Button>
            </div>
            <Textarea
              aria-label={`${label} entry ${index + 1} text`}
              value={entry.description}
              className="min-h-28"
              onChange={(event) =>
                onChange(
                  entries.map((item, at) =>
                    at === index ? { ...item, description: event.target.value } : item,
                  ),
                )
              }
            />
          </div>
        ))}
        <GhostPill onClick={addEntry}>+ entry</GhostPill>
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
