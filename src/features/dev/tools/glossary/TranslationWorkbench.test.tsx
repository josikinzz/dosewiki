import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UiTranslationRow } from "@lib/translation/uiTranslationTypes";
import { UiTranslationWorkbench } from "./UiTranslationWorkbench";
import { TranslationChanges } from "./TranslationChanges";
import { TranslationHistory } from "./TranslationHistory";
import { TranslationCoverage } from "./TranslationCoverage";

const source = { source: "Light", context: "Appearance color scheme", target: "浅色" };
const label = (): UiTranslationRow => ({ id: "appearance.light", source: source.source, context: source.context, locations: ["Appearance panel"], glossaryTerms: [], revision: 0, draft: null, approved: null, updatedAt: null, compiledTarget: null, status: "missing" });

afterEach(() => vi.unstubAllGlobals());

describe("UI translation review", () => {
  it("saves without approving and approves only the exact saved revision", async () => {
    let row = label();
    const writes: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      if (!init) return Response.json({ ok: true, locale: "zh-Hans", locales: ["zh-Hans"], rows: [row] });
      const body = JSON.parse(init.body); writes.push(body);
      row = body.action === "save" ? { ...row, revision: 1, draft: source, status: "draft" } : { ...row, revision: 2, draft: null, approved: source, status: "approved" };
      return Response.json({ ok: true, row });
    }));
    const user = userEvent.setup();
    render(<UiTranslationWorkbench locale="zh-Hans" />);
    const input = await screen.findByRole("textbox", { name: "Translation for appearance.light" });
    await user.type(input, "浅色");
    expect(screen.getByRole("button", { name: "Approve saved draft" })).toBeDisabled();
    // A correction names its reason before it is saved.
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Fluency" }));
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Draft saved. The approved wording is unchanged.");
    expect(writes[0]).toMatchObject({ action: "save", expectedRevision: 0, target: "浅色", reason: { kind: "fluency", note: "" }, glossaryExceptions: [] });
    expect(writes).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Approve saved draft" }));
    await screen.findByText("Approved. Awaiting a UI catalog build, deployment, and public verification.");
    expect(writes[1]).toMatchObject({ action: "approve", expectedRevision: 1 });
    expect(writes[1]).not.toHaveProperty("target");
  });

  it("prefills compiled wording without treating it as human approved", async () => {
    const row: UiTranslationRow = { ...label(), compiledTarget: "浅色", status: "unreviewed" };
    const writes: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      if (!init) return Response.json({ rows: [row] });
      writes.push(JSON.parse(init.body));
      return Response.json({ row: { ...row, draft: source, status: "draft", revision: 1 } });
    }));
    const user = userEvent.setup();
    render(<UiTranslationWorkbench locale="zh-Hans" />);
    expect(await screen.findByRole("textbox", { name: "Translation for appearance.light" })).toHaveValue("浅色");
    expect(screen.getByText("No human review")).toBeInTheDocument();
    expect(screen.getByText("Compiled wording (not verified live):")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve saved draft" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Fluency" }));
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Draft saved. The approved wording is unchanged.");
    expect(writes[0]).toMatchObject({ action: "save", target: "浅色", expectedRevision: 0 });
  });

  it("keeps the draft on a concurrent revision conflict and never retries automatically", async () => {
    const fetcher = vi.fn(async (_url, init) => init ? Response.json({ error: "This translation changed. Reload before reviewing." }, { status: 409 }) : Response.json({ rows: [label()] }));
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<UiTranslationWorkbench locale="zh-Hans" />);
    const input = await screen.findByRole("textbox", { name: "Translation for appearance.light" });
    await user.type(input, "浅色");
    await user.click(screen.getByRole("button", { name: "Fluency" }));
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("This translation changed. Reload before reviewing.");
    expect(input).toHaveValue("浅色");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Approve saved draft" })).toBeDisabled();
  });

  it("shows who changed wording and restores a historical revision as a draft", async () => {
    const writes: Record<string, unknown>[] = [];
    const row = { ...label(), revision: 2, approved: source, status: "approved" as const };
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      if (String(url).includes("/history")) return Response.json({ history: [{ revision: 1, action: "save", before: { revision: 0, draft: null, approved: null }, after: { revision: 1, draft: source, approved: null }, actor: "reviewer", reason: { kind: "unspecified", note: "Appearance, not dose intensity" }, glossaryExceptions: [], createdAt: 1 }] });
      if (!init) return Response.json({ rows: [row] });
      writes.push(JSON.parse(init.body));
      return Response.json({ row: { ...row, revision: 3, draft: source, status: "draft" } });
    }));
    const user = userEvent.setup();
    render(<UiTranslationWorkbench locale="zh-Hans" />);
    await user.click(await screen.findByRole("button", { name: "History for appearance.light" }));
    await screen.findByText("Appearance, not dose intensity");
    expect(screen.getByText(/reviewer ·/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore revision 1 as draft" }));
    await screen.findByText("Restored as a draft. Review the wording before approving.");
    expect(writes[0]).toMatchObject({ action: "restore", expectedRevision: 2, restoreRevision: 1 });
    expect(screen.getByRole("button", { name: "Approve saved draft" })).toBeEnabled();
    expect(screen.getByText("Approved wording:")).toBeInTheDocument();
  });

  it("retains target and review note through search and pagination", async () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ ...label(), id: `label.${i}`, source: `Label ${i}` }));
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ rows })));
    const user = userEvent.setup();
    render(<UiTranslationWorkbench locale="zh-Hans" />);
    await user.type(await screen.findByRole("textbox", { name: "Translation for label.0" }), "Keep this correction");
    await user.type(screen.getByRole("textbox", { name: "Review note for label.0" }), "Keep this reasoning");
    await user.click(screen.getByRole("button", { name: "Next labels" }));
    await user.click(screen.getByRole("button", { name: "Previous labels" }));
    expect(screen.getByRole("textbox", { name: "Translation for label.0" })).toHaveValue("Keep this correction");
    const search = screen.getByRole("searchbox", { name: "Search UI labels" });
    await user.type(search, "Label 39");
    await user.clear(search);
    expect(screen.getByRole("textbox", { name: "Translation for label.0" })).toHaveValue("Keep this correction");
    expect(screen.getByRole("textbox", { name: "Review note for label.0" })).toHaveValue("Keep this reasoning");
  });

  it("bounds the number of editable labels and searches the entire inventory", async () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ ...label(), id: `label.${i}`, source: `Label ${i}` }));
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ rows })));
    const user = userEvent.setup();
    render(<UiTranslationWorkbench locale="zh-Hans" />);
    await screen.findByRole("textbox", { name: "Translation for label.0" });
    expect(screen.getAllByRole("textbox", { name: /^Translation for/ })).toHaveLength(30);
    await user.type(screen.getByRole("searchbox", { name: "Search UI labels" }), "Label 79");
    expect(await screen.findByRole("textbox", { name: "Translation for label.79" })).toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: /^Translation for/ })).toHaveLength(1);
  });
});

