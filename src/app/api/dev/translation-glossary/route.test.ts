import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";
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
  getPostgresConvexClient: () => ({ sql: vi.fn() }),
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
const live = vi.hoisted(() => ({ loadTranslationContext: vi.fn() }));
vi.mock("@server/translation/liveTranslation", () => ({
  TRANSLATION_LOCALE_CODES: ["zh-Hans", "nl"],
  loadTranslationContext: live.loadTranslationContext,
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
    glossary.editGlossaryTerm.mockReset();
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

  it("answers 503 off the Postgres backend, where the glossary does not exist", async () => {
    backend.getDataBackend.mockReturnValue("convex");
    const response = await editPost(post("edit", { locale: "zh-Hans", term: "Euphoria", target: "欣快" }));
    expect(response.status).toBe(503);
    expect(glossary.editGlossaryTerm).not.toHaveBeenCalled();
  });

  it("uses the authenticated reviewer rather than a body-supplied identity", async () => {
    glossary.approveGlossaryTerms.mockResolvedValue(["Euphoria"]);
    const response = await approvePost(post("approve", {
      locale: "zh-Hans",
      terms: [" Euphoria ", "Euphoria", "Anxiety"],
      reviewedBy: "spoofed@example.com",
    }));
    expect(response.status).toBe(200);
    expect(glossary.approveGlossaryTerms).toHaveBeenCalledWith("zh-Hans", ["Euphoria", "Anxiety"], ADMIN.email);
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


  it("reports coverage and approved terms still awaiting retranslation", async () => {
    glossary.glossaryLocales.mockResolvedValue([]);
    glossary.readGlossaryRows.mockResolvedValue([
      { term: "Pending", status: "approved", reviewed_at: 2, retranslated_at: 1 },
      { term: "Current", status: "approved", reviewed_at: 2, retranslated_at: 2 },
      { term: "Unreviewed", status: "draft", reviewed_at: 3, retranslated_at: null },
    ]);
    live.loadTranslationContext.mockResolvedValue({ promptVersion: "abc", glosses: {} });
    segments.translationSegmentCounts.mockResolvedValue({ total: 13, current: 8 });

    const response = await GET(new Request("https://dev.dose.wiki/api/dev/translation-glossary?locale=zh-Hans"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      segments: { total: 13, current: 8 },
      pending: ["Pending"],
    });
  });
});
