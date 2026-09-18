"use client";

import { type FormEvent, type ReactNode } from "react";

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
import { useT } from "@/i18n/client";
import {
  ARTICLE_FEEDBACK_CATEGORIES,
  ARTICLE_FEEDBACK_CATEGORY_LABELS,
  ARTICLE_FEEDBACK_DETAILS_MAX_LENGTH,
  ARTICLE_FEEDBACK_IMPORTANCES,
  ARTICLE_FEEDBACK_IMPORTANCE_LABELS,
  type ArticleFeedbackCategory,
  type ArticleFeedbackImportance,
} from "@/features/article/feedback/articleFeedback";
import type { FeedbackDraft, SubmissionState } from "./feedbackDraft";

export interface FeedbackFormProps {
  draft: FeedbackDraft;
  state: SubmissionState;
  fieldPrefix: string;
  setField: <K extends keyof FeedbackDraft>(field: K, value: FeedbackDraft[K]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

/**
 * The expanded feedback form. Split from `FeedbackSection` and loaded on
 * demand: the section renders collapsed on every public article, so the
 * select, input and alert primitives behind this form only reach the browser
 * once a reader actually opens it.
 */
export function FeedbackForm({
  draft,
  state,
  fieldPrefix,
  setField,
  onSubmit,
  onCancel,
}: FeedbackFormProps) {
  const t = useT();
  return (
<form className="theme-reveal-enter max-w-2xl space-y-5" onSubmit={onSubmit}>
  <div className="grid gap-4 sm:grid-cols-2">
    <FeedbackField id={`${fieldPrefix}-category`} label={t("What kind of feedback?")}>
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
              {t(ARTICLE_FEEDBACK_CATEGORY_LABELS[category])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FeedbackField>

    <FeedbackField id={`${fieldPrefix}-importance`} label={t("How urgent is it?")}>
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
              {t(ARTICLE_FEEDBACK_IMPORTANCE_LABELS[importance])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FeedbackField>
  </div>

  <FeedbackField id={`${fieldPrefix}-details`} label={t("Details")} required>
    <Textarea
      id={`${fieldPrefix}-details`}
      value={draft.details}
      required
      maxLength={ARTICLE_FEEDBACK_DETAILS_MAX_LENGTH}
      placeholder={t("What should change, and why? Point at the section if you can.")}
      onChange={(event) => setField("details", event.target.value)}
    />
    <p className="theme-text-faint text-right text-xs">
      {draft.details.length} / {ARTICLE_FEEDBACK_DETAILS_MAX_LENGTH}
    </p>
  </FeedbackField>

  <div className="grid gap-4 sm:grid-cols-2">
    <FeedbackField id={`${fieldPrefix}-source`} label={t("Source link (optional)")}>
      <Input
        id={`${fieldPrefix}-source`}
        type="url"
        value={draft.source_url}
        autoComplete="url"
        placeholder={t("https://… (study, PubMed, label)")}
        onChange={(event) => setField("source_url", event.target.value)}
      />
    </FeedbackField>

    <FeedbackField id={`${fieldPrefix}-email`} label={t("Email (optional, for a reply)")}>
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
    <label htmlFor={`${fieldPrefix}-website`}>{t("Website")}</label>
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
      <AlertTitle>{t("Feedback not sent")}</AlertTitle>
      <AlertDescription>
        <p>{t(state.message)}</p>
        {state.details.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {state.details.map((detail) => (
              <li key={detail}>{t(detail)}</li>
            ))}
          </ul>
        ) : null}
      </AlertDescription>
    </Alert>
  ) : null}

  <div className="flex flex-wrap items-center gap-3">
    <Button type="submit" variant="accent" disabled={state.kind === "submitting"} aria-busy={state.kind === "submitting"}>
      {state.kind === "submitting" ? (
        <Icon icon="lucide:loader-circle" className="animate-spin motion-reduce:animate-none" size={16} />
      ) : (
        <Icon icon="lucide:send" size={16} />
      )}
      <span className="grid">
        <span aria-hidden="true" className="invisible col-start-1 row-start-1">{t("Send feedback")}</span>
        <span aria-hidden="true" className="invisible col-start-1 row-start-1">{t("Sending")}</span>
        <span className="col-start-1 row-start-1" aria-live="polite">
          {state.kind === "submitting" ? t("Sending") : t("Send feedback")}
        </span>
      </span>
    </Button>
    <Button type="button" variant="outline" onClick={onCancel} disabled={state.kind === "submitting"}>
      {t("Cancel")}
    </Button>
  </div>
</form>
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
