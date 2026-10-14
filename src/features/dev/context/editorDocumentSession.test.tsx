import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { isSameDocument, useEditorDocument } from "./editorDocumentSession";

type TestDoc = {
  title: string;
  version: number;
};

describe("useEditorDocument", () => {
  it("tracks draft changes, reset, and mark-saved against the original source", () => {
    const { result, rerender } = renderHook(
      ({ source }: { source: TestDoc }) => useEditorDocument(source),
      { initialProps: { source: { title: "LSD", version: 1 } } },
    );

    expect(result.current.isDirty).toBe(false);
    expect(result.current.draft.title).toBe("LSD");

    act(() => {
      result.current.replaceDraft({ title: "Updated LSD", version: 1 });
    });

    expect(result.current.isDirty).toBe(true);
    expect(result.current.draft.title).toBe("Updated LSD");
    expect(result.current.getOriginal().title).toBe("LSD");

    act(() => {
      result.current.markSaved();
    });

    expect(result.current.isDirty).toBe(false);
    expect(result.current.getOriginal().title).toBe("Updated LSD");

    rerender({ source: { title: "Postgres LSD", version: 2 } });

    expect(result.current.isDirty).toBe(false);
    expect(result.current.draft.title).toBe("Postgres LSD");
    expect(result.current.sourceVersion).toBe(2);

    act(() => {
      result.current.replaceDraft({ title: "Local LSD", version: 2 });
      result.current.reset();
    });

    expect(result.current.isDirty).toBe(false);
    expect(result.current.draft.title).toBe("Postgres LSD");
  });

  it("preserves dirty drafts and exposes a conflict when the upstream source refreshes", () => {
    const { result, rerender } = renderHook(
      ({ source }: { source: TestDoc }) => useEditorDocument(source),
      { initialProps: { source: { title: "About", version: 1 } } },
    );

    act(() => {
      result.current.applyDraftTransform((previous) => ({
        ...previous,
        title: "Local About",
      }));
    });

    rerender({ source: { title: "Remote About", version: 2 } });

    expect(result.current.isDirty).toBe(true);
    expect(result.current.draft.title).toBe("Local About");
    expect(result.current.getOriginal().title).toBe("About");
    expect(result.current.refreshConflict).toEqual({
      previousOriginal: { title: "About", version: 1 },
      incomingSource: { title: "Remote About", version: 2 },
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.isDirty).toBe(false);
    expect(result.current.draft.title).toBe("Remote About");
    expect(result.current.refreshConflict).toBeNull();
  });
});

describe("isSameDocument", () => {
  it("short-circuits on shared references and compares structure otherwise", () => {
    const shared = { nested: { deep: [1, 2, 3] } };
    expect(isSameDocument(shared, shared)).toBe(true);
    expect(isSameDocument(shared, { nested: { deep: [1, 2, 3] } })).toBe(true);
    expect(isSameDocument(shared, { nested: { deep: [1, 2] } })).toBe(false);
    expect(isSameDocument({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(isSameDocument([1, 2], { 0: 1, 1: 2 })).toBe(false);
    expect(isSameDocument(null, {})).toBe(false);
    expect(isSameDocument("a", "a")).toBe(true);
  });

  it("treats undefined-valued keys as absent, matching the old JSON snapshots", () => {
    expect(isSameDocument({ title: "LSD", note: undefined }, { title: "LSD" })).toBe(true);
    expect(isSameDocument({ title: "LSD" }, { title: "LSD", note: undefined })).toBe(true);
    expect(isSameDocument({ title: "LSD", note: null }, { title: "LSD" })).toBe(false);
  });
});
