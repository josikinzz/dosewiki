"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import dynamic from "next/dynamic";
import { SmartLink } from "@/components/common/SmartLink";

import { proseLinkClassName } from "@/components/common/ProseLink";
import { ArticleSection } from "@/components/common/ArticleSection";
import { Icon } from "@/components/common/Icon";
import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { msg, useT } from "@/i18n/client";
import {
  createInitialDraft,
  type FeedbackDraft,
  type SubmissionState,
} from "./feedbackDraft";

// The form is never in the server-rendered page (the section starts
// collapsed), so its chunk loads only when a reader opens it.
const FeedbackForm = dynamic(
  () => import("./FeedbackForm").then((module) => module.FeedbackForm),
  { ssr: false },
);

interface FeedbackSectionProps {
  substanceTitle: string;
  substanceSlug: string;
}

/**
 * Compact per-article feedback intake at the end of the substance article.
 * Collapsed by default; expands into a short form that posts to the private
 * Postgres moderation queue. Nothing submitted here is rendered publicly.
 */
export function FeedbackSection({
  substanceTitle,
  substanceSlug,
}: FeedbackSectionProps) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState(createInitialDraft);
  const [state, setState] = useState<SubmissionState>({ kind: "idle" });

  useLayoutEffect(() => {
    if (!open && hasOpened) triggerRef.current?.focus();
  }, [open, hasOpened]);
  const fieldPrefix = useId();
  const t = useT();

  const setField = <K extends keyof FeedbackDraft>(
    field: K,
    value: FeedbackDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const closeForm = () => {
    setOpen(false);
    setState({ kind: "idle" });
  };

  const submitFeedback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState({ kind: "submitting" });

    try {
      const response = await fetch("/api/article-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          substance_slug: substanceSlug,
          substance_title: substanceTitle,
          category: draft.category,
          importance: draft.importance,
          details: draft.details,
          source_url: draft.source_url,
          contact_email: draft.contact_email,
          website: draft.website,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        errors?: string[];
      };

      if (!response.ok) {
        setState({
          kind: "error",
          message: body.error ?? msg("Unable to send feedback right now."),
          details: Array.isArray(body.errors) ? body.errors : [],
        });
        return;
      }

      setDraft(createInitialDraft());
      setState({ kind: "success" });
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : msg("Unable to send feedback right now."),
        details: [],
      });
    }
  };

  // One sentence per key: the styled substance name and the inline link are
  // spliced back in at their placeholder so a translation can move them.
  const [introBefore, introAfter] = t(
    "Spotted a mistake, an outdated claim, or something missing from the {{substance}} article? Send the editors a private note. Feedback lands in a moderation queue and is never shown on the site.",
  ).split("{{substance}}");
  const [generalBefore, generalAfter] = t(
    "Wish to give generalised feedback? You can do so {{here}}.",
  ).split("{{here}}");

  return (
    <ArticleSection
      id="feedback"
      icon="lucide:message-square-plus"
      heading={t("Suggest an edit")}
    >
      <p className="theme-text-secondary max-w-[65ch] text-sm leading-6">
        {introBefore}
        <span className="theme-text-primary font-medium">{substanceTitle}</span>
        {introAfter}
      </p>

      {state.kind === "success" ? (
        <Alert
          variant="success"
          aria-live="polite"
          className="theme-feedback-enter"
        >
          <Icon icon="lucide:check" size={18} />
          <AlertTitle>{t("Feedback received")}</AlertTitle>
          <AlertDescription>
            {t("Thanks — your note is in the private editor queue.")}
          </AlertDescription>
        </Alert>
      ) : null}

      <Button
        ref={triggerRef}
        type="button"
        variant="glass"
        size="pill"
        className={open ? "hidden" : undefined}
        aria-expanded={open}
        aria-controls={`${fieldPrefix}-form`}
        onClick={() => {
          setHasOpened(true);
          setOpen(true);
        }}
      >
        <Icon icon="lucide:pencil-line" size={16} />
        {state.kind === "success"
          ? t("Send more feedback")
          : t("Report an issue or suggest an edit")}
        <ExpandIndicator isExpanded={open} />
      </Button>
      <div id={`${fieldPrefix}-form`} hidden={!open}>
        {hasOpened ? (
          <FeedbackForm
            draft={draft}
            state={state}
            fieldPrefix={fieldPrefix}
            setField={setField}
            onSubmit={submitFeedback}
            onCancel={closeForm}
          />
        ) : null}
      </div>

      <p className="theme-text-faint text-sm">
        {generalBefore}
        <SmartLink href="/about/feedback" className={proseLinkClassName}>
          {t("here")}
        </SmartLink>
        {generalAfter}
      </p>
    </ArticleSection>
  );
}
