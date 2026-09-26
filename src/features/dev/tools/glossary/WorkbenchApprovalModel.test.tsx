import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetSearchManifestForTests } from "@/hooks/useSearchManifest";
import type { UiTranslationRow } from "@lib/translation/uiTranslationTypes";
import type { StyleGuidePacket } from "@lib/translation/styleGuideTypes";
import { GlossaryTab } from "./GlossaryTab";
import { RunsPanel } from "./RunsPanel";
import type { GlossaryList, GlossaryRow } from "./glossaryModel";

/**
 * The translator's day in the workbench: it opens on the Inbox, Articles
 * lists what needs review, and terms, interface text, article paragraphs and
 * the style guide share one reason control and one save-then-approve model.
 * `zh-Hans` is the locale because the code is distinctive enough that a
 * visible-text check cannot match it by accident.
 */
const LOCALE = "zh-Hans";
const NO_JOBS = { runId: null, requestedAt: null, total: 0, active: 0, completed: 0, completedWithRejections: 0, exhausted: 0 };
const ROW_ID = "a".repeat(64);

function term(name: string, status: GlossaryRow["status"]): GlossaryRow {
  return { locale: LOCALE, term: name, target: `${name}译`, kind: "effect-name", status, source: "model", reviewed_at: null, reviewed_by: null, retranslated_at: null, updated_at: 1, revision: "1:0", approved_target: null, review_provenance: "unreviewed" };
}

const uiRow = (): UiTranslationRow => ({ id: "appearance.light", source: "Light", context: "Appearance color scheme", locations: ["Appearance panel"], glossaryTerms: [], revision: 0, draft: null, approved: null, updatedAt: null, compiledTarget: null, status: "missing" });

type Write = { path: string; body: Record<string, unknown> };

function coveragePage(slug: string, counts: Partial<Record<"missing" | "stale" | "rejected" | "glossaryMisses" | "repeatedPunctuation" | "leftoverLatin", number>>, kind = "article") {
  return { records: 1, units: 10, current: 0, missing: 0, stale: 0, rejected: 0, glossaryMisses: 0, repeatedPunctuation: 0, leftoverLatin: 0, ...counts, kind, slug, href: `/${slug}` };
}

