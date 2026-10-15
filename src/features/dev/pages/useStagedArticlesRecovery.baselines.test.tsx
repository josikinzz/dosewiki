import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { minimalArticle } from "@/test/fixtures/articles";
import { useDevArticlesState } from "../context/useDevArticlesState";
import { useDevArticleHydration } from "../context/useDevArticleHydration";
import { DraftRecoveryProvider } from "../recovery/DraftRecoveryContext";
import { createDraftRecoveryStore, recoveryActorKey } from "../recovery/draftRecovery";
import { stagedArticleChanges } from "./stagedArticlesRecovery";
import { useStagedArticlesRecovery } from "./useStagedArticlesRecovery";

const actor = "recovery@example.test";
const original = { ...structuredClone(minimalArticle), id: 1, slug: "synthetic-article", title: "Synthetic article", summary: "Stored summary." };
const edited = { ...original, summary: "Recovered summary." };
const slim = [{ ...original, summary: "" }];
const freshHash = "fresh-stored-hash";
let stored = original;
function wrapper({ children }: { children: ReactNode }) {
  return <DraftRecoveryProvider actor={actor}>{children}</DraftRecoveryProvider>;
}
function useWorkingSet() {
  const state = useDevArticlesState(slim);
  const hydration = useDevArticleHydration({ articleCount: slim.length, hydrateArticles: state.hydrateArticles });
  const recovery = useStagedArticlesRecovery({
    articles: state.articles, getOriginalArticles: state.getOriginalArticles,
    getArticleBaseHashes: state.getArticleBaseHashes, restoreArticleBaseHashes: state.restoreArticleBaseHashes,
    applyArticlesTransform: state.applyArticlesTransform, hydrateArticlesNow: hydration.hydrateArticlesNow,
    hasChanges: state.hasUnsavedArticleChanges, libraryReady: true,
  });
  return { state, hydration, recovery };
}
function seed(baseHash?: string) {
  const change = stagedArticleChanges([edited], [original])[0];
  change.baseHash = baseHash;
  createDraftRecoveryStore(recoveryActorKey(actor)!).write({ tool: "staged-articles", record: "working-set", baseline: change.baseline, draft: { changes: [change] } });
}
async function open() {
  const hook = renderHook(useWorkingSet, { wrapper });
  await waitFor(() => expect(hook.result.current.recovery.offer).not.toBeNull());
  return hook;
}
beforeEach(() => {
  localStorage.clear(); stored = original;
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ article: stored, baseHash: freshHash })));
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe("staged recovery publication baselines", () => {
  it.each([undefined, ""])("holds an existing legacy checkpoint with baseline %s even when content matches", async baseHash => {
    seed(baseHash);
    const { result } = await open();
    await act(async () => { await result.current.hydration.hydrateArticlesNow([original.slug]); });
    expect(result.current.state.getArticleBaseHashes()).toEqual({ [original.slug]: freshHash });
    await act(async () => { await result.current.recovery.restore(); });
    expect(result.current.recovery.held).toHaveLength(1);
    expect(result.current.state.articles[0].summary).toBe(original.summary);
    expect(result.current.state.getArticleBaseHashes()).toEqual({ [original.slug]: freshHash });
    expect(result.current.recovery.error).toBeNull();

    act(() => result.current.recovery.applyHeld(original.slug));
    expect(result.current.state.articles[0].summary).toBe(edited.summary);
    expect(result.current.state.getArticleBaseHashes()).toEqual({ [original.slug]: freshHash });
    expect(result.current.recovery.held).toBeNull();
  });

  it("restores an authored checkpoint's original publication baseline", async () => {
    seed("original-checkpoint-hash");
    const { result } = await open();
    await act(async () => { await result.current.recovery.restore(); });
    expect(result.current.state.articles[0].summary).toBe(edited.summary);
    expect(result.current.state.getArticleBaseHashes()).toEqual({ [original.slug]: "original-checkpoint-hash" });
    expect(result.current.recovery.held).toBeNull();
  });

  it("keeps the freshly hydrated baseline when changed content is explicitly reconciled", async () => {
    seed("original-checkpoint-hash"); stored = { ...original, title: "New stored title" };
    const { result } = await open();
    await act(async () => { await result.current.recovery.restore(); });
    expect(result.current.recovery.held).toHaveLength(1);
    expect(result.current.state.articles[0].summary).toBe(original.summary);
    act(() => result.current.recovery.applyHeld(original.slug));
    expect(result.current.state.articles[0]).toMatchObject({ summary: edited.summary, title: stored.title });
    expect(result.current.state.getArticleBaseHashes()).toEqual({ [original.slug]: freshHash });
  });

  it("restores a genuinely new article without fabricating a publication baseline", async () => {
    const newArticle = { ...original, id: 2, slug: "synthetic-new", title: "New article" };
    const changes = stagedArticleChanges([original, newArticle], [original]);
    createDraftRecoveryStore(recoveryActorKey(actor)!).write({ tool: "staged-articles", record: "working-set", baseline: changes[0].baseline, draft: { changes } });
    const { result } = await open();
    await act(async () => { await result.current.recovery.restore(); });
    expect(result.current.state.articles[1]).toEqual(newArticle);
    expect(result.current.recovery.held).toBeNull();
    expect(result.current.state.getArticleBaseHashes()).toEqual({});
    expect(fetch).not.toHaveBeenCalled();
  });
});
