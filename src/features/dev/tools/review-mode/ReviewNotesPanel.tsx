"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { StatusBadge, type StatusBadgeTone } from "@/components/common/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Surface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import { EditorNotice, EditorSelect } from "@/features/dev/components";
import type { ReviewFlag, ReviewFlagSeverity } from "@/schema";
import { CANONICAL_REVIEW_FLAG_LABELS } from "@/schema/substance/editorial";
import { ARTICLE_SECTION_CATALOG } from "@/schema/substance/sectionCatalog";

/** Ties the bar toggle's `aria-controls` to the panel region. */
export const NOTES_PANEL_ID = "review-notes-panel";

const FLAG_SEVERITY_TONE: Record<ReviewFlagSeverity, StatusBadgeTone> = {
  major: "red",
  minor: "orange",
  note: "blue",
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

export interface ReviewNotesPanelProps {
  slug: string;
  name: string;
  /** The article's Review Flags as last read or written. */
  flags: readonly ReviewFlag[];
  /** Called with the full flag list the route returned after a write. */
  onFlagsChange: (slug: string, flags: ReviewFlag[]) => void;
  onClose: () => void;
}

/**
 * Where a reviewer records why an article is held back: a note plus a Review
 * Flag, written through the editorial review route's `add-flag` and
 * `delete-flag` actions. Each write is immediate; flags stay advisory and never
 * block marking an article reviewed.
 */
export function ReviewNotesPanel({ slug, name, flags, onFlagsChange, onClose }: ReviewNotesPanelProps) {
  const [note, setNote] = useState("");
  const [label, setLabel] = useState("");
  const [severity, setSeverity] = useState<ReviewFlagSeverity>("minor");
  const [section, setSection] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // F opens the panel to write, so the cursor starts in the note.
  useEffect(() => {
    noteRef.current?.focus();
  }, []);

  const writeFlags = async (body: Record<string, unknown>, fallback: string) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/dev/editorial-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...body }),
      });
      const payload = (await response.json().catch(() => null)) as { flags?: ReviewFlag[]; error?: string } | null;
      if (!response.ok || !payload?.flags) throw new Error(payload?.error ?? fallback);
      onFlagsChange(slug, payload.flags);
      return true;
    } catch (writeError) {
      setError(writeError instanceof Error ? writeError.message : fallback);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const words = labelWordCount(label);
  const labelValid = words >= 1 && words <= 3;

  const addFlag = async () => {
    const added = await writeFlags(
      { action: "add-flag", flag: { label: label.trim(), severity, note, ...(section ? { section } : {}) } },
      "Unable to add the flag.",
    );
    if (added) {
      setNote("");
      setLabel("");
      setSeverity("minor");
      setSection("");
    }
  };

  const deleteFlag = (flag: ReviewFlag) =>
    void writeFlags(
      { action: "delete-flag", identity: { created_at: flag.created_at, label: flag.label, source: flag.source } },
      "Unable to delete the flag.",
    );

  return (
    <Surface asChild variant="card" padding="none" radius="xl" className="overflow-hidden">
      <section
        id={NOTES_PANEL_ID}
        aria-label="Notes and flags"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          onClose();
        }}
      >
        <div className="flex items-start gap-3 border-b border-dose-border px-4 py-2.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
            <Icon icon="lucide:notebook-pen" size={15} className="theme-text-secondary shrink-0" />
            <h2 className="theme-text-primary font-display min-w-0 truncate text-sm font-semibold leading-none">
              Notes and flags: {name}
            </h2>
            <p className="theme-text-faint min-w-0 text-[11px] leading-tight">
              Each flag saves as you add it. Flags are advisory and never block review.
            </p>
          </div>
          <Button
            variant="iconClose"
            size="auto"
            className="shrink-0"
            onClick={onClose}
            title="Close notes and flags (F)"
            aria-label="Close notes and flags"
          >
            <Icon icon="lucide:x" size={15} />
          </Button>
        </div>

        <div className="space-y-4 p-4">
          <div className="space-y-1">
            <Label htmlFor={`${NOTES_PANEL_ID}-note`}>Note</Label>
            <Textarea
              ref={noteRef}
              id={`${NOTES_PANEL_ID}-note`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Why is this article held back? What is left to check?"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor={`${NOTES_PANEL_ID}-label`}>Flag label</Label>
              <Input
                id={`${NOTES_PANEL_ID}-label`}
                list={`${NOTES_PANEL_ID}-labels`}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="missing citations"
              />
              <datalist id={`${NOTES_PANEL_ID}-labels`}>
                {CANONICAL_REVIEW_FLAG_LABELS.map((value) => <option key={value} value={value} />)}
              </datalist>
              <p className="theme-text-faint text-[11px]">One to three words.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${NOTES_PANEL_ID}-severity`}>Severity</Label>
              <EditorSelect
                id={`${NOTES_PANEL_ID}-severity`}
                value={severity}
                onChange={(event) => setSeverity(event.target.value as ReviewFlagSeverity)}
                options={SEVERITY_OPTIONS}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${NOTES_PANEL_ID}-section`}>Section</Label>
              <EditorSelect
                id={`${NOTES_PANEL_ID}-section`}
                value={section}
                onChange={(event) => setSection(event.target.value)}
                options={SECTION_OPTIONS}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" variant="accent" size="pill" className="rounded-full" onClick={() => void addFlag()} disabled={saving || !labelValid}>
              {saving ? "Saving" : "Add flag"}
            </Button>
          </div>
          {error ? <EditorNotice notice={{ tone: "danger", message: error, live: true }} /> : null}

          {flags.length > 0 ? (
            <ul className="space-y-3 border-t border-dose-border pt-4">
              {flags.map((flag) => (
                <li key={`${flag.source}-${flag.created_at}-${flag.label}`}>
                  <Surface variant="muted" padding="sm" radius="lg">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="tracking-normal normal-case">{flag.label}</Badge>
                      <StatusBadge tone={FLAG_SEVERITY_TONE[flag.severity]}>{flag.severity}</StatusBadge>
                      {flag.section ? (
                        <Badge variant="outline" className="tracking-normal normal-case">
                          {SECTION_LABELS.get(flag.section) ?? flag.section}
                        </Badge>
                      ) : null}
                      <span className="theme-text-faint text-[11px]">
                        {flag.created_by ?? (flag.source === "agent" ? "Review run" : "Editor")}
                      </span>
                      <Button
                        type="button"
                        variant="ghostDestructive"
                        size="sm"
                        className="ml-auto"
                        disabled={saving}
                        onClick={() => deleteFlag(flag)}
                        aria-label={`Delete flag ${flag.label}`}
                      >
                        <Icon icon="lucide:trash-2" size={14} />
                        Delete
                      </Button>
                    </div>
                    <p className="theme-text-secondary mt-2 whitespace-pre-wrap text-sm">
                      {flag.note || "No note."}
                    </p>
                  </Surface>
                </li>
              ))}
            </ul>
          ) : (
            <p className="theme-text-faint text-[11px]">No flags on this article.</p>
          )}
        </div>
      </section>
    </Surface>
  );
}
