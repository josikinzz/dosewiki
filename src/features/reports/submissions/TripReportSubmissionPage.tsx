"use client";

import Link from "next/link";
import {
  memo,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { motion, useReducedMotion } from "framer-motion";

import { Icon } from "@/components/common/Icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Surface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { publicHref } from "@/utils/publicHref";

type SubjectDraft = {
  name: string;
  profile_key: string;
  avatar_url: string;
  trip_date: string;
  age: string;
  gender: string;
  height: string;
  weight: string;
  medications: string;
  setting: string;
  pdf_url: string;
};

type SubstanceDraft = {
  id: string;
  name: string;
  dose: string;
  roa: string;
};

type TimelineDraft = {
  id: string;
  time: string;
  description: string;
};

type TimelinePhase = "onset" | "peak" | "offset";

type NarrativeMode = "simple" | "detailed";

type ReportDraft = {
  title: string;
  subject: SubjectDraft;
  substances: SubstanceDraft[];
  introduction: string;
  timeline: Record<TimelinePhase, TimelineDraft[]>;
  conclusion: string;
  tags: string;
  contact_email: string;
  may_contact: boolean;
  publish_consent: boolean;
  age_confirmed: boolean;
  website: string;
};

type ReportTextField = "title" | "introduction" | "conclusion" | "tags" | "contact_email" | "website";
type ConsentField = "may_contact" | "publish_consent" | "age_confirmed";
type SubstanceField = keyof Omit<SubstanceDraft, "id">;
type TimelineField = keyof Omit<TimelineDraft, "id">;

type SubmissionResult =
  | {
      kind: "idle";
    }
  | {
      kind: "submitting";
    }
  | {
      kind: "success";
      id?: string;
      warnings: string[];
    }
  | {
      kind: "error";
      message: string;
      details: string[];
    };

type SubmissionResponse = {
  ok?: boolean;
  id?: string;
  warnings?: string[];
  error?: string;
  errors?: string[];
};

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

function createInitialDraft(): ReportDraft {
  return {
    title: "",
    subject: {
      name: "",
      profile_key: "",
      avatar_url: "",
      trip_date: "",
      age: "",
      gender: "",
      height: "",
      weight: "",
      medications: "",
      setting: "",
      pdf_url: "",
    },
    substances: [{ id: "substance-1", name: "", dose: "", roa: "" }],
    introduction: "",
    timeline: {
      onset: [{ id: "onset-1", time: "", description: "" }],
      peak: [{ id: "peak-1", time: "", description: "" }],
      offset: [{ id: "offset-1", time: "", description: "" }],
    },
    conclusion: "",
    tags: "",
    contact_email: "",
    may_contact: false,
    publish_consent: false,
    age_confirmed: false,
    website: "",
  };
}

function omitDraftId<T extends { id: string }>(value: T): Omit<T, "id"> {
  const { id: _id, ...rest } = value;
  return rest;
}

export function TripReportSubmissionPage() {
  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <div className="mx-auto w-full max-w-3xl space-y-8 px-4 pb-20 pt-8">
        <SubmissionHero />
        <TripReportSubmissionForm />
      </div>
    </main>
  );
}

const touchTargetClassName = "min-h-11 px-4";

const SubmissionHero = memo(function SubmissionHero() {
  return (
    <header className="space-y-4">
      <Button variant="glass" size="pill" asChild className={cn("w-fit", touchTargetClassName)}>
        <Link href={publicHref.reports()}>
          <Icon icon="lucide:arrow-left" size={16} />
          Trip reports
        </Link>
      </Button>

      <div className="space-y-3">
        <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-[var(--theme-text-primary)] sm:text-4xl">
          Submit a trip report
        </h1>
        <p className="max-w-2xl text-base leading-7 text-[var(--theme-text-secondary)]">
          Share a structured account for editor review. Submissions stay in a private queue and only become public after manual approval.
        </p>
        <p className="flex max-w-2xl items-start gap-2 text-sm leading-6 text-[var(--theme-text-muted)]">
          <Icon
            icon="lucide:shield-alert"
            className="mt-0.5 shrink-0 text-[color:var(--theme-warning-text-strong)]"
            size={16}
          />
          Do not include identifying details you would not want reviewed by editors.
        </p>
      </div>
    </header>
  );
});

