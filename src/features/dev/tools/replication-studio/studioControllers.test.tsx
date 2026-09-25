import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { readReplicationApiError } from "./replicationStudioApi";
import { useFeaturedController } from "./useFeaturedController";
import { useLibraryController } from "./useLibraryController";
import { usePlaylistsController } from "./usePlaylistsController";
import { useReplicationCorpus } from "./useReplicationCorpus";
import { useReplicationIncoming } from "./useReplicationIncoming";
import { useReplicationSelection } from "./useReplicationSelection";
import { useShowcaseController } from "./useShowcaseController";
import { useStudioWorkspaces } from "./useStudioWorkspaces";
import { useSubstanceGalleryController } from "./useSubstanceGalleryController";

/**
 * Each Replications workspace has its own controller over one shared corpus
 * and selection, and none of them grows back into a 60-member grab bag.
 */
const MAX_MEMBERS = 20;

const noop = () => {};
const reload = async () => {};

describe("Replications controllers", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/dev/replications");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ rows: [], effects: [], playlists: [], substances: [] })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const controllers: [string, () => object][] = [
    ["corpus", () => useReplicationCorpus()],
    ["selection", () => useReplicationSelection({ rows: [], visibleIds: [], setFeedback: noop })],
    ["Library", () => useLibraryController({ rows: [], effectNames: new Map() })],
    ["workspaces", () => useStudioWorkspaces({ guardDraft: (run) => run() })],
    [
      "Showcases",
      () =>
        useShowcaseController({
          rows: [],
          workspaces: useStudioWorkspaces({ guardDraft: (run) => run() }),
          confirm: noop,
        }),
    ],
    ["Featured", () => useFeaturedController({ active: false, rows: [], visibleRows: [], setFeedback: noop })],
    [
      "Incoming",
      () =>
        useReplicationIncoming({
          rows: [],
          loadCorpus: reload,
          setFeedback: noop,
          readError: readReplicationApiError,
        }),
    ],
    ["Playlists", () => usePlaylistsController()],
    [
      "Showcase board",
      () =>
        useSubstanceGalleryController({
          substanceSlug: null,
          corpusRows: [],
          onNavigateToSubstance: noop,
          onDirtyChange: noop,
        }),
    ],
  ];

  it.each(controllers)("the %s controller returns at most 20 members", (_name, useController) => {
    const { result } = renderHook(useController);
    expect(Object.keys(result.current).length).toBeLessThanOrEqual(MAX_MEMBERS);
  });
});
