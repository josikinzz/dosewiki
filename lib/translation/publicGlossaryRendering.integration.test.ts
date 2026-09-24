// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { projectGlossary } from "../../src/features/language-glossary/languageGlossary";
import { confirmLegacyGlossaryRows, mutateGlossaryReview, readGlossaryReviewRows } from "./glossaryReview";
import { PUBLIC_GLOSSARY_RENDERING_SELECT, publicGlossaryRendering } from "./publicGlossaryRendering";

vi.mock("server-only", () => ({}));
const transport = vi.hoisted(() => ({ sql: vi.fn(), sqlTransaction: vi.fn() }));
vi.mock("@server/postgres/runtime/backend", () => ({ getPostgresClient: () => transport }));

const LOCALE = "zh-Hans";
const REVIEWER = "sin@example.test";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  for (const file of readdirSync("lib/postgres/migrations").filter((name) => name.endsWith(".sql")).sort())
    await db.exec(readFileSync(`lib/postgres/migrations/${file}`, "utf8"));
  transport.sql.mockImplementation(async (query: string, params: unknown[] = []) => (await db.query(query, params)).rows);
  transport.sqlTransaction.mockImplementation((operation: (tx: { query: typeof db.query }) => Promise<unknown>) =>
    db.transaction((tx) => operation({ query: tx.query.bind(tx) as typeof db.query })));
}, 30_000);
beforeEach(async () => {
  vi.stubEnv("DATA_WRITES_FROZEN", "0");
  await db.exec('TRUNCATE "translationGlossary", "translationReviewEntries", "translationReviewHistory"');
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => db?.close());

async function seed(term: string, target: string, status: "approved" | "draft", reviewedBy: string | null = "legacy-import") {
  await db.query(
    `INSERT INTO "translationGlossary" (locale, term, target, kind, status, source, reviewed_at, reviewed_by, updated_at)
     VALUES ($1,$2,$3,'effect-name',$4,'model',5,$5,10)`,
    [LOCALE, term, target, status, reviewedBy],
  );
}
async function publicRows() {
  const rows = (await db.query<Record<string, unknown>>(`${PUBLIC_GLOSSARY_RENDERING_SELECT} WHERE g."locale" = $1 ORDER BY g."term"`, [LOCALE])).rows;
  return { raw: rows, renderings: rows.map(publicGlossaryRendering) };
}
const revisionOf = async (term: string) => (await readGlossaryReviewRows(LOCALE)).find((row) => row.term === term)!.revision;

describe("public glossary provenance over isolated Postgres", () => {
  it("projects legacy approvals as live and unchecked, never as checked by a person", async () => {
    await seed("Phenidate", "Phenidate", "approved");
    await seed("Euphoria", "欣快", "approved", REVIEWER);
    await seed("Drifting", "漂移", "draft", null);
    const { raw, renderings } = await publicRows();
    expect(renderings.map((row) => [row.term, row.provenance])).toEqual([
      ["Drifting", "machine_suggestion"],
      // A reviewer name on the row without a matching recorded approval is legacy metadata.
      ["Euphoria", "legacy_unverified"],
      ["Phenidate", "legacy_unverified"],
    ]);
    const entries = projectGlossary([{ term: "Tracers", kind: "effect-name", gloss: "" }], renderings);
    expect(Object.fromEntries(entries.map((entry) => [entry.term, entry.provenance]))).toEqual({
      Drifting: "machine_suggestion",
      Euphoria: "legacy_unverified",
      Phenidate: "legacy_unverified",
      Tracers: "missing",
    });
    for (const row of [...raw, ...renderings, ...entries]) {
      expect(row).not.toHaveProperty("reviewed_by");
      expect(row).not.toHaveProperty("actor");
      expect(JSON.stringify(row)).not.toContain(REVIEWER);
    }
  });

  it("agrees with the workbench once a person confirms, and falls back when the wording moves on", async () => {
    await seed("Phenidate", "Phenidate", "approved");
    await seed("Euphoria", "欣快", "approved");
    await seed("Tracers", "拖影", "approved");
    await confirmLegacyGlossaryRows(LOCALE, [
      { term: "Phenidate", expectedRevision: await revisionOf("Phenidate") },
      { term: "Euphoria", expectedRevision: await revisionOf("Euphoria") },
    ], REVIEWER);
    // Live bytes that no recorded approval carries are no longer checked.
    await db.query(`UPDATE "translationGlossary" SET target = '欣快感' WHERE term = 'Euphoria'`);
    const workbench = new Map((await readGlossaryReviewRows(LOCALE)).map((row) => [row.term, row.review_provenance]));
    const { raw, renderings } = await publicRows();
    expect(renderings.map((row) => [row.term, row.provenance])).toEqual([
      ["Euphoria", "legacy_unverified"],
      ["Phenidate", "human_review"],
      ["Tracers", "legacy_unverified"],
    ]);
    for (const row of renderings) expect(row.provenance).toBe(workbench.get(row.term));
    expect(JSON.stringify(raw)).not.toContain(REVIEWER);

    // A pending draft over checked wording is shown as a suggestion.
    await mutateGlossaryReview(LOCALE, [{ term: "Phenidate", expectedRevision: await revisionOf("Phenidate"), action: "save", target: "哌甲酯类" }], REVIEWER);
    expect((await publicRows()).renderings.find((row) => row.term === "Phenidate")).toMatchObject({ status: "draft", target: "哌甲酯类", provenance: "machine_suggestion" });
  });
});
