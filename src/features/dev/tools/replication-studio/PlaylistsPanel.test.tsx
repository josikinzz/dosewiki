import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  KeyboardSensor: function KeyboardSensor() {},
  PointerSensor: function PointerSensor() {},
  TouchSensor: function TouchSensor() {},
  closestCenter: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => [{}]),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  arrayMove: <T,>(items: T[], from: number, to: number) => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  },
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: {},
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

import { PlaylistsPanel } from "./PlaylistsPanel";
import { usePlaylistsController } from "./usePlaylistsController";
import type { ReplicationPlaylist } from "./replicationPlaylistModel";
import type { StudioRow } from "./replicationStudioModel";

function row(index: number): StudioRow {
  return {
    id: `row-${index}`,
    slug: `work-${index}`,
    title: `Work ${index}`,
    artist: `Artist ${index}`,
    artist_url: null,
    role: "replication",
    type: "image",
    effect_slug: "geometry",
    effect_name: "Geometry",
    effect_tags: [],
    credit_line: null,
    url: `https://example.invalid/work-${index}.jpg`,
    thumbnail_url: `https://example.invalid/work-${index}-thumb.jpg`,
    format: "jpg",
    duration: null,
    file_size: 1000,
    created_at: "2026-08-01T00:00:00.000Z",
  };
}

const PLAYLISTS: ReplicationPlaylist[] = [
  {
    key: "alpha",
    title: "Alpha",
    replication_slugs: ["work-0", "work-1"],
    updated_at: "2026-08-01T00:00:00.000Z",
    updated_by: "editor@example.com",
    owner_email: "editor@example.com",
    editable: true,
  },
  {
    key: "beta",
    title: "Beta",
    replication_slugs: ["work-2"],
    updated_at: "2026-08-02T00:00:00.000Z",
    updated_by: "editor@example.com",
    owner_email: "editor@example.com",
    editable: true,
  },
];

function stubPlaylistFetch(playlists: ReplicationPlaylist[] = PLAYLISTS) {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      if (method === "DELETE") return Response.json({ ok: true });
      const keyed = playlists.find((playlist) => url.endsWith(`/${playlist.key}`));
      if (keyed) return Response.json({ playlist: keyed });
      return Response.json({
        playlists: playlists.map(({ replication_slugs, ...playlist }) => ({
          ...playlist,
          work_count: replication_slugs.length,
        })),
      });
    }),
  );
  return calls;
}

function renderPanel({
  allRows = Array.from({ length: 32 }, (_, index) => row(index)),
  filteredRows = allRows,
}: {
  allRows?: StudioRow[];
  filteredRows?: StudioRow[];
} = {}) {
  return render(
    <PlaylistsPanel
      allRows={allRows}
      filteredRows={filteredRows}
      renderSavedPlaylistAction={(playlist) => <button type="button">Apply {playlist.title}</button>}
    />,
  );
}

