"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ActionNotice,
  EditorNotice,
  EditorPanel,
  EditorStatusPill,
  TagToken,
} from "@/features/dev/components";
import type {
  TripReportEditableFields,
  TripReportTimelinePhase,
} from "../../../../../convex/lib/tripReportEditing";
import type { PortalContributorOption, PortalRow } from "./tripReportPortalModel";

/**
 * The five sections a trip report actually has (`src/types/tripReport.ts`):
 * two prose blocks around three timeline repeaters. Colours and the hanging-dot
 * spine come from the public detail page's own tokens, so an editor is looking
 * at approximately the shipped shape while editing it.
 */
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

const SUBJECT_FIELDS: { key: "age" | "gender" | "weight" | "height"; label: string }[] = [
  { key: "age", label: "Age" },
  { key: "gender", label: "Gender" },
  { key: "weight", label: "Weight" },
  { key: "height", label: "Height" },
];

export type EditorSaveRequest = {
  updates: TripReportEditableFields;
  profileKey?: string;
  confirmAuthorNameClaim?: boolean;
};

export function PortalReportEditor({
  busy,
  contributors,
  draft,
  feedback,
  onChange,
  onClose,
  onDelete,
  onDismissFeedback,
  onRevert,
  onSave,
  row,
}: {
  busy: boolean;
  contributors: readonly PortalContributorOption[];
  draft: TripReportEditableFields;
  feedback: { tone: "success" | "danger"; message: string } | null;
  onChange: (next: TripReportEditableFields) => void;
  onClose: () => void;
  onDelete: () => void;
  onDismissFeedback: () => void;
  onRevert: () => void;
  onSave: (request: EditorSaveRequest) => void;
  row: PortalRow;
}) {
  const [profileKey, setProfileKey] = useState<string | null>(null);
  const [confirmAuthorNameClaim, setConfirmAuthorNameClaim] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(row.fields),
    [draft, row.fields],
  );

  const bylineMoved = draft.subject.name.trim().toLowerCase() !== (row.fields?.subject.name ?? "").trim().toLowerCase();

  function patch(next: Partial<TripReportEditableFields>) {
    onChange({ ...draft, ...next });
  }

  function patchSubject(next: Partial<TripReportEditableFields["subject"]>) {
    onChange({ ...draft, subject: { ...draft.subject, ...next } });
  }

  function patchTimeline(
    phase: TripReportTimelinePhase,
    entries: TripReportEditableFields[TripReportTimelinePhase],
  ) {
    onChange({ ...draft, [phase]: entries });
  }

  return (
    <EditorPanel variant="default" className="flex min-h-0 flex-col">
      <header className="theme-portal-rule sticky top-0 z-10 space-y-2.5 border-b px-5 py-4 backdrop-blur">
        <div className="flex items-start gap-3">
          <label htmlFor="portal-report-title" className="sr-only">
            Report title
          </label>
          <Input
            id="portal-report-title"
            value={draft.title}
            onChange={(event) => patch({ title: event.target.value })}
            className="h-auto flex-1 border-transparent bg-transparent px-1.5 py-1 font-display text-xl font-semibold"
          />
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close editor">
            Close
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EditorStatusPill tone="success">Published</EditorStatusPill>
          {row.publicSlug ? (
            <span className="text-dose-text-ghost font-mono text-[11px]">
              /reports/{row.publicSlug}
              {row.license ? ` · ${row.license}` : ""}
              {row.profileKey ? ` · ${row.profileKey}` : ""}
            </span>
          ) : null}
          <span className="flex-1" />
          {dirty ? (
            <span className="text-dose-accent-soft text-xs">Unsaved changes</span>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-0 overflow-y-auto px-5 pb-4">
        {feedback ? (
          <div className="pt-4">
            <ActionNotice tone={feedback.tone} onDismiss={onDismissFeedback}>
              {feedback.message}
            </ActionNotice>
          </div>
        ) : null}

        <Section title="Attribution">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Field label="Author / byline" htmlFor="portal-report-author">
              <Input
                id="portal-report-author"
                list="portal-contributor-options"
                value={draft.subject.name}
                onChange={(event) => patchSubject({ name: event.target.value })}
              />
              <datalist id="portal-contributor-options">
                {contributors.map((option) => (
                  <option key={`${option.key}-${option.displayName}`} value={option.displayName} />
                ))}
              </datalist>
            </Field>
            <Field label="Contributor profile key" htmlFor="portal-report-profile-key">
              <Input
                id="portal-report-profile-key"
                value={profileKey ?? row.profileKey ?? ""}
                placeholder="Leave blank for no attribution"
                onChange={(event) => setProfileKey(event.target.value)}
              />
            </Field>
          </div>
          <p className="theme-text-faint mt-2 text-xs leading-relaxed">
            The public read path resolves a byline to a contributor page by exact name, so moving a byline
            onto a name a contributor answers to is refused until you either assign that profile&apos;s key or
            confirm publishing it unattributed.
          </p>
          {bylineMoved ? (
            <label className="theme-text-faint mt-2 flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={confirmAuthorNameClaim}
                onChange={(event) => setConfirmAuthorNameClaim(event.target.checked)}
                className="theme-replication-checkbox"
              />
              Reassign this byline even though it matches a contributor, without attributing the report
            </label>
          ) : null}
        </Section>

        <Section title="Report details">
          <div className="grid gap-x-7 gap-y-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Trip date" htmlFor="portal-report-trip-date">
                  <Input
                    id="portal-report-trip-date"
                    value={draft.subject.trip_date ?? ""}
                    placeholder="YYYY-MM-DD"
                    className="font-mono"
                    onChange={(event) => patchSubject({ trip_date: event.target.value })}
                  />
                </Field>
                <Field label="Setting" htmlFor="portal-report-setting">
                  <Input
                    id="portal-report-setting"
                    value={draft.subject.setting ?? ""}
                    onChange={(event) => patchSubject({ setting: event.target.value })}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                {SUBJECT_FIELDS.map((field) => (
                  <Field key={field.key} label={field.label} htmlFor={`portal-report-${field.key}`}>
                    <Input
                      id={`portal-report-${field.key}`}
                      value={draft.subject[field.key] ?? ""}
                      onChange={(event) => patchSubject({ [field.key]: event.target.value })}
                    />
                  </Field>
                ))}
              </div>
              <Field label="Medications" htmlFor="portal-report-medications">
                <Input
                  id="portal-report-medications"
                  value={draft.subject.medications ?? ""}
                  onChange={(event) => patchSubject({ medications: event.target.value })}
                />
              </Field>
            </div>

            <div className="min-w-0 space-y-4">
              <div>
                <FieldLabel>Tags</FieldLabel>
                <div className="theme-replication-field theme-portal-rule flex flex-wrap items-center gap-1.5 rounded-md border p-1.5">
                  {draft.tags.map((tag, index) => (
                    <TagToken
                      key={`${tag}-${index}`}
                      label={tag}
                      variant="compact"
                      removeLabel={`Remove tag ${tag}`}
                      onRemove={() => patch({ tags: draft.tags.filter((_, at) => at !== index) })}
                    />
                  ))}
                  <input
                    aria-label="Add tag"
                    value={tagDraft}
                    placeholder="Add tag…"
                    className="theme-text-primary min-w-24 flex-1 bg-transparent px-1 py-0.5 text-[13px] outline-none"
                    onChange={(event) => setTagDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && tagDraft.trim()) {
                        event.preventDefault();
                        patch({ tags: [...draft.tags, tagDraft.trim()] });
                        setTagDraft("");
                      } else if (event.key === "Backspace" && !tagDraft && draft.tags.length > 0) {
                        patch({ tags: draft.tags.slice(0, -1) });
                      }
                    }}
                  />
                </div>
              </div>

              <div>
                <FieldLabel>Substances</FieldLabel>
                <div className="space-y-1.5">
                  {draft.substances.map((substance, index) => (
                    <div key={index} className="grid grid-cols-[1.4fr_0.8fr_0.8fr_auto] gap-1.5">
                      <Input
                        aria-label={`Substance ${index + 1} name`}
                        value={substance.name}
                        placeholder="Substance"
                        onChange={(event) =>
                          patch({
                            substances: draft.substances.map((entry, at) =>
                              at === index ? { ...entry, name: event.target.value } : entry,
                            ),
                          })
                        }
                      />
                      <Input
                        aria-label={`Substance ${index + 1} dose`}
                        value={substance.dose ?? ""}
                        placeholder="Dose"
                        className="font-mono"
                        onChange={(event) =>
                          patch({
                            substances: draft.substances.map((entry, at) =>
                              at === index ? { ...entry, dose: event.target.value } : entry,
                            ),
                          })
                        }
                      />
                      <Input
                        aria-label={`Substance ${index + 1} route`}
                        value={substance.roa ?? ""}
                        placeholder="ROA"
                        onChange={(event) =>
                          patch({
                            substances: draft.substances.map((entry, at) =>
                              at === index ? { ...entry, roa: event.target.value } : entry,
                            ),
                          })
                        }
                      />
                      <Button
                        type="button"
                        variant="iconGhost"
                        size="auto"
                        className="h-9 w-9"
                        aria-label={`Remove substance ${index + 1}`}
                        onClick={() =>
                          patch({ substances: draft.substances.filter((_, at) => at !== index) })
                        }
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                  <GhostPill
                    onClick={() => patch({ substances: [...draft.substances, { name: "" }] })}
                  >
                    + substance
                  </GhostPill>
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Timeline">
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
        </Section>

        <Section title="Danger zone">
          {deleteConfirmation === null ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirmation("")}
            >
              Delete this report
            </Button>
          ) : (
            <EditorNotice
              notice={{
                tone: "danger",
                title: "Delete permanently",
                message: (
                  <div className="space-y-2">
                    <p className="text-xs leading-relaxed">
                      This removes the published report and its URL. Type its slug{" "}
                      <code className="font-mono">{row.publicSlug}</code> to confirm.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        aria-label="Type the report slug to confirm deletion"
                        value={deleteConfirmation}
                        className="w-64 font-mono"
                        onChange={(event) => setDeleteConfirmation(event.target.value)}
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={busy || deleteConfirmation.trim() !== row.publicSlug}
                        onClick={onDelete}
                      >
                        Delete
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirmation(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ),
              }}
            />
          )}
        </Section>
      </div>

      <footer className="theme-portal-rule sticky bottom-0 flex flex-wrap items-center gap-2 border-t px-5 py-3 backdrop-blur">
        <Button
          type="button"
          variant="accent"
          disabled={busy || !dirty}
          onClick={() =>
            onSave({
              updates: draft,
              // Only sent when the editor actually touched the field, so an
              // untouched panel leaves the stored attribution exactly as it was.
              ...(profileKey !== null ? { profileKey } : {}),
              ...(confirmAuthorNameClaim ? { confirmAuthorNameClaim: true } : {}),
            })
          }
        >
          {busy ? "Saving…" : "Save report"}
        </Button>
        <Button type="button" variant="ghost" disabled={busy || !dirty} onClick={onRevert}>
          Revert
        </Button>
      </footer>
    </EditorPanel>
  );
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="theme-portal-rule border-b py-4 last:border-b-0">
      <h3 className="theme-text-faint mb-2.5 font-display text-[11px] font-semibold uppercase tracking-[0.16em]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="theme-text-faint mb-1.5 block text-xs font-medium uppercase tracking-wide">
      {children}
    </span>
  );
}

function Field({
  children,
  htmlFor,
  label,
}: {
  children: React.ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor}>
        <FieldLabel>{label}</FieldLabel>
      </label>
      {children}
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
      className="theme-portal-ghost-pill inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1 text-xs transition-colors"
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
                className="h-7 w-24 px-1.5 py-0.5 font-mono text-xs"
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
                size="auto"
                className="h-7 w-7"
                disabled={index === 0}
                aria-label={`Move ${label} entry ${index + 1} earlier`}
                onClick={() => onChange(swap(entries, index, index - 1))}
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="iconGhost"
                size="auto"
                className="h-7 w-7"
                disabled={index === entries.length - 1}
                aria-label={`Move ${label} entry ${index + 1} later`}
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
