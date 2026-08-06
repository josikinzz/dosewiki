import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { Icon } from "@/components/common/Icon";
import { StatusBadge, type StatusBadgeTone } from "@/components/common/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Surface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import { EditorSelect } from "@/features/dev/components";
import type { ReviewFlag, ReviewFlagSeverity, SubstanceArticle } from "@/schema";
import { CANONICAL_REVIEW_FLAG_LABELS } from "@/schema/substance/editorial";
import { ARTICLE_SECTION_CATALOG } from "@/schema/substance/sectionCatalog";

import { FieldGroup, helperTextClass } from "./FormHelpers";

const REVIEW_STATUS_OPTIONS = [
  {
    value: "needed",
    label: "Review needed",
    description: "Not started yet.",
  },
  {
    value: "in_progress",
    label: "In progress",
    description: "Manual confirmation is underway.",
  },
  {
    value: "completed",
    label: "Completed",
    description: "Manual review is done.",
  },
] as const;

export type EditorialReviewFieldsRHFProps = {
  idPrefix: string;
  slug?: string;
};

const FLAG_SEVERITY_TONE: Record<"major" | "minor" | "note", StatusBadgeTone> = {
  major: "red",
  minor: "orange",
  note: "blue",
};

const SECTION_LABELS = new Map(
  ARTICLE_SECTION_CATALOG.map((section) => [section.id, section.label]),
);

