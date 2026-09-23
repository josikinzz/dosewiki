import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import { GET, POST } from "./route";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  requireRoleSession: vi.fn(),
  readReviewHistory: vi.fn(),
  mutateGlossaryReview: vi.fn(),
}));
vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: mocks.requireRoleSession,
}));
vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: async () => null,
}));
vi.mock("@server/translation/glossaryReview", () => ({
  mutateGlossaryReview: mocks.mutateGlossaryReview,
}));
vi.mock("@server/translation/reviewStore", async (original) => ({
  ...(await original<typeof import("@server/translation/reviewStore")>()),
  readReviewHistory: mocks.readReviewHistory,
}));
vi.mock("@server/translation/liveTranslation", () => ({
  TRANSLATION_LOCALE_CODES: ["zh-Hans", "nl"],
}));
const actor = { email: "reviewer@example.test", glossaryLocales: ["zh-Hans"] };
const url = "https://dev.dose.wiki/api/dev/translation-glossary/history";
const request = (patch = {}) =>
  new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Origin: "https://dev.dose.wiki",
    },
    body: JSON.stringify({
      locale: "zh-Hans",
      term: "Replication",
      expectedRevision: "10:2",
      restoreRevision: 1,
      ...patch,
    }),
  });
describe("glossary history and draft restoration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRoleSession.mockImplementation(
      roleSessionFor("translator", actor),
    );
    mocks.readReviewHistory.mockResolvedValue([]);
    mocks.mutateGlossaryReview.mockResolvedValue([
      { term: "Replication", status: "draft" },
    ]);
  });
  it("returns only history for a permitted locale", async () => {
    expect(
      (await GET(new Request(`${url}?locale=zh-Hans&term=Replication`))).status,
    ).toBe(200);
    expect(mocks.readReviewHistory).toHaveBeenCalledWith(
      "zh-Hans",
      "glossary",
      "Replication",
    );
    mocks.readReviewHistory.mockClear();
    expect(
      (await GET(new Request(`${url}?locale=nl&term=Replication`))).status,
    ).toBe(403);
    expect(mocks.readReviewHistory).not.toHaveBeenCalled();
  });
  it("restores as a draft using authenticated identity and both revision guards", async () => {
    const result = await POST(request({ actor: "forged@example.test" }));
    expect(result.status).toBe(200);
    expect(mocks.mutateGlossaryReview).toHaveBeenCalledWith(
      "zh-Hans",
      [
        {
          locale: "zh-Hans",
          term: "Replication",
          expectedRevision: "10:2",
          restoreRevision: 1,
          action: "restore",
        },
      ],
      actor.email,
      undefined,
      "Restore historical rendering as draft",
    );
    expect(await result.json()).toMatchObject({ row: { status: "draft" } });
  });
  it("rejects missing revisions, invalid history ids and unauthorized writes", async () => {
    expect((await POST(request({ expectedRevision: undefined }))).status).toBe(
      400,
    );
    expect((await POST(request({ restoreRevision: -1 }))).status).toBe(400);
    expect((await POST(request({ locale: "nl" }))).status).toBe(403);
    expect(mocks.mutateGlossaryReview).not.toHaveBeenCalled();
  });
});
