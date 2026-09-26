import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("../../pages/useDevRailBadges", () => ({ useDevRailBadges: () => ({}), useDevRailBadgeReadings: () => ({}) }));

import {
  expectRailMarksUnsaved,
  renderInDevShell,
  switchTabExpectingGuard,
} from "../../pages/devShellTestHarness";
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

// cmdk scrolls the active option into view; jsdom has no scrollIntoView.
beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

const titleOf = (slug: string) => slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");

/** The published works the candidates read knows; anything else is not a work a playlist can hold. */
const CORPUS = new Set([
  "alpha",
  "beta",
  "gamma",
  ...Array.from({ length: 26 }, (_, index) => `work-${String(index + 1).padStart(2, "0")}`),
]);

const cardFor = (slug: string) => ({
  slug,
  title: titleOf(slug),
  artist: "Ada",
  type: "image",
  thumbnail_url: `https://media.test/${slug}.jpg`,
  url: null,
  duration: null,
});

const ROSTER = [
  { email: "ada@example.com", username: "ada", role: "contributor" },
  { email: "bob@example.com", username: "bob", role: "contributor" },
  { email: "eve@example.com", username: "eve", role: "contributor", bannedAt: "2026-01-01T00:00:00.000Z" },
];

/** Serves the list and records every write; the list is re-served after each. */
function stubPlaylistsApi(playlists: OwnedPlaylist[]) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "https://dev.dose.wiki");
    const path = url.pathname;
    const method = init?.method ?? "GET";
    if (method === "GET" && path === "/api/dev/replications/playlist-candidates") {
      const slugs = url.searchParams.get("slugs");
      if (slugs !== null) {
        return Response.json({ ok: true, candidates: slugs.split(",").filter((slug) => CORPUS.has(slug)).map(cardFor) });
      }
      const words = (url.searchParams.get("q") ?? "").toLowerCase();
      return Response.json({ ok: true, candidates: [...CORPUS].filter((slug) => slug.includes(words)).map(cardFor) });
    }
    if (method === "GET" && path === "/api/dev/members") {
      return Response.json({ ok: true, self: "admin@example.com", members: ROSTER });
    }
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
          replication_slugs: (body?.slugs as string[]).filter((slug) => CORPUS.has(slug)),
          pruned: (body?.slugs as string[]).filter((slug) => !CORPUS.has(slug)),
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

