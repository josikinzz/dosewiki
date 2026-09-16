import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlaylistsTab } from "./PlaylistsTab";
import { isDraftDirty, moveSlug, type OwnedPlaylist } from "./playlistsModel";

const mine: OwnedPlaylist = {
  key: "adas-list",
  title: "Ada's list",
  replication_slugs: ["alpha", "beta"],
  updated_at: "2026-02-01T00:00:00.000Z",
  updated_by: "ada@example.com",
  owner_email: "ada@example.com",
  editable: true,
};

const theirs: OwnedPlaylist = {
  key: "house-opener",
  title: "House opener",
  replication_slugs: ["gamma"],
  updated_at: "2026-02-02T00:00:00.000Z",
  updated_by: "admin@example.com",
  owner_email: null,
  editable: false,
};

type Call = { method: string; path: string; body: Record<string, unknown> | null };

/** Serves the list and records every write; the list is re-served after each. */
function stubPlaylistsApi(playlists: OwnedPlaylist[]) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "https://dev.dose.wiki").pathname;
    const method = init?.method ?? "GET";
    if (method === "GET") {
      const keyed = playlists.find((playlist) => path.endsWith(`/${playlist.key}`));
      if (keyed) return Response.json({ ok: true, playlist: keyed });
      return Response.json({
        ok: true,
        playlists: playlists.map(({ replication_slugs, ...playlist }) => ({
          ...playlist,
          work_count: replication_slugs.length,
        })),
      });
    }
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    calls.push({ method, path, body });
    if (method === "POST" && path === "/api/dev/replications/playlists") {
      return Response.json({
        ok: true,
        playlist: {
          ...mine,
          key: body?.key,
          title: body?.title,
          replication_slugs: body?.slugs,
          pruned: [],
          updated_at: "2026-03-01T00:00:00.000Z",
        },
      });
    }
    if (method === "POST" && path.endsWith("/owner")) {
      const parts = path.split("/");
      const key = parts[parts.length - 2];
      return Response.json({
        ok: true,
        key,
        owner_email: body?.ownerEmail ?? null,
        updated_at: "2026-03-01T00:00:00.000Z",
        updated_by: "admin@example.com",
      });
    }
    return Response.json({ ok: true });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

const rowFor = (key: string) => {
  const row = document.querySelector(`li[data-playlist="${key}"]`);
  if (!(row instanceof HTMLLIElement)) {
    throw new Error(`no row for ${key}`);
  }
  return within(row);
};

