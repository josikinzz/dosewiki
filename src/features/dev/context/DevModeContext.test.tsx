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
      getByType: "indexLayouts.getByType",
    },
    siteConfig: {
      getAbout: "siteConfig.getAbout",
    },
    prompts: {
      getByKey: "prompts.getByKey",
    },
  },
}));

import { DevModeProvider, useDevMode } from "./DevModeContext";

function DevModeConsumer() {
  const {
    aboutFounderKeys,
    articles,
    close,
    open,
    replaceAboutFounderKeys,
    resetArticleAt,
    updateArticleAt,
  } = useDevMode();

  return (
    <div>
      <div data-testid="article-title">{articles[0]?.title ?? ""}</div>
      <div data-testid="founder-keys">{aboutFounderKeys.join(",")}</div>
      <button type="button" onClick={() => open({ tab: "articles", slug: "lsd" })}>
        Open
      </button>
      <button type="button" onClick={close}>
        Close
      </button>
      <button
        type="button"
        onClick={() => replaceAboutFounderKeys([" alice ", "bob", "ALICE"])}
      >
        Normalize founders
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

describe("DevModeContext", () => {
  it("keeps navigation behavior stable through the sliced provider internals", () => {
    let currentPath = "/substances/lsd";
    const navigateMock = vi.fn((nextPath: string) => {
      currentPath = nextPath;
    });
    const articles = [
      {
        title: "LSD",
        identification: { common_name: "LSD" },
      },
    ];
    const indexLayout = { version: 1, categories: [] };
    const aboutData = {
      aboutMarkdown: "About",
      aboutSubtitle: "Subtitle",
      founderProfileKeys: ["FOUNDER"],
    };

    useLibraryMock.mockReturnValue({
      articles,
    });

    useQueryMock.mockImplementation((_query, args: { type?: string }) => {
      if (args?.type) {
        return indexLayout;
      }

      return aboutData;
    });

    render(
      <DevModeProvider navigate={navigateMock} getCurrentPath={() => currentPath}>
        <DevModeConsumer />
      </DevModeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(navigateMock).toHaveBeenNthCalledWith(1, "/dev/articles/lsd");
    expect(navigateMock).toHaveBeenNthCalledWith(2, "/substances/lsd");
  });

  it("preserves article reset and founder normalization behavior", () => {
    const articles = [
      {
        title: "LSD",
        identification: { common_name: "LSD" },
      },
    ];
    const indexLayout = { version: 1, categories: [] };
    const aboutData = {
      aboutMarkdown: "About",
      aboutSubtitle: "Subtitle",
      founderProfileKeys: ["FOUNDER"],
    };

    useLibraryMock.mockReturnValue({
      articles,
    });

    useQueryMock.mockImplementation((_query, args: { type?: string }) => {
      if (args?.type) {
        return indexLayout;
      }

      return aboutData;
    });

    render(
      <DevModeProvider>
        <DevModeConsumer />
      </DevModeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Normalize founders" }));
    expect(screen.getByTestId("founder-keys")).toHaveTextContent("ALICE,BOB");

    fireEvent.click(screen.getByRole("button", { name: "Update article" }));
    expect(screen.getByTestId("article-title")).toHaveTextContent("Updated LSD");

    fireEvent.click(screen.getByRole("button", { name: "Reset article" }));
    expect(screen.getByTestId("article-title")).toHaveTextContent("LSD");
  });
});
