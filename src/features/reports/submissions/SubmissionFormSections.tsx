import { memo, type ReactNode, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { PublicSegmentedTabs, type PublicSegmentedTabItem } from "@/components/layout/PublicSegmentedTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type {
  ConsentField,
  NarrativeMode,
  ReportTextField,
  SubjectDraft,
  SubstanceDraft,
  SubstanceField,
  TimelineDraft,
  TimelineField,
  TimelinePhase,
} from "./submissionDraft";

export const touchTargetClassName = "min-h-11 px-4";

const phaseLabels = {
  onset: {
    title: "Onset",
    icon: "lucide:sunrise",
  },
  peak: {
    title: "Peak",
    icon: "lucide:sun",
  },
  offset: {
    title: "Offset",
    icon: "lucide:sunset",
  },
} satisfies Record<TimelinePhase, { title: string; icon: string }>;

export const CoreDetailsSection = memo(function CoreDetailsSection({
  onReportFieldChange,
  onSubjectFieldChange,
  subject,
  title,
}: {
  onReportFieldChange: (field: ReportTextField, value: string) => void;
  onSubjectFieldChange: (field: keyof SubjectDraft, value: string) => void;
  subject: SubjectDraft;
  title: string;
}) {
  return (
    <FormSection
      icon="lucide:file-text"
      title="Core details"
      description="Title, attribution, date, and optional profile metadata."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field id="report-title" label="Title" required className="md:col-span-2">
          <Input
            id="report-title"
            value={title}
            required
            autoComplete="off"
            placeholder="Careful low dose museum walk"
            onChange={(event) => onReportFieldChange("title", event.target.value)}
          />
        </Field>

        <Field id="subject-name" label="Author or pseudonym">
          <Input
            id="subject-name"
            value={subject.name}
            autoComplete="name"
            placeholder="Anonymous"
            onChange={(event) => onSubjectFieldChange("name", event.target.value)}
          />
        </Field>

        <Field id="trip-date" label="Trip date">
          <Input
            id="trip-date"
            type="date"
            value={subject.trip_date}
            onChange={(event) => onSubjectFieldChange("trip_date", event.target.value)}
          />
        </Field>

      </div>
    </FormSection>
  );
});

export const SubstanceDetailsSection = memo(function SubstanceDetailsSection({
  onAdd,
  onRemove,
  onUpdate,
  substances,
}: {
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, field: SubstanceField, value: string) => void;
  substances: SubstanceDraft[];
}) {
  const [revealedIds, setRevealedIds] = useState(() => new Set(substances.map((substance) => substance.id)));

  return (
    <FormSection
      icon="lucide:pill"
      title="Substance details"
      description="Name, dose, and route of administration for each substance."
      action={
        <Button
          type="button"
          variant="ghostPill"
          size="pill"
          className={touchTargetClassName}
          onClick={onAdd}
        >
          <Icon icon="lucide:plus" size={16} />
          Add substance
        </Button>
      }
    >
      <div className="divide-y divide-[var(--theme-border-subtle)]">
        {substances.map((substance, index) => (
          <div
            key={substance.id}
            className={cn("grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto]", !revealedIds.has(substance.id) && "theme-reveal-enter")}
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget) {
                setRevealedIds((current) => new Set(current).add(substance.id));
              }
            }}
          >
            <Field id={`${substance.id}-name`} label={`Substance ${index + 1} name`} required>
              <Input
                id={`${substance.id}-name`}
                value={substance.name}
                required={index === 0}
                autoComplete="off"
                placeholder="LSD"
                onChange={(event) => onUpdate(substance.id, "name", event.target.value)}
              />
            </Field>
            <Field id={`${substance.id}-dose`} label={`Substance ${index + 1} dose`}>
              <Input
                id={`${substance.id}-dose`}
                value={substance.dose}
                autoComplete="off"
                placeholder="75 ug"
                onChange={(event) => onUpdate(substance.id, "dose", event.target.value)}
              />
            </Field>
            <Field id={`${substance.id}-roa`} label={`Substance ${index + 1} ROA`}>
              <Input
                id={`${substance.id}-roa`}
                value={substance.roa}
                autoComplete="off"
                placeholder="oral"
                onChange={(event) => onUpdate(substance.id, "roa", event.target.value)}
              />
            </Field>
            <div className="flex items-end justify-end">
              <Button
                type="button"
                variant="iconGhost"
                size="auto"
                className="h-11 w-11"
                aria-label={`Remove substance ${index + 1}`}
                disabled={substances.length === 1}
                onClick={() => onRemove(substance.id)}
              >
                <Icon icon="lucide:trash-2" size={18} />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </FormSection>
  );
});

