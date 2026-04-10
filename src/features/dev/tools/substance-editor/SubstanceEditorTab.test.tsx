import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadSubstanceSourcesFromConvexMock, applyArticlesTransformMock } = vi.hoisted(() => ({
  loadSubstanceSourcesFromConvexMock: vi.fn(),
  applyArticlesTransformMock: vi.fn(),
}));

vi.mock("@/hooks/useArticleSources", () => ({
  useSubstanceSourceList: () => ({
    substances: [
      {
        slug: "lsd",
        name: "LSD",
        sources: [
          {
            id: "source-1",
            displayName: "Erowid",
          },
        ],
      },
    ],
  }),
  loadSubstanceSourcesFromConvex: loadSubstanceSourcesFromConvexMock,
}));

vi.mock("@/data/SubstanceIndexProvider", () => ({
  useLibrary: () => ({
    substanceRecords: [{ slug: "lsd" }],
    allSubstanceRecords: [{ slug: "lsd" }],
  }),
}));

vi.mock("../../context/DevModeContext", () => ({
  useDevMode: () => ({
    articles: [],
    applyArticlesTransform: applyArticlesTransformMock,
  }),
}));

vi.mock("@/hooks/useQuotes", () => ({
  useQuote: () => ({
    content: null,
  }),
}));

vi.mock("@/utils/api/openrouter", () => ({
  DEFAULT_OPENROUTER_MODEL_ID: "anthropic/claude-opus-4.5",
  MODEL_OPTIONS: [
    {
      id: "anthropic/claude-opus-4.5",
      label: "Claude Opus",
      description: "Test model",
      contextWindow: 200000,
    },
  ],
  resolveOpenRouterModelId: () => "anthropic/claude-opus-4.5",
  validateApiKey: vi.fn().mockResolvedValue(true),
}));

import { SubstanceEditorTab } from "./SubstanceEditorTab";

describe("SubstanceEditorTab", () => {
  beforeEach(() => {
    const createStorageMock = () => ({
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(() => null),
      length: 0,
    });

    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createStorageMock(),
    });

    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: createStorageMock(),
    });
  });

  it("opens the fullscreen source preview and keeps prompt diff wiring intact", async () => {
    loadSubstanceSourcesFromConvexMock.mockResolvedValue({
      contents: {
        "source-1": "Set and setting guidance",
      },
    });

    render(
      <SubstanceEditorTab
        generatorPrompt=""
        originalGeneratorPrompt=""
        onPromptChange={() => {}}
        onResetPrompt={() => {}}
        promptDiff={"+ prompt change"}
        promptHasChanges={true}
        onCopyPrompt={() => {}}
        commitPanel={<div>Commit panel</div>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /lsd/i }));

    await waitFor(() => {
      expect(loadSubstanceSourcesFromConvexMock).toHaveBeenCalledWith("lsd");
    });

    fireEvent.click(screen.getByRole("button", { name: /available sources/i }));

    expect(await screen.findByText("Erowid")).toBeInTheDocument();
    expect(screen.getByText("+ prompt change")).toBeInTheDocument();
    expect(screen.getByText("Commit panel")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Open fullscreen"));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByText("Erowid").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Set and setting guidance").length).toBeGreaterThan(0);
  });
});
