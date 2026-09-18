import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { useWritingWorkbenchController } from "./useWritingWorkbenchController";
import type { WritingArticleRow, WritingListEntry } from "./writingEditorModel";

const ENTRIES: WritingListEntry[] = [
  { slug: "field-notes", title: "Field notes", kind: "article", status: "published", creationTime: 1 },
  { slug: "launch-post", title: "Launch post", kind: "blog", status: "published", creationTime: 2 },
];

const ROWS: Record<string, WritingArticleRow> = {
  "field-notes": {
    slug: "field-notes",
    title: "Field notes",
    kind: "article",
    status: "published",
    bodyFormat: "markdown",
    body_raw: "Notes.",
    baseRevision: "a".repeat(64),
  },
  "launch-post": {
    slug: "launch-post",
    title: "Launch post",
    kind: "blog",
    status: "published",
    bodyFormat: "markdown",
    body_raw: "Post.",
    baseRevision: "b".repeat(64),
  },
};

type FetchMock = Mock<typeof fetch>;

function stubWritingApi(post: (body: Record<string, unknown>) => Response): FetchMock {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    if (init?.method === "POST") {
      return post(JSON.parse(String(init.body)));
    }
    const slug = new URL(String(input), "https://dose.wiki").searchParams.get("slug");
    if (slug) {
      return Response.json({ ok: true, article: ROWS[slug] ?? null });
    }
    return Response.json({ ok: true, articles: ENTRIES });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}


describe("useWritingWorkbenchController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("switches the rail filter to a loaded row's kind instead of relabelling the row", async () => {
    stubWritingApi(() => Response.json({ ok: true }));

    const { result } = renderHook(() =>
      useWritingWorkbenchController({ initialSelection: "launch-post" }),
    );

    await waitFor(() => expect(result.current.draft.title).toBe("Launch post"));

    expect(result.current.kind).toBe("blog");
    expect(result.current.kindEntries.map((entry) => entry.slug)).toEqual(["launch-post"]);
  });


  it("lists the kind the filter names and starts new rows under it", async () => {
    stubWritingApi(() => Response.json({ ok: true }));

    const { result } = renderHook(() => useWritingWorkbenchController({ pinnedEntryId: "about" }));
    await waitFor(() => expect(result.current.entries).not.toBeNull());
    expect(result.current.kind).toBe("article");
    expect(result.current.kindEntries.map((entry) => entry.slug)).toEqual(["field-notes"]);

    act(() => result.current.selectKind("blog"));
    expect(result.current.kind).toBe("blog");
    expect(result.current.kindEntries.map((entry) => entry.slug)).toEqual(["launch-post"]);
    // The pinned entry belongs to no kind; switching the filter leaves it open.
    expect(result.current.selection).toEqual({ type: "pinned" });

    act(() => result.current.startNew());
    act(() => result.current.updateTitle("Fresh"));
    expect(result.current.kind).toBe("blog");
    expect(result.current.selection).toEqual({ type: "new" });
    expect(result.current.draft.title).toBe("Fresh");
  });

  it("drops a loaded row of the other kind when the filter moves away from it", async () => {
    stubWritingApi(() => Response.json({ ok: true }));

    const { result } = renderHook(() =>
      useWritingWorkbenchController({ initialKind: "blog", initialSelection: "launch-post" }),
    );
    await waitFor(() => expect(result.current.draft.title).toBe("Launch post"));

    act(() => result.current.selectKind("blog"));
    expect(result.current.selection).toEqual({ type: "row", slug: "launch-post" });

    act(() => result.current.selectKind("article"));
    expect(result.current.selection).toEqual({ type: "new" });
    expect(result.current.draft.title).toBe("");
    expect(result.current.kind).toBe("article");
  });

  it("tracks dirtiness against the loaded row and clears it on save or on leaving for About", async () => {
    stubWritingApi(() => Response.json({ ok: true, slug: "launch-post", revision: "c".repeat(64) }));

    const { result } = renderHook(() =>
      useWritingWorkbenchController({ pinnedEntryId: "about", initialSelection: "launch-post" }),
    );
    await waitFor(() => expect(result.current.draft.title).toBe("Launch post"));
    expect(result.current.isDirty).toBe(false);

    act(() => result.current.updateDraft({ body: "Edited" }));
    expect(result.current.isDirty).toBe(true);

    act(() => result.current.setByline(["JOSIE"]));
    await act(async () => {
      await result.current.save("published");
    });
    expect(result.current.isDirty).toBe(false);
    expect(result.current.draft.authorProfileKeys).toEqual(["JOSIE"]);

    act(() => result.current.updateTitle("Renamed"));
    expect(result.current.isDirty).toBe(true);

    // About edits its own document; the writing draft behind it is dropped, not kept dirty.
    act(() => result.current.selectPinned());
    expect(result.current.isDirty).toBe(false);
    expect(result.current.draft.title).toBe("");
  });

  it("shows a rename collision as a save failure and keeps the row where it was", async () => {
    stubWritingApi(() =>
      Response.json(
        {
          error: '"field-notes" already belongs to "Field notes". Choose another slug.',
          code: "SLUG_TAKEN",
        },
        { status: 400 },
      ),
    );

    const { result } = renderHook(() =>
      useWritingWorkbenchController({ initialKind: "blog", initialSelection: "launch-post" }),
    );
    await waitFor(() => expect(result.current.draft.title).toBe("Launch post"));

    act(() => result.current.updateSlug("field-notes"));
    await act(async () => {
      await result.current.save("published");
    });

    expect(result.current.saveState).toBe("error");
    expect(result.current.isDirty).toBe(true);
    expect(result.current.draft.slug).toBe("field-notes");
    expect(result.current.selection).toEqual({ type: "row", slug: "launch-post" });
  });
});
