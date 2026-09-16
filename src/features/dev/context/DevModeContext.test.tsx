import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useQueryMock, useLibraryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  useLibraryMock: vi.fn(),
}));

vi.mock("@/hooks/useEditorRead", () => ({
  useEditorRead: useQueryMock,
}));
vi.mock("@/hooks/useIndexLayouts", () => ({
  useIndexLayouts: () => ({
    layouts: INDEX_LAYOUTS,
    error: null,
    retry: vi.fn(),
  }),
}));


vi.mock("@/data/SubstanceIndexProvider", () => ({
  useLibrary: useLibraryMock,
}));
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated", data: { user: { role: "editor" } } }) }));
vi.mock("../tools/useCopyIndexSource", () => ({ useCopyIndexSource: () => ({ data: useQueryMock(), error: null, reload: vi.fn() }) }));

import { DevModeProvider, useDevMode } from "./DevModeContext";

function DevModeConsumer() {
  const { articles, close, resetArticleAt, updateArticleAt } = useDevMode();

  return (
    <div>
      <div data-testid="article-title">{articles[0]?.title ?? ""}</div>
      <button type="button" onClick={close}>
        Close
      </button>
      <button
        type="button"
        onClick={() => updateArticleAt(0, {
          ...articles[0],
          title: "Updated LSD",
        })}
      >
        Update article
      </button>
      <button type="button" onClick={() => resetArticleAt(0)}>
        Reset article
      </button>
    </div>
  );
}

const ARTICLES = [
  {
    title: "LSD",
    identification: { common_name: "LSD" },
  },
];

const INDEX_LAYOUTS = [
  { type: "psychoactive", version: 1, categories: [] },
  { type: "chemical", version: 1, categories: [] },
  { type: "mechanism", version: 1, categories: [] },
];

const PROPOSAL_SEED = {
  proposalId: "cp_1",
  summary: "Update LSD",
  reason: "Article lsd changed",
  payload: {
    articles: [
      { title: "LSD (proposed)", slug: "lsd", summary: "Proposed summary" },
      { title: "New Thing", slug: "new-thing", summary: "Brand new" },
    ],
    indexLayouts: [{ type: "psychoactive" as const, version: 7, categories: [] }],
  },
};

function ProposalSeedConsumer() {
  const {
    activeProposal,
    articles,
    clearActiveProposal,
    discardActiveProposal,
    getOriginalArticles,
    loadProposal,
    psychoactiveIndexManual,
    updateArticleAt,
    replacePsychoactiveIndexManual,
  } = useDevMode();
  const [error, setError] = useState("");
  const first = articles[0] as { title?: string; summary?: string } | undefined;
  const original = getOriginalArticles()[0] as { summary?: string } | undefined;

  return (
    <div>
      <div data-testid="article-title">{first?.title ?? ""}</div>
      <div data-testid="article-summary">{first?.summary ?? ""}</div>
      <div data-testid="original-summary">{original?.summary ?? ""}</div>
      <div data-testid="article-count">{articles.length}</div>
      <div data-testid="psychoactive-version">{psychoactiveIndexManual.version}</div>
      <div data-testid="active-proposal">
        {activeProposal ? `${activeProposal.proposalId}:${activeProposal.reason}:${activeProposal.summary}` : "none"}
      </div>
      <div data-testid="load-error">{error}</div>
      <button type="button" onClick={() => updateArticleAt(0, { ...articles[0], summary: "Unsaved local summary" })}>
        Stage local article
      </button>
      <button type="button" onClick={() => replacePsychoactiveIndexManual({ version: 9, categories: [] })}>
        Stage local layout
      </button>
      <button
        type="button"
        onClick={() => {
          loadProposal(PROPOSAL_SEED).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
        }}
      >
        Load proposal
      </button>
      <button type="button" onClick={clearActiveProposal}>
        Clear proposal
      </button>
      <button type="button" onClick={discardActiveProposal}>
        Discard proposal
      </button>
    </div>
  );
}

