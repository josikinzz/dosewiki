import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";
import { GlossaryGlossError } from "@server/translation/glossaryGloss";
import type * as GlossModule from "@server/translation/glossaryGloss";

import { POST } from "./route";

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

vi.mock("@server/data/publicData.reads", () => ({ getPublicDataReadAdapter: () => ({}) }));

const gloss = vi.hoisted(() => ({
  findGloss: vi.fn(),
  knownGlossaryTerms: vi.fn(),
  upsertGlosses: vi.fn(),
}));
vi.mock("@server/translation/glossaryGloss", async (importActual) => ({
  ...(await importActual<typeof GlossModule>()),
  ...gloss,
}));

const EDITOR = { email: "editor@example.com", name: "Editor" };

const post = (body: unknown) =>
  new Request("https://dev.dose.wiki/api/dev/translation-glossary/gloss", {
    method: "POST",
    headers: { "content-type": "application/json", Origin: "https://dev.dose.wiki" },
    body: JSON.stringify(body),
  });

const row = { term: "Offset", kind: "enum:duration", gloss: "Duration stage 4 of 6: effects declining", updated_at: 1, updated_by: EDITOR.email };

describe("POST /api/dev/translation-glossary/gloss", () => {
  beforeEach(() => {
    gloss.findGloss.mockReset().mockResolvedValue(null);
    gloss.knownGlossaryTerms.mockReset().mockResolvedValue([{ term: "Offset", kind: "enum:duration" }, { term: "Marquis", kind: "reagent-name" }]);
    gloss.upsertGlosses.mockReset().mockResolvedValue(1);
    backend.getDataBackend.mockReturnValue("postgres");
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("editor", EDITOR));
  });

  it("asks for the editor floor: a translator is refused before anything is read", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("translator"));
    const response = await POST(post({ term: "Offset", gloss: "Duration stage 4 of 6" }));
    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("editor");
    expect(gloss.knownGlossaryTerms).not.toHaveBeenCalled();
    expect(gloss.upsertGlosses).not.toHaveBeenCalled();
  });

  it("accepts an exact known term and uses its kind and the authenticated editor", async () => {
    gloss.findGloss.mockResolvedValueOnce(null).mockResolvedValueOnce(row);
    const response = await POST(post({
      term: " Offset ",
      gloss: " Duration stage 4 of 6: effects declining ",
      kind: "spoofed-kind",
      updated_by: "spoofed@example.com",
    }));
    expect(response.status).toBe(200);
    expect(gloss.upsertGlosses).toHaveBeenCalledWith([{ term: "Offset", kind: "enum:duration", gloss: "Duration stage 4 of 6: effects declining" }], EDITOR.email);
  });

  it("resolves case-insensitive input to the canonical flat glossary term", async () => {
    gloss.findGloss.mockResolvedValueOnce(null).mockResolvedValueOnce(row);
    const response = await POST(post({ term: "offset", gloss: row.gloss }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, row: { term: "Offset" } });
    expect(gloss.upsertGlosses).toHaveBeenCalledWith(
      [{ term: "Offset", kind: row.kind, gloss: row.gloss }], EDITOR.email,
    );
  });

  it("preserves an existing term's kind rather than accepting a caller override", async () => {
    const existing = { ...row, kind: "custom-kind" };
    gloss.findGloss.mockResolvedValue(existing);
    const response = await POST(post({ term: "Offset", kind: "spoofed-kind", gloss: "Rewritten" }));
    expect(response.status).toBe(200);
    expect(gloss.upsertGlosses).toHaveBeenCalledWith([{ term: "Offset", kind: "custom-kind", gloss: "Rewritten" }], EDITOR.email);
  });

  it("answers 404 for a term neither the site nor any locale's glossary knows", async () => {
    const response = await POST(post({ term: "Banana", gloss: "A fruit" }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: expect.stringContaining('"Banana"') });
    expect(gloss.upsertGlosses).not.toHaveBeenCalled();
  });

  it("answers 400 for an empty gloss, a missing term, or a store refusal", async () => {
    expect((await POST(post({ term: "Offset", gloss: "   " }))).status).toBe(400);
    expect((await POST(post({ term: "", gloss: "Something" }))).status).toBe(400);
    expect(gloss.upsertGlosses).not.toHaveBeenCalled();

    gloss.upsertGlosses.mockRejectedValue(new GlossaryGlossError("The gloss for \"Offset\" is empty."));
    const refused = await POST(post({ term: "Offset", gloss: "Something" }));
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: 'The gloss for "Offset" is empty.' });
  });
});