describe("PlaylistsPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses media thumbnails for selected members and filtered add candidates", async () => {
    stubPlaylistFetch();
    const user = userEvent.setup();
    renderPanel();

    await user.click((await screen.findAllByRole("button", { name: "Edit" }))[0]);

    expect(screen.getByAltText("Work 0")).toHaveAttribute(
      "src",
      "https://example.invalid/work-0-thumb.jpg",
    );
    expect(screen.getByAltText("Work 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Work 2 to playlist" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add Work 2 to playlist" }));
    expect(screen.getByRole("button", { name: "Remove Work 2 from playlist" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Move Work 1 up" }));
    expect(
      within(screen.getByRole("region", { name: "In playlist" }))
        .getAllByText(/^Work [01]$/)
        .map((element) => element.textContent),
    ).toEqual(["Work 1", "Work 0"]);
    await user.click(screen.getByRole("button", { name: "Remove Work 1 from playlist" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Drag Work 0" })).toHaveFocus(),
    );
  });
  it("mounts candidates in bounded batches and reveals the next batch explicitly", async () => {
    stubPlaylistFetch([]);
    const user = userEvent.setup();
    renderPanel({ allRows: Array.from({ length: 30 }, (_, index) => row(index)) });

    await user.click(await screen.findByRole("button", { name: "New playlist" }));

    expect(screen.getByText("30 available · 30 filter matches · 30 total")).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(24);
    expect(screen.queryByText("Work 25")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show 6 more" }));
    expect(screen.getByText("Work 25")).toBeInTheDocument();
  });

  it("keeps selected members visible when the current filter hides them", async () => {
    stubPlaylistFetch();
    const user = userEvent.setup();
    const allRows = [row(0), row(1), row(2)];
    renderPanel({ allRows, filteredRows: [row(2)] });

    await user.click((await screen.findAllByRole("button", { name: "Edit" }))[0]);

    expect(screen.getByText("Work 0")).toBeInTheDocument();
    expect(screen.getByText(/2 selected works are hidden by current filter/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Work 0 to playlist" })).not.toBeInTheDocument();
  });

  it("guards Close, New playlist, and opening another playlist when the draft is dirty", async () => {
    stubPlaylistFetch();
    const user = userEvent.setup();
    renderPanel({ allRows: [row(0), row(1), row(2)] });

    const editButtons = await screen.findAllByRole("button", { name: "Edit" });
    await user.click(editButtons[0]);
    await user.type(screen.getByLabelText("Playlist name"), " changed");

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(await screen.findByText("Discard the unsaved playlist?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Playlist name")).toHaveValue("Alpha changed");

    await user.click(editButtons[1]);
    expect(await screen.findByText("Discard the unsaved playlist?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Playlist name")).toHaveValue("Alpha changed");

    await user.click(screen.getByRole("button", { name: "New playlist" }));
    await user.click(await screen.findByRole("button", { name: "Discard changes" }));
    expect(screen.getByLabelText("Playlist name")).toHaveValue("");
  });

  it("requires confirmation before delete and disables the row while deletion is pending", async () => {
    let resolveDelete: ((response: Response) => void) | undefined;
    const deleteResponse = new Promise<Response>((resolve) => {
      resolveDelete = resolve;
    });
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        calls.push(method);
        if (method === "DELETE") return deleteResponse;
        return Response.json({ playlists: PLAYLISTS.map(({ replication_slugs, ...playlist }) => ({ ...playlist, work_count: replication_slugs.length })) });
      }),
    );
    const user = userEvent.setup();
    renderPanel({ allRows: [row(0), row(1), row(2)] });

    await user.click(await screen.findByRole("button", { name: "Delete Alpha" }));
    expect(calls).not.toContain("DELETE");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/permanently deletes the saved playlist/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Delete playlist" }));

    expect(calls.filter((method) => method === "DELETE")).toHaveLength(1);
    expect(await screen.findByRole("button", { name: "Deleting Alpha" })).toBeDisabled();

    await act(async () => {
      resolveDelete?.(Response.json({ ok: true }));
    });
    await waitFor(() => expect(screen.queryByText("Alpha")).not.toBeInTheDocument());
  });

  it("locks every playlist edit while a deferred save is in flight", async () => {
    let resolveSave: ((response: Response) => void) | undefined;
    const saveResponse = new Promise<Response>((resolve) => {
      resolveSave = resolve;
    });
    const calls: { method: string; body?: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        calls.push({ method, body: typeof init?.body === "string" ? init.body : undefined });
        if (method === "POST") return saveResponse;
        if (method === "DELETE") return Response.json({ ok: true });
        const url = String(input);
        const keyed = PLAYLISTS.find((playlist) => url.endsWith(`/${playlist.key}`));
        if (keyed) return Response.json({ playlist: keyed });
        return Response.json({ playlists: PLAYLISTS.map(({ replication_slugs, ...playlist }) => ({ ...playlist, work_count: replication_slugs.length })) });
      }),
    );
    const user = userEvent.setup();
    renderPanel({ allRows: [row(0), row(1), row(2)] });

    await user.click((await screen.findAllByRole("button", { name: "Edit" }))[0]);
    const title = screen.getByLabelText("Playlist name");
    await user.type(title, " changed");
    await user.click(screen.getByRole("button", { name: "Save playlist" }));

    await waitFor(() => expect(calls.filter(({ method }) => method === "POST")).toHaveLength(1));
    expect(title).toBeDisabled();
    expect(screen.getByRole("button", { name: "New playlist" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reload" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    expect(
      screen.getAllByRole("button", { name: "Edit" }).every((button) => button.hasAttribute("disabled")),
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Delete Alpha" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add Work 2 to playlist" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Drag Work 0" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Work 1 up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Work 0 from playlist" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Discard changes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear playlist" })).toBeDisabled();

    await user.type(title, " later");
    await user.click(screen.getByRole("button", { name: "Add Work 2 to playlist" }));
    expect(title).toHaveValue("Alpha changed");
    expect(screen.queryByRole("button", { name: "Remove Work 2 from playlist" })).not.toBeInTheDocument();
    expect(calls.some(({ method }) => method === "DELETE")).toBe(false);

    const submitted = JSON.parse(
      calls.find(({ method }) => method === "POST")?.body ?? "null",
    ) as { title: string; slugs: string[] };
    expect(submitted).toMatchObject({ title: "Alpha changed", slugs: ["work-0", "work-1"] });

    await act(async () => {
      resolveSave?.(
        Response.json({
          playlist: {
            ...PLAYLISTS[0],
            title: submitted.title,
            replication_slugs: submitted.slugs,
            updated_at: "2026-08-23T00:00:00.000Z",
            pruned: [],
          },
        }),
      );
      await saveResponse;
    });

    await waitFor(() => expect(title).toBeEnabled());
    expect(title).toHaveValue("Alpha changed");
    expect(screen.getByRole("button", { name: "Add Work 2 to playlist" })).toBeEnabled();
  });

  it("guards controller draft callbacks during a deferred save", async () => {
    let resolveSave: ((response: Response) => void) | undefined;
    const saveResponse = new Promise<Response>((resolve) => {
      resolveSave = resolve;
    });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "POST") return saveResponse;
      if (method === "DELETE") return Response.json({ ok: true });
      const url = String(_input);
      const keyed = PLAYLISTS.find((playlist) => url.endsWith(`/${playlist.key}`));
      if (keyed) return Response.json({ playlist: keyed });
      return Response.json({ playlists: PLAYLISTS.map(({ replication_slugs, ...playlist }) => ({ ...playlist, work_count: replication_slugs.length })) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => usePlaylistsController());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.openPlaylist(result.current.playlists[0]));
    await waitFor(() => expect(result.current.draft?.key).toBe("alpha"));
    act(() => result.current.setDraftTitle("Alpha changed"));
    act(() => result.current.startNewPlaylist());
    expect(result.current.pendingTransition).not.toBeNull();

    let pendingSave!: Promise<void>;
    act(() => {
      pendingSave = result.current.save();
    });
    expect(result.current.isSaving).toBe(true);

    act(() => {
      result.current.setDraftTitle("Later edit");
      result.current.setDraftSlugs(["work-2"]);
      result.current.resetDraft();
      result.current.closeDraft();
      result.current.openPlaylist(result.current.playlists[1]);
      result.current.startNewPlaylist();
      result.current.discardPendingTransition();
      void result.current.remove(result.current.playlists[0]);
    });

    expect(result.current.draft).toMatchObject({
      key: "alpha",
      title: "Alpha changed",
      slugs: ["work-0", "work-1"],
    });
    expect(result.current.pendingTransition).not.toBeNull();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(0);

    await act(async () => {
      resolveSave?.(
        Response.json({
          playlist: {
            ...PLAYLISTS[0],
            title: "Alpha changed",
            updated_at: "2026-08-23T00:00:00.000Z",
            pruned: [],
          },
        }),
      );
      await pendingSave;
    });

    expect(result.current.isSaving).toBe(false);
    expect(result.current.draft).toMatchObject({
      key: "alpha",
      title: "Alpha changed",
      slugs: ["work-0", "work-1"],
    });
  });
});
