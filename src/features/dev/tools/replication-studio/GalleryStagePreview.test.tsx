import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { GalleryStagePreview } from "./GalleryStagePreview";

describe("GalleryStagePreview", () => {
  it("is one open disclosure whose copy counts automatic placements as published", async () => {
    const user = userEvent.setup();
    render(<GalleryStagePreview matches={[]} />);

    const toggles = screen.getAllByRole("button", { expanded: true });
    expect(toggles).toHaveLength(1);
    expect(toggles[0]).toHaveTextContent("Hide preview");
    // The article draws automatic placements too, so the copy never says it
    // shows curated works only.
    expect(screen.getByText(/automatic placements and curation together/i)).toBeInTheDocument();
    expect(screen.queryByText(/curated works and nothing else/i)).not.toBeInTheDocument();
    expect(screen.getByText(/as soon as an automatic placement or a curated work/i)).toBeInTheDocument();

    await user.click(toggles[0]);
    expect(screen.getByRole("button", { name: "Show preview" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/No image or video is placed/i)).not.toBeInTheDocument();
  });
});
