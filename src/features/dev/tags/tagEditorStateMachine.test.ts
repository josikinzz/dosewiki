import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { buildTagRegistry } from "@/utils/data/tagRegistry";

const { replaceArticlesMock, mockDevArticles } = vi.hoisted(() => ({
  replaceArticlesMock: vi.fn(),
  mockDevArticles: [
    {
      title: "LSD",
      identification: { common_name: "LSD" },
      index_categories: ["Classic", "Psychedelic"],
      classification: { chemical_class: [], psychoactive_class: [] },
      pharmacology: { binding_sites: [] },
    },
    {
      title: "MDMA",
      identification: { common_name: "MDMA" },
      index_categories: ["Empathogen"],
      classification: { chemical_class: [], psychoactive_class: [] },
      pharmacology: { binding_sites: [] },
    },
  ],
}));

vi.mock("../context/DevModeContext", () => ({
  useDevMode: () => ({
    articles: mockDevArticles,
    replaceArticles: replaceArticlesMock,
    articleHydration: createHydratedArticleHydration(),
  }),
}));

import { createHydratedArticleHydration } from "@/test/fixtures/devArticleHydration";
import {
  createTagEditorState,
  getFilteredTags,
  getSelectedUsage,
  runTagEditorMutation,
  tagEditorReducer,
  type TagEditorState,
} from "./tagEditorStateMachine";
import { TagEditorTab } from "./TagEditorTab";

const articleWithTags = (
  title: string,
  tags: {
    index?: string[];
    chemical?: string[];
    psychoactive?: string[];
    mechanism?: string[];
  },
) => {
  const article = createEmptyArticle();
  article.title = title;
  article.identification.common_name = title;
  article.index_categories = tags.index ?? [];
  article.classification.chemical_class = tags.chemical ?? [];
  article.classification.psychoactive_class = tags.psychoactive ?? [];
  article.pharmacology.binding_sites = (tags.mechanism ?? []).map((tag) => ({
    target: tag,
    tag,
  }));
  return article;
};

const articles = [
  articleWithTags("LSD", {
    index: ["Psychedelic", "Classic"],
    chemical: ["Lysergamide"],
    psychoactive: ["Hallucinogen"],
    mechanism: ["5-HT2A receptor agonist"],
  }),
  articleWithTags("MDMA", {
    index: ["Empathogen"],
    chemical: ["Phenethylamine"],
    psychoactive: ["Entactogen"],
  }),
];

const completeMutation = (state: TagEditorState): TagEditorState => {
  const effect = state.pendingEffect;
  expect(effect?.kind).toBe("tagMutation");
  if (!effect || effect.kind !== "tagMutation") {
    return state;
  }
  const result = runTagEditorMutation(articles, effect.mutation);
  return tagEditorReducer(state, {
    type: "mutationSucceeded",
    effectId: effect.id,
    result,
  });
};

