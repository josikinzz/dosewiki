import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// cmdk measures its list and scrolls the active item into view; jsdom has
// neither ResizeObserver nor scrollIntoView.
beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
});

// The stage preview mounts the real public showcase; it has its own coverage and
// its media pipeline is not what these tests are about.
vi.mock("./GalleryStagePreview", () => ({
  GalleryStagePreview: ({ matches }: { matches: readonly { replication: { slug: string } }[] }) => (
    <div data-testid="stage-preview">{matches.map((entry) => entry.replication.slug).join(",")}</div>
  ),
}));

import { SubstanceGalleryPanel, type SubstanceGalleryPanelProps } from "./SubstanceGalleryPanel";

const SUBSTANCES = [
  { slug: "lsd", title: "LSD", match_count: 3, curated: true, curated_count: 1, removed_count: 0 },
  { slug: "dmt", title: "DMT", match_count: 1, curated: false, curated_count: 0, removed_count: 0 },
];

function match(index: number) {
  return {
    replication: {
      id: `id-${index}`,
      slug: `work-${index}`,
      title: `Work ${index}`,
      artist: "Hypnagogist",
      type: "image" as const,
      effect_slug: "geometry",
      effect_name: "Geometry",
      effect_tags: [],
      credit_line: null,
      rights_status: index === 1 ? "unknown" : "creator-retained",
      url: null,
      thumbnail_url: null,
      format: "png",
    },
    provenance: {
      matchedVia: "specific_drug" as const,
      effectSlug: "geometry",
      effectName: "Geometry",
    },
  };
}

const DETAIL = {
  substance: { slug: "lsd", title: "LSD" },
  matches: [match(1), match(2), match(3)],
  curation: {
    curated_slugs: ["work-1"],
    removed_slugs: [],
    updated_at: "2026-08-01T10:00:00.000Z",
    updated_by: "josie",
  },
  effectOptions: [{ slug: "geometry", name: "Geometry" }],
  unmatchedEffectNames: [],
};
const CORPUS = [
  ...[1, 2, 3, 4].map((index) => ({
    id: `id-${index}`,
    slug: `work-${index}`,
    title: `Work ${index}`,
    artist: "Hypnagogist",
    artist_url: null,
    role: "replication" as const,
    type: "image" as const,
    effect_slug: index === 4 ? "unmatched-effect" : "geometry",
    effect_name: index === 4 ? "Unmatched effect" : "Geometry",
    effect_tags: [],
    credit_line: null,
    url: null,
    thumbnail_url: null,
    format: "png",
    duration: null,
    file_size: null,
    created_at: "2026-08-01T00:00:00.000Z",
  })),
  {
    id: "id-retired",
    slug: "retired-work",
    title: "Retired work",
    artist: "Hypnagogist",
    artist_url: null,
    role: "replication" as const,
    type: "image" as const,
    effect_slug: null,
    effect_name: null,
    effect_tags: [],
    credit_line: null,
    url: null,
    thumbnail_url: null,
    format: "png",
    duration: null,
    file_size: null,
    created_at: "2026-08-01T00:00:00.000Z",
    showcase_excluded: true,
  },
];

const PLAYLISTS = [
  {
    key: "geometry-opener",
    title: "Geometry opener",
    // work-1 is already curated on LSD; work-2 and work-3 are matched candidates.
    replication_slugs: ["work-1", "work-3", "work-2"],
    updated_at: "2026-08-01T10:00:00.000Z",
    updated_by: "josie",
    owner_email: "josie@example.com",
    editable: true,
  },
];

type PostHandler = (body: {
  curatedSlugs: string[];
  removedSlugs: string[];
  expectedUpdatedAt?: string | null;
}) => { status: number; payload: unknown };

