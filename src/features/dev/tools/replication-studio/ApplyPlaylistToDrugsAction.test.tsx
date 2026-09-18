import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  owner_email: "josie@example.com",
  editable: true,
};

const PLAYLIST_SUMMARY = {
  ...PLAYLIST,
  work_count: PLAYLIST.replication_slugs.length,
};

const RESULTS = [
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
];

async function openDialog(onReviewGallery = vi.fn()) {
  const user = userEvent.setup();
  render(<ApplyPlaylistToDrugsAction playlist={PLAYLIST_SUMMARY} onReviewGallery={onReviewGallery} />);
  await user.click(screen.getByRole("button", { name: /apply to drugs/i }));
  return { user, onReviewGallery };
}

async function applyToPickedTargets() {
  placeReplicationsOnSubstances.mockResolvedValueOnce(RESULTS);
  const handles = await openDialog();
  await handles.user.click(screen.getByRole("button", { name: /pick lsd and dmt/i }));
  await handles.user.click(screen.getByRole("button", { name: "Apply to 2" }));
  const results = await screen.findByRole("list", { name: "Application results" });
  return { ...handles, results };
}

describe("ApplyPlaylistToDrugsAction", () => {
  beforeEach(() => {
    placeReplicationsOnSubstances.mockReset();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ playlist: PLAYLIST })));
  });

  it("preflights an explicit one-time copy without touching the service", async () => {
    const { user } = await openDialog();

    expect(screen.getByText(/later playlist edits will not change them/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Application preflight")).toHaveTextContent(
      "0 targets · 4 playlist works",
    );
    expect(screen.getByRole("button", { name: "Apply to selected" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /pick lsd and dmt/i }));
    expect(screen.getByLabelText("Application preflight")).toHaveTextContent(
      "2 targets · 4 playlist works",
    );
    expect(screen.getByRole("button", { name: "Apply to 2" })).toBeEnabled();
    expect(placeReplicationsOnSubstances).not.toHaveBeenCalled();
  });

  it("applies the whole playlist to every picked target", async () => {
    await applyToPickedTargets();

    expect(placeReplicationsOnSubstances).toHaveBeenCalledOnce();
    expect(placeReplicationsOnSubstances).toHaveBeenCalledWith({
      substanceSlugs: ["lsd", "dmt"],
      replicationSlugs: ["already-there", "new-work", "excluded-work", "retired-work"],
    });
  });

  it("reports each target independently", async () => {
    const { results } = await applyToPickedTargets();

    const [lsd, dmt] = within(results).getAllByRole("listitem");
    expect(lsd).toHaveTextContent("LSD");
    expect(lsd).toHaveTextContent("1 added · 1 already present · 1 excluded · 1 ineligible");
    expect(dmt).toHaveTextContent("DMT");
    expect(dmt).toHaveTextContent("Conflict");
    expect(dmt).toHaveTextContent("This gallery changed since it was loaded.");
    expect(dmt).toHaveTextContent("0 added · 2 already present · 0 excluded · 0 ineligible");
  });

  it("hands the clicked target's gallery to the review callback", async () => {
    const { user, results, onReviewGallery } = await applyToPickedTargets();

    const [lsd, dmt] = within(results).getAllByRole("listitem");
    expect(within(dmt).getByRole("button", { name: "Review gallery" })).toBeInTheDocument();
    await user.click(within(lsd).getByRole("button", { name: "Review gallery" }));
    expect(onReviewGallery).toHaveBeenCalledOnce();
    expect(onReviewGallery).toHaveBeenCalledWith("lsd");
  });
});
