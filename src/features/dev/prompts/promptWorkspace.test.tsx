import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UsePromptResult } from "@/hooks/usePrompts";
import { getPromptDescriptorByKey } from "@/data/config/promptRegistry";
import {
  buildPromptWorkspaceSnapshot,
  usePromptWorkspaceDocument,
} from "./promptWorkspace";

const { usePromptMock } = vi.hoisted(() => ({
  usePromptMock: vi.fn(),
}));

vi.mock("@/hooks/usePrompts", () => ({
  usePrompt: usePromptMock,
}));

const generatorDescriptor = getPromptDescriptorByKey("generator");
const sectionDescriptor = getPromptDescriptorByKey("section_summary");

if (!generatorDescriptor || !sectionDescriptor) {
  throw new Error("Prompt workspace tests require generator and summary descriptors.");
}

function createPrompt(overrides: Partial<UsePromptResult> = {}): UsePromptResult {
  return {
    content: "Runtime prompt",
    exists: true,
    isLoading: false,
    isSaving: false,
    save: vi.fn().mockResolvedValue(undefined),
    updatedAt: "2026-04-27T12:00:00.000Z",
    updatedBy: "EDITOR",
    ...overrides,
  };
}

describe("promptWorkspace", () => {
  beforeEach(() => {
    usePromptMock.mockReset();
  });

  it("builds identical dirty-state semantics for generator and section descriptors", () => {
    const generator = buildPromptWorkspaceSnapshot({
      descriptor: generatorDescriptor,
      content: "changed",
      originalContent: "original",
      exists: true,
      isLoading: false,
      saveError: null,
      saveStatus: "idle",
    });
    const section = buildPromptWorkspaceSnapshot({
      descriptor: sectionDescriptor,
      content: "changed",
      originalContent: "original",
      exists: true,
      isLoading: false,
      saveError: null,
      saveStatus: "idle",
    });

    expect(generator.hasChanges).toBe(true);
    expect(section.hasChanges).toBe(true);
    expect(generator.previewPayload).toMatchObject({
      key: "generator",
      kind: "generator",
      content: "changed",
    });
    expect(section.previewPayload).toMatchObject({
      key: "section_summary",
      kind: "section",
      content: "changed",
    });
  });

  it("loads runtime content with attribution, tracks changes, and resets", () => {
    usePromptMock.mockReturnValue(createPrompt());

    const { result } = renderHook(() => usePromptWorkspaceDocument("generator"));

    expect(result.current.content).toBe("Runtime prompt");
    expect(result.current.originalContent).toBe("Runtime prompt");
    expect(result.current.hasChanges).toBe(false);
    expect(result.current.attribution).toEqual({
      source: "convex",
      updatedAt: "2026-04-27T12:00:00.000Z",
      updatedBy: "EDITOR",
    });

    act(() => result.current.setContent("Edited prompt"));

    expect(result.current.content).toBe("Edited prompt");
    expect(result.current.hasChanges).toBe(true);

    act(() => result.current.reset());

    expect(result.current.content).toBe("Runtime prompt");
    expect(result.current.hasChanges).toBe(false);
  });

  it("uses seed content for a missing runtime prompt and can reload after runtime data changes", () => {
    const firstPrompt = createPrompt({ content: "", exists: false });
    const secondPrompt = createPrompt({ content: "Reloaded runtime prompt", exists: true });
    usePromptMock.mockReturnValue(firstPrompt);

    const { result, rerender } = renderHook(() =>
      usePromptWorkspaceDocument("generator", { seedContent: "Seed prompt" }),
    );

    expect(result.current.content).toBe("Seed prompt");
    expect(result.current.exists).toBe(false);
    expect(result.current.attribution.source).toBe("seed");

    act(() => result.current.setContent("Local edit"));
    usePromptMock.mockReturnValue(secondPrompt);
    rerender();

    expect(result.current.content).toBe("Local edit");

    act(() => result.current.reload());

    expect(result.current.content).toBe("Reloaded runtime prompt");
    expect(result.current.originalContent).toBe("Reloaded runtime prompt");
    expect(result.current.hasChanges).toBe(false);
  });

  it("saves dirty content and makes the saved content original", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    usePromptMock.mockReturnValue(createPrompt({ save }));

    const { result } = renderHook(() => usePromptWorkspaceDocument("section_summary"));

    act(() => result.current.setContent("Saved prompt"));

    await act(async () => {
      await result.current.save("EDITOR");
    });

    expect(save).toHaveBeenCalledWith("Saved prompt", "EDITOR");
    expect(result.current.saveStatus).toBe("saved");
    expect(result.current.originalContent).toBe("Saved prompt");
    expect(result.current.hasChanges).toBe(false);
  });

  it("keeps dirty content and surfaces the error when save fails", async () => {
    const save = vi.fn().mockRejectedValue(new Error("nope"));
    usePromptMock.mockReturnValue(createPrompt({ save }));

    const { result } = renderHook(() => usePromptWorkspaceDocument("section_summary"));

    act(() => result.current.setContent("Unsaved prompt"));

    let saveError: unknown;
    await act(async () => {
      try {
        await result.current.save("EDITOR");
      } catch (error) {
        saveError = error;
      }
    });

    expect(saveError).toBeInstanceOf(Error);
    expect((saveError as Error).message).toBe("nope");
    expect(result.current.content).toBe("Unsaved prompt");
    expect(result.current.originalContent).toBe("Runtime prompt");
    expect(result.current.saveStatus).toBe("error");
    expect(result.current.saveError).toBe("nope");
  });
});
