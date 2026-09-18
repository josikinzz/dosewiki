import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { Icon } from "@/components/common/Icon";

import { buildTagRegistry, type TagMutation, type TagMutationResult } from "@/utils/data/tagRegistry";
import type { SubstanceArticle } from "@/schema";
import type { TagRegistryEntry } from "../../../../server/lib/substanceTagRegistryProjection";
import { resolveEditorArticleSlug } from "../context/devModeUtils";
import { DiffPreview } from "@/features/dev/components/DiffPreview";
import { useDevMode } from "../context/DevModeContext";
import { Button } from "@/components/ui/button";
import { EmptyStateSurface } from "@/components/ui/surface";
import {
  EditorActionGroup,
  EditorSection,
  LoadErrorState,
  useScrollToDetail,
} from "@/features/dev/components";

import { TagListPanel } from "./TagListPanel";
import { TagDetailPanel } from "./TagDetailPanel";
import { TagMutationForms } from "./TagMutationForms";
import { TagNotice } from "./TagNotice";
import type { TagEditorTabProps, TagUndo } from "./types";
import {
  createTagEditorState,
  getFilteredTags,
  getSelectedUsage,
  getTotalTags,
  runTagEditorMutation,
  tagEditorReducer,
} from "./tagEditorStateMachine";

// Read-wide, write-narrow: the registry arrives as a dedicated projection
// carrying exactly the tag fields `buildTagRegistry` reads, so listing and
// planning never touch an article body. A mutation hydrates only the slugs it
// rewrites (hydration fills draft and baseline together), then rewrites the
// now-full rows, so the save path sees the mutation as the only diff and
// unhydrated rows never reach it.
type RegistryFetchState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; entries: TagRegistryEntry[] };

const TAG_REGISTRY_ENDPOINT = "/api/dev/editor-library?scope=tag-registry";

type RebasedTagMutation = {
  /** The working set the rewrite ran over: hydrated where the plan asked, otherwise as found. */
  before: SubstanceArticle[];
  result: TagMutationResult;
};

/**
 * Re-run a planned mutation against the draft as it stands *now*, after the
 * awaited hydration. Editing carried on while the batch was in flight, so the
 * render-time array the plan was made from is not the array to rewrite.
 *
 * Hydrated bodies are merged into a row only while its draft is still the
 * pre-mutation placeholder it was planned from (`hydrateArticles` applies the
 * same rule); a row edited meanwhile keeps its edit and the rewrite lands on
 * top of it. The rewrite is then confined to the slugs the plan hydrated, so
 * a row the plan never saw is never rewritten unhydrated.
 */
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
    const landed = landedBySlug.get(resolveEditorArticleSlug(draft));
    return landed && draft === baseline[index] ? landed : draft;
  });

  const rewrite = runTagEditorMutation(rebased, mutation);
  const changes = rewrite.changes.filter((change) =>
    hydratedSlugs.has(resolveEditorArticleSlug(rebased[change.index])),
  );
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

/**
 * Put a rewrite back. A row is restored only while it is still exactly the
 * row the rewrite produced; one edited since keeps its edit. Rows are matched
 * by slug, so an article added or removed elsewhere since cannot shift the
 * restore onto a neighbour.
 */
