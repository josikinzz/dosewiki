import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/common/Icon";
import {
  PublicSegmentedTabs,
  type PublicSegmentedTabItem,
} from "@/components/layout/PublicSegmentedTabs";
import { Button } from "@/components/ui/button";
import { useLightweightData } from "@/data/LightweightDataProvider";
import {
  EditorNotice,
  EditorSelect,
  EditorStatusPill,
} from "@/features/dev/components";
import { ArticleLayout } from "@/features/article/components/ArticleLayout";
import type { SubstanceArticle } from "@/schema";
import { useDevMode } from "../../context/DevModeContext";
import { ArticleDraftFormFieldsRHF } from "../../forms/ArticleDraftFormFieldsRHF";
import { buildArticleYamlDraft } from "../substance-editor/substanceEditorDraftUtils";
import { useSubstanceEditorDraftController } from "../substance-editor/useSubstanceEditorDraftController";
import type {
  ReviewStatus,
  SubstanceEditorTabProps,
  SubstanceInfo,
} from "../substance-editor/types";
import {
  buildReviewQueue,
  filterReviewQueue,
  flattenHomeOrder,
  queueIndexOf,
  REVIEW_QUEUE_ORDER_OPTIONS,
  sortReviewQueue,
  type ReviewQueueOrder,
  type ReviewStatusOverrides,
} from "./reviewQueue";

type ReviewViewMode = "webpage" | "editor";

const VIEW_TABS: PublicSegmentedTabItem<ReviewViewMode>[] = [
  { id: "webpage", label: "Webpage", icon: "lucide:globe" },
  { id: "editor", label: "Editor", icon: "lucide:file-edit" },
];

const STATUS_PILL: Record<
  ReviewStatus,
  { tone: "success" | "warning" | "info"; icon: string; label: string }
> = {
  completed: { tone: "success", icon: "lucide:badge-check", label: "Reviewed" },
  in_progress: {
    tone: "warning",
    icon: "lucide:circle-dot",
    label: "In progress",
  },
  needed: { tone: "info", icon: "lucide:circle", label: "Not reviewed" },
};

/** True when a key event originates inside a form control the user is typing in. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

type ReviewModeTabProps = Pick<SubstanceEditorTabProps, "renderCommitPanel"> & {
  initialSlug?: string;
};

/**
 * Flip-through manual review for the launch corpus (`/dev/review/[slug]`).
 *
 * One article at a time, rendered either as the public webpage (the real
 * `ArticleLayout`, molecule art and all) or as the editable form, with a
 * single tick that persists through the lightweight
 * `/api/dev/editorial-review` endpoint rather than the full save flow.
 * Keyboard: ← / → move through the queue, R toggles the review tick.
 *
 * The tick and the form's own "Internal Review Tracking" fields stay in sync
 * both ways: a successful tick is written into the mounted form (and the
 * pending form draft), so a later "apply + commit" re-saves the same status
 * instead of silently reverting it; and if an editor changes the status
 * through the form instead, the recorded tick defers to the article (see
 * `ReviewStatusOverride.baseStatus`).
 */
