"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { EditorField, EditorSelect, EditorStatusPill, Notice, type EditorStatusPillTone } from "@/features/dev/components";
import { RelativeDay } from "@/features/dev/tools/home/homeParts";
import type { ReviewFlag, ReviewFlagSeverity } from "@/schema";
import { CANONICAL_REVIEW_FLAG_LABELS } from "@/schema/substance/editorial";
import { ARTICLE_SECTION_CATALOG } from "@/schema/substance/sectionCatalog";
import { describeReviewRefusal } from "./reviewDockModel";

/** Ties the dock's toggle `aria-controls` to the panel region. */
export const NOTES_PANEL_ID = "review-notes-panel";

const FLAG_SEVERITY_TONE: Record<ReviewFlagSeverity, EditorStatusPillTone> = {
  major: "danger",
  minor: "caution",
  note: "info",
};

const FLAG_SEVERITY_LABEL: Record<ReviewFlagSeverity, string> = {
  major: "Major",
  minor: "Minor",
  note: "Note",
};

const SEVERITY_OPTIONS = [
  { value: "major", label: "Major" },
  { value: "minor", label: "Minor" },
  { value: "note", label: "Note" },
];

const SECTION_OPTIONS = [
  { value: "", label: "Whole article" },
  ...ARTICLE_SECTION_CATALOG.map(({ id, label }) => ({ value: id, label })),
];

const SECTION_LABELS = new Map(ARTICLE_SECTION_CATALOG.map((section) => [section.id, section.label]));

function labelWordCount(label: string): number {
  return label.trim().split(/\s+/).filter(Boolean).length;
}

/** Why Add flag is off, in words, or null when it can run. */
function flagLabelProblem(label: string): string | null {
  const words = labelWordCount(label);
  if (words === 0) return null;
  return words > 3 ? `That label has ${words} words; a flag label has one to three.` : null;
}

/** What the reviewer typed and has not added yet; kept per article by the workbench. */
export interface NotesDraft {
  note: string;
  label: string;
  severity: ReviewFlagSeverity;
  section: string;
}

const EMPTY_DRAFT: NotesDraft = { note: "", label: "", severity: "minor", section: "" };

export function isEmptyNotesDraft(draft: NotesDraft): boolean {
  return !draft.note.trim() && !draft.label.trim() && draft.severity === "minor" && !draft.section;
}

export interface ReviewNotesPanelProps {
  slug: string;
  name: string;
  /** The article's Review Flags as last read or written. */
  flags: readonly ReviewFlag[];
  /** Called with the full flag list the route returned after a write. */
  onFlagsChange: (slug: string, flags: ReviewFlag[]) => void;
  onClose: () => void;
  /** The draft to open with, and where each edit to it is reported. */
  draft?: NotesDraft;
  onDraftChange?: (slug: string, draft: NotesDraft) => void;
}

/**
 * Where a reviewer records why an article is held back: a note plus a Review
 * Flag, written through the editorial review route's `add-flag` and
 * `delete-flag` actions. Each write is immediate; flags stay advisory and never
 * block marking an article reviewed.
 *
 * It opens inside the review dock, over the article at the place the reviewer
 * is reading, so writing a note never scrolls the page away from the passage
 * it is about. Its body scrolls on its own.
 */