function revertTagMutation(previous: SubstanceArticle[], undo: TagUndo): RevertedTagMutation {
  const bySlug = new Map<string, { before: SubstanceArticle; after: SubstanceArticle }>();
  for (const index of undo.changedIndexes) {
    const after = undo.after[index];
    const before = undo.before[index];
    if (after && before) {
      bySlug.set(resolveEditorArticleSlug(after), { before, after });
    }
  }

  let restoredCount = 0;
  const articles = previous.map((row) => {
    const entry = bySlug.get(resolveEditorArticleSlug(row));
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
  const registry = useMemo(() => buildTagRegistry(registryEntries ?? []), [registryEntries]);

  // The header's reload keeps the panels mounted: the rebuilt registry flows
  // in through the articlesChanged dispatch, and the button reports the
  // round trip instead of leaving the editor guessing whether it ran.
  const [reload, setReload] = useState<"idle" | "busy" | "failed">("idle");
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

  // Below the xl split the tag list stacks above the detail and mutation
  // panels. Keyed on the tapped tag, not `state.selected`, so the first-tag
  // fallback on registry load, field change, or search does not move the page.
  const detailRef = useRef<HTMLDivElement | null>(null);
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
          // Plan the rewrite over the current working set: slim rows carry
          // every tag field, so the planned change set is exact. Then hydrate
          // only the rows the rewrite touches and run the rewrite over the
          // now-full rows; untouched rows stay slim and never enter the diff.
          const plan = runTagEditorMutation(articles, effect.mutation);
          const hydratedSlugs = new Set(
            plan.changes
              .map((change) => resolveEditorArticleSlug(articles[change.index]))
              .filter((slug) => slug.length > 0),
          );
          if (hydratedSlugs.size === 0) {
            dispatch({ type: "mutationSucceeded", effectId: effect.id, result: plan, before: articles });
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
            hydration.articles.map((article) => [resolveEditorArticleSlug(article), article]),
          );
          // The baseline from before the await is the right comparison: a
          // row still identical to it is the untouched placeholder the plan
          // saw, which is exactly the row a landed body should fill.
          const baseline = getOriginalArticles();

          // The rewrite is computed inside the draft transform so it sees
          // every edit made while hydration was in flight. flushSync makes
          // React run that transform before this continues, so the result the
          // notice and registry are built from is the one the draft holds.
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
            throw new Error("The working set did not accept the tag rewrite.");
          }
          dispatch({
            type: "mutationSucceeded",
            effectId: effect.id,
            result: outcome.rebased.result,
            before: outcome.rebased.before,
          });
        } catch (error) {
          console.error("Tag mutation failed", error);
          dispatch({
            type: "mutationFailed",
            effectId: effect.id,
            message: error instanceof Error ? error.message : "Tag mutation failed. Check console for details.",
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
          throw new Error("The working set did not accept the restore.");
        }
        dispatch({
          type: "undoSucceeded",
          effectId: effect.id,
          articles: outcome.reverted.articles,
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
  }, [applyArticlesTransform, articleHydration, articles, getOriginalArticles, onCopyDatasetMarkdown, onDownloadDatasetMarkdown, state.pendingEffect]);
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

  const handleDelete = useCallback(() => {
    dispatch({ type: "deleteSubmitted" });
  }, []);

  const handleUndo = useCallback(() => {
    dispatch({ type: "undoRequested" });
  }, []);

  const handleCopyDatasetMarkdown = useCallback(async () => {
    dispatch({ type: "copyDiffRequested", hasDatasetChanges });
  }, [hasDatasetChanges]);

  const handleDownloadDatasetMarkdown = useCallback(() => {
    dispatch({ type: "downloadDiffRequested", hasDatasetChanges });
  }, [hasDatasetChanges]);

  if (registryFetch.status === "error") {
    return (
      <div className="mt-10">
        <LoadErrorState
          message="Tags could not be loaded, so nothing can be listed or changed here yet."
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
      <div className="mt-10">
        <EmptyStateSurface>Loading tags.</EmptyStateSurface>
      </div>
    );
  }

  return (
    <div className="mt-10 space-y-8">
      {/* Header Section */}
      <EditorSection
        icon="lucide:tags"
        title="Tag Editor"
        description="Rename, move, or delete a tag across every article that carries it."
        actions={(
          <Button
            variant="pill"
            size="pill"
            onClick={handleReload}
            disabled={reload === "busy"}
            aria-busy={reload === "busy" || undefined}
          >
            <Icon icon="lucide:refresh-cw" size={16} className={reload === "busy" ? "animate-spin" : undefined} />
            {reload === "busy" ? "Reloading tags" : "Reload tags"}
          </Button>
        )}
      >
        <div className="flex flex-wrap items-center gap-3 text-xs theme-text-faint">
          <span>
            <span className="font-semibold theme-text-muted">{totalTags}</span> tags in use across the four tag fields.
          </span>
          {reload === "failed" ? (
            <TagNotice
              notice={{ type: "error", message: "Tags could not be reloaded. Try again.", source: "diff" }}
              onDismiss={() => setReload("idle")}
            />
          ) : null}
        </div>
      </EditorSection>

      {/* Main Content Grid */}
      <div className="grid gap-8 xl:grid-cols-[21rem_1fr]">
        <TagListPanel
          activeField={state.activeField}
          onFieldChange={(field) => dispatch({ type: "fieldSelected", field })}
          searchQuery={state.searchQuery}
          onSearchChange={(query) => dispatch({ type: "searchChanged", query })}
          filteredTags={filteredTags}
          selected={state.selected}
          onSelectUsage={(usage) => {
            dispatch({ type: "tagSelected", usage });
            setPickedTagKey(`${usage.field}:${usage.key}`);
          }}
        />

        <div ref={detailRef} className="scroll-mt-6 space-y-8">
          {selectedUsage ? (
            <>
              <TagDetailPanel selectedUsage={selectedUsage} />
              <TagMutationForms
                selectedUsage={selectedUsage}
                notice={state.notice}
                undo={state.undo}
                onUndo={handleUndo}
                renameValue={state.renameValue}
                onRenameValueChange={(value) => dispatch({ type: "renameDraftChanged", value })}
                onRename={handleRename}
                moveTargetField={state.moveTargetField}
                onMoveTargetFieldChange={(field) => dispatch({ type: "moveTargetFieldChanged", field })}
                moveLabel={state.moveLabel}
                onMoveLabelChange={(value) => dispatch({ type: "moveDraftChanged", value })}
                keepSourceCopy={state.keepSourceCopy}
                onKeepSourceCopyChange={(keepSourceCopy) => dispatch({ type: "sourceCopyChanged", keepSourceCopy })}
                onMove={handleMove}
                deleteConfirmed={state.deleteConfirmed}
                onDeleteConfirmedChange={(confirmed) => dispatch({ type: "deleteConfirmationChanged", confirmed })}
                onDelete={handleDelete}
                isApplying={state.isApplying}
              />
            </>
          ) : (
            <>
              {state.notice && state.notice.source !== "diff" ? (
                <TagNotice
                  notice={state.notice}
                  undo={state.undo?.source === state.notice.source ? state.undo : null}
                  onUndo={handleUndo}
                  busy={state.isApplying}
                />
              ) : null}
              <EmptyStateSurface className="flex h-full min-h-[24rem] flex-col items-center justify-center">
                <p className="max-w-sm text-sm theme-text-faint">
                  No tags in this field. Choose another field, or reload tags if you expected some here.
                </p>
              </EmptyStateSurface>
            </>
          )}
        </div>
      </div>

      {/* Changelog Section */}
      <EditorSection
        icon="lucide:file-diff"
        title="Pending changelog"
        description="Every change in your draft so far, across all tools, as it will be committed."
        delay={0.2}
      >
        {hasDatasetChanges && datasetMarkdown.trim().length > 0 ? (
          <DiffPreview diffText={datasetMarkdown} maxHeight={288} />
        ) : (
          <EmptyStateSurface className="py-6 text-sm theme-text-faint">No changes in your draft yet.</EmptyStateSurface>
        )}
        <EditorActionGroup label="Tag changelog actions" className="text-xs">
          <Button
            variant="glass"
            size="xs"
            className="rounded-full"
            onClick={handleCopyDatasetMarkdown}
            disabled={!hasDatasetChanges || state.isApplying}
          >
            <Icon icon="lucide:copy" size={14} />
            Copy diff
          </Button>
          <Button
            variant="glass"
            size="xs"
            className="rounded-full"
            onClick={handleDownloadDatasetMarkdown}
            disabled={!hasDatasetChanges || state.isApplying}
          >
            <Icon icon="lucide:download" size={14} />
            Download .diff
          </Button>
          {state.notice?.source === "diff" ? <TagNotice notice={state.notice} /> : null}
        </EditorActionGroup>
      </EditorSection>

      {commitPanel}
    </div>
  );
}
