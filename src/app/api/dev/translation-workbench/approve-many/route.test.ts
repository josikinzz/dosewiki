import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import { migratedPGlite, routeTransportToPGlite } from "@/test/pglite";
import { readReviewHistory } from "@server/translation/reviewStore";
import { readApprovedUiTranslations, writeUiTranslation } from "@server/translation/uiTranslationStore";
import type { UiBatchApprovalResponse } from "@server/translation/uiTranslationTypes";
import { POST } from "./route";

vi.setConfig({ testTimeout: 30_000 });
const auth = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));
const transport = vi.hoisted(() => ({ sql: vi.fn(), sqlTransaction: vi.fn() }));
vi.mock("@/lib/auth/requireEditorSession", () => auth);
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@server/postgres/runtime/backend", () => ({ getDataBackend: () => "postgres", getPostgresClient: () => transport }));
vi.mock("@server/translation/liveTranslation", () => ({ TRANSLATION_LOCALE_CODES: ["zh-Hans", "nl"] }));

let db: PGlite;
beforeAll(async () => {
  db = await migratedPGlite();
  routeTransportToPGlite(transport, db);
}, 60_000);
beforeEach(async () => {
  vi.stubEnv("DATA_WRITES_FROZEN", "0");
  auth.requireRoleSession.mockImplementation(roleSessionFor("translator", { email: "sin@example.test", glossaryLocales: ["zh-Hans"] }));
  await db.exec('TRUNCATE "translationGlossary", "translationReviewEntries", "translationReviewHistory"');
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { await db?.close(); });

const post = (body: Record<string, unknown>) => POST(new Request("https://dev.dose.wiki/api/dev/translation-workbench/approve-many", {
  method: "POST", headers: { "content-type": "application/json", origin: "https://dev.dose.wiki" }, body: JSON.stringify(body),
}));

describe("batch approval of short UI labels", () => {
  it("approves the current rows and reports a stale revision as a conflict", async () => {
    await writeUiTranslation({ locale: "zh-Hans", id: "gallery.replications", action: "save", target: "复现", expectedRevision: 0, actor: "other@example.test", reason: "Earlier draft" });
    const response = await post({ locale: "zh-Hans", items: [
      { id: "appearance.light", expectedRevision: 0, target: "浅色" },
      { id: "gallery.replications", expectedRevision: 0, target: "再现作品" },
      { id: "appearance.dark", expectedRevision: 0, target: "深色模式" },
    ] });
    expect(response.status).toBe(200);
    const { results } = await response.json() as UiBatchApprovalResponse;
    expect(results.map((result) => [result.id, result.ok])).toEqual([["appearance.light", true], ["gallery.replications", false], ["appearance.dark", true]]);
    expect(results[1]).toMatchObject({ code: "TRANSLATION_REVIEW_CONFLICT" });
    expect(results[2]).toMatchObject({ row: { status: "approved", approved: { target: "深色模式" } } });
    const approved = await readApprovedUiTranslations("zh-Hans");
    expect(approved).toMatchObject({ "appearance.light": "浅色", "appearance.dark": "深色模式" });
    expect(approved).not.toHaveProperty("gallery.replications");
  });

  it("refuses the whole batch under the write freeze, outside the assigned locale, or without the translator role", async () => {
    const items = [{ id: "appearance.light", expectedRevision: 0, target: "浅色" }];
    vi.stubEnv("DATA_WRITES_FROZEN", "1");
    expect((await post({ locale: "zh-Hans", items })).status).toBe(503);
    vi.stubEnv("DATA_WRITES_FROZEN", "0");
    expect((await post({ locale: "nl", items })).status).toBe(403);
    auth.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    expect((await post({ locale: "zh-Hans", items })).status).toBe(403);
    expect(await readReviewHistory("zh-Hans", "ui", "appearance.light")).toEqual([]);
  });
});
