import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";

import { buildTagRegistry, type TagMutation, type TagMutationResult } from "@/data/tags/tagRegistry";
import type { SubstanceArticle } from "@/schema";
import type { TagRegistryEntry } from "../../../../server/lib/substanceTagRegistryProjection";
import { resolveEditorArticleSlug } from "../context/devModeUtils";
import { useDevMode } from "../context/DevModeContext";
import {
  EditorPanel,
  EditorSection,
  LoadErrorState,
  useConfirm,
  useDevShortcuts,
  useScrollToDetail,
} from "@/features/dev/components";
import { cn } from "@/lib/utils";
import { devHref } from "@/utils/devHref";
import { TAG_FIELD_LABELS, TAG_FIELDS, type TagField, type TagUsage } from "@/data/tags/tagRegistry";

import { useModifierKeyLabel } from "../pages/DevCommandPalette";
import { OnwardLink, RowSkeletons } from "../tools/home/homeParts";
import { TagListColumn, type TagReloadState } from "./TagListColumn";
import { TagDock, TagPane, type TagApplying, type TagChangeView } from "./TagPane";
import { TagChangeLead, WorkingChangesPanel } from "./WorkingChangesPanel";
import { applyDraft, baselineTagSignature } from "./tagDraftProjection";
import { articleWord, matchesInOtherFields, tagChanges, usageKey } from "./tagEditorModel";
import type { TagEditorTabProps, TagNoticeState, TagUndo } from "./types";
import {
  createTagEditorState,
  getFilteredTags,
  getSelectedUsage,
  getTotalTags,
  runTagEditorMutation,
  tagEditorReducer,
} from "./tagEditorStateMachine";

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const STACKED_QUERY = "(max-width: 1023px)";

type RegistryFetchState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; entries: TagRegistryEntry[] };

const TAG_REGISTRY_ENDPOINT = "/api/dev/editor-library?scope=tag-registry";

type RebasedTagMutation = {
  before: SubstanceArticle[];
  result: TagMutationResult;
};

function rebaseTagMutation({
  previous,
  baseline,
  landedBySlug,
  hydratedSlugs,
  mutation,
}: {
  previous: SubstanceArticle[];
  baseline: SubstanceArticle[];
  landedBySlug: ReadonlyMap<string, SubstanceArticle>;
  hydratedSlugs: ReadonlySet<string>;
  mutation: TagMutation;
}): RebasedTagMutation {
  const rebased = previous.map((draft, index) => {
    const slug = resolveEditorArticleSlug(draft);
    const landed = slug ? landedBySlug.get(slug) : undefined;
    return landed && draft === baseline[index] ? landed : draft;
  });

  const rewrite = runTagEditorMutation(rebased, mutation);
  const changes = rewrite.changes.filter((change) => {
    const slug = resolveEditorArticleSlug(rebased[change.index]);
    return slug !== null && hydratedSlugs.has(slug);
  });
  if (changes.length === 0) {
    return { before: rebased, result: { articles: previous, changes } };
  }
  if (changes.length === rewrite.changes.length) {
    return { before: rebased, result: rewrite };
  }

  const kept = new Set(changes.map((change) => change.index));
  return {
    before: rebased,
    result: {
      articles: rebased.map((row, index) => (kept.has(index) ? rewrite.articles[index] : row)),
      changes,
    },
  };
}

type RevertedTagMutation = { articles: SubstanceArticle[]; restoredCount: number };

function revertTagMutation(previous: SubstanceArticle[], undo: TagUndo): RevertedTagMutation {
  const bySlug = new Map<string, { before: SubstanceArticle; after: SubstanceArticle }>();
  for (const index of undo.changedIndexes) {
    const after = undo.after[index];
    const before = undo.before[index];
    const slug = after ? resolveEditorArticleSlug(after) : null;
    if (slug && before) {
      bySlug.set(slug, { before, after });
    }
  }

  let restoredCount = 0;
  const articles = previous.map((row) => {
    const slug = resolveEditorArticleSlug(row);
    const entry = slug ? bySlug.get(slug) : undefined;
    if (!entry || row !== entry.after) {
      return row;
    }
    restoredCount += 1;
    return entry.before;
  });
  return { articles: restoredCount === 0 ? previous : articles, restoredCount };
}

