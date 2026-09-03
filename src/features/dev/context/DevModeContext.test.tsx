import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { useQueryMock, useLibraryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  useLibraryMock: vi.fn(),
}));

vi.mock("convex/react", () => ({
  ConvexReactClient: vi.fn(),
  useQuery: useQueryMock,
}));

vi.mock("@/data/SubstanceIndexProvider", () => ({
  useLibrary: useLibraryMock,
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    indexLayouts: {
      getAll: "indexLayouts.getAll",
    },
    prompts: {
      getByKey: "prompts.getByKey",
    },
  },
}));

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

describe("DevModeContext", () => {
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

  it("subscribes to the index layouts only; the About document belongs to its editor", () => {
    useLibraryMock.mockReturnValue({ articles: ARTICLES });
    useQueryMock.mockReturnValue(INDEX_LAYOUTS);

    render(
      <DevModeProvider>
        <DevModeConsumer />
      </DevModeProvider>,
    );

    expect(new Set(useQueryMock.mock.calls.map(([query]) => query))).toEqual(new Set(["indexLayouts.getAll"]));
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
});
