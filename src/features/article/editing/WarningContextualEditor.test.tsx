import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContextualEditingContext, type ContextualEditingState } from "@/features/contextual-editing/context";
import WarningContextualEditor from "./WarningContextualEditor.editor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/lsd", useSelectedLayoutSegments: () => [] }));

const editing: ContextualEditingState = {
  enabled: true, mode: "edit", role: "admin", email: "admin@example.test",
  setDirty: () => {}, registerDraftGuard: () => () => {},
};
const preset = {
  key: "opioid", tone: "danger", icon: "lucide:skull", severityLabel: "High risk", headline: "Opioids can stop your breathing.",
  points: ["Never use alone."], enabled: true, allSubstances: false, enabledSlugs: ["heroin"],
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("in-page warning banner editor", () => {
  it("reviews an assignment in the shared sheet, publishes after one confirm, and reports delivery", async () => {
    const posts: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        posts.push(body);
        return Response.json({
          ok: true, key: "opioid", changeId: body.changeId, baseHash: "hash-2", preset: { ...preset, enabledSlugs: body.enabledSlugs },
          affectedSlugs: ["lsd"], allSubstances: false, enabledSlugs: body.enabledSlugs, publication: { status: "pending" },
        });
      }
      if (String(url).includes("key=")) return Response.json({ preset, baseHash: "hash-1", history: [], operation: null });
      return Response.json({ presets: [{ ...preset, baseHash: "hash-1" }] });
    }));
    const user = userEvent.setup();
    render(<ContextualEditingContext.Provider value={editing}><WarningContextualEditor slug="lsd" /></ContextualEditingContext.Provider>);

    await user.click(screen.getByRole("button", { name: "Edit article warnings" }));
    await user.click(await screen.findByRole("checkbox", { name: "Assign opioid to lsd" }));
    await user.click(screen.getByRole("button", { name: "Review" }));

    const sheet = await screen.findByTestId("publish-sheet");
    expect(within(sheet).getByText("Assigned articles")).toBeTruthy();
    expect(within(sheet).getByText("/lsd")).toBeTruthy();
    await user.click(within(sheet).getByRole("button", { name: "Publish" }));
    expect(posts).toHaveLength(0);
    await user.click(within(await screen.findByRole("dialog", { name: /Publish this change/ })).getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(posts).toEqual([expect.objectContaining({ action: "publish", scope: "assignment", enabledSlugs: ["heroin", "lsd"] })]));
    expect(await screen.findByText("Editor host: saved")).toBeTruthy();
    expect(screen.getByText("Public: pending")).toBeTruthy();
    expect(screen.queryByText(/^Published /)).toBeNull();
  });
});
