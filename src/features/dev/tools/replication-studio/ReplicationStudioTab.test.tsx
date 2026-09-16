import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

// The portal board is the panel's own test's business. Here it stands in for
// itself, so what is under test is the host: where the board sits in the grid,
// and what the tab does with the three callbacks it hands down.
vi.mock("./SubstanceGalleryPanel", () => ({
  SubstanceGalleryPanel: (props: {
    substanceSlug: string | null;
    corpusRows: readonly unknown[];
    visibleRows: readonly unknown[];
    onInspectRow: (slug: string) => void;
    onOpenLibrary: () => void;
    onDirtyChange: (dirty: boolean) => void;
  }) => (
    <div data-testid="gallery-panel">
      <span>portal:{props.substanceSlug}</span>
      <span>
        gallery corpus:{props.corpusRows.length} filtered:{props.visibleRows.length}
      </span>
      <button type="button" onClick={() => props.onInspectRow("kaleidoscopic-highway-hypnagogist")}>
        inspect row
      </button>
      <button type="button" onClick={props.onOpenLibrary}>
        open library
      </button>
      <button type="button" onClick={() => props.onDirtyChange(true)}>
        make dirty
      </button>
    </div>
  ),
}));

vi.mock("./PlaylistsPanel", () => ({
  PlaylistsPanel: (props: {
    allRows: readonly unknown[];
    filteredRows: readonly unknown[];
    onDirtyChange?: (dirty: boolean) => void;
    renderSavedPlaylistAction?: (playlist: {
      key: string;
      title: string;
      work_count: number;
      updated_at: string;
      updated_by: string | null;
      owner_email: string | null;
      editable: boolean;
    }) => ReactNode;
  }) => (
    <div data-testid="playlists-workspace">
      <span>
        playlist corpus:{props.allRows.length} filtered:{props.filteredRows.length}
      </span>
      <button type="button" onClick={() => props.onDirtyChange?.(true)}>
        make playlist dirty
      </button>
      {props.renderSavedPlaylistAction?.({
        key: "visual-journey",
        title: "Visual journey",
        work_count: 1,
        updated_at: "2026-08-20T10:00:00.000Z",
        updated_by: "josie",
        owner_email: "josie@example.com",
        editable: true,
      })}
    </div>
  ),
}));

vi.mock("./ApplyPlaylistToDrugsAction", () => ({
  ApplyPlaylistToDrugsAction: ({
    onReviewGallery,
  }: {
    onReviewGallery: (substanceSlug: string) => void;
  }) => (
    <button type="button" onClick={() => onReviewGallery("applied-lsd")}>
      Review applied gallery
    </button>
  ),
}));

import { ReplicationStudioTab } from "./ReplicationStudioTab";

const CORPUS = {
  ok: true,
  rows: [
    {
      id: "row-1",
      slug: "kaleidoscopic-highway-hypnagogist",
      title: "Kaleidoscopic highway",
      artist: "Hypnagogist",
      artist_url: null,
      role: "replication",
      type: "video",
      effect_slug: "geometry",
      effect_name: "Geometry",
      effect_tags: [],
      credit_line: "Kaleidoscopic highway by Hypnagogist",
      rights_status: "creator-retained",
      source_url: null,
      rightsholder: "Hypnagogist",
      url: "https://example.invalid/a",
      thumbnail_url: "https://example.invalid/a-thumb",
      format: "mp4",
      duration: null,
      file_size: 5834171,
      created_at: "2026-07-28T18:24:53.650Z",
    },
    {
      id: "row-2",
      slug: "alice-grown-large-tenniel",
      title: "Alice grown large",
      artist: "John Tenniel",
      artist_url: null,
      role: "figure",
      type: "image",
      effect_slug: null,
      effect_name: null,
      effect_tags: ["drifting"],
      credit_line: null,
      rights_status: "public-domain",
      source_url: null,
      rightsholder: null,
      url: "https://example.invalid/b",
      thumbnail_url: null,
      format: "png",
      duration: null,
      file_size: 161570,
      created_at: "2026-08-11T20:27:20.976Z",
    },
  ],
  effects: [
    { slug: "drifting", name: "Drifting" },
    { slug: "geometry", name: "Geometry" },
  ],
};

