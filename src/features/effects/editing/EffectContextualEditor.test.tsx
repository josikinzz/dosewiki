import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { ContextualEditingContext, type ContextualEditingState } from "@/features/contextual-editing/context";
import EffectContextualEditor from "./EffectContextualEditor.editor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/effects/drifting", useSelectedLayoutSegments: () => [] }));
vi.mock("../pages/EffectArticlePage", () => ({ EffectArticlePage: () => <div>Effect preview</div> }));
vi.mock("../articleSectionModel", () => ({ buildEffectArticleModel: () => ({ sections: [] }) }));

const editing: ContextualEditingState = {
  enabled: true, mode: "edit", role: "admin", email: "admin@example.test",
  setDirty: () => {}, registerDraftGuard: () => () => {},
};
const effect = { slug: "drifting", name: "Drifting", summary: "Surfaces move.", description_raw: "Surfaces appear to move.", tags: [] };
const pageProps = { article: { hero: { name: "Drifting" }, sections: [] } } as unknown as ComponentProps<typeof EffectContextualEditor>["pageProps"];

// jsdom has no layout; the editor scrolls the sheet into view when it opens.
beforeAll(() => { Element.prototype.scrollIntoView ??= () => {}; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("in-page effect editor", () => {
  it("publishes through the shared sheet and its one confirm, then reports delivery", async () => {
    const posts: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") { posts.push(JSON.parse(String(init.body))); return Response.json({ ok: true, revision: "b".repeat(64) }); }
      if (String(url).startsWith("/api/dev/publication-status")) return Response.json({ ok: true, publications: [] });
      return Response.json({ ok: true, effect, baseRevision: "a".repeat(64), history: [] });
    }));
    const user = userEvent.setup();
    render(<ContextualEditingContext.Provider value={editing}><EffectContextualEditor slug="drifting" pageProps={pageProps} /></ContextualEditingContext.Provider>);

    await user.click(screen.getByRole("button", { name: "Edit effect" }));
    const name = await screen.findByLabelText(/^Name/);
    await user.clear(name);
    await user.type(name, "Visual drifting");
    await user.click(screen.getByRole("button", { name: "Review" }));

    const sheet = await screen.findByTestId("publish-sheet");
    expect(within(sheet).getByText("/effects/drifting")).toBeTruthy();
    expect(within(sheet).getByRole("region", { name: "Name: local changes" }).textContent).toBe("Visual drifting");
    await user.click(within(sheet).getByRole("button", { name: "Publish" }));
    expect(posts).toHaveLength(0);
    await user.click(within(await screen.findByRole("dialog", { name: /Publish this change/ })).getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(posts).toEqual([expect.objectContaining({ slug: "drifting", draft: expect.objectContaining({ name: "Visual drifting" }) })]));
    expect(await screen.findByText("Editor host: saved")).toBeTruthy();
    expect(screen.getByText("Public: not reported")).toBeTruthy();
    expect(screen.queryByText(/^Published\./)).toBeNull();
  });
});
