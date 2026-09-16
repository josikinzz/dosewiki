import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";

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

const glossary = vi.hoisted(() => ({ readGlossaryRows: vi.fn() }));
vi.mock("@server/translation/glossary", () => glossary);
const gloss = vi.hoisted(() => ({ loadGlosses: vi.fn(async () => ({ Euphoria: "Intense well-being, an effect name" })) }));
vi.mock("@server/translation/glossaryGloss", () => gloss);
vi.mock("@server/translation/liveTranslation", () => ({
  TRANSLATION_LOCALE_CODES: ["zh-Hans", "nl"],
}));

const get = (query: string) => new Request(`https://dev.dose.wiki/api/dev/translation-glossary/export${query}`);

describe("GET /api/dev/translation-glossary/export", () => {
  beforeEach(() => {
    glossary.readGlossaryRows.mockReset();
    backend.getDataBackend.mockReturnValue("postgres");
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("translator", { email: "translator@example.com", glossaryLocales: ["zh-Hans"] }));
  });

  it("admits a translator and refuses a contributor before reading", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("contributor"));
    expect((await GET(get("?locale=zh-Hans"))).status).toBe(403);
    expect(glossary.readGlossaryRows).not.toHaveBeenCalled();
  });

  it("refuses a different approved language and legacy unscoped translators before reading", async () => {
    expect((await GET(get("?locale=nl"))).status).toBe(403);
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("translator"));
    expect((await GET(get("?locale=zh-Hans"))).status).toBe(403);
    expect(glossary.readGlossaryRows).not.toHaveBeenCalled();
  });

  it("answers 400 for an unknown locale", async () => {
    expect((await GET(get("?locale=fr"))).status).toBe(400);
    expect(glossary.readGlossaryRows).not.toHaveBeenCalled();
  });

  it("downloads the locale's rows as BOM-prefixed CSV named for the locale, each row carrying its gloss", async () => {
    glossary.readGlossaryRows.mockResolvedValue([
      { locale: "zh-Hans", term: "Euphoria", target: "欣快", kind: "effect-name", status: "approved" },
      { locale: "zh-Hans", term: "IV, or so", target: '静注 "x"', kind: "route", status: "draft" },
    ]);
    const response = await GET(get("?locale=zh-Hans"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="glossary-zh-Hans.csv"');
    // Response.text() strips a leading BOM, so the bytes are what prove it is there.
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe('term,target,kind,status,gloss\r\nEuphoria,欣快,effect-name,approved,"Intense well-being, an effect name"\r\n"IV, or so","静注 ""x""",route,draft,\r\n');
    expect(glossary.readGlossaryRows).toHaveBeenCalledWith("zh-Hans");
  });
});
