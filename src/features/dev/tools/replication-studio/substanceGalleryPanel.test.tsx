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
      matchedVia: "effect_slug" as const,
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

const PLAYLISTS = [
  {
    key: "geometry-opener",
    title: "Geometry opener",
    // work-1 is already curated on LSD; work-2 and work-3 are matched candidates.
    replication_slugs: ["work-1", "work-3", "work-2"],
    updated_at: "2026-08-01T10:00:00.000Z",
    updated_by: "josie",
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
    const payload = url.includes("/playlists")
      ? playlists
      : url.endsWith("/substances")
        ? { substances: SUBSTANCES }
        : detail;
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
  it("counts article slots and uncurated candidates separately", async () => {
    stubFetch();
    renderPanel();

    // One curated of three matched: the other two are candidates, not published.
    expect(await screen.findByText("1 of 12 article slots filled · 2 matched, not curated")).toBeInTheDocument();
    // The unknown-rights row is curated at position 1, so the advisory fires.
    expect(await screen.findByText(/unknown reuse terms/i)).toBeInTheDocument();
  });

  it("states that an uncurated substance publishes nothing, and previews nothing", async () => {
    stubFetch(undefined, { ...DETAIL, curation: null });
    renderPanel();

    await screen.findByText("Work 2");
    expect(screen.getByText("0 of 12 article slots filled · 3 matched, not curated")).toBeInTheDocument();
    expect(
      screen.getByText(/never curated — this article has never shown a replication showcase/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/nothing is curated, so this article shows no replication showcase at all/i),
    ).toBeInTheDocument();
    // Curated-only publishing means the preview is honestly empty, not broken.
    expect(screen.getByTestId("stage-preview")).toBeEmptyDOMElement();
    // A matched but uncurated work never fires the rights advisory.
    expect(screen.queryByText(/unknown reuse terms/i)).not.toBeInTheDocument();
  });

  it("reports dirtiness to the host and undoes a curation with the toolbar", async () => {
    const user = userEvent.setup();
    stubFetch();
    const props = renderPanel();

    await screen.findByText("Work 2");
    expect(screen.getByText("Gallery saved")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Curate Work 2" }));
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
    await user.click(screen.getByRole("button", { name: "Curate Work 2" }));
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
    await user.click(screen.getByRole("button", { name: "Curate Work 2" }));
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
    await user.click(screen.getByRole("button", { name: "Curate Work 2" }));
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
    await user.click(screen.getByRole("button", { name: "Curate Work 2" }));
    await user.click(screen.getByRole("button", { name: /save gallery/i }));
    await screen.findByText(/This gallery changed on the server/i);

    await user.click(screen.getByRole("button", { name: /take theirs/i }));
    expect(screen.getByText("Gallery saved")).toBeInTheDocument();
    expect(screen.getByText(/Last saved 2026-08-03 by someone-else/i)).toBeInTheDocument();
    // work-3 is now the only curated row, at position 1.
    const curatedBand = screen.getByRole("region", { name: /on the article/i });
    expect(within(curatedBand).getByText("Work 3")).toBeInTheDocument();
  });

  it("guards a dirty substance switch with a dialog instead of window.confirm", async () => {
    const user = userEvent.setup();
    stubFetch();
    const props = renderPanel();

    await screen.findByText("Work 2");
    await user.click(screen.getByRole("button", { name: "Curate Work 2" }));

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

  it("feeds the stage preview the curated order and nothing else", async () => {
    const user = userEvent.setup();
    stubFetch();
    renderPanel();

    await screen.findByText("Work 2");
    // work-2 and work-3 match but are not curated, so the article never sees them.
    expect(screen.getByTestId("stage-preview")).toHaveTextContent("work-1");

    await user.click(screen.getByRole("button", { name: "Curate Work 3" }));
    expect(screen.getByTestId("stage-preview")).toHaveTextContent("work-1,work-3");
  });
});
