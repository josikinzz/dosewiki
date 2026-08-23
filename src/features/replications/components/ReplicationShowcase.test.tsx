import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReplicationWithUrl } from "@/types/replications";
import type { SubstanceGalleryItem } from "@/data/substanceReplicationGallery";
import { ReplicationShowcase } from "./ReplicationShowcase";
import {
  buildShowcaseWorks,
  visualEffectNameBySlug,
  type ShowcaseWork,
} from "./showcaseModel";

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
    collection: { label: string; groups: { items: unknown[] }[] };
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
  it("renders nothing at all for a substance with no matched works", () => {
    const { container } = render(<ReplicationShowcase works={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("hides the thumbnail rail entirely when only one work exists", () => {
    render(<ReplicationShowcase works={[work()]} />);

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    // The stage and caption still stand on their own.
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Drifting \(wood grain\)/ }),
    ).toHaveAttribute("href", "/replications?viewer=drifting-wood-grain");
  });

  it("links an article work to that article's viewer collection", () => {
    render(<ReplicationShowcase works={[work()]} substanceSlug="lsd" />);

    expect(
      screen.getByRole("link", { name: /Drifting \(wood grain\)/ }),
    ).toHaveAttribute("href", "/lsd?viewer=drifting-wood-grain");
  });

  it("opens the shared viewer over the article and preserves the permanent link", () => {
    const pushState = vi.spyOn(window.history, "pushState");
    render(
      <ReplicationShowcase
        works={[work(), secondWork]}
        substanceSlug="lsd"
        collectionLabel="LSD replications"
      />,
    );

    const entry = screen.getByRole("link", {
      name: /Drifting \(wood grain\).*Open/,
    });
    expect(entry).toHaveAttribute("href", "/lsd?viewer=drifting-wood-grain");
    fireEvent.click(entry);

    expect(screen.getByTestId("replication-viewer")).toHaveAttribute(
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

  it("reconstructs the complete article collection beyond the compact strip", () => {
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

    expect(screen.getByTestId("replication-viewer")).toHaveAttribute(
      "data-initial-slug",
      "hidden-third-work",
    );
    expect(screen.getByTestId("replication-viewer")).toHaveAttribute(
      "data-item-count",
      "3",
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
      screen.getByRole("link", { name: /Drifting \(wood grain\).*Open/ }),
    ).toHaveAttribute("href", "/effects/drifting?viewer=drifting-wood-grain");
    expect(
      screen.getByRole("link", {
        name: "3 more replications in this effect's playlist",
      }),
    ).toHaveAttribute("href", "/effects/drifting?viewer=drifting-wood-grain");
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

  it("swipes horizontally to change the active work, ignoring vertical drags", () => {
    render(<ReplicationShowcase works={[work(), secondWork]} />);
    const stage = screen.getByRole("tabpanel");

    fireEvent.touchStart(stage, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(stage, {
      changedTouches: [{ clientX: 80, clientY: 105 }],
    });
    expect(screen.getAllByRole("tab")[1]).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.touchStart(stage, { touches: [{ clientX: 80, clientY: 100 }] });
    fireEvent.touchEnd(stage, {
      changedTouches: [{ clientX: 220, clientY: 100 }],
    });
    expect(screen.getAllByRole("tab")[0]).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // A mostly-vertical drag is a page scroll, not a swipe.
    fireEvent.touchStart(stage, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(stage, {
      changedTouches: [{ clientX: 140, clientY: 300 }],
    });
    expect(screen.getAllByRole("tab")[0]).toHaveAttribute(
      "aria-selected",
      "true",
    );
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

  it("wraps around with the overlaid previous/next arrows", () => {
    render(<ReplicationShowcase works={[work(), secondWork]} />);

    fireEvent.click(screen.getByRole("button", { name: "Next replication" }));
    expect(screen.getAllByRole("tab")[1]).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Next replication" }));
    expect(screen.getAllByRole("tab")[0]).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Previous replication" }),
    );
    expect(screen.getAllByRole("tab")[1]).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("hides the arrows when only one work exists", () => {
    render(<ReplicationShowcase works={[work()]} />);
    expect(
      screen.queryByRole("button", { name: "Next replication" }),
    ).not.toBeInTheDocument();
  });

  it("starts muted and unmutes only on the reader's gesture", () => {
    const video = work({
      slug: "tracers-loop",
      title: "Tracers loop",
      type: "video",
      url: "https://cdn.test/tracers.mp4",
      thumbnailUrl: "https://cdn.test/tracers-poster.webp",
    });
    const { container } = render(<ReplicationShowcase works={[video]} />);

    fireEvent.click(screen.getByRole("button", { name: "Play Tracers loop" }));
    expect((container.querySelector("video") as HTMLVideoElement).muted).toBe(
      true,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Unmute Tracers loop" }),
    );
    expect((container.querySelector("video") as HTMLVideoElement).muted).toBe(
      false,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mute Tracers loop" }));
    expect((container.querySelector("video") as HTMLVideoElement).muted).toBe(
      true,
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
  ): SubstanceGalleryItem => ({
    replication: replication(overrides),
    provenance: { matchedVia: "effect_slug", effectSlug },
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
});
