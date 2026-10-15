import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ArticleSaveUnconfirmedError, parseArticleBatchSuccess, parsePendingArticleBatch } from "./articleBatchClient";
import { useSaveArticleMutation, type SaveArticlePayload } from "./useApiMutations";
import { DraftRecoveryProvider } from "@/features/dev/recovery/DraftRecoveryContext";

const request = { operationId: "test-batch-operation", articles: [{ id: 1, title: "Synthetic article", slug: "synthetic" }], articleAdmissions: [{ kind: "replace-existing" as const, slug: "synthetic", baseHash: "stored-base-hash" }] };
const response = (operationId = request.operationId) => ({
  success: true, version: 1, operationId, requestId: "synthetic-request", savedItems: ["1 article(s)"], warnings: [], submittedBy: "EDITOR", revalidatedPaths: ["/synthetic"],
  articleResult: { created: 0, updated: 1, skipped: 0, errors: [] },
  articleReceipts: [{ slug: "synthetic", baseHash: "new-base-hash", unchanged: false, changeId: "child-change-id", revisionId: "revision-id" }], layoutReceipts: [],
  verification: [{ target: "id:1", found: true, previousSlug: "synthetic", requestedSlug: "synthetic", storedSlug: "synthetic", storedTitle: "Synthetic article", titleMatches: true, slugMatches: true }],
});
afterEach(() => { vi.unstubAllGlobals(); window.localStorage.clear(); });

describe("article publication confirmation", () => {
  it.each([null, {}, [], { success: true }, { ...response(), operationId: "another-operation" }, { ...response(), articleReceipts: [] }, { ...response(), articleResult: { created: 0, updated: 0, skipped: 0, errors: [] } }, { ...response(), verification: [] }, { ...response(), articleReceipts: [response().articleReceipts[0], response().articleReceipts[0]] }, { ...response(), layoutReceipts: [{ type: "chemical", receipt: { updated: true, revision: 1, replayed: false, unchanged: false } }] }])("retains an uncertain operation for malformed or incomplete success %j", value => {
    expect(() => parseArticleBatchSuccess(value, request)).toThrow(ArticleSaveUnconfirmedError);
  });
  it("accepts a complete response correlated to every submitted target", () => {
    expect(parseArticleBatchSuccess(response(), request).operationId).toBe(request.operationId);
  });
  it("refuses malformed recovered requests instead of sending arbitrary JSON", () => {
    expect(() => parsePendingArticleBatch({ operationId: request.operationId, articles: [null] }, request.operationId)).toThrow(ArticleSaveUnconfirmedError);
  });
  it.each([401, 403, 503])("retains the exact uncertain envelope through reload and a later %s refusal", async status => {
    const bodies: string[] = [];
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      if (bodies.length === 1) return new Response("not json", { status: 200 });
      if (bodies.length === 2) return Response.json({ error: "Synthetic refusal", code: status === 503 ? "DATA_WRITES_FROZEN" : "FORBIDDEN" }, { status });
      return Response.json(response(JSON.parse(String(init.body)).operationId));
    });
    vi.stubGlobal("fetch", fetch);
    const query = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={query}><DraftRecoveryProvider actor="admin@example.com">{children}</DraftRecoveryProvider></QueryClientProvider>;
    const first = renderHook(() => useSaveArticleMutation(), { wrapper });
    await act(async () => { await expect(first.result.current.mutateAsync(request)).rejects.toThrow(ArticleSaveUnconfirmedError); });
    first.unmount();
    const second = renderHook(() => useSaveArticleMutation(), { wrapper });
    const changed: SaveArticlePayload = { ...request, articles: [{ ...request.articles[0], title: "Newer local edit" }] };
    await act(async () => { await expect(second.result.current.mutateAsync(changed)).rejects.toThrow("Synthetic refusal"); });
    await act(async () => {
      const result = await second.result.current.mutateAsync(changed);
      expect(result.confirmsCurrentDraft).toBe(false);
    });
    expect(bodies[1]).toBe(bodies[0]);
    expect(bodies[2]).toBe(bodies[0]);
    second.unmount(); query.clear();
  });
});
