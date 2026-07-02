import {
  TAG_FIELDS,
  applyTagMutation,
  buildTagRegistry,
  getTagUsage,
  normalizeTagLabel,
  summarizeMutation,
  toTagKey,
  type TagField,
  type TagMutation,
  type TagMutationResult,
  type TagRegistry,
  type TagUsage,
} from "@/utils/data/tagRegistry";
import type { SubstanceArticle } from "@/schema";
import type { Notice, NoticeSource, SelectedTag } from "./types";

export type TagEditorEffect =
  | { kind: "tagMutation"; id: number; mutation: TagMutation; successPrefix: string }
  | { kind: "copyDiff"; id: number }
  | { kind: "downloadDiff"; id: number };

type TagEditorEffectRequest =
  | { kind: "tagMutation"; mutation: TagMutation; successPrefix: string }
  | { kind: "copyDiff" }
  | { kind: "downloadDiff" };

export type TagEditorState = {
  activeField: TagField;
  selected: SelectedTag | null;
  searchQuery: string;
  renameValue: string;
  moveTargetField: TagField;
  moveLabel: string;
  keepSourceCopy: boolean;
  deleteConfirmed: boolean;
  notice: Notice | null;
  isApplying: boolean;
  registry: TagRegistry;
  pendingEffect: TagEditorEffect | null;
  effectSequence: number;
};

export type TagEditorEvent =
  | { type: "fieldSelected"; field: TagField }
  | { type: "tagSelected"; usage: TagUsage }
  | { type: "searchChanged"; query: string }
  | { type: "renameDraftChanged"; value: string }
  | { type: "moveTargetFieldChanged"; field: TagField }
  | { type: "moveDraftChanged"; value: string }
  | { type: "sourceCopyChanged"; keepSourceCopy: boolean }
  | { type: "deleteConfirmationChanged"; confirmed: boolean }
  | { type: "renameSubmitted" }
  | { type: "moveSubmitted" }
  | { type: "deleteSubmitted" }
  | { type: "copyDiffRequested"; hasDatasetChanges: boolean }
  | { type: "downloadDiffRequested"; hasDatasetChanges: boolean }
  | { type: "effectCompleted"; effectId: number }
  | { type: "effectFailed"; effectId: number; message: string }
  | { type: "mutationSucceeded"; effectId: number; result: TagMutationResult }
  | { type: "mutationFailed"; effectId: number; message: string }
  | { type: "articlesChanged"; registry: TagRegistry }
  | { type: "snapshotRefreshed"; registry: TagRegistry };

export const getDefaultTargetField = (source: TagField): TagField => {
  for (const candidate of TAG_FIELDS) {
    if (candidate !== source) {
      return candidate;
    }
  }
  return source;
};

export const createTagEditorState = (articles: SubstanceArticle[]): TagEditorState => {
  const registry = buildTagRegistry(articles);
  return repairSelection({
    activeField: "index_categories",
    selected: null,
    searchQuery: "",
    renameValue: "",
    moveTargetField: getDefaultTargetField("index_categories"),
    moveLabel: "",
    keepSourceCopy: false,
    deleteConfirmed: false,
    notice: null,
    isApplying: false,
    registry,
    pendingEffect: null,
    effectSequence: 0,
  });
};

export const getSelectedUsage = (state: TagEditorState): TagUsage | undefined => {
  if (!state.selected) {
    return undefined;
  }
  return getTagUsage(state.registry, state.selected.field, state.selected.key);
};

export const getFilteredTags = (state: TagEditorState): TagUsage[] => {
  const fieldTags = state.registry.byField[state.activeField] ?? [];
  const query = state.searchQuery.trim().toLowerCase();
  if (!query) {
    return fieldTags;
  }
  return fieldTags.filter((usage) => usage.tag.toLowerCase().includes(query));
};

export const getTotalTags = (state: TagEditorState): number => {
  return TAG_FIELDS.reduce((acc, field) => acc + state.registry.byField[field].length, 0);
};

export const runTagEditorMutation = (
  articles: SubstanceArticle[],
  mutation: TagMutation,
): TagMutationResult => applyTagMutation(articles, mutation);

const nextEffect = (
  state: TagEditorState,
  effect: TagEditorEffectRequest,
): TagEditorState => {
  const id = state.effectSequence + 1;
  return {
    ...state,
    effectSequence: id,
    pendingEffect: { ...effect, id },
  };
};