describe("tagEditorStateMachine", () => {
  it("selects the first tag on startup and repairs empty fields", () => {
    let state = createTagEditorState(articles);

    expect(state.activeField).toBe("index_categories");
    expect(getSelectedUsage(state)?.tag).toBe("Classic");
    expect(state.renameValue).toBe("Classic");

    state = tagEditorReducer(state, { type: "fieldSelected", field: "mechanism_of_action" });
    expect(getSelectedUsage(state)?.tag).toBe("5-HT2A receptor agonist");

    const emptyMechanismRegistry = buildTagRegistry([
      articleWithTags("Blank", { index: ["Only Index"] }),
    ]);
    state = tagEditorReducer(state, {
      type: "snapshotRefreshed",
      registry: emptyMechanismRegistry,
    });

    expect(state.selected).toBeNull();
    expect(state.renameValue).toBe("");
    expect(state.moveLabel).toBe("");
  });

  it("switches fields, updates search filtering, and resets form drafts on tag selection", () => {
    let state = createTagEditorState(articles);
    state = tagEditorReducer(state, { type: "renameDraftChanged", value: "Draft" });
    state = tagEditorReducer(state, { type: "fieldSelected", field: "chemical_class" });

    expect(getSelectedUsage(state)?.tag).toBe("Lysergamide");
    expect(state.renameValue).toBe("Lysergamide");

    state = tagEditorReducer(state, { type: "searchChanged", query: "phen" });
    expect(getFilteredTags(state).map((usage) => usage.tag)).toEqual(["Phenethylamine"]);

    state = tagEditorReducer(state, { type: "tagSelected", usage: getFilteredTags(state)[0] });
    expect(state.selected).toEqual({ field: "chemical_class", key: "phenethylamine" });
    expect(state.moveLabel).toBe("Phenethylamine");
    expect(state.deleteConfirmed).toBe(false);
  });

  it("repairs selection to the first filtered tag when a search query is active", () => {
    let state = createTagEditorState(articles);
    state = tagEditorReducer(state, { type: "fieldSelected", field: "chemical_class" });
    state = tagEditorReducer(state, { type: "searchChanged", query: "psy" });
    state = tagEditorReducer(state, { type: "fieldSelected", field: "index_categories" });

    expect(getFilteredTags(state).map((usage) => usage.tag)).toEqual(["Psychedelic"]);
    expect(getSelectedUsage(state)?.tag).toBe("Psychedelic");

    // Falls back to the unfiltered first tag when nothing matches.
    state = tagEditorReducer(state, { type: "searchChanged", query: "zzz" });
    state = tagEditorReducer(state, { type: "fieldSelected", field: "chemical_class" });
    expect(getSelectedUsage(state)?.tag).toBe("Lysergamide");
  });

  it("validates rename transitions before producing mutation effects", () => {
    let state = createTagEditorState(articles);

    state = tagEditorReducer(state, { type: "renameDraftChanged", value: "  " });
    state = tagEditorReducer(state, { type: "renameSubmitted" });
    expect(state.pendingEffect).toBeNull();
    expect(state.notice).toEqual({ type: "error", message: "Enter a new tag label before renaming.", source: "rename" });

    state = tagEditorReducer(state, { type: "renameDraftChanged", value: "Classic" });
    state = tagEditorReducer(state, { type: "renameSubmitted" });
    expect(state.pendingEffect).toBeNull();
    expect(state.notice).toEqual({ type: "error", message: "New tag label matches the existing label.", source: "rename" });
  });

  it("renames tags and updates selection from the mutation result", () => {
    let state = createTagEditorState(articles);
    state = tagEditorReducer(state, { type: "renameDraftChanged", value: "Canonical" });
    state = tagEditorReducer(state, { type: "renameSubmitted" });

    expect(state.pendingEffect).toMatchObject({
      kind: "tagMutation",
      mutation: {
        type: "rename",
        field: "index_categories",
        fromTag: "Classic",
        toTag: "Canonical",
      },
    });

    state = completeMutation(state);

    expect(state.notice).toEqual({ type: "success", message: "Tag renamed. 1 article updated.", source: "rename" });
    expect(state.selected).toEqual({ field: "index_categories", key: "canonical" });
    expect(state.renameValue).toBe("Canonical");
    expect(getSelectedUsage(state)?.tag).toBe("Canonical");
  });

  it("moves tags with and without source copy", () => {
    let state = createTagEditorState(articles);
    state = tagEditorReducer(state, { type: "moveTargetFieldChanged", field: "index_categories" });
    state = tagEditorReducer(state, { type: "moveSubmitted" });
    expect(state.pendingEffect).toBeNull();
    expect(state.notice).toEqual({ type: "error", message: "Choose a different destination field before moving.", source: "move" });

    state = tagEditorReducer(state, { type: "moveTargetFieldChanged", field: "chemical_class" });
    state = tagEditorReducer(state, { type: "moveDraftChanged", value: "Classic family" });
    state = tagEditorReducer(state, { type: "sourceCopyChanged", keepSourceCopy: true });
    state = tagEditorReducer(state, { type: "moveSubmitted" });

    expect(state.pendingEffect).toMatchObject({
      kind: "tagMutation",
      mutation: {
        type: "move",
        sourceField: "index_categories",
        targetField: "chemical_class",
        tag: "Classic",
        renamedTag: "Classic family",
        keepSourceCopy: true,
      },
    });

    state = completeMutation(state);
    expect(state.activeField).toBe("chemical_class");
    expect(state.keepSourceCopy).toBe(false);
    expect(getSelectedUsage(state)?.tag).toBe("Classic family");
    expect(state.notice).toEqual({ type: "success", message: "Tag copied. 2 articles updated.", source: "move" });
  });

  it("requires delete confirmation and repairs selection after delete", () => {
    let state = createTagEditorState(articles);
    state = tagEditorReducer(state, { type: "deleteSubmitted" });

    expect(state.pendingEffect).toBeNull();
    expect(state.notice).toEqual({ type: "error", message: "Confirm the deletion before proceeding.", source: "delete" });

    state = tagEditorReducer(state, { type: "deleteConfirmationChanged", confirmed: true });
    state = tagEditorReducer(state, { type: "deleteSubmitted" });
    state = completeMutation(state);

    expect(state.notice).toEqual({ type: "success", message: "Tag deleted. 1 article updated.", source: "delete" });
    expect(getSelectedUsage(state)?.tag).toBe("Empathogen");
    expect(state.deleteConfirmed).toBe(false);
  });

  it("keeps invalid mutation results local and does not report article replacement work", () => {
    let state = createTagEditorState(articles);
    state = tagEditorReducer(state, { type: "renameDraftChanged", value: "Ghost" });
    state = tagEditorReducer(state, { type: "renameSubmitted" });

    const effect = state.pendingEffect;
    expect(effect?.kind).toBe("tagMutation");
    if (!effect || effect.kind !== "tagMutation") {
      return;
    }

    const result = runTagEditorMutation(articles, {
      ...effect.mutation,
      type: "rename",
      field: "index_categories",
      fromTag: "Missing",
      toTag: "Ghost",
    });
    state = tagEditorReducer(state, {
      type: "mutationSucceeded",
      effectId: effect.id,
      result,
    });

    expect(result.changes).toHaveLength(0);
    expect(state.isApplying).toBe(false);
    expect(state.notice).toEqual({ type: "error", message: "No articles were updated. The tag may not be in use.", source: "rename" });
  });

  it("handles article refresh and diff adapter notices", () => {
    let state = createTagEditorState(articles);

    state = tagEditorReducer(state, {
      type: "articlesChanged",
      registry: buildTagRegistry([articleWithTags("2C-B", { index: ["Phenethylamine"] })]),
    });
    expect(getSelectedUsage(state)?.tag).toBe("Phenethylamine");

    state = tagEditorReducer(state, { type: "copyDiffRequested", hasDatasetChanges: false });
    expect(state.pendingEffect).toBeNull();
    expect(state.notice).toEqual({ type: "error", message: "No dataset differences to copy yet.", source: "diff" });

    state = tagEditorReducer(state, { type: "downloadDiffRequested", hasDatasetChanges: true });
    expect(state.pendingEffect).toMatchObject({ kind: "downloadDiff" });
    state = tagEditorReducer(state, { type: "effectCompleted", effectId: state.pendingEffect?.id ?? -1 });
    expect(state.notice).toEqual({ type: "success", message: "Dataset diff downloaded.", source: "diff" });
  });
});

describe("TagEditorTab state-machine integration", () => {
  it("renders state-machine selection and dispatches mutation events", async () => {
    replaceArticlesMock.mockClear();

    render(
      createElement(TagEditorTab, {
        datasetMarkdown: "+ changed",
        hasDatasetChanges: true,
        onCopyDatasetMarkdown: async () => undefined,
        onDownloadDatasetMarkdown: () => undefined,
      }),
    );

    expect(screen.getByPlaceholderText("Enter new label")).toHaveValue("Classic");

    fireEvent.click(screen.getByRole("button", { name: /Empathogen/i }));
    expect(screen.getByPlaceholderText("Enter new label")).toHaveValue("Empathogen");

    fireEvent.change(screen.getByPlaceholderText("Enter new label"), {
      target: { value: "Entactogen" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rename tag" }));

    await waitFor(() => {
      expect(replaceArticlesMock).toHaveBeenCalledWith([
        expect.objectContaining({ index_categories: ["Classic", "Psychedelic"] }),
        expect.objectContaining({ index_categories: ["Entactogen"] }),
      ]);
    });
    expect(await screen.findByText("Tag renamed. 1 article updated.")).toBeInTheDocument();
  });
});
