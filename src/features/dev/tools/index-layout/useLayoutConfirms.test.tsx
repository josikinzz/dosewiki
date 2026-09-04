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
  const revertDataset = vi.fn();
  const hook = renderHook(() =>
    useLayoutConfirms({
      confirm,
      datasetLabel: "Psychoactive class",
      categories,
      substanceOptions,
      removeCategory,
      removeSection,
      revertDataset,
    }));
  const lastRequest = () => confirm.mock.calls[confirm.mock.calls.length - 1]?.[0];
  return { hook, confirm, removeCategory, removeSection, revertDataset, lastRequest };
}

describe("useLayoutConfirms", () => {
  it("asks before a category leaves the draft and lists what goes with it", () => {
    const { hook, removeCategory, lastRequest } = renderConfirms();

    act(() => hook.result.current.requestRemoveCategory("psychedelics"));

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
    expect(removeCategory).toHaveBeenCalledWith("psychedelics");
  });

  it("asks before a section leaves its category and keeps its substances on the category list", () => {
    const { hook, removeSection, lastRequest } = renderConfirms();

    act(() => hook.result.current.requestRemoveSection("psychedelics", "tryptamines"));

    expect(removeSection).not.toHaveBeenCalled();
    const request = lastRequest();
    expect(request?.title).toBe("Remove Tryptamines?");
    expect(request?.description).toContain("3 substances move to the Psychedelics list");
    expect(request?.confirmLabel).toBe("Remove section, keep substances");
    expect(request?.affected).toEqual(["DMT", "psilocybin", "LSD"]);

    act(() => {
      void request?.onConfirm();
    });
    expect(removeSection).toHaveBeenCalledWith("psychedelics", "tryptamines", true);
  });

  it("names unlabeled and empty sections plainly", () => {
    const { hook, removeSection, lastRequest } = renderConfirms();

    act(() => hook.result.current.requestRemoveSection("psychedelics", "empty"));

    const request = lastRequest();
    expect(request?.title).toBe("Remove this section?");
    expect(request?.description).toContain("It holds no substances yet.");
    expect(request?.affected).toBeUndefined();
    act(() => {
      void request?.onConfirm();
    });
    expect(removeSection).toHaveBeenCalledWith("psychedelics", "empty", false);
  });

  it("ignores requests for rows that no longer exist", () => {
    const { hook, confirm } = renderConfirms();

    act(() => {
      hook.result.current.requestRemoveCategory("nope");
      hook.result.current.requestRemoveSection("psychedelics", "nope");
    });

    expect(confirm).not.toHaveBeenCalled();
  });

  it("routes the toolbar revert through the same dialog", () => {
    const { hook, revertDataset, lastRequest } = renderConfirms();

    act(() => hook.result.current.requestRevertDataset());
    expect(revertDataset).not.toHaveBeenCalled();
    expect(lastRequest()?.title).toBe("Revert the Psychoactive class layout?");
    expect(lastRequest()?.confirmLabel).toBe("Revert layout");

    act(() => {
      void lastRequest()?.onConfirm();
    });
    expect(revertDataset).toHaveBeenCalledTimes(1);
  });
});