export const ReviewModeTab = memo(function ReviewModeTab({
  renderCommitPanel,
  initialSlug,
}: ReviewModeTabProps) {
  const { articles, applyArticlesTransform } = useDevMode();
  const { layout } = useLightweightData();
  const typedArticles = articles as SubstanceArticle[];

  const [viewMode, setViewMode] = useState<ReviewViewMode>("webpage");
  const [unreviewedOnly, setUnreviewedOnly] = useState(true);
  const [order, setOrder] = useState<ReviewQueueOrder>("sources");
  const [sourceTokens, setSourceTokens] = useState<Record<string, number>>({});
  const [overrides, setOverrides] = useState<ReviewStatusOverrides>({});
  const [currentSlug, setCurrentSlug] = useState<string | null>(
    initialSlug ?? null,
  );
  const [isTicking, setIsTicking] = useState(false);
  const [tickError, setTickError] = useState<string | null>(null);

  // Source richness drives the default order. Best-effort: if the request
  // fails (or is still in flight), the sort falls back to bibliography sizes.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/dev/article-source-stats")
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (payload: {
          stats?: Array<{ slug: string; totalTokens?: number }>;
        } | null) => {
          if (cancelled || !payload?.stats) return;
          const tokens: Record<string, number> = {};
          for (const stat of payload.stats) {
            tokens[stat.slug] = stat.totalTokens ?? 0;
          }
          setSourceTokens(tokens);
        },
      )
      .catch(() => {
        // Sorting falls back; nothing to surface.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const homeOrder = useMemo(() => flattenHomeOrder(layout), [layout]);

  const queue = useMemo(
    () =>
      sortReviewQueue(buildReviewQueue(typedArticles, overrides), order, {
        sourceTokens,
        homeOrder,
      }),
    [typedArticles, overrides, order, sourceTokens, homeOrder],
  );
  const visibleQueue = useMemo(
    () => filterReviewQueue(queue, { unreviewedOnly, currentSlug }),
    [queue, unreviewedOnly, currentSlug],
  );

  // Land on the deep-linked article, else the first still-unreviewed one.
  useEffect(() => {
    if (currentSlug) return;
    const first =
      queue.find((entry) => entry.status !== "completed") ?? queue[0];
    if (first) setCurrentSlug(first.slug);
  }, [currentSlug, queue]);

  const position = queueIndexOf(visibleQueue, currentSlug);
  const current = visibleQueue[position] ?? null;

  const article = useMemo(() => {
    if (!current) return null;
    const bySlug = typedArticles.find((candidate) => {
      const record = candidate as SubstanceArticle & { slug?: unknown };
      return typeof record.slug === "string" && record.slug === current.slug;
    });
    return (
      bySlug ??
      typedArticles.find((candidate) => candidate.title === current.name) ??
      null
    );
  }, [current, typedArticles]);

  const reviewedCount = useMemo(
    () => queue.filter((entry) => entry.status === "completed").length,
    [queue],
  );

  // The editor view reuses the substance editor's draft machinery: it loads
  // the current article into the form and applies edits back into the shared
  // working set, so the commit panel below saves them exactly like the main
  // editor tab would.
  const substances = useMemo<SubstanceInfo[]>(
    () =>
      queue.map((entry) => ({
        slug: entry.slug,
        name: entry.name,
        reviewStatus: entry.status,
      })),
    [queue],
  );
  const applyDraftArticlesTransform = useCallback(
    (transform: (previous: SubstanceArticle[]) => SubstanceArticle[]) => {
      applyArticlesTransform((previous) =>
        transform(previous as SubstanceArticle[]),
      );
    },
    [applyArticlesTransform],
  );
  const draft = useSubstanceEditorDraftController({
    articles: typedArticles,
    applyArticlesTransform: applyDraftArticlesTransform,
    selectedSubstanceSlug: current?.slug ?? null,
    substances,
  });

  const navigateTo = useCallback(
    (slug: string) => {
      if (
        draft.formDirty &&
        !window.confirm(
          "This article has unapplied form edits that will be discarded. Move on anyway?",
        )
      ) {
        return;
      }
      setTickError(null);
      setCurrentSlug(slug);
      // Keep the address shareable without routing the whole dev shell.
      window.history.replaceState(null, "", `/dev/review/${slug}`);
    },
    [draft.formDirty],
  );

  const step = useCallback(
    (delta: number) => {
      if (visibleQueue.length === 0) return;
      const nextIndex = Math.min(
        Math.max(position + delta, 0),
        visibleQueue.length - 1,
      );
      const next = visibleQueue[nextIndex];
      if (next && next.slug !== currentSlug) {
        navigateTo(next.slug);
      }
    },
    [currentSlug, navigateTo, position, visibleQueue],
  );

  const setReviewStatus = useCallback(
    async (slug: string, status: ReviewStatus, baseStatus: ReviewStatus) => {
      setIsTicking(true);
      setTickError(null);
      try {
        const response = await fetch("/api/dev/editorial-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, status }),
        });
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          editorial_review?: SubstanceArticle["editorial_review"];
        } | null;
        if (!response.ok) {
          throw new Error(
            payload?.error ??
              "Unable to update the review status. Are you signed in as an editor?",
          );
        }
        setOverrides((previous) => ({
          ...previous,
          [slug]: { status, baseStatus },
        }));

        // Keep the editor form's "Internal Review Tracking" fields agreeing
        // with the tick, so applying + committing the article re-saves the
        // same status instead of reverting it with a stale value.
        const review = payload?.editorial_review ?? {
          status,
          notes: draft.formArticleOverride?.editorial_review?.notes ?? "",
        };
        draft.formRef.current?.methods.setValue("editorial_review", review);
        if (draft.formArticleOverride) {
          const updated = {
            ...draft.formArticleOverride,
            editorial_review: review,
          };
          draft.setFormArticleOverride(updated);
          draft.setStreamedOutput(buildArticleYamlDraft(updated));
        }
      } catch (error) {
        setTickError(
          error instanceof Error
            ? error.message
            : "Failed to update review status.",
        );
      } finally {
        setIsTicking(false);
      }
    },
    [draft],
  );

  const toggleReviewed = useCallback(() => {
    if (!current || !article || isTicking) return;
    const articleStatus =
      article.editorial_review?.status === "in_progress" ||
      article.editorial_review?.status === "completed"
        ? article.editorial_review.status
        : "needed";
    void setReviewStatus(
      current.slug,
      current.status === "completed" ? "needed" : "completed",
      articleStatus,
    );
  }, [article, current, isTicking, setReviewStatus]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      } else if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        toggleReviewed();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step, toggleReviewed]);

  if (queue.length === 0) {
    return (
      <div className="mt-6">
        <EditorNotice
          notice={{
            tone: "info",
            message: "No publicly listed articles are available to review yet.",
          }}
        />
      </div>
    );
  }

  const statusPill = current ? STATUS_PILL[current.status] : null;

  return (
    <div className="mt-6 space-y-6">
      {/* Queue chrome: progress, position, navigation, and the tick. */}
      <div className="space-y-4 rounded-2xl border border-dose-card-border bg-dose-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="theme-text-faint text-xs font-semibold uppercase tracking-[0.16em]">
            Launch review
          </span>
          <span className="theme-text-faint text-xs tabular-nums">
            {reviewedCount.toLocaleString()} of {queue.length.toLocaleString()}{" "}
            reviewed · {(queue.length - reviewedCount).toLocaleString()} to go
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <label
              htmlFor="review-queue-order"
              className="theme-text-faint flex items-center gap-2 text-xs"
            >
              Order
              <EditorSelect
                id="review-queue-order"
                selectSize="sm"
                className="w-48"
                value={order}
                onChange={(event) =>
                  setOrder(event.target.value as ReviewQueueOrder)
                }
                options={REVIEW_QUEUE_ORDER_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
              />
            </label>
            <label className="theme-text-faint flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={unreviewedOnly}
                onChange={(event) => setUnreviewedOnly(event.target.checked)}
                className="accent-dose-accent-strong"
              />
              Unreviewed only
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="glass"
            size="pill"
            onClick={() => step(-1)}
            disabled={position <= 0}
            title="Previous article (←)"
          >
            <Icon icon="lucide:arrow-left" size={16} />
            Prev
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <div className="flex items-center justify-center gap-2">
              <h2 className="theme-accent-heading font-display truncate text-xl font-semibold">
                {current?.name ?? "—"}
              </h2>
              {current ? (
                <>
                  <a
                    href={`/${current.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Open the live article in a new tab"
                    className="theme-text-faint hover:text-dose-accent-strong"
                  >
                    <Icon icon="lucide:external-link" size={16} />
                  </a>
                  <a
                    href={`/dev/articles/${current.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Open in the full substance editor"
                    className="theme-text-faint hover:text-dose-accent-strong"
                  >
                    <Icon icon="lucide:pencil" size={16} />
                  </a>
                  <a
                    href={`/dev/molecules/${current.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Open in the molecule editor"
                    className="theme-text-faint hover:text-dose-accent-strong"
                  >
                    <Icon icon="lucide:hexagon" size={16} />
                  </a>
                </>
              ) : null}
            </div>
            <div className="theme-text-faint mt-1 flex items-center justify-center gap-3 text-xs tabular-nums">
              <span>
                {visibleQueue.length === 0 ? 0 : position + 1} /{" "}
                {visibleQueue.length}
              </span>
              {statusPill ? (
                <EditorStatusPill tone={statusPill.tone} icon={statusPill.icon}>
                  {statusPill.label}
                </EditorStatusPill>
              ) : null}
            </div>
          </div>
          <Button
            variant="glass"
            size="pill"
            onClick={() => step(1)}
            disabled={position >= visibleQueue.length - 1}
            title="Next article (→)"
          >
            Next
            <Icon icon="lucide:arrow-right" size={16} />
          </Button>
        </div>

        <div className="flex flex-col items-center gap-2">
          <Button
            variant={current?.status === "completed" ? "outline" : "default"}
            size="lg"
            className="w-full max-w-md rounded-full"
            onClick={toggleReviewed}
            disabled={!current || isTicking}
            title="Toggle reviewed (R)"
          >
            <Icon
              icon={
                isTicking
                  ? "lucide:loader-2"
                  : current?.status === "completed"
                    ? "lucide:undo-2"
                    : "lucide:badge-check"
              }
              size={18}
              className={isTicking ? "animate-spin" : undefined}
            />
            {current?.status === "completed"
              ? "Reviewed — click to undo"
              : "Mark as reviewed"}
          </Button>
          <span className="theme-text-faint text-[11px]">
            Keyboard: ← previous · → next · R toggle reviewed
          </span>
        </div>

        {tickError ? (
          <EditorNotice
            notice={{ tone: "danger", message: tickError, live: true }}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PublicSegmentedTabs<ReviewViewMode>
          ariaLabel="Review view"
          value={viewMode}
          onValueChange={setViewMode}
          items={VIEW_TABS}
        />
        {viewMode === "editor" && draft.formDirty ? (
          <EditorStatusPill tone="warning" icon="lucide:circle-dot" live>
            Unapplied form edits
          </EditorStatusPill>
        ) : null}
      </div>

      {viewMode === "webpage" ? (
        article ? (
          <ArticleLayout article={article} />
        ) : (
          <EditorNotice
            notice={{
              tone: "warning",
              message: "No article data found for this substance.",
            }}
          />
        )
      ) : (
        <div className="space-y-6">
          {draft.saveError ? (
            <EditorNotice
              notice={{ tone: "danger", message: draft.saveError, live: true }}
            />
          ) : null}
          {draft.formArticleOverride ? (
            <ArticleDraftFormFieldsRHF
              key={current?.slug ?? "review-form"}
              idPrefix="review-form"
              article={draft.formArticleOverride}
              onMutate={draft.handleFormMutate}
              formRef={draft.formRef}
            />
          ) : (
            <EditorNotice
              notice={{
                tone: "info",
                message: "Loading the article into the editor form…",
              }}
            />
          )}
          {renderCommitPanel ? (
            <div>
              {renderCommitPanel(
                <Button
                  variant="glass"
                  size="pill"
                  className="rounded-full"
                  onClick={() => draft.handleSaveToDatabase("draft")}
                  disabled={draft.isSaving || !draft.formDirty}
                >
                  Apply article changes
                </Button>,
                "Apply form edits to the working set, then commit them to Convex. The review tick saves separately and needs no commit.",
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
});
