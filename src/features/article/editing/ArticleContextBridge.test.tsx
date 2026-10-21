// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContextualEditingContext, type ContextualEditingState } from "@/features/contextual-editing/context";
import type { SubstanceArticle } from "@/schema";
import ArticleContextBridge from "./ArticleContextBridge.editor";
import ArticleSectionEditor from "./ArticleSectionEditor.editor";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }), useSelectedLayoutSegments: () => [] }));
vi.mock("../components/ArticleLayout", () => ({
  ArticleLayout: ({ article }: { article: SubstanceArticle }) => <><article aria-label="Article preview">{article.summary}</article><ArticleSectionEditor section="dosage" /></>,
}));

const article = { id: 1, slug: "fixture", title: "Fixture", summary: "Public article", references: [] } as unknown as SubstanceArticle;
const ownerSummary = "First account private draft";
const state: ContextualEditingState = {
  enabled: true, mode: "edit", role: "admin", email: "first@example.test",
  setDirty: () => {}, registerDraftGuard: () => () => {},
};
const snapshot = (summary: string | null) => ({
  article, baseHash: "public-revision", history: [], draftVersion: 1,
  draft: summary ? { article: { ...article, summary }, baseHash: "public-revision", version: 1 } : null,
});
const view = (identity: ContextualEditingState, section?: "summary") => <ContextualEditingContext.Provider value={identity}>
  <ArticleContextBridge slug="fixture" article={article} requestedSection={section}><p>{article.summary}</p></ArticleContextBridge>
</ContextualEditingContext.Provider>;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("private article session boundaries", () => {
  it("conceals the previous account's draft immediately and loads only the new account's state", async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json(snapshot(ownerSummary)))
      .mockResolvedValueOnce(Response.json(snapshot(null)));
    vi.stubGlobal("fetch", request);
    const rendered = render(view(state));
    await screen.findByText(ownerSummary);
    rendered.rerender(view({ ...state, role: null, email: null, mode: "view" }));
    expect(screen.queryByText(ownerSummary)).toBeNull();
    rendered.rerender(view({ ...state, role: "editor", email: "second@example.test" }));
    expect(screen.queryByText(ownerSummary)).toBeNull();
    await screen.findByText("Published article loaded");
    expect(screen.queryByText(ownerSummary)).toBeNull();
    expect(screen.getByText("Public article")).toBeTruthy();
  });

  it("conceals a denied form save without losing the unsaved values during baseline recovery", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json(snapshot(ownerSummary)))
      .mockResolvedValueOnce(Response.json({ error: "Session expired" }, { status: 401 }))
      .mockResolvedValueOnce(Response.json(snapshot(ownerSummary))));
    render(view(state, "summary"));
    fireEvent.change(await screen.findByDisplayValue(ownerSummary), { target: { value: "Unsaved private correction" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText(/Your private draft is concealed/);
    expect(screen.queryByText("Unsaved private correction")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Load latest published version" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use the merged draft" }));
    const review = await screen.findByRole("dialog", { name: "Review article changes" });
    expect(within(review).getByText("Unsaved private correction")).toBeTruthy();
  });
});

const published = (summary: string) => Response.json({
  ok: true, revisionId: "rev-1", changeId: "change-1", draftVersion: 2,
  article: { ...article, summary }, baseHash: "published-revision",
});

