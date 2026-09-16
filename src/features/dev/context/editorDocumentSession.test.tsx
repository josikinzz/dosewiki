import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { isSameDocument, useEditorDocument } from "./editorDocumentSession";

type TestDoc = {
  title: string;
  version: number;
};

type CorpusDoc = { slug: string; body: string }[];

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

  it("shares structure with the source instead of copying the whole document", () => {
    const source: CorpusDoc = [
      { slug: "lsd", body: "one" },
      { slug: "dmt", body: "two" },
    ];

    const { result } = renderHook(() => useEditorDocument(source));

    // No copy on arrival: the session hands back the very array it was given.
    expect(result.current.draft).toBe(source);
    expect(result.current.original).toBe(source);
    expect(result.current.getOriginal()).toBe(source);

    act(() => {
      result.current.applyDraftTransform((previous) =>
        previous.map((entry, index) =>
          index === 0 ? { ...entry, body: "edited" } : entry,
        ),
      );
    });

    // Only the edited entry is a new object; the untouched one is still shared,
    // and neither the baseline nor the upstream source saw the edit.
    expect(result.current.draft[0].body).toBe("edited");
    expect(result.current.draft[1]).toBe(source[1]);
    expect(result.current.original).toBe(source);
    expect(source[0].body).toBe("one");
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.draft).toBe(source);
  });

  it("ignores a structurally identical source object rebuilt on every render", () => {
    // Mirrors useAboutEditorController, which derives a brand-new document object on
    // each render. A rebuilt-but-equal source must not count as a refresh.
    const { result, rerender } = renderHook(() =>
      useEditorDocument({ title: "About", version: 1 }),
    );

    const initialDraft = result.current.draft;

    rerender();
    rerender();

    expect(result.current.sourceVersion).toBe(1);
    expect(result.current.draft).toBe(initialDraft);
    expect(result.current.isDirty).toBe(false);
  });

  it("does not re-render when a transform returns the draft unchanged", () => {
    const { result } = renderHook(() =>
      useEditorDocument<TestDoc>({ title: "LSD", version: 1 }),
    );

    const draftBefore = result.current.draft;

    act(() => {
      result.current.applyDraftTransform((previous) => previous);
    });

    expect(result.current.draft).toBe(draftBefore);
    expect(result.current.isDirty).toBe(false);
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
