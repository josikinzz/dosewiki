"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { TurnstileWidget } from "@/features/site-feedback/components/TurnstileWidget";
import type { PublicGlossaryEntry } from "./languageGlossary";

class FeedbackError extends Error {}

type Choice = "right" | "improve" | "clear";
const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function GlossaryFeedback({
  locale,
  entry,
}: {
  locale: string;
  entry: PublicGlossaryEntry;
}) {
  const id = useId();
  const t = useT();
  const hasWording = Boolean(entry.target);
  const [details, setDetails] = useState("");
  const [alternative, setAlternative] = useState("");
  const [website, setWebsite] = useState("");
  const [choice, setChoice] = useState<Choice>("clear");
  const [loadingChoice, setLoadingChoice] = useState(hasWording);
  const [choiceLoadFailed, setChoiceLoadFailed] = useState(false);
  const [choiceRefresh, setChoiceRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const pending = useRef<{ fingerprint: string; id: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const key = `glossary-feedback:${locale}:${entry.term}:${entry.version}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
      if (saved) {
        setDetails(saved.details ?? "");
        setAlternative(saved.alternative ?? "");
      }
    } catch {
    }
  }, [key]);
  useEffect(() => {
    if (!hasWording) return;
    const controller = new AbortController();
    setLoadingChoice(true);
    setChoiceLoadFailed(false);
    const params = new URLSearchParams({
      locale,
      term: entry.term,
      version: entry.version!,
    });
    fetch(`/api/glossary-feedback/identity?${params}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(t("Unable to load your reaction."));
        if (!controller.signal.aborted) setChoice(result.choice ?? "clear");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setChoiceLoadFailed(true);
          setFailed(true);
          setNotice(t("Unable to load your reaction."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingChoice(false);
      });
    return () => controller.abort();
  }, [locale, entry.term, entry.version, hasWording, choiceRefresh, t]);
  function saveDraft(next: {
    details?: string;
    alternative?: string;
    choice?: Choice;
  }) {
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({ details, alternative, choice, ...next }),
      );
    } catch {
    }
  }
  async function submit(
    action: "suggestion" | "reaction",
    nextChoice?: Choice,
  ) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    setFailed(false);
    const payload = {
      action,
      locale,
      term: entry.term,
      version: entry.version,
      ...(action === "suggestion"
        ? { details, alternative }
        : { choice: nextChoice }),
    };
    const fingerprint = JSON.stringify(payload);
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, id: crypto.randomUUID() };
    try {
      const identity = await fetch("/api/glossary-feedback/identity", {
        cache: "no-store",
      });
      if (!identity.ok)
        throw new FeedbackError(
          t("Unable to start your suggestion. Please retry."),
        );
      const response = await fetch("/api/glossary-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          id: pending.current.id,
          website,
          turnstileToken: token ?? undefined,
        }),
      });
      if (!response.ok) {
        const message =
          response.status === 409
            ? t("This term changed. Reload the page before trying again.")
            : response.status === 503
              ? t(
                  "Feedback is temporarily unavailable. Your draft has been kept.",
                )
              : t("Unable to send your suggestion. Please retry.");
        throw new FeedbackError(message);
      }
      pending.current = null;
      if (action === "reaction") {
        setChoice(nextChoice!);
        saveDraft({ choice: nextChoice });
        setNotice(
          nextChoice === "clear"
            ? t("Reaction removed.")
            : t("Reaction saved. Thank you."),
        );
      } else {
        setDetails("");
        setAlternative("");
        saveDraft({ details: "", alternative: "" });
        setNotice(t("Thank you! A reviewer will look at your suggestion."));
      }
    } catch (error) {
      setFailed(true);
      setNotice(
        error instanceof FeedbackError
          ? error.message
          : t("Unable to send your suggestion. Your draft has been kept."),
      );
    } finally {
      setBusy(false);
      setToken(null);
      setReset((value) => value + 1);
    }
  }
  const captchaPending = Boolean(siteKey && !token);
  const reactionDisabled =
    busy || loadingChoice || choiceLoadFailed || captchaPending;
  const canSuggest = hasWording
    ? Boolean(details.trim() || alternative.trim())
    : Boolean(alternative.trim());
  return (
    <form
      className="theme-reveal-enter border-dose-border mt-3 flex flex-col gap-4 rounded-control border p-4 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        void submit("suggestion");
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-alternative`}>{t("Your translation")}</Label>
        <Input
          id={`${id}-alternative`}
          lang={locale}
          dir={locale === "ar" ? "rtl" : "auto"}
          ref={input}
          maxLength={400}
          disabled={busy}
          placeholder={entry.target ?? undefined}
          value={alternative}
          onChange={(event) => {
            setAlternative(event.target.value);
            saveDraft({ alternative: event.target.value });
          }}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-comment`}>
          {hasWording
            ? t("Why is it better? (optional)")
            : t("Note for reviewers (optional)")}
        </Label>
        <Textarea
          id={`${id}-comment`}
          rows={2}
          maxLength={4000}
          disabled={busy}
          value={details}
          onChange={(event) => {
            setDetails(event.target.value);
            saveDraft({ details: event.target.value });
          }}
        />
      </div>
      <div className="hidden" aria-hidden="true">
        <label>
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </label>
      </div>
      {siteKey ? (
        <TurnstileWidget
          siteKey={siteKey}
          onToken={setToken}
          resetSignal={reset}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || captchaPending || !canSuggest}>
          {busy ? t("Sending…") : t("Send to reviewers")}
        </Button>
        <p className="theme-text-muted">
          {t("Suggestions are private. A person reviews each one.")}
        </p>
      </div>
      {hasWording ? (
        <div className="space-y-2">
          <p className="theme-text-secondary">
            {t("Or just tell us about the current translation:")}
          </p>
          {choiceLoadFailed ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setChoiceRefresh((value) => value + 1)}
            >
              {t("Retry loading reaction")}
            </Button>
          ) : null}
          <div
            role="group"
            aria-label={t("Reaction to {{term}}", { term: entry.term })}
            className="flex flex-wrap gap-2"
          >
            <Button
              type="button"
              disabled={reactionDisabled}
              variant={choice === "right" ? "secondary" : "outline"}
              aria-pressed={choice === "right"}
              onClick={() =>
                void submit("reaction", choice === "right" ? "clear" : "right")
              }
            >
              {t("Looks right")}
            </Button>
            <Button
              type="button"
              disabled={reactionDisabled}
              variant={choice === "improve" ? "secondary" : "outline"}
              aria-pressed={choice === "improve"}
              onClick={() =>
                void submit(
                  "reaction",
                  choice === "improve" ? "clear" : "improve",
                )
              }
            >
              {t("Needs improvement")}
            </Button>
            {choice !== "clear" ? (
              <Button
                type="button"
                variant="ghost"
                disabled={reactionDisabled}
                onClick={() => void submit("reaction", "clear")}
              >
                {t("Clear reaction")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <p
        role={failed ? "alert" : "status"}
        className={cn(
          "theme-feedback-enter empty:hidden",
          failed ? "text-dose-danger" : "theme-text-secondary",
        )}
      >
        {notice}
      </p>
    </form>
  );
}
