import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import { POST } from "./route";
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));
vi.mock("@/lib/auth/requireEditorSession", () => auth);
vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));
vi.mock("@server/postgres/runtime/backend", () => ({
  getDataBackend: () => "postgres",
}));
vi.mock("@server/translation/liveTranslation", () => ({
  TRANSLATION_LOCALE_CODES: ["zh-Hans", "ru"],
}));
const store = vi.hoisted(() => ({
  translationJobCounts: vi.fn(),
  requeueExhaustedTranslationJobs: vi.fn(),
}));
vi.mock("@server/translation/segmentStore", () => store);

const post = (body: unknown) =>
  new Request("https://dev.dose.wiki/api/dev/translation-glossary/retry-exhausted", {
    method: "POST",
    headers: { "content-type": "application/json", Origin: "https://dev.dose.wiki" },
    body: JSON.stringify(body),
  });

describe("retrying a run's exhausted pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireRoleSession.mockImplementation(roleSessionFor("admin"));
    store.translationJobCounts.mockResolvedValue({ runId: "run-a" });
    store.requeueExhaustedTranslationJobs.mockResolvedValue(["article/2c-p", "article/3-mec"]);
  });

  it("is admin only", async () => {
    auth.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    expect((await POST(post({ locale: "ru" }))).status).toBe(403);
    expect(store.requeueExhaustedTranslationJobs).not.toHaveBeenCalled();
  });

  it("requeues the latest run's exhausted jobs for the locale", async () => {
    const response = await POST(post({ locale: "ru" }));
    expect(response.status).toBe(200);
    expect(store.translationJobCounts).toHaveBeenCalledWith("ru");
    expect(store.requeueExhaustedTranslationJobs).toHaveBeenCalledWith("ru", "run-a");
    expect(await response.json()).toEqual({ ok: true, status: "queued", locale: "ru", runId: "run-a", requeued: 2 });
  });

  it("writes nothing when the locale has no run yet", async () => {
    store.translationJobCounts.mockResolvedValue({ runId: null });
    expect(await (await POST(post({ locale: "ru" }))).json()).toMatchObject({ runId: null, requeued: 0 });
    expect(store.requeueExhaustedTranslationJobs).not.toHaveBeenCalled();
  });

  it("refuses a locale the pipeline does not know", async () => {
    expect((await POST(post({ locale: "xx" }))).status).toBe(400);
  });
});