function stubFetch(
  onPost?: PostHandler,
  detail: unknown = DETAIL,
  playlists: unknown = { playlists: PLAYLISTS },
) {
  const posts: { curatedSlugs: string[]; removedSlugs: string[]; expectedUpdatedAt?: string | null }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      posts.push(body);
      const { status, payload } = onPost?.(body) ?? {
        status: 200,
        payload: {
          ok: true,
          curated_slugs: body.curatedSlugs,
          removed_slugs: body.removedSlugs,
          pruned_curated: [],
          pruned_removed: [],
          updated_at: "2026-08-02T11:00:00.000Z",
          updated_by: "josie",
        },
      };
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }
    let payload: unknown;
    if (url.includes("/playlists")) {
      const playlistPayload = playlists as { playlists: typeof PLAYLISTS };
      const full = playlistPayload.playlists;
      if (url.endsWith("/playlists")) {
        payload = {
          playlists: full.map(({ replication_slugs, ...playlist }) => ({
            ...playlist,
            work_count: replication_slugs.length,
          })),
        };
      } else {
        const key = decodeURIComponent(url.split("/").pop() ?? "");
        payload = { playlist: full.find((playlist) => playlist.key === key) };
      }
    } else {
      payload = url.endsWith("/substances") ? { substances: SUBSTANCES } : detail;
    }
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, posts };
}

