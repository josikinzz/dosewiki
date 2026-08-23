import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { placeReplicationsOnSubstances } = vi.hoisted(() => ({
  placeReplicationsOnSubstances: vi.fn(),
}));

vi.mock("./replicationPlacementService", () => ({
  placeReplicationsOnSubstances,
}));

vi.mock("./SubstanceTargetPicker", () => ({
  SubstanceTargetPicker: ({
    selectedSlugs,
    onSelectedSlugsChange,
    disabled,
  }: {
    selectedSlugs: readonly string[];
    onSelectedSlugsChange: (slugs: string[]) => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelectedSlugsChange(["lsd", "dmt"])}
    >
      Pick LSD and DMT ({selectedSlugs.length})
    </button>
  ),
}));

import { ApplyPlaylistToDrugsAction } from "./ApplyPlaylistToDrugsAction";
import type { ReplicationPlaylist } from "./replicationPlaylistModel";

const PLAYLIST: ReplicationPlaylist = {
  key: "visual-journey",
  title: "Visual journey",
  replication_slugs: ["already-there", "new-work", "excluded-work", "retired-work"],
  updated_at: "2026-08-20T10:00:00.000Z",
  updated_by: "josie",
};

describe("ApplyPlaylistToDrugsAction", () => {
  it("preflights an explicit one-time copy and reports each target independently", async () => {
    const user = userEvent.setup();
    const onReviewGallery = vi.fn();
    placeReplicationsOnSubstances.mockResolvedValueOnce([
      {
        substanceSlug: "lsd",
        substanceTitle: "LSD",
        status: "saved",
        added: ["new-work"],
        alreadyPresent: ["already-there"],
        excluded: ["excluded-work"],
        ineligible: ["retired-work"],
      },
      {
        substanceSlug: "dmt",
        substanceTitle: "DMT",
        status: "conflict",
        added: [],
        alreadyPresent: ["already-there", "new-work"],
        excluded: [],
        ineligible: [],
        message: "This gallery changed since it was loaded.",
      },
    ]);

    render(
      <ApplyPlaylistToDrugsAction playlist={PLAYLIST} onReviewGallery={onReviewGallery} />,
    );
    await user.click(screen.getByRole("button", { name: /apply to drugs/i }));

    expect(screen.getByText(/later playlist edits will not change them/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Application preflight")).toHaveTextContent(
      "0 targets · 4 playlist works",
    );
    expect(placeReplicationsOnSubstances).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /pick lsd and dmt/i }));
    expect(screen.getByLabelText("Application preflight")).toHaveTextContent(
      "2 targets · 4 playlist works",
    );
    expect(placeReplicationsOnSubstances).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Apply to 2" }));
    expect(placeReplicationsOnSubstances).toHaveBeenCalledWith({
      substanceSlugs: ["lsd", "dmt"],
      replicationSlugs: ["already-there", "new-work", "excluded-work", "retired-work"],
    });

    const results = await screen.findByLabelText("Application results");
    const lsd = within(results).getByText("LSD").closest("div.rounded-lg");
    const dmt = within(results).getByText("DMT").closest("div.rounded-lg");
    expect(lsd).not.toBeNull();
    expect(dmt).not.toBeNull();
    expect(lsd).toHaveTextContent("1 added · 1 already present · 1 excluded · 1 ineligible");
    expect(dmt).toHaveTextContent("Conflict — This gallery changed since it was loaded.");
    expect(dmt).toHaveTextContent("0 added · 2 already present · 0 excluded · 0 ineligible");
    const reviewButtons = within(results).getAllByRole("button", { name: "Review gallery" });
    expect(reviewButtons).toHaveLength(2);
    await user.click(reviewButtons[0]);
    expect(onReviewGallery).toHaveBeenCalledOnce();
    expect(onReviewGallery).toHaveBeenCalledWith("lsd");
  });
});
