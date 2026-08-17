"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";

import { proseLinkClassName } from "@/components/common/ProseLink";
import { ArticleSection } from "@/components/common/ArticleSection";
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
  ARTICLE_FEEDBACK_CATEGORIES,
  ARTICLE_FEEDBACK_CATEGORY_LABELS,
  ARTICLE_FEEDBACK_DETAILS_MAX_LENGTH,
  ARTICLE_FEEDBACK_IMPORTANCES,
  ARTICLE_FEEDBACK_IMPORTANCE_LABELS,
  type ArticleFeedbackCategory,
  type ArticleFeedbackImportance,
} from "@/features/article/feedback/articleFeedback";
import type { SubstanceArticle } from "@/schema";
import { slugify } from "@/utils/slug";

type SubmissionState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string; details: string[] };

type FeedbackDraft = {
  category: ArticleFeedbackCategory;
  importance: ArticleFeedbackImportance;
  details: string;
  source_url: string;
  contact_email: string;
  website: string;
};

function createInitialDraft(): FeedbackDraft {
  return {
    category: "inaccurate",
    importance: "normal",
    details: "",
    source_url: "",
    contact_email: "",
    website: "",
  };
}

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
        <form className="max-w-2xl space-y-5" onSubmit={submitFeedback}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FeedbackField id={`${fieldPrefix}-category`} label="What kind of feedback?">
              <Select
                value={draft.category}
                onValueChange={(value) => setField("category", value as ArticleFeedbackCategory)}
              >
                <SelectTrigger id={`${fieldPrefix}-category`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ARTICLE_FEEDBACK_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {ARTICLE_FEEDBACK_CATEGORY_LABELS[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FeedbackField>

            <FeedbackField id={`${fieldPrefix}-importance`} label="How urgent is it?">
              <Select
                value={draft.importance}
                onValueChange={(value) => setField("importance", value as ArticleFeedbackImportance)}
              >
                <SelectTrigger id={`${fieldPrefix}-importance`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ARTICLE_FEEDBACK_IMPORTANCES.map((importance) => (
                    <SelectItem key={importance} value={importance}>
                      {ARTICLE_FEEDBACK_IMPORTANCE_LABELS[importance]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FeedbackField>
          </div>

          <FeedbackField id={`${fieldPrefix}-details`} label="Details" required>
            <Textarea
              id={`${fieldPrefix}-details`}
              value={draft.details}
              required
              maxLength={ARTICLE_FEEDBACK_DETAILS_MAX_LENGTH}
              placeholder="What should change, and why? Point at the section if you can."
              onChange={(event) => setField("details", event.target.value)}
            />
            <p className="theme-text-faint text-right text-xs">
              {draft.details.length} / {ARTICLE_FEEDBACK_DETAILS_MAX_LENGTH}
            </p>
          </FeedbackField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FeedbackField id={`${fieldPrefix}-source`} label="Source link (optional)">
              <Input
                id={`${fieldPrefix}-source`}
                type="url"
                value={draft.source_url}
                autoComplete="url"
                placeholder="https://… (study, PubMed, label)"
                onChange={(event) => setField("source_url", event.target.value)}
              />
            </FeedbackField>

            <FeedbackField id={`${fieldPrefix}-email`} label="Email (optional, for a reply)">
              <Input
                id={`${fieldPrefix}-email`}
                type="email"
                value={draft.contact_email}
                autoComplete="email"
                placeholder="you@example.com"
                onChange={(event) => setField("contact_email", event.target.value)}
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

          {state.kind === "error" ? (
            <Alert variant="destructive" aria-live="assertive">
              <Icon icon="lucide:circle-alert" size={18} />
              <AlertTitle>Feedback not sent</AlertTitle>
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
            <Button type="submit" variant="accent" disabled={state.kind === "submitting"}>
              {state.kind === "submitting" ? (
                <Icon icon="lucide:loader-circle" className="animate-spin motion-reduce:animate-none" size={16} />
              ) : (
                <Icon icon="lucide:send" size={16} />
              )}
              {state.kind === "submitting" ? "Sending" : "Send feedback"}
            </Button>
            <Button type="button" variant="outline" onClick={closeForm}>
              Cancel
            </Button>
          </div>
        </form>
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
