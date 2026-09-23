import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), context: vi.fn(), coverage: vi.fn(), approvals: vi.fn() }));
vi.mock("@/lib/auth/requireEditorSession", () => ({ requireRoleSession: mocks.auth }));
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: async () => null }));
vi.mock("@server/postgres/runtime/backend", () => ({ getDataBackend: () => "postgres" }));
vi.mock("@server/data/publicData.reads", () => ({ getPublicDataReadAdapter: () => ({}) }));
vi.mock("@server/translation/liveTranslation", () => ({ TRANSLATION_LOCALE_CODES: ["zh-Hans", "nl", "ru"], loadTranslationContext: mocks.context }));
vi.mock("@server/translation/translationCoverage", () => ({ getTranslationCoverage: mocks.coverage }));
vi.mock("@server/translation/uiTranslationStore", () => ({ readApprovedUiTranslations: mocks.approvals }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockImplementation(roleSessionFor("translator", { email: "translator@example.test", glossaryLocales: ["nl"] }));
  mocks.context.mockResolvedValue({ locale: { code: "nl" }, glossary: {} });
  mocks.coverage.mockResolvedValue({ ok: true, locale: "nl", publication: { status: "unverified" } });
  mocks.approvals.mockResolvedValue({});
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
    mocks.context.mockResolvedValue({ locale: { code: "ru" }, glossary: {} });
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
});
