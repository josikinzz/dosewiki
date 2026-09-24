import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import { DataWriteFrozenError } from "@server/runtime/dataWriteFreeze";
import { TranslationReviewConflictError } from "@server/translation/reviewStore";
import { GET, POST } from "./route";
import { GET as historyGet } from "./history/route";
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));
const store = vi.hoisted(() => ({ readUiTranslations: vi.fn(), writeUiTranslation: vi.fn(), readUiTranslationHistory: vi.fn(), isUiCatalogRefreshed: vi.fn(() => false) }));
vi.mock("@/lib/auth/requireEditorSession", () => auth);
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@server/postgres/runtime/backend", () => ({ getDataBackend: () => "postgres", getPostgresClient: vi.fn() }));
vi.mock("@server/translation/liveTranslation", () => ({ TRANSLATION_LOCALE_CODES: ["zh-Hans", "nl"] }));
vi.mock("@server/translation/uiTranslationStore", () => store);
const url = "https://dev.dose.wiki/api/dev/translation-workbench";
const body = { locale: "zh-Hans", id: "appearance.light", action: "save", expectedRevision: 0, target: "浅色", reason: "Correct the appearance label" };
const post = (overrides = {}, origin: string | null = "https://dev.dose.wiki") => new Request(url, { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify({ ...body, ...overrides }) });
describe("UI translation workbench route boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireRoleSession.mockImplementation(roleSessionFor("translator", { email: "translator@example.com", glossaryLocales: ["zh-Hans"] }));
    store.readUiTranslations.mockResolvedValue([]);
    store.readUiTranslationHistory.mockResolvedValue([]);
    store.writeUiTranslation.mockResolvedValue({ id: "appearance.light", revision: 1 });
  });
  it("requires translator role before reading or changing any state", async () => {
    auth.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    expect((await GET(new Request(url))).status).toBe(403);
    expect((await POST(post())).status).toBe(403);
    expect(store.readUiTranslations).not.toHaveBeenCalled();
    expect(store.writeUiTranslation).not.toHaveBeenCalled();
  });
  it("applies assigned locale to inventory, changes, and history without trusting body grants", async () => {
    expect((await GET(new Request(`${url}?locale=nl`))).status).toBe(403);
    expect((await POST(post({ locale: "nl", glossaryLocales: ["nl"] }))).status).toBe(403);
    expect((await historyGet(new Request(`${url}/history?locale=nl&id=appearance.light`))).status).toBe(403);
    expect(store.readUiTranslationHistory).not.toHaveBeenCalled();
    expect(store.writeUiTranslation).not.toHaveBeenCalled();
  });
  it("rejects cross-site and missing-origin requests", async () => {
    expect((await POST(post({}, "https://evil.example"))).status).toBe(403);
    expect((await POST(post({}, null))).status).toBe(403);
    expect(store.writeUiTranslation).not.toHaveBeenCalled();
  });
  it("requires a registered identity, expected revision and reason", async () => {
    for (const overrides of [{ id: "arbitrary.code" }, { expectedRevision: undefined }, { expectedRevision: -1 }, { reason: "" }, { target: "" }, { action: "restore", restoreRevision: -1 }]) {
      expect((await POST(post(overrides))).status).toBe(400);
    }
    expect(store.writeUiTranslation).not.toHaveBeenCalled();
  });
  it("derives actor from session and never accepts source/context from the body", async () => {
    expect((await POST(post({ actor: "other@example.com", source: "Tampered", context: "Tampered" }))).status).toBe(200);
    expect(store.writeUiTranslation).toHaveBeenCalledWith(expect.objectContaining({ actor: "translator@example.com", id: "appearance.light", expectedRevision: 0 }));
    expect(store.writeUiTranslation.mock.calls[0][0]).not.toHaveProperty("source");
    expect(store.writeUiTranslation.mock.calls[0][0]).not.toHaveProperty("context");
  });
  it("reports a concurrent revision and global freeze without claiming a successful write", async () => {
    store.writeUiTranslation.mockRejectedValueOnce(new TranslationReviewConflictError());
    expect((await POST(post())).status).toBe(409);
    store.writeUiTranslation.mockRejectedValueOnce(new DataWriteFrozenError("mutateReviewEntry"));
    const response = await POST(post());
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("DATA_WRITES_FROZEN");
  });
  it("keeps review inventories and history private and uncached", async () => {
    const response = await GET(new Request(`${url}?locale=zh-Hans`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const json = await response.json();
    expect(json.locales).toEqual(["zh-Hans"]);
    // The waiting list came from an offline compile, so the reviewer is told it was not refreshed.
    expect(json.catalogRefreshed).toBe(false);
  });
});