/** Opens a playlist from its list row. */
async function openRow(user: ReturnType<typeof userEvent.setup>, key: string) {
  await user.click(rowFor(key).getByRole("button"));
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
    window.history.replaceState(null, "", "/");
  });

  it("lists every playlist, opens the member's own to edit and another's read only", async () => {
    const user = userEvent.setup();
    stubPlaylistsApi([mine, theirs]);
    render(<PlaylistsTab isAdmin={false} />);

    await screen.findByText("Ada's list");
    expect(rowFor("adas-list").getByText(/2 works/)).toBeTruthy();
    expect(rowFor("house-opener").getByText("Read only")).toBeTruthy();
    // Owners are an admin's business.
    expect(screen.queryByText(/unowned/i)).toBeNull();

    await openRow(user, "house-opener");
    const pane = await screen.findByTestId("playlist-pane");
    expect(within(pane).getByText(/Read only/)).toBeTruthy();
    expect(within(pane).queryByLabelText(/Name/)).toBeNull();
    expect(within(pane).queryByRole("button", { name: /Move .* up/ })).toBeNull();
    expect(within(pane).queryByRole("contentinfo", { name: "Save" })).toBeNull();

    // A read-only playlist can seed a new one of the member's own.
    await user.click(within(pane).getByRole("button", { name: "Copy into a new playlist" }));
    expect(await screen.findByLabelText(/Name/)).toHaveValue("House opener (copy)");
    expect(screen.getByText("house-opener-copy")).toBeTruthy();
  });

  it("creates a playlist from a title, minting the key, and posts the added works in order", async () => {
    const user = userEvent.setup();
    const { calls } = stubPlaylistsApi([]);
    render(<PlaylistsTab isAdmin={false} />);

    await screen.findByText("No playlists yet");
    await user.click(screen.getByRole("button", { name: "New playlist" }));

    await user.type(screen.getByLabelText(/Name/), "Ada's Opener");
    expect(screen.getByText("ada-s-opener")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Paste a slug instead" }));
    const slugInput = screen.getByLabelText("Add a work");
    await user.type(slugInput, "beta{Enter}");
    await screen.findByRole("button", { name: "Move Beta up" });
    await user.type(slugInput, "alpha{Enter}");
    await screen.findByRole("button", { name: "Move Alpha up" });

    await user.click(screen.getByRole("button", { name: "Move Alpha up" }));
    await user.click(screen.getByRole("button", { name: "Create playlist" }));
    expect(calls).toEqual([]);
    const dialog = await screen.findByRole("dialog", { name: 'Create "Ada\'s Opener"?' });
    expect(dialog).toHaveTextContent('Creates "Ada\'s Opener" with 2 works.');
    expect(dialog).toHaveTextContent("In order: Alpha, Beta.");
    await user.click(within(dialog).getByRole("button", { name: "Create playlist" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      method: "POST",
      path: "/api/dev/replications/playlists",
      body: { key: "ada-s-opener", title: "Ada's Opener", slugs: ["alpha", "beta"], expectedUpdatedAt: null },
    });
    await screen.findByText('Created "Ada\'s Opener".');
  });

  it("refuses a malformed or unknown slug the moment it is added", async () => {
    const user = userEvent.setup();
    stubPlaylistsApi([]);
    render(<PlaylistsTab isAdmin={false} />);
    await screen.findByText("No playlists yet");
    await user.click(screen.getByRole("button", { name: "New playlist" }));
    await user.click(screen.getByRole("button", { name: "Paste a slug instead" }));

    const slugInput = screen.getByLabelText("Add a work");
    await user.type(slugInput, "Not A Slug{Enter}");
    expect(screen.getByText("A replication slug is lowercase words joined by hyphens.")).toBeTruthy();

    await user.clear(slugInput);
    await user.type(slugInput, "missing-work{Enter}");
    expect(await screen.findByText(/No published work a playlist can hold has the slug "missing-work"/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Playlist order" })).toBeNull();
    expect(slugInput).toHaveValue("missing-work");
  });

  it("finds works by thumbnail and title and adds one with a click", async () => {
    const user = userEvent.setup();
    stubPlaylistsApi([mine]);
    render(<PlaylistsTab isAdmin={false} />);
    await screen.findByText("Ada's list");
    await openRow(user, "adas-list");

    // Saved entries read as titles, not slugs.
    await screen.findByRole("button", { name: "Move Alpha down" });

    await user.type(screen.getByLabelText("Search works"), "gam");
    const results = await screen.findByRole("list", { name: "Search results" });
    await user.click(within(results).getByRole("button", { name: "Add Gamma" }));

    const order = within(screen.getByRole("list", { name: "Playlist order" })).getAllByRole("listitem");
    expect(order.map((item) => item.getAttribute("data-playlist-entry"))).toEqual(["alpha", "beta", "gamma"]);
    expect(order[2]).toHaveTextContent("Gamma");
    expect(screen.getByText(/Added Gamma\. 3 works now\./)).toBeTruthy();
  });

  it("moves a work to the top from its row menu and announces it", async () => {
    const user = userEvent.setup();
    stubPlaylistsApi([{ ...mine, replication_slugs: ["alpha", "beta", "gamma"] }]);
    render(<PlaylistsTab isAdmin={false} />);
    await screen.findByText("Ada's list");
    await openRow(user, "adas-list");
    await user.click(await screen.findByRole("button", { name: "More for Gamma" }));
    await user.click(await screen.findByRole("menuitem", { name: "Move to the top" }));

    const order = within(screen.getByRole("list", { name: "Playlist order" })).getAllByRole("listitem");
    expect(order.map((item) => item.getAttribute("data-playlist-entry"))).toEqual(["gamma", "alpha", "beta"]);
    expect(screen.getByText("Moved Gamma to position 1 of 3.")).toBeTruthy();
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  });

  it("flags an entry a save would leave out, lists it in a readable confirm, and names it after saving", async () => {
    const user = userEvent.setup();
    const { calls } = stubPlaylistsApi([{ ...mine, replication_slugs: ["alpha", "retired-work"] }]);
    render(<PlaylistsTab isAdmin={false} />);
    await screen.findByText("Ada's list");
    await openRow(user, "adas-list");

    expect(await screen.findByText(/1 entry is not a published work a playlist can hold/)).toBeTruthy();
    await user.type(screen.getByLabelText(/Name/), " two");
    await user.click(screen.getByRole("button", { name: "Save playlist" }));

    const dialog = await screen.findByRole("dialog", { name: 'Save "Ada\'s list two"?' });
    expect(dialog).toHaveTextContent("You changed the name.");
    expect(dialog).toHaveTextContent('Renames "Ada\'s list" to "Ada\'s list two".');
    expect(dialog).toHaveTextContent("Left out because they are not published works a playlist can hold: retired-work.");
    // A readable summary, never a JSON dump.
    expect(dialog.textContent).not.toMatch(/[{}[\]]|"works"/);
    await user.click(within(dialog).getByRole("button", { name: "Save playlist" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(
      await screen.findByText(/Left out 1 entry that is not a published work a playlist can hold: retired-work\./),
    ).toBeTruthy();
  });

  it("offers the latest version after a conflict, behind a confirm that drops the edits", async () => {
    const user = userEvent.setup();
    const { fetchMock } = stubPlaylistsApi([mine]);
    render(<PlaylistsTab isAdmin={false} />);
    await screen.findByText("Ada's list");
    await openRow(user, "adas-list");
    await screen.findByRole("button", { name: "Move Alpha down" });
    await user.type(screen.getByLabelText(/Name/), " two");
    await user.click(screen.getByRole("button", { name: "Save playlist" }));
    const dialog = await screen.findByRole("dialog");
    fetchMock.mockImplementationOnce(async () => Response.json({ ok: false, conflict: {} }, { status: 409 }));
    await user.click(within(dialog).getByRole("button", { name: "Save playlist" }));

    expect(await screen.findByText("Someone saved this playlist after you opened it.")).toBeTruthy();
    expect(screen.getByLabelText(/Name/)).toHaveValue("Ada's list two");
    await user.click(screen.getByRole("button", { name: "Load the latest version" }));
    const reload = await screen.findByRole("dialog", { name: "Load the latest version?" });
    expect(reload).toHaveTextContent("Your edits here are dropped");
    await user.click(within(reload).getByRole("button", { name: "Load latest" }));
    await waitFor(() => expect(screen.getByLabelText(/Name/)).toHaveValue("Ada's list"));
    expect(screen.getByText("Loaded the latest version. Apply your edits again, then save.")).toBeTruthy();
  });

  it("says a refused write under the freeze is the freeze and keeps the draft", async () => {
    const user = userEvent.setup();
    const { fetchMock } = stubPlaylistsApi([mine]);
    render(<PlaylistsTab isAdmin={false} />);
    await screen.findByText("Ada's list");
    await openRow(user, "adas-list");
    await screen.findByRole("button", { name: "Move Alpha down" });
    await user.type(screen.getByLabelText(/Name/), " two");
    await user.click(screen.getByRole("button", { name: "Save playlist" }));
    const dialog = await screen.findByRole("dialog");
    fetchMock.mockImplementationOnce(async () =>
      Response.json({ error: "Data writes are frozen (DATA_WRITES_FROZEN).", code: "DATA_WRITES_FROZEN" }, { status: 503 }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Save playlist" }));
    expect(await screen.findByText(/Writes are paused, so your changes were not saved/)).toBeTruthy();
    expect(screen.getByLabelText(/Name/)).toHaveValue("Ada's list two");
  });

  it("asks before saving on Cmd+S and never saves past the confirm", async () => {
    const user = userEvent.setup();
    const { calls } = stubPlaylistsApi([mine]);
    render(<PlaylistsTab isAdmin={false} />);
    await screen.findByText("Ada's list");
    await openRow(user, "adas-list");
    await user.type(screen.getByLabelText(/Name/), " two");
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    expect(await screen.findByRole("dialog", { name: 'Save "Ada\'s list two"?' })).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("says a removal cannot be undone from here", async () => {
    const user = userEvent.setup();
    stubPlaylistsApi([mine]);
    render(<PlaylistsTab isAdmin={false} />);
    await screen.findByText("Ada's list");
    await openRow(user, "adas-list");
    await user.click(await screen.findByRole("button", { name: "Remove this playlist" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("there is no restore button");
    expect(dialog).not.toHaveTextContent(/admin can bring it back/);
  });

  it("deletes after confirming", async () => {
    const user = userEvent.setup();
    const { calls } = stubPlaylistsApi([mine]);
    render(<PlaylistsTab isAdmin={false} />);

    await screen.findByText("Ada's list");
    await openRow(user, "adas-list");
    await user.click(await screen.findByRole("button", { name: "Remove this playlist" }));
    await user.click(await screen.findByRole("button", { name: "Remove playlist" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: "DELETE", path: "/api/dev/replications/playlists/adas-list" });
    await screen.findByText('Removed "Ada\'s list".');
    expect(screen.queryByLabelText(/Name/)).toBeNull();
  });

  it("shows owners to an admin and reassigns one through the owner route after confirming", async () => {
    const user = userEvent.setup();
    const { calls } = stubPlaylistsApi([mine, { ...theirs, editable: true }]);
    render(<PlaylistsTab isAdmin />);

    await screen.findByText("House opener");
    await waitFor(() => expect(rowFor("adas-list").getByText(/^ada$/)).toBeTruthy());
    expect(rowFor("house-opener").getByText(/Unowned/)).toBeTruthy();

    await openRow(user, "house-opener");
    const ownership = within(await screen.findByRole("region", { name: "Ownership" }));
    const assign = ownership.getByRole("button", { name: "Assign owner" });
    expect(assign).toBeDisabled();
    await user.click(ownership.getByRole("combobox", { name: "Owner" }));
    // Members come from the roster; a banned account is not offered.
    await screen.findByRole("option", { name: /^bob/ });
    expect(screen.queryByRole("option", { name: /^eve/ })).toBeNull();
    await user.click(screen.getByRole("option", { name: /^bob/ }));
    await user.click(assign);

    // Nothing is written until the dialog naming the member is confirmed.
    expect(calls).toHaveLength(0);
    const dialog = await screen.findByRole("dialog", { name: 'Hand "House opener" to bob?' });
    expect(dialog).toHaveTextContent("bob (bob@example.com)");
    await user.click(within(dialog).getByRole("button", { name: "Assign owner" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      method: "POST",
      path: "/api/dev/replications/playlists/house-opener/owner",
      body: { ownerEmail: "bob@example.com" },
    });
    await screen.findByText('"House opener" now belongs to bob.');
  });

  it("asks before dropping unsaved changes and keeps the draft on Keep editing", async () => {
    const user = userEvent.setup();
    stubPlaylistsApi([mine]);
    render(<PlaylistsTab isAdmin={false} />);

    await screen.findByText("Ada's list");
    await openRow(user, "adas-list");
    await user.type(screen.getByLabelText(/Name/), " extended");
    expect(screen.getByText("Unsaved changes")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Close editor" }));
    await user.click(await screen.findByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText(/Name/)).toHaveValue("Ada's list extended");

    await user.click(screen.getByRole("button", { name: "Close editor" }));
    await user.click(await screen.findByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.queryByLabelText(/Name/)).toBeNull());
    expect(window.location.pathname).toBe("/dev/playlists");
  });

  it("reports an unsaved playlist to the shell: a rail dot, and a guard on tab switch", async () => {
    const user = userEvent.setup();
    stubPlaylistsApi([mine]);
    const { nav, onTabChange } = renderInDevShell(<PlaylistsTab isAdmin={false} />, { tab: "playlists", role: "editor" });

    await screen.findByText("Ada's list");
    await openRow(user, "adas-list");
    await user.type(screen.getByLabelText(/Name/), " extended");

    expectRailMarksUnsaved(nav, "Playlists");
    const dialog = switchTabExpectingGuard(nav, onTabChange);
    expect(within(dialog).getByText("Playlists: “Ada's list extended”")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Discard" }));
    expect(onTabChange).toHaveBeenCalledWith("articles");
    expect(screen.getByLabelText(/Name/)).toHaveValue("Ada's list");
  });

  it("leaves unload to the shell", async () => {
    const user = userEvent.setup();
    stubPlaylistsApi([mine]);
    const add = vi.spyOn(window, "addEventListener");
    render(<PlaylistsTab isAdmin={false} />);

    await screen.findByText("Ada's list");
    await openRow(user, "adas-list");
    await user.type(screen.getByLabelText(/Name/), " extended");
    expect(screen.getByText("Unsaved changes")).toBeTruthy();

    expect(add.mock.calls.filter(([type]) => type === "beforeunload")).toEqual([]);
    add.mockRestore();
  });

  it("opens a deep-linked playlist and says when a deep link finds nothing", async () => {
    stubPlaylistsApi([mine]);
    const { unmount } = render(<PlaylistsTab isAdmin={false} initialKey="adas-list" />);
    expect(await screen.findByLabelText(/Name/)).toHaveValue("Ada's list");
    unmount();

    stubPlaylistsApi([mine]);
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), "https://dev.dose.wiki").pathname;
      if (path.endsWith("/ghost")) return Response.json({ ok: false, error: "No playlist with that key." }, { status: 404 });
      const { replication_slugs, ...summary } = mine;
      return Response.json({ ok: true, playlists: [{ ...summary, work_count: replication_slugs.length }] });
    });
    render(<PlaylistsTab isAdmin={false} initialKey="ghost" />);
    expect(await screen.findByText('Could not open the playlist "ghost".')).toBeTruthy();
  });

  it("folds a long list behind Show all and unfolds it when a work lands in the hidden tail", async () => {
    const user = userEvent.setup();
    const slugs = Array.from({ length: 25 }, (_, index) => `work-${String(index + 1).padStart(2, "0")}`);
    stubPlaylistsApi([{ ...mine, replication_slugs: slugs }]);
    render(<PlaylistsTab isAdmin={false} />);

    await screen.findByText("Ada's list");
    await openRow(user, "adas-list");
    await waitFor(() => expect(window.location.pathname).toBe("/dev/playlists/adas-list"));

    const order = () => within(screen.getByRole("list", { name: "Playlist order" })).getAllByRole("listitem");
    expect(order()).toHaveLength(20);
    expect(within(screen.getByTestId("playlist-pane")).getByText("25 works")).toBeTruthy();

    const toggle = screen.getByRole("button", { name: "Show all 25 works" });
    expect(toggle).toHaveTextContent("+5");
    await user.click(toggle);
    expect(order()).toHaveLength(25);
    await user.click(screen.getByRole("button", { name: "Show only the first 20 works" }));
    expect(order()).toHaveLength(20);

    await user.click(screen.getByRole("button", { name: "Paste a slug instead" }));
    await user.type(screen.getByLabelText("Add a work"), "work-26{Enter}");
    await waitFor(() => expect(order()).toHaveLength(26));
    expect(order()[25]).toHaveTextContent("Work 26");
  });

  it("surfaces a refusal from the route", async () => {
    const user = userEvent.setup();
    const { fetchMock } = stubPlaylistsApi([mine]);
    render(<PlaylistsTab isAdmin={false} />);

    await screen.findByText("Ada's list");
    await openRow(user, "adas-list");
    await screen.findByRole("button", { name: "Move Alpha down" });
    await user.click(screen.getByRole("button", { name: "Remove this playlist" }));
    fetchMock.mockImplementationOnce(async () =>
      Response.json({ error: "\"Ada's list\" belongs to ada@example.com; only its owner or an admin may change it.", code: "NOT_OWNER" }, { status: 403 }),
    );
    await user.click(await screen.findByRole("button", { name: "Remove playlist" }));

    await screen.findByText(/only its owner or an admin may change it/);
  });
});
