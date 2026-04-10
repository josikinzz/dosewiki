import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function createStreamResult(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

function renderSectionGenerator(overrides: Partial<ComponentProps<typeof SectionGenerator>> = {}) {
  const onApply = vi.fn();

  render(
    <SectionGenerator
      sectionLabel="Summary"
      sectionKey="summary"
      prompt="Write a summary"
      extractedContent="Source excerpt"
      genericSources={[{ source: "example", content: "content" }]}
      currentArticleYaml={null}
      onApply={onApply}
      apiKey="test-key"
      model="anthropic/claude-3.7-sonnet"
      isKeyValid={true}
      {...overrides}
    />,
  );

  return { onApply };
}

describe("SectionGenerator", () => {
  beforeEach(() => {
    streamCompletionMock.mockReset();
    estimateTokensMock.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults Claude reasoning to force mode with medium effort", () => {
    renderSectionGenerator();

    const reasoningModeSelect = screen.getByRole("combobox", { name: "Reasoning mode" });
    const reasoningSelect = screen.getByRole("combobox", { name: "Reasoning effort" });

    expect(reasoningModeSelect).toHaveValue("force");
    expect(reasoningSelect).toHaveValue("medium");
  });

  it("lets users change reasoning mode and effort for Claude models", () => {
    renderSectionGenerator();

    const reasoningModeSelect = screen.getByRole("combobox", { name: "Reasoning mode" });
    const reasoningSelect = screen.getByRole("combobox", { name: "Reasoning effort" });

    expect(reasoningModeSelect).toHaveValue("force");
    expect(reasoningSelect).toHaveValue("medium");

    fireEvent.change(reasoningModeSelect, { target: { value: "adaptive" } });

    expect(reasoningModeSelect).toHaveValue("adaptive");

    fireEvent.change(reasoningSelect, { target: { value: "high" } });

    expect(reasoningSelect).toHaveValue("high");
  });

  it("streams YAML output and applies the generated result", async () => {
    const generatedYaml = "summary:\n  text: Generated summary";
    streamCompletionMock.mockImplementationOnce(async (_apiKey, _model, _prompt, _userMessage, callbacks) => {
      callbacks.onChunk(generatedYaml);
      callbacks.onComplete(generatedYaml);
      return createStreamResult({
        fullText: generatedYaml,
        contentChunkCount: 1,
        contentChars: generatedYaml.length,
      });
    });

    const { onApply } = renderSectionGenerator({
      sectionLabel: "Pharmacology",
      sectionKey: "pharmacology",
      prompt: "Write a pharmacology section",
      extractedContent: "Extracted source",
      genericSources: [],
      model: "anthropic/claude-opus-4.5",
    });

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

    expect(screen.getByLabelText("Generated YAML")).toHaveValue(generatedYaml);

    fireEvent.click(screen.getByRole("button", { name: /apply to form/i }));

    expect(onApply).toHaveBeenCalledWith(generatedYaml);
    expect(screen.queryByRole("button", { name: /apply to form/i })).not.toBeInTheDocument();
  });

  it("downgrades adaptive reasoning instead of disabling it for large prompts", async () => {
    streamCompletionMock.mockResolvedValueOnce(createStreamResult());

    renderSectionGenerator({
      sectionLabel: "Pharmacology",
      sectionKey: "pharmacology",
      prompt: "Prompt ".repeat(9000),
      extractedContent: "Extracted source ".repeat(2000),
      genericSources: [],
      model: "anthropic/claude-opus-4.5",
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Reasoning mode" }), {
      target: { value: "adaptive" },
    });

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
        reasoningEffort: "minimal",
      }),
    );
  });

  it("retries without reasoning when the first pass returns no YAML", async () => {
    const fallbackYaml = "summary:\n  text: Retried summary";

    streamCompletionMock
      .mockImplementationOnce(async (_apiKey, _model, _prompt, _userMessage, callbacks) => {
        callbacks.onReasoning("Analyzing sources");
        callbacks.onComplete("");
        return createStreamResult({
          reasoningChunkCount: 1,
          reasoningChars: 17,
        });
      })
      .mockImplementationOnce(async (_apiKey, _model, _prompt, _userMessage, callbacks) => {
        callbacks.onChunk(fallbackYaml);
        callbacks.onComplete(fallbackYaml);
        return createStreamResult({
          fullText: fallbackYaml,
          contentChunkCount: 1,
          contentChars: fallbackYaml.length,
        });
      });

    renderSectionGenerator({
      sectionLabel: "Pharmacology",
      sectionKey: "pharmacology",
      prompt: "Write a pharmacology section",
      extractedContent: "Extracted source",
      genericSources: [],
      model: "anthropic/claude-opus-4.5",
    });

    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() => {
      expect(streamCompletionMock).toHaveBeenCalledTimes(2);
    });

    expect(streamCompletionMock.mock.calls[1]?.[6]).toEqual(
      expect.objectContaining({
        enableReasoning: false,
      }),
    );
    expect(screen.getByLabelText("Generated YAML")).toHaveValue(fallbackYaml);
    expect(screen.getByText(/Retrying without reasoning/i)).toBeInTheDocument();
  });

  it("shows generation errors when the streaming request throws", async () => {
    streamCompletionMock.mockRejectedValueOnce(new Error("Network down"));

    renderSectionGenerator({
      sectionLabel: "Pharmacology",
      sectionKey: "pharmacology",
      prompt: "Write a pharmacology section",
      extractedContent: "Extracted source",
      genericSources: [],
      model: "anthropic/claude-opus-4.5",
    });

    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    expect(await screen.findByText("Network down")).toBeInTheDocument();
  });
});
