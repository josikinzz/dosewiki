"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActionNotice, EditorActionGroup, EditorStatusPill, EditorToolbar } from "@/features/dev/components";
import {
  ARTICLE_SECTION_LABELS,
  isArticleEditorSection,
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

import { formatFeedbackDate } from "./FeedbackReviewQueue";

/** The section Start correction opens on when the admin picks none: a guess from the category. */
const CATEGORY_SECTION: Partial<Record<string, ArticleEditorSection>> = {
  source: "references",
  "broken-link": "references",
};

const WHOLE_ARTICLE = "article";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; corrections: ResolvedCorrection[]; candidates: CorrectionCandidates }
  | { status: "error"; message: string };

type Notice = { tone: "success" | "danger"; message: string };

const shortId = (id: string) => `#${id.slice(-6)}`;

/**
 * Article feedback's way to its correction: Start correction opens the
 * in-page article editor on a section with this feedback attached, Link
 * existing change connects a proposal or published revision of the same
 * article, and every linked change shows where it stands now.
 *
 * Advisory only. Nothing here decides the feedback's status or gates a
 * proposal's review; only a published correction reads as completed.
 */
export function FeedbackCorrectionPanel<Row extends { id: string }>({
  feedbackId,
  slug,
  category,
  onLinked,
}: {
  feedbackId: string;
  slug: string;
  category?: string;
  /** The feedback row as the link left it, so the decision log can show the link. */
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
  const [notice, setNotice] = useState<Notice | null>(null);
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
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "Unable to link that change." });
    } finally {
      setLinking(false);
    }
  }

  const candidates = state.status === "ready" ? state.candidates : { proposals: [], revisions: [] };
  const hasCandidates = candidates.proposals.length + candidates.revisions.length > 0;
  const corrections = state.status === "ready" ? state.corrections : [];
  const completed = corrections.some((correction) => isCompletedCorrection(correction.state));

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div>
        <h4 id={headingId} className="theme-accent-heading text-sm font-semibold">
          Correction
        </h4>
        <p className="theme-text-faint mt-0.5 text-xs">
          Advisory. A linked change never gates its own review or publication, and this feedback&apos;s status stays
          your decision.
        </p>
      </div>

      {state.status === "loading" ? (
        <EditorStatusPill tone="info" loading live>
          Loading corrections...
        </EditorStatusPill>
      ) : null}
      {state.status === "error" ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="theme-text-secondary text-sm">
            {state.message}
          </p>
          {/* Named for this panel: the queue above keeps its own Try again. */}
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            Reload corrections
          </Button>
        </div>
      ) : null}
      {state.status === "ready" ? (
        corrections.length === 0 ? (
          <p className="theme-text-muted text-sm">No change is linked yet.</p>
        ) : (
          <ol aria-label="Linked changes" className="space-y-3">
            {corrections.map((correction) => (
              <CorrectionRow key={`${correction.change.kind}:${correction.change.id}`} correction={correction} slug={slug} />
            ))}
          </ol>
        )
      ) : null}
      {state.status === "ready" && corrections.length > 0 && !completed ? (
        <p className="theme-text-secondary text-sm">No correction has been published for this feedback yet.</p>
      ) : null}

      <EditorToolbar label="Correction actions" variant="split">
        <EditorActionGroup label="Start correction">
          <label htmlFor={sectionId} className="sr-only">
            Section to correct
          </label>
          <Select value={section} onValueChange={setSection}>
            <SelectTrigger id={sectionId} selectSize="compact" className="w-48">
              <SelectValue>{section === WHOLE_ARTICLE ? "Whole article" : (isArticleEditorSection(section) ? ARTICLE_SECTION_LABELS[section] : "Whole article")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={WHOLE_ARTICLE}>Whole article</SelectItem>
              {(Object.keys(ARTICLE_SECTION_LABELS) as ArticleEditorSection[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {ARTICLE_SECTION_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild variant="outline" size="sm">
            <a href={correctionHref(slug, feedbackId, section === WHOLE_ARTICLE ? null : section)} target="_blank" rel="noopener noreferrer">
              Start correction
            </a>
          </Button>
        </EditorActionGroup>
        <EditorActionGroup label="Link existing change" align="end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={picking}
            disabled={state.status !== "ready"}
            onClick={() => setPicking((open) => !open)}
          >
            Link existing change
          </Button>
        </EditorActionGroup>
      </EditorToolbar>
      <p className="theme-text-faint text-xs">
        Start correction opens the article editor in a new tab. A proposal you submit there is linked here; this
        feedback&apos;s id travels with it, never the reader&apos;s contact details.
      </p>

      {picking ? (
        hasCandidates ? (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={pickerId} className="sr-only">
              Change to link
            </label>
            <Select value={choice} onValueChange={setChoice}>
              <SelectTrigger id={pickerId} selectSize="compact" className="min-w-0 max-w-full flex-1">
                <SelectValue placeholder="Choose a proposal or published revision" />
              </SelectTrigger>
              <SelectContent>
                {candidates.proposals.map((proposal) => (
                  <SelectItem key={`proposal:${proposal.id}`} value={`proposal:${proposal.id}`}>
                    Proposal {shortId(proposal.id)} · {proposal.status.replace("_", " ")} · {proposal.summary}
                  </SelectItem>
                ))}
                {candidates.revisions.map((revision) => (
                  <SelectItem key={`revision:${revision.id}`} value={`revision:${revision.id}`}>
                    Published revision {shortId(revision.id)} · {formatFeedbackDate(revision.createdAt)} · {revision.summary}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" disabled={!parseChoice(choice) || linking} onClick={() => void link()}>
              {linking ? "Linking..." : "Link"}
            </Button>
          </div>
        ) : (
          <p className="theme-text-muted text-sm">This article has no proposals or published revisions to link.</p>
        )
      ) : null}

      {notice ? (
        <ActionNotice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.message}
        </ActionNotice>
      ) : null}
    </section>
  );
}

function CorrectionRow({ correction, slug }: { correction: ResolvedCorrection; slug: string }) {
  const { proposal, revision, state } = correction;
  const label = CORRECTION_STATE_LABEL[state];
  return (
    <li className="theme-portal-rule border-l-2 pl-3">
      <div className="flex flex-wrap items-center gap-2">
        <EditorStatusPill tone={CORRECTION_STATE_TONE[state]}>{label}</EditorStatusPill>
        <span className="theme-text-faint text-xs">Linked {formatFeedbackDate(correction.linkedAt)}</span>
      </div>
      {proposal ? (
        <p className="theme-text-primary mt-1 text-sm">
          <a href={devHref({ type: "dev", tab: "queue", slug: encodeURIComponent(proposal.id) })} className="theme-accent-heading hover:underline">
            Proposal {shortId(proposal.id)}
          </a>
          {`: ${proposal.summary}`}
          {correction.revisedFrom ? (
            <span className="theme-text-faint text-xs"> · revision of proposal {shortId(correction.revisedFrom)}</span>
          ) : null}
        </p>
      ) : null}
      {revision && isCompletedCorrection(state) ? (
        <p className="theme-text-secondary mt-1 text-sm">
          Published revision {shortId(revision.id)} · {formatFeedbackDate(revision.createdAt)} · {revision.summary} ·{" "}
          <a href={`/${slug}`} target="_blank" rel="noopener noreferrer" className="theme-accent-heading hover:underline">
            Open article
          </a>
        </p>
      ) : null}
      {revision && !isCompletedCorrection(state) ? (
        <p className="theme-text-secondary mt-1 text-sm">
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

async function requestJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error("Network error while reaching the feedback correction.");
  }
  const payload: unknown = await response.json().catch(() => null);
  const record = payload !== null && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null;
  if (!response.ok) {
    throw new Error(typeof record?.error === "string" ? record.error : "Unable to reach the feedback correction.");
  }
  if (!record) {
    throw new Error("The server returned an unreadable response. Try again.");
  }
  return record;
}
