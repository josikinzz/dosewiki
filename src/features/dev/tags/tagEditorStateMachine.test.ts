import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { buildTagRegistry } from "@/utils/data/tagRegistry";

const { applyArticlesTransformMock, hydrateArticlesNowMock, mockDevArticles, devContext } = vi.hoisted(() => {
  const mockDevArticles = [
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
  ];
  // The working set behind the mocked context. Tests mutate `articles`
  // directly to stand in for an edit made through another tool while the tag
  // editor's hydration is in flight.
  const devContext = { articles: mockDevArticles as unknown[], original: mockDevArticles as unknown[] };
  return {
    mockDevArticles,
    devContext,
    hydrateArticlesNowMock: vi.fn(),
    applyArticlesTransformMock: vi.fn((transform: (previous: unknown[]) => unknown[]) => {
      devContext.articles = transform(devContext.articles);
    }),
  };
});

vi.mock("../context/DevModeContext", () => ({
  useDevMode: () => ({
    articles: devContext.articles,
    getOriginalArticles: () => devContext.original,
    applyArticlesTransform: applyArticlesTransformMock,
    articleHydration: createHydratedArticleHydration({
      hydrateArticlesNow: hydrateArticlesNowMock,
    }),
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
    before: articles,
  });
};

describe("tagEditorStateMachine", () => {
  it("selects the first tag on startup and repairs empty fields", () => {
    let state = createTagEditorState(articles);

    expect(getSelectedUsage(state)?.tag).toBe("Classic");

    state = tagEditorReducer(state, { type: "fieldSelected", field: "mechanism_of_action" });
    expect(getSelectedUsage(state)?.tag).toBe("5-HT2A receptor agonist");

    const emptyMechanismRegistry = buildTagRegistry([
      articleWithTags("Blank", { index: ["Only Index"] }),
    ]);
    state = tagEditorReducer(state, {
      type: "articlesChanged",
      registry: emptyMechanismRegistry,
    });

    expect(getSelectedUsage(state)).toBeUndefined();
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
    expect(getSelectedUsage(state)?.tag).toBe("Phenethylamine");
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
    expect(state.notice).toMatchObject({ type: "error", source: "rename" });

    state = tagEditorReducer(state, { type: "renameDraftChanged", value: "Classic" });
    state = tagEditorReducer(state, { type: "renameSubmitted" });
    expect(state.pendingEffect).toBeNull();
    expect(state.notice).toMatchObject({ type: "error", source: "rename" });
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

    expect(state.notice).toMatchObject({ type: "success", source: "rename" });
    expect(state.selected).toEqual({ field: "index_categories", key: "canonical" });
    expect(state.renameValue).toBe("Canonical");
    expect(getSelectedUsage(state)?.tag).toBe("Canonical");
  });

  it("moves tags with and without source copy", () => {
    let state = createTagEditorState(articles);
    state = tagEditorReducer(state, { type: "moveTargetFieldChanged", field: "index_categories" });
    state = tagEditorReducer(state, { type: "moveSubmitted" });
    expect(state.pendingEffect).toBeNull();
    expect(state.notice).toMatchObject({ type: "error", source: "move" });

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
    expect(state.notice).toMatchObject({ type: "success", source: "move" });
  });

  it("requires delete confirmation and repairs selection after delete", () => {
    let state = createTagEditorState(articles);
    state = tagEditorReducer(state, { type: "deleteSubmitted" });

    expect(state.pendingEffect).toBeNull();
    expect(state.notice).toMatchObject({ type: "error", source: "delete" });

    state = tagEditorReducer(state, { type: "deleteConfirmationChanged", confirmed: true });
    state = tagEditorReducer(state, { type: "deleteSubmitted" });
    state = completeMutation(state);

    expect(state.notice).toMatchObject({ type: "success", source: "delete" });
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
      before: articles,
    });

    expect(result.changes).toHaveLength(0);
    expect(state.isApplying).toBe(false);
    expect(state.notice).toMatchObject({ type: "error", source: "rename" });
  });

  it("keeps the undo record and its notice across selection moves until the change is put back", () => {
    let state = createTagEditorState(articles);
    state = tagEditorReducer(state, { type: "renameDraftChanged", value: "Canonical" });
    state = tagEditorReducer(state, { type: "renameSubmitted" });
    state = completeMutation(state);

    expect(state.undo).toMatchObject({ changedIndexes: [0] });
    expect(state.undo?.before).toBe(articles);

    // Looking at another tag or field does not take the way back away.
    state = tagEditorReducer(state, { type: "fieldSelected", field: "chemical_class" });
    expect(state.notice?.type).toBe("success");
    state = tagEditorReducer(state, { type: "tagSelected", usage: getFilteredTags(state)[0] });
    expect(state.undo).not.toBeNull();

    state = tagEditorReducer(state, { type: "undoRequested" });
    expect(state.pendingEffect).toMatchObject({ kind: "undoMutation" });
    expect(state.isApplying).toBe(true);

    state = tagEditorReducer(state, {
      type: "undoSucceeded",
      effectId: state.pendingEffect?.id ?? -1,
      articles,
      restoredCount: 1,
    });

    expect(state.undo).toBeNull();
    expect(state.isApplying).toBe(false);
    expect(state.notice).toMatchObject({ type: "success", source: "rename" });
    expect(state.activeField).toBe("index_categories");
    expect(getSelectedUsage(state)?.tag).toBe("Classic");
    expect(state.renameValue).toBe("Classic");

    // An error notice is not carried: the next selection clears it.
    state = tagEditorReducer(state, { type: "renameSubmitted" });
    expect(state.notice?.type).toBe("error");
    state = tagEditorReducer(state, { type: "fieldSelected", field: "chemical_class" });
    expect(state.notice).toBeNull();
  });

  it("reports when nothing could be put back and drops the stale undo record", () => {
    let state = createTagEditorState(articles);
    state = tagEditorReducer(state, { type: "deleteConfirmationChanged", confirmed: true });
    state = tagEditorReducer(state, { type: "deleteSubmitted" });
    state = completeMutation(state);
    expect(state.undo?.action).toBe("Delete");

    state = tagEditorReducer(state, { type: "undoRequested" });
    state = tagEditorReducer(state, {
      type: "undoSucceeded",
      effectId: state.pendingEffect?.id ?? -1,
      articles,
      restoredCount: 0,
    });

    expect(state.undo).toBeNull();
    expect(state.notice).toMatchObject({ type: "error", source: "delete" });
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
    expect(state.notice).toMatchObject({ type: "error", source: "diff" });

    state = tagEditorReducer(state, { type: "downloadDiffRequested", hasDatasetChanges: true });
    expect(state.pendingEffect).toMatchObject({ kind: "downloadDiff" });
    state = tagEditorReducer(state, { type: "effectCompleted", effectId: state.pendingEffect?.id ?? -1 });
    expect(state.notice).toMatchObject({ type: "success", source: "diff" });
  });
});