function stubWorkbench() {
  const writes: Write[] = [];
  const reads: string[] = [];
  let ui = uiRow();
  let guide: StyleGuidePacket = { locale: LOCALE, revision: 1, draft: null, approved: { rules: ["Keep it short."], examples: [] }, approvedRevision: "0000000000000000", history: [{ revision: 1, action: "approve", actor: "reviewer", reason: { kind: "fluency", note: "" }, createdAt: 1 } as unknown as NonNullable<StyleGuidePacket["history"]>[number]] };
  const narrativeRow = { id: ROW_ID, hash: "h", field: "summary", source: "A stimulant.", context: "c", machine: { target: "一种兴奋剂。" }, revision: 0, draft: null as null | { source: string; context: string; target: string }, approved: null as null | { source: string; context: string; target: string }, overlay: null, status: "unreviewed", usages: null, glossary: [] };
  const rows = [term("euphoria", "draft")];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "https://dev.dose.wiki");
    const path = url.pathname;
    if (!init?.body) {
      reads.push(`${path}${url.search}`);
      if (path === "/api/dev/translation-glossary") {
        const list: GlossaryList = { ok: true, generatedAt: 1, locale: LOCALE, promptVersion: "v1", segments: { total: 10, current: 10 }, jobs: NO_JOBS, locales: [{ locale: LOCALE, live: true, draft: 1, approved: 0 }], rows: rows.map((r) => ({ ...r })), pending: [], glosses: {} };
        return Response.json(list);
      }
      if (path === "/api/dev/translation-inbox") return Response.json({ ok: true, locale: LOCALE, items: [], total: 0, offset: 0, pageSize: 50, checked: [], counts: {}, reason: null });
      if (path === "/api/dev/translation-workbench") return Response.json({ ok: true, locale: LOCALE, rows: [ui] });
      if (path === "/api/dev/translation-style-guide") return Response.json(guide);
      if (path === "/api/dev/translation-coverage") return Response.json({
        ok: true, locale: LOCALE, pages: [
          coveragePage("mdma", { stale: 1 }),
          coveragePage("home", { missing: 50 }, "page"),
          coveragePage("2c-b", { rejected: 2, glossaryMisses: 3, leftoverLatin: 1 }),
          coveragePage("lsd", { missing: 2, stale: 1 }),
        ], affectedPagesTotal: 4,
      });
      if (path === "/api/dev/translation-narrative") return Response.json({ locale: LOCALE, kind: "article", slug: url.searchParams.get("slug"), sourceVersion: "v".repeat(64), tally: { humanApproved: 0, total: 1 }, rows: [narrativeRow], history: [] });
      if (path === "/api/dev/translation-note") return Response.json({ ok: true, notes: [] });
      if (path.startsWith("/api/search-manifest")) return Response.json({ locale: LOCALE, version: "v", shape: 2, entries: [] });
      return Response.json({ ok: true, items: [], rows: [] });
    }
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    writes.push({ path, body });
    if (path === "/api/dev/translation-workbench") {
      ui = body.action === "save"
        ? { ...ui, revision: ui.revision + 1, draft: { source: ui.source, context: ui.context, target: String(body.target) }, status: "draft" }
        : { ...ui, revision: ui.revision + 1, approved: ui.draft, draft: null, status: "approved" };
      return Response.json({ ok: true, row: ui });
    }
    if (path === "/api/dev/translation-style-guide") {
      if (body.action === "save") guide = { ...guide, revision: guide.revision + 1, draft: body.guide as StyleGuidePacket["draft"] };
      if (body.action === "restore") guide = { ...guide, revision: guide.revision + 1, draft: guide.approved };
      if (body.action === "approve") guide = { ...guide, revision: guide.revision + 1, approved: guide.draft, draft: null };
      return Response.json({ ok: true, entry: {}, packet: guide });
    }
    if (path === "/api/dev/translation-narrative") {
      narrativeRow.revision += 1;
      if (body.action === "save") { narrativeRow.draft = { source: narrativeRow.source, context: narrativeRow.context, target: String(body.target) }; narrativeRow.status = "draft"; }
      if (body.action === "approve") { narrativeRow.approved = narrativeRow.draft; narrativeRow.draft = null; narrativeRow.status = "approved"; }
      return Response.json({ ok: true, entry: { revision: narrativeRow.revision }, publication: [] });
    }
    if (path.endsWith("/edit")) {
      const row = rows.find((r) => r.term === body.term)!;
      row.target = String(body.target);
      row.revision = "1:1";
      return Response.json({ ok: true, row });
    }
    if (path.endsWith("/approve")) {
      for (const r of rows) if ((body.terms as string[]).includes(r.term)) r.status = "approved";
      return Response.json({ ok: true, approved: body.terms });
    }
    return Response.json({ ok: true });
  }));
  return { writes, reads };
}

const view = (name: string) => within(screen.getByRole("tablist", { name: "Workbench view" })).getByRole("tab", { name: new RegExp(`^${name}(,|$)`) });
const REASON_NAMES = ["Fluency", "Terminology", "Accuracy", "Local addition"];

/** The one reason control: the four kinds and an optional note, the same on every surface. */
function expectReasonPicker(scope: HTMLElement) {
  const picker = within(scope).getByRole("group", { name: "Reason" });
  for (const name of REASON_NAMES) expect(within(picker).getByRole("button", { name })).toBeInTheDocument();
  expect(within(picker).getByRole("textbox", { name: /note/i })).toBeInTheDocument();
  return picker;
}