const selectUsage = (state: TagEditorState, usage: TagUsage): TagEditorState => ({
  ...state,
  activeField: usage.field,
  selected: { field: usage.field, key: usage.key },
  renameValue: usage.tag,
  moveLabel: usage.tag,
  moveTargetField: getDefaultTargetField(usage.field),
  keepSourceCopy: false,
  deleteConfirmed: false,
  notice: null,
});

const clearDrafts = (state: TagEditorState): TagEditorState => ({
  ...state,
  selected: null,
  renameValue: "",
  moveLabel: "",
  keepSourceCopy: false,
  deleteConfirmed: false,
});

const repairSelection = (state: TagEditorState): TagEditorState => {
  const selectedUsage = getSelectedUsage(state);
  if (selectedUsage && selectedUsage.field === state.activeField) {
    return {
      ...state,
      renameValue: state.renameValue || selectedUsage.tag,
      moveLabel: state.moveLabel || selectedUsage.tag,
      moveTargetField:
        state.moveTargetField === selectedUsage.field
          ? getDefaultTargetField(selectedUsage.field)
          : state.moveTargetField,
    };
  }

  // Prefer the first tag visible in the filtered list so the detail panel
  // always corresponds to something the user can see; fall back to the
  // field's unfiltered first tag when the search yields no matches.
  const next = getFilteredTags(state)[0] ?? state.registry.byField[state.activeField][0];
  if (!next) {
    return clearDrafts({
      ...state,
      moveTargetField: getDefaultTargetField(state.activeField),
    });
  }

  return {
    ...state,
    selected: { field: next.field, key: next.key },
    renameValue: next.tag,
    moveLabel: next.tag,
    moveTargetField: getDefaultTargetField(next.field),
    keepSourceCopy: false,
    deleteConfirmed: false,
  };
};

const effectNoticeSource = (effect: TagEditorEffect | null): NoticeSource => {
  if (effect?.kind === "tagMutation") {
    return effect.mutation.type;
  }
  return "diff";
};

const completeMatchingEffect = (
  state: TagEditorState,
  effectId: number,
  notice: Notice,
): TagEditorState => {
  if (state.pendingEffect?.id !== effectId) {
    return state;
  }
  return {
    ...state,
    pendingEffect: null,
    notice,
    isApplying: false,
  };
};

const submitMutation = (
  state: TagEditorState,
  mutation: TagMutation,
  successPrefix: string,
): TagEditorState => nextEffect(
  {
    ...state,
    notice: null,
    isApplying: true,
  },
  { kind: "tagMutation", mutation, successPrefix },
);

