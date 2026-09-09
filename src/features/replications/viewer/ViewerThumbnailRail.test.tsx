import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ViewerThumbnailRail,
  type ViewerThumbnailRailProps,
} from "./ViewerThumbnailRail";
import type { ReplicationViewerMediaItem } from "./viewerModel";

vi.mock("@/components/common/AppImage", () => ({
  AppImage: ({ src }: { src: string }) => <img src={src} alt="" />,
}));

const makeItems = (count: number): ReplicationViewerMediaItem[] =>
  Array.from({ length: count }, (_, index) => ({
    replication: {
      slug: `work-${index}`,
      title: `Work ${index}`,
      artist: "Chelsea Morgan",
      type: "image" as const,
      format: "png",
      url: `https://cdn.test/work-${index}.png`,
      thumbnail_url: `https://cdn.test/work-${index}.webp`,
    },
    effectName: "Tracers",
    effectSlug: "tracers",
    effectCategories: [],
    artistProfileHref: null,
    avatarUrl: null,
  }));

const baseProps = (
  overrides: Partial<ViewerThumbnailRailProps> = {},
): ViewerThumbnailRailProps => ({
  items: makeItems(300),
  selectedIndex: 0,
  groupLabel: "Chelsea Morgan",
  rotated: false,
  chromeHidden: false,
  onSelect: vi.fn(),
  focusRingClassName: "focus-ring",
  ...overrides,
});

/**
 * Mobile slot geometry under the default matchMedia stub (`matches: false`):
 * 48px thumb + 8px gap. jsdom has no layout, so the unmocked list measures
 * clientWidth 0 → one visible slot plus 8 overscan each side.
 */
const SLOT = 56;
const GAP = 8;

/** Gives the layoutless jsdom list a real viewport and scroll offset. */
const mockListMetrics = (
  list: HTMLElement,
  { scrollLeft, clientWidth }: { scrollLeft: number; clientWidth: number },
) => {
  Object.defineProperty(list, "clientWidth", {
    configurable: true,
    value: clientWidth,
  });
  Object.defineProperty(list, "scrollLeft", {
    configurable: true,
    writable: true,
    value: scrollLeft,
  });
};

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  // Deferred like the real thing (the component's in-flight guard depends on
  // the callback running after requestAnimationFrame returns), flushable with
  // one awaited microtask.
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    queueMicrotask(() => callback(0));
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ViewerThumbnailRail", () => {
  it("renders a bounded window of a 300-item corpus with truthful spacers", () => {
    const { container } = render(<ViewerThumbnailRail {...baseProps()} />);

    expect(
      screen.getByRole("navigation", { name: "Chelsea Morgan works" }),
    ).toBeInTheDocument();

    // One visible slot (clientWidth 0) + 8 overscan → items 0..8 only.
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(9);
    expect(buttons.length).toBeLessThan(300);

    // The 291 unrendered slots collapse into one trailing spacer whose width
    // preserves scrollbar geometry: 291 × 56px slots minus the absorbed gap.
    const spacers = container.querySelectorAll("[data-rail-spacer]");
    expect(spacers).toHaveLength(1);
    expect(spacers[0]).toHaveStyle({ width: `${291 * SLOT - GAP}px` });
  });

  it("always renders the selected item, marked aria-current, even far outside the scroll window", () => {
    const { container } = render(
      <ViewerThumbnailRail {...baseProps({ selectedIndex: 150 })} />,
    );

    const selected = screen.getByRole("button", { name: /Show Work 150,/ });
    expect(selected).toHaveAttribute("aria-current", "true");
    expect(selected).toHaveTextContent("151");

    // Two disjoint runs (0..8 scroll, 142..158 selected) → 26 buttons and
    // two exact-width spacers between/after them.
    expect(screen.getAllByRole("button")).toHaveLength(26);
    const spacers = container.querySelectorAll("[data-rail-spacer]");
    expect(spacers).toHaveLength(2);
    expect(spacers[0]).toHaveStyle({ width: `${133 * SLOT - GAP}px` });
    expect(spacers[1]).toHaveStyle({ width: `${141 * SLOT - GAP}px` });
  });

  it("reports the corpus index, not the windowed index, on select", () => {
    const onSelect = vi.fn();
    render(
      <ViewerThumbnailRail
        {...baseProps({ selectedIndex: 150, onSelect })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Show Work 145,/ }));
    expect(onSelect).toHaveBeenCalledWith(145);
  });

  it("stands down for hidden chrome: inert, aria-hidden, faded", () => {
    render(<ViewerThumbnailRail {...baseProps({ chromeHidden: true })} />);

    const nav = screen.getByRole("navigation", { hidden: true });
    expect(nav).toHaveAttribute("aria-hidden", "true");
    expect(nav).toHaveAttribute("inert");
  });

  it("slides the window with scroll position", async () => {
    const { container } = render(<ViewerThumbnailRail {...baseProps()} />);
    const list = container.querySelector("ul");
    expect(list).not.toBeNull();
    if (!list) return;

    expect(
      screen.queryByRole("button", { name: /Show Work 100,/ }),
    ).not.toBeInTheDocument();

    // 100 slots deep with a 400px viewport → visible 100..107, overscan 92..115.
    mockListMetrics(list, { scrollLeft: 100 * SLOT, clientWidth: 400 });
    await act(async () => {
      fireEvent.scroll(list);
      await Promise.resolve();
    });

    expect(
      screen.getByRole("button", { name: /Show Work 100,/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Show Work 115,/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Show Work 50,/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps a focused thumb mounted when the window scrolls away from it", async () => {
    const { container } = render(
      <ViewerThumbnailRail {...baseProps({ selectedIndex: 100 })} />,
    );
    const list = container.querySelector("ul");
    expect(list).not.toBeNull();
    if (!list) return;

    fireEvent.focus(screen.getByRole("button", { name: /Show Work 5,/ }));

    mockListMetrics(list, { scrollLeft: 100 * SLOT, clientWidth: 400 });
    await act(async () => {
      fireEvent.scroll(list);
      await Promise.resolve();
    });

    // The focus union (5 ± 8) survives; unfocused neighbors outside every
    // window do not.
    expect(
      screen.getByRole("button", { name: /Show Work 5,/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Show Work 30,/ }),
    ).not.toBeInTheDocument();
  });

  it("draws a bar strip for an audio work instead of a broken thumbnail", () => {
    const [clip] = makeItems(1);
    clip.replication = {
      ...clip.replication,
      type: "audio",
      format: "ogg",
      url: "https://cdn.test/hum.ogg",
      thumbnail_url: undefined,
    };
    const { container } = render(
      <ViewerThumbnailRail {...baseProps({ items: [clip], selectedIndex: 0 })} />,
    );

    // The clip URL in an <img> is a permanently broken rail tile.
    expect(container.querySelector("img")).toBeNull();
    expect(
      container.querySelectorAll(".theme-replication-waveform-bar").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /Show Work 0,/ }),
    ).toBeInTheDocument();
  });
});
