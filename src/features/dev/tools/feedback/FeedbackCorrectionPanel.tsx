"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EditorSelect, EditorStatusPill, Notice } from "@/features/dev/components";
import { describeDay } from "@/features/dev/tools/home/homeModel";
import {
  ARTICLE_SECTION_LABELS,
  type ArticleEditorSection,
} from "@/features/article/editing/articleSections";
import {
  CORRECTION_STATE_LABEL,
  CORRECTION_STATE_TONE,
  correctionHref,
  isCompletedCorrection,
  type CorrectionCandidates,
  type LinkedChange,
  type ResolvedCorrection,
} from "@/features/intake/feedbackCorrection";
import { devHref } from "@/utils/devHref";
import { cn } from "@/lib/utils";

import { formatFeedbackDate } from "./FeedbackReviewQueue";
import { isFreezeRefusal } from "./feedbackReviewModel";
import { devFetch } from "@/features/dev/tools/devFetch";

const CATEGORY_SECTION: Partial<Record<string, ArticleEditorSection>> = {
  source: "references",
  "broken-link": "references",
};

const WHOLE_ARTICLE = "article";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; corrections: ResolvedCorrection[]; candidates: CorrectionCandidates }
  | { status: "error"; message: string };

type PanelNotice = { tone: "success" | "danger"; message: string };

const shortId = (id: string) => `#${id.slice(-6)}`;

