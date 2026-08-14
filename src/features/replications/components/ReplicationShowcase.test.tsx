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
  AppImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
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
  rightsLine: "Rights remain with the creator or rightsholder.",
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
    // The stage, caption, and rights footer still stand on their own.
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Drifting \(wood grain\)/ }),
    ).toHaveAttribute("href", "/replications/drifting-wood-grain");
    expect(
      screen.getByText("Rights remain with the creator or rightsholder."),
    ).toBeInTheDocument();
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
    ).toHaveAttribute("href", "/replications/tracers-hand-wave");
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
    render(<ReplicationShowcase works={[work(), secondWork]} totalCount={89} />);

    const overflow = screen.getByRole("link", {
      name: "87 more replications in the gallery",
    });
    expect(overflow).toHaveAttribute("href", "/replications");
    expect(overflow).toHaveTextContent("+87");
    // The overflow tile is navigation, not a tab.
    expect(screen.getAllByRole("tab")).toHaveLength(2);
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
    expect(screen.getByRole("link", { name: "Chelsea Morgan" })).toHaveAttribute(
      "href",
      "/contributors/chelsea",
    );
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
    expect(screen.queryByRole("link", { name: "StingrayZ" })).not.toBeInTheDocument();
    expect(screen.getByText(/by StingrayZ/)).toBeInTheDocument();
  });

  it("wraps around with the overlaid previous/next arrows", () => {
    render(<ReplicationShowcase works={[work(), secondWork]} />);

    fireEvent.click(screen.getByRole("button", { name: "Next replication" }));
    expect(screen.getAllByRole("tab")[1]).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("button", { name: "Next replication" }));
    expect(screen.getAllByRole("tab")[0]).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("button", { name: "Previous replication" }));
    expect(screen.getAllByRole("tab")[1]).toHaveAttribute("aria-selected", "true");
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
    expect((container.querySelector("video") as HTMLVideoElement).muted).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Unmute Tracers loop" }));
    expect((container.querySelector("video") as HTMLVideoElement).muted).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Mute Tracers loop" }));
    expect((container.querySelector("video") as HTMLVideoElement).muted).toBe(true);
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
    expect(works[0].rightsLine).toBe(
      "Rights remain with the creator or rightsholder.",
    );
  });

  it("drops rows the stage cannot draw", () => {
    const works = buildShowcaseWorks(
      [item({ type: "audio" }, "drifting"), item({ slug: "kept" }, "drifting")],
      new Map(),
    );

    expect(works.map((entry) => entry.slug)).toEqual(["kept"]);
  });
});
