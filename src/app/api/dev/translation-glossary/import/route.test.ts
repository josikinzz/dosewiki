import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";
import { GlossaryCollisionError } from "@server/translation/glossary";
import type * as GlossaryModule from "@server/translation/glossary";

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

const glossary = vi.hoisted(() => ({ readGlossaryRows: vi.fn(), upsertGlossaryRows: vi.fn() }));
vi.mock("@server/translation/glossary", async (importActual) => ({
  ...(await importActual<typeof GlossaryModule>()),
  ...glossary,
}));

const draft = vi.hoisted(() => ({ collectGlossaryTerms: vi.fn() }));
vi.mock("@server/translation/glossaryDraft", () => draft);
vi.mock("@server/data/publicData.reads", () => ({ getPublicDataReadAdapter: () => ({}) }));
vi.mock("@server/translation/liveTranslation", () => ({
  TRANSLATION_LOCALE_CODES: ["zh-Hans", "nl"],
}));

const TRANSLATOR = { email: "translator@example.com", name: "Translator", glossaryLocales: ["zh-Hans"] };

const post = (csv: string, locale = "zh-Hans") =>
  new Request(`https://dev.dose.wiki/api/dev/translation-glossary/import?locale=${locale}`, {
    method: "POST",
    headers: { "content-type": "text/csv; charset=utf-8", Origin: "https://dev.dose.wiki" },
    body: csv,
  });

const existingRow = (term: string, kind: string, status: "draft" | "approved") =>
  ({ locale: "zh-Hans", term, target: "x", kind, status, source: "model", reviewed_at: null, reviewed_by: null, retranslated_at: null, updated_at: 1 });

describe("POST /api/dev/translation-glossary/import", () => {
  beforeEach(() => {
    glossary.readGlossaryRows.mockReset().mockResolvedValue([existingRow("Euphoria", "effect-name", "approved"), existingRow("Anxiety", "effect-name", "draft")]);
    glossary.upsertGlossaryRows.mockReset().mockImplementation(async (_locale: string, rows: unknown[]) => rows.length);
    draft.collectGlossaryTerms.mockReset().mockResolvedValue([{ term: "Intravenous", kind: "route" }, { term: "Euphoria", kind: "effect-name" }]);
    backend.getDataBackend.mockReturnValue("postgres");
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("translator", TRANSLATOR));
  });

  it("admits a translator and refuses a contributor before reading anything", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("contributor"));
    expect((await POST(post("term,target\nEuphoria,欣快\n"))).status).toBe(403);
    expect(glossary.readGlossaryRows).not.toHaveBeenCalled();
    expect(glossary.upsertGlossaryRows).not.toHaveBeenCalled();
  });

  it("refuses imports outside the member's languages before reading or writing", async () => {
    expect((await POST(post("term,target\nEuphoria,euforie\n", "nl"))).status).toBe(403);
    expect(glossary.readGlossaryRows).not.toHaveBeenCalled();
    expect(glossary.upsertGlossaryRows).not.toHaveBeenCalled();
  });

  it("answers 400 for an unknown locale and for a file without the header", async () => {
    expect((await POST(post("term,target\nEuphoria,欣快\n", "fr"))).status).toBe(400);
    const headless = await POST(post("Euphoria,欣快\n"));
    expect(headless.status).toBe(400);
    expect((await headless.json()).error).toMatch(/first line must name the columns/);
    expect((await POST(post("term,target\n"))).status).toBe(400);
    expect(glossary.upsertGlossaryRows).not.toHaveBeenCalled();
  });

  it("refuses the whole file when a term is unknown, a rendering is blank, or a term repeats", async () => {
    const response = await POST(post("term,target\nEuphoria,欣快\nEuphoria,快\nSerotonin,血清素\nAnxiety,\n"));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.unknownTerms).toEqual(["Serotonin"]);
    expect(glossary.upsertGlossaryRows).not.toHaveBeenCalled();
  });

  it("writes approved rows as the translator and the rest as human drafts, taking the kind from the file, the row, or the site", async () => {
    const csv = "\uFEFFterm,target,kind,status\r\nEUPHORIA,欣快,,approved\r\nAnxiety,焦虑,,\r\nIntravenous,\"静注, IV\",route-alias,pending\r\n";
    const response = await POST(post(csv));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, locale: "zh-Hans", approved: 1, drafts: 2 });
    expect(glossary.upsertGlossaryRows).toHaveBeenNthCalledWith(1, "zh-Hans",
      [{ term: "Euphoria", target: "欣快", kind: "effect-name" }],
      { status: "approved", source: "human", reviewedBy: TRANSLATOR.email });
    expect(glossary.upsertGlossaryRows).toHaveBeenNthCalledWith(2, "zh-Hans",
      [{ term: "Anxiety", target: "焦虑", kind: "effect-name" }, { term: "Intravenous", target: "静注, IV", kind: "route-alias" }],
      { status: "draft", source: "human", reviewedBy: TRANSLATOR.email });
  });

  it("keeps an already approved term approved when the file leaves its status blank", async () => {
    const response = await POST(post("term,target\nEuphoria,欣快感\nAnxiety,焦虑\n"));
    expect(await response.json()).toEqual({ ok: true, locale: "zh-Hans", approved: 1, drafts: 1 });
    expect(glossary.upsertGlossaryRows).toHaveBeenNthCalledWith(1, "zh-Hans",
      [{ term: "Euphoria", target: "欣快感", kind: "effect-name" }],
      { status: "approved", source: "human", reviewedBy: TRANSLATOR.email });
  });


  it("refuses a body over 2 MB without parsing it", async () => {
    const response = await POST(post(`term,target\n${"Euphoria,欣快\n".repeat(200_000)}`));
    expect(response.status).toBe(413);
    expect(glossary.readGlossaryRows).not.toHaveBeenCalled();
  });

  it("keeps drafts unwritten on collision and requires a bounded header acknowledgement for a reviewed retry", async () => {
    const collisionConfirmation = "b".repeat(64);
    const collisions = [{ kind: "effect-name", target: "欣快", terms: ["Anxiety", "Euphoria"] }];
    glossary.upsertGlossaryRows.mockImplementation(async (_locale, rows, by) => {
      if (by.status === "approved" && by.collisionConfirmation !== collisionConfirmation) throw new GlossaryCollisionError(collisions, collisionConfirmation);
      return rows.length;
    });
    const csv = "term,target\nEuphoria,欣快\nAnxiety,焦虑\n";
    const refused = await POST(post(csv));
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ collisions, collisionConfirmation });
    expect(glossary.upsertGlossaryRows).toHaveBeenCalledTimes(1);
    glossary.upsertGlossaryRows.mockClear();
    const invalid = post(csv);
    invalid.headers.set("X-Glossary-Collision-Confirmation", "true");
    expect((await POST(invalid)).status).toBe(400);
    expect(glossary.upsertGlossaryRows).not.toHaveBeenCalled();
    const confirmed = post(csv);
    confirmed.headers.set("X-Glossary-Collision-Confirmation", collisionConfirmation);
    expect(await (await POST(confirmed)).json()).toMatchObject({ approved: 1, drafts: 1 });
    glossary.upsertGlossaryRows.mockClear();
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("contributor"));
    const unauthorized = post(csv);
    unauthorized.headers.set("X-Glossary-Collision-Confirmation", collisionConfirmation);
    expect((await POST(unauthorized)).status).toBe(403);
    expect(glossary.upsertGlossaryRows).not.toHaveBeenCalled();
  });
});
