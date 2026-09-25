import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContextualEditingContext, type ContextualEditingState } from "@/features/contextual-editing/context";
import { createEmptyArticle, createEmptyDosageRoute } from "@/data/schema";
import type { SubstanceArticle } from "@/schema";
import { DoseTiersTable } from "../components/sections/dosageDurationPanels.client";
import ArticleContextBridge from "./ArticleContextBridge.editor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useSelectedLayoutSegments: () => [] }));
vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} aria-hidden />,
}));
// The real dose table, at route 0, so the field path, the parser and the
// article validation are the ones an editor meets on the page.
vi.mock("../components/ArticleLayout", () => ({
  ArticleLayout: ({ article }: { article: SubstanceArticle }) => <DoseTiersTable
    route={article.dosage.routes[0]} routeIndex={0}
    bioavailabilityContent={null} bioavailabilityNotesContent={null} notesContent={null}
  />,
}));

const route = createEmptyDosageRoute("Oral");
route.dose_ranges.light = { min: 10, max: 20, unit: "mg" };
route.dose_ranges.moderate = { min: 20, max: 40, unit: "mg" };
const article = {
  ...createEmptyArticle(), slug: "fixture", title: "Fixture",
  dosage: { ...createEmptyArticle().dosage, routes: [route] },
} as unknown as SubstanceArticle;

const state: ContextualEditingState = {
  enabled: true, mode: "edit", role: "editor", email: "editor@example.test",
  setDirty: () => {}, registerDraftGuard: () => () => {},
};
const snapshot = (draft: SubstanceArticle | null) => ({
  article, baseHash: "revision", history: [], draftVersion: draft ? 1 : 0,
  draft: draft ? { article: draft, baseHash: "revision", version: 1 } : null,
});
const page = (identity: ContextualEditingState) => <ContextualEditingContext.Provider value={identity}>
  <ArticleContextBridge slug="fixture" article={article}><p>Public reading</p></ArticleContextBridge>
</ContextualEditingContext.Provider>;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("in-page article editing affordances", () => {
  it("shows a mixed-unit dose problem on the field the moment the edit applies", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(snapshot(null))));
    render(page(state));

    const light = await screen.findByRole("button", { name: "Edit Oral light dose" });
    expect(light).toHaveAttribute("data-editable-affordance", "resting");
    await user.click(light);
    const field = screen.getByRole("textbox", { name: "Edit Oral light dose" });
    await user.clear(field);
    await user.type(field, "10-20 g{Enter}");

    const edited = await screen.findByRole("button", { name: "Edit Oral light dose" });
    expect(edited).toHaveAttribute("data-changed", "true");
    expect(edited).toHaveAttribute("data-invalid", "true");
    const row = edited.closest(".theme-dose-tier-row") as HTMLElement;
    expect(within(row).getByRole("alert")).toHaveTextContent("All populated tiers in one route must use the same unit.");
    // The untouched tier the rule also names carries no copy of the error.
    const moderate = screen.getByRole("button", { name: "Edit Oral moderate dose" });
    expect(moderate).not.toHaveAttribute("data-invalid");
    expect(within(moderate.closest(".theme-dose-tier-row") as HTMLElement).queryByRole("alert")).toBeNull();
  });

  it("tells an editor in view mode that a saved private draft exists", async () => {
    const draft = { ...article, summary: "Private correction" } as SubstanceArticle;
    const request = vi.fn(async () => Response.json(snapshot(draft)));
    vi.stubGlobal("fetch", request);
    const setMode = vi.fn();
    render(page({ ...state, mode: "view", setMode }));

    const chip = await screen.findByRole("button", { name: /You have a private draft/ });
    expect(screen.getByText("Public reading")).toBeTruthy();
    await userEvent.setup().click(chip);
    expect(setMode).toHaveBeenCalledWith("edit");
  });

  it("shows no draft chip in view mode when nothing is saved", async () => {
    const request = vi.fn(async () => Response.json(snapshot(null)));
    vi.stubGlobal("fetch", request);
    render(page({ ...state, mode: "view" }));
    await vi.waitFor(() => expect(request).toHaveBeenCalled());
    expect(screen.queryByText(/You have a private draft/)).toBeNull();
  });
});
