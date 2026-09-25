import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { resetSearchManifestForTests } from "@/hooks/useSearchManifest";
import type { StyleGuidePacket } from "@lib/translation/styleGuideTypes";
import { NarrativeReview } from "./NarrativeReview";
import { StyleGuidePanel } from "./StyleGuidePanel";

afterEach(() => { vi.unstubAllGlobals(); resetSearchManifestForTests(); window.history.replaceState({}, "", "/"); });

const EXAMPLE = { id: "narrative:a:1", source: "A stimulant.", before: "一种兴奋剂。", after: "一种中枢兴奋剂。", why: "Fluency", addedAt: 1 };

function stubGuide(initial: Partial<StyleGuidePacket> = {}) {
  const writes: Record<string, unknown>[] = [];
  let packet: StyleGuidePacket = { locale: "zh-Hans", revision: 0, draft: null, approved: null, approvedRevision: "", history: [], ...initial };
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init) return Response.json(packet);
    const body = JSON.parse(String(init.body));
    writes.push(body);
    if (body.action === "save") {
      const examples = body.guide.examples.map((e: Record<string, unknown>, i: number) => ({ id: `manual:${i}`, addedAt: 2, ...e }));
      packet = { ...packet, revision: packet.revision + 1, draft: { rules: body.guide.rules, examples } };
    }
    if (body.action === "approve") packet = { ...packet, revision: packet.revision + 1, approved: packet.draft, draft: null, approvedRevision: "abcdef0123456789" };
    return Response.json({ ok: true, entry: {}, packet });
  }));
  return writes;
}

it("drafts rules and examples, then approves the saved revision", async () => {
  const writes = stubGuide({ approved: { rules: [], examples: [EXAMPLE] }, approvedRevision: "0000000000000000", revision: 2 });
  const user = userEvent.setup();
  render(<StyleGuidePanel locale="zh-Hans" />);
  expect(await screen.findByText(/Approved · version 0000000000000000/)).toBeInTheDocument();
  expect(screen.getByText("一种中枢兴奋剂。")).toBeInTheDocument();

  await user.type(screen.getByRole("textbox", { name: "Rules, one per line" }), "用“服用”描述剂量。");
  await user.type(screen.getByRole("textbox", { name: "Before" }), "返回复现");
  await user.type(screen.getByRole("textbox", { name: "After" }), "复现作品");
  await user.type(screen.getByRole("textbox", { name: "Why" }), "A gallery label is a noun.");
  await user.click(screen.getByRole("button", { name: "Add example to draft" }));
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  // The shared reason control: a kind, and a note if the translator wants one.
  expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Fluency" }));
  await user.type(screen.getByRole("textbox", { name: "Note (optional)" }), "House style");

  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Draft saved. Translations still follow the approved guide.");
  expect(writes[0]).toMatchObject({
    locale: "zh-Hans", action: "save", expectedRevision: 2, reason: { kind: "fluency", note: "House style" },
    guide: { rules: ["用“服用”描述剂量。"], examples: [EXAMPLE, { before: "返回复现", after: "复现作品", why: "A gallery label is a noun." }] },
  });

  await user.click(screen.getByRole("button", { name: "Approve" }));
  await screen.findByText(/Approved\. The next translation run follows this guide/);
  expect(writes[1]).toMatchObject({ action: "approve", expectedRevision: 3 });
});

const ROW_ID = "a".repeat(64);
const narrative = {
  locale: "zh-Hans", kind: "article", slug: "sample", sourceVersion: "v".repeat(64), tally: { humanApproved: 0, total: 1 },
  rows: [{ id: ROW_ID, hash: "h1", field: "summary", source: "A stimulant.", context: "c", machine: { target: "一种兴奋剂。" }, revision: 2, draft: { source: "A stimulant.", context: "c", target: "一种中枢兴奋剂。" }, approved: null, overlay: null, status: "draft", usages: null, glossary: [] }],
};
const state = (target: string | null) => ({ revision: 0, draft: target ? { source: "A stimulant.", context: "c", target } : null, approved: null });
const history = [
  { revision: 2, action: "save", before: state("一种中枢兴奋剂"), after: state("一种中枢兴奋剂。"), actor: "sin", reason: { kind: "accuracy", note: "" }, glossaryExceptions: [], createdAt: 2 },
  { revision: 1, action: "save", before: state(null), after: state("一种中枢兴奋剂"), actor: "sin", reason: { kind: "fluency", note: "Natural wording" }, glossaryExceptions: [], createdAt: 1 },
];

it("offers Promote to style guide on a saved Fluency correction only, and sends that correction", async () => {
  const promotions: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/dev/translation-style-guide")) {
      promotions.push(JSON.parse(String(init?.body)));
      return Response.json({ ok: true });
    }
    if (url.startsWith("/api/dev/translation-note")) return Response.json({}, { status: 404 });
    return Response.json({ ...narrative, history: url.includes("history=") ? history : undefined });
  }));
  const user = userEvent.setup();
  render(<NarrativeReview locale="zh-Hans" />);
  await user.type(screen.getByRole("textbox", { name: "Article slug" }), "sample");
  await user.click(screen.getByRole("button", { name: "Open article" }));
  await user.click(await screen.findByRole("button", { name: "Review summary" }));
  await user.click(await screen.findByRole("button", { name: "History for summary" }));

  const items = (await screen.findAllByText(/^Revision \d/)).map((node) => node.closest("li")!);
  expect(within(items[0]).queryByRole("button", { name: "Promote to style guide" })).not.toBeInTheDocument();
  await user.click(within(items[1]).getByRole("button", { name: "Promote to style guide" }));
  await within(items[1]).findByText("Added to the style guide draft.");
  expect(promotions).toEqual([{ locale: "zh-Hans", action: "promote", correction: { kind: "article", slug: "sample", segment: ROW_ID, revision: 1 } }]);
});
