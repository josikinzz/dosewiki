import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContextualEditingContext, type ContextualEditingState } from "@/features/contextual-editing/context";
import type { SubstanceArticle } from "@/schema";
import ArticleContextBridge from "./ArticleContextBridge.editor";
import ArticleSectionEditor from "./ArticleSectionEditor.editor";
import { createEmptyArticle, createEmptyDosageRoute, createEmptyDurationRoute } from "@/data/schema";

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
    fireEvent.click(screen.getByRole("button", { name: "Refresh latest baseline" }));
    fireEvent.click(await screen.findByRole("button", { name: "Keep my draft on latest baseline" }));
    const review = await screen.findByRole("dialog", { name: "Review article changes" });
    expect(within(review).getByText("Unsaved private correction")).toBeTruthy();
  });

  it("retains unsubmitted form values when the same account returns after a signed-out interval", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(snapshot(ownerSummary))));
    const rendered = render(view(state, "summary"));
    fireEvent.change(await screen.findByDisplayValue(ownerSummary), { target: { value: "Unsubmitted form input" } });
    rendered.rerender(view({ ...state, role: null, email: null, mode: "view" }, "summary"));
    expect(screen.queryByDisplayValue("Unsubmitted form input")).toBeNull();
    rendered.rerender(view(state, "summary"));
    expect(await screen.findByDisplayValue("Unsubmitted form input")).toBeTruthy();
  });

  it("saves the first paired route edit after opening a contextual section", async () => {
    const initial = {
      ...createEmptyArticle(), slug: "fixture", title: "Fixture",
      dosage: { routes: [createEmptyDosageRoute("Inhalation")] },
      duration: { routes: [createEmptyDurationRoute("Inhalation")] },
    } as SubstanceArticle;
    const writes: Array<{ action: string; article: SubstanceArticle }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        writes.push(JSON.parse(init.body as string));
        return Response.json({ draftVersion: 1 });
      }
      return Response.json({ article: initial, baseHash: "revision", history: [], draftVersion: 0, draft: null });
    }));
    render(<ContextualEditingContext.Provider value={state}>
      <ArticleContextBridge slug="fixture" article={initial}>
        <ArticleSectionEditor section="dosage" />
      </ArticleContextBridge>
    </ContextualEditingContext.Provider>);
    fireEvent.click(await screen.findByRole("button", { name: "Edit dosage and duration" }));
    const route = await screen.findByLabelText("Administration route");
    fireEvent.change(route, { target: { value: "Vaporization" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      action: "saveDraft",
      article: {
        dosage: { routes: [{ ...initial.dosage.routes[0], route: "Vaporization" }] },
        duration: { routes: [{ ...initial.duration.routes[0], route: "Vaporization" }] },
      },
    });
  });

  it("retains invalid range drafts and blocks collection until both fields are corrected", async () => {
    const user = userEvent.setup();
    const initial = {
      ...createEmptyArticle(), slug: "fixture", title: "Fixture",
      dosage: { routes: [createEmptyDosageRoute("Oral")] },
      duration: { routes: [createEmptyDurationRoute("Oral")] },
    } as SubstanceArticle;
    const request = vi.fn().mockResolvedValue(Response.json({
      article: initial, baseHash: "revision", history: [], draftVersion: 0, draft: null,
    }));
    vi.stubGlobal("fetch", request);
    render(<ContextualEditingContext.Provider value={state}>
      <ArticleContextBridge slug="fixture" article={initial}>{null}</ArticleContextBridge>
    </ContextualEditingContext.Provider>);
    await user.click(await screen.findByRole("button", { name: "Edit dosage and duration" }));
    const dose = await screen.findByLabelText("Threshold");
    const duration = screen.getByLabelText("Onset");
    await user.type(dose, "not a dose");
    await user.type(duration, "eventually");
    const editor = screen.getByRole("dialog", { name: "Edit dosage and duration" });
    await user.click(within(editor).getByRole("button", { name: "Preview locally" }));
    await waitFor(() => expect(dose).toHaveFocus());
    expect(dose).toHaveValue("not a dose");
    expect(duration).toHaveValue("eventually");

    await user.clear(dose);
    await user.type(dose, "10-20 mg");
    await user.click(within(editor).getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(duration).toHaveFocus());
    expect(request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    expect(duration).toHaveValue("eventually");

    await user.clear(duration);
    await user.type(duration, "15-30 minutes");
    await user.click(within(editor).getByRole("button", { name: "Preview locally" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit dosage and duration" })).toBeNull());
  });
});

// What `articleRevisionResult` actually returns: the published article and its
// new hash. The client adopts both, which is why publishing needs no refresh.
const published = (summary: string) => Response.json({
  ok: true, revisionId: "rev-1", changeId: "change-1", draftVersion: 2,
  article: { ...article, summary }, baseHash: "published-revision",
});

describe("publishing one change", () => {

  it("sends the editor's own note once they have written one", async () => {
    const user = userEvent.setup();
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json(snapshot(ownerSummary)))
      .mockResolvedValueOnce(published(ownerSummary))
      .mockResolvedValue(Response.json(snapshot(null)));
    vi.stubGlobal("fetch", request);
    render(view(state));
    await screen.findByText(ownerSummary);
    await user.click(await screen.findByRole("button", { name: "Review changes and history" }));

    const note = await screen.findByLabelText("Change note");
    await user.clear(note);
    await user.type(note, "Corrected the onset claim");
    await user.click(within(screen.getByRole("dialog", { name: "Review article changes" })).getByRole("button", { name: /^Publish/ }));

    await waitFor(() => {
      const posted = request.mock.calls.find(([, init]) => init?.method === "POST");
      expect(JSON.parse(String(posted?.[1]?.body))).toMatchObject({ summary: "Corrected the onset claim" });
    });
  });
});
