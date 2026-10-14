import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), context: vi.fn(), coverage: vi.fn(), approvals: vi.fn(), queue: vi.fn(), cacheKeys: [] as unknown[][] }));
vi.mock("@/lib/auth/requireEditorSession", () => ({ requireRoleSession: mocks.auth }));
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: async () => null }));
vi.mock("@server/postgres/runtime/backend", () => ({ getDataBackend: () => "postgres" }));
vi.mock("@server/data/publicData.reads", () => ({ getPublicDataReadAdapter: () => ({}) }));
vi.mock("@server/translation/liveTranslation", () => ({ TRANSLATION_LOCALE_CODES: ["zh-Hans", "nl", "ru"], loadTranslationContext: mocks.context }));
vi.mock("@server/translation/translationCoverage", () => ({ getTranslationCoverage: mocks.coverage }));
vi.mock("@server/translation/uiTranslationStore", () => ({ readApprovedUiTranslations: mocks.approvals }));
vi.mock("@server/translation/segmentStore", () => ({ translationQueueCoverage: mocks.queue }));
// The shared cache passes through, recording the arguments its key is built from.
vi.mock("@server/data/publicData.cache", () => ({
  publicDataCache: <Args extends unknown[], Result>(read: (...args: Args) => Promise<Result>) => async (...args: Args) => {
    mocks.cacheKeys.push(args);
    return read(...args);
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockImplementation(roleSessionFor("translator", { email: "translator@example.test", glossaryLocales: ["nl"] }));
  mocks.cacheKeys.length = 0;
  mocks.context.mockResolvedValue({ locale: { code: "nl" }, glossary: {}, kinds: {}, promptVersion: "v1" });
  mocks.coverage.mockResolvedValue({ ok: true, locale: "nl", publication: { status: "unverified" } });
  mocks.approvals.mockResolvedValue({});
  mocks.queue.mockResolvedValue({ queued: 0, running: 0, failed: 0, completed: 0, retrying: 0 });
});
const get = (locale: string) => GET(new Request(`https://dev.dose.wiki/api/dev/translation-coverage?locale=${locale}`));

describe("translation coverage access", () => {
  it("refuses unauthorized languages before reading any source or approval data", async () => {
    expect((await get("zh-Hans")).status).toBe(403);
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.coverage).not.toHaveBeenCalled();
    expect(mocks.approvals).not.toHaveBeenCalled();
  });
  it("refuses invalid locale and contributor access", async () => {
    expect((await get("invalid")).status).toBe(400);
    mocks.auth.mockImplementation(roleSessionFor("contributor"));
    expect((await get("nl")).status).toBe(403);
    expect(mocks.coverage).not.toHaveBeenCalled();
  });
  it("measures the shipped Russian catalog without claiming publication", async () => {
    mocks.auth.mockImplementation(roleSessionFor("translator", { email: "translator@example.test", glossaryLocales: ["ru"] }));
    mocks.context.mockResolvedValue({ locale: { code: "ru" }, glossary: {}, kinds: {}, promptVersion: "v1" });
    mocks.coverage.mockResolvedValue({ ok: true, locale: "ru", publication: { status: "unverified" } });
    mocks.approvals.mockResolvedValue({ About: "О проекте" });
    const response = await get("ru");
    expect(response.status).toBe(200);
    const report = await response.json();
    expect(report.ui.locale).toBe("ru");
    expect(report.ui.translated).toBeGreaterThan(1000);
    expect(report.ui.approvalMismatches).toEqual([]);
    expect(report.ui.liveVerified).toBe(false);
    expect(report.publication.status).toBe("unverified");
  });
  it("returns an uncached private report and UI denominator for the granted locale", async () => {
    const response = await get("nl");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const report = await response.json();
    expect(report.publication.status).toBe("unverified");
    expect(report.ui.total).toBeGreaterThan(1000);
    expect(report.ui.translated).toBe(0);
    expect(report.ui.liveVerified).toBe(false);
    expect(mocks.approvals).toHaveBeenCalledWith("nl");
  });
  it("shares the audit by language, prompt digest, and term kinds, while the run queue is read fresh", async () => {
    mocks.coverage.mockResolvedValue({ ok: true, locale: "nl", publication: { status: "unverified" }, queue: { queued: 9 } });
    mocks.queue.mockResolvedValue({ queued: 1, running: 2, failed: 0, completed: 3, retrying: 0 });
    const report = await (await get("nl")).json();
    expect(report.queue).toEqual({ queued: 1, running: 2, failed: 0, completed: 3, retrying: 0 });
    mocks.context.mockResolvedValue({ locale: { code: "nl" }, glossary: { Trip: "trip" }, kinds: { Trip: "effect" }, promptVersion: "v2" });
    await get("nl");
    mocks.context.mockResolvedValue({ locale: { code: "nl" }, glossary: { Trip: "trip" }, kinds: { Trip: "substance" }, promptVersion: "v2" });
    await get("nl");
    const [first, second, third] = mocks.cacheKeys;
    expect(first.slice(0, 2)).toEqual(["nl", "v1"]);
    expect(second.slice(0, 2)).toEqual(["nl", "v2"]);
    expect(third[2]).not.toBe(second[2]);
  });
});
