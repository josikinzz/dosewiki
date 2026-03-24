import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/common/AppImage", () => ({
  AppImage: () => null,
}));

vi.mock("./PromptEditorModal", () => ({
  PromptEditorModal: () => null,
}));

vi.mock("@/utils/api/openrouter", () => ({
  streamCompletion: vi.fn(),
}));

import { SectionGenerator } from "./SectionGenerator";

describe("SectionGenerator", () => {
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

    expect(reasoningSelect).toHaveValue("low");

    fireEvent.change(reasoningSelect, { target: { value: "high" } });

    expect(reasoningSelect).toHaveValue("high");
  });
});