function TripReportSubmissionForm() {
  const [draft, setDraft] = useState(createInitialDraft);
  const [narrativeMode, setNarrativeMode] = useState<NarrativeMode>("simple");
  const [result, setResult] = useState<SubmissionResult>({ kind: "idle" });
  const nextIdRef = useRef(2);

  const progress = useMemo(() => {
    const complete = [
      draft.title.trim(),
      draft.substances.some((substance) => substance.name.trim()),
      draft.publish_consent,
      draft.age_confirmed,
    ].filter(Boolean).length;

    return {
      complete,
      total: 4,
      ratio: complete / 4,
    };
  }, [draft.age_confirmed, draft.publish_consent, draft.substances, draft.title]);

  const setReportField = useCallback((field: ReportTextField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  }, []);

  const setConsentField = useCallback((field: ConsentField, value: boolean) => {
    setDraft((current) => ({ ...current, [field]: value }));
  }, []);

  const setSubjectField = useCallback((field: keyof SubjectDraft, value: string) => {
    setDraft((current) => ({
      ...current,
      subject: {
        ...current.subject,
        [field]: value,
      },
    }));
  }, []);

  const addSubstance = useCallback(() => {
    const id = nextIdRef.current++;
    setDraft((current) => ({
      ...current,
      substances: [...current.substances, { id: `substance-${id}`, name: "", dose: "", roa: "" }],
    }));
  }, []);

  const removeSubstance = useCallback((id: string) => {
    setDraft((current) => ({
      ...current,
      substances:
        current.substances.length > 1
          ? current.substances.filter((substance) => substance.id !== id)
          : current.substances,
    }));
  }, []);

  const updateSubstance = useCallback((id: string, field: SubstanceField, value: string) => {
    setDraft((current) => ({
      ...current,
      substances: current.substances.map((substance) =>
        substance.id === id ? { ...substance, [field]: value } : substance,
      ),
    }));
  }, []);

  const addTimelineEntry = useCallback((phase: TimelinePhase) => {
    const id = nextIdRef.current++;
    setDraft((current) => ({
      ...current,
      timeline: {
        ...current.timeline,
        [phase]: [...current.timeline[phase], { id: `${phase}-${id}`, time: "", description: "" }],
      },
    }));
  }, []);

  const removeTimelineEntry = useCallback((phase: TimelinePhase, id: string) => {
    setDraft((current) => ({
      ...current,
      timeline: {
        ...current.timeline,
        [phase]:
          current.timeline[phase].length > 1
            ? current.timeline[phase].filter((entry) => entry.id !== id)
            : current.timeline[phase],
      },
    }));
  }, []);

  const updateTimelineEntry = useCallback((
    phase: TimelinePhase,
    id: string,
    field: TimelineField,
    value: string,
  ) => {
    setDraft((current) => ({
      ...current,
      timeline: {
        ...current.timeline,
        [phase]: current.timeline[phase].map((entry) =>
          entry.id === id ? { ...entry, [field]: value } : entry,
        ),
      },
    }));
  }, []);

  const submitReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResult({ kind: "submitting" });

    try {
      const response = await fetch("/api/trip-report-submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          report: {
            title: draft.title,
            subject: draft.subject,
            substances: draft.substances.map(omitDraftId),
            introduction: draft.introduction,
            onset: narrativeMode === "detailed" ? draft.timeline.onset.map(omitDraftId) : [],
            peak: narrativeMode === "detailed" ? draft.timeline.peak.map(omitDraftId) : [],
            offset: narrativeMode === "detailed" ? draft.timeline.offset.map(omitDraftId) : [],
            conclusion: narrativeMode === "detailed" ? draft.conclusion : "",
            tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          },
          contact_email: draft.contact_email,
          may_contact: draft.may_contact,
          publish_consent: draft.publish_consent,
          age_confirmed: draft.age_confirmed,
          website: draft.website,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as SubmissionResponse;

      if (!response.ok) {
        setResult({
          kind: "error",
          message: body.error ?? "Unable to receive the report right now.",
          details: body.errors ?? [],
        });
        return;
      }

      setResult({
        kind: "success",
        id: body.id,
        warnings: body.warnings ?? [],
      });
    } catch (error) {
      setResult({
        kind: "error",
        message: error instanceof Error ? error.message : "Unable to receive the report right now.",
        details: [],
      });
    }
  };

  return (
    <form className="space-y-6" onSubmit={submitReport}>
      <FormStatus result={result} />

      <Surface variant="subtle" radius="xl" padding="md" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[var(--theme-text-primary)]">Required fields</p>
            <p className="text-sm text-[var(--theme-text-muted)]">{progress.complete} of {progress.total} complete</p>
          </div>
          <div
            role="progressbar"
            aria-label="Required fields complete"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.complete}
            className="h-2 w-full overflow-hidden rounded-full bg-[var(--theme-field-surface)] sm:w-48"
          >
            <div
              className="h-full w-full origin-left rounded-full bg-[var(--theme-accent-strong)] transition-transform duration-300 motion-reduce:transition-none"
              style={{ transform: `scaleX(${progress.ratio})` }}
            />
          </div>
        </div>
        <span className="sr-only" aria-live="polite">
          {progress.complete} of {progress.total} required fields complete.
        </span>
      </Surface>

      <CoreDetailsSection
        title={draft.title}
        subject={draft.subject}
        onReportFieldChange={setReportField}
        onSubjectFieldChange={setSubjectField}
      />

      <SubstanceDetailsSection
        substances={draft.substances}
        onAdd={addSubstance}
        onRemove={removeSubstance}
        onUpdate={updateSubstance}
      />

      <ContextSection
        subject={draft.subject}
        tags={draft.tags}
        onReportFieldChange={setReportField}
        onSubjectFieldChange={setSubjectField}
      />

      <NarrativeSection
        mode={narrativeMode}
        onModeChange={setNarrativeMode}
        introduction={draft.introduction}
        timeline={draft.timeline}
        conclusion={draft.conclusion}
        onReportFieldChange={setReportField}
        onAddTimelineEntry={addTimelineEntry}
        onRemoveTimelineEntry={removeTimelineEntry}
        onUpdateTimelineEntry={updateTimelineEntry}
      />

      <ContactConsentSection
        contactEmail={draft.contact_email}
        mayContact={draft.may_contact}
        publishConsent={draft.publish_consent}
        ageConfirmed={draft.age_confirmed}
        onReportFieldChange={setReportField}
        onConsentFieldChange={setConsentField}
      />

      <div className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="submission-website">Website</label>
        <input
          id="submission-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={draft.website}
          onChange={(event) => setReportField("website", event.target.value)}
        />
      </div>

      <Surface variant="subtle" radius="xl" padding="md" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm leading-6 text-[var(--theme-text-muted)]">
          Reports are not published automatically. Editors can reject, accept, or promote a submission from the private queue.
        </p>
        <Button type="submit" size="lg" disabled={result.kind === "submitting"} className="sm:min-w-48">
          {result.kind === "submitting" ? (
            <Icon icon="lucide:loader-circle" className="animate-spin motion-reduce:animate-none" size={18} />
          ) : (
            <Icon icon="lucide:send" size={18} />
          )}
          {result.kind === "submitting" ? "Submitting" : "Submit report"}
        </Button>
      </Surface>
    </form>
  );
}

