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
      return Response.json({ ok: true, playlists });
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
    await user.click(screen.getByRole("button", { name: "Create playlist" }));

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

  it("shows owners to an admin and assigns one through the owner route", async () => {
    const user = userEvent.setup();
    const { calls } = stubPlaylistsApi([mine, { ...theirs, editable: true }]);
    render(<PlaylistsTab isAdmin />);

    await screen.findByText("House opener");
    expect(rowFor("adas-list").getByText(/ada@example.com/)).toBeTruthy();
    expect(rowFor("house-opener").getByText(/unowned/)).toBeTruthy();

    await user.click(rowFor("house-opener").getByRole("button", { name: "Edit" }));
    await user.type(screen.getByLabelText("Owner"), "Bob@Example.com");
    await user.click(screen.getByRole("button", { name: "Assign owner" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      method: "POST",
      path: "/api/dev/replications/playlists/house-opener/owner",
      body: { ownerEmail: "bob@example.com" },
    });
    await screen.findByText('"House opener" now belongs to bob@example.com.');
  });

  it("surfaces a refusal from the route", async () => {
    const user = userEvent.setup();
    stubPlaylistsApi([mine]);
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementationOnce(async () => Response.json({ ok: true, playlists: [mine] }));
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