export const tagEditorReducer = (
  state: TagEditorState,
  event: TagEditorEvent,
): TagEditorState => {
  switch (event.type) {
    case "fieldSelected":
      return repairSelection({
        ...state,
        activeField: event.field,
        notice: null,
      });
    case "tagSelected":
      return selectUsage(state, event.usage);
    case "searchChanged":
      return { ...state, searchQuery: event.query };
    case "renameDraftChanged":
      return { ...state, renameValue: event.value };
    case "moveTargetFieldChanged":
      return { ...state, moveTargetField: event.field };
    case "moveDraftChanged":
      return { ...state, moveLabel: event.value };
    case "sourceCopyChanged":
      return { ...state, keepSourceCopy: event.keepSourceCopy };
    case "deleteConfirmationChanged":
      return { ...state, deleteConfirmed: event.confirmed };
    case "renameSubmitted": {
      const selectedUsage = getSelectedUsage(state);
      if (!selectedUsage) {
        return state;
      }

      const normalized = normalizeTagLabel(state.renameValue);
      if (!normalized) {
        return { ...state, notice: { type: "error", message: "Enter a new tag label before renaming.", source: "rename" } };
      }

      if (normalizeTagLabel(selectedUsage.tag) === normalized) {
        return { ...state, notice: { type: "error", message: "New tag label matches the existing label.", source: "rename" } };
      }

      return submitMutation(state, {
        type: "rename",
        field: selectedUsage.field,
        fromTag: selectedUsage.tag,
        toTag: normalized,
      }, "Tag renamed.");
    }
    case "moveSubmitted": {
      const selectedUsage = getSelectedUsage(state);
      if (!selectedUsage) {
        return state;
      }

      if (state.moveTargetField === selectedUsage.field) {
        return { ...state, notice: { type: "error", message: "Choose a different destination field before moving.", source: "move" } };
      }

      const normalizedMove = normalizeTagLabel(state.moveLabel);
      return submitMutation(state, {
        type: "move",
        sourceField: selectedUsage.field,
        targetField: state.moveTargetField,
        tag: selectedUsage.tag,
        renamedTag: normalizedMove || undefined,
        keepSourceCopy: state.keepSourceCopy,
      }, state.keepSourceCopy ? "Tag copied." : "Tag moved.");
    }
    case "deleteSubmitted": {
      const selectedUsage = getSelectedUsage(state);
      if (!selectedUsage) {
        return state;
      }
      if (!state.deleteConfirmed) {
        return { ...state, notice: { type: "error", message: "Confirm the deletion before proceeding.", source: "delete" } };
      }

      return submitMutation(state, {
        type: "delete",
        field: selectedUsage.field,
        tag: selectedUsage.tag,
      }, "Tag deleted.");
    }
    case "copyDiffRequested":
      if (!event.hasDatasetChanges) {
        return { ...state, notice: { type: "error", message: "No dataset differences to copy yet.", source: "diff" } };
      }
      return nextEffect(state, { kind: "copyDiff" });
    case "downloadDiffRequested":
      if (!event.hasDatasetChanges) {
        return { ...state, notice: { type: "error", message: "No dataset differences to download yet.", source: "diff" } };
      }
      return nextEffect(state, { kind: "downloadDiff" });
    case "effectCompleted": {
      if (state.pendingEffect?.id !== event.effectId) {
        return state;
      }
      if (state.pendingEffect.kind === "copyDiff") {
        return completeMatchingEffect(state, event.effectId, { type: "success", message: "Dataset diff copied to clipboard.", source: "diff" });
      }
      if (state.pendingEffect.kind === "downloadDiff") {
        return completeMatchingEffect(state, event.effectId, { type: "success", message: "Dataset diff downloaded.", source: "diff" });
      }
      return state;
    }
    case "effectFailed":
    case "mutationFailed":
      return completeMatchingEffect(state, event.effectId, {
        type: "error",
        message: event.message,
        source: effectNoticeSource(state.pendingEffect),
      });
    case "mutationSucceeded": {
      const effect = state.pendingEffect;
      if (effect?.id !== event.effectId || effect.kind !== "tagMutation") {
        return state;
      }

      if (event.result.changes.length === 0) {
        return {
          ...state,
          pendingEffect: null,
          isApplying: false,
          notice: { type: "error", message: "No articles were updated. The tag may not be in use.", source: effect.mutation.type },
        };
      }

      const summary = summarizeMutation(event.result);
      const suffix = summary.affectedCount === 1 ? "article" : "articles";
      const registry = buildTagRegistry(event.result.articles);
      const successState = {
        ...state,
        registry,
        pendingEffect: null,
        isApplying: false,
        notice: {
          type: "success" as const,
          message: `${effect.successPrefix} ${summary.affectedCount} ${suffix} updated.`,
          source: effect.mutation.type,
        },
      };

      if (effect.mutation.type === "rename") {
        const normalized = normalizeTagLabel(effect.mutation.toTag);
        return repairSelection({
          ...successState,
          selected: { field: effect.mutation.field, key: toTagKey(normalized) },
          renameValue: normalized,
          moveLabel: normalized,
          deleteConfirmed: false,
        });
      }

      if (effect.mutation.type === "move") {
        const normalizedMove = normalizeTagLabel(effect.mutation.renamedTag ?? effect.mutation.tag);
        return repairSelection({
          ...successState,
          activeField: effect.mutation.targetField,
          selected: { field: effect.mutation.targetField, key: toTagKey(normalizedMove) },
          renameValue: normalizedMove,
          moveLabel: normalizedMove,
          moveTargetField: getDefaultTargetField(effect.mutation.targetField),
          keepSourceCopy: false,
          deleteConfirmed: false,
        });
      }

      return repairSelection({
        ...successState,
        selected: null,
        renameValue: "",
        moveLabel: "",
        moveTargetField: getDefaultTargetField(effect.mutation.field),
        deleteConfirmed: false,
      });
    }
    case "articlesChanged":
    case "snapshotRefreshed":
      return repairSelection({
        ...state,
        registry: event.registry,
      });
    default:
      return state;
  }
};
