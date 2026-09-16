import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";
import { GlossaryCollisionError } from "@server/translation/glossary";
import type * as GlossaryModule from "@server/translation/glossary";

import { POST as approvePost } from "./approve/route";
import { POST as editPost } from "./edit/route";
import { GET } from "./route";

vi.mock("server-only", () => ({}));

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const backend = vi.hoisted(() => ({ getDataBackend: vi.fn(() => "postgres") }));
vi.mock("@server/postgres/runtime/backend", () => ({
  getDataBackend: backend.getDataBackend,
  getPostgresClient: () => ({ sql: vi.fn() }),
}));

const glossary = vi.hoisted(() => ({
  approveGlossaryTerms: vi.fn(),
  editGlossaryTerm: vi.fn(),
  glossaryLocales: vi.fn(),
  readGlossaryRows: vi.fn(),
}));
vi.mock("@server/translation/glossary", async (importActual) => ({
  ...(await importActual<typeof GlossaryModule>()),
  ...glossary,
}));
const glosses = vi.hoisted(() => ({ loadGlosses: vi.fn() }));
vi.mock("@server/translation/glossaryGloss", () => glosses);
const live = vi.hoisted(() => ({
  translationContextFromRows: vi.fn((_locale: string, rows: Array<{ term?: string; target?: string; status?: string }>, loadedGlosses: unknown) => ({
    promptVersion: "abc",
    glosses: loadedGlosses,
    rows,
  })),
}));
vi.mock("@server/translation/liveTranslation", () => ({
  TRANSLATION_LOCALE_CODES: ["zh-Hans", "nl"],
  translationContextFromRows: live.translationContextFromRows,
}));
const segments = vi.hoisted(() => ({
  translationSegmentCounts: vi.fn(),
}));
vi.mock("@server/translation/segmentStore", () => segments);
vi.mock("@server/next/localeHostPolicy", () => ({ LIVE_LOCALE_CODES: ["zh-Hans"] }));

const ADMIN = { email: "admin@example.com", name: "Admin" };