describe("translation workbench for a translator", () => {
  beforeEach(() => window.history.replaceState({}, "", `/dev/glossary?locale=${LOCALE}`));
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSearchManifestForTests();
    window.history.replaceState({}, "", "/");
  });

  it("opens on the Inbox, first in the nav", async () => {
    const { reads } = stubWorkbench();
    render(<GlossaryTab viewerRole="translator" />);
    await waitFor(() => expect(view("Inbox")).toHaveAttribute("aria-selected", "true"));
    const names = within(screen.getByRole("tablist", { name: "Workbench view" })).getAllByRole("tab").map((tab) => /^[A-Za-z ]+/.exec(tab.textContent ?? "")?.[0].trim());
    expect(names[0]).toBe("Inbox");
    await waitFor(() => expect(reads.some((read) => read.startsWith("/api/dev/translation-inbox"))).toBe(true));
  });

  it("says in the header that a translator can approve their own edits", async () => {
    stubWorkbench();
    render(<GlossaryTab viewerRole="translator" />);
    expect(await screen.findByText(/You can approve your own edits/)).toBeInTheDocument();
    expect(screen.queryByText(/is a draft until someone approves it/)).not.toBeInTheDocument();
  });

  it("has no hidden setting for how term approvals are recorded", async () => {
    stubWorkbench();
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    await user.click(await screen.findByRole("tab", { name: /^Terms/ }));
    await user.type(screen.getByRole("searchbox", { name: "Search words" }), "euphoria");
    await screen.findByRole("textbox", { name: "Translation for euphoria" });
    expect(screen.queryByText(/Approvals here are recorded as/)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /recorded as/ })).not.toBeInTheDocument();
  });

  it("lists articles needing review, most work first, and opens one", async () => {
    const { reads } = stubWorkbench();
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    await user.click(await screen.findByRole("tab", { name: /^Articles/ }));
    const list = await screen.findByRole("list", { name: "Articles needing review" });
    const items = within(list).getAllByRole("listitem");
    // Articles only, ranked by how much there is to check.
    expect(items.map((item) => within(item).getByRole("button").getAttribute("aria-label")?.split(",")[0])).toEqual(["2c-b", "lsd", "mdma"]);
    expect(within(items[0]).getByRole("button", { name: "2c-b, 6 to check" })).toBeInTheDocument();
    await user.click(within(items[0]).getByRole("button", { name: /^2c-b,/ }));
    await screen.findByText("0 of 1 paragraphs human approved");
    expect(reads.some((read) => read.startsWith("/api/dev/translation-narrative?") && read.includes("slug=2c-b"))).toBe(true);
  });

  it("renders the same reason control on terms, interface text, article paragraphs and the style guide", async () => {
    stubWorkbench();
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);

    await user.click(await screen.findByRole("tab", { name: /^Terms/ }));
    await user.type(screen.getByRole("searchbox", { name: "Search words" }), "euphoria");
    const termInput = await screen.findByRole("textbox", { name: "Translation for euphoria" });
    await user.clear(termInput);
    await user.type(termInput, "欣快");
    expectReasonPicker(termInput.closest("[data-term]") as HTMLElement);
    await user.clear(screen.getByRole("searchbox", { name: "Search words" }));

    await user.click(view("Interface text"));
    const label = await screen.findByRole("textbox", { name: "Translation for appearance.light" });
    expectReasonPicker(label.closest("section[aria-label='UI labels']") as HTMLElement);

    await user.click(view("Style guide"));
    expectReasonPicker(await screen.findByRole("region", { name: "Style guide" }));

    await user.click(view("Articles"));
    await user.click(await screen.findByRole("button", { name: /^mdma,/ }));
    await user.click(await screen.findByRole("button", { name: "Review summary" }));
    await screen.findByRole("textbox", { name: "Correction" });
    expectReasonPicker(screen.getByRole("region", { name: "Narrative review" }));
  }, 20_000);

  it("never shows a raw language code in visible text", async () => {
    stubWorkbench();
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="admin" />);
    await screen.findByRole("region", { name: "Review inbox" });
    // Each view's own content has loaded before its text is read; hidden views stay mounted, so they are read too.
    const loaded: [string, () => Promise<unknown>][] = [
      ["Terms", () => screen.findByTestId("glossary-summary")],
      ["Interface text", () => screen.findByRole("textbox", { name: "Translation for appearance.light" })],
      ["Style guide", () => screen.findByRole("textbox", { name: "Rules, one per line" })],
      ["Articles", () => screen.findByRole("list", { name: "Articles needing review" })],
    ];
    for (const [name, ready] of loaded) {
      await user.click(view(name));
      await ready();
      expect(document.body.textContent ?? "").not.toMatch(/zh-Hans/);
    }
    await user.click(view("Articles"));
    await user.click(await screen.findByRole("button", { name: /^mdma,/ }));
    await screen.findByText("0 of 1 paragraphs human approved");
    expect(document.body.textContent ?? "").not.toMatch(/zh-Hans/);
  }, 20_000);

  it("names no particular model in the run controls", () => {
    const data = { ok: true, generatedAt: 1, locale: LOCALE, promptVersion: "v1", segments: { total: 0, current: 0 }, jobs: NO_JOBS, locales: [], rows: [term("euphoria", "approved")], pending: [], glosses: {} } satisfies GlossaryList;
    render(<RunsPanel data={data} pending={[]} reviewComplete draftCount={0} locked={false} starting={false} refreshError={null} onRefresh={() => {}} onStart={() => {}} onRetranslate={() => {}} onRetryExhausted={() => {}} />);
    expect(screen.getByText(/requests to the translation model/)).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/GLM/);
  });
});