describe("DevModeContext", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("closes the editor to the substances index", () => {
    let currentPath = "/dev/articles/lsd";
    const navigateMock = vi.fn((nextPath: string) => {
      currentPath = nextPath;
    });

    useLibraryMock.mockReturnValue({ articles: ARTICLES });
    useQueryMock.mockReturnValue(INDEX_LAYOUTS);

    render(
      <DevModeProvider navigate={navigateMock} getCurrentPath={() => currentPath}>
        <DevModeConsumer />
      </DevModeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith("/substances");
  });


  it("preserves article reset behavior", () => {
    useLibraryMock.mockReturnValue({ articles: ARTICLES });
    useQueryMock.mockReturnValue(INDEX_LAYOUTS);

    render(
      <DevModeProvider>
        <DevModeConsumer />
      </DevModeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Update article" }));
    expect(screen.getByTestId("article-title")).toHaveTextContent("Updated LSD");

    fireEvent.click(screen.getByRole("button", { name: "Reset article" }));
    expect(screen.getByTestId("article-title")).toHaveTextContent("LSD");
  });

  it("seeds the working set from a proposal over hydrated production rows, and discards it back", async () => {
    useLibraryMock.mockReturnValue({ articles: ARTICLES });
    useQueryMock.mockReturnValue(INDEX_LAYOUTS);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      Response.json({
        article: { title: "LSD", slug: "lsd", identification: { common_name: "LSD" }, summary: "Stored summary" },
        requested: String(input),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DevModeProvider>
        <ProposalSeedConsumer />
      </DevModeProvider>,
    );

    expect(screen.getByTestId("active-proposal")).toHaveTextContent("none");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load proposal" }));
      await Promise.resolve();
    });

    // The production row was hydrated (draft and baseline), then overlaid with the proposed fields.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/dev/editor-library?slug=lsd");
    expect(screen.getByTestId("article-title")).toHaveTextContent("LSD (proposed)");
    expect(screen.getByTestId("article-summary")).toHaveTextContent("Proposed summary");
    expect(screen.getByTestId("original-summary")).toHaveTextContent("Stored summary");
    expect(screen.getByTestId("article-count")).toHaveTextContent("2");
    expect(screen.getByTestId("psychoactive-version")).toHaveTextContent("7");
    expect(screen.getByTestId("active-proposal")).toHaveTextContent("cp_1:Article lsd changed:Update LSD");

    fireEvent.click(screen.getByRole("button", { name: "Discard proposal" }));

    expect(screen.getByTestId("active-proposal")).toHaveTextContent("none");
    expect(screen.getByTestId("article-title")).toHaveTextContent("LSD");
    expect(screen.getByTestId("article-summary")).toHaveTextContent("Stored summary");
    expect(screen.getByTestId("article-count")).toHaveTextContent("1");
    expect(screen.getByTestId("psychoactive-version")).toHaveTextContent("1");
  });

  it("clears the proposal link after a save but keeps the seeded edits", async () => {
    useLibraryMock.mockReturnValue({ articles: ARTICLES });
    useQueryMock.mockReturnValue(INDEX_LAYOUTS);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ article: { title: "LSD", slug: "lsd", summary: "Stored summary" } })),
    );

    render(
      <DevModeProvider>
        <ProposalSeedConsumer />
      </DevModeProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load proposal" }));
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear proposal" }));

    expect(screen.getByTestId("active-proposal")).toHaveTextContent("none");
    expect(screen.getByTestId("article-summary")).toHaveTextContent("Proposed summary");
    expect(screen.getByTestId("article-count")).toHaveTextContent("2");
  });

  it("refuses to seed when a production article the proposal needs does not load", async () => {
    useLibraryMock.mockReturnValue({ articles: ARTICLES });
    useQueryMock.mockReturnValue(INDEX_LAYOUTS);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "nope" }, { status: 500 })));

    render(
      <DevModeProvider>
        <ProposalSeedConsumer />
      </DevModeProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load proposal" }));
      await Promise.resolve();
    });

    expect(screen.getByTestId("load-error")).toHaveTextContent("Could not load lsd from the library");
    expect(screen.getByTestId("active-proposal")).toHaveTextContent("none");
    expect(screen.getByTestId("article-summary")).toHaveTextContent("");
    expect(screen.getByTestId("article-count")).toHaveTextContent("1");
  });

  it.each(["article", "layout"] as const)("keeps unsaved %s edits when a proposal is loaded", async (kind) => {
    useLibraryMock.mockReturnValue({ articles: ARTICLES });
    useQueryMock.mockReturnValue(INDEX_LAYOUTS);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ articles: ARTICLES })));
    render(<DevModeProvider><ProposalSeedConsumer /></DevModeProvider>);

    fireEvent.click(screen.getByRole("button", { name: `Stage local ${kind}` }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load proposal" }));
    });

    expect(screen.getByTestId("active-proposal")).toHaveTextContent("none");
    expect(screen.getByTestId("article-summary")).toHaveTextContent(kind === "article" ? "Unsaved local summary" : "");
    expect(screen.getByTestId("psychoactive-version")).toHaveTextContent(kind === "layout" ? "9" : "1");
    expect(screen.getByTestId("article-count")).toHaveTextContent("1");
  });
});
