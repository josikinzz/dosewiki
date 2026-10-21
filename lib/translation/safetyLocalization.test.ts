import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicDataReadAdapter } from "../data/publicData.reads";
import { segmentHash } from "../../scripts/translation/segment-manifest.mjs";
import { localizeRecord } from "./liveTranslation";
import { readNarrativeReview, writeNarrativeReview } from "./narrativeReview";
import { TranslationReviewError } from "./reviewStore";
import { writeTranslations } from "./segmentStore";

vi.setConfig({ testTimeout: 60_000 });
const transport = vi.hoisted(() => ({ sql: vi.fn(), sqlTransaction: vi.fn() }));
vi.mock("@server/postgres/runtime/backend", () => ({ getDataBackend: () => "postgres", getPostgresClient: () => transport }));

const LOCALE = "zh-Hans";
const NOTE = "Start with a low dose; effects can build for 2 hours [cite:ref-1].";
const NEIGHBOUR = "Food delays the onset.";
const DE_NOTES = "Controlled under Anlage I of the narcotics act.";
const CA_NOTES = "Listed in the California controlled substances schedule.";
const NOTE_FIELD = "dosage.routes[0].notes";
const DE_FIELD = "legality.countries.DE.notes";

const MACHINE: Record<string, string> = {
  [NOTE]: "从低剂量开始；效果可在 2 小时内逐渐增强 [cite:ref-1]。",
  [NEIGHBOUR]: "食物会延迟起效。",
  Lithium: "锂",
  Alcohol: "酒精",
  Illegal: "非法",
  [DE_NOTES]: "受麻醉品法附表一管制。",
  Controlled: "受管制",
  [CA_NOTES]: "列入加利福尼亚州受管制物质附表。",
};
const HUMAN_NOTE = "请从低剂量开始；效果可能在 2 小时内持续增强 [cite:ref-1]。";
const HUMAN_DE = "依据《麻醉品法》附表一受到管制。";

type Article = ReturnType<typeof article>;
function article(slug = "example-substance", text: { note?: string; neighbour?: string } = {}) {
  return {
    slug,
    dosage: {
      routes: [{
        route: "oral",
        dose_ranges: { light: { min: 5, max: 10, unit: "mg" }, common: { min: 10, max: 20, unit: "mg" } },
        notes: text.note ?? NOTE,
        bioavailability_notes: text.neighbour ?? NEIGHBOUR,
        reference_ids: ["ref-1"],
      }],
    },
    interactions: { dangerous: ["Lithium"], unsafe: [] as string[], caution: ["Alcohol"] },
    legality: {
      international: [] as string[],
      countries: { DE: { status: "Illegal", canonicalStatus: "prohibited", notes: DE_NOTES } },
      usStates: { CA: { status: "Controlled", canonicalStatus: "prohibited", notes: CA_NOTES } },
    },
  };
}

const published = new Map<string, Article>();
const reads = {
  getPublicSubstanceBySlug: async (slug: string) => published.get(slug) ?? null,
  getPublicSubstanceSlugs: async () => [...published.keys()],
  getPublicEffects: async () => [],
  getPublicTripReportRecords: async () => [],
  getPublishedEffectIndexArticles: async () => [],
  getPublicReplications: async () => [],
  getPublicContributorProfiles: async () => [],
} as unknown as PublicDataReadAdapter;

const publish = (...records: Article[]) => { for (const record of records) published.set(record.slug, record); };
const storeMachine = (wording: Record<string, string>) => writeTranslations(Object.entries(wording).map(([source, target]) => ({
  locale: LOCALE, hash: segmentHash(source), source, target, model: "test-model", prompt_version: "test",
})));

