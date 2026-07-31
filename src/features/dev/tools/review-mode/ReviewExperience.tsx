"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";

import { api } from "../../../../../convex/_generated/api";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PublicSegmentedTabs } from "@/components/layout/PublicSegmentedTabs";
import { useLightweightData } from "@/data/LightweightDataProvider";
import { moleculeOverrideImageUrl } from "@/data/mappings/moleculeOverrideUrl";
import {
  EditorNotice,
  EditorSelect,
  EditorStatusPill,
} from "@/features/dev/components";
import { ArticleLayout } from "@/features/article/components/ArticleLayout";
import {
  ArticleEditProvider,
  type ArticleEditContextValue,
  type EditableFieldValue,
} from "@/features/article/editing";
import {
  getArticleValueByPath,
  setArticleValueByPath,
} from "@/data/schema/fieldPath";
import type { SubstanceArticle } from "@/schema";
import { cn } from "@/lib/utils";
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
  applyInlineFieldEdits,
  asInlineFieldValue,
  type InlineFieldEdit,
} from "./inlineFieldEdits";
import { ReviewMoleculePanel } from "./ReviewMoleculePanel";
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
import {
  crossedMilestone,
  loadReviewSettings,
  REVIEW_SETTINGS_DEFAULTS,
  saveReviewSettings,
} from "./reviewSettings";

const UNDO_WINDOW_MS = 8000;
const MILESTONE_MS = 4000;

/** Ties the bar toggle's `aria-controls` to the inline molecule panel region. */
const MOLECULE_PANEL_ID = "review-molecule-panel";

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

/** Keycap glyph rendered inside the button that owns the shortcut. */
function Kbd({ children }: { children: string }) {
  return (
    <kbd
      aria-hidden
      className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded border border-current/25 px-1 font-sans text-[10px] leading-none opacity-60"
    >
      {children}
    </kbd>
  );
}

const STATUS_DOT: Record<ReviewStatus, { className: string; label: string }> = {
  completed: { className: "theme-review-status-completed", label: "Reviewed" },
  in_progress: { className: "theme-review-status-in-progress", label: "Flagged in progress" },
  needed: { className: "theme-review-status-needed", label: "Not reviewed" },
};