export function EditorialReviewFieldsRHF({ idPrefix, slug }: EditorialReviewFieldsRHFProps) {
  const { register, setValue } = useFormContext<SubstanceArticle>();
  const flags = useWatch({ name: "editorial_review.flags" }) as ReviewFlag[] | undefined;
  const [label, setLabel] = useState("");
  const [severity, setSeverity] = useState<ReviewFlagSeverity>("minor");
  const [section, setSection] = useState("");
  const [note, setNote] = useState("");
  const [writeState, setWriteState] = useState<"idle" | "saving">("idle");
  const [writeError, setWriteError] = useState<string | null>(null);

  const writeFlags = async (body: Record<string, unknown>) => {
    if (!slug) throw new Error("This article has no slug.");
    setWriteState("saving"); setWriteError(null);
    try {
      const response = await fetch("/api/dev/editorial-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, ...body }) });
      const payload = await response.json() as { flags?: ReviewFlag[]; error?: string };
      if (!response.ok || !payload.flags) throw new Error(payload.error ?? "Unable to update Review Flags.");
      setValue("editorial_review.flags", payload.flags, { shouldDirty: false });
    } finally { setWriteState("idle"); }
  };

  const addFlag = async () => {
    try {
      await writeFlags({ action: "add-flag", flag: { label, severity, note, ...(section ? { section } : {}) } });
      setLabel(""); setSeverity("minor"); setSection(""); setNote("");
    } catch (error) { setWriteError(error instanceof Error ? error.message : "Unable to add Review Flag."); }
  };

  const deleteFlag = async (flag: ReviewFlag) => {
    try { await writeFlags({ action: "delete-flag", identity: { created_at: flag.created_at, label: flag.label, source: flag.source } }); }
    catch (error) { setWriteError(error instanceof Error ? error.message : "Unable to delete Review Flag."); }
  };

  return (
    <section className="space-y-6">
      <FieldGroup label="Internal Review Tracking">
        <div className="grid gap-4 md:grid-cols-[minmax(0,260px)_1fr]">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-editorial-review-status`} className="inline-flex items-center gap-1.5">
              <Icon icon="lucide:list-checks" size={14} className="theme-icon-accent" />
              Review Status
            </Label>
            <EditorSelect
              id={`${idPrefix}-editorial-review-status`}
              {...register("editorial_review.status")}
              options={REVIEW_STATUS_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
            <p className={helperTextClass}>
              Shown as a badge in the substance selector above.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-editorial-review-notes`} className="inline-flex items-center gap-1.5">
              <Icon icon="lucide:notebook-pen" size={14} className="theme-icon-accent" />
              Review Notes
            </Label>
            <Textarea
              id={`${idPrefix}-editorial-review-notes`}
              {...register("editorial_review.notes")}
              placeholder="Checklist items, unresolved questions, or manual confirmation notes."
              textareaSize="lg"
            />
            <p className={helperTextClass}>
              Internal-only metadata. This does not render on public article pages.
            </p>
          </div>
        </div>
      </FieldGroup>

      <FieldGroup label="Review Flags">
          <Surface variant="subtle" padding="md" radius="xl" className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1"><Label htmlFor={`${idPrefix}-flag-label`}>Flag Label</Label><Input id={`${idPrefix}-flag-label`} list={`${idPrefix}-flag-labels`} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="missing citations" /><datalist id={`${idPrefix}-flag-labels`}>{CANONICAL_REVIEW_FLAG_LABELS.map((value) => <option key={value} value={value} />)}</datalist></div>
              <div className="space-y-1"><Label htmlFor={`${idPrefix}-flag-severity`}>Severity</Label><EditorSelect id={`${idPrefix}-flag-severity`} value={severity} onChange={(event) => setSeverity(event.target.value as ReviewFlagSeverity)} options={[{value:"major",label:"Major"},{value:"minor",label:"Minor"},{value:"note",label:"Note"}]} /></div>
              <div className="space-y-1"><Label htmlFor={`${idPrefix}-flag-section`}>Section (optional)</Label><EditorSelect id={`${idPrefix}-flag-section`} value={section} onChange={(event) => setSection(event.target.value)} options={[{value:"",label:"Whole article"}, ...ARTICLE_SECTION_CATALOG.map(({id,label}) => ({value:id,label}))]} /></div>
            </div>
            <div className="space-y-1"><Label htmlFor={`${idPrefix}-flag-note`}>Note</Label><Textarea id={`${idPrefix}-flag-note`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Describe the work to do." /></div>
            <div className="flex items-center gap-3"><Button type="button" onClick={addFlag} disabled={writeState === "saving" || label.trim().split(/\s+/).filter(Boolean).length < 1 || label.trim().split(/\s+/).filter(Boolean).length > 3}>{writeState === "saving" ? "Saving…" : "Add Review Flag"}</Button>{writeError ? <p className="theme-danger-text text-sm">{writeError}</p> : null}</div>
          </Surface>
          {flags?.length ? (
          <Surface variant="subtle" padding="none" radius="xl" className="overflow-hidden">
            <details>
              <summary className="theme-focus-ring-inset theme-text-primary flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold">
                <Icon icon="lucide:flag" size={15} className="theme-icon-accent" />
                Review Flags
                <Badge variant="secondary" className="ml-auto tabular-nums">
                  {flags.length}
                </Badge>
                <Icon icon="lucide:chevron-down" size={14} className="theme-text-faint" />
              </summary>
              <div className="space-y-3 border-t border-dose-border p-4">
                {flags.map((flag, index) => (
                  <Surface key={`${flag.source}-${flag.run_id ?? "human"}-${flag.created_at}-${index}`} variant="muted" padding="sm" radius="lg">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="tracking-normal normal-case">{flag.label}</Badge>
                      <StatusBadge tone={FLAG_SEVERITY_TONE[flag.severity]}>{flag.severity}</StatusBadge>
                      {flag.section ? (
                        <Badge variant="outline" className="tracking-normal normal-case">
                          {SECTION_LABELS.get(flag.section) ?? flag.section}
                        </Badge>
                      ) : null}
                    </div>
                    <dl className="theme-text-muted mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                      <div><dt className="inline font-semibold">Source: </dt><dd className="inline">{flag.source}</dd></div>
                      <div><dt className="inline font-semibold">Run id: </dt><dd className="inline">{flag.run_id ?? "—"}</dd></div>
                    </dl>
                    <p className="theme-text-secondary mt-3 whitespace-pre-wrap text-sm">
                      {flag.note || "No note provided."}
                    </p>
                    <Button type="button" variant="ghostDestructive" size="sm" className="mt-3" disabled={writeState === "saving"} onClick={() => deleteFlag(flag)}><Icon icon="lucide:trash-2" size={14} />Delete</Button>
                  </Surface>
                ))}
              </div>
            </details>
          </Surface>
          ) : <p className={helperTextClass}>No Review Flags.</p>}
          <p className={helperTextClass}>
            Advisory only. Review Flags never prevent an article from being marked reviewed.
          </p>
        </FieldGroup>
    </section>
  );
}