function renderPanel(overrides: Partial<SubstanceGalleryPanelProps> = {}) {
  const onNavigateToSubstance = vi.fn();
  const onDirtyChange = vi.fn();
  const props: SubstanceGalleryPanelProps = {
    substanceSlug: "lsd",
    onNavigateToSubstance,
    visibleRows: [],
    corpusRows: CORPUS,
    railNarrowed: false,
    onInspectRow: vi.fn(),
    onOpenLibrary: vi.fn(),
    onDirtyChange,
    ...overrides,
  };
  render(<SubstanceGalleryPanel {...props} />);
  return { onNavigateToSubstance, onDirtyChange };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SubstanceGalleryPanel", () => {
  it("counts effective article slots and automatic placements", async () => {
    stubFetch();
    renderPanel();

    expect(
      await screen.findByText("3 of 12 article slots filled · 3 published · 2 automatic"),
    ).toBeInTheDocument();
    expect(await screen.findByText(/unknown reuse terms/i)).toBeInTheDocument();
  });

  it("publishes and previews automatic placements without stored curation", async () => {
    stubFetch(undefined, { ...DETAIL, curation: null });
    renderPanel();

    await screen.findByText("Work 2");
    expect(
      screen.getByText("3 of 12 article slots filled · 3 published · 3 automatic"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no stored priority overrides.*still publishes every automatic placement/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId("stage-preview")).toHaveTextContent("work-1,work-2,work-3");
    expect(screen.getByText(/unknown reuse terms/i)).toBeInTheDocument();
  });

  it("reports dirtiness to the host and undoes a curation with the toolbar", async () => {
    const user = userEvent.setup();
    stubFetch();
    const props = renderPanel();

    await screen.findByText("Work 2");
    expect(screen.getByText("Gallery saved")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Prioritize Work 2" }));
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    await waitFor(() => expect(props.onDirtyChange).toHaveBeenLastCalledWith(true));

    await user.click(screen.getByRole("button", { name: /undo the last curation change/i }));
    expect(screen.getByText("Gallery saved")).toBeInTheDocument();
    await waitFor(() => expect(props.onDirtyChange).toHaveBeenLastCalledWith(false));

    await user.click(screen.getByRole("button", { name: /redo the last undone curation change/i }));
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("applies a playlist into the draft without publishing anything", async () => {
    const user = userEvent.setup();
    const { posts } = stubFetch();
    renderPanel();

    await screen.findByText("Work 2");
    expect(screen.getByText("Gallery saved")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /apply playlist/i }));
    // 3 of 3 entries match LSD; one of them is already curated.
    await user.click(await screen.findByRole("button", { name: /geometry opener/i }));

    // The applied works land after the editor's own pin, in playlist order, and
    // the already-curated work keeps the position it had.
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.getByTestId("stage-preview")).toHaveTextContent("work-1,work-3,work-2");

    // Applying is a draft edit: nothing was written until Save is pressed.
    expect(posts).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: /save gallery/i }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].curatedSlugs).toEqual(["work-1", "work-3", "work-2"]);
  });

  it("directly prioritizes unmatched eligible playlist works without restoring exclusions", async () => {
    const user = userEvent.setup();
    const detail = {
      ...DETAIL,
      curation: {
        ...DETAIL.curation,
        removed_slugs: ["work-3"],
      },
    };
    const playlists = {
      playlists: [{
        ...PLAYLISTS[0],
        title: "Mixed placement",
        replication_slugs: ["work-1", "work-3", "work-4", "retired-work"],
      }],
    };
    const { posts } = stubFetch(undefined, detail, playlists);
    renderPanel();

    await screen.findByText("Work 2");
    await user.click(screen.getByRole("button", { name: /apply playlist/i }));
    await user.click(await screen.findByRole("button", { name: /mixed placement/i }));
    expect(
      await screen.findByText("1 added · 1 already present · 1 excluded · 1 ineligible"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("stage-preview")).toHaveTextContent("work-1,work-2,work-4");
    expect(posts).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: /save gallery/i }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      curatedSlugs: ["work-1", "work-4"],
      removedSlugs: ["work-3"],
      expectedUpdatedAt: "2026-08-01T10:00:00.000Z",
    });
  });

  /**
   * The state of a deployment that has the app but not the playlist functions
   * yet: the endpoint answers with something this panel cannot read. Curation
   * must keep working — one broken side feature may not take the gallery down.
   */
  it("keeps curating when the playlists endpoint answers with junk", async () => {
    const user = userEvent.setup();
    const { posts } = stubFetch(undefined, DETAIL, { error: "Server Error" });
    renderPanel();

    await screen.findByText("Work 2");
    await user.click(screen.getByRole("button", { name: "Prioritize Work 2" }));
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /save gallery/i }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].curatedSlugs).toEqual(["work-1", "work-2"]);
  });

  it("posts the loaded updated_at as the expected version and adopts the echo", async () => {
    const user = userEvent.setup();
    const { posts } = stubFetch();
    renderPanel();

    await screen.findByText("Work 2");
    await user.click(screen.getByRole("button", { name: "Prioritize Work 2" }));
    await user.click(screen.getByRole("button", { name: /save gallery/i }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      curatedSlugs: ["work-1", "work-2"],
      removedSlugs: [],
      expectedUpdatedAt: "2026-08-01T10:00:00.000Z",
    });
    expect(await screen.findByText(/Saved 2 curated and 0 excluded replications\./i)).toBeInTheDocument();
    // The echo becomes the new baseline, so a second save carries its updated_at.
    expect(screen.getByText(/Last saved 2026-08-02 by josie/i)).toBeInTheDocument();
  });

  it("surfaces a 409 as a diff and resolves it either way", async () => {
    const user = userEvent.setup();
    let rejectNext = true;
    const { posts } = stubFetch((body) => {
      if (rejectNext) {
        rejectNext = false;
        return {
          status: 409,
          payload: {
            error: "This gallery changed since you loaded it.",
            conflict: {
              curated_slugs: ["work-3"],
              removed_slugs: [],
              updated_at: "2026-08-03T09:00:00.000Z",
              updated_by: "someone-else",
            },
          },
        };
      }
      return {
        status: 200,
        payload: {
          ok: true,
          curated_slugs: body.curatedSlugs,
          removed_slugs: body.removedSlugs,
          pruned_curated: [],
          pruned_removed: [],
          updated_at: "2026-08-04T09:00:00.000Z",
          updated_by: "josie",
        },
      };
    });
    renderPanel();

    await screen.findByText("Work 2");
    await user.click(screen.getByRole("button", { name: "Prioritize Work 2" }));
    await user.click(screen.getByRole("button", { name: /save gallery/i }));

    await screen.findByText(/This gallery changed on the server/i);
    // The server's pin is a removal line; the draft's is an addition line.
    expect(screen.getByText(/^-\s*1 work-3$/)).toBeInTheDocument();
    expect(screen.getByText(/^\+\s*2 work-2$/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /keep mine/i }));
    await waitFor(() => expect(posts).toHaveLength(2));
    // "Keep mine" re-sends the draft while claiming the server's version.
    expect(posts[1]).toEqual({
      curatedSlugs: ["work-1", "work-2"],
      removedSlugs: [],
      expectedUpdatedAt: "2026-08-03T09:00:00.000Z",
    });
    await waitFor(() =>
      expect(screen.queryByText(/This gallery changed on the server/i)).not.toBeInTheDocument(),
    );
  });

  it("takes the server's version and drops the draft when asked", async () => {
    const user = userEvent.setup();
    stubFetch(() => ({
      status: 409,
      payload: {
        error: "This gallery changed since you loaded it.",
        conflict: {
          curated_slugs: ["work-3"],
          removed_slugs: [],
          updated_at: "2026-08-03T09:00:00.000Z",
          updated_by: "someone-else",
        },
      },
    }));
    renderPanel();

    await screen.findByText("Work 2");
    await user.click(screen.getByRole("button", { name: "Prioritize Work 2" }));
    await user.click(screen.getByRole("button", { name: /save gallery/i }));
    await screen.findByText(/This gallery changed on the server/i);

    await user.click(screen.getByRole("button", { name: /take theirs/i }));
    expect(screen.getByText("Gallery saved")).toBeInTheDocument();
    expect(screen.getByText(/Last saved 2026-08-03 by someone-else/i)).toBeInTheDocument();
    // work-3 is now the only stored priority row.
    const priorityBand = screen.getByRole("region", { name: /priority overrides/i });
    expect(within(priorityBand).getByText("Work 3")).toBeInTheDocument();
  });

  it("guards a dirty substance switch with a dialog instead of window.confirm", async () => {
    const user = userEvent.setup();
    stubFetch();
    const props = renderPanel();

    await screen.findByText("Work 2");
    await user.click(screen.getByRole("button", { name: "Prioritize Work 2" }));

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("DMT"));

    expect(props.onNavigateToSubstance).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /discard and switch/i }));
    expect(props.onNavigateToSubstance).toHaveBeenCalledWith("dmt");
  });

  it("offers a retry when the detail read fails", async () => {
    const user = userEvent.setup();
    let failing = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/substances")) {
        return new Response(JSON.stringify({ substances: SUBSTANCES }), { status: 200 });
      }
      if (failing) {
        failing = false;
        return new Response(JSON.stringify({ error: "Gallery read exploded." }), { status: 500 });
      }
      return new Response(JSON.stringify(DETAIL), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPanel();

    expect(await screen.findByText("Gallery read exploded.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByText("Work 2")).toBeInTheDocument();
  });

  it("replaces the loading picker with a disabled one and a retry when the substance list fails", async () => {
    const user = userEvent.setup();
    let failing = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/substances")) {
        if (failing) {
          failing = false;
          return new Response(JSON.stringify({ error: "Substance read exploded." }), { status: 500 });
        }
        return new Response(JSON.stringify({ substances: SUBSTANCES }), { status: 200 });
      }
      return new Response(JSON.stringify(DETAIL), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    // The substance list is cached at module level across renders, so this
    // test needs a fresh module graph to observe the first, failing read.
    vi.resetModules();
    const { SubstanceGalleryPanel: FreshPanel } = await import("./SubstanceGalleryPanel");
    render(
      <FreshPanel
        substanceSlug="lsd"
        onNavigateToSubstance={vi.fn()}
        visibleRows={[]}
        corpusRows={CORPUS}
        railNarrowed={false}
        onInspectRow={vi.fn()}
        onOpenLibrary={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    );

    expect(await screen.findByText("Substance read exploded.")).toBeInTheDocument();
    const trigger = screen.getByRole("combobox", { name: /could not be loaded/i });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveTextContent("Substance list unavailable");

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("combobox", { name: /Current substance: LSD/ })).toBeEnabled();
    expect(screen.queryByText("Substance read exploded.")).not.toBeInTheDocument();
  });

  it("feeds the stage preview the full effective article order", async () => {
    const user = userEvent.setup();
    stubFetch();
    renderPanel();

    await screen.findByText("Work 2");
    expect(screen.getByTestId("stage-preview")).toHaveTextContent("work-1,work-2,work-3");

    await user.click(screen.getByRole("button", { name: "Prioritize Work 3" }));
    expect(screen.getByTestId("stage-preview")).toHaveTextContent("work-1,work-3,work-2");
  });
});
