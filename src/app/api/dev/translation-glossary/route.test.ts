import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";

import { POST as approvePost } from "./approve/route";
import { POST as editPost } from "./edit/route";

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
}));
vi.mock("@server/translation/glossary", () => glossary);
vi.mock("@server/translation/liveTranslation", () => ({
  TRANSLATION_LOCALE_CODES: ["zh-Hans", "nl"],
}));

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

  it("refuses an editor before touching the glossary", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    const response = await approvePost(post("approve", { locale: "zh-Hans", terms: ["Euphoria"] }));
    expect(response.status).toBe(403);
    expect(glossary.approveGlossaryTerms).not.toHaveBeenCalled();
  });

  it("answers 503 off the Postgres backend, where the glossary does not exist", async () => {
    backend.getDataBackend.mockReturnValue("convex");
    const response = await editPost(post("edit", { locale: "zh-Hans", term: "Euphoria", target: "欣快" }));
    expect(response.status).toBe(503);
    expect(glossary.editGlossaryTerm).not.toHaveBeenCalled();
  });

  it("approves the deduped terms as the signed-in admin and reports which ones changed", async () => {
    glossary.approveGlossaryTerms.mockResolvedValue(["Euphoria"]);
    const response = await approvePost(post("approve", { locale: "zh-Hans", terms: [" Euphoria ", "Euphoria", "Anxiety"] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, locale: "zh-Hans", approved: ["Euphoria"] });
    expect(glossary.approveGlossaryTerms).toHaveBeenCalledWith("zh-Hans", ["Euphoria", "Anxiety"], ADMIN.email);
  });

  it("rejects an unknown locale, an empty term list, and an empty rendering without writing", async () => {
    expect((await approvePost(post("approve", { locale: "fr", terms: ["Euphoria"] }))).status).toBe(400);
    expect((await approvePost(post("approve", { locale: "zh-Hans", terms: [] }))).status).toBe(400);
    expect((await editPost(post("edit", { locale: "zh-Hans", term: "Euphoria", target: "  " }))).status).toBe(400);
    expect(glossary.approveGlossaryTerms).not.toHaveBeenCalled();
    expect(glossary.editGlossaryTerm).not.toHaveBeenCalled();
  });

  it("saves a rendering as the reviewer and returns the approved row", async () => {
    const row = { locale: "zh-Hans", term: "Euphoria", target: "欣快", kind: "effect-name", status: "approved", source: "human", reviewed_at: 1, reviewed_by: ADMIN.email, updated_at: 1 };
    glossary.editGlossaryTerm.mockResolvedValue(row);
    const response = await editPost(post("edit", { locale: "zh-Hans", term: "Euphoria", target: " 欣快 " }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, row });
    expect(glossary.editGlossaryTerm).toHaveBeenCalledWith("zh-Hans", "Euphoria", "欣快", ADMIN.email);
  });

  it("answers 404 for a term the locale has no row for", async () => {
    glossary.editGlossaryTerm.mockResolvedValue(null);
    const response = await editPost(post("edit", { locale: "nl", term: "Euphoria", target: "euforie" }));
    expect(response.status).toBe(404);
  });
});
