import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";
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

const glossary = vi.hoisted(() => ({
  readGlossaryRows: vi.fn(),
  importGlossaryDrafts: vi.fn(),
}));
vi.mock("@server/translation/glossaryReview", () => ({
  importGlossaryDrafts: glossary.importGlossaryDrafts,
}));
vi.mock("@server/translation/glossary", async (importActual) => ({
  ...(await importActual<typeof GlossaryModule>()),
  ...glossary,
}));

const draft = vi.hoisted(() => ({ collectGlossaryTerms: vi.fn() }));
vi.mock("@server/translation/glossaryDraft", () => draft);
vi.mock("@server/data/publicData.reads", () => ({
  getPublicDataReadAdapter: () => ({}),
}));
vi.mock("@server/translation/liveTranslation", () => ({
  TRANSLATION_LOCALE_CODES: ["zh-Hans", "nl"],
}));

const TRANSLATOR = {
  email: "translator@example.com",
  name: "Translator",
  glossaryLocales: ["zh-Hans"],
};

const post = (csv: string, locale = "zh-Hans") =>
  new Request(
    `https://dev.dose.wiki/api/dev/translation-glossary/import?locale=${locale}`,
    {
      method: "POST",
      headers: {
        "content-type": "text/csv; charset=utf-8",
        Origin: "https://dev.dose.wiki",
      },
      body: csv,
    },
  );

const existingRow = (
  term: string,
  kind: string,
  status: "draft" | "approved",
) => ({
  locale: "zh-Hans",
  term,
  target: "x",
  kind,
  status,
  source: "model",
  reviewed_at: null,
  reviewed_by: null,
  retranslated_at: null,
  updated_at: 1,
});

describe("POST /api/dev/translation-glossary/import", () => {
  beforeEach(() => {
    glossary.readGlossaryRows
      .mockReset()
      .mockResolvedValue([
        existingRow("Euphoria", "effect-name", "approved"),
        existingRow("Anxiety", "effect-name", "draft"),
      ]);
    glossary.importGlossaryDrafts
      .mockReset()
      .mockImplementation(
        async (_locale: string, rows: unknown[]) => rows.length,
      );
    draft.collectGlossaryTerms.mockReset().mockResolvedValue([
      { term: "Intravenous", kind: "route" },
      { term: "Euphoria", kind: "effect-name" },
    ]);
    backend.getDataBackend.mockReturnValue("postgres");
    authMocks.requireRoleSession
      .mockReset()
      .mockImplementation(roleSessionFor("translator", TRANSLATOR));
  });

  it("admits a translator and refuses a contributor before reading anything", async () => {
    authMocks.requireRoleSession.mockImplementation(
      roleSessionFor("contributor"),
    );
    expect((await POST(post("term,target\nEuphoria,欣快\n"))).status).toBe(403);
    expect(glossary.readGlossaryRows).not.toHaveBeenCalled();
    expect(glossary.importGlossaryDrafts).not.toHaveBeenCalled();
  });

  it("refuses imports outside the member's languages before reading or writing", async () => {
    expect(
      (await POST(post("term,target\nEuphoria,euforie\n", "nl"))).status,
    ).toBe(403);
    expect(glossary.readGlossaryRows).not.toHaveBeenCalled();
    expect(glossary.importGlossaryDrafts).not.toHaveBeenCalled();
  });

  it("imports every status as a draft and never inherits approval for changed wording", async () => {
    const response = await POST(
      post(
        "term,target,kind,status\nEUPHORIA,欣快,,approved\nAnxiety,焦虑,,\nIntravenous,静注,route-alias,pending\n",
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      locale: "zh-Hans",
      approved: 0,
      drafts: 3,
    });
    expect(glossary.importGlossaryDrafts).toHaveBeenCalledWith(
      "zh-Hans",
      [
        { term: "Euphoria", target: "欣快", kind: "effect-name" },
        { term: "Anxiety", target: "焦虑", kind: "effect-name" },
        { term: "Intravenous", target: "静注", kind: "route-alias" },
      ],
      TRANSLATOR.email,
    );
  });
});
