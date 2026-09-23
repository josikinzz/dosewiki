// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readApprovedUiTranslations, readUiTranslationHistory, readUiTranslations, writeUiTranslation } from "./uiTranslationStore";
import { importGlossaryDrafts, mutateGlossaryReview, readGlossaryReviewRows } from "./glossaryReview";
import { loadGlossary } from "./glossary";
import { readReviewHistory } from "./reviewStore";
import { enqueueTranslationJobs, claimTranslationJobs, completeTranslationJob, failTranslationJob, translationQueueCoverage } from "./segmentStore";

const transport = vi.hoisted(() => ({ sql: vi.fn(), sqlTransaction: vi.fn() }));
vi.mock("@server/postgres/runtime/backend", () => ({ getPostgresClient: () => transport }));
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  for (const migration of ["0006_translation_segments", "0007_translation_rejections", "0008_translation_glossary", "0009_glossary_retranslated_at", "0017_odd_silver_sable", "0018_useful_guardsmen", "0019_productive_zaladane", "0020_translation_review_workspace"]) {
    await db.exec(await readFile(new URL(`../postgres/migrations/${migration}.sql`, import.meta.url), "utf8"));
  }
  transport.sql.mockImplementation(async (query: string, params: unknown[] = []) => (await db.query(query, params)).rows);
  transport.sqlTransaction.mockImplementation((operation: (tx: { query: typeof db.query }) => Promise<unknown>) => db.transaction((tx) => operation({ query: tx.query.bind(tx) as typeof db.query })));
}, 30_000);
beforeEach(async () => {
  vi.stubEnv("DATA_WRITES_FROZEN", "0");
  await db.exec('TRUNCATE "translationReviewEntries", "translationReviewHistory", "translationGlossary", "translationJobs", "translationSegments", "translationRejections"');
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { await db?.close(); });

const ui = { locale: "zh-Hans", id: "appearance.light", actor: "reviewer@example.test", reason: "Correct the appearance meaning" };

describe("translation review through real Postgres statements", () => {
  it("an older worker cannot consume a newer glossary refresh request", async () => {
    await enqueueTranslationJobs(["zh-Hans"], ["2c-b"]);
    const [old] = await claimTranslationJobs(1, "incremental", "zh-Hans");
    await enqueueTranslationJobs(["zh-Hans"], ["2c-b"]);
    await completeTranslationJob(old);
    expect(await translationQueueCoverage("zh-Hans")).toMatchObject({ queued: 1, completed: 0 });
    const [current] = await claimTranslationJobs(1, "incremental", "zh-Hans");
    expect(Number(current.requested_at)).toBeGreaterThan(Number(old.requested_at));
    await failTranslationJob(current, "Rejected placeholder loss");
    expect(await translationQueueCoverage("zh-Hans")).toMatchObject({ retrying: 1, completed: 0 });
    const [retry] = await claimTranslationJobs(1, "incremental", "zh-Hans");
    await completeTranslationJob(retry);
    expect(await translationQueueCoverage("zh-Hans")).toMatchObject({ queued: 0, running: 0, completed: 1 });
  });
  it("keeps drafts out of publication, preserves approval during edits, and restores without publishing", async () => {
    const saved = await writeUiTranslation({ ...ui, action: "save", target: "浅色", expectedRevision: 0 });
    expect(await readApprovedUiTranslations(ui.locale)).toEqual({});
    const approved = await writeUiTranslation({ ...ui, action: "approve", expectedRevision: saved.revision });
    expect(await readApprovedUiTranslations(ui.locale)).toMatchObject({ "appearance.light": "浅色" });
    const correction = await writeUiTranslation({ ...ui, action: "save", target: "浅色模式", expectedRevision: approved.revision });
    expect(await readApprovedUiTranslations(ui.locale)).toMatchObject({ "appearance.light": "浅色" });
    await expect(writeUiTranslation({ ...ui, action: "approve", expectedRevision: approved.revision })).rejects.toMatchObject({ status: 409 });
    const changed = await writeUiTranslation({ ...ui, action: "approve", expectedRevision: correction.revision });
    await writeUiTranslation({ ...ui, action: "restore", restoreRevision: approved.revision, expectedRevision: changed.revision });
    expect(await readApprovedUiTranslations(ui.locale)).toMatchObject({ "appearance.light": "浅色模式" });
    const history = await readUiTranslationHistory(ui.locale, ui.id);
    expect(history).toHaveLength(5);
    expect(history[0]).toMatchObject({ action: "restore", actor: ui.actor, after: { draft: { target: "浅色" }, approved: { target: "浅色模式" } } });
  });

  it("retains and restores original compiled wording as an unapproved draft", async () => {
    const saved = await writeUiTranslation({ ...ui, action: "save", target: "浅色模式", expectedRevision: 0 });
    const [first] = await readUiTranslationHistory(ui.locale, ui.id);
    expect(first.before.draft).toMatchObject({ target: "浅色", provenance: "compiled" });
    expect(first.before.approved).toBeNull();
    await writeUiTranslation({ ...ui, action: "restore", restoreRevision: 0, expectedRevision: saved.revision });
    expect(await readApprovedUiTranslations(ui.locale)).toEqual({});
    const [restored] = await readUiTranslationHistory(ui.locale, ui.id);
    expect(restored.after.draft).toMatchObject({ target: "浅色", provenance: "compiled" });
  });

  it("shows the Russian compiled baseline and restores it without inventing approval", async () => {
    const initial = (await readUiTranslations("ru")).find((row) => row.source === "About")!;
    expect(initial).toMatchObject({ compiledTarget: "О проекте", status: "unreviewed", approved: null, draft: null });
    const russian = { ...ui, locale: "ru", id: initial.id };
    const saved = await writeUiTranslation({ ...russian, action: "save", target: "О сайте", expectedRevision: 0 });
    const [first] = await readUiTranslationHistory("ru", initial.id);
    expect(first.before.draft).toMatchObject({ target: initial.compiledTarget, provenance: "compiled" });
    expect(first.before.approved).toBeNull();
    await writeUiTranslation({ ...russian, action: "restore", restoreRevision: 0, expectedRevision: saved.revision });
    const [restored] = await readUiTranslationHistory("ru", initial.id);
    expect(restored.after.draft).toMatchObject({ target: initial.compiledTarget, provenance: "compiled" });
    expect(await readApprovedUiTranslations("ru")).toEqual({});
  });

  it("rejects invalid approval atomically and a frozen write creates no history", async () => {
    const saved = await writeUiTranslation({ ...ui, action: "save", target: "浅色 {{unknown}}", expectedRevision: 0 });
    await expect(writeUiTranslation({ ...ui, action: "approve", expectedRevision: saved.revision })).rejects.toThrow("PLACEHOLDER_LOSS");
    expect(await readUiTranslationHistory(ui.locale, ui.id)).toHaveLength(1);
    expect(await readApprovedUiTranslations(ui.locale)).toEqual({});
    vi.stubEnv("DATA_WRITES_FROZEN", "1");
    await expect(writeUiTranslation({ ...ui, action: "save", target: "浅色", expectedRevision: saved.revision })).rejects.toThrow();
    expect(await readUiTranslationHistory(ui.locale, ui.id)).toHaveLength(1);
  });

  it("CSV corrections preserve effective glossary text until an exact revision is approved", async () => {
    await db.query('INSERT INTO "translationGlossary" ("locale","term","target","kind","status","source","reviewed_at","reviewed_by","updated_at") VALUES ($1,$2,$3,$4,$5,$6,10,$7,10)', ["zh-Hans", "Replication", "复现", "replication", "approved", "model", "legacy-import"]);
    await importGlossaryDrafts("zh-Hans", [{ term: "Replication", target: "体验再现", kind: "replication" }], ui.actor);
    expect(await loadGlossary("zh-Hans")).toEqual({ Replication: "复现" });
    const [draft] = await readGlossaryReviewRows("zh-Hans");
    expect(draft).toMatchObject({ target: "体验再现", approved_target: "复现", status: "draft", review_provenance: "legacy_unverified" });
    await mutateGlossaryReview("zh-Hans", [{ term: "Replication", action: "approve", expectedRevision: draft.revision }], ui.actor);
    expect(await loadGlossary("zh-Hans")).toEqual({ Replication: "体验再现" });
    expect((await readGlossaryReviewRows("zh-Hans"))[0].review_provenance).toBe("human_review");
    await expect(mutateGlossaryReview("zh-Hans", [{ term: "Replication", action: "save", target: "复现", expectedRevision: draft.revision }], ui.actor)).rejects.toMatchObject({ status: 409 });
    expect(await readReviewHistory("zh-Hans", "glossary", "Replication")).toHaveLength(2);
  });
});
