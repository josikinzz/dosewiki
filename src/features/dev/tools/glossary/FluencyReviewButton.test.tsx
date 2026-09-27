import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { resetSearchManifestForTests } from "@/hooks/useSearchManifest";
import { NarrativeReview } from "./NarrativeReview";

afterEach(() => { vi.unstubAllGlobals(); resetSearchManifestForTests(); window.history.replaceState({}, "", "/"); });

const row = { id: "a".repeat(64), hash: "hash", field: "summary", source: "A source sentence.", context: "context", machine: { target: "机器翻译" }, revision: 0, draft: null, approved: null, overlay: null, status: "unreviewed", usages: null };
const packet = { locale: "zh-Hans", kind: "article", slug: "sample", sourceVersion: "b".repeat(64), rows: [row], tally: { humanApproved: 0, total: 1 }, history: [] };
const run = {
  runId: "0123456789abcdef", locale: "zh-Hans", slug: "sample", model: "test-model", promptVersion: "feedfacecafebeef",
  usage: { prompt: 1200, completion: 90, requests: 1 }, reviewed: 1, skipped: 0, stored: 2,
  dropped: { malformed: 0, "not-found": 0, unchanged: 0, validator: 1, glossary: 0, limit: 0 },
};

async function open(canAdmin: boolean) {
  const posts: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (!init) return Response.json(packet);
    posts.push({ url, body: JSON.parse(String(init.body)) });
    return Response.json({ ok: true, run });
  }));
  const user = userEvent.setup();
  render(<NarrativeReview locale="zh-Hans" canAdmin={canAdmin}/>);
  await user.type(screen.getByRole("textbox", { name: "Article slug" }), "sample");
  await user.click(screen.getByRole("button", { name: "Open article" }));
  await screen.findByText("机器翻译");
  return { user, posts };
}

it("lets an admin ask for a fluency review of the open article and reports where the suggestions went", async () => {
  const { user, posts } = await open(true);
  await user.click(screen.getByRole("button", { name: "Review fluency" }));
  expect(await screen.findByText(/2 suggestions sent to Waiting, 1 dropped \(1 validator\)/)).toHaveTextContent("1290 tokens in 1 request");
  expect(posts).toEqual([{ url: "/api/dev/translation-fluency", body: { locale: "zh-Hans", slug: "sample" } }]);
  // Nothing on the page changes.
  expect(screen.getByText("机器翻译")).toBeInTheDocument();
});

it("hides the model review from translators", async () => {
  await open(false);
  expect(screen.queryByRole("button", { name: "Review fluency" })).not.toBeInTheDocument();
});