export function ReviewNotesPanel({ slug, name, flags, onFlagsChange, onClose, draft, onDraftChange }: ReviewNotesPanelProps) {
  const start = draft ?? EMPTY_DRAFT;
  const [note, setNote] = useState(start.note);
  const [label, setLabel] = useState(start.label);
  const [severity, setSeverity] = useState<ReviewFlagSeverity>(start.severity);
  const [section, setSection] = useState(start.section);
  // Every edit is handed up, so closing the panel or moving on keeps it.
  useEffect(() => {
    onDraftChange?.(slug, { note, label, severity, section });
  }, [label, note, onDraftChange, section, severity, slug]);
  const [saving, setSaving] = useState<"add" | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // F opens the panel to write, so the cursor starts in the note, without
  // scrolling the article the note is about.
  useEffect(() => {
    noteRef.current?.focus({ preventScroll: true });
  }, []);

  const writeFlags = async (body: Record<string, unknown>, fallback: string, pending: string) => {
    setSaving(pending);
    setError(null);
    setAdded(null);
    try {
      const response = await fetch("/api/dev/editorial-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...body }),
      });
      const payload = (await response.json().catch(() => null)) as { flags?: ReviewFlag[]; error?: string } | null;
      if (!response.ok || !payload?.flags) throw new Error(describeReviewRefusal(response.status, payload, fallback).message);
      onFlagsChange(slug, payload.flags);
      return true;
    } catch (writeError) {
      setError(writeError instanceof Error ? writeError.message : fallback);
      return false;
    } finally {
      setSaving(null);
    }
  };

  const words = labelWordCount(label);
  const labelValid = words >= 1 && words <= 3;
  const problem = flagLabelProblem(label);

  const addFlag = async () => {
    const trimmed = label.trim();
    const ok = await writeFlags(
      { action: "add-flag", flag: { label: trimmed, severity, note, ...(section ? { section } : {}) } },
      "Unable to add the flag.",
      "add",
    );
    if (ok) {
      setNote("");
      setLabel("");
      setSeverity("minor");
      setSection("");
      setAdded(trimmed);
    }
  };

  const deleteFlag = (flag: ReviewFlag) =>
    void writeFlags(
      { action: "delete-flag", identity: { created_at: flag.created_at, label: flag.label, source: flag.source } },
      "Unable to delete the flag.",
      `${flag.source}-${flag.created_at}-${flag.label}`,
    );

  const headingId = `${NOTES_PANEL_ID}-heading`;

  return (
    <section
      id={NOTES_PANEL_ID}
      aria-label="Notes and flags"
      className="theme-review-drawer rounded-card border"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onClose();
      }}
    >
      <div className="flex items-center gap-3 border-b border-dose-border px-4 py-2">
        <h2 id={headingId} className="theme-text-primary min-w-0 flex-1 text-sm font-semibold">
          Notes and flags <span className="theme-text-muted font-normal">for {name}</span>
        </h2>
        <p className="theme-text-faint hidden text-xs md:block">Each flag saves when you add it. Flags never block a review.</p>
        <Button
          variant="iconClose"
          size="auto"
          className={TOUCH_ICON}
          onClick={onClose}
          title="Close notes and flags (F or Esc)"
          aria-label="Close notes and flags"
        >
          <Icon icon="lucide:x" size={15} />
        </Button>
      </div>

      <div className="max-h-[min(52dvh,30rem)] overflow-y-auto overscroll-contain">
        <div className="grid gap-x-6 gap-y-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <form
            className="min-w-0 space-y-3"
            aria-labelledby={headingId}
            onSubmit={(event) => {
              event.preventDefault();
              if (labelValid && !saving) void addFlag();
            }}
          >
            <EditorField label="Note" htmlFor={`${NOTES_PANEL_ID}-note`} description="Saved with the flag you add. It stays here if you close the panel.">
              <Textarea
                ref={noteRef}
                id={`${NOTES_PANEL_ID}-note`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Why is this article held back? What is left to check?"
                className="min-h-20 text-[16px] [field-sizing:content] max-h-[40vh] md:text-sm"
              />
            </EditorField>
            <div className="grid gap-3 sm:grid-cols-3">
              <EditorField
                label="Flag label"
                htmlFor={`${NOTES_PANEL_ID}-label`}
                description={problem ? undefined : "One to three words."}
                error={problem ?? undefined}
              >
                {(controlProps) => (
                  <>
                    <Input
                      {...controlProps}
                      list={`${NOTES_PANEL_ID}-labels`}
                      value={label}
                      onChange={(event) => setLabel(event.target.value)}
                      placeholder="missing citations"
                      autoComplete="off"
                      className="text-[16px] md:text-sm"
                    />
                    <datalist id={`${NOTES_PANEL_ID}-labels`}>
                      {CANONICAL_REVIEW_FLAG_LABELS.map((value) => <option key={value} value={value} />)}
                    </datalist>
                  </>
                )}
              </EditorField>
              <EditorField label="Severity" htmlFor={`${NOTES_PANEL_ID}-severity`}>
                <EditorSelect
                  id={`${NOTES_PANEL_ID}-severity`}
                  value={severity}
                  onChange={(event) => setSeverity(event.target.value as ReviewFlagSeverity)}
                  options={SEVERITY_OPTIONS}
                />
              </EditorField>
              <EditorField label="Section" htmlFor={`${NOTES_PANEL_ID}-section`}>
                <EditorSelect
                  id={`${NOTES_PANEL_ID}-section`}
                  value={section}
                  onChange={(event) => setSection(event.target.value)}
                  options={SECTION_OPTIONS}
                />
              </EditorField>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant={labelValid ? "accent" : "outline"} size="sm" disabled={saving !== null || !labelValid}>
                {saving === "add" ? "Adding" : "Add flag"}
              </Button>
              {!labelValid && !problem ? (
                <p className="theme-text-faint text-xs">Name the flag to add it; the note is optional.</p>
              ) : null}
              {added ? (
                <p role="status" className="theme-text-secondary flex items-center gap-1.5 text-xs">
                  <Icon icon="lucide:check" size={13} className="theme-review-success-text" aria-hidden />
                  Added “{added}”.
                </p>
              ) : null}
            </div>
            {error ? <Notice tone="danger" message={error} className="text-sm" /> : null}
          </form>

          <div className="min-w-0 space-y-2">
            <h3 className="type-meta-label theme-text-muted">
              On this article{flags.length > 0 ? <span className="tabular-nums">, {flags.length}</span> : null}
            </h3>
            {flags.length > 0 ? (
              <ul className="divide-y divide-[var(--theme-border-subtle)]">
                {flags.map((flag) => {
                  const key = `${flag.source}-${flag.created_at}-${flag.label}`;
                  return (
                    <li key={key} className="space-y-1 py-2.5 first:pt-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="theme-text-primary text-sm font-semibold">{flag.label}</span>
                        <EditorStatusPill inline tone={FLAG_SEVERITY_TONE[flag.severity]}>
                          {FLAG_SEVERITY_LABEL[flag.severity]}
                        </EditorStatusPill>
                        {flag.section ? (
                          <span className="theme-text-muted text-xs">{SECTION_LABELS.get(flag.section) ?? flag.section}</span>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghostDestructive"
                          size="sm"
                          className="ml-auto"
                          disabled={saving !== null}
                          onClick={() => deleteFlag(flag)}
                          aria-label={`Delete flag ${flag.label}`}
                        >
                          <Icon icon="lucide:trash-2" size={14} />
                          {saving === key ? "Deleting" : "Delete"}
                        </Button>
                      </div>
                      <p className="theme-text-secondary whitespace-pre-wrap text-sm">{flag.note || "No note."}</p>
                      <p className="theme-text-faint text-xs">
                        {flag.created_by ? `Added by ${flag.created_by}` : flag.source === "agent" ? "Added by the review run" : "Added by an editor"}
                        {flag.created_at ? <>, <RelativeDay iso={flag.created_at} /></> : null}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="theme-text-muted text-sm">No flags on this article.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