describe("reconciling a draft with a newer published article", () => {
  const newer = (changes: Partial<SubstanceArticle>) => ({
    article: { ...article, ...changes }, baseHash: "public-revision-2", history: [], draftVersion: 1,
    draft: { article: { ...article, summary: ownerSummary }, baseHash: "public-revision", version: 1 },
  });
  const refreshTo = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByText(ownerSummary);
    await user.click(screen.getByRole("button", { name: "Editing options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Load latest published version" }));
    return screen.findByRole("dialog", { name: "Merge with the latest version" });
  };
  const posts = (request: ReturnType<typeof vi.fn>) => request.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);

  it("keeps both editors' changes when they changed different fields", async () => {
    const user = userEvent.setup();
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json(snapshot(ownerSummary)))
      .mockResolvedValueOnce(Response.json(newer({ title: "Fixture, renamed" })))
      .mockResolvedValueOnce(published(ownerSummary))
      .mockResolvedValue(Response.json(snapshot(null)));
    vi.stubGlobal("fetch", request);
    render(view(state));
    const panel = await refreshTo(user);

    expect(within(panel).queryByRole("region", { name: "Changed by both" })).toBeNull();
    expect(within(within(panel).getByRole("region", { name: "Your changes, kept" })).getByText(ownerSummary)).toBeTruthy();
    expect(within(within(panel).getByRole("region", { name: "Someone else's changes, kept" })).getByText("Fixture, renamed")).toBeTruthy();

    await user.click(within(panel).getByRole("button", { name: "Use the merged draft" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Review article changes" })).getByRole("button", { name: /^Publish/ }));
    await user.click(within(await screen.findByRole("dialog", { name: /Publish this change/ })).getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(posts(request)).toHaveLength(1));
    expect(posts(request)[0]).toMatchObject({
      action: "publish", baseHash: "public-revision-2",
      article: { summary: ownerSummary, title: "Fixture, renamed" },
    });
  });

  it("shows both versions of a field both editors changed and needs a choice", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json(snapshot(ownerSummary)))
      .mockResolvedValueOnce(Response.json(newer({ summary: "Their correction" }))));
    render(view(state));
    const panel = await refreshTo(user);

    const both = within(panel).getByRole("region", { name: "Changed by both" });
    const row = within(both).getByRole("group", { name: "Summary, changed by both" });
    expect(within(row).getByText("You changed")).toBeTruthy();
    expect(within(row).getByText(ownerSummary)).toBeTruthy();
    expect(within(row).getByText("Someone else changed")).toBeTruthy();
    expect(within(row).getByText("Their correction")).toBeTruthy();
    expect(within(both).getByRole("status").textContent).toBe("Choose a version for 1 field both of you changed.");
    const use = within(panel).getByRole("button", { name: "Use the merged draft" }) as HTMLButtonElement;
    expect(use.disabled).toBe(true);

    await user.click(within(row).getByRole("button", { name: "Use yours Summary" }));
    expect(use.disabled).toBe(false);
    await user.click(use);
    const review = await screen.findByRole("dialog", { name: "Review article changes" });
    expect(within(review).getByText(ownerSummary)).toBeTruthy();
    expect(screen.getByRole("article", { name: "Article preview", hidden: true }).textContent).toBe(ownerSummary);
  });

  it("still refuses to publish over a further change that lands after the merge", async () => {
    const user = userEvent.setup();
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json(snapshot(ownerSummary)))
      .mockResolvedValueOnce(Response.json(newer({ title: "Fixture, renamed" })))
      .mockResolvedValueOnce(Response.json({ error: "The article changed after you loaded it. Refresh the latest baseline." }, { status: 409 }));
    vi.stubGlobal("fetch", request);
    render(view(state));
    const panel = await refreshTo(user);
    await user.click(within(panel).getByRole("button", { name: "Use the merged draft" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Review article changes" })).getByRole("button", { name: /^Publish/ }));
    await user.click(within(await screen.findByRole("dialog", { name: /Publish this change/ })).getByRole("button", { name: "Publish" }));

    expect((await screen.findAllByText(/The article changed after you loaded it/)).length).toBeGreaterThan(0);
    expect(posts(request)[0]).toMatchObject({ action: "publish", baseHash: "public-revision-2" });
    expect(screen.queryByTestId("article-publication-notice")).toBeNull();
    expect(screen.getByRole("article", { name: "Article preview", hidden: true }).textContent).toBe(ownerSummary);
  });
});
