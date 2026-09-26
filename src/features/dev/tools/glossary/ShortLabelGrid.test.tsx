import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UiTranslationRow } from "@lib/translation/uiTranslationTypes";
import { UiTranslationWorkbench } from "./UiTranslationWorkbench";

const row = (id: string, source: string, location: string, compiledTarget: string | null = null): UiTranslationRow => ({
  id, source, context: `Context for ${id}`, locations: [location, "src/other.tsx"], glossaryTerms: [], revision: 0, draft: null, approved: null, updatedAt: null, compiledTarget, status: compiledTarget ? "unreviewed" : "missing",
});
const rows = [
  row("appearance.light", "Light", "src/app/_components/ThemeToggle.tsx", "浅色"),
  row("gallery.back", "Back to replications", "src/features/replications", "返回复现"),
  row("gallery.replications", "Replications", "src/features/replications", "再现作品"),
  row("article.long", "2-Benzylpiperidine is a stimulant of the phenidate class", "src/features/replications", "2-苄基哌啶是一种苯乙胺类兴奋剂"),
];

afterEach(() => vi.unstubAllGlobals());

async function openGrid(list: UiTranslationRow[], approve?: (body: { items: { id: string; expectedRevision: number; target: string }[] }) => unknown) {
  const requests: { url: string; body: { items: { id: string; expectedRevision: number; target: string }[] } }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (!init) return Response.json({ ok: true, locale: "zh-Hans", locales: ["zh-Hans"], rows: list });
    const body = JSON.parse(String(init.body));
    requests.push({ url, body });
    return Response.json(approve?.(body) ?? { ok: true, results: [] });
  }));
  const user = userEvent.setup();
  render(<UiTranslationWorkbench locale="zh-Hans" />);
  await user.click(await screen.findByRole("button", { name: /^Short labels/ }));
  return { user, requests };
}

describe("short label batch review", () => {
  it("lists only labels of three words or fewer, grouped by first location", async () => {
    await openGrid(rows);
    const replications = screen.getByRole("group", { name: "src/features/replications" });
    expect(within(replications).getByText("Back to replications")).toBeInTheDocument();
    expect(within(replications).getByText("Replications")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "src/app/_components/ThemeToggle.tsx" })).getByText("Light")).toBeInTheDocument();
    expect(screen.queryByText(/2-Benzylpiperidine/)).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "src/other.tsx" })).not.toBeInTheDocument();
  });

  it("approves the inline-edited wording of the selected rows and reports each failure", async () => {
    const { user, requests } = await openGrid(rows, (body) => ({ ok: true, results: body.items.map((item) => item.id === "gallery.back"
      ? { id: item.id, ok: false, code: "TRANSLATION_REVIEW_CONFLICT", error: "This translation changed since you opened it." }
      : { id: item.id, ok: true, row: { ...rows.find((entry) => entry.id === item.id)!, revision: 2, approved: { source: "Replications", context: "", target: item.target }, status: "approved" } }) }));
    const input = screen.getByRole("textbox", { name: "Translation for gallery.replications" });
    await user.clear(input);
    await user.type(input, "体验再现");
    await user.click(screen.getByRole("checkbox", { name: "Select gallery.replications" }));
    await user.click(screen.getByRole("checkbox", { name: "Select gallery.back" }));
    await user.click(screen.getByRole("button", { name: "Approve selected (2)" }));
    await screen.findByText(/Approved 1 label/);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("/api/dev/translation-workbench/approve-many");
    expect(requests[0].body.items).toEqual([
      { id: "gallery.back", expectedRevision: 0, target: "返回复现" },
      { id: "gallery.replications", expectedRevision: 0, target: "体验再现" },
    ]);
    expect(screen.getByText(/Back to replications: This translation changed since you opened it\./)).toBeInTheDocument();
    // The approved row leaves the review grid; the failed row stays selected for another look.
    expect(screen.queryByRole("checkbox", { name: "Select gallery.replications" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select gallery.back" })).toBeChecked();
  });

  it("asks for confirmation with the count before approving more than 200 rows", async () => {
    const many = Array.from({ length: 201 }, (_, i) => row(`label.${i}`, `Label ${i}`, "src/app/page.tsx", `标签 ${i}`));
    const { user, requests } = await openGrid(many, (body) => ({ ok: true, results: body.items.map((item) => ({ id: item.id, ok: true, row: { ...many.find((entry) => entry.id === item.id)!, status: "approved" } })) }));
    await user.click(screen.getByRole("button", { name: "Select all matching" }));
    await user.click(screen.getByRole("button", { name: "Approve selected (201)" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Approve 201 labels?" })).toBeInTheDocument();
    expect(within(dialog).getByText(/You selected 201 labels/)).toBeInTheDocument();
    expect(requests).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Approve 201 labels" }));
    await screen.findByText(/Approved 201 labels/);
    expect(requests.map((request) => request.body.items.length)).toEqual([200, 1]);
  });
});
