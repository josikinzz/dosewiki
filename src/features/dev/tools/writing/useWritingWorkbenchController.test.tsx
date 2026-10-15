import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { DraftRecoveryProvider } from "../../recovery/DraftRecoveryContext";
import { createDraftRecoveryStore, recoveryActorKey } from "../../recovery/draftRecovery";
import { draftFromRow } from "./writingEditorModel";
import { useWritingWorkbenchController } from "./useWritingWorkbenchController";

const row = { slug: "synthetic-writing", title: "Stored draft", status: "draft" as const, kind: "article" as const, bodyFormat: "markdown" as const, body_raw: "Stored body", baseRevision: "a".repeat(64) };
const actor = "writing@example.test";
const wrapper = ({ children }: { children: ReactNode }) => <DraftRecoveryProvider actor={actor}>{children}</DraftRecoveryProvider>;
const store = () => createDraftRecoveryStore(recoveryActorKey(actor)!);
const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
let posted: Array<Record<string, unknown>>;
let replies: Array<(body: Record<string, unknown>) => Response>;
const savedResult = (body: Record<string, unknown>) => ({ ok: true, created: false, slug: body.slug, revision: "b".repeat(64), operationId: body.operationId, intent: body.intent });
const success = (body: Record<string, unknown>) => json(200, savedResult(body));
beforeEach(() => {
  localStorage.clear(); posted = []; replies = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method !== "POST") return json(200, { article: row });
    const body = JSON.parse(String(init.body)); posted.push(body);
    return replies.shift()!(body);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
async function open() {
  const hook = renderHook(() => useWritingWorkbenchController({ initialSelection: row.slug, contextual: true }), { wrapper });
  await waitFor(() => expect(hook.result.current.loadedRow?.slug).toBe(row.slug));
  return hook;
}

describe("Writing pending command guards", () => {
  it.each([
    ["malformed", 401, { error: "Sign in" }], ["malformed", 403, { error: "Role changed" }],
    ["malformed", 503, { error: "Frozen", code: "DATA_WRITES_FROZEN" }],
    ["lost", 401, { error: "Sign in" }], ["lost", 403, { error: "Role changed" }],
    ["lost", 503, { error: "Frozen", code: "DATA_WRITES_FROZEN" }],
  ])("retains the exact unknown command after a %s response and later %s refusal", async (first, status, payload) => {
    const { result } = await open();
    act(() => result.current.updateDraft({ title: "Private edit" }));
    replies.push(() => { if (first === "lost") throw new TypeError("Synthetic lost response"); return json(200, { revision: true }); }, () => json(status, payload), success);
    await act(async () => { expect(await result.current.saveUnpublished()).toBe(false); });
    expect(result.current.uncertain).toBe(true);
    const pending = store().read("writing", `row:${row.slug}`)?.pending;
    await act(async () => { expect(await result.current.retrySave()).toBe(false); });
    expect(result.current.uncertain).toBe(true);
    expect(store().read("writing", `row:${row.slug}`)?.pending).toEqual(pending);
    await act(async () => { expect(await result.current.retrySave()).toBe(true); });
    expect(posted).toHaveLength(3);
    expect(posted[1]).toEqual(posted[0]); expect(posted[2]).toEqual(posted[0]);
    expect(posted[0].intent).toBe("save-unpublished");
    expect(result.current.uncertain).toBe(false);
    expect(store().read("writing", `row:${row.slug}`)).toBeNull();
  });

  it.each([null, {}, { ok: true, revision: {} }, { ok: true, revision: "b".repeat(64), slug: "another-row" }])("keeps malformed success pending", async payload => {
    const { result } = await open();
    act(() => result.current.updateDraft({ title: "Private edit" }));
    replies.push(() => json(200, payload));
    await act(async () => { expect(await result.current.saveUnpublished()).toBe(false); });
    expect(result.current.uncertain).toBe(true);
    expect(store().read("writing", `row:${row.slug}`)?.pending).toBeDefined();
    expect(result.current.draft.title).toBe("Private edit");
  });

  it.each(["slug", "operationId", "intent"])("keeps a success with a mismatched %s pending", async field => {
    const { result } = await open();
    act(() => result.current.updateDraft({ title: "Private edit" }));
    replies.push(body => json(200, { ...savedResult(body), [field]: field === "intent" ? "publish" : "another-operation" }));
    await act(async () => { expect(await result.current.saveUnpublished()).toBe(false); });
    expect(result.current.uncertain).toBe(true);
    expect(store().read("writing", `row:${row.slug}`)?.pending).toBeDefined();
  });

  it("refuses a stale review binding and keeps the shell operation unavailable for live changes", async () => {
    const { result } = await open();
    const previous = result.current.reviewedSaveCommand;
    act(() => result.current.updateDraft({ status: "published", title: "Reviewed live edit" }));
    await act(async () => { expect(await result.current.saveReviewed(previous)).toBe(false); expect(await result.current.saveUnpublished()).toBe(false); });
    expect(posted).toHaveLength(0);
    replies.push(success);
    await act(async () => { expect(await result.current.saveReviewed(result.current.reviewedSaveCommand)).toBe(true); });
    expect(posted[0].intent).toBe("publish");
  });

  it("preserves recovered legacy pending data without assigning publication intent", async () => {
    const draft = { ...draftFromRow(row), title: "Recovered" };
    const pending = { id: "11111111-1111-4111-8111-111111111111", body: JSON.stringify({ ...draft, kind: "article", expectedRevision: row.baseRevision }) };
    store().write({ tool: "writing", record: `row:${row.slug}`, baseline: row.baseRevision, draft, pending });
    const { result } = await open();
    await waitFor(() => expect(result.current.recoveryOffer).not.toBeNull());
    act(() => result.current.restoreRecovery());
    replies.push(() => json(400, { error: "Intent required" }));
    await act(async () => { expect(await result.current.retrySave()).toBe(false); });
    expect(posted[0]).not.toHaveProperty("intent");
    expect(result.current.uncertain).toBe(true);
    expect(store().read("writing", `row:${row.slug}`)?.pending).toEqual(pending);
  });
});
