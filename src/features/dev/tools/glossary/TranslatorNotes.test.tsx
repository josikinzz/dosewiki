import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { resetSearchManifestForTests } from "@/hooks/useSearchManifest";
import type { TranslatorNotePacket, TranslatorNoteRow } from "@lib/translation/translatorNoteTypes";
import { NarrativeReview } from "./NarrativeReview";

afterEach(() => { vi.unstubAllGlobals(); resetSearchManifestForTests(); window.history.replaceState({}, "", "/"); });

const LAST_HISTORY_ROW = "b".repeat(64);
const narrative = {
  locale: "zh-Hans", kind: "article", slug: "sample", sourceVersion: "v".repeat(64), tally: { humanApproved: 0, total: 2 }, history: [],
  rows: [
    { id: "a".repeat(64), hash: "h1", field: "summary", source: "A stimulant.", context: "c", machine: { target: "一种兴奋剂。" }, revision: 0, draft: null, approved: null, overlay: null, status: "unreviewed", usages: null },
    { id: LAST_HISTORY_ROW, hash: "h2", field: "history_culture.content", source: "First described in the 1950s.", context: "c", machine: { target: "最早于20世纪50年代被描述。" }, revision: 0, draft: null, approved: null, overlay: null, status: "unreviewed", usages: null },
  ],
};
const empty: TranslatorNoteRow = { section: "history-culture", label: "History & Culture", id: "article/sample#history-culture", present: true, afterSegmentId: LAST_HISTORY_ROW, revision: 0, draft: null, approved: null, status: "empty" };

function stubServer(notes: TranslatorNoteRow[]) {
  const writes: Record<string, unknown>[] = [];
  const state = { sections: notes };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (!url.startsWith("/api/dev/translation-note")) return Response.json(narrative);
    if (!init) return Response.json({ locale: "zh-Hans", kind: "article", slug: "sample", sections: state.sections, history: [] } satisfies TranslatorNotePacket & { history: [] });
    const body = JSON.parse(String(init.body));
    writes.push(body);
    const row = state.sections[0];
    state.sections = [{ ...row, revision: row.revision + 1, draft: body.action === "save" ? body.body : null, approved: body.action === "approve" ? row.draft : row.approved, status: body.action === "save" ? "draft" : "approved" }];
    return Response.json({ ok: true, entry: {}, publication: [] });
  }));
  return writes;
}

async function openArticle() {
  const user = userEvent.setup();
  render(<NarrativeReview locale="zh-Hans" />);
  await user.type(screen.getByRole("textbox", { name: "Source slug" }), "sample");
  await user.click(screen.getByRole("button", { name: "Load source" }));
  return user;
}

it("adds a note under the section's last paragraph and takes it through draft and approval", async () => {
  const writes = stubServer([empty]);
  const user = await openArticle();
  const add = await screen.findByRole("button", { name: "Add translator's note under History & Culture" });
  // The affordance sits with the section's last paragraph, not the first.
  const items = screen.getAllByRole("listitem");
  expect(within(items[1]).getByRole("button", { name: "Add translator's note under History & Culture" })).toBe(add);
  expect(within(items[0]).queryByRole("button", { name: /translator's note/ })).not.toBeInTheDocument();

  await user.click(add);
  const body = screen.getByRole("textbox", { name: "Translator's note" });
  expect(body).toHaveAttribute("lang", "zh-Hans");
  await user.type(body, "中国的管制情况另见本节。");
  await user.type(screen.getByRole("textbox", { name: "Reason" }), "Local context");
  expect(screen.getByRole("button", { name: "Approve saved revision" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Draft saved. Readers do not see it until it is approved.");
  expect(writes[0]).toMatchObject({ locale: "zh-Hans", kind: "article", slug: "sample", section: "history-culture", action: "save", expectedRevision: 0, body: "中国的管制情况另见本节。" });

  await user.click(screen.getByRole("button", { name: "Approve saved revision" }));
  await screen.findByText("Approved for this section.");
  expect(writes[1]).toMatchObject({ action: "approve", expectedRevision: 1 });
  expect(screen.getByText("Approved, shown to readers")).toBeInTheDocument();
});

it("shows an orphaned note below the article without an editor", async () => {
  stubServer([{ ...empty, present: false, afterSegmentId: null, approved: "旧的译者注。", revision: 2, status: "orphaned" }]);
  await openArticle();
  const group = await screen.findByRole("group", { name: "Translator's note: History & Culture" });
  expect(within(group).getByText("Orphaned: section removed from the English")).toBeInTheDocument();
  expect(within(group).getByText("旧的译者注。")).toBeInTheDocument();
  expect(within(group).queryByRole("button")).not.toBeInTheDocument();
});
