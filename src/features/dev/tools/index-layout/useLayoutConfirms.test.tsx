import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConfirmRequest } from "@/features/dev/components";
import { useLayoutConfirms } from "./useLayoutConfirms";
import type { ManualCategoryDefinition } from "./types";

const categories: ManualCategoryDefinition[] = [
  {
    key: "psychedelics",
    label: "Psychedelics",
    iconKey: "sparkle",
    notes: "",
    drugs: ["lsd"],
    sections: [
      { key: "tryptamines", label: "Tryptamines", drugs: ["dmt", "psilocybin", "lsd"] },
      { key: "empty", label: "", drugs: [] },
    ],
  },
];

const substanceOptions = [
  { slug: "lsd", name: "LSD", isHidden: false },
  { slug: "dmt", name: "DMT", isHidden: false },
];

function renderConfirms() {
  const confirm = vi.fn<(request: ConfirmRequest) => void>();
  const removeCategory = vi.fn();
  const removeSection = vi.fn();
  const resetDraft = vi.fn();
  const restoreSource = vi.fn();
  const hook = renderHook(() =>
    useLayoutConfirms({
      confirm,
      datasetLabel: "Psychoactive class",
      categories,
      substanceOptions,
      removeCategory,
      removeSection,
      resetDraft,
      restoreSource,
    }));
  const lastRequest = () => confirm.mock.calls[confirm.mock.calls.length - 1]?.[0];
  return { hook, confirm, removeCategory, removeSection, resetDraft, restoreSource, lastRequest };
}

describe("useLayoutConfirms", () => {
  it("asks before a category leaves the draft and lists what goes with it", () => {
    const { hook, removeCategory, lastRequest } = renderConfirms();

    act(() => hook.result.current.requestRemoveCategory(0));

    // Nothing leaves the draft until the editor confirms.
    expect(removeCategory).not.toHaveBeenCalled();
    const request = lastRequest();
    expect(request?.title).toBe("Remove Psychedelics?");
    expect(request?.destructive).toBe(true);
    expect(request?.description).toContain("2 sections and 3 substances leave the Psychoactive class draft");
    // Substances are named where the index knows them, deduped across sections, slug otherwise.
    expect(request?.affected).toEqual(["LSD", "DMT", "psilocybin"]);

    act(() => {
      void request?.onConfirm();
    });
    expect(removeCategory).toHaveBeenCalledWith(0);
  });

  it("asks before a section leaves its category", () => {
    const { hook, removeSection, lastRequest } = renderConfirms();

    act(() => hook.result.current.requestRemoveSection(0, 0));

    expect(removeSection).not.toHaveBeenCalled();
    const request = lastRequest();
    expect(request?.title).toBe("Remove Tryptamines?");
    expect(request?.description).toContain("3 substances leave Psychedelics");
    expect(request?.affected).toEqual(["DMT", "psilocybin", "LSD"]);

    act(() => {
      void request?.onConfirm();
    });
    expect(removeSection).toHaveBeenCalledWith(0, 0);
  });

  it("names unlabeled and empty sections plainly", () => {
    const { hook, lastRequest } = renderConfirms();

    act(() => hook.result.current.requestRemoveSection(0, 1));

    const request = lastRequest();
    expect(request?.title).toBe("Remove this section?");
    expect(request?.description).toContain("It holds no substances yet.");
    expect(request?.affected).toEqual([]);
  });

  it("ignores requests for rows that no longer exist", () => {
    const { hook, confirm } = renderConfirms();

    act(() => {
      hook.result.current.requestRemoveCategory(4);
      hook.result.current.requestRemoveSection(0, 9);
    });

    expect(confirm).not.toHaveBeenCalled();
  });

  it("routes the toolbar resets through the same dialog", () => {
    const { hook, resetDraft, restoreSource, lastRequest } = renderConfirms();

    act(() => hook.result.current.requestResetDraft());
    expect(resetDraft).not.toHaveBeenCalled();
    expect(lastRequest()?.confirmLabel).toBe("Discard changes");
    act(() => {
      void lastRequest()?.onConfirm();
    });
    expect(resetDraft).toHaveBeenCalledTimes(1);

    act(() => hook.result.current.requestRestoreSource());
    expect(restoreSource).not.toHaveBeenCalled();
    expect(lastRequest()?.confirmLabel).toBe("Restore source");
    act(() => {
      void lastRequest()?.onConfirm();
    });
    expect(restoreSource).toHaveBeenCalledTimes(1);
  });
});