export const ContextSection = memo(function ContextSection({
  onReportFieldChange,
  onSubjectFieldChange,
  subject,
  tags,
}: {
  onReportFieldChange: (field: ReportTextField, value: string) => void;
  onSubjectFieldChange: (field: keyof SubjectDraft, value: string) => void;
  subject: SubjectDraft;
  tags: string;
}) {
  return (
    <FormSection
      icon="lucide:user-round"
      title="Subject and setting"
      description="Optional demographics and environmental context."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field id="subject-age" label="Age">
          <Input
            id="subject-age"
            value={subject.age}
            autoComplete="off"
            placeholder="28"
            onChange={(event) => onSubjectFieldChange("age", event.target.value)}
          />
        </Field>
        <Field id="subject-gender" label="Gender">
          <Input
            id="subject-gender"
            value={subject.gender}
            autoComplete="off"
            placeholder="not specified"
            onChange={(event) => onSubjectFieldChange("gender", event.target.value)}
          />
        </Field>
        <Field id="subject-height" label="Height">
          <Input
            id="subject-height"
            value={subject.height}
            autoComplete="off"
            placeholder="5 ft 8 in"
            onChange={(event) => onSubjectFieldChange("height", event.target.value)}
          />
        </Field>
        <Field id="subject-weight" label="Weight">
          <Input
            id="subject-weight"
            value={subject.weight}
            autoComplete="off"
            placeholder="150 lb"
            onChange={(event) => onSubjectFieldChange("weight", event.target.value)}
          />
        </Field>
        <Field id="subject-medications" label="Medications" className="md:col-span-2">
          <Textarea
            id="subject-medications"
            value={subject.medications}
            textareaSize="sm"
            placeholder="None, or list relevant medication context"
            onChange={(event) => onSubjectFieldChange("medications", event.target.value)}
          />
        </Field>
        <Field id="subject-setting" label="Setting" className="md:col-span-2">
          <Textarea
            id="subject-setting"
            value={subject.setting}
            textareaSize="sm"
            placeholder="Quiet apartment, museum, sober sitter nearby"
            onChange={(event) => onSubjectFieldChange("setting", event.target.value)}
          />
        </Field>
        <Field id="report-tags" label="Tags" className="md:col-span-2">
          <Input
            id="report-tags"
            value={tags}
            autoComplete="off"
            placeholder="psychedelic, low dose, solo"
            onChange={(event) => onReportFieldChange("tags", event.target.value)}
          />
        </Field>
      </div>
    </FormSection>
  );
});

const narrativeModeOptions = [
  {
    mode: "simple",
    icon: "lucide:align-left",
    title: "Simple",
    text: "One free-form text box for the whole experience.",
  },
  {
    mode: "detailed",
    icon: "lucide:list-ordered",
    title: "Detailed",
    text: "Split into onset, peak, and offset entries.",
  },
] satisfies Array<{ mode: NarrativeMode; icon: string; title: string; text: string }>;

const narrativeModeItems: PublicSegmentedTabItem<NarrativeMode>[] = narrativeModeOptions.map(
  (option) => ({ id: option.mode, icon: option.icon, label: option.title }),
);