it("checks source coverage on demand and never equates completed jobs with publication", async () => {
  const counts = { records: 5, units: 20, current: 2, missing: 17, stale: 1, rejected: 0, glossaryMisses: 0, repeatedPunctuation: 1, leftoverLatin: 3 };
  const fetcher = vi.fn(async () => Response.json({ locale: "zh-Hans", summary: counts, byKind: [{ ...counts, kind: "article" }], pages: [], affectedPagesTotal: 0, generatedAt: 1, inventoryGeneratedAt: 1, queue: { queued: 0, running: 0, failed: 0, completed: 2, retrying: 0 }, exclusions: ["Interactive controls are checked separately."], publication: { status: "unverified", message: "Public deployment has not been verified." } }));
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<TranslationCoverage locale="zh-Hans" />);
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Check coverage" }));
  await screen.findByText("2 of 20 source units current across 5 records");
  expect(screen.getByText("Publication not verified")).toBeInTheDocument();
  expect(screen.getByText(/2 completed jobs/)).toBeInTheDocument();
  expect(screen.getByText(/1 doubled punctuation · 3 leftover English/)).toBeInTheDocument();
  expect(screen.queryByText("Translation complete")).not.toBeInTheDocument();
});


it("shows historical English/context and refreshes open history after a revision changes", async () => {
  const oldSource = { source: "Old English", context: "Old appearance context", target: "Older wording" };
  const newSource = { source: "New English", context: "New appearance context", target: "Newer wording" };
  const entry = { revision: 1, action: "save" as const, before: { revision: 0, draft: oldSource, approved: null }, after: { revision: 1, draft: newSource, approved: null }, actor: "reviewer", reason: { kind: "unspecified" as const, note: "Source changed" }, glossaryExceptions: [], createdAt: 1 };
  const load = vi.fn(async () => [entry]);
  const user = userEvent.setup();
  const { rerender } = render(<TranslationHistory name="example" revision={1} load={load} restore={async () => {}} />);
  const historyButton = screen.getByRole("button", { name: "History for example" });
  expect(historyButton).not.toHaveClass("theme-control-pill-faint");
  await user.click(historyButton);
  await screen.findByText("Old English");
  expect(within(screen.getByLabelText("Before")).getByText("Old appearance context")).toBeInTheDocument();
  expect(within(screen.getByLabelText("After")).getByText("New English")).toBeInTheDocument();
  load.mockResolvedValue([{ ...entry, revision: 2, reason: { kind: "unspecified" as const, note: "Newest approval" } }]);
  rerender(<TranslationHistory name="example" revision={2} load={load} restore={async () => {}} />);
  await screen.findByText("Newest approval");
  expect(load).toHaveBeenCalledTimes(2);
});