async function fetchTagRegistryEntries(): Promise<TagRegistryEntry[]> {
  const response = await fetch(TAG_REGISTRY_ENDPOINT);
  const payload = response.ok
    ? ((await response.json()) as { ok?: boolean; entries?: TagRegistryEntry[] })
    : null;
  if (!payload?.ok || !Array.isArray(payload.entries)) {
    throw new Error(`Tag registry request failed with status ${response.status}.`);
  }
  return payload.entries;
}

export function TagEditorTab({
  commitPanel,
  commit,
  datasetMarkdown,
  hasDatasetChanges,
  onCopyDatasetMarkdown,
  onDownloadDatasetMarkdown,
}: TagEditorTabProps) {
  const { articles, applyArticlesTransform, getOriginalArticles, articleHydration } = useDevMode();

  const [registryFetch, setRegistryFetch] = useState<RegistryFetchState>({ status: "loading" });
  const [registryRetry, setRegistryRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchTagRegistryEntries()
      .then((entries) => {
        if (!cancelled) {
          setRegistryFetch({ status: "ready", entries });
        }
      })
      .catch((error: unknown) => {
        console.error("Unable to load the tag registry.", error);
        if (!cancelled) {
          setRegistryFetch({ status: "error" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [registryRetry]);

  const registryEntries = registryFetch.status === "ready" ? registryFetch.entries : null;
  const baseline = useMemo(() => getOriginalArticles(), [getOriginalArticles]);
  const projectRegistry = useCallback(
    (draftArticles: readonly SubstanceArticle[]) =>
      buildTagRegistry(applyDraft(registryEntries ?? [], { articles: draftArticles, baseline: getOriginalArticles() })),
    [getOriginalArticles, registryEntries],
  );
  const registry = useMemo(
    () => buildTagRegistry(applyDraft(registryEntries ?? [], { articles, baseline })),
    [articles, baseline, registryEntries],
  );

  const baselineSignature = useMemo(() => baselineTagSignature(baseline), [baseline]);
  const fetchedForSignature = useRef(baselineSignature);
  useEffect(() => {
    if (fetchedForSignature.current === baselineSignature) {
      return;
    }
    fetchedForSignature.current = baselineSignature;
    let cancelled = false;
    fetchTagRegistryEntries()
      .then((entries) => {
        if (!cancelled) {
          setRegistryFetch({ status: "ready", entries });
        }
      })
      .catch((error: unknown) => {
        console.error("Unable to refresh the tag registry after the baseline moved.", error);
      });
    return () => {
      cancelled = true;
    };
  }, [baselineSignature]);

  const [reload, setReload] = useState<TagReloadState>("idle");
  const handleReload = useCallback(() => {
    setReload("busy");
    void fetchTagRegistryEntries()
      .then((entries) => {
        setRegistryFetch({ status: "ready", entries });
        setReload("idle");
      })
      .catch((error: unknown) => {
        console.error("Unable to refresh the tag registry.", error);
        setReload("failed");
      });
  }, []);

  const [state, dispatch] = useReducer(tagEditorReducer, articles, createTagEditorState);
  const handledEffectIds = useRef(new Set<number>());

  useEffect(() => {
    if (registryEntries) {
      dispatch({ type: "articlesChanged", registry });
    }
  }, [registry, registryEntries]);

  const filteredTags = useMemo(() => getFilteredTags(state), [state]);
  const selectedUsage = useMemo(() => getSelectedUsage(state), [state]);
  const totalTags = useMemo(() => getTotalTags(state), [state]);

  const detailRef = useRef<HTMLElement | null>(null);
  const [pickedTagKey, setPickedTagKey] = useState<string | null>(null);
  useScrollToDetail(detailRef, pickedTagKey);

  useEffect(() => {
    const effect = state.pendingEffect;
    if (!effect) {
      return;
    }
    if (handledEffectIds.current.has(effect.id)) {
      return;
    }
    handledEffectIds.current.add(effect.id);

    if (effect.kind === "tagMutation") {
      void (async () => {
        try {
          const plan = runTagEditorMutation(articles, effect.mutation);
          const hydratedSlugs = new Set(
            plan.changes
              .map((change) => resolveEditorArticleSlug(articles[change.index]))
              .filter((slug): slug is string => slug !== null),
          );
          if (hydratedSlugs.size === 0) {
            dispatch({
              type: "mutationSucceeded",
              effectId: effect.id,
              result: plan,
              before: articles,
              registry: projectRegistry(plan.articles),
            });
            return;
          }

          const hydration = await articleHydration.hydrateArticlesNow([...hydratedSlugs]);
          if (!hydration.ok) {
            dispatch({
              type: "mutationFailed",
              effectId: effect.id,
              message: "Some articles could not be loaded for the rewrite. Try again.",
            });
            return;
          }

          const landedBySlug = new Map(
            hydration.articles.flatMap((article) => {
              const slug = resolveEditorArticleSlug(article);
              return slug ? [[slug, article] as const] : [];
            }),
          );
          const baseline = getOriginalArticles();

          const outcome: { rebased: RebasedTagMutation | null } = { rebased: null };
          flushSync(() => {
            applyArticlesTransform((previous) => {
              const rebased = rebaseTagMutation({
                previous,
                baseline,
                landedBySlug,
                hydratedSlugs,
                mutation: effect.mutation,
              });
              outcome.rebased = rebased;
              return rebased.result.articles;
            });
          });
          if (!outcome.rebased) {
            throw new Error("The tag rewrite could not be added to your working changes.");
          }
          dispatch({
            type: "mutationSucceeded",
            effectId: effect.id,
            result: outcome.rebased.result,
            before: outcome.rebased.before,
            registry: projectRegistry(outcome.rebased.result.articles),
          });
        } catch (error) {
          console.error("Tag mutation failed", error);
          dispatch({
            type: "mutationFailed",
            effectId: effect.id,
            message: error instanceof Error ? error.message : "The tag change failed. Try again.",
          });
        }
      })();
      return;
    }

    if (effect.kind === "undoMutation") {
      try {
        const outcome: { reverted: RevertedTagMutation | null } = { reverted: null };
        flushSync(() => {
          applyArticlesTransform((previous) => {
            const reverted = revertTagMutation(previous, effect.undo);
            outcome.reverted = reverted;
            return reverted.articles;
          });
        });
        if (!outcome.reverted) {
          throw new Error("The restore could not be added to your working changes.");
        }
        dispatch({
          type: "undoSucceeded",
          effectId: effect.id,
          articles: outcome.reverted.articles,
          registry: projectRegistry(outcome.reverted.articles),
          restoredCount: outcome.reverted.restoredCount,
        });
      } catch (error) {
        console.error("Tag undo failed", error);
        dispatch({
          type: "undoFailed",
          effectId: effect.id,
          message: error instanceof Error ? error.message : "The change could not be put back. Try again.",
        });
      }
      return;
    }

    if (effect.kind === "copyDiff") {
      void onCopyDatasetMarkdown()
        .then(() => dispatch({ type: "effectCompleted", effectId: effect.id }))
        .catch(() => dispatch({ type: "effectFailed", effectId: effect.id, message: "Failed to copy diff. Try again." }));
      return;
    }

    try {
      onDownloadDatasetMarkdown();
      dispatch({ type: "effectCompleted", effectId: effect.id });
    } catch {
      dispatch({ type: "effectFailed", effectId: effect.id, message: "Diff download failed. Try again." });
    }
  }, [applyArticlesTransform, articleHydration, articles, getOriginalArticles, onCopyDatasetMarkdown, onDownloadDatasetMarkdown, projectRegistry, state.pendingEffect]);
  const handleRename = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      dispatch({ type: "renameSubmitted" });
    },
    [],
  );

  const handleMove = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      dispatch({ type: "moveSubmitted" });
    },
    [],
  );

  const handleUndo = useCallback(() => {
    dispatch({ type: "undoRequested" });
  }, []);

  const handleCopyDatasetMarkdown = useCallback(async () => {
    dispatch({ type: "copyDiffRequested", hasDatasetChanges });
  }, [hasDatasetChanges]);

  const handleDownloadDatasetMarkdown = useCallback(() => {
    dispatch({ type: "downloadDiffRequested", hasDatasetChanges });
  }, [hasDatasetChanges]);

  const serverRegistry = useMemo(() => buildTagRegistry(registryEntries ?? []), [registryEntries]);
  const changes = useMemo(
    () => (registryEntries ? tagChanges(serverRegistry, state.registry) : []),
    [registryEntries, serverRegistry, state.registry],
  );
  const changedKeys = useMemo(() => new Set(changes.map((change) => `${change.field}:${change.key}`)), [changes]);
  const fieldCounts = useMemo(
    () => Object.fromEntries(TAG_FIELDS.map((field) => [field, state.registry.byField[field].length])) as Record<TagField, number>,
    [state.registry],
  );
  const otherFieldMatches = useMemo(
    () => (filteredTags.length === 0 ? matchesInOtherFields(state.registry, state.activeField, state.searchQuery) : []),
    [filteredTags.length, state.registry, state.activeField, state.searchQuery],
  );

  const applying: TagApplying = state.pendingEffect?.kind === "tagMutation"
    ? state.pendingEffect.mutation.type
    : state.pendingEffect?.kind === "undoMutation" ? "undo" : null;

  const [view, setView] = useState<TagChangeView>("rename");
  const listRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const paneTitleRef = useRef<HTMLHeadingElement | null>(null);
  const changesHeadingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    if (pickedTagKey === null || typeof window === "undefined" || typeof window.matchMedia !== "function" || !window.matchMedia(STACKED_QUERY).matches) return;
    const frame = window.requestAnimationFrame(() => paneTitleRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [pickedTagKey]);

  const backToList = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    list.querySelector<HTMLElement>('[role="listbox"]')?.focus({ preventScroll: true });
  }, []);

  const reviewChanges = useCallback(() => {
    const heading = changesHeadingRef.current;
    if (!heading) return;
    heading.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    heading.focus({ preventScroll: true });
  }, []);

  const { confirm, dialog: confirmDialog } = useConfirm();
  const [removed, setRemoved] = useState<{ tag: string; field: TagField; count: number; notice: TagNoticeState | null } | null>(null);
  useEffect(() => {
    if (!removed || removed.notice || state.isApplying) return;
    if (state.notice?.source === "delete" && state.notice.type === "success") {
      setRemoved({ ...removed, notice: state.notice });
    } else if (state.notice) {
      setRemoved(null);
    }
  }, [removed, state.isApplying, state.notice]);
  const showRemoved = removed?.notice != null && state.notice === removed.notice;

  const requestRemove = useCallback(() => {
    if (!selectedUsage) return;
    const count = articleWord(selectedUsage.count);
    confirm({
      title: `Remove “${selectedUsage.tag}” from ${count}?`,
      description: `It comes off every article below in ${TAG_FIELD_LABELS[selectedUsage.field]}; their other tags stay. You can undo it until your next change here, and nothing goes live until you commit.`,
      affected: selectedUsage.articleRefs.map((ref) => ref.title?.trim() || `Article ${ref.index + 1}`),
      affectedLabel: `On ${count}`,
      confirmLabel: `Remove from ${count}`,
      destructive: true,
      onConfirm: () => {
        setRemoved({ tag: selectedUsage.tag, field: selectedUsage.field, count: selectedUsage.count, notice: null });
        dispatch({ type: "deleteConfirmationChanged", confirmed: true });
        dispatch({ type: "deleteSubmitted" });
      },
    });
  }, [confirm, selectedUsage]);

  const production = commit?.destination !== "proposal";
  useDevShortcuts([
    { keys: "/", label: "Search tags" },
    ...(commit ? [{ keys: "Cmd+S", label: production ? "Commit your working changes (asks first)" : "Submit your working changes for review" }] : []),
  ]);
  const requestCommit = useCallback(
    () => commit?.requestCommit(changes.length > 0 ? <TagChangeLead changes={changes} /> : undefined),
    [commit, changes],
  );
  const commitRef = useRef({ commit, requestCommit });
  commitRef.current = { commit, requestCommit };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const dialogOpen = Boolean(document.querySelector('[role="dialog"], [role="alertdialog"]'));
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "s") {
        const current = commitRef.current;
        if (!current.commit) return;
        event.preventDefault();
        if (!dialogOpen && current.commit.canCommit) current.requestCommit();
        return;
      }
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented || dialogOpen) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const saveKeyLabel = useModifierKeyLabel("S");

  const pendingArticles = commit?.scope.find((dataset) => dataset.id === "articles")?.count ?? null;
  const diffNotice = state.notice?.source === "diff" ? state.notice : null;

  const workingChanges = commit ? (
    <WorkingChangesPanel
      commit={commit}
      tagChanges={changes}
      datasetMarkdown={datasetMarkdown}
      hasDatasetChanges={hasDatasetChanges}
      onCopyDiff={() => void handleCopyDatasetMarkdown()}
      onDownloadDiff={handleDownloadDatasetMarkdown}
      diffNotice={diffNotice}
      isApplying={state.isApplying}
      saveKeyLabel={saveKeyLabel}
      onCommit={requestCommit}
      headingRef={changesHeadingRef}
    />
  ) : commitPanel;

  const intro = (
    <EditorSection
      icon="lucide:tags"
      title="Tags"
      description="The classes and categories articles are filed under. Change a tag here and every article that carries it follows."
    />
  );

  if (registryFetch.status === "error") {
    return (
      <div className="space-y-8">
        {workingChanges}
        {intro}
        <LoadErrorState
          what="tags"
          message="Nothing can be listed or changed here until they load."
          onRetry={() => {
            setRegistryFetch({ status: "loading" });
            setRegistryRetry((attempt) => attempt + 1);
          }}
        />
      </div>
    );
  }

  if (registryFetch.status !== "ready") {
    return (
      <div className="space-y-8">
        {workingChanges}
        {intro}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(19rem,23rem)_minmax(0,1fr)] lg:items-start xl:gap-8">
          <div className="space-y-3" role="status">
            <p className="type-meta-label theme-text-muted">Tags</p>
            <div aria-hidden className="grid grid-cols-2 gap-1">
              {TAG_FIELDS.map((field) => <span key={field} className="theme-skeleton-pulse h-10 rounded-control" />)}
            </div>
            <RowSkeletons rows={6} label="tags" />
          </div>
          <div aria-hidden className="hidden lg:block">
            <EditorPanel className="h-72 p-5">
              <span className="theme-skeleton-pulse block h-5 w-40 rounded-chip" />
              <span className="theme-skeleton-pulse mt-3 block h-3.5 w-24 rounded-chip" />
            </EditorPanel>
          </div>
        </div>
      </div>
    );
  }

  const carried = state.notice && state.notice.source !== "diff" ? state.notice : null;

  return (
    <div className="space-y-8">
      {workingChanges}

      <EditorSection
        icon="lucide:tags"
        title="Tags"
        description="The classes and categories articles are filed under. Change a tag here and every article that carries it follows."
      >
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(19rem,23rem)_minmax(0,1fr)] lg:items-start xl:gap-8">
          <TagListColumn
            ref={listRef}
            totalTags={totalTags}
            fieldCounts={fieldCounts}
            activeField={state.activeField}
            onFieldChange={(field) => {
              setRemoved(null);
              dispatch({ type: "fieldSelected", field });
            }}
            searchQuery={state.searchQuery}
            onSearchChange={(query) => dispatch({ type: "searchChanged", query })}
            searchRef={searchRef}
            filteredTags={filteredTags}
            selectedKey={state.selected ? usageKey(state.selected) : null}
            onSelectUsage={(usage: TagUsage) => {
              setRemoved(null);
              dispatch({ type: "tagSelected", usage });
              setPickedTagKey(usageKey(usage));
            }}
            changedKeys={changedKeys}
            otherFieldMatches={otherFieldMatches}
            reload={reload}
            onReload={handleReload}
            onDismissReloadFailure={() => setReload("idle")}
          />

          <section
            ref={detailRef}
            aria-label={selectedUsage ? `Tag: ${selectedUsage.tag}` : "Tag"}
            className={cn("min-w-0 scroll-mt-24", !selectedUsage && !carried && "hidden lg:block")}
          >
            {showRemoved && removed ? (
              <EditorPanel className="overflow-visible">
                <header className="space-y-2 px-4 py-4 sm:px-5">
                  <p className="type-meta-label theme-text-muted">{TAG_FIELD_LABELS[removed.field]}</p>
                  <h3 ref={paneTitleRef} tabIndex={-1} className="theme-text-muted min-w-0 break-words text-xl font-semibold leading-tight line-through decoration-1 outline-none">
                    <span className="sr-only">Removed tag: </span>
                    {removed.tag}
                  </h3>
                  <p className="theme-text-muted max-w-[60ch] text-sm">
                    {`Taken off ${articleWord(removed.count)}. It is in your working changes, so nothing is live until you commit. Pick another tag to keep going.`}
                  </p>
                </header>
                <TagDock
                  notice={state.notice}
                  undo={state.undo}
                  onUndo={handleUndo}
                  isApplying={state.isApplying}
                  applying={applying}
                  pendingArticles={pendingArticles}
                  onReviewChanges={reviewChanges}
                />
              </EditorPanel>
            ) : selectedUsage ? (
              <TagPane
                hiddenBySearch={!filteredTags.some((usage) => usageKey(usage) === usageKey(selectedUsage))}
                onClearSearch={() => dispatch({ type: "searchChanged", query: "" })}
                usage={selectedUsage}
                registry={state.registry}
                changed={changedKeys.has(usageKey(selectedUsage))}
                view={view}
                onViewChange={setView}
                renameValue={state.renameValue}
                onRenameValueChange={(value) => dispatch({ type: "renameDraftChanged", value })}
                onRename={handleRename}
                renameInputRef={renameInputRef}
                moveTargetField={state.moveTargetField}
                onMoveTargetFieldChange={(field) => dispatch({ type: "moveTargetFieldChanged", field })}
                moveLabel={state.moveLabel}
                onMoveLabelChange={(value) => dispatch({ type: "moveDraftChanged", value })}
                keepSourceCopy={state.keepSourceCopy}
                onKeepSourceCopyChange={(keepSourceCopy) => dispatch({ type: "sourceCopyChanged", keepSourceCopy })}
                onMove={handleMove}
                onRequestRemove={requestRemove}
                isApplying={state.isApplying}
                applying={applying}
                notice={state.notice}
                undo={state.undo}
                onUndo={handleUndo}
                pendingArticles={pendingArticles}
                onReviewChanges={reviewChanges}
                titleRef={paneTitleRef}
                onBackToList={backToList}
              />
            ) : (
              <EditorPanel className="overflow-visible">
                <div className="space-y-2 px-4 py-6 sm:px-5">
                  <h3 className="theme-text-primary text-base font-semibold">
                    {totalTags === 0 ? "No tags yet" : `No tags in ${TAG_FIELD_LABELS[state.activeField]}`}
                  </h3>
                  <p className="theme-text-muted max-w-[60ch] text-sm">
                    {totalTags === 0
                      ? "Tags come from the classes and categories on each article. Once articles carry some, they are listed here to rename, merge, move or remove."
                      : "Pick another field on the left, or reload tags if you expected some here."}
                  </p>
                  {totalTags === 0 ? <OnwardLink href={devHref({ type: "dev", tab: "articles" })}>Open Substances</OnwardLink> : null}
                </div>
                <TagDock
                  notice={carried}
                  undo={state.undo}
                  onUndo={handleUndo}
                  isApplying={state.isApplying}
                  applying={applying}
                  pendingArticles={pendingArticles}
                  onReviewChanges={reviewChanges}
                />
              </EditorPanel>
            )}
          </section>
        </div>
      </EditorSection>
      {confirmDialog}
    </div>
  );
}