describe("playlistsModel", () => {
  it("moves a slug one step and leaves the edges alone", () => {
    expect(moveSlug(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveSlug(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveSlug(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });

  it("treats a reorder as a change and an untouched draft as clean", () => {
    const draft = { key: mine.key, title: mine.title, slugs: ["alpha", "beta"], expectedUpdatedAt: mine.updated_at, ownerEmail: "" };
    expect(isDraftDirty(draft, mine)).toBe(false);
    expect(isDraftDirty({ ...draft, slugs: ["beta", "alpha"] }, mine)).toBe(true);
    expect(isDraftDirty({ ...draft, expectedUpdatedAt: null, title: "", slugs: [] }, null)).toBe(false);
    expect(isDraftDirty({ ...draft, expectedUpdatedAt: null, title: "", slugs: [], ownerEmail: "bob@example.com" }, null)).toBe(true);
  });
});

describe("PlaylistsTab", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists playlists with edit controls only on rows the member may change", async () => {
    stubPlaylistsApi([mine, theirs]);
    render(<PlaylistsTab isAdmin={false} />);

    await screen.findByText("Ada's list");
    const own = rowFor("adas-list");
    expect(own.getByRole("button", { name: "Edit" })).toBeEnabled();
    expect(own.getByRole("button", { name: "Remove Ada's list" })).toBeEnabled();
    expect(own.getByText(/2 works/)).toBeTruthy();

    const other = rowFor("house-opener");
    expect(other.getByText("Read only")).toBeTruthy();
    expect(other.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/unowned/)).toBeNull();
  });

  it("creates a playlist from a title, minting the key, and posts the added works in order", async () => {
    const user = userEvent.setup();
    const { calls } = stubPlaylistsApi([]);
    render(<PlaylistsTab isAdmin={false} />);

    await screen.findByText("No playlists yet");
    await user.click(screen.getByRole("button", { name: "New playlist" }));

    await user.type(screen.getByLabelText(/Name/), "Ada's Opener");
    expect(screen.getByLabelText("Key")).toHaveValue("ada-s-opener");

    const slugInput = screen.getByLabelText("Add a work");
    await user.type(slugInput, "beta{Enter}");
    await user.type(slugInput, "alpha{Enter}");
    await user.type(slugInput, "Not A Slug{Enter}");
    expect(screen.getByText("A replication slug is lowercase words joined by hyphens.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Move alpha up" }));
    await user.click(screen.getByRole("button", { name: "Review playlist changes" }));
    expect(calls).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Confirm playlist publication" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      method: "POST",
      path: "/api/dev/replications/playlists",
      body: { key: "ada-s-opener", title: "Ada's Opener", slugs: ["alpha", "beta"], expectedUpdatedAt: null },
    });
    await screen.findByText('Created "Ada\'s Opener".');
  });

  it("deletes after confirming", async () => {
    const user = userEvent.setup();
    const { calls } = stubPlaylistsApi([mine]);
    render(<PlaylistsTab isAdmin={false} />);

    await screen.findByText("Ada's list");
    await user.click(screen.getByRole("button", { name: "Remove Ada's list" }));
    await user.click(await screen.findByRole("button", { name: "Remove playlist" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: "DELETE", path: "/api/dev/replications/playlists/adas-list" });
    await screen.findByText('Removed "Ada\'s list".');
  });

  it("shows owners to an admin and reassigns one through the owner route after confirming", async () => {
    const user = userEvent.setup();
    const { calls } = stubPlaylistsApi([mine, { ...theirs, editable: true }]);
    render(<PlaylistsTab isAdmin />);

    await screen.findByText("House opener");
    expect(rowFor("adas-list").getByText(/ada@example.com/)).toBeTruthy();
    expect(rowFor("house-opener").getByText(/unowned/)).toBeTruthy();

    await user.click(rowFor("house-opener").getByRole("button", { name: "Edit" }));
    const ownership = within(screen.getByRole("region", { name: "Ownership" }));
    const assign = ownership.getByRole("button", { name: "Assign owner" });
    expect(assign).toBeDisabled();
    await user.type(ownership.getByLabelText("Owner"), "Bob@Example.com");
    await user.click(assign);

    // Nothing is written until the dialog naming the member is confirmed.
    expect(calls).toHaveLength(0);
    await screen.findByText('Hand "House opener" to bob@example.com?');
    await user.click(screen.getByRole("button", { name: "Assign to bob@example.com" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      method: "POST",
      path: "/api/dev/replications/playlists/house-opener/owner",
      body: { ownerEmail: "bob@example.com" },
    });
    await screen.findByText('"House opener" now belongs to bob@example.com.');
  });

  it("asks before dropping unsaved changes and keeps the draft on Keep editing", async () => {
    const user = userEvent.setup();
    stubPlaylistsApi([mine]);
    render(<PlaylistsTab isAdmin={false} />);

    await screen.findByText("Ada's list");
    await user.click(rowFor("adas-list").getByRole("button", { name: "Edit" }));
    await user.type(screen.getByLabelText(/Name/), " extended");
    expect(screen.getByText("Unsaved")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Discard" }));
    await user.click(await screen.findByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText(/Name/)).toHaveValue("Ada's list extended");

    await user.click(screen.getByRole("button", { name: "Discard" }));
    await user.click(await screen.findByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.queryByLabelText(/Name/)).toBeNull());
    expect(window.location.pathname).toBe("/dev/playlists");
  });

  it("folds a long list behind Show all and unfolds it when a work lands in the hidden tail", async () => {
    const user = userEvent.setup();
    const slugs = Array.from({ length: 25 }, (_, index) => `work-${String(index + 1).padStart(2, "0")}`);
    stubPlaylistsApi([{ ...mine, replication_slugs: slugs }]);
    render(<PlaylistsTab isAdmin={false} />);

    await screen.findByText("Ada's list");
    await user.click(rowFor("adas-list").getByRole("button", { name: "Edit" }));
    expect(window.location.pathname).toBe("/dev/playlists/adas-list");

    const order = () => within(screen.getByRole("list", { name: "Playlist order" })).getAllByRole("listitem");
    expect(order()).toHaveLength(20);
    expect(screen.getByText("Works, in order (25)")).toBeTruthy();

    const toggle = screen.getByRole("button", { name: "Show all 25 works" });
    expect(toggle).toHaveTextContent("+5");
    await user.click(toggle);
    expect(order()).toHaveLength(25);
    await user.click(screen.getByRole("button", { name: "Show only the first 20 works" }));
    expect(order()).toHaveLength(20);

    await user.type(screen.getByLabelText("Add a work"), "work-26{Enter}");
    expect(order()).toHaveLength(26);
    expect(order()[25]).toHaveTextContent("work-26");
  });

  it("surfaces a refusal from the route", async () => {
    const user = userEvent.setup();
    stubPlaylistsApi([mine]);
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementationOnce(async () => {
      const { replication_slugs, ...summary } = mine;
      return Response.json({ ok: true, playlists: [{ ...summary, work_count: replication_slugs.length }] });
    });
    fetchMock.mockImplementationOnce(async () =>
      Response.json({ error: "\"Ada's list\" belongs to ada@example.com; only its owner or an admin may change it.", code: "NOT_OWNER" }, { status: 403 }),
    );
    render(<PlaylistsTab isAdmin={false} />);

    await screen.findByText("Ada's list");
    await user.click(screen.getByRole("button", { name: "Remove Ada's list" }));
    await user.click(await screen.findByRole("button", { name: "Remove playlist" }));

    await screen.findByText(/only its owner or an admin may change it/);
  });
});