it("loads automatic changes on demand with old and new wording and cursor pagination", async () => {
  const before = { source: "Replication", target: "旧译", model: "old-model", promptVersion: "v1" };
  const after = { source: "Replication", target: "体验再现", model: "new-model", promptVersion: "v2" };
  const fetcher = vi.fn(async (url: string) => Response.json({ ok: true, locale: "zh-Hans", changes: [{ id: "change-1", hash: "abc", before, after, createdAt: 1, pages: [{ label: "Homepage", href: "/" }] }], nextCursor: String(url).includes("cursor=") ? null : "next:2" }));
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<TranslationChanges locale="zh-Hans" />);
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Load recent changes" }));
  await screen.findByText("旧译");
  expect(screen.getByText("体验再现")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Homepage" })).toHaveAttribute("href", "/");
  expect(screen.getByText("Publication not verified")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Export this page" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: /Restore/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Older changes" }));
  await screen.findByText("Page 2 · 1 changes");
  expect(fetcher.mock.calls[1][0]).toContain("cursor=next%3A2");
});

it("offers restoring the immutable original compiled snapshot as a draft", async () => {
  const compiled = { source: "Light", context: "Appearance", target: "Old compiled wording", provenance: "compiled" as const };
  const corrected = { ...compiled, target: "Reviewed wording", provenance: "human" as const };
  const restore = vi.fn(async () => {});
  const load = vi.fn(async () => [{ revision: 1, action: "save" as const, before: { revision: 0, draft: compiled, approved: null }, after: { revision: 1, draft: corrected, approved: null }, actor: "reviewer", reason: { kind: "fluency" as const, note: "Correction" }, glossaryExceptions: [], createdAt: 1 }]);
  const user = userEvent.setup();
  render(<TranslationHistory name="example" revision={1} load={load} restore={restore} />);
  await user.click(screen.getByRole("button", { name: "History for example" }));
  await user.click(await screen.findByRole("button", { name: "Restore original compiled wording as draft" }));
  expect(restore).toHaveBeenCalledWith(0);
});
