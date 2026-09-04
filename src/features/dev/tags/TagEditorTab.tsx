import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { Icon } from "@/components/common/Icon";

import { buildTagRegistry, type TagMutation, type TagMutationResult } from "@/utils/data/tagRegistry";
import type { SubstanceArticle } from "@/schema";
import type { TagRegistryEntry } from "../../../../convex/lib/substanceTagRegistryProjection";
import { resolveEditorArticleSlug } from "../context/devModeUtils";
import { DiffPreview } from "@/features/dev/components/DiffPreview";
import { useDevMode } from "../context/DevModeContext";
import { Button } from "@/components/ui/button";
import { EmptyStateSurface } from "@/components/ui/surface";
import {
  ActionNotice,
  EditorActionGroup,
  EditorSection,
  useScrollToDetail,
} from "@/features/dev/components";

import { TagListPanel } from "./TagListPanel";
import { TagDetailPanel } from "./TagDetailPanel";
import { TagMutationForms } from "./TagMutationForms";
import type { TagEditorTabProps } from "./types";
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
}): TagMutationResult {
  const rebased = previous.map((draft, index) => {
    const landed = landedBySlug.get(resolveEditorArticleSlug(draft));
    return landed && draft === baseline[index] ? landed : draft;
  });

  const rewrite = runTagEditorMutation(rebased, mutation);
  const changes = rewrite.changes.filter((change) =>
    hydratedSlugs.has(resolveEditorArticleSlug(rebased[change.index])),
  );
  if (changes.length === 0) {
    return { articles: previous, changes };
  }
  if (changes.length === rewrite.changes.length) {
    return rewrite;
  }

  const kept = new Set(changes.map((change) => change.index));
  return {
    articles: rebased.map((row, index) => (kept.has(index) ? rewrite.articles[index] : row)),
    changes,
  };
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

  // A silent refetch for the header's refresh action: the panels stay mounted
  // and the rebuilt registry flows in through the articlesChanged dispatch.
  const handleRefreshSnapshot = useCallback(() => {
    void fetchTagRegistryEntries()
      .then((entries) => setRegistryFetch({ status: "ready", entries }))
      .catch((error: unknown) => console.error("Unable to refresh the tag registry.", error));
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

  // Below the lg split the tag list stacks above the detail and mutation
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
            dispatch({ type: "mutationSucceeded", effectId: effect.id, result: plan });
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
          const outcome: { result: TagMutationResult | null } = { result: null };
          flushSync(() => {
            applyArticlesTransform((previous) => {
              const result = rebaseTagMutation({
                previous,
                baseline,
                landedBySlug,
                hydratedSlugs,
                mutation: effect.mutation,
              });
              outcome.result = result;
              return result.articles;
            });
          });
          if (!outcome.result) {
            throw new Error("The working set did not accept the tag rewrite.");
          }
          dispatch({ type: "mutationSucceeded", effectId: effect.id, result: outcome.result });
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

  const handleCopyDatasetMarkdown = useCallback(async () => {
    dispatch({ type: "copyDiffRequested", hasDatasetChanges });
  }, [hasDatasetChanges]);

  const handleDownloadDatasetMarkdown = useCallback(() => {
    dispatch({ type: "downloadDiffRequested", hasDatasetChanges });
  }, [hasDatasetChanges]);

  if (registryFetch.status === "error") {
    return (
      <div className="mt-10">
        <EmptyStateSurface className="flex flex-col items-center justify-center gap-4">
          <p className="text-sm theme-text-faint">
            The tag registry could not be loaded, so tags cannot be listed or rewritten right now.
          </p>
          <Button
            variant="pill"
            size="pill"
            onClick={() => {
              setRegistryFetch({ status: "loading" });
              setRegistryRetry((attempt) => attempt + 1);
            }}
          >
            <Icon icon="lucide:refresh-cw" size={16} />
            Retry
          </Button>
        </EmptyStateSurface>
      </div>
    );
  }

  if (registryFetch.status !== "ready") {
    return (
      <div className="mt-10">
        <EmptyStateSurface>
          Loading the tag registry. Only the tag fields are fetched, so this stays a small bounded read.
        </EmptyStateSurface>
      </div>
    );
  }

  return (
    <div className="mt-10 space-y-8">
      {/* Header Section */}
      <EditorSection
        icon="lucide:tags"
        title="Tag Editor"
        description="Rename, reclassify, or delete existing tags across the draft dataset. Changes apply instantly to the in-memory articles and downstream Dev tools."
        actions={(
          <Button
            variant="pill"
            size="pill"
            onClick={handleRefreshSnapshot}
          >
            <Icon icon="lucide:refresh-cw" size={16} />
            Refresh snapshot
          </Button>
        )}
      >
        <div className="text-xs theme-text-faint">
          <span className="font-semibold theme-text-muted">{totalTags}</span> unique tags detected across the dataset.
        </div>
      </EditorSection>

      {/* Main Content Grid */}
      <div className="grid gap-8 lg:grid-cols-[21rem_1fr]">
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
                <ActionNotice tone={state.notice.type === "error" ? "danger" : "success"}>
                  {state.notice.message}
                </ActionNotice>
              ) : null}
              <EmptyStateSurface className="flex h-full min-h-[24rem] flex-col items-center justify-center">
                <p className="max-w-sm text-sm theme-text-faint">
                  No tags found for this field. Choose another field or refresh the snapshot to rebuild the registry.
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
        description="Review the diff output generated from all in-memory edits before committing your changes."
        delay={0.2}
      >
        <DiffPreview
          diffText={
            hasDatasetChanges && datasetMarkdown.trim().length > 0
              ? datasetMarkdown
              : "# Dataset\n\nNo differences detected."
          }
          maxHeight={288}
        />
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
          {state.notice?.source === "diff" ? (
            <ActionNotice tone={state.notice.type === "error" ? "danger" : "success"}>
              {state.notice.message}
            </ActionNotice>
          ) : null}
        </EditorActionGroup>
      </EditorSection>

      {commitPanel}
    </div>
  );
}
