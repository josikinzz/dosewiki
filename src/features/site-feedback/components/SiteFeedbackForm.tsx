"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";

import { useT } from "@/i18n/client";
import { Icon } from "@/components/common/Icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  SITE_FEEDBACK_CATEGORIES,
  SITE_FEEDBACK_CATEGORY_LABELS,
  SITE_FEEDBACK_CATEGORY_PLACEHOLDERS,
  SITE_FEEDBACK_DETAILS_MAX_LENGTH,
  SITE_FEEDBACK_URGENCIES,
  SITE_FEEDBACK_URGENCY_LABELS,
  siteFeedbackCategoryAcceptsUrgency,
  type SiteFeedbackCategory,
  type SiteFeedbackUrgency,
} from "@/features/site-feedback/siteFeedback";

import { TurnstileWidget } from "./TurnstileWidget";

/**
 * Optional Cloudflare Turnstile gate. Inlined at build time; when the key is
 * absent the widget never renders and no token is sent — the API route skips
 * verification in lockstep (it only verifies when TURNSTILE_SECRET_KEY is set).
 */
// `import.meta.env` is a Vite concept and does not exist here.
 
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

type SubmissionState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string; details: string[] };

type FeedbackDraft = {
  category: SiteFeedbackCategory;
  urgency: SiteFeedbackUrgency;
  details: string;
  page: string;
  email: string;
  website: string;
};

function createInitialDraft(): FeedbackDraft {
  return {
    category: "article-request",
    urgency: "normal",
    details: "",
    page: "",
    email: "",
    website: "",
  };
}

/**
 * The general (site-wide) feedback form at /about/feedback. A sibling of the
 * per-article suggest-an-edit form: posts to the private site-feedback
 * moderation queue, and nothing submitted here is rendered publicly.
 */
