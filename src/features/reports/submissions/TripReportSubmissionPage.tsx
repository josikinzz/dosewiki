"use client";

import Link from "next/link";
import {
  memo,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Icon } from "@/components/common/Icon";
import { PublicSegmentedTabs, type PublicSegmentedTabItem } from "@/components/layout/PublicSegmentedTabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { publicHref } from "@/utils/publicHref";

// No contributor profile key, avatar URL, or PDF URL: the public form is
// unauthenticated, so a key would be an unverified claim and the two URLs would
// let a submitter place a remote image and an outbound link on a published
// page. An editor assigns attribution when the submission is published.
type SubjectDraft = {
  name: string;
  trip_date: string;
  age: string;
  gender: string;
  height: string;
  weight: string;
  medications: string;
  setting: string;
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
      trip_date: "",
      age: "",
      gender: "",
      height: "",
      weight: "",
      medications: "",
      setting: "",
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
          Include only identifying details you are comfortable with editors reviewing.
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
  const formRef = useRef<HTMLFormElement>(null);
  const pendingFocusRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!pendingFocusRef.current) return;
    formRef.current?.querySelector<HTMLInputElement>(`#${pendingFocusRef.current}`)?.focus();
    pendingFocusRef.current = null;
  }, [draft.substances, draft.timeline]);

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
    pendingFocusRef.current = `substance-${id}-name`;
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
    pendingFocusRef.current = `${phase}-${id}-time`;
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
    <form ref={formRef} className="space-y-10" onSubmit={submitReport}>
      <FormStatus result={result} />

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
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
          className="h-2 w-full overflow-hidden rounded-full bg-[var(--theme-field-surface)] sm:w-56"
        >
          <div
            className="h-full w-full origin-left rounded-full bg-[var(--theme-accent-strong)] transition-transform duration-300 motion-reduce:transition-none"
            style={{ transform: `scaleX(${progress.ratio})` }}
          />
        </div>
        <span className="sr-only" aria-live="polite">
          {progress.complete} of {progress.total} required fields complete.
        </span>
      </div>

      <div className="divide-y divide-[var(--theme-border-subtle)]">
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
      </div>

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

      <div className="flex flex-col gap-4 border-t border-[var(--theme-border-subtle)] pt-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-sm leading-6 text-[var(--theme-text-muted)]">
          Reports are not published automatically. Editors can reject, accept, or promote a submission from the private queue.
        </p>
        <Button type="submit" variant="accent" size="lg" disabled={result.kind === "submitting"} aria-busy={result.kind === "submitting"} className="min-w-48">
          {result.kind === "submitting" ? (
            <Icon icon="lucide:loader-circle" className="animate-spin motion-reduce:animate-none" size={18} />
          ) : (
            <Icon icon="lucide:send" size={18} />
          )}
          <span className="grid">
            <span aria-hidden="true" className="invisible col-start-1 row-start-1">Submit report</span>
            <span className="col-start-1 row-start-1" aria-live="polite">
              {result.kind === "submitting" ? "Submitting" : "Submit report"}
            </span>
          </span>
        </Button>
      </div>
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
      title="Your experience"
      description={
        mode === "simple"
          ? "Write it your way — one text box is all you need."
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

function SubmissionConfirmation({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.scrollIntoView?.({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      block: "center",
    });
  }, []);

  return (
    <div ref={containerRef} className="theme-feedback-enter">
      <Alert variant="success" aria-live="polite">
        <Icon icon="lucide:circle-check" size={18} />
        {children}
      </Alert>
    </div>
  );
}

function FormStatus({ result }: { result: SubmissionResult }) {
  if (result.kind === "idle" || result.kind === "submitting") {
    return null;
  }

  if (result.kind === "success") {
    return (
      <SubmissionConfirmation>
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
      </SubmissionConfirmation>
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
