"use client";

import { useId, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

import { proseLinkClassName } from "@/components/common/ProseLink";
import { ArticleSection } from "@/components/common/ArticleSection";
import { Icon } from "@/components/common/Icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { SubstanceArticle } from "@/schema";
import { slugify } from "@/utils/slug";
import { createInitialDraft, type FeedbackDraft, type SubmissionState } from "./feedbackDraft";

// The form is never in the server-rendered page (the section starts
// collapsed), so its chunk loads only when a reader opens it.
const FeedbackForm = dynamic(
  () => import("./FeedbackForm").then((module) => module.FeedbackForm),
  { ssr: false },
);

interface FeedbackSectionProps {
  article: SubstanceArticle;
}

// The schema keeps `slug` optional/loose on articles, so read it structurally
// and fall back to the same derivation the editor tools use.
function resolveArticleSlug(article: {
  title?: string;
  identification?: { common_name?: string };
  slug?: string;
}) {
  const explicitSlug = typeof article.slug === "string" ? article.slug.trim() : "";
  return explicitSlug || slugify(article.identification?.common_name || article.title || "");
}

/**
 * Compact per-article feedback intake at the end of the substance article.
 * Collapsed by default; expands into a short form that posts to the private
 * Convex moderation queue. Nothing submitted here is rendered publicly.
 */
export function FeedbackSection({ article }: FeedbackSectionProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(createInitialDraft);
  const [state, setState] = useState<SubmissionState>({ kind: "idle" });
  const fieldPrefix = useId();

  const substanceTitle = article.title || article.identification?.common_name || "this substance";
  const substanceSlug = resolveArticleSlug(article);

  const setField = <K extends keyof FeedbackDraft>(field: K, value: FeedbackDraft[K]) => {
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
          message: body.error ?? "Unable to send feedback right now.",
          details: Array.isArray(body.errors) ? body.errors : [],
        });
        return;
      }

      setDraft(createInitialDraft());
      setState({ kind: "success" });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Unable to send feedback right now.",
        details: [],
      });
    }
  };

  return (
    <ArticleSection id="feedback" icon="lucide:message-square-plus" heading="Suggest an edit">
      <p className="theme-text-secondary max-w-[65ch] text-sm leading-6">
        Spotted a mistake, an outdated claim, or something missing from the{" "}
        <span className="theme-text-primary font-medium">{substanceTitle}</span> article? Send the
        editors a private note. Feedback lands in a moderation queue and is never shown on the
        site.
      </p>

      {state.kind === "success" ? (
        <Alert variant="success" aria-live="polite">
          <Icon icon="lucide:check" size={18} />
          <AlertTitle>Feedback received</AlertTitle>
          <AlertDescription>
            Thanks — your note is in the private editor queue.
          </AlertDescription>
        </Alert>
      ) : null}

      {!open ? (
        <Button type="button" variant="glass" size="pill" onClick={() => setOpen(true)}>
          <Icon icon="lucide:pencil-line" size={16} />
          {state.kind === "success" ? "Send more feedback" : "Report an issue or suggest an edit"}
        </Button>
      ) : (
        <FeedbackForm
          draft={draft}
          state={state}
          fieldPrefix={fieldPrefix}
          setField={setField}
          onSubmit={submitFeedback}
          onCancel={closeForm}
        />
      )}

      <p className="theme-text-faint text-sm">
        Wish to give generalised feedback? You can do so{" "}
        <Link href="/about/feedback" className={proseLinkClassName}>
          here
        </Link>
        .
      </p>
    </ArticleSection>
  );
}