export function FeedbackCorrectionPanel<Row extends { id: string }>({
  feedbackId,
  slug,
  category,
  onLinked,
}: {
  feedbackId: string;
  slug: string;
  category?: string;
  onLinked?: (row: Row) => void;
}) {
  const headingId = useId();
  const sectionId = useId();
  const pickerId = useId();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [section, setSection] = useState<string>(CATEGORY_SECTION[category ?? ""] ?? WHOLE_ARTICLE);
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState<string>("");
  const [linking, setLinking] = useState(false);
  const [notice, setNotice] = useState<PanelNotice | null>(null);
  const version = useRef(0);

  const load = useCallback(async () => {
    const current = ++version.current;
    try {
      const payload = await requestJson(`/api/article-feedback/${encodeURIComponent(feedbackId)}/corrections`, {
        cache: "no-store",
      });
      if (!Array.isArray(payload.corrections) || !payload.candidates || typeof payload.candidates !== "object") {
        throw new Error("The server did not return this feedback's corrections. Try again.");
      }
      if (current === version.current) {
        setState({
          status: "ready",
          corrections: payload.corrections as ResolvedCorrection[],
          candidates: payload.candidates as CorrectionCandidates,
        });
      }
    } catch (error) {
      if (current === version.current) {
        setState({ status: "error", message: error instanceof Error ? error.message : "Unable to load corrections." });
      }
    }
  }, [feedbackId]);

  useEffect(() => {
    setState({ status: "loading" });
    setPicking(false);
    setChoice("");
    setNotice(null);
    void load();
    return () => {
      version.current += 1;
    };
  }, [load]);

  async function link() {
    const change = parseChoice(choice);
    if (!change || linking) return;
    setLinking(true);
    setNotice(null);
    try {
      const payload = await requestJson(`/api/article-feedback/${encodeURIComponent(feedbackId)}/corrections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ change }),
      });
      setNotice({ tone: "success", message: `Linked ${change.kind === "proposal" ? "proposal" : "revision"} ${shortId(change.id)}.` });
      setPicking(false);
      setChoice("");
      if (payload.feedback && typeof payload.feedback === "object") onLinked?.(payload.feedback as Row);
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to link that change.";
      setNotice({
        tone: "danger",
        message: isFreezeRefusal(message) ? "Writes are paused, so the link was not saved. Try again once they resume." : message,
      });
    } finally {
      setLinking(false);
    }
  }

  const candidates = state.status === "ready" ? state.candidates : { proposals: [], revisions: [] };
  const hasCandidates = candidates.proposals.length + candidates.revisions.length > 0;
  const corrections = state.status === "ready" ? state.corrections : [];
  const completed = corrections.some((correction) => isCompletedCorrection(correction.state));
  const startHref = (returnTo?: string) =>
    correctionHref(slug, feedbackId, section === WHOLE_ARTICLE ? null : section, returnTo);

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div>
        <h4 id={headingId} className="theme-accent-heading text-sm font-semibold">
          Correction
        </h4>
        <p className="theme-text-muted mt-0.5 max-w-prose text-xs">
          Advisory. A linked change never gates its own review or publication, and this feedback&apos;s status stays
          your decision.
        </p>
      </div>

      {state.status === "loading" ? (
        <EditorStatusPill tone="info" loading live>
          Loading corrections
        </EditorStatusPill>
      ) : null}
      {state.status === "error" ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p role="alert" className="theme-text-secondary flex items-center gap-2 text-sm">
            <Icon icon="lucide:triangle-alert" size={14} className="theme-warning-text-strong shrink-0" />
            {state.message}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            Reload corrections
          </Button>
        </div>
      ) : null}
      {state.status === "ready" ? (
        corrections.length === 0 ? (
          <p className="theme-text-muted text-sm">No change is linked yet.</p>
        ) : (
          <ol aria-label="Linked changes" className="divide-y divide-[color:var(--editor-panel-border)] rounded-card border border-[color:var(--editor-panel-border)]">
            {corrections.map((correction) => (
              <CorrectionRow key={`${correction.change.kind}:${correction.change.id}`} correction={correction} slug={slug} />
            ))}
          </ol>
        )
      ) : null}
      {state.status === "ready" && corrections.length > 0 && !completed ? (
        <p className="theme-text-secondary text-sm">No correction has been published for this feedback yet.</p>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-48 sm:max-w-64">
          <label htmlFor={sectionId} className="theme-text-secondary mb-1 block text-xs font-medium">
            Section to correct
          </label>
          <EditorSelect
            id={sectionId}
            selectSize="sm"
            value={section}
            onChange={(event) => setSection(event.target.value)}
            options={[
              { value: WHOLE_ARTICLE, label: "Whole article" },
              ...(Object.keys(ARTICLE_SECTION_LABELS) as ArticleEditorSection[]).map((key) => ({
                value: key,
                label: ARTICLE_SECTION_LABELS[key],
              })),
            ]}
          />
        </div>
        <Button asChild variant="outline" size="sm" className="h-10">
          <a
            href={startHref()}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => {
              event.currentTarget.href = startHref(window.location.pathname + window.location.search);
            }}
          >
            Start correction
            <Icon icon="lucide:arrow-up-right" size={14} />
          </a>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10"
          aria-expanded={picking}
          aria-controls={pickerId}
          disabled={state.status !== "ready"}
          onClick={() => setPicking((open) => !open)}
        >
          Link existing change
          <ExpandIndicator isExpanded={picking} />
        </Button>
      </div>
      <p className="theme-text-muted max-w-prose text-xs">
        Start correction opens the article editor in a new tab. A proposal you submit there is linked here; this
        feedback&apos;s id travels with it, never the reader&apos;s contact details.
      </p>

      <div id={pickerId} hidden={!picking} className="theme-reveal-enter">
        {picking ? (
          hasCandidates ? (
            <fieldset className="space-y-2 rounded-card border border-[color:var(--editor-panel-border)] p-3">
              <legend className="theme-text-secondary px-1 text-xs font-medium">Change to link</legend>
              <CandidateGroup
                label="Proposals"
                name={`${pickerId}-choice`}
                options={candidates.proposals.map((proposal) => ({
                  value: `proposal:${proposal.id}`,
                  title: `Proposal ${shortId(proposal.id)}`,
                  meta: proposal.status.replace("_", " "),
                  summary: proposal.summary,
                }))}
                choice={choice}
                onChoose={setChoice}
              />
              <CandidateGroup
                label="Published revisions"
                name={`${pickerId}-choice`}
                options={candidates.revisions.map((revision) => ({
                  value: `revision:${revision.id}`,
                  title: `Published revision ${shortId(revision.id)}`,
                  meta: formatFeedbackDate(revision.createdAt) ?? "",
                  summary: revision.summary,
                }))}
                choice={choice}
                onChoose={setChoice}
              />
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!parseChoice(choice) || linking}
                  aria-busy={linking || undefined}
                  onClick={() => void link()}
                >
                  {linking ? "Linking" : "Link"}
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={linking} onClick={() => setPicking(false)}>
                  Cancel
                </Button>
              </div>
            </fieldset>
          ) : (
            <p className="theme-text-muted text-sm">This article has no proposals or published revisions to link.</p>
          )
        ) : null}
      </div>

      {notice ? (
        <Notice placement="inline" tone={notice.tone} dismiss={() => setNotice(null)}>
          {notice.message}
        </Notice>
      ) : null}
    </section>
  );
}

function CandidateGroup({
  label,
  name,
  options,
  choice,
  onChoose,
}: {
  label: string;
  name: string;
  options: { value: string; title: string; meta: string; summary: string }[];
  choice: string;
  onChoose: (value: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="type-meta-label theme-text-muted px-1">{label}</p>
      <ul className="space-y-1">
        {options.map((option) => {
          const checked = option.value === choice;
          return (
            <li key={option.value}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-control px-2 py-2 text-sm transition-colors hover:bg-[var(--editor-panel-bg-subtle)]",
                  checked && "bg-[var(--editor-panel-bg-subtle)]",
                )}
              >
                <input
                  type="radio"
                  name={name}
                  value={option.value}
                  checked={checked}
                  onChange={() => onChoose(option.value)}
                  className="mt-1 size-4 shrink-0"
                />
                <span className="min-w-0">
                  <span className="theme-text-primary font-medium">{option.title}</span>
                  {option.meta ? <span className="theme-text-muted">{` · ${option.meta}`}</span> : null}
                  <span className="theme-text-secondary block">{option.summary}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CorrectionRow({ correction, slug }: { correction: ResolvedCorrection; slug: string }) {
  const { proposal, revision, state } = correction;
  const label = CORRECTION_STATE_LABEL[state];
  const linked = describeDay(correction.linkedAt);
  return (
    <li className="space-y-1 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <EditorStatusPill inline tone={CORRECTION_STATE_TONE[state]}>
          {label}
        </EditorStatusPill>
        {linked ? (
          <span className="theme-text-muted text-xs">
            Linked{" "}
            <time dateTime={correction.linkedAt} title={linked.full}>
              {linked.relative}
            </time>
          </span>
        ) : null}
      </div>
      {proposal ? (
        <p className="theme-text-primary text-sm">
          <a
            href={devHref({ type: "dev", tab: "queue", slug: encodeURIComponent(proposal.id) })}
            className="text-dose-accent-strong theme-accent-underline underline-offset-4 hover:underline"
          >
            Proposal {shortId(proposal.id)}
          </a>
          {`: ${proposal.summary}`}
          {correction.revisedFrom ? (
            <span className="theme-text-muted text-xs"> · revision of proposal {shortId(correction.revisedFrom)}</span>
          ) : null}
        </p>
      ) : null}
      {revision && isCompletedCorrection(state) ? (
        <p className="theme-text-secondary text-sm">
          Published revision {shortId(revision.id)} · {formatFeedbackDate(revision.createdAt)} · {revision.summary} ·{" "}
          <a
            href={`/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-dose-accent-strong theme-accent-underline underline-offset-4 hover:underline"
          >
            Open article
          </a>
        </p>
      ) : null}
      {revision && !isCompletedCorrection(state) ? (
        <p className="theme-text-secondary text-sm">
          Revision {shortId(revision.id)} was published and later undone.
        </p>
      ) : null}
    </li>
  );
}

function parseChoice(value: string): LinkedChange | null {
  const [kind, ...rest] = value.split(":");
  const id = rest.join(":");
  if (!id || (kind !== "proposal" && kind !== "revision")) return null;
  return { kind, id };
}

function requestJson(url: string, init: RequestInit) {
  return devFetch(url, {
    ...init,
    messages: {
      network: "Network error while reaching the feedback correction.",
      failure: "Unable to reach the feedback correction.",
    },
  });
}