const post = (path: string, body: unknown) =>
  new Request(`https://dev.dose.wiki/api/dev/translation-glossary/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: "https://dev.dose.wiki" },
    body: JSON.stringify(body),
  });

describe("translation glossary routes", () => {
  beforeEach(() => {
    glossary.approveGlossaryTerms.mockReset();
    glossary.readGlossaryRows.mockReset();
    glossary.glossaryLocales.mockReset();
    glossary.editGlossaryTerm.mockReset();
    glosses.loadGlosses.mockReset().mockResolvedValue([]);
    backend.getDataBackend.mockReturnValue("postgres");
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("admin", ADMIN));
  });

  it("asks for the translator floor and refuses a contributor before touching the glossary", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("contributor"));
    const response = await approvePost(post("approve", { locale: "zh-Hans", terms: ["Euphoria"] }));
    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("translator");
    expect(glossary.approveGlossaryTerms).not.toHaveBeenCalled();
  });

  it("refuses Editor-only and unapproved language reads and writes, even when the request claims a grant", async () => {
    for (const role of ["editor", "translator", "editor_translator"] as const) {
      authMocks.requireRoleSession.mockImplementation(roleSessionFor(role, { email: "member@example.com", glossaryLocales: ["nl"] }));
      expect((await GET(new Request("https://dev.dose.wiki/api/dev/translation-glossary?locale=zh-Hans"))).status).toBe(403);
      expect((await approvePost(post("approve", { locale: "zh-Hans", terms: ["Euphoria"], glossaryLocales: ["zh-Hans"] }))).status).toBe(403);
      expect((await editPost(post("edit", { locale: "zh-Hans", term: "Euphoria", target: "欣快" }))).status).toBe(403);
    }
    expect(glossary.readGlossaryRows).not.toHaveBeenCalled();
    expect(glossary.approveGlossaryTerms).not.toHaveBeenCalled();
    expect(glossary.editGlossaryTerm).not.toHaveBeenCalled();
  });

  it("defaults to the member's approved language and exposes only their locale choices", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor_translator", { email: "member@example.com", glossaryLocales: ["nl"] }));
    glossary.glossaryLocales.mockResolvedValue([{ locale: "zh-Hans", approved: 10, draft: 2 }, { locale: "nl", approved: 1, draft: 0 }]);
    glossary.readGlossaryRows.mockResolvedValue([]);
    segments.translationSegmentCounts.mockResolvedValue({ total: 0, current: 0 });
    const response = await GET(new Request("https://dev.dose.wiki/api/dev/translation-glossary"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ locale: "nl", locales: [{ locale: "nl", approved: 1, draft: 0 }] });
    expect(glossary.readGlossaryRows).toHaveBeenCalledWith("nl");
    glossary.approveGlossaryTerms.mockResolvedValue(["Euphoria"]);
    expect((await approvePost(post("approve", { locale: "nl", terms: ["Euphoria"] }))).status).toBe(200);
  });

  it("uses the authenticated reviewer rather than a body-supplied identity", async () => {
    glossary.approveGlossaryTerms.mockResolvedValue(["Euphoria"]);
    const response = await approvePost(post("approve", {
      locale: "zh-Hans",
      terms: [" Euphoria ", "Euphoria", "Anxiety"],
      reviewedBy: "spoofed@example.com",
    }));
    expect(response.status).toBe(200);
    expect(glossary.approveGlossaryTerms).toHaveBeenCalledWith("zh-Hans", ["Euphoria", "Anxiety"], ADMIN.email, undefined);
  });

  it("rejects an unknown locale, an empty term list, and an empty rendering without writing", async () => {
    expect((await approvePost(post("approve", { locale: "fr", terms: ["Euphoria"] }))).status).toBe(400);
    expect((await approvePost(post("approve", { locale: "zh-Hans", terms: [] }))).status).toBe(400);
    expect((await editPost(post("edit", { locale: "zh-Hans", term: "Euphoria", target: "  " }))).status).toBe(400);
    expect(glossary.approveGlossaryTerms).not.toHaveBeenCalled();
    expect(glossary.editGlossaryTerm).not.toHaveBeenCalled();
  });


  it("answers 404 for a term the locale has no row for", async () => {
    glossary.editGlossaryTerm.mockResolvedValue(null);
    const response = await editPost(post("edit", { locale: "nl", term: "Euphoria", target: "euforie" }));
    expect(response.status).toBe(404);
  });

  it("returns structured collisions for approval and edit, and rejects malformed confirmation without calling either write", async () => {
    const collisionConfirmation = "a".repeat(64);
    const collisions = [{ kind: "replication", target: "艺术家", terms: ["Artist", "Replicator"] }];
    glossary.approveGlossaryTerms.mockRejectedValue(new GlossaryCollisionError(collisions, collisionConfirmation));
    glossary.editGlossaryTerm.mockRejectedValue(new GlossaryCollisionError(collisions, collisionConfirmation));
    for (const [action, handler, fields] of [
      ["approve", approvePost, { terms: ["Artist", "Replicator"] }],
      ["edit", editPost, { term: "Artist", target: "艺术家" }],
    ] as const) {
      const response = await handler(post(action, { locale: "zh-Hans", ...fields }));
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ collisions, collisionConfirmation });
    }
    glossary.approveGlossaryTerms.mockClear();
    glossary.editGlossaryTerm.mockClear();
    for (const invalid of [true, null, "", "a".repeat(65), { allowCollisions: true }]) {
      expect((await approvePost(post("approve", { locale: "zh-Hans", terms: ["Artist"], collisionConfirmation: invalid }))).status).toBe(400);
      expect((await editPost(post("edit", { locale: "zh-Hans", term: "Artist", target: "艺术家", collisionConfirmation: invalid }))).status).toBe(400);
    }
    expect(glossary.approveGlossaryTerms).not.toHaveBeenCalled();
    expect(glossary.editGlossaryTerm).not.toHaveBeenCalled();
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("contributor"));
    expect((await approvePost(post("approve", { locale: "zh-Hans", terms: ["Artist"], collisionConfirmation }))).status).toBe(403);
    expect((await editPost(post("edit", { locale: "zh-Hans", term: "Artist", target: "艺术家", collisionConfirmation }))).status).toBe(403);
    expect(glossary.approveGlossaryTerms).not.toHaveBeenCalled();
    expect(glossary.editGlossaryTerm).not.toHaveBeenCalled();
  });


  it("reports coverage and approved terms still awaiting retranslation", async () => {
    glossary.glossaryLocales.mockResolvedValue([]);
    glossary.readGlossaryRows.mockResolvedValue([
      { term: "Pending", status: "approved", reviewed_at: 2, retranslated_at: 1 },
      { term: "Current", status: "approved", reviewed_at: 2, retranslated_at: 2 },
      { term: "Unreviewed", status: "draft", reviewed_at: 3, retranslated_at: null },
    ]);
    segments.translationSegmentCounts.mockResolvedValue({ total: 13, current: 8 });

    const response = await GET(new Request("https://dev.dose.wiki/api/dev/translation-glossary?locale=zh-Hans"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      segments: { total: 13, current: 8 },
      pending: ["Pending"],
    });
  });
});