async function correct(slug: string, field: string, target: string) {
  const review = await readNarrativeReview(reads, LOCALE, "article", slug);
  const row = review.rows.find((candidate) => candidate.field === field)!;
  const base = { locale: LOCALE, kind: "article" as const, slug, id: row.id, sourceVersion: review.sourceVersion, actor: "translator@example.test", reason: "Clearer wording" };
  await writeNarrativeReview(reads, { ...base, action: "save", expectedRevision: row.revision, target });
  await writeNarrativeReview(reads, { ...base, action: "approve", expectedRevision: row.revision + 1 });
}

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  for (const file of readdirSync("lib/postgres/migrations").filter((name) => name.endsWith(".sql")).sort()) await db.exec(readFileSync(`lib/postgres/migrations/${file}`, "utf8"));
  transport.sql.mockImplementation(async (query: string, params: unknown[] = []) => (await db.query(query, params)).rows);
  transport.sqlTransaction.mockImplementation((operation: (tx: { query: typeof db.query }) => Promise<unknown>) => db.transaction((tx) => operation({ query: tx.query.bind(tx) as typeof db.query })));
}, 180_000);
beforeEach(async () => {
  vi.stubEnv("DATA_WRITES_FROZEN", "0");
  published.clear();
  publish(article());
  await db.exec('TRUNCATE "translationGlossary", "translationReviewEntries", "translationReviewHistory", "translationSegments"');
  await storeMachine(MACHINE);
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { await db?.close(); });

describe("localized safety fields", () => {
  it("publishes machine wording into dosage, interaction, and legality prose without changing any number, unit, route, citation, or canonical status", async () => {
    const { record, missing } = await localizeRecord(article(), LOCALE);

    expect(missing).toBe(0);
    expect(record).toEqual({
      slug: "example-substance",
      dosage: {
        routes: [{
          route: "oral",
          dose_ranges: { light: { min: 5, max: 10, unit: "mg" }, common: { min: 10, max: 20, unit: "mg" } },
          notes: MACHINE[NOTE],
          bioavailability_notes: MACHINE[NEIGHBOUR],
          reference_ids: ["ref-1"],
        }],
      },
      interactions: { dangerous: ["锂"], unsafe: [], caution: ["酒精"] },
      legality: {
        international: [],
        countries: { DE: { status: "非法", canonicalStatus: "prohibited", notes: MACHINE[DE_NOTES] } },
        usStates: { CA: { status: "受管制", canonicalStatus: "prohibited", notes: MACHINE[CA_NOTES] } },
      },
    });
  });

  it("publishes an approved human correction over machine wording, and a machine refresh cannot replace it", async () => {
    await correct("example-substance", NOTE_FIELD, HUMAN_NOTE);
    await correct("example-substance", DE_FIELD, HUMAN_DE);
    await storeMachine({ [NOTE]: "刷新后的机器译文：效果可在 2 小时内增强 [cite:ref-1]。" });

    const { record, review } = await localizeRecord(article(), LOCALE);

    expect(record.dosage.routes[0].notes).toBe(HUMAN_NOTE);
    expect(record.legality.countries.DE).toEqual({ status: "非法", canonicalStatus: "prohibited", notes: HUMAN_DE });
    expect(record.legality.usStates.CA.notes).toBe(MACHINE[CA_NOTES]);
    expect(record.dosage.routes[0].dose_ranges).toEqual(article().dosage.routes[0].dose_ranges);
    expect(review.reviewed).toBe(2);
  });

  it("never lends a correction to the same English in another record", async () => {
    publish(article("other-substance"));
    await correct("example-substance", NOTE_FIELD, HUMAN_NOTE);

    const { record } = await localizeRecord(article("other-substance"), LOCALE);

    expect(record.dosage.routes[0].notes).toBe(MACHINE[NOTE]);
  });

  it("drops a correction once its own English changes, publishing the new English instead of the stale wording", async () => {
    await correct("example-substance", NOTE_FIELD, HUMAN_NOTE);
    const changed = "Start with a low dose; effects can build for 3 hours [cite:ref-1].";
    publish(article("example-substance", { note: changed }));

    const { record, review } = await localizeRecord(article("example-substance", { note: changed }), LOCALE);

    expect(record.dosage.routes[0].notes).toBe(changed);
    expect(review.reviewed).toBe(0);
  });

  it("keeps a correction on the page but stops counting it as reviewed when a neighbouring sentence changes", async () => {
    await correct("example-substance", NOTE_FIELD, HUMAN_NOTE);
    expect((await localizeRecord(article(), LOCALE)).review.reviewed).toBe(1);
    const neighbour = "Food delays the onset considerably.";
    publish(article("example-substance", { neighbour }));

    const { record, review } = await localizeRecord(article("example-substance", { neighbour }), LOCALE);

    expect(record.dosage.routes[0].notes).toBe(HUMAN_NOTE);
    expect(record.dosage.routes[0].bioavailability_notes).toBe(neighbour);
    expect(review.reviewed).toBe(0);
  });

  it.each([
    ["changes the number", "请从低剂量开始；效果可能在 3 小时内持续增强 [cite:ref-1]。"],
    ["drops the citation", "请从低剂量开始；效果可能在 2 小时内持续增强。"],
  ])("refuses to approve a correction that %s, so readers keep the machine wording", async (_label, target) => {
    await expect(correct("example-substance", NOTE_FIELD, target)).rejects.toBeInstanceOf(TranslationReviewError);

    const { record } = await localizeRecord(article(), LOCALE);

    expect(record.dosage.routes[0].notes).toBe(MACHINE[NOTE]);
  });
});
