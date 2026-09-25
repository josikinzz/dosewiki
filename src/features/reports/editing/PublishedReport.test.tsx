import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContextualEditingContext, type ContextualEditingState } from "@/features/contextual-editing/context";
import type { TripReport } from "@/types/tripReport";
import PublishedReportEditor from "./PublishedReport.editor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/reports/alpine-clarity", useSelectedLayoutSegments: () => [] }));
vi.mock("../pages/TripReportDetailPresentation", () => ({ TripReportDetailPresentation: () => <p>Reading preview</p> }));

const editing: ContextualEditingState = {
  enabled: true, mode: "edit", role: "admin", email: "admin@example.test",
  setDirty: () => {}, registerDraftGuard: () => () => {},
};
const fields = {
  title: "Alpine clarity",
  subject: { name: "nervewing", trip_date: "2024-02-02", age: "", gender: "", height: "", weight: "", medications: "", setting: "" },
  substances: [{ name: "Psilocybin", dose: "3 g", roa: "oral" }],
  introduction: "A walk above the treeline.", onset: [], peak: [], offset: [], conclusion: "", tags: ["outdoors"],
};
const report = { slug: "alpine-clarity", featured: false, license: "CC-BY-4.0", ...fields, subject: { ...fields.subject } } as unknown as TripReport;

// jsdom has no layout; the editor scrolls the sheet into view when it opens.
beforeAll(() => { Element.prototype.scrollIntoView ??= () => {}; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("in-page report correction", () => {
  it("publishes through the shared sheet and its one confirm, then reports delivery", async () => {
    const posts: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        posts.push(body);
        return Response.json({ ok: true, slug: "alpine-clarity", fields: body.updates, revision: "revision-2" });
      }
      if (String(url).startsWith("/api/dev/publication-status")) return Response.json({ ok: true, publications: [] });
      return Response.json({ ok: true, report: { id: "report-1", slug: "alpine-clarity", canEdit: true, fields, revision: "revision-1" } });
    }));
    const user = userEvent.setup();
    render(<ContextualEditingContext.Provider value={editing}><PublishedReportEditor report={report} substanceBySlug={{}} /></ContextualEditingContext.Provider>);

    await user.click(screen.getByRole("button", { name: "Correct published report" }));
    const title = await screen.findByLabelText("Report title");
    await user.clear(title);
    await user.type(title, "Alpine clarity, revisited");
    await user.click(screen.getByRole("button", { name: "Review" }));

    const sheet = await screen.findByTestId("publish-sheet");
    expect(within(sheet).getByText("/reports/alpine-clarity")).toBeTruthy();
    expect(within(sheet).getByText("Alpine clarity, revisited")).toBeTruthy();
    await user.click(within(sheet).getByRole("button", { name: "Publish" }));
    expect(posts).toHaveLength(0);
    await user.click(within(await screen.findByRole("dialog", { name: /Publish this change/ })).getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(posts).toEqual([expect.objectContaining({ mode: "save", updates: expect.objectContaining({ title: "Alpine clarity, revisited" }) })]));
    expect(await screen.findByText("Editor host: saved")).toBeTruthy();
    expect(screen.queryByText(/Publication confirmed/)).toBeNull();
  });
});
