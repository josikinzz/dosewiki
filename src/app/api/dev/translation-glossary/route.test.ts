import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import { GlossaryCollisionError } from "@server/translation/glossary";
import { TranslationReviewConflictError } from "@server/translation/reviewStore";
import { POST as approvePost } from "./approve/route";
import { POST as editPost } from "./edit/route";
import { GET } from "./route";
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));
vi.mock("@/lib/auth/requireEditorSession", () => auth);
vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));
vi.mock("@server/postgres/runtime/backend", () => ({
  getDataBackend: () => "postgres",
}));
const glossary = vi.hoisted(() => ({
  glossaryLocales: vi.fn(),
  readGlossaryRows: vi.fn(),
}));
vi.mock("@server/translation/glossary", async (original) => ({
  ...(await original<typeof import("@server/translation/glossary")>()),
  ...glossary,
}));
const review = vi.hoisted(() => ({
  mutateGlossaryReview: vi.fn(),
  readGlossaryReviewRows: vi.fn(),
}));
vi.mock("@server/translation/glossaryReview", () => review);
vi.mock("@server/translation/glossaryGloss", () => ({
  loadGlosses: async () => ({}),
}));
const usage = vi.hoisted(() => ({ getGlossaryUsages: vi.fn(async () => ({})) }));
vi.mock("@server/translation/glossaryUsage", () => usage);
const context = vi.hoisted(() =>
  vi.fn(() => ({ promptVersion: "abc", glosses: {} })),
);
vi.mock("@server/translation/liveTranslation", () => ({
  TRANSLATION_LOCALE_CODES: ["zh-Hans", "nl"],
  translationContextFromRows: context,
}));
vi.mock("@server/translation/segmentStore", () => ({
  translationSegmentCounts: async () => ({ total: 2, current: 1 }),
  translationJobCounts: async () => ({total:0,active:0,completed:0,completedWithRejections:0,exhausted:0,runId:null,requestedAt:null}),
}));
vi.mock("@server/next/localeHostPolicy", () => ({
  LIVE_LOCALE_CODES: ["zh-Hans"],
}));
const actor = {
  email: "translator@example.test",
  glossaryLocales: ["zh-Hans"],
};
const post = (path: string, body: unknown) =>
  new Request(`https://dev.dose.wiki/api/dev/translation-glossary/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Origin: "https://dev.dose.wiki",
    },
    body: JSON.stringify(body),
  });
const edit = {
  locale: "zh-Hans",
  term: "Euphoria",
  target: "欣快",
  expectedRevision: "100:2",
};
const approve = {
  locale: "zh-Hans",
  terms: ["Euphoria"],
  expectedRevisions: { Euphoria: "100:2" },
};
describe("glossary draft and approval routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireRoleSession.mockImplementation(
      roleSessionFor("translator", actor),
    );
    review.mutateGlossaryReview
      .mockReset()
      .mockResolvedValue([
        {
          term: "Euphoria",
          target: "欣快",
          status: "draft",
          revision: "100:3",
        },
      ]);
    review.readGlossaryReviewRows.mockResolvedValue([]);
    glossary.readGlossaryRows.mockResolvedValue([]);
    glossary.glossaryLocales.mockResolvedValue([]);
  });
  it("requires translator role and the assigned language for reads and writes", async () => {
    auth.requireRoleSession.mockImplementation(roleSessionFor("contributor"));
    expect((await approvePost(post("approve", approve))).status).toBe(403);
    auth.requireRoleSession.mockImplementation(
      roleSessionFor("translator", { ...actor, glossaryLocales: ["nl"] }),
    );
    expect((await editPost(post("edit", edit))).status).toBe(403);
    expect((await approvePost(post("approve", approve))).status).toBe(403);
    expect(
      (
        await GET(
          new Request(
            "https://dev.dose.wiki/api/dev/translation-glossary?locale=zh-Hans",
          ),
        )
      ).status,
    ).toBe(403);
    expect(review.mutateGlossaryReview).not.toHaveBeenCalled();
    expect(glossary.readGlossaryRows).not.toHaveBeenCalled();
  });
  it("saves a draft with the authenticated actor and exact expected revision", async () => {
    const response = await editPost(
      post("edit", { ...edit, reviewedBy: "forged@example.test" }),
    );
    expect(response.status).toBe(200);
    expect(review.mutateGlossaryReview).toHaveBeenCalledWith(
      "zh-Hans",
      [
        {
          term: "Euphoria",
          target: "欣快",
          expectedRevision: "100:2",
          action: "save",
        },
      ],
      actor.email,
    );
    expect(await response.json()).toMatchObject({ row: { status: "draft" } });
  });
  it("requires explicit approval of the exact saved revision", async () => {
    expect((await approvePost(post("approve", approve))).status).toBe(200);
    expect(review.mutateGlossaryReview).toHaveBeenCalledWith(
      "zh-Hans",
      [{ term: "Euphoria", expectedRevision: "100:2", action: "approve" }],
      actor.email,
      undefined,
    );
    review.mutateGlossaryReview.mockClear();
    expect(
      (
        await approvePost(
          post("approve", { locale: "zh-Hans", terms: ["Euphoria"] }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await editPost(post("edit", { ...edit, expectedRevision: undefined })))
        .status,
    ).toBe(400);
    expect(review.mutateGlossaryReview).not.toHaveBeenCalled();
  });
  it("returns 409 for stale reviews and exposes bounded collision acknowledgement", async () => {
    review.mutateGlossaryReview.mockRejectedValueOnce(
      new TranslationReviewConflictError(),
    );
    expect((await editPost(post("edit", edit))).status).toBe(409);
    const confirmation = "a".repeat(64);
    review.mutateGlossaryReview.mockRejectedValueOnce(
      new GlossaryCollisionError(
        [{ kind: "effect", target: "欣快", terms: ["A", "B"] }],
        confirmation,
      ),
    );
    const refused = await approvePost(post("approve", approve));
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({
      collisionConfirmation: confirmation,
    });
    expect(
      (
        await approvePost(
          post("approve", { ...approve, collisionConfirmation: "true" }),
        )
      ).status,
    ).toBe(400);
  });
  it("computes effective prompt from stored approval before projecting editable drafts", async () => {
    const base = [
      {
        term: "Euphoria",
        target: "old",
        status: "approved",
        reviewed_at: 1,
        retranslated_at: null,
      },
    ];
    const drafts = [
      {
        ...base[0],
        target: "new",
        status: "draft",
        approved_target: "old",
        revision: "1:1",
      },
    ];
    glossary.readGlossaryRows.mockResolvedValue(base);
    review.readGlossaryReviewRows.mockResolvedValue(drafts);
    const response = await GET(
      new Request(
        "https://dev.dose.wiki/api/dev/translation-glossary?locale=zh-Hans",
      ),
    );
    expect(response.status).toBe(200);
    expect(context).toHaveBeenCalledWith("zh-Hans", base, {});
    expect(await response.json()).toMatchObject({
      rows: drafts,
      segments: { total: 2, current: 1 },
      usages: {},
    });
    expect(usage.getGlossaryUsages).toHaveBeenCalledWith(["Euphoria"]);
  });

  it("skips the precomputed usage payload for lightweight progress polls", async () => {
    const response = await GET(new Request("https://dev.dose.wiki/api/dev/translation-glossary?locale=zh-Hans&includeUsage=0"));
    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty("usages");
    expect(usage.getGlossaryUsages).not.toHaveBeenCalled();
  });
});