describe("one save-then-approve model", () => {
  beforeEach(() => window.history.replaceState({}, "", `/dev/glossary?locale=${LOCALE}`));
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSearchManifestForTests();
    window.history.replaceState({}, "", "/");
  });

  it("saves then approves interface text in one action, approving exactly the saved revision", async () => {
    const { writes } = stubWorkbench();
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    await user.click(await screen.findByRole("tab", { name: /^Interface text/ }));
    const input = await screen.findByRole("textbox", { name: "Translation for appearance.light" });
    await user.type(input, "浅色");
    // A changed wording names its reason before it is saved.
    expect(screen.getByRole("button", { name: "Save and approve" })).toBeDisabled();
    expect(screen.getByText("Choose a reason to save this change.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Fluency" }));
    await user.click(screen.getByRole("button", { name: "Save and approve" }));
    await screen.findByText("Approved. It goes live with the next site release.");
    expect(writes.map((write) => write.body.action)).toEqual(["save", "approve"]);
    expect(writes[1].body).toMatchObject({ expectedRevision: 1 });
  });

  it("saves then approves an article paragraph in one action", async () => {
    const { writes } = stubWorkbench();
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    await user.click(await screen.findByRole("tab", { name: /^Articles/ }));
    await user.click(await screen.findByRole("button", { name: /^mdma,/ }));
    await user.click(await screen.findByRole("button", { name: "Review summary" }));
    const correction = await screen.findByRole("textbox", { name: "Correction" });
    await user.clear(correction);
    await user.type(correction, "一种中枢兴奋剂。");
    await user.click(screen.getByRole("button", { name: "Accuracy" }));
    await user.click(screen.getByRole("button", { name: "Save and approve" }));
    await screen.findByText("Approved for this field only.");
    expect(writes.map((write) => write.body.action)).toEqual(["save", "approve"]);
    expect(writes[1].body).toMatchObject({ expectedRevision: 1, target: "一种中枢兴奋剂。" });
  });

  it("saves a style guide change with a reason chip, no free text, and restores without one", async () => {
    const { writes } = stubWorkbench();
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    await user.click(await screen.findByRole("tab", { name: /^Style guide/ }));
    const rules = await screen.findByRole("textbox", { name: "Rules, one per line" });
    await user.type(rules, "{enter}Use full sentences.");
    await user.click(screen.getByRole("button", { name: "Fluency" }));
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Draft saved. Translations still follow the approved guide.");
    expect(writes[0].body).toMatchObject({ action: "save", reason: { kind: "fluency", note: "" } });
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await screen.findByText(/^Approved\./);
    expect(writes[1].body).toMatchObject({ action: "approve", expectedRevision: 2 });
    await waitFor(() => expect(screen.getByRole("button", { name: "Restore revision 1 as draft" })).toBeEnabled());
  });
});