export const NarrativeSection = memo(function NarrativeSection({
  conclusion,
  introduction,
  mode,
  onAddTimelineEntry,
  onModeChange,
  onRemoveTimelineEntry,
  onReportFieldChange,
  onUpdateTimelineEntry,
  timeline,
}: {
  conclusion: string;
  introduction: string;
  mode: NarrativeMode;
  onAddTimelineEntry: (phase: TimelinePhase) => void;
  onModeChange: (mode: NarrativeMode) => void;
  onRemoveTimelineEntry: (phase: TimelinePhase, id: string) => void;
  onReportFieldChange: (field: ReportTextField, value: string) => void;
  onUpdateTimelineEntry: (phase: TimelinePhase, id: string, field: TimelineField, value: string) => void;
  timeline: Record<TimelinePhase, TimelineDraft[]>;
}) {
  return (
    <FormSection
      icon="lucide:book-open-text"
      title="Your experience"
      description={
        mode === "simple"
          ? "Write it your way. One text box is all you need."
          : "Introduction, phase notes, and conclusion."
      }
    >
      <div className="space-y-6">
        <div className="space-y-2.5">
          <PublicSegmentedTabs
            ariaLabel="Narrative format"
            value={mode}
            onValueChange={onModeChange}
            items={narrativeModeItems}
            className="justify-start"
          />
          <p key={mode} className="theme-feedback-enter text-sm leading-6 text-[var(--theme-text-muted)]">
            {narrativeModeOptions.find((option) => option.mode === mode)?.text}
          </p>
        </div>

        <Field id="report-introduction" label={mode === "simple" ? "Report" : "Introduction"}>
          <Textarea
            id="report-introduction"
            value={introduction}
            textareaSize="lg"
            className={mode === "simple" ? "min-h-64" : undefined}
            placeholder={mode === "simple"
              ? "Tell the whole story: context and intention, what you took, how it unfolded, and how it ended"
              : "Context, intention, preparation, and baseline state"}
            onChange={(event) => onReportFieldChange("introduction", event.target.value)}
          />
        </Field>

        <div hidden={mode !== "detailed"} className={cn("space-y-6", mode === "detailed" && "theme-reveal-enter")}>
            {(["onset", "peak", "offset"] as const).map((phase) => (
              <TimelinePhaseEditor
                key={phase}
                phase={phase}
                entries={timeline[phase]}
                onAdd={() => onAddTimelineEntry(phase)}
                onRemove={(id) => onRemoveTimelineEntry(phase, id)}
                onUpdate={(id, field, value) => onUpdateTimelineEntry(phase, id, field, value)}
              />
            ))}

            <Field id="report-conclusion" label="Conclusion / aftermath">
              <Textarea
                id="report-conclusion"
                value={conclusion}
                textareaSize="lg"
                placeholder="Comedown, sleep, after-effects, reflection, and harm-reduction notes"
                onChange={(event) => onReportFieldChange("conclusion", event.target.value)}
              />
            </Field>
        </div>
      </div>
    </FormSection>
  );
});

export const ContactConsentSection = memo(function ContactConsentSection({
  ageConfirmed,
  contactEmail,
  mayContact,
  onConsentFieldChange,
  onReportFieldChange,
  publishConsent,
}: {
  ageConfirmed: boolean;
  contactEmail: string;
  mayContact: boolean;
  onConsentFieldChange: (field: ConsentField, value: boolean) => void;
  onReportFieldChange: (field: ReportTextField, value: string) => void;
  publishConsent: boolean;
}) {
  return (
    <FormSection
      icon="lucide:shield-check"
      title="Contact and consent"
      description="Submissions stay private until editor approval."
    >
      <div className="space-y-5">
        <Field id="contact-email" label="Contact email">
          <Input
            id="contact-email"
            type="email"
            value={contactEmail}
            autoComplete="email"
            placeholder="you@example.com"
            onChange={(event) => onReportFieldChange("contact_email", event.target.value)}
          />
        </Field>

        <div className="divide-y divide-[var(--theme-border-subtle)] border-t border-[var(--theme-border-subtle)]">
          <ConsentCheckbox
            id="may-contact"
            checked={mayContact}
            onChange={(checked) => onConsentFieldChange("may_contact", checked)}
          >
            Editors may contact me about this report.
          </ConsentCheckbox>
          <ConsentCheckbox
            id="publish-consent"
            checked={publishConsent}
            required
            onChange={(checked) => onConsentFieldChange("publish_consent", checked)}
          >
            I consent to this report being reviewed and, if published, dedicated to the public
            domain (CC0), free for anyone to use, with no attribution required. This dedication
            cannot be revoked once the report is public. Anyone who has already copied it may keep
            using it. If I later ask dose.wiki to remove the report, that removal applies to
            dose.wiki only, not to copies made elsewhere.
          </ConsentCheckbox>
          <ConsentCheckbox
            id="age-confirmed"
            checked={ageConfirmed}
            required
            onChange={(checked) => onConsentFieldChange("age_confirmed", checked)}
          >
            I confirm I am at least 18 years old and can submit this report.
          </ConsentCheckbox>
        </div>
      </div>
    </FormSection>
  );
});

