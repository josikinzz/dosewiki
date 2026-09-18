import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReplicationWithUrl } from "@/types/replications";
import type { SubstanceGalleryItem } from "@/data/substanceReplicationGallery";
import { ReplicationShowcase } from "./ReplicationShowcase";
import {
  buildEffectShowcaseWorks,
  buildShowcaseWorks,
  visualEffectNameBySlug,
} from "./showcaseModel";
import type { ShowcaseWork } from "./showcaseWork";
import { VIEWER_SOUND_STORAGE_KEY } from "@/features/replications/viewer/viewerPreferences";

vi.mock("@/components/common/AppImage", () => ({
  AppImage: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}));

vi.mock("@/features/replications/viewer/ReplicationViewerOverlay", () => ({
  ReplicationViewerOverlay: ({
    collection,
    initialSlug,
    onOpenChange,
  }: {
    collection: {
      label: string;
      groups: {
        items: { replication: { artist: string } }[];
      }[];
    };
    initialSlug: string;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div
      data-testid="replication-viewer"
      data-collection-label={collection.label}
      data-initial-slug={initialSlug}
      data-item-count={collection.groups.reduce(
        (count, group) => count + group.items.length,
        0,
      )}
      data-active-artist={collection.groups[0]?.items[0]?.replication.artist}
    >
      <button type="button" onClick={() => onOpenChange(false)}>
        Close viewer
      </button>
    </div>
  ),
}));

const work = (overrides: Partial<ShowcaseWork> = {}): ShowcaseWork => ({
  slug: "drifting-wood-grain",
  title: "Drifting (wood grain)",
  type: "image",
  url: "https://cdn.test/drifting.webp",
  byline: "by Chelsea Morgan",
  artistName: "Chelsea Morgan",
  artistHref: "/contributors/chelsea",
  artistHrefExternal: false,
  effectSlug: "drifting",
  effectName: "Drifting",
  ...overrides,
});

const secondWork = work({
  slug: "tracers-hand-wave",
  title: "Tracers (hand wave)",
  url: "https://cdn.test/tracers.webp",
  effectSlug: "tracers",
  effectName: "Tracers",
  byline: "by StingrayZ",
  artistName: "StingrayZ",
  artistHref: null,
  artistHrefExternal: false,
});

describe("ReplicationShowcase", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing at all for a substance with no matched works", () => {
    const { container } = render(<ReplicationShowcase works={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
  it("uses the existing still thumbnail inline while keeping the viewer destination", () => {
    const still = work({ thumbnailUrl: "https://cdn.test/drifting-thumb.webp" });
    render(<ReplicationShowcase works={[still, secondWork]} />);
    expect(screen.getByRole("img", { name: still.title })).toHaveAttribute("src", still.thumbnailUrl);
    expect(screen.getByRole("tab", { name: /Drifting.*demonstrates/ }).querySelector("img")).toHaveAttribute("src", still.thumbnailUrl);
    expect(screen.getByRole("link", { name: /Drifting \(wood grain\)/ })).toHaveAttribute("href", "/replications?viewer=drifting-wood-grain");
  });

  it("hides the one-work rail while keeping count and viewer entry explicit", () => {
    render(<ReplicationShowcase works={[work()]} />);

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Drifting \(wood grain\)/ }),
    ).toHaveAttribute("href", "/replications?viewer=drifting-wood-grain");
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open viewer/ }),
    ).toBeInTheDocument();
  });

  it("links an article work to that article's viewer collection", () => {
    render(<ReplicationShowcase works={[work()]} substanceSlug="lsd" />);

    expect(
      screen.getByRole("link", { name: /Drifting \(wood grain\)/ }),
    ).toHaveAttribute("href", "/lsd?viewer=drifting-wood-grain");
  });

  it("opens the shared viewer over the article and preserves the permanent link", async () => {
    const pushState = vi.spyOn(window.history, "pushState");
    render(
      <ReplicationShowcase
        works={[work(), secondWork]}
        substanceSlug="lsd"
        collectionLabel="LSD replications"
      />,
    );
    expect(screen.getByText("LSD replications")).toBeInTheDocument();

    const entry = screen.getByRole("link", {
      name: "Drifting (wood grain)",
    });
    expect(entry).toHaveAttribute("href", "/lsd?viewer=drifting-wood-grain");
    fireEvent.click(entry);

    expect(await screen.findByTestId("replication-viewer")).toHaveAttribute(
      "data-initial-slug",
      "drifting-wood-grain",
    );
    expect(screen.getByTestId("replication-viewer")).toHaveAttribute(
      "data-collection-label",
      "LSD replications",
    );
    expect(pushState).toHaveBeenCalledWith(
      expect.objectContaining({ replicationViewer: true }),
      "",
      expect.stringContaining("viewer=drifting-wood-grain"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close viewer" }));
    expect(screen.queryByTestId("replication-viewer")).toBeNull();
    pushState.mockRestore();
  });

  it("removes a viewer query that does not belong to the article collection", () => {
    window.history.replaceState(
      {},
      "",
      "/lsd?smoke=1&viewer=not-in-this-article",
    );

    render(<ReplicationShowcase works={[work()]} substanceSlug="lsd" />);

    expect(window.location.pathname + window.location.search).toBe(
      "/lsd?smoke=1",
    );
    expect(screen.queryByTestId("replication-viewer")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "The linked replication is no longer available in this collection.",
      ),
    ).toBeInTheDocument();
    window.history.replaceState({}, "", "/");
  });

  it("reconstructs the complete article collection beyond the compact strip", async () => {
    const hiddenWork = work({
      slug: "hidden-third-work",
      title: "Hidden third work",
    });
    window.history.replaceState({}, "", "/lsd?viewer=hidden-third-work");

    render(
      <ReplicationShowcase
        works={[work()]}
        collectionWorks={[work(), secondWork, hiddenWork]}
        totalCount={3}
        substanceSlug="lsd"
        collectionLabel="LSD replications"
      />,
    );

    expect(await screen.findByTestId("replication-viewer")).toHaveAttribute(
      "data-initial-slug",
      "hidden-third-work",
    );
    expect(screen.getByTestId("replication-viewer")).toHaveAttribute(
      "data-item-count",
      "3",
    );
    window.history.replaceState({}, "", "/");
  });

  it("defers an out-of-strip deep link until the lazy collection arrives", async () => {
    const longTail = work({
      slug: "long-tail-work",
      title: "Long tail work",
    });
    window.history.replaceState({}, "", "/lsd?viewer=long-tail-work");
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(
      () => new Promise<Response>((resolve) => (resolveFetch = resolve)),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ReplicationShowcase
        works={[work()]}
        totalCount={2}
        substanceSlug="lsd"
        collectionLabel="LSD replications"
        collectionSource={{ kind: "substance", slug: "lsd" }}
      />,
    );

    expect(window.location.search).toBe("?viewer=long-tail-work");
    expect(screen.queryByTestId("replication-viewer")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "The linked replication is no longer available in this collection.",
      ),
    ).not.toBeInTheDocument();

    resolveFetch({
      ok: true,
      json: async () => ({ works: [work(), longTail] }),
    } as Response);

    const viewer = await screen.findByTestId("replication-viewer");
    expect(viewer).toHaveAttribute("data-initial-slug", "long-tail-work");
    expect(viewer).toHaveAttribute("data-item-count", "2");
    expect(window.location.search).toBe("?viewer=long-tail-work");
    window.history.replaceState({}, "", "/");
  });


  it("preserves a failed deep link and retries without truncating the collection", async () => {
    window.history.replaceState({}, "", "/lsd?viewer=long-tail-work");
    const longTail = work({ slug: "long-tail-work", title: "Long tail work" });
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ works: [work(), longTail] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<ReplicationShowcase works={[work()]} substanceSlug="lsd" collectionSource={{ kind: "substance", slug: "lsd" }} />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(window.location.search).toBe("?viewer=long-tail-work");
    const viewer = await screen.findByTestId("replication-viewer");
    expect(viewer).toHaveAttribute("data-initial-slug", "long-tail-work");
    expect(viewer).toHaveAttribute("data-item-count", "2");
    window.history.replaceState({}, "", "/");
  });

  it("opens the complete playlist only after its intent read resolves", async () => {
    const longTail = work({
      slug: "long-tail-work",
      title: "Long tail work",
    });
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(
      () => new Promise<Response>((resolve) => (resolveFetch = resolve)),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ReplicationShowcase
        works={[work(), secondWork]}
        totalCount={3}
        effectSlug="drifting"
        collectionSource={{ kind: "effect", slug: "drifting" }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Drifting (wood grain) in viewer",
      }),
    );

    expect(screen.queryByTestId("replication-viewer")).not.toBeInTheDocument();

    resolveFetch({
      ok: true,
      json: async () => ({ works: [work(), secondWork, longTail] }),
    } as Response);

    await waitFor(() =>
      expect(screen.getByTestId("replication-viewer")).toHaveAttribute(
        "data-item-count",
        "3",
      ),
    );
    window.history.replaceState({}, "", "/");
  });

  it("scopes effect-article links and overflow to the effect collection", () => {
    render(
      <ReplicationShowcase
        works={[work(), secondWork]}
        totalCount={5}
        effectSlug="drifting"
      />,
    );

    expect(
      screen.getByRole("link", { name: "Drifting (wood grain)" }),
    ).toHaveAttribute("href", "/effects/drifting?viewer=drifting-wood-grain");
    expect(
      screen.getByRole("link", {
        name: "3 more replications in this effect's playlist",
      }),
    ).toHaveAttribute("href", "/effects/drifting?viewer=drifting-wood-grain");
  });

  it("reports launches to a page-level controller instead of owning the viewer", () => {
    const pushState = vi.spyOn(window.history, "pushState");
    const onOpenWork = vi.fn();
    render(
      <ReplicationShowcase
        works={[work(), secondWork]}
        collectionLabel="Drifting"
        controller={{
          sourcePath: "/replications/artist/chelsea-morgan",
          onOpenWork,
        }}
      />,
    );

    // Fallback hrefs write the viewer param against the controller's page.
    const entry = screen.getByRole("link", {
      name: "Drifting (wood grain)",
    });
    expect(entry).toHaveAttribute(
      "href",
      "/replications/artist/chelsea-morgan?viewer=drifting-wood-grain",
    );

    fireEvent.click(entry);
    expect(onOpenWork).toHaveBeenCalledWith("drifting-wood-grain");
    // The controller owns history and the overlay; the showcase touches neither.
    expect(pushState).not.toHaveBeenCalled();
    expect(screen.queryByTestId("replication-viewer")).not.toBeInTheDocument();
    // …nor the per-stage rights footnote the controlled page renders once.
    expect(screen.queryByText("licensing terms")).not.toBeInTheDocument();
    pushState.mockRestore();
  });

  it("leaves a controller's viewer query alone even when unknown to this stage", () => {
    window.history.replaceState(
      {},
      "",
      "/replications/artist/chelsea-morgan?viewer=in-another-section",
    );
    render(
      <ReplicationShowcase
        works={[work()]}
        controller={{
          sourcePath: "/replications/artist/chelsea-morgan",
          onOpenWork: vi.fn(),
        }}
      />,
    );

    expect(window.location.search).toBe("?viewer=in-another-section");
    expect(
      screen.queryByText(
        "The linked replication is no longer available in this collection.",
      ),
    ).not.toBeInTheDocument();
    window.history.replaceState({}, "", "/");
  });

  it("hides the creator line when the host page already names the artist", () => {
    render(<ReplicationShowcase works={[work()]} showCreator={false} />);

    expect(screen.queryByText(/by Chelsea Morgan/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^by$/)).not.toBeInTheDocument();
  });

  it("moves focus with arrows without activating, and activates on Enter", () => {
    render(<ReplicationShowcase works={[work(), secondWork]} />);

    const tabs = screen.getAllByRole("tab");
    tabs[0].focus();

    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(tabs[1]).toHaveFocus();
    // Manual activation: focus travelled, selection did not.
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");

    fireEvent.keyDown(tabs[1], { key: "Enter" });
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Replication 2 of 2: Tracers (hand wave), demonstrates Tracers",
    );
    // The caption follows the activated work.
    expect(
      screen.getByRole("link", { name: /Tracers \(hand wave\)/ }),
    ).toHaveAttribute("href", "/replications?viewer=tracers-hand-wave");
    expect(
      screen.getByRole("link", { name: "Demonstrates: Tracers" }),
    ).toHaveAttribute("href", "/effects/tracers");
  });

  it("wires Home and End to the rail's edges without activating", () => {
    render(<ReplicationShowcase works={[work(), secondWork]} />);

    const tabs = screen.getAllByRole("tab");
    tabs[0].focus();

    fireEvent.keyDown(tabs[0], { key: "End" });
    expect(tabs[1]).toHaveFocus();
    fireEvent.keyDown(tabs[1], { key: "Home" });
    expect(tabs[0]).toHaveFocus();
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });

  it("closes the rail with a +N gallery link when the corpus outgrows the cap", () => {
    render(
      <ReplicationShowcase works={[work(), secondWork]} totalCount={89} />,
    );

    const overflow = screen.getByRole("link", {
      name: "87 more replications in the gallery",
    });
    expect(overflow).toHaveAttribute(
      "href",
      "/replications?viewer=drifting-wood-grain",
    );
    expect(overflow).toHaveTextContent("+87");
    // The overflow tile is navigation, not a tab.
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });

  it("points the +N overflow at the owning substance article", () => {
    render(
      <ReplicationShowcase
        works={[work(), secondWork]}
        totalCount={89}
        substanceSlug="lsd"
      />,
    );

    const overflow = screen.getByRole("link", {
      name: "87 more replications in this substance's playlist",
    });
    expect(overflow).toHaveAttribute("href", "/lsd?viewer=drifting-wood-grain");
  });

  it("plays on demand and pauses again, with the gate closed", () => {
    const video = work({
      slug: "tracers-loop",
      title: "Tracers loop",
      type: "video",
      url: "https://cdn.test/tracers.mp4",
      thumbnailUrl: "https://cdn.test/tracers-poster.webp",
    });
    const { container } = render(<ReplicationShowcase works={[video]} />);

    // jsdom has no matchMedia/IntersectionObserver: the autoplay gate stays
    // closed, so the poster + play overlay path renders.
    expect(container.querySelector("video")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Play Tracers loop" }));
    expect(container.querySelector("video")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pause Tracers loop" }));
    expect(container.querySelector("video")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Play Tracers loop" }),
    ).toBeInTheDocument();
  });

  it("links the artist to their contributor profile, external site as fallback", () => {
    render(<ReplicationShowcase works={[work()]} />);
    expect(
      screen.getByRole("link", { name: "Chelsea Morgan" }),
    ).toHaveAttribute("href", "/contributors/chelsea");
  });

  it("opens an unclaimed credit's own site in a new tab", () => {
    render(
      <ReplicationShowcase
        works={[
          work({
            artistHref: "https://chelsea.test",
            artistHrefExternal: true,
          }),
        ]}
      />,
    );
    const link = screen.getByRole("link", { name: "Chelsea Morgan" });
    expect(link).toHaveAttribute("href", "https://chelsea.test");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders an unlinkable credit as plain text", () => {
    render(<ReplicationShowcase works={[secondWork]} />);
    expect(
      screen.queryByRole("link", { name: "StingrayZ" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/by StingrayZ/)).toBeInTheDocument();
  });

  it("keeps inline interactions to selection, pause/play, and mute", () => {
    const video = work({
      slug: "tracers-loop",
      title: "Tracers loop",
      type: "video",
      url: "https://cdn.test/tracers.mp4",
      thumbnailUrl: "https://cdn.test/tracers-poster.webp",
    });
    const { container } = render(
      <ReplicationShowcase works={[video, secondWork]} />,
    );

    expect(
      screen.queryByRole("button", { name: "Next replication" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /mute/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Play Tracers loop" }));
    expect((container.querySelector("video") as HTMLVideoElement).muted).toBe(
      true,
    );
    // Unprobed audio is treated as audible: the mute chip renders.
    expect(
      screen.getByRole("button", { name: "Unmute Tracers loop" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause Tracers loop" }));
    expect(container.querySelector("video")).not.toBeInTheDocument();
  });

  it("keeps the title line plain and moves Open viewer into the corner chip", async () => {
    render(<ReplicationShowcase works={[work()]} substanceSlug="lsd" />);

    const title = screen.getByRole("link", { name: "Drifting (wood grain)" });
    expect(title).toHaveTextContent(/^Drifting \(wood grain\)$/);
    expect(title).not.toHaveTextContent(/Open viewer/i);

    const chip = screen.getByRole("link", { name: "Open viewer" });
    expect(chip).toHaveAttribute("href", "/lsd?viewer=drifting-wood-grain");
    fireEvent.click(chip);
    expect(await screen.findByTestId("replication-viewer")).toHaveAttribute(
      "data-initial-slug",
      "drifting-wood-grain",
    );
  });

  it("offers no mute toggle for a video probed silent", () => {
    const silent = work({
      slug: "silent-loop",
      title: "Silent loop",
      type: "video",
      url: "https://cdn.test/silent.mp4",
      thumbnailUrl: "https://cdn.test/silent-poster.webp",
      hasAudio: false,
    });
    render(<ReplicationShowcase works={[silent]} />);

    fireEvent.click(screen.getByRole("button", { name: "Play Silent loop" }));
    expect(
      screen.getByRole("button", { name: "Pause Silent loop" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /mute/i }),
    ).not.toBeInTheDocument();
  });

  it("unmutes in-gesture and round-trips the viewer sound preference", () => {
    window.sessionStorage.clear();
    const audible = work({
      slug: "audible-loop",
      title: "Audible loop",
      type: "video",
      url: "https://cdn.test/audible.mp4",
      thumbnailUrl: "https://cdn.test/audible-poster.webp",
      hasAudio: true,
    });
    const { container } = render(<ReplicationShowcase works={[audible]} />);

    fireEvent.click(screen.getByRole("button", { name: "Play Audible loop" }));
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video.muted).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "Unmute Audible loop" }),
    );
    expect(video.muted).toBe(false);
    expect(window.sessionStorage.getItem(VIEWER_SOUND_STORAGE_KEY)).toBe("on");

    fireEvent.click(screen.getByRole("button", { name: "Mute Audible loop" }));
    expect(video.muted).toBe(true);
    expect(window.sessionStorage.getItem(VIEWER_SOUND_STORAGE_KEY)).toBe(
      "off",
    );
    window.sessionStorage.clear();
  });

  it("starts unmuted when the viewer already turned sound on this session", () => {
    window.sessionStorage.setItem(VIEWER_SOUND_STORAGE_KEY, "on");
    const audible = work({
      slug: "audible-loop",
      title: "Audible loop",
      type: "video",
      url: "https://cdn.test/audible.mp4",
      thumbnailUrl: "https://cdn.test/audible-poster.webp",
      hasAudio: true,
    });
    const { container } = render(<ReplicationShowcase works={[audible]} />);

    fireEvent.click(screen.getByRole("button", { name: "Play Audible loop" }));
    expect((container.querySelector("video") as HTMLVideoElement).muted).toBe(
      false,
    );
    expect(
      screen.getByRole("button", { name: "Mute Audible loop" }),
    ).toBeInTheDocument();
    window.sessionStorage.clear();
  });

  it("opens the shared viewer when the reader clicks the media stage", async () => {
    render(<ReplicationShowcase works={[work(), secondWork]} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Drifting (wood grain) in viewer",
      }),
    );

    expect(await screen.findByTestId("replication-viewer")).toHaveAttribute(
      "data-initial-slug",
      "drifting-wood-grain",
    );
  });

  it("plays a GIF through its controllable motion rendition and keeps its poster", () => {
    const gif = work({
      slug: "drifting-gif",
      title: "Drifting GIF",
      format: "gif",
      url: "https://cdn.test/original.gif",
      thumbnailUrl: "https://cdn.test/legacy-thumb.webp",
      motionUrl: "https://cdn.test/drifting-motion.mp4",
      motionPosterUrl: "https://cdn.test/drifting-poster.webp",
    });
    const { container } = render(<ReplicationShowcase works={[gif]} />);

    expect(screen.getByRole("img", { name: "Drifting GIF" })).toHaveAttribute(
      "src",
      "https://cdn.test/drifting-poster.webp",
    );
    fireEvent.click(screen.getByRole("button", { name: "Play Drifting GIF" }));
    expect(container.querySelector("video")).toHaveAttribute(
      "src",
      "https://cdn.test/drifting-motion.mp4",
    );
    expect(container.querySelector("video")).toHaveAttribute("loop");
  });

  it("does not mount a raw GIF when no controllable motion rendition exists", () => {
    const gif = work({
      slug: "legacy-gif",
      title: "Legacy GIF",
      format: "gif",
      url: "https://cdn.test/legacy.gif",
      thumbnailUrl: "https://cdn.test/legacy-thumb.webp",
      motionUrl: "https://cdn.test/orphaned-motion.mp4",
      motionPosterUrl: undefined,
    });
    render(<ReplicationShowcase works={[gif]} />);

    expect(
      screen.queryByRole("img", { name: "Legacy GIF" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Animation unavailable until its controllable rendition is ready.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Play Legacy GIF" }),
    ).not.toBeInTheDocument();
  });

  it("does not present corpus markers as creator names", async () => {
    render(
      <ReplicationShowcase
        works={[
          work({
            artistName: "Unknown",
            artistHref: "/artists/unknown",
            byline: "by Unknown",
          }),
        ]}
      />,
    );

    expect(screen.getByText("Creator unknown")).toBeInTheDocument();
    expect(screen.queryByText("by Unknown")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Drifting (wood grain) in viewer",
      }),
    );
    expect(await screen.findByTestId("replication-viewer")).toHaveAttribute(
      "data-active-artist",
      "Unattributed",
    );
  });
});

describe("buildShowcaseWorks", () => {
  const replication = (
    overrides: Partial<ReplicationWithUrl> = {},
  ): ReplicationWithUrl => ({
    _id: "id-0",
    _creationTime: 0,
    slug: "drifting-wood-grain",
    title: "Drifting (wood grain)",
    artist: "Chelsea Morgan",
    type: "image",
    storage_id: "storage-0",
    format: "webp",
    created_at: "2020-01-01",
    url: "https://cdn.test/drifting.webp",
    ...overrides,
  });

  const item = (
    overrides: Partial<ReplicationWithUrl>,
    effectSlug: string,
    provenance: SubstanceGalleryItem["provenance"] = {
      matchedVia: "specific_drug",
      effectSlug,
    },
  ): SubstanceGalleryItem => ({
    replication: replication(overrides),
    provenance,
  });

  it("names effects from the article's chip vocabulary, humanising unknown slugs", () => {
    const names = visualEffectNameBySlug({
      sensory: {
        visual: {
          subcategories: {
            Distortions: { effects: [{ name: "Drifting" }] },
          },
        },
      },
    });

    const works = buildShowcaseWorks(
      [item({}, "drifting"), item({ slug: "other" }, "colour-enhancement")],
      names,
    );

    expect(works.map((entry) => entry.effectName)).toEqual([
      "Drifting",
      "colour enhancement",
    ]);
    expect(works[0].byline).toBe("by Chelsea Morgan");
  });

  it("links the credit to the Artist Page; a withheld work falls back externally", () => {
    const works = buildShowcaseWorks(
      [
        item({}, "drifting"),
        item(
          {
            slug: "withheld",
            effect_slug: "unspeakable-horrors",
            artist_url: "https://chelsea.test",
          },
          "unspeakable-horrors",
        ),
      ],
      new Map(),
    );

    // The work itself proves the Artist Page exists, so no resolver is needed.
    expect(works[0].artistHref).toBe("/replications/artist/chelsea-morgan");
    expect(works[0].artistHrefExternal).toBe(false);
    // A withheld work cannot name that page; with no profile resolver, the
    // artist's own site is the last honest destination.
    expect(works[1].artistHref).toBe("https://chelsea.test");
    expect(works[1].artistHrefExternal).toBe(true);
  });

  it("drops rows the stage cannot draw", () => {
    const works = buildShowcaseWorks(
      [item({ type: "audio" }, "drifting"), item({ slug: "kept" }, "drifting")],
      new Map(),
    );

    expect(works.map((entry) => entry.slug)).toEqual(["kept"]);
  });

  it("keeps Visual Disconnection fallback images last even when a GIF ranks as motion", () => {
    const works = buildShowcaseWorks(
      [
        item({ slug: "specific-still" }, "drifting"),
        item(
          { slug: "visual-fallback-gif", format: "gif" },
          "visual-disconnection",
          {
            matchedVia: "visual_disconnection",
            effectSlug: "visual-disconnection",
            drugClass: "dissociatives",
          },
        ),
        item(
          { slug: "specific-video", type: "video", format: "mp4" },
          "geometry",
        ),
      ],
      new Map(),
    );

    expect(works.map((entry) => entry.slug)).toEqual([
      "specific-video",
      "specific-still",
      "visual-fallback-gif",
    ]);
  });

  it("keeps unsettling works available after ordinary open-eye media on both collection paths", () => {
    const rows = [
      replication({ slug: "horror-video", type: "video", viewing_mode: "open-eye", content_tags: ["body-horror"] }),
      replication({ slug: "abstract-video", type: "video", viewing_mode: "closed-eye", has_audio: true }),
      replication({ slug: "open-still", viewing_mode: "open-eye" }),
      replication({ slug: "open-video", type: "video", viewing_mode: "open-eye", has_audio: false }),
      replication({ slug: "unknown-still" }),
    ];
    const substance = buildShowcaseWorks(
      rows.map((row) => item(row, "geometry")),
      new Map(),
    );
    const effect = buildEffectShowcaseWorks(rows, { effectSlug: "geometry" });
    const expected = ["open-video", "open-still", "abstract-video", "unknown-still", "horror-video"];
    expect(substance.map((work) => work.slug)).toEqual(expected);
    expect(effect.map((work) => work.slug)).toEqual(expected);
    expect(rows.map((row) => row.slug)).toEqual([
      "horror-video", "abstract-video", "open-still", "open-video", "unknown-still",
    ]);
  });

  it("keeps a closed-eye editorial opener ahead of automatic opening preferences", () => {
    const rows = [
      replication({ slug: "open-video", type: "video", viewing_mode: "open-eye" }),
      replication({ slug: "curated-still", viewing_mode: "closed-eye" }),
      replication({ slug: "pinned-horror", content_family: "dark-surrealism" }),
    ];
    const works = buildEffectShowcaseWorks(rows, { galleryOrder: ["curated-still", "pinned-horror"] });
    expect(works.map((work) => work.slug)).toEqual(["curated-still", "pinned-horror", "open-video"]);
  });

  it("preserves complete large editorial permutations on both shared renderers", () => {
    const rows = Array.from({ length: 300 }, (_, index) => replication({
      slug: `work-${index}`,
      type: index % 2 ? "image" : "video",
      viewing_mode: index % 2 ? "closed-eye" : "open-eye",
      ...(index % 3 === 0 ? { content_tags: ["body-horror"] } : {}),
    }));
    const order = rows.map(row => row.slug).reverse();
    expect(buildShowcaseWorks(
      rows.map(row => item(row, "geometry")), new Map(), undefined, undefined, order,
    ).map(work => work.slug)).toEqual(order);
    expect(buildEffectShowcaseWorks(rows, { galleryOrder: order }).map(work => work.slug)).toEqual(order);
  });
});
