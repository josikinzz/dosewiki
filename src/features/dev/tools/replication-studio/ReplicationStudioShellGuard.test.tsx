import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("../../pages/useDevRailBadges", () => ({ useDevRailBadges: () => ({}) }));

import {
  expectRailMarksUnsaved,
  renderInDevShell,
  switchTabExpectingGuard,
} from "../../pages/devShellTestHarness";
import { ReplicationStudioTab } from "./ReplicationStudioTab";

const ROW = {
  id: "row-1",
  slug: "kaleidoscopic-highway-hypnagogist",
  title: "Kaleidoscopic highway",
  artist: "Hypnagogist",
  artist_url: null,
  role: "replication",
  type: "video",
  effect_slug: "geometry",
  effect_name: "Geometry",
  effect_tags: [],
  credit_line: null,
  rights_status: "creator-retained",
  source_url: null,
  rightsholder: "Hypnagogist",
  url: "https://example.invalid/a",
  thumbnail_url: null,
  format: "mp4",
  duration: null,
  file_size: 5834171,
  created_at: "2026-07-28T18:24:53.650Z",
};

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/dev/replications") {
        return Response.json({ ok: true, rows: [ROW], effects: [{ slug: "geometry", name: "Geometry" }] });
      }
      if (url === "/api/dev/replications/featured") return Response.json({ slugs: [], curated: true });
      if (url === "/api/dev/replications/playlists") return Response.json({ playlists: [] });
      return Response.json({ ok: true });
    }),
  );
}

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Replications reports unsaved work to the shell", () => {
  it("marks the rail and asks before a tab switch drops an inspector draft", async () => {
    stubFetch();
    const user = userEvent.setup();
    const { nav, onTabChange } = renderInDevShell(<ReplicationStudioTab />, { tab: "replications" });
    await screen.findByText("Kaleidoscopic highway");

    await user.click(screen.getByRole("option", { name: /Kaleidoscopic highway/ }));
    await user.type(await screen.findByLabelText("Title"), " at dusk");

    expectRailMarksUnsaved(nav, "Replications");
    const dialog = switchTabExpectingGuard(nav, onTabChange);
    expect(within(dialog).getByText("Replications: Kaleidoscopic highway")).toBeTruthy();
    // Editorial saves go live, so the shell only discards.
    expect(within(dialog).queryByRole("button", { name: "Save" })).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Discard" }));
    expect(onTabChange).toHaveBeenCalledWith("articles");
    expect(screen.getByLabelText("Title")).toHaveValue("Kaleidoscopic highway");
  });

  it("covers a reordered Featured selection", async () => {
    stubFetch();
    const user = userEvent.setup();
    const { nav, onTabChange } = renderInDevShell(<ReplicationStudioTab />, { tab: "replications" });
    await screen.findByText("Kaleidoscopic highway");

    await user.click(screen.getByRole("button", { name: "Featured" }));
    await screen.findByText("Featured on the Effect Index homepage");
    await user.click(await screen.findByRole("button", { name: "Curate Kaleidoscopic highway" }));

    expectRailMarksUnsaved(nav, "Replications");
    const dialog = switchTabExpectingGuard(nav, onTabChange);
    expect(within(dialog).getByText("Replications: Featured order")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it("adds no beforeunload listener of its own while dirty", async () => {
    stubFetch();
    const add = vi.spyOn(window, "addEventListener");
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Kaleidoscopic highway");

    await user.click(screen.getByRole("option", { name: /Kaleidoscopic highway/ }));
    await user.type(await screen.findByLabelText("Title"), " at dusk");
    await waitFor(() => expect(screen.getByText("Unsaved changes")).toBeInTheDocument());

    expect(add.mock.calls.filter(([type]) => type === "beforeunload")).toEqual([]);
  });
});
