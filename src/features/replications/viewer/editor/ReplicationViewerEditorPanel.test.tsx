import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReplicationViewerCollection } from "../viewerModel";
import { ReplicationViewerEditorPanel } from "./ReplicationViewerEditorPanel";

const collection: ReplicationViewerCollection = {
  sourcePath: "/effects/tracers",
  label: "Tracers replications",
  kind: "effect",
  grouping: "none",
  editorTarget: {
    kind: "effect",
    key: "tracers",
    label: "Tracers replications",
  },
  groups: [
    {
      key: "tracers",
      label: "Tracers replications",
      items: [
        {
          replication: {
            slug: "work-one",
            title: "Work One",
            artist: "Chelsea Morgan",
            type: "image",
            format: "webp",
            url: "https://cdn.test/work-one.webp",
          },
          effectName: "Tracers",
          effectSlug: "tracers",
          effectCategories: [],
          artistProfileHref: "/replications/artist/chelsea-morgan",
          avatarUrl: null,
        },
      ],
    },
  ],
};

let panelHost: HTMLElement;
let railHost: HTMLElement;

function response(payload: unknown): Response {
  return { ok: true, json: async () => payload } as Response;
}

function renderPanel() {
  return render(
    <ReplicationViewerEditorPanel
      collection={collection}
      activeSlug="work-one"
      panelHost={panelHost}
      railHost={railHost}
      open
      onOpenChange={vi.fn()}
      onReorderModeChange={vi.fn()}
      onActivateSlug={vi.fn()}
      onOrderChange={vi.fn()}
    />,
  );
}

beforeEach(() => {
  panelHost = document.createElement("aside");
  railHost = document.createElement("div");
  document.body.append(panelHost, railHost);
});

afterEach(() => {
  cleanup();
  panelHost.remove();
  railHost.remove();
  vi.unstubAllGlobals();
});

describe("ReplicationViewerEditorPanel assignments", () => {
  it("assigns the active work to a searched drug optimistically", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PATCH" && url.includes("/associations/")) {
        return response({
          ok: true,
          association: {
            slug: "ketamine",
            title: "Ketamine",
            matchedVia: "curated",
            effectSlug: "",
            effectName: "Ketamine",
            excluded: false,
            curatedPosition: 1,
          },
        });
      }
      if (url.endsWith("/playlists")) return response({ ok: true, playlists: [] });
      if (url.endsWith("/substances")) {
        return response({
          ok: true,
          substances: [
            { slug: "ketamine", title: "Ketamine", match_count: 0, curated: false },
          ],
        });
      }
      if (url.includes("/associations/")) {
        return response({ ok: true, associations: [] });
      }
      return response({
        ok: true,
        target: { order: [], updatedAt: null },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPanel();

    const search = await screen.findByRole("searchbox", {
      name: "Assign to a drug",
    });
    await userEvent.type(search, "keta");
    await userEvent.click(screen.getByRole("button", { name: "Ketamine" }));

    expect(await screen.findByText("Manual")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dev/replications/associations/work-one",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ substanceSlug: "ketamine", assigned: true }),
      }),
    );
  });

  it("toggles playlist membership without closing the editor", async () => {
    const playlist = {
      key: "dissociatives",
      title: "Dissociatives",
      replication_slugs: [] as string[],
      updated_at: "2026-08-25T10:00:00.000Z",
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PATCH" && url.endsWith("/playlists/dissociatives")) {
        return response({
          ok: true,
          playlist: { ...playlist, replication_slugs: ["work-one"] },
        });
      }
      if (url.endsWith("/playlists")) {
        return response({ ok: true, playlists: [playlist] });
      }
      if (url.endsWith("/substances")) return response({ ok: true, substances: [] });
      if (url.includes("/associations/")) return response({ ok: true, associations: [] });
      return response({ ok: true, target: { order: [], updatedAt: null } });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPanel();

    const row = await screen.findByRole("button", { name: /Dissociatives/ });
    expect(row).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(row);
    await waitFor(() => expect(row).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: "Close carousel editor" })).toBeVisible();
  });
});