describe("TagEditorTab state-machine integration", () => {
  const renderTab = () =>
    render(
      createElement(TagEditorTab, {
        datasetMarkdown: "+ changed",
        hasDatasetChanges: true,
        onCopyDatasetMarkdown: async () => undefined,
        onDownloadDatasetMarkdown: () => undefined,
      }),
    );

  const stubRegistryFetch = (responder?: (url: string) => Promise<unknown>) => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        if (responder) {
          return responder(url);
        }
        return {
          ok: true,
          json: async () => ({ ok: true, scope: "tag-registry", entries: mockDevArticles }),
        };
      }),
    );
    return urls;
  };

  beforeEach(() => {
    devContext.articles = mockDevArticles;
    devContext.original = mockDevArticles;
    applyArticlesTransformMock.mockClear();
    hydrateArticlesNowMock.mockReset().mockResolvedValue({ ok: true, articles: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders state-machine selection and dispatches mutation events", async () => {
    stubRegistryFetch();

    renderTab();

    expect(await screen.findByPlaceholderText("Enter new label")).toHaveValue("Classic");

    fireEvent.click(screen.getByRole("button", { name: /Empathogen/i }));
    expect(screen.getByPlaceholderText("Enter new label")).toHaveValue("Empathogen");

    fireEvent.change(screen.getByPlaceholderText("Enter new label"), {
      target: { value: "Entactogen" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rename in 1 article" }));

    await waitFor(() => {
      expect(applyArticlesTransformMock).toHaveBeenCalledTimes(1);
    });
    expect(devContext.articles).toEqual([
      expect.objectContaining({ index_categories: ["Classic", "Psychedelic"] }),
      expect.objectContaining({ index_categories: ["Entactogen"] }),
    ]);
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });

  it("puts a rename back from the notice and leaves rows edited since alone", async () => {
    stubRegistryFetch();
    hydrateArticlesNowMock.mockImplementation(hydrateFromRegistry);

    renderTab();

    expect(await screen.findByPlaceholderText("Enter new label")).toHaveValue("Classic");
    fireEvent.change(screen.getByPlaceholderText("Enter new label"), {
      target: { value: "Classic Rock" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rename in 1 article" }));
    expect(await screen.findByRole("status")).toBeInTheDocument();
    const rewrittenLsd = devContext.articles[0];
    expect(rewrittenLsd).toMatchObject({ index_categories: ["Classic Rock", "Psychedelic"] });

    // The MDMA row is edited by another tool after the rename; it is not
    // part of the rewrite and must come through the restore untouched.
    const editedMdma = { ...mockDevArticles[1], title: "MDMA (edited meanwhile)" };
    devContext.articles = [rewrittenLsd, editedMdma];

    fireEvent.click(screen.getByRole("button", { name: "Undo rename" }));
    await waitFor(() => expect(applyArticlesTransformMock).toHaveBeenCalledTimes(2));

    expect(devContext.articles[0]).toMatchObject({
      index_categories: ["Classic", "Psychedelic"],
      summary: "Full body for lsd.",
    });
    expect(devContext.articles[1]).toBe(editedMdma);
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull();
    expect(screen.getByPlaceholderText("Enter new label")).toHaveValue("Classic");
  });

  it("renders from the tag-registry scope and nothing else", async () => {
    const urls = stubRegistryFetch();

    renderTab();

    expect(await screen.findByPlaceholderText("Enter new label")).toHaveValue("Classic");
    expect(urls).toEqual([
      expect.stringContaining("/api/dev/editor-library?scope=tag-registry"),
    ]);
  });

  const hydrateFromRegistry = async (slugs: readonly string[]) => ({
    ok: true,
    articles: slugs.map((slug) => {
      const match = mockDevArticles.find((article) => article.title.toLowerCase() === slug);
      return { ...match, slug, summary: `Full body for ${slug}.` };
    }),
  });

  // Hydration that stays pending until the test releases it, so an edit can
  // land in the working set between the plan and the rewrite. Executor form:
  // the project lib target predates Promise.withResolvers.
  const gateHydration = () => {
    let release: () => void = () => undefined;
    hydrateArticlesNowMock.mockImplementation(
      (slugs: readonly string[]) =>
        new Promise((resolve) => {
          release = () => {
            void hydrateFromRegistry(slugs).then(resolve);
          };
        }),
    );
    return () => release();
  };

  it("hydrates exactly the slugs a rename touches and rewrites only those rows", async () => {
    stubRegistryFetch();
    hydrateArticlesNowMock.mockImplementation(hydrateFromRegistry);

    renderTab();

    // "Classic" is only on the LSD row, so the rename must hydrate that row
    // alone and leave the MDMA row the slim object it already was.
    expect(await screen.findByPlaceholderText("Enter new label")).toHaveValue("Classic");
    fireEvent.change(screen.getByPlaceholderText("Enter new label"), {
      target: { value: "Classic Rock" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rename in 1 article" }));

    await waitFor(() => {
      expect(applyArticlesTransformMock).toHaveBeenCalled();
    });

    expect(hydrateArticlesNowMock).toHaveBeenCalledTimes(1);
    expect(hydrateArticlesNowMock).toHaveBeenCalledWith(["lsd"]);

    const nextArticles = devContext.articles;
    expect(nextArticles[1]).toBe(mockDevArticles[1]);
    expect(nextArticles[0]).toMatchObject({
      index_categories: ["Classic Rock", "Psychedelic"],
      summary: "Full body for lsd.",
    });
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });

  it("keeps an edit made to another row while the rewrite's hydration was in flight", async () => {
    stubRegistryFetch();
    const releaseHydration = gateHydration();

    renderTab();

    expect(await screen.findByPlaceholderText("Enter new label")).toHaveValue("Classic");
    fireEvent.change(screen.getByPlaceholderText("Enter new label"), {
      target: { value: "Classic Rock" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rename in 1 article" }));
    await waitFor(() => expect(hydrateArticlesNowMock).toHaveBeenCalledWith(["lsd"]));

    // Another tool edits the MDMA row while the LSD hydration is pending.
    const editedMdma = { ...mockDevArticles[1], title: "MDMA (edited meanwhile)" };
    devContext.articles = [mockDevArticles[0], editedMdma];

    releaseHydration();
    await waitFor(() => expect(applyArticlesTransformMock).toHaveBeenCalledTimes(1));

    // The transform was handed the latest draft, not the array the plan was
    // made from, so the concurrent edit survives next to the rename.
    const nextArticles = devContext.articles;
    expect(nextArticles[1]).toBe(editedMdma);
    expect(nextArticles[0]).toMatchObject({
      index_categories: ["Classic Rock", "Psychedelic"],
      summary: "Full body for lsd.",
    });
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });

  it("rewrites on top of an edit to the very row being hydrated", async () => {
    stubRegistryFetch();
    const releaseHydration = gateHydration();

    renderTab();

    expect(await screen.findByPlaceholderText("Enter new label")).toHaveValue("Classic");
    fireEvent.change(screen.getByPlaceholderText("Enter new label"), {
      target: { value: "Classic Rock" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rename in 1 article" }));
    await waitFor(() => expect(hydrateArticlesNowMock).toHaveBeenCalledWith(["lsd"]));

    // The LSD row itself is edited while its hydration is pending: the draft
    // no longer equals its baseline, so the landed body must not replace it.
    // (These fixture rows carry no explicit slug, so the edit stays off the
    // title the slug is derived from.)
    devContext.articles = [
      { ...mockDevArticles[0], identification: { common_name: "LSD", iupac_name: "edited meanwhile" } },
      mockDevArticles[1],
    ];

    releaseHydration();
    await waitFor(() => expect(applyArticlesTransformMock).toHaveBeenCalledTimes(1));

    expect(devContext.articles[0]).toMatchObject({
      identification: { iupac_name: "edited meanwhile" },
      index_categories: ["Classic Rock", "Psychedelic"],
    });
    expect(devContext.articles[0]).not.toHaveProperty("summary");
    expect(devContext.articles[1]).toBe(mockDevArticles[1]);
  });

  it("shows a retry state when the registry fetch fails", async () => {
    let fail = true;
    stubRegistryFetch(async () => {
      if (fail) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return {
        ok: true,
        json: async () => ({ ok: true, scope: "tag-registry", entries: mockDevArticles }),
      };
    });

    await act(async () => {
      renderTab();
    });
    expect(screen.queryByPlaceholderText("Enter new label")).not.toBeInTheDocument();

    fail = false;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    });
    expect(screen.getByPlaceholderText("Enter new label")).toHaveValue("Classic");
  });
});
