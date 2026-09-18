import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { ReplicationGrid, type ReplicationGridHandle } from "./ReplicationGrid";
import { groupStudioRows, type StudioRow } from "./replicationStudioModel";

function row(index: number): StudioRow {
  return {
    id: `row-${index}`,
    slug: `work-${index}`,
    title: `Work ${index}`,
    artist: index % 2 === 0 ? "Hypnagogist" : "John Tenniel",
    artist_url: null,
    role: "replication",
    type: "image",
    effect_slug: "geometry",
    effect_name: "Geometry",
    effect_tags: [],
    credit_line: null,
    rights_status: "creator-retained",
    url: null,
    thumbnail_url: null,
    format: "png",
    duration: null,
    file_size: 1,
    created_at: "2026-08-11T20:27:20.976Z",
  };
}

const ROWS = Array.from({ length: 500 }, (_, index) => row(index + 1));

describe("ReplicationGrid", () => {
  it("mounts only the rows near the viewport while announcing the full set size", () => {
    const handle = createRef<ReplicationGridHandle>();
    render(
      <ReplicationGrid
        ref={handle}
        groups={groupStudioRows(ROWS, "none")}
        selection={new Set()}
        anchorId={null}
        onCardActivate={vi.fn()}
      />,
    );

    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(0);
    expect(options.length).toBeLessThan(ROWS.length);
    expect(options[0]).toHaveAttribute("aria-setsize", "500");
    expect(options[0]).toHaveAttribute("aria-posinset", "1");
    expect(screen.getByRole("listbox", { name: "Replications" })).toBeInTheDocument();
    expect(handle.current?.columns).toBe(1);
  });

  it("keeps group headers inline with their first rows", () => {
    render(
      <ReplicationGrid
        groups={groupStudioRows(ROWS.slice(0, 4), "artist")}
        selection={new Set()}
        anchorId={null}
        onCardActivate={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Hypnagogist" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "John Tenniel" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(4);
  });
});