/** One truth for progress: reviewed over the whole public corpus, monotonic. */
function ProgressStrip({ reviewed, total }: { reviewed: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((reviewed / total) * 100);
  return (
    <div className="min-w-[9rem] flex-1 sm:min-w-[12rem] sm:max-w-xs">
      <div className="theme-text-faint mb-1 flex items-baseline justify-between text-[11px] leading-none tabular-nums">
        <span>
          {reviewed.toLocaleString()} of {total.toLocaleString()} reviewed
        </span>
        <span>{(total - reviewed).toLocaleString()} to go</span>
      </div>
      <div
        className="theme-review-progress-track h-1 overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={reviewed}
        aria-label="Articles reviewed"
      >
        <div
          className="theme-review-progress-fill h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * The article name doubles as a jump-anywhere picker: the full public queue,
 * searchable, in the current order — the same Popover + Command combobox the
 * molecule editor's substance picker uses, so it reads as one system.
 */
function ReviewSubstancePicker({
  entries,
  current,
  onSelect,
}: {
  entries: readonly {
    slug: string;
    name: string;
    status: ReviewStatus;
  }[];
  current: { slug: string; name: string; status: ReviewStatus } | null;
  onSelect: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const dot = current ? STATUS_DOT[current.status] : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="auto"
          role="combobox"
          aria-expanded={open}
          aria-label={
            current
              ? `Current article: ${current.name}. Open the substance list`
              : "Open the substance list"
          }
          title="Jump to any article"
          className="max-w-[18rem] gap-2 px-2 py-1"
        >
          {dot ? (
            <span
              aria-hidden
              title={dot.label}
              className={cn("h-2 w-2 shrink-0 rounded-full", dot.className)}
            />
          ) : null}
          <span className="theme-text-primary font-display truncate text-base font-semibold leading-none">
            {current?.name ?? "—"}
          </span>
          <Icon
            icon="lucide:chevrons-up-down"
            size={14}
            className="theme-text-faint shrink-0"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(24rem,90vw)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name or slug…" />
          <CommandList>
            <CommandEmpty>No articles found</CommandEmpty>
            <CommandGroup>
              {entries.map((entry) => (
                <CommandItem
                  key={entry.slug}
                  value={`${entry.name} ${entry.slug}`}
                  onSelect={() => {
                    onSelect(entry.slug);
                    setOpen(false);
                  }}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mr-2 h-2 w-2 shrink-0 rounded-full",
                      STATUS_DOT[entry.status].className,
                    )}
                  />
                  <span className="truncate font-medium">{entry.name}</span>
                  <span className="theme-text-faint ml-2 shrink-0 text-xs">
                    {entry.slug}
                  </span>
                  {entry.status === "completed" ? (
                    <EditorStatusPill
                      tone="success"
                      icon="lucide:badge-check"
                      className="ml-auto"
                    >
                      reviewed
                    </EditorStatusPill>
                  ) : entry.status === "in_progress" ? (
                    <EditorStatusPill
                      tone="warning"
                      icon="lucide:flag"
                      className="ml-auto"
                    >
                      flagged
                    </EditorStatusPill>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Transient bottom-right toast for tick confirmations and milestones. */
function ReviewToast({
  tone,
  children,
}: {
  tone: "success" | "milestone";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-full border px-4 py-2.5 text-sm shadow-xl backdrop-blur-[14px]",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2",
        tone === "success" ? "theme-review-toast-success" : "theme-review-toast-neutral",
      )}
    >
      {children}
    </div>
  );
}

const REVIEW_CRITERIA = [
  "Facts match the cited sources — nothing invented or overstated.",
  "Dosage and duration tables are sane and agree with the source material.",
  "Safety-critical sections (interactions, harm potential) read correctly.",
  "Tone and formatting match the site; no generation artifacts left behind.",
];

type ReviewExperienceProps = Pick<SubstanceEditorTabProps, "renderCommitPanel"> & {
  initialSlug?: string;
};

/**
 * The full-bleed review workbench (`/review/[slug]`).
 *
 * One sticky command bar over one article. The tick persists through
 * `/api/dev/editorial-review` (never the full save flow) and stays in sync
 * with the editor form's own review fields in both directions — see
 * `ReviewStatusOverride.baseStatus` for the drift rule. Keyboard: ← previous,
 * → next, R toggle reviewed, U undo the last tick, M the molecule panel.
 */
export const ReviewExperience = memo(function ReviewExperience({
  renderCommitPanel,
  initialSlug,
}: ReviewExperienceProps) {
  const { articles, applyArticlesTransform } = useDevMode();
  const { layout } = useLightweightData();
  const typedArticles = articles as SubstanceArticle[];

  const [settings, setSettings] = useState(REVIEW_SETTINGS_DEFAULTS);
  const { order, unreviewedOnly, viewMode, inlineEdit } = settings;
  // Restore after mount so the server render matches first client paint.
  useEffect(() => {
    setSettings(loadReviewSettings());
  }, []);
  const updateSettings = useCallback(
    (patch: Partial<typeof REVIEW_SETTINGS_DEFAULTS>) => {
      setSettings((previous) => {
        const next = { ...previous, ...patch };
        saveReviewSettings(next);
        return next;
      });
    },
    [],
  );

  const [sourceTokens, setSourceTokens] = useState<Record<string, number>>({});
  const [statsState, setStatsState] = useState<"loading" | "ready" | "fallback">(
    "loading",
  );
  const [overrides, setOverrides] = useState<ReviewStatusOverrides>({});
  // Saved inline field edits, keyed by slug then by concrete field path. These
  // are already persisted; the map exists only so the rendered article keeps
  // showing what Convex now holds without touching the shared working set.
  //
  // `before` is what the working-set article held when the edit was saved. An
  // overlay entry addresses a concrete index, so the moment the working set
  // moves underneath it — a route reordered or removed, the same note edited
  // through the form — the entry is pointing at something else and has to go.
  const [fieldEdits, setFieldEdits] = useState<
    Record<string, Record<string, InlineFieldEdit>>
  >({});
  const [currentSlug, setCurrentSlug] = useState<string | null>(
    initialSlug ?? null,
  );
  const [history, setHistory] = useState<string[]>([]);
  const [isTicking, setIsTicking] = useState(false);
  const [tickError, setTickError] = useState<string | null>(null);
  const [lastTick, setLastTick] = useState<{
    slug: string;
    name: string;
    previous: ReviewStatus;
  } | null>(null);
  const [milestone, setMilestone] = useState<number | null>(null);
  // Deliberately not persisted: the panel is a per-article detour, and a stored
  // "open" would make every fresh session boot the WASM editor unasked.
  const [moleculePanelOpen, setMoleculePanelOpen] = useState(false);

  const currentSlugRef = useRef<string | null>(currentSlug);
  currentSlugRef.current = currentSlug;
  const undoTimerRef = useRef<number | null>(null);
  const milestoneTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
      if (milestoneTimerRef.current !== null) window.clearTimeout(milestoneTimerRef.current);
    },
    [],
  );

  // Source richness drives the default order; fall back to bibliography sizes
  // and say so, rather than silently pretending the stats arrived.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/dev/article-source-stats")
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (payload: {
          stats?: Array<{ slug: string; totalTokens?: number }>;
        } | null) => {
          if (cancelled) return;
          if (!payload?.stats) {
            setStatsState("fallback");
            return;
          }
          const tokens: Record<string, number> = {};
          for (const stat of payload.stats) {
            tokens[stat.slug] = stat.totalTokens ?? 0;
          }
          setSourceTokens(tokens);
          setStatsState("ready");
        },
      )
      .catch(() => {
        if (!cancelled) setStatsState("fallback");
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

  // Inline field saves land in Convex through their own endpoint, so — exactly
  // like the review tick — the dev shell's in-memory article set is left alone
  // and the saved value is layered over the render instead. Mutating the
  // working set would register a phantom pending change with the commit panel
  // and deep-clone the whole corpus per keystroke-sized edit.
  // See `applyInlineFieldEdits` for when an overlay entry stops applying.
  const currentFieldEdits = current ? fieldEdits[current.slug] : undefined;
  const articleForView = useMemo(
    () => (article ? applyInlineFieldEdits(article, currentFieldEdits) : article),
    [article, currentFieldEdits],
  );

  // The public route resolves the Convex depiction server-side; this surface is
  // client-rendered, so it asks Convex directly. Reactivity means a save in the
  // inline molecule panel re-versions the article image without a refresh.
  const moleculeMeta = useQuery(
    api.moleculeOverrides.getMetadataBySlug,
    current ? { slug: current.slug } : "skip",
  );
  const moleculeOverrideUrl =
    current && moleculeMeta ? moleculeOverrideImageUrl(current.slug, moleculeMeta.updatedAt) : null;

  // The editor form hydrates from the working set, which never receives the
  // inline edit. Handing it the overlaid article instead is what stops an
  // "Apply to draft" from writing the pre-edit value back over Convex.
  const articlesForDraft = useMemo(() => {
    if (!article || !articleForView || articleForView === article) {
      return typedArticles;
    }
    const overlaid = articleForView;
    return typedArticles.map((candidate) =>
      candidate === article ? overlaid : candidate,
    );
  }, [article, articleForView, typedArticles]);

  const reviewedCount = useMemo(
    () => queue.filter((entry) => entry.status === "completed").length,
    [queue],
  );
  const allReviewed = queue.length > 0 && reviewedCount === queue.length;

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
    articles: articlesForDraft,
    applyArticlesTransform: applyDraftArticlesTransform,
    selectedSubstanceSlug: current?.slug ?? null,
    substances,
  });

  // The commit handle handed to `EditableValue` must stay referentially stable,
  // or every keystroke-scale re-render would churn the whole article subtree.
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // The slug of the article actually on screen. `currentSlug` is seeded from
  // the URL and the queue drops non-public articles, so a deep link to one of
  // those renders the head of the queue instead — writing to `currentSlug`
  // would stamp the visible article's text onto a different substance.
  const viewSlugRef = useRef<string | null>(current?.slug ?? null);
  viewSlugRef.current = current?.slug ?? null;
  const articleRef = useRef<SubstanceArticle | null>(article);
  articleRef.current = article;

  /**
   * Persist one inline field edit and reconcile it locally.
   *
   * Rejects with a message `EditableValue` renders inline. The dirty-form guard
   * is the important one: the editor tab holds a whole separate draft article,
   * and letting a field write land underneath it would make the next form save
   * silently revert the inline edit.
   */
  const commitArticleField = useCallback(
    async (
      path: string,
      value: EditableFieldValue,
      expected: EditableFieldValue,
    ): Promise<EditableFieldValue> => {
      const slug = viewSlugRef.current;
      if (!slug) {
        throw new Error("No article is selected.");
      }
      if (draftRef.current.formDirty) {
        throw new Error(
          "This article has unapplied editor form edits. Apply or discard them before editing inline.",
        );
      }

      const response = await fetch("/api/dev/article-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `expected` is the whole safety story for indexed paths: the store
        // refuses the write unless it still holds what the screen showed.
        body: JSON.stringify({ slug, path, value, expected }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        value?: EditableFieldValue;
      } | null;
      if (!response.ok) {
        throw new Error(
          payload?.error ??
            "Unable to save that edit. Are you signed in as an editor?",
        );
      }
      // The mutation echoes what it stored; a shape it did not expect means the
      // local value is the better record of the write than the response is.
      const saved = asInlineFieldValue(payload?.value, value);

      // A fast edit-then-→ must never write one article's value into the next
      // article's mounted form, so both reconciliations are slug-guarded.
      if (viewSlugRef.current === slug) {
        // The overlay's `before` has to be the working set's real value, not
        // the client's claim about it — falling back to `expected` for anything
        // that is not a bare string would make every range overlay believe
        // itself current forever.
        const baseline = asInlineFieldValue(
          getArticleValueByPath(articleRef.current, path),
          expected,
        );
        setFieldEdits((previous) => ({
          ...previous,
          [slug]: {
            ...previous[slug],
            [path]: { before: baseline, value: saved },
          },
        }));

        const override = draftRef.current.formArticleOverride;
        if (override) {
          const updated = setArticleValueByPath(override, path, saved);
          draftRef.current.setFormArticleOverride(updated);
          draftRef.current.setStreamedOutput(buildArticleYamlDraft(updated));
        }
      }

      return saved;
    },
    [],
  );

  const articleEditContext = useMemo<ArticleEditContextValue>(
    () => ({ commit: commitArticleField }),
    [commitArticleField],
  );

  const navigateTo = useCallback(
    (slug: string, options?: { recordHistory?: boolean }) => {
      const previousSlug = currentSlugRef.current;
      if (slug === previousSlug) return;
      if (
        draft.formDirty &&
        !window.confirm(
          "This article has unapplied form edits that will be discarded. Move on anyway?",
        )
      ) {
        return;
      }
      if (options?.recordHistory !== false && previousSlug) {
        setHistory((stack) => [...stack.slice(-49), previousSlug]);
      }
      setTickError(null);
      setCurrentSlug(slug);
      // Keep the address shareable without routing the whole shell, and land
      // at the top of the next article — losing her place was the old sin.
      window.history.replaceState(null, "", `/review/${slug}`);
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    },
    [draft.formDirty],
  );

  const goNext = useCallback(() => {
    const next = visibleQueue[position + 1];
    if (next) navigateTo(next.slug);
  }, [navigateTo, position, visibleQueue]);

  // Prev walks the visit history, so it keeps working after a tick removes the
  // previous article from the filtered queue — the mis-tick stays reachable.
  const goPrev = useCallback(() => {
    if (history.length > 0) {
      const target = history[history.length - 1];
      setHistory((stack) => stack.slice(0, -1));
      navigateTo(target, { recordHistory: false });
      return;
    }
    const previous = visibleQueue[position - 1];
    if (previous) navigateTo(previous.slug);
  }, [history, navigateTo, position, visibleQueue]);

  const canGoPrev = history.length > 0 || position > 0;
  const canGoNext = position < visibleQueue.length - 1;

  const setReviewStatus = useCallback(
    async (
      slug: string,
      name: string,
      status: ReviewStatus,
      baseStatus: ReviewStatus,
      options?: { isUndo?: boolean },
    ) => {
      setIsTicking(true);
      setTickError(null);
      const previousReviewed = reviewedCount;
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
        // with the tick — but only when the form still shows this article.
        // A fast R-then-→ must never write one article's review into the
        // next article's mounted form.
        if (viewSlugRef.current === slug) {
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
        }

        if (status === "completed" && !options?.isUndo) {
          setLastTick({ slug, name, previous: baseStatus });
          if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
          undoTimerRef.current = window.setTimeout(
            () => setLastTick(null),
            UNDO_WINDOW_MS,
          );

          const mark = crossedMilestone(previousReviewed, previousReviewed + 1);
          if (mark !== null) {
            setMilestone(mark);
            if (milestoneTimerRef.current !== null) {
              window.clearTimeout(milestoneTimerRef.current);
            }
            milestoneTimerRef.current = window.setTimeout(
              () => setMilestone(null),
              MILESTONE_MS,
            );
          }
        } else {
          setLastTick(null);
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
    [draft, reviewedCount],
  );

  const articleStatus = useCallback((entrySlug: string): ReviewStatus => {
    const record = typedArticles.find((candidate) => {
      const withSlug = candidate as SubstanceArticle & { slug?: unknown };
      return typeof withSlug.slug === "string" && withSlug.slug === entrySlug;
    });
    const raw = record?.editorial_review?.status;
    return raw === "in_progress" || raw === "completed" ? raw : "needed";
  }, [typedArticles]);

  const toggleReviewed = useCallback(() => {
    if (!current || isTicking) return;
    void setReviewStatus(
      current.slug,
      current.name,
      current.status === "completed" ? "needed" : "completed",
      articleStatus(current.slug),
    );
  }, [articleStatus, current, isTicking, setReviewStatus]);

  const toggleFlagged = useCallback(() => {
    if (!current || isTicking) return;
    void setReviewStatus(
      current.slug,
      current.name,
      current.status === "in_progress" ? "needed" : "in_progress",
      articleStatus(current.slug),
    );
  }, [articleStatus, current, isTicking, setReviewStatus]);

  const toggleMoleculePanel = useCallback(() => {
    if (!currentSlugRef.current) return;
    setMoleculePanelOpen((open) => !open);
  }, []);

  // Moving on collapses the panel, so the WASM canvas never lingers over the
  // wrong molecule — and the next article starts from the article itself.
  useEffect(() => {
    setMoleculePanelOpen(false);
  }, [currentSlug]);

  const undoLastTick = useCallback(() => {
    if (!lastTick || isTicking) return;
    void setReviewStatus(
      lastTick.slug,
      lastTick.name,
      lastTick.previous,
      articleStatus(lastTick.slug),
      { isUndo: true },
    );
  }, [articleStatus, isTicking, lastTick, setReviewStatus]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      } else if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        toggleReviewed();
      } else if (event.key === "u" || event.key === "U") {
        event.preventDefault();
        undoLastTick();
      } else if (event.key === "m" || event.key === "M") {
        event.preventDefault();
        toggleMoleculePanel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrev, toggleMoleculePanel, toggleReviewed, undoLastTick]);

  if (queue.length === 0) {
    return (
      <main className="theme-page-shell min-h-screen p-8">
        <div className="mx-auto max-w-xl pt-16">
          <EditorNotice
            notice={{
              tone: "info",
              message:
                "No publicly listed articles are available to review yet.",
            }}
          />
        </div>
      </main>
    );
  }

  const isCurrentReviewed = current?.status === "completed";
  const isCurrentFlagged = current?.status === "in_progress";
  const dot = current ? STATUS_DOT[current.status] : null;

  return (
    <main className="theme-page-shell min-h-screen">
      {/* Screen-reader narration for keyboard-driven article changes. */}
      <p aria-live="polite" className="sr-only">
        {current
          ? `${current.name}, ${dot?.label ?? ""}. ${reviewedCount} of ${queue.length} reviewed.`
          : ""}
      </p>

      {/* The command bar: everything the flip-through needs, pinned over the
          article so it never scrolls away mid-read. */}
      <div className="theme-review-command-bar sticky top-0 z-40 border-b backdrop-blur-[14px]">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:px-5">
          <Button
            asChild
            variant="iconGhost"
            size="auto"
            title="Back to Dev Tools"
          >
            <Link href="/dev" aria-label="Back to Dev Tools">
              <Icon icon="lucide:arrow-left-to-line" size={16} />
            </Link>
          </Button>

          <Button
            variant="glass"
            size="pill"
            onClick={goPrev}
            disabled={!canGoPrev}
            title="Previous article (←)"
          >
            <Icon icon="lucide:chevron-left" size={16} />
            <Kbd>←</Kbd>
          </Button>

          <div className="flex min-w-0 items-center gap-1">
            <ReviewSubstancePicker
              entries={queue}
              current={current}
              onSelect={navigateTo}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="iconGhost" size="auto" title="Open elsewhere">
                  <Icon icon="lucide:external-link" size={15} />
                  <Icon icon="lucide:chevron-down" size={12} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem asChild>
                  <a href={`/${current?.slug}`} target="_blank" rel="noreferrer">
                    <Icon icon="lucide:globe" size={15} />
                    Live article
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a
                    href={`/dev/articles/${current?.slug}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Icon icon="lucide:pencil" size={15} />
                    Full substance editor
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a
                    href={`/dev/molecules/${current?.slug}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Icon icon="lucide:hexagon" size={15} />
                    Full molecule editor (new tab)
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <ProgressStrip reviewed={reviewedCount} total={queue.length} />

          <Button
            variant={isCurrentFlagged ? "iconWarning" : "iconGhost"}
            size="auto"
            onClick={toggleFlagged}
            disabled={!current || isTicking}
            title={
              isCurrentFlagged
                ? "Flagged as in progress — click to clear"
                : "Flag as in progress (can't finish it now)"
            }
          >
            <Icon icon="lucide:flag" size={15} />
          </Button>

          {isCurrentReviewed ? (
            <span className="flex items-center gap-1.5">
              <Button variant="success" size="pill" onClick={toggleReviewed} disabled={isTicking} title="Reviewed — click to undo (R)">
                <Icon icon="lucide:badge-check" size={16} />
                Reviewed
              </Button>
              <Button variant="textLink" size="auto" onClick={toggleReviewed} disabled={isTicking}>
                Undo
              </Button>
            </span>
          ) : (
            <Button
              variant="accent"
              size="pill"
              className="rounded-full px-4"
              onClick={toggleReviewed}
              disabled={!current || isTicking}
              title="Mark as reviewed (R)"
            >
              <Icon
                icon={isTicking ? "lucide:loader-2" : "lucide:badge-check"}
                size={16}
                className={isTicking ? "animate-spin" : undefined}
              />
              Mark reviewed
              <Kbd>R</Kbd>
            </Button>
          )}

          <Button
            variant="glass"
            size="pill"
            onClick={goNext}
            disabled={!canGoNext}
            title="Next article (→)"
          >
            <Kbd>→</Kbd>
            <Icon icon="lucide:chevron-right" size={16} />
          </Button>

          <div className="ml-auto flex items-center gap-1.5">
            {/* One joined segmented control, so the two views read as a single
                either/or toggle rather than two sibling buttons. */}
            <PublicSegmentedTabs<"webpage" | "editor">
              ariaLabel="Review view"
              value={viewMode}
              onValueChange={(view) => updateSettings({ viewMode: view })}
              items={[
                { id: "webpage", label: "Webpage", icon: "lucide:globe" },
                { id: "editor", label: "Editor", icon: "lucide:file-edit" },
              ]}
            />
            {/* Icon + keycap only: the bar already wraps around 1280px once the
                title, progress strip and review controls are in it. */}
            <Button
              variant={moleculePanelOpen ? "pillActive" : "pill"}
              size="pill"
              onClick={toggleMoleculePanel}
              disabled={!current}
              aria-expanded={moleculePanelOpen}
              aria-controls={MOLECULE_PANEL_ID}
              aria-label="Molecule depiction editor"
              title={
                moleculePanelOpen
                  ? "Hide the molecule depiction editor (M)"
                  : "Edit the molecule depiction inline (M)"
              }
            >
              <Icon icon="lucide:hexagon" size={14} />
              <Kbd>M</Kbd>
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="iconGhost" size="auto" title="Queue settings">
                  <Icon icon="lucide:settings-2" size={16} />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 space-y-4">
                <label
                  htmlFor="review-queue-order"
                  className="theme-text-faint block space-y-1.5 text-xs"
                >
                  <span className="font-semibold uppercase tracking-[0.12em]">
                    Queue order
                  </span>
                  <EditorSelect
                    id="review-queue-order"
                    selectSize="sm"
                    value={order}
                    onChange={(event) =>
                      updateSettings({
                        order: event.target.value as ReviewQueueOrder,
                      })
                    }
                    options={REVIEW_QUEUE_ORDER_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                  />
                  {order === "sources" && statsState === "fallback" ? (
                    <span className="theme-warning-text block text-[11px]">
                      Source stats unavailable — ordering by bibliography size
                      instead.
                    </span>
                  ) : null}
                </label>
                <label className="theme-text-faint flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={unreviewedOnly}
                    onChange={(event) =>
                      updateSettings({ unreviewedOnly: event.target.checked })
                    }
                    className="accent-dose-accent-strong"
                  />
                  Show unreviewed articles only
                </label>
                <div className="space-y-1.5">
                  <label className="theme-text-faint flex cursor-pointer items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={inlineEdit}
                      onChange={(event) =>
                        updateSettings({ inlineEdit: event.target.checked })
                      }
                      className="accent-dose-accent-strong"
                    />
                    Edit text inline on the page
                  </label>
                  <span className="theme-text-faint block text-[11px] leading-tight">
                    {viewMode === "webpage"
                      ? "Click any highlighted value in the Webpage view to edit it in place."
                      : "Applies to the Webpage view."}
                  </span>
                </div>
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="iconGhost"
                  size="auto"
                  title="What counts as reviewed?"
                >
                  <Icon icon="lucide:circle-help" size={16} />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 space-y-4 text-sm">
                <div>
                  <h2 className="theme-text-faint mb-2 text-xs font-semibold uppercase tracking-[0.12em]">
                    What counts as reviewed
                  </h2>
                  <ul className="theme-text-secondary space-y-1.5 text-[13px]">
                    {REVIEW_CRITERIA.map((item) => (
                      <li key={item} className="flex gap-2">
                        <Icon
                          icon="lucide:check"
                          size={14}
                          className="theme-review-success-text mt-0.5 shrink-0"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="theme-text-faint mt-2 text-[12px]">
                    Can&rsquo;t finish one? Flag it{" "}
                    <Icon icon="lucide:flag" size={12} className="inline" /> and
                    move on — it stays in the queue.
                  </p>
                </div>
                <div>
                  <h2 className="theme-text-faint mb-2 text-xs font-semibold uppercase tracking-[0.12em]">
                    Keyboard
                  </h2>
                  <dl className="theme-text-secondary grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                    <dt><Kbd>←</Kbd></dt>
                    <dd>Previous article</dd>
                    <dt><Kbd>→</Kbd></dt>
                    <dd>Next article</dd>
                    <dt><Kbd>R</Kbd></dt>
                    <dd>Toggle reviewed</dd>
                    <dt><Kbd>U</Kbd></dt>
                    <dd>Undo the last tick</dd>
                    <dt><Kbd>M</Kbd></dt>
                    <dd>Molecule depiction panel</dd>
                  </dl>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        {tickError ? (
          <div className="mx-auto max-w-[1500px] px-3 pb-2 sm:px-5">
            <EditorNotice
              notice={{ tone: "danger", message: tickError, live: true }}
            />
          </div>
        ) : null}
      </div>

      {allReviewed ? (
        <FinishedState
          total={queue.length}
          showAll={() => updateSettings({ unreviewedOnly: false })}
        />
      ) : null}

      {moleculePanelOpen && current ? (
        <div className="mx-auto w-full max-w-[1500px] px-4 pt-4 sm:px-6">
          <ReviewMoleculePanel
            key={current.slug}
            id={MOLECULE_PANEL_ID}
            slug={current.slug}
            name={current.name}
            onClose={() => setMoleculePanelOpen(false)}
          />
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-[1500px] px-4 pb-20 pt-6 sm:px-6">
        {viewMode === "webpage" ? (
          articleForView ? (
            /* Only this branch is edit-enabled: the editor tab already owns a
               full draft of the article, and two live writers over one document
               is how an edit quietly disappears. A null value reaches every
               EditableValue as "no editing surface", so the toggle costs the
               rendered page nothing when it is off. */
            <ArticleEditProvider value={inlineEdit ? articleEditContext : null}>
              <ArticleLayout article={articleForView} moleculeOverrideUrl={moleculeOverrideUrl} />
            </ArticleEditProvider>
          ) : current ? (
            <EditorNotice
              notice={{
                tone: "warning",
                message: "No article data found for this substance.",
              }}
            />
          ) : null
        ) : (
          <div className="space-y-6">
            {draft.formDirty ? (
              <EditorStatusPill tone="warning" icon="lucide:circle-dot" live>
                Unapplied form edits
              </EditorStatusPill>
            ) : null}
            {draft.validationError ? (
              <EditorNotice
                notice={{
                  tone: "danger",
                  title: "Draft not applied",
                  message: draft.validationError,
                  live: true,
                }}
              />
            ) : null}
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
            ) : current ? (
              <EditorNotice
                notice={{
                  tone: "info",
                  message: "Loading the article into the editor form…",
                }}
              />
            ) : null}
            {renderCommitPanel ? (
              <div>
                {renderCommitPanel(
                  <Button
                    variant="glass"
                    size="pill"
                    className="rounded-full"
                    onClick={() => {
                      void draft.handleSaveToDatabase("draft");
                    }}
                    disabled={draft.isSaving || !draft.formDirty}
                  >
                    Apply to draft
                  </Button>,
                  "Apply form edits to the working set, then commit them to Convex. The review tick saves separately and needs no commit.",
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {milestone !== null ? (
        <ReviewToast tone="milestone">
          <Icon icon="lucide:party-popper" size={16} />
          <span className="font-semibold">{milestone} reviewed!</span>
          <span className="theme-text-faint">Keep rolling.</span>
        </ReviewToast>
      ) : lastTick ? (
        <ReviewToast tone="success">
          <Icon icon="lucide:badge-check" size={16} />
          <span>
            Marked <span className="font-semibold">{lastTick.name}</span>{" "}
            reviewed
          </span>
          <button
            type="button"
            onClick={undoLastTick}
            className="font-semibold underline underline-offset-2 hover:opacity-80"
          >
            Undo
          </button>
          <Kbd>U</Kbd>
        </ReviewToast>
      ) : null}
    </main>
  );
});

/**
 * The peak-end moment: article 274 deserves better than a warning notice.
 */
function FinishedState({
  total,
  showAll,
}: {
  total: number;
  showAll: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-14 text-center">
      <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
        <span
          aria-hidden
          className="theme-review-complete-ping absolute inset-0 rounded-full motion-safe:animate-ping motion-safe:[animation-iteration-count:3]"
        />
        <span className="theme-review-complete-badge relative flex h-20 w-20 items-center justify-center rounded-full border">
          <Icon
            icon="lucide:badge-check"
            size={40}
            className="theme-review-success-text"
          />
        </span>
      </div>
      <h2 className="theme-accent-heading font-display text-3xl font-bold">
        All {total.toLocaleString()} articles reviewed
      </h2>
      <p className="theme-text-secondary mt-3 text-sm">
        The entire launch corpus has been through manual review. That was the
        bottleneck — it isn&rsquo;t anymore.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Button variant="glass" size="pill" onClick={showAll}>
          Browse the reviewed queue
        </Button>
        <Button asChild variant="pill" size="pill">
          <Link href="/about/coverage">See the coverage page</Link>
        </Button>
      </div>
    </div>
  );
}