function stubFetch() {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === "/api/dev/replications" && (!init || init.method === undefined)) {
        return Response.json(CORPUS);
      }
      if (url === "/api/dev/replications/featured" && (!init || init.method === undefined)) {
        return Response.json({ slugs: [], curated: true });
      }
      if (url === "/api/dev/replications/editorial") {
        return Response.json({ ok: true, updated: 1, slugs: ["kaleidoscopic-highway-hypnagogist"] });
      }
      return Response.json({ ok: true });
    }),
  );
  return calls;
}

describe("ReplicationStudioTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    pushMock.mockClear();
  });

  it("loads the corpus and renders every row, figures included", async () => {
    stubFetch();
    render(<ReplicationStudioTab />);

    expect(await screen.findByText("Kaleidoscopic highway")).toBeInTheDocument();
    expect(screen.getByText("Alice grown large")).toBeInTheDocument();
    expect(screen.getByText("2 of 2 shown")).toBeInTheDocument();
  });

  it("filters the grid from the search box", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Kaleidoscopic highway");

    await user.type(screen.getByLabelText("Search replications"), "tenniel");

    await waitFor(() => expect(screen.getByText("1 of 2 shown")).toBeInTheDocument());
    expect(screen.queryByText("Kaleidoscopic highway")).not.toBeInTheDocument();
  });

  it("saves a single edit with the snapshot it loaded as the compare-and-swap guard", async () => {
    const calls = stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Kaleidoscopic highway");

    await user.click(screen.getByRole("option", { name: /Kaleidoscopic highway/ }));

    const title = await screen.findByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Kaleidoscopic freeway");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(calls.some((call) => call.url === "/api/dev/replications/editorial")).toBe(true),
    );

    const save = calls.find((call) => call.url === "/api/dev/replications/editorial");
    const body = JSON.parse(String(save?.init?.body)) as Record<string, unknown>;
    expect(body.mode).toBe("single");
    expect(body.id).toBe("row-1");
    expect(body.expected).toMatchObject({ title: "Kaleidoscopic highway", role: "replication" });
    expect(body.updates).toMatchObject({ title: "Kaleidoscopic freeway", effect_slug: "geometry" });
  });

  it("offers a bulk apply once more than one row is selected", async () => {
    const calls = stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Kaleidoscopic highway");

    await user.click(screen.getByRole("option", { name: /Kaleidoscopic highway/ }));
    await user.keyboard("{Control>}");
    await user.click(screen.getByRole("option", { name: /Alice grown large/ }));
    await user.keyboard("{/Control}");

    expect(await screen.findByText("2 selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark as figure" }));

    await waitFor(() =>
      expect(calls.some((call) => call.url === "/api/dev/replications/editorial")).toBe(true),
    );
    const bulk = calls.find((call) => call.url === "/api/dev/replications/editorial");
    const body = JSON.parse(String(bulk?.init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ mode: "bulk", ids: ["row-1", "row-2"], role: "figure" });
  });

  it("shows the drug gallery beside its filter rail without mounting the library behind it", async () => {
    stubFetch();
    const { container } = render(<ReplicationStudioTab initialSubstanceSlug="lsd" />);

    const board = await screen.findByTestId("gallery-panel");
    const grid = container.querySelector("div.grid");

    expect(grid).toContainElement(screen.getByLabelText("Search replications"));
    expect(grid).toContainElement(board);
    expect(screen.getByText("portal:lsd")).toBeInTheDocument();
    expect(screen.getByText("gallery corpus:2 filtered:2")).toBeInTheDocument();
    expect(screen.queryByText("2 of 2 shown")).not.toBeInTheDocument();
    expect(screen.queryByText("Kaleidoscopic highway")).not.toBeInTheDocument();
  });

  it("presents one focused Library, Playlists, or Drug galleries workspace at a time", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Kaleidoscopic highway");

    await user.click(screen.getByRole("button", { name: "Playlists" }));
    expect(await screen.findByTestId("playlists-workspace")).toHaveTextContent(
      "playlist corpus:2 filtered:2",
    );
    expect(screen.queryByText("Kaleidoscopic highway")).not.toBeInTheDocument();
    expect(screen.queryByText("2 of 2 shown")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Drug galleries" }));
    expect(await screen.findByTestId("gallery-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("playlists-workspace")).not.toBeInTheDocument();
    expect(screen.queryByText("Kaleidoscopic highway")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Library" }));
    expect(await screen.findByText("Kaleidoscopic highway")).toBeInTheDocument();
    expect(screen.queryByTestId("gallery-panel")).not.toBeInTheDocument();
  });

  it("requires explicit discard before leaving a dirty Playlists workspace", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Kaleidoscopic highway");

    await user.click(screen.getByRole("button", { name: "Playlists" }));
    await user.click(await screen.findByRole("button", { name: "make playlist dirty" }));
    await user.click(screen.getByRole("button", { name: "Library" }));

    expect(await screen.findByText("Leave Playlists with unsaved changes?")).toBeInTheDocument();
    expect(screen.getByTestId("playlists-workspace")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByTestId("playlists-workspace")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Library" }));
    await user.click(await screen.findByRole("button", { name: "Discard changes" }));
    expect(await screen.findByText("Kaleidoscopic highway")).toBeInTheDocument();
    expect(screen.queryByTestId("playlists-workspace")).not.toBeInTheDocument();
  });

  it("reviews an applied gallery immediately when the playlist workspace is clean", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Kaleidoscopic highway");

    await user.click(screen.getByRole("button", { name: "Playlists" }));
    await user.click(await screen.findByRole("button", { name: "Review applied gallery" }));

    expect(pushMock).toHaveBeenCalledOnce();
    expect(pushMock).toHaveBeenCalledWith("/dev/replications/applied-lsd");
    expect(
      screen.queryByText("Leave Playlists with unsaved changes?"),
    ).not.toBeInTheDocument();
  });

  it("carries the requested gallery through the dirty playlist discard guard", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Kaleidoscopic highway");

    await user.click(screen.getByRole("button", { name: "Playlists" }));
    await user.click(await screen.findByRole("button", { name: "make playlist dirty" }));
    await user.click(screen.getByRole("button", { name: "Review applied gallery" }));

    expect(await screen.findByText("Leave Playlists with unsaved changes?")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(pushMock).toHaveBeenCalledOnce();
    expect(pushMock).toHaveBeenCalledWith("/dev/replications/applied-lsd");
  });

  it("opens the editor drawer on the row the board asks to inspect", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab initialSubstanceSlug="lsd" />);
    await screen.findByTestId("gallery-panel");

    await user.click(screen.getByRole("button", { name: "inspect row" }));

    expect(await screen.findByText("Editing 1 replication")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Kaleidoscopic highway");
  });

  it("will not close a dirty portal until the discard dialog is answered", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab initialSubstanceSlug="lsd" />);
    await screen.findByTestId("gallery-panel");

    await user.click(screen.getByRole("button", { name: "make dirty" }));
    await user.click(screen.getByRole("button", { name: "Library" }));

    expect(await screen.findByText("Leave the showcase with unsaved changes?")).toBeInTheDocument();
    expect(screen.getByTestId("gallery-panel")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByTestId("gallery-panel")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Library" }));
    await user.click(await screen.findByRole("button", { name: "Discard changes" }));

    await waitFor(() => expect(screen.queryByTestId("gallery-panel")).not.toBeInTheDocument());
    expect(pushMock).toHaveBeenCalledWith("/dev/replications");
  });

  it("puts the editor under the grid box inside the main column between lg and xl", async () => {
    // The rail breakpoint matches, the drawer column does not: a laptop width.
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(min-width: 1024px)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Kaleidoscopic highway");

    // Nothing selected: no empty coach under the grid at this width.
    expect(screen.queryByText("Nothing selected")).not.toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: /Kaleidoscopic highway/ }));

    const heading = await screen.findByText("Editing 1 replication");
    expect(screen.getByRole("main")).toContainElement(heading);
    expect(screen.getByRole("listbox", { name: "Replications" }).compareDocumentPosition(heading))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("folds the rail into a filter sheet below lg, and `/` opens it", async () => {
    // No breakpoint matches: the tab reads itself as narrower than `lg`.
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Kaleidoscopic highway");

    // One rail, one home: closed sheet means no second search box to confuse
    // `/` or the ref it focuses.
    expect(screen.queryByLabelText("Search replications")).not.toBeInTheDocument();

    await user.keyboard("/");

    const search = await screen.findByLabelText("Search replications");
    expect(search).toHaveFocus();
    // The whole organizer came with it — nothing amputated at this width.
    expect(screen.getByText("Group by")).toBeInTheDocument();
    expect(screen.getByLabelText(/John Tenniel/)).toBeInTheDocument();
  });
});
