import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReplicationViewerMediaItem } from "../viewerModel";
import {
  reorderViewerSlugs,
  SortableViewerRail,
} from "./SortableViewerRail";

const items: ReplicationViewerMediaItem[] = ["one", "two", "three"].map(
  (slug, index) => ({
    replication: {
      slug,
      title: `Work ${index + 1}`,
      artist: "Chelsea Morgan",
      type: "image",
      format: "webp",
      url: `https://cdn.test/${slug}.webp`,
    },
    effectName: "Tracers",
    effectSlug: "tracers",
    effectCategories: [],
    artistProfileHref: "/replications/artist/chelsea-morgan",
    avatarUrl: null,
  }),
);


afterEach(() => {
  cleanup();
});

describe("SortableViewerRail", () => {
  it("exposes separate activation and keyboard drag controls", async () => {
    const onActivate = vi.fn();
    render(
      <SortableViewerRail
        items={items}
        activeSlug="one"
        disabled={false}
        onActivate={onActivate}
        onReorder={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "View Work 2" }));
    expect(onActivate).toHaveBeenCalledWith("two");

    const handle = screen.getByRole("button", { name: "Reorder Work 1" });
    expect(handle).toHaveAttribute("aria-roledescription", "sortable");
    expect(handle).toHaveAttribute("aria-describedby");
    expect(
      screen.getByText("Drag handles or use Space + arrow keys"),
    ).toBeVisible();
    expect(reorderViewerSlugs(["one", "two", "three"], "one", "two")).toEqual([
      "two",
      "one",
      "three",
    ]);
  });

  it("disables drag handles while an order is saving", () => {
    render(
      <SortableViewerRail
        items={items}
        activeSlug="one"
        disabled
        onActivate={vi.fn()}
        onReorder={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Reorder Work 1" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "View Work 1" })).toBeEnabled();
  });
});
