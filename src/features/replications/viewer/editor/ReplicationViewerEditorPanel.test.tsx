import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextualEditingContext } from "@/features/contextual-editing/context";
import type { ReplicationViewerCollection } from "../viewerModel";
import { ReplicationViewerEditorPanel } from "./ReplicationViewerEditorPanel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useSelectedLayoutSegments: () => [] }));
const collection: ReplicationViewerCollection = {
  sourcePath: "/lsd", label: "LSD showcase", kind: "substance", grouping: "none",
  editorTarget: { kind: "substance", key: "lsd", label: "LSD showcase" },
  groups: [{ key: "lsd", label: "LSD", items: ["work-one", "work-two"].map(slug => ({
    replication: { slug, title: slug, artist: "Artist", type: "image", format: "jpg", url: `https://example.com/${slug}.jpg` },
    effectName: null, effectSlug: null, effectCategories: [], artistProfileHref: null, avatarUrl: null,
  })) }],
};
const detail = {
  row: { id: "replication-one", slug: "work-one", title: "work-one", artist: "Artist", role: "replication", type: "image", effect_slug: null, effect_tags: [], credit_line: "Original credit", source_url: null, artist_url: null, url: "https://example.com/work-one.jpg", thumbnail_url: null, format: "jpg", duration: null, file_size: null, created_at: "2026-01-01" },
  revision: "canonical-revision-one", effects: [], playlists: [],
  collection: { revision: "showcase-revision-one", order: ["work-one", "work-two"], editable: true, title: "LSD showcase" },
};
let panelHost: HTMLElement;
let railHost: HTMLElement;
const editing = { enabled: true, mode: "edit" as const, role: "admin" as const, email: "admin@example.com", setDirty: vi.fn(), registerDraftGuard: () => () => {} };
function renderPanel() {
  return render(<ContextualEditingContext.Provider value={editing}><ReplicationViewerEditorPanel collection={collection} activeSlug="work-one" panelHost={panelHost} railHost={railHost} open onOpenChange={vi.fn()} onReorderModeChange={vi.fn()} onActivateSlug={vi.fn()} onOrderChange={vi.fn()} /></ContextualEditingContext.Provider>);
}
/** Publish from the shared sheet, then answer its one confirm. */
async function publishThroughSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(await screen.findByTestId("publish-sheet")).getByRole("button", { name: "Publish" }));
  await user.click(within(await screen.findByRole("dialog", { name: /Publish this change/ })).getByRole("button", { name: "Publish" }));
}
beforeEach(() => {
  panelHost = document.createElement("aside"); railHost = document.createElement("div"); document.body.append(panelHost, railHost);
});
afterEach(() => { cleanup(); panelHost.remove(); railHost.remove(); vi.unstubAllGlobals(); });

describe("reviewed viewer publication", () => {
  it("keeps keyboard collection changes local until explicit confirmation", async () => {
    const publications: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init?: RequestInit) => {
      if (init?.method === "POST") { publications.push(JSON.parse(String(init.body))); return Response.json({ ok: true }); }
      return Response.json(detail);
    }));
    renderPanel();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Move work-two up" }));
    expect(publications).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Review" }));
    expect(publications).toEqual([]);
    // The shared sheet: the diff in plain words, the page it reaches, one confirm.
    const sheet = await screen.findByTestId("publish-sheet");
    expect(within(sheet).getByText("Works, in order")).toBeInTheDocument();
    expect(within(sheet).getByText("/lsd")).toBeInTheDocument();
    await publishThroughSheet(user);
    await waitFor(() => expect(publications).toEqual([expect.objectContaining({ mode: "collection", change: expect.objectContaining({ targetKind: "substance", targetKey: "lsd", expectedRevision: "showcase-revision-one", slugs: ["work-two", "work-one"] }) })]));
    expect(await screen.findByText("Editor host: saved")).toBeInTheDocument();
  });

  it("retains a canonical draft after a conflict and reuses the publication identity on retry", async () => {
    const publications: { change: { requestId: string } }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init?: RequestInit) => {
      if (init?.method === "POST") { publications.push(JSON.parse(String(init.body))); return Response.json({ error: "This record changed; your draft is retained." }, { status: 409 }); }
      return Response.json(detail);
    }));
    renderPanel();
    const user = userEvent.setup();
    await screen.findByRole("button", { name: "Move work-two up" });
    await user.click(screen.getByRole("button", { name: "Canonical metadata" }));
    const credit = screen.getByLabelText("Credit line");
    await user.clear(credit); await user.type(credit, "Corrected artist credit");
    await user.click(screen.getByRole("button", { name: "Review" }));
    await publishThroughSheet(user);
    await screen.findByRole("alert");
    expect(credit).toHaveValue("Corrected artist credit");
    expect(screen.queryByText(/Saved on the editor host/)).not.toBeInTheDocument();
    await publishThroughSheet(user);
    await waitFor(() => expect(publications).toHaveLength(2));
    expect(publications[0].change.requestId).toEqual(publications[1].change.requestId);
  });

  it("blocks discard and viewer close after an ambiguous write until explicit same-request reconciliation", async () => {
    const publications: { change: { requestId: string } }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init?: RequestInit) => {
      if (init?.method === "POST") {
        publications.push(JSON.parse(String(init.body)));
        if (publications.length === 1) throw new TypeError("Connection lost after sending publication");
        return Response.json({ ok: true, reconciled: true });
      }
      return Response.json(detail);
    }));
    renderPanel();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Move work-two up" }));
    await user.click(screen.getByRole("button", { name: "Review" }));
    await publishThroughSheet(user);
    const retry = await screen.findByRole("button", { name: "Retry exact reviewed publication" });
    await waitFor(() => expect(retry).toBeEnabled());
    expect(screen.getByRole("button", { name: /discard/i })).toBeDisabled();
    expect(screen.queryByTestId("publish-sheet")).not.toBeInTheDocument();
    const proceed = vi.fn();
    const close = new CustomEvent("replication-viewer-before-close", { cancelable: true, detail: { proceed } });
    expect(document.dispatchEvent(close)).toBe(false);
    expect(proceed).not.toHaveBeenCalled();
    expect(publications).toHaveLength(1);
    await user.click(retry);
    await screen.findByText(/Saved on the editor host/);
    expect(publications).toHaveLength(2);
    expect(publications[1].change.requestId).toBe(publications[0].change.requestId);
  });
});