const FormSection = memo(function FormSection({
  action,
  children,
  description,
  icon,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  description: string;
  icon: string;
  title: string;
}) {
  return (
    <section className="py-10 first:pt-0 last:pb-0">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h2 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-[var(--theme-text-primary)]">
            <Icon icon={icon} className="shrink-0 text-[var(--theme-accent-strong)]" size={20} />
            {title}
          </h2>
          <p className="max-w-[65ch] text-sm leading-6 text-[var(--theme-text-muted)]">
            {description}
          </p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
});

const Field = memo(function Field({
  children,
  className,
  id,
  label,
  required = false,
}: {
  children: ReactNode;
  className?: string;
  id: string;
  label: string;
  required?: boolean;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id} className="flex items-center gap-2">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-[color:var(--theme-danger-text-strong)]">
            *
          </span>
        ) : null}
      </Label>
      {children}
    </div>
  );
});

const TimelinePhaseEditor = memo(function TimelinePhaseEditor({
  entries,
  onAdd,
  onRemove,
  onUpdate,
  phase,
}: {
  entries: TimelineDraft[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, field: keyof Omit<TimelineDraft, "id">, value: string) => void;
  phase: TimelinePhase;
}) {
  const meta = phaseLabels[phase];
  const [revealedIds, setRevealedIds] = useState(() => new Set(entries.map((entry) => entry.id)));

  return (
    <fieldset className="space-y-4 border-t border-[var(--theme-border-subtle)] pt-5">
      <legend className="sr-only">{meta.title}</legend>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--theme-text-primary)]">
          <Icon icon={meta.icon} className="text-[var(--theme-accent-strong)]" size={16} />
          {meta.title}
        </div>
        <Button
          type="button"
          variant="ghostPill"
          size="pill"
          className={touchTargetClassName}
          onClick={onAdd}
        >
          <Icon icon="lucide:plus" size={16} />
          Add entry
        </Button>
      </div>

      <div className="space-y-3">
        {entries.map((entry, index) => {
          const entryName = `${meta.title} entry ${index + 1}`;

          return (
            <div
              key={entry.id}
              className={cn("grid gap-3 md:grid-cols-[10rem_minmax(0,1fr)_auto]", !revealedIds.has(entry.id) && "theme-reveal-enter")}
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) {
                  setRevealedIds((current) => new Set(current).add(entry.id));
                }
              }}
            >
              <Field id={`${entry.id}-time`} label={`${entryName} time`}>
                <Input
                  id={`${entry.id}-time`}
                  value={entry.time}
                  autoComplete="off"
                  placeholder="T+00:45"
                  onChange={(event) => onUpdate(entry.id, "time", event.target.value)}
                />
              </Field>
              <Field id={`${entry.id}-description`} label={`${entryName} description`}>
                <Textarea
                  id={`${entry.id}-description`}
                  value={entry.description}
                  textareaSize="sm"
                  placeholder="Effects, body state, mood, perception, environment"
                  onChange={(event) => onUpdate(entry.id, "description", event.target.value)}
                />
              </Field>
              <div className="flex items-end justify-end">
                <Button
                  type="button"
                  variant="iconGhost"
                  size="auto"
                  className="h-11 w-11"
                  aria-label={`Remove ${entryName.toLowerCase()}`}
                  disabled={entries.length === 1}
                  onClick={() => onRemove(entry.id)}
                >
                  <Icon icon="lucide:trash-2" size={18} />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
});

function ConsentCheckbox({
  checked,
  children,
  id,
  onChange,
  required = false,
}: {
  checked: boolean;
  children: ReactNode;
  id: string;
  onChange: (checked: boolean) => void;
  required?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-11 cursor-pointer items-start gap-3 py-3.5 text-sm leading-6 text-[var(--theme-text-secondary)] transition hover:text-[var(--theme-text-primary)]"
    >
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        required={required}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden="true"
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border border-[var(--theme-border-strong)] bg-[var(--theme-field-surface)] text-[var(--theme-surface-deep)] transition peer-checked:border-[var(--theme-accent-strong)] peer-checked:bg-[var(--theme-accent-strong)] theme-peer-focus-ring"
      >
        {checked ? <Icon icon="lucide:check" size={14} /> : null}
      </span>
      <span>
        {children}
        {required ? (
          <span aria-hidden="true" className="ml-1 text-[color:var(--theme-danger-text-strong)]">
            *
          </span>
        ) : null}
      </span>
    </label>
  );
}