export function SiteFeedbackForm() {
  const [draft, setDraft] = useState(createInitialDraft);
  const [state, setState] = useState<SubmissionState>({ kind: "idle" });
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
  const fieldPrefix = useId();
  const t = useT();

  const showUrgency = siteFeedbackCategoryAcceptsUrgency(draft.category);
  const turnstileEnabled = TURNSTILE_SITE_KEY.length > 0;
  const awaitingTurnstile = turnstileEnabled && turnstileToken === null;

  const setField = <K extends keyof FeedbackDraft>(field: K, value: FeedbackDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const resetForm = () => {
    setDraft(createInitialDraft());
    setState({ kind: "idle" });
  };

  const submitFeedback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState({ kind: "submitting" });

    try {
      const response = await fetch("/api/site-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: draft.category,
          // Urgency only applies to bug-like categories; the API rejects it
          // elsewhere, so it is dropped rather than silently defaulted.
          ...(showUrgency ? { urgency: draft.urgency } : {}),
          details: draft.details,
          page: draft.page,
          email: draft.email,
          website: draft.website,
          ...(turnstileEnabled && turnstileToken ? { turnstileToken } : {}),
        }),
      });
      // Turnstile tokens are single-use: request a fresh challenge after every
      // round trip, whether the submission was accepted or rejected.
      if (turnstileEnabled) {
        setTurnstileResetSignal((signal) => signal + 1);
      }
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        errors?: string[];
      };

      if (!response.ok) {
        setState({
          kind: "error",
          message: body.error ?? t("Unable to send feedback right now."),
          details: Array.isArray(body.errors) ? body.errors : [],
        });
        return;
      }

      setDraft(createInitialDraft());
      setState({ kind: "success" });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : t("Unable to send feedback right now."),
        details: [],
      });
    }
  };

  return (
    <div className="theme-reveal-enter space-y-5">
      {state.kind === "success" ? (
        <Alert variant="success" aria-live="polite" className="theme-feedback-enter">
          <Icon icon="lucide:check" size={18} />
          <AlertTitle>{t("Feedback received")}</AlertTitle>
          <AlertDescription>
            {t(
              "Thanks — your feedback landed in the moderation queue. It is never shown on the site.",
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      <form className="space-y-5" onSubmit={submitFeedback}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FeedbackField id={`${fieldPrefix}-category`} label={t("What kind of feedback?")}>
            <Select
              value={draft.category}
              onValueChange={(value) => setField("category", value as SiteFeedbackCategory)}
            >
              <SelectTrigger id={`${fieldPrefix}-category`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SITE_FEEDBACK_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {t(SITE_FEEDBACK_CATEGORY_LABELS[category])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FeedbackField>

          <div hidden={!showUrgency} className={showUrgency ? "theme-reveal-enter" : undefined}>
            <FeedbackField id={`${fieldPrefix}-urgency`} label={t("How urgent is it?")}>
              <Select
                value={draft.urgency}
                onValueChange={(value) => setField("urgency", value as SiteFeedbackUrgency)}
              >
                <SelectTrigger id={`${fieldPrefix}-urgency`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SITE_FEEDBACK_URGENCIES.map((urgency) => (
                    <SelectItem key={urgency} value={urgency}>
                      {t(SITE_FEEDBACK_URGENCY_LABELS[urgency])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FeedbackField>
          </div>
        </div>

        <FeedbackField id={`${fieldPrefix}-details`} label={t("Details")} required>
          <Textarea
            id={`${fieldPrefix}-details`}
            value={draft.details}
            required
            maxLength={SITE_FEEDBACK_DETAILS_MAX_LENGTH}
            placeholder={t(SITE_FEEDBACK_CATEGORY_PLACEHOLDERS[draft.category])}
            onChange={(event) => setField("details", event.target.value)}
          />
          <p className="theme-text-faint text-right text-xs">
            {draft.details.length} / {SITE_FEEDBACK_DETAILS_MAX_LENGTH}
          </p>
        </FeedbackField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FeedbackField id={`${fieldPrefix}-page`} label={t("Page (optional)")}>
            <Input
              id={`${fieldPrefix}-page`}
              value={draft.page}
              autoComplete="off"
              placeholder={t("/lsd, or a full link")}
              onChange={(event) => setField("page", event.target.value)}
            />
          </FeedbackField>

          <FeedbackField id={`${fieldPrefix}-email`} label={t("Email (optional, for a reply)")}>
            <Input
              id={`${fieldPrefix}-email`}
              type="email"
              value={draft.email}
              autoComplete="email"
              placeholder="you@example.com"
              onChange={(event) => setField("email", event.target.value)}
            />
          </FeedbackField>
        </div>

        <div className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          <label htmlFor={`${fieldPrefix}-website`}>Website</label>
          <input
            id={`${fieldPrefix}-website`}
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={draft.website}
            onChange={(event) => setField("website", event.target.value)}
          />
        </div>

        {turnstileEnabled ? (
          <TurnstileWidget
            siteKey={TURNSTILE_SITE_KEY}
            onToken={setTurnstileToken}
            resetSignal={turnstileResetSignal}
          />
        ) : null}

        {state.kind === "error" ? (
          <Alert variant="destructive" aria-live="assertive">
            <Icon icon="lucide:circle-alert" size={18} />
            <AlertTitle>{t("Feedback not sent")}</AlertTitle>
            <AlertDescription>
              <p>{state.message}</p>
              {state.details.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {state.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="accent"
            disabled={state.kind === "submitting" || awaitingTurnstile}
            aria-busy={state.kind === "submitting"}
          >
            {state.kind === "submitting" ? (
              <Icon icon="lucide:loader-circle" className="animate-spin motion-reduce:animate-none" size={16} />
            ) : (
              <Icon icon="lucide:send" size={16} />
            )}
            <span className="grid">
              {turnstileEnabled ? <span aria-hidden="true" className="invisible col-start-1 row-start-1">{t("Waiting for verification")}</span> : null}
              <span aria-hidden="true" className="invisible col-start-1 row-start-1">{t("Send feedback")}</span>
              <span aria-hidden="true" className="invisible col-start-1 row-start-1">{t("Sending")}</span>
              <span className="col-start-1 row-start-1" aria-live="polite">
                {state.kind === "submitting"
                  ? t("Sending")
                  : awaitingTurnstile
                    ? t("Waiting for verification")
                    : t("Send feedback")}
              </span>
            </span>
          </Button>
          <Button type="button" variant="outline" onClick={resetForm} disabled={state.kind === "submitting"}>
            {t("Cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}

function FeedbackField({
  children,
  id,
  label,
  required = false,
}: {
  children: ReactNode;
  id: string;
  label: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="flex items-center gap-2">
        {label}
        {required ? (
          <span aria-hidden="true" className="theme-danger-text-strong">
            *
          </span>
        ) : null}
      </Label>
      {children}
    </div>
  );
}
