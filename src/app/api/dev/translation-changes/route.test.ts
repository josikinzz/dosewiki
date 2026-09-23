import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import { GET } from "./route";
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));
const mocks = vi.hoisted(() => ({ readTranslationSegmentHistory: vi.fn(), getTranslationHashUsages: vi.fn() }));
vi.mock("@/lib/auth/requireEditorSession", () => auth);
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@server/postgres/runtime/backend", () => ({ getDataBackend: () => "postgres", getPostgresClient: vi.fn() }));
vi.mock("@server/translation/liveTranslation", () => ({ TRANSLATION_LOCALE_CODES: ["zh-Hans", "nl"] }));
vi.mock("@server/data/publicData.reads", () => ({ getPublicDataReadAdapter: () => ({}) }));
vi.mock("@server/translation/translationCoverage", () => ({ getTranslationHashUsages: mocks.getTranslationHashUsages }));
vi.mock("@server/translation/segmentHistoryStore", async (actual) => ({ ...await actual<typeof import("@server/translation/segmentHistoryStore")>(), readTranslationSegmentHistory: mocks.readTranslationSegmentHistory }));
const url = "https://dev.dose.wiki/api/dev/translation-changes";
describe("automatic translation changes authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireRoleSession.mockImplementation(roleSessionFor("translator", { email: "translator@example.com", glossaryLocales: ["zh-Hans"] }));
    mocks.readTranslationSegmentHistory.mockResolvedValue({ changes: [], nextCursor: null });
  });
  it("refuses non-translators and unassigned locales before reading history or source pages", async () => {
    expect((await GET(new Request(`${url}?locale=nl`))).status).toBe(403);
    auth.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    expect((await GET(new Request(`${url}?locale=zh-Hans`))).status).toBe(403);
    expect(mocks.readTranslationSegmentHistory).not.toHaveBeenCalled();
    expect(mocks.getTranslationHashUsages).not.toHaveBeenCalled();
  });
  it("bounds history queries and refuses malformed cursors", async () => {
    expect((await GET(new Request(`${url}?locale=zh-Hans&limit=101`))).status).toBe(400);
    expect((await GET(new Request(`${url}?locale=zh-Hans&cursor=abc`))).status).toBe(400);
    expect(mocks.readTranslationSegmentHistory).not.toHaveBeenCalled();
  });
  it("returns private uncached history with current source usages and honest page counts", async () => {
    const hash = "a".repeat(16);
    mocks.readTranslationSegmentHistory.mockResolvedValue({ changes: [{ id: "8", hash, before: null, after: { source: "Text", target: "文本", model: "model", promptVersion: "prompt" }, createdAt: 1, pages: [] }], nextCursor: "8" });
    mocks.getTranslationHashUsages.mockResolvedValue({ [hash]: { pages: [{ label: "article: example", href: "/example" }], total: 3 } });
    const response = await GET(new Request(`${url}?locale=zh-Hans&limit=1`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).changes[0]).toMatchObject({ pagesTotal: 3, pages: [{ href: "/example" }] });
  });
});
