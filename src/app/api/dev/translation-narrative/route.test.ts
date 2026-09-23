import { beforeEach, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import { GET, POST } from "./route";
const auth = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));
const store = vi.hoisted(() => ({ readNarrativeReview: vi.fn(), writeNarrativeReview: vi.fn(), narrativeHistory: vi.fn() }));
vi.mock("@/lib/auth/requireEditorSession", () => auth);
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@server/postgres/runtime/backend", () => ({ getDataBackend: () => "postgres", getPostgresClient: vi.fn() }));
vi.mock("@server/data/publicData.reads", () => ({ getPublicDataReadAdapter: () => ({}) }));
vi.mock("@server/translation/narrativeReview", () => store);
vi.mock("@server/next/publishPublicCache", () => ({ publishPublicCache: vi.fn(async () => []) }));
const url = "https://dev.dose.wiki/api/dev/translation-narrative";
const body = { locale: "zh-Hans", kind: "article", slug: "sample", id: "a".repeat(64), sourceVersion: "b".repeat(64), expectedRevision: 0, action: "save", target: "翻译", reason: "Meaning" };
const post = (overrides = {}, origin = "https://dev.dose.wiki") => new Request(url, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ ...body, ...overrides }) });
beforeEach(() => { vi.clearAllMocks(); auth.requireRoleSession.mockImplementation(roleSessionFor("translator", { email: "translator@example.com", glossaryLocales: ["zh-Hans"] })); store.readNarrativeReview.mockResolvedValue({ rows: [] }); store.writeNarrativeReview.mockResolvedValue({ revision: 1 }); });
it("requires assigned locale for both source and mutation", async () => {
    expect((await GET(new Request(`${url}?locale=nl&kind=article&slug=sample`))).status).toBe(403);
    expect((await POST(post({ locale: "nl" }))).status).toBe(403);
    auth.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    expect((await POST(post())).status).toBe(403);
    expect(store.writeNarrativeReview).not.toHaveBeenCalled();
});
it("returns the per-article approval tally beside the rows", async () => {
    store.readNarrativeReview.mockResolvedValue({ rows: [{ id: "a".repeat(64) }], tally: { humanApproved: 0, total: 1 } });
    const response = await GET(new Request(`${url}?locale=zh-Hans&kind=article&slug=sample`));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ rows: [{ id: "a".repeat(64) }], tally: { humanApproved: 0, total: 1 } });
});
it("rejects cross-origin and malformed revisions and identities", async () => {
    expect((await POST(post({}, "https://evil.example"))).status).toBe(403);
    for (const change of [{ id: "bad" }, { sourceVersion: "old" }, { expectedRevision: -1 }, { kind: "unknown" }, { reason: "" }])
        expect((await POST(post(change))).status).toBe(400);
    expect(store.writeNarrativeReview).not.toHaveBeenCalled();
});
it("derives actor and source authority on the server", async () => {
    expect((await POST(post({ actor: "attacker", source: "forged", context: "forged" }))).status).toBe(200);
    expect(store.writeNarrativeReview).toHaveBeenCalledWith({}, expect.objectContaining({ actor: "translator@example.com" }));
    expect(store.writeNarrativeReview.mock.calls[0][1]).not.toHaveProperty("source");
    expect(store.writeNarrativeReview.mock.calls[0][1]).not.toHaveProperty("context");
});
