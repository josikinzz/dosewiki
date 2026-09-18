"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ActionNotice,
  EditorNotice,
  EditorPanel,
  EditorStatusPill,
  EditorToolbar,
  TagToken,
} from "@/features/dev/components";
import type { TripReportEditableFields } from "../../../../../server/lib/tripReportEditing";
import type { PortalContributorOption, PortalRow } from "./tripReportPortalModel";
import { PortalReportTimelineEditor } from "./PortalReportTimelineEditor";

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
  contentOnly = false,
  saveLabel = "Save report",
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
  contentOnly?: boolean;
  saveLabel?: string;
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

  const saveActions = <>
    <Button
      type="button"
      variant="accent"
      disabled={busy || !dirty}
      onClick={() => onSave({
        updates: draft,
        ...(profileKey !== null ? { profileKey } : {}),
        ...(confirmAuthorNameClaim ? { confirmAuthorNameClaim: true } : {}),
      })}
    >
      {busy ? "Saving…" : saveLabel}
    </Button>
    <Button type="button" variant="ghost" disabled={busy || !dirty} onClick={onRevert}>Revert</Button>
  </>;

  return (
    <EditorPanel variant="default" className={contentOnly ? "flex min-h-0 flex-col overflow-visible" : "flex min-h-0 flex-col"}>
      <header className={contentOnly ? "theme-portal-rule space-y-2.5 border-b px-5 py-4" : "theme-portal-rule sticky top-0 z-10 space-y-2.5 border-b px-5 py-4 backdrop-blur"}>
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
            <span className={contentOnly ? "theme-text-muted break-words text-xs" : "text-dose-text-ghost font-mono text-[11px]"}>
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
      {contentOnly ? <EditorToolbar variant="sticky" className="bg-[var(--editor-panel-bg)] px-5">{saveActions}</EditorToolbar> : null}

      <div className={contentOnly ? "min-w-0 flex-1 space-y-0 px-5 pb-4 [&_input]:scroll-mt-20 [&_textarea]:scroll-mt-20 [&_button]:scroll-mt-20" : "min-h-0 flex-1 space-y-0 overflow-y-auto px-5 pb-4"}>
        {feedback ? (
          <div className="pt-4">
            <ActionNotice tone={feedback.tone} onDismiss={onDismissFeedback}>
              {feedback.message}
            </ActionNotice>
          </div>
        ) : null}

        {!contentOnly ? <Section title="Attribution">
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
        </Section> : <p className="theme-text-muted pt-4 text-sm">Attribution is unchanged. Administrative attribution and intake actions remain in the report workbench.</p>}

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
                    className="theme-text-primary min-w-24 flex-1 bg-transparent px-1 py-0.5 text-[16px] outline-none md:text-[13px]"
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
                    <div
                      key={index}
                      className={contentOnly ? "grid grid-cols-1 items-end gap-3 sm:grid-cols-2" : "grid grid-cols-1 gap-1.5 md:grid-cols-[1.4fr_0.8fr_0.8fr_auto]"}
                    >
                      <div className={contentOnly ? "min-w-0 sm:col-span-2" : "min-w-0"}>
                      {contentOnly && <label htmlFor={`portal-report-substance-${index}-name`}><FieldLabel>Name</FieldLabel></label>}
                      <Input
                        id={contentOnly ? `portal-report-substance-${index}-name` : undefined}
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
                      </div>
                      <div className="min-w-0">
                      {contentOnly && <label htmlFor={`portal-report-substance-${index}-dose`}><FieldLabel>Dose</FieldLabel></label>}
                      <Input
                        id={contentOnly ? `portal-report-substance-${index}-dose` : undefined}
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
                      </div>
                      <div className="min-w-0">
                      {contentOnly && <label htmlFor={`portal-report-substance-${index}-route`}><FieldLabel>Route</FieldLabel></label>}
                      <Input
                        id={contentOnly ? `portal-report-substance-${index}-route` : undefined}
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
                      </div>
                      <Button
                        type="button"
                        variant="iconGhost"
                        size="icon"
                        className={contentOnly ? "justify-self-end sm:col-span-2" : "justify-self-end md:justify-self-auto"}
                        aria-label={`Remove substance ${index + 1}`}
                        title="Remove substance"
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
          <PortalReportTimelineEditor draft={draft} onChange={onChange} />
        </Section>

        {!contentOnly ? <Section title="Danger zone">
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
                        className="w-full font-mono md:w-64"
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
        </Section> : null}
      </div>

      {!contentOnly ? <footer className="theme-portal-rule sticky bottom-0 flex flex-wrap items-center gap-2 border-t px-5 py-3 backdrop-blur">{saveActions}</footer> : null}
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
