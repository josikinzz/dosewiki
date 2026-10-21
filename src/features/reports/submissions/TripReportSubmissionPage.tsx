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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { publicHref } from "@/utils/publicHref";

import {
  decodePiruReport,
  piruReportNeedsDetailedFormat,
  readPiruFragment,
} from "./piruReportImport";
import {
  ContactConsentSection,
  ContextSection,
  CoreDetailsSection,
  NarrativeSection,
  SubstanceDetailsSection,
  touchTargetClassName,
} from "./SubmissionFormSections";
import {
  applyPiruReport,
  createInitialDraft,
  omitDraftId,
  type ConsentField,
  type NarrativeMode,
  type ReportTextField,
  type SubjectDraft,
  type SubstanceField,
  type TimelineField,
  type TimelinePhase,
} from "./submissionDraft";

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

type PiruImportNotice = "imported" | "unreadable";

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

const PIRU_PROMO_MESSAGE =
  "If you log your sessions in {{piru}}, it can remind you to note how you feel as a session goes, then turn those notes into a report that fills in this form.";

function PiruPromoLine() {
  const t = useT();
  const [before, after = ""] = t(PIRU_PROMO_MESSAGE).split("{{piru}}");
  return (
    <p className="theme-reveal-enter flex max-w-2xl items-start gap-2 text-sm leading-6 text-[var(--theme-text-muted)]">
      <Icon icon="lucide:notebook-pen" className="mt-0.5 shrink-0" size={16} />
      <span>
        {before}
        <Link
          href="/about#collaboration-piru"
          className="theme-accent-emphasis theme-accent-underline theme-focus-ring font-medium underline decoration-dotted underline-offset-[0.18em] hover:decoration-solid"
        >
          Piru
        </Link>
        {after}
      </span>
    </p>
  );
}

function TripReportSubmissionForm() {
  const [draft, setDraft] = useState(createInitialDraft);
  const [narrativeMode, setNarrativeMode] = useState<NarrativeMode>("simple");
  const [result, setResult] = useState<SubmissionResult>({ kind: "idle" });
  const [piruNotice, setPiruNotice] = useState<PiruImportNotice | null>(null);
  const [showPiruPromo, setShowPiruPromo] = useState(false);
  const piruImportCheckedRef = useRef(false);
  const nextIdRef = useRef(2);
  const formRef = useRef<HTMLFormElement>(null);
  const pendingFocusRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!pendingFocusRef.current) return;
    formRef.current?.querySelector<HTMLInputElement>(`#${pendingFocusRef.current}`)?.focus();
    pendingFocusRef.current = null;
  }, [draft.substances, draft.timeline]);

  useEffect(() => {
    if (!SITE_FLAVOR_CONFIG.showPiruLinks || piruImportCheckedRef.current) return;
    piruImportCheckedRef.current = true;
    const encoded = readPiruFragment(window.location.hash);
    if (encoded === null) {
      setShowPiruPromo(true);
      return;
    }
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    const report = decodePiruReport(encoded);
    if (!report) {
      setPiruNotice("unreadable");
      return;
    }
    setDraft((current) => applyPiruReport(current, report, () => nextIdRef.current++));
    if (piruReportNeedsDetailedFormat(report)) setNarrativeMode("detailed");
    setPiruNotice("imported");
  }, []);

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
      {piruNotice ? <PiruImportNoticeBanner notice={piruNotice} onDismiss={() => setPiruNotice(null)} /> : null}
      {showPiruPromo ? <PiruPromoLine /> : null}

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

function PiruImportNoticeBanner({ notice, onDismiss }: { notice: PiruImportNotice; onDismiss: () => void }) {
  const t = useT();
  return (
    <Alert className="theme-feedback-enter pr-14">
      <Icon icon={notice === "imported" ? "lucide:notebook-pen" : "lucide:info"} size={18} />
      <AlertDescription>
        {notice === "imported"
          ? t("Filled in from your Piru session. Check everything before you submit.")
          : t("The Piru session could not be read, so the form starts empty.")}
      </AlertDescription>
      <Button
        type="button"
        variant="iconGhost"
        size="auto"
        className="absolute right-2 top-1/2 h-11 w-11 -translate-y-1/2"
        aria-label={t("Dismiss notice")}
        onClick={onDismiss}
      >
        <Icon icon="lucide:x" size={16} />
      </Button>
    </Alert>
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
