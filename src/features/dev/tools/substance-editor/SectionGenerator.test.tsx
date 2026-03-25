import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/common/AppImage", () => ({
  AppImage: () => null,
}));

vi.mock("./PromptEditorModal", () => ({
  PromptEditorModal: () => null,
}));

const { streamCompletionMock, estimateTokensMock } = vi.hoisted(() => ({
  streamCompletionMock: vi.fn(),
  estimateTokensMock: vi.fn((text: string) => Math.ceil(text.length / 4)),
}));

vi.mock("@/utils/api/openrouter", () => ({
  estimateTokens: estimateTokensMock,
  streamCompletion: streamCompletionMock,
}));

import { SectionGenerator } from "./SectionGenerator";

describe("SectionGenerator", () => {
  it("defaults Claude reasoning to medium", () => {
    render(
      <SectionGenerator
        sectionLabel="Summary"
        sectionKey="summary"
        prompt="Write a summary"
        extractedContent="Source excerpt"
        genericSources={[{ source: "example", content: "content" }]}
        currentArticleYaml={null}
        onApply={() => {}}
        apiKey="test-key"
        model="anthropic/claude-3.7-sonnet"
        isKeyValid={true}
      />,
    );

    const reasoningSelect = screen.getByRole("combobox", { name: "Reasoning effort" });

    expect(reasoningSelect).toHaveValue("medium");
  });

  it("lets users change reasoning effort for Claude models", () => {
    render(
      <SectionGenerator
        sectionLabel="Summary"
        sectionKey="summary"
        prompt="Write a summary"
        extractedContent="Source excerpt"
        genericSources={[{ source: "example", content: "content" }]}
        currentArticleYaml={null}
        onApply={() => {}}
        apiKey="test-key"
        model="anthropic/claude-3.7-sonnet"
        isKeyValid={true}
      />,
    );

    const reasoningSelect = screen.getByRole("combobox", { name: "Reasoning effort" });

    expect(reasoningSelect).toHaveValue("medium");

    fireEvent.change(reasoningSelect, { target: { value: "high" } });

    expect(reasoningSelect).toHaveValue("high");
  });

  it("uses medium reasoning by default during generation", async () => {
    streamCompletionMock.mockResolvedValueOnce({
      fullText: "",
      finishReason: "stop",
      durationMs: 10,
      responseStatus: 200,
      contentChunkCount: 0,
      reasoningChunkCount: 0,
      contentChars: 0,
      reasoningChars: 0,
      sseEventCount: 0,
      malformedEventCount: 0,
      doneEventReceived: true,
      aborted: false,
    });

    render(
      <SectionGenerator
        sectionLabel="Pharmacology"
        sectionKey="pharmacology"
        prompt="Write a pharmacology section"
        extractedContent="Extracted source"
        genericSources={[]}
        currentArticleYaml={null}
        onApply={() => {}}
        apiKey="test-key"
        model="anthropic/claude-opus-4.5"
        isKeyValid={true}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() => {
      expect(streamCompletionMock).toHaveBeenCalled();
    });

    expect(streamCompletionMock).toHaveBeenCalledWith(
      "test-key",
      "anthropic/claude-opus-4.5",
      expect.any(String),
      expect.any(String),
      expect.any(Object),
      expect.any(AbortSignal),
      expect.objectContaining({
        enableReasoning: true,
        reasoningEffort: "medium",
      }),
    );
  });
});