const CoreDetailsSection = memo(function CoreDetailsSection({
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
      eyebrow="Report"
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

        <Field id="profile-key" label="Profile key">
          <Input
            id="profile-key"
            value={subject.profile_key}
            autoComplete="off"
            placeholder="username"
            onChange={(event) => onSubjectFieldChange("profile_key", event.target.value)}
          />
        </Field>

        <Field id="avatar-url" label="Avatar URL">
          <Input
            id="avatar-url"
            type="url"
            value={subject.avatar_url}
            autoComplete="url"
            placeholder="https://..."
            onChange={(event) => onSubjectFieldChange("avatar_url", event.target.value)}
          />
        </Field>

        <Field id="pdf-url" label="PDF URL" className="md:col-span-2">
          <Input
            id="pdf-url"
            type="url"
            value={subject.pdf_url}
            autoComplete="url"
            placeholder="https://..."
            onChange={(event) => onSubjectFieldChange("pdf_url", event.target.value)}
          />
        </Field>
      </div>
    </FormSection>
  );
});

const SubstanceDetailsSection = memo(function SubstanceDetailsSection({
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
  return (
    <FormSection
      icon="lucide:pill"
      eyebrow="Substances"
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
            className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto]"
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

const ContextSection = memo(function ContextSection({
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
      eyebrow="Context"
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

const NarrativeSection = memo(function NarrativeSection({
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
      eyebrow="Narrative"
      title="Your experience"
      description={
        mode === "simple"
          ? "Write it your way — one text box is all you need."
          : "Introduction, phase notes, and conclusion."
      }
    >
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Narrative format">
          {narrativeModeOptions.map((option) => {
            const active = mode === option.mode;

            return (
              <button
                key={option.mode}
                type="button"
                aria-pressed={active}
                onClick={() => onModeChange(option.mode)}
                className={cn(
                  "flex min-h-11 items-start gap-3 rounded-2xl border p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)]",
                  active
                    ? "border-[var(--theme-frosted-control-hover-border)] bg-[var(--theme-frosted-control-bg)]"
                    : "border-[var(--theme-border-subtle)] bg-[var(--theme-field-surface)] hover:border-[var(--theme-border-strong)]",
                )}
              >
                <Icon
                  icon={option.icon}
                  className={cn(
                    "mt-0.5 shrink-0",
                    active ? "text-[var(--theme-accent-strong)]" : "text-[var(--theme-text-muted)]",
                  )}
                  size={18}
                />
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block text-sm font-semibold",
                      active ? "text-[var(--theme-text-primary)]" : "text-[var(--theme-text-secondary)]",
                    )}
                  >
                    {option.title}
                  </span>
                  <span className="mt-0.5 block text-sm leading-6 text-[var(--theme-text-muted)]">
                    {option.text}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {mode === "simple" ? (
          <Field id="report-introduction" label="Report">
            <Textarea
              id="report-introduction"
              value={introduction}
              textareaSize="lg"
              className="min-h-64"
              placeholder="Tell the whole story: context and intention, what you took, how it unfolded, and how it ended"
              onChange={(event) => onReportFieldChange("introduction", event.target.value)}
            />
          </Field>
        ) : (
          <>
            <Field id="report-introduction" label="Introduction">
              <Textarea
                id="report-introduction"
                value={introduction}
                textareaSize="lg"
                placeholder="Context, intention, preparation, and baseline state"
                onChange={(event) => onReportFieldChange("introduction", event.target.value)}
              />
            </Field>

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
          </>
        )}
      </div>
    </FormSection>
  );
});

const ContactConsentSection = memo(function ContactConsentSection({
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
      eyebrow="Review"
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

        <div className="space-y-3">
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
            I consent to this report being reviewed and potentially published.
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
  eyebrow,
  icon,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  description: string;
  eyebrow: string;
  icon: string;
  title: string;
}) {
  return (
    <Surface variant="card" radius="xl" padding="xl" className="overflow-hidden">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <div className="theme-index-card-icon grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ring-white/10">
            <Icon icon={icon} className="theme-index-card-icon-glyph" size={20} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--theme-text-faint)]">
              {eyebrow}
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--theme-text-primary)]">
              {title}
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-[var(--theme-text-muted)]">
              {description}
            </p>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </Surface>
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
            <div key={entry.id} className="grid gap-3 md:grid-cols-[10rem_minmax(0,1fr)_auto]">
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
      className="flex min-h-11 cursor-pointer gap-3 rounded-2xl border border-[var(--theme-border-subtle)] bg-[var(--theme-field-surface)] p-4 text-sm leading-6 text-[var(--theme-text-secondary)] transition hover:border-[var(--theme-border-strong)] hover:text-[var(--theme-text-primary)] focus-within:border-[var(--theme-frosted-control-hover-border)] focus-within:ring-2 focus-within:ring-[var(--theme-ring-soft)]"
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
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border border-[var(--theme-border-strong)] bg-[var(--theme-field-surface)] text-[var(--theme-surface-deep)] transition peer-checked:border-[var(--theme-accent-strong)] peer-checked:bg-[var(--theme-accent-strong)]"
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

const celebrationParticleCount = 10;

function SuccessCelebration({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof containerRef.current?.scrollIntoView !== "function") {
      return;
    }

    containerRef.current.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
  }, [reduceMotion]);

  return (
    <motion.div
      ref={containerRef}
      initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 280, damping: 24 }}
    >
      <Alert variant="success" aria-live="polite" className="overflow-hidden">
        <svg
          viewBox="0 0 24 24"
          width={18}
          height={18}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <motion.circle
            cx={12}
            cy={12}
            r={10}
            initial={reduceMotion ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          />
          <motion.path
            d="m8 12.5 2.8 2.8L16 9.5"
            initial={reduceMotion ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.35, delay: 0.35, ease: "easeOut" }}
          />
        </svg>
        {!reduceMotion ? (
          <span aria-hidden="true" className="pointer-events-none absolute left-[1.55rem] top-[1.55rem]">
            {Array.from({ length: celebrationParticleCount }, (_, index) => {
              const angle = (index / celebrationParticleCount) * Math.PI * 2;

              return (
                <motion.span
                  key={index}
                  className="absolute h-1 w-1 rounded-full bg-[color:var(--theme-success-text-strong)]"
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{
                    x: Math.cos(angle) * (24 + (index % 3) * 8),
                    y: Math.sin(angle) * (24 + (index % 3) * 8),
                    opacity: 0,
                    scale: 0.3,
                  }}
                  transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
                />
              );
            })}
          </span>
        ) : null}
        {children}
      </Alert>
    </motion.div>
  );
}

function FormStatus({ result }: { result: SubmissionResult }) {
  if (result.kind === "idle" || result.kind === "submitting") {
    return null;
  }

  if (result.kind === "success") {
    return (
      <SuccessCelebration>
        <AlertTitle>Report received</AlertTitle>
        <AlertDescription>
          <p>
            Your submission is in the private review queue{result.id ? ` as ${result.id}` : ""}.
          </p>
          {result.warnings.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </AlertDescription>
      </SuccessCelebration>
    );
  }

  return (
    <Alert variant="destructive" aria-live="assertive">
      <Icon icon="lucide:circle-alert" size={18} />
      <AlertTitle>Submission failed</AlertTitle>
      <AlertDescription>
        <p>{result.message}</p>
        {result.details.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {result.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
