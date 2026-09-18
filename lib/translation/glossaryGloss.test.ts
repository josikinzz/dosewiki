import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GLOSS_MAX_LENGTH, GlossaryGlossError, glossDigestInput, knownGlossaryTerms, readGlosses, upsertGlosses } from "./glossaryGloss";
import type { PublicDataReadAdapter } from "../data/publicData.reads";

const sql = vi.hoisted(() => vi.fn());
vi.mock("@server/postgres/runtime/backend", () => ({
  getPostgresClient: () => ({ sql }),
}));
vi.mock("@server/data/publicData", () => ({}));
vi.mock("@server/data/publicData.substances", () => ({}));

const universe = vi.hoisted(() => ({ collectGlossaryTerms: vi.fn() }));
vi.mock("./glossaryDraft", () => universe);

beforeEach(() => vi.stubEnv("DATA_WRITES_FROZEN", "0"));
afterEach(() => vi.unstubAllEnvs());

describe("upsertGlosses", () => {
  beforeEach(() => {
    sql.mockReset();
    sql.mockImplementation(async (_query: string, params: unknown[]) => (params[0] as string[]).map((term) => ({ term })));
  });


  it("refuses an empty gloss and a gloss over the limit before writing anything", async () => {
    await expect(upsertGlosses([{ term: "Offset", kind: "enum:duration", gloss: "   " }], null)).rejects.toBeInstanceOf(GlossaryGlossError);
    await expect(
      upsertGlosses(
        [
          { term: "Marquis", kind: "reagent-name", gloss: "fine" },
          { term: "Offset", kind: "enum:duration", gloss: "x".repeat(GLOSS_MAX_LENGTH + 1) },
        ],
        null,
      ),
    ).rejects.toThrow(/Offset.*limit is 240/);
    expect(sql).not.toHaveBeenCalled();
  });

  it("accepts a gloss exactly at the limit and writes nothing for an empty batch", async () => {
    expect(await upsertGlosses([], null)).toBe(0);
    expect(await upsertGlosses([{ term: "Offset", kind: "enum:duration", gloss: "x".repeat(GLOSS_MAX_LENGTH) }], null)).toBe(1);
    expect(sql).toHaveBeenCalledTimes(1);
  });
});

describe("readGlosses", () => {
  it("returns rows sorted by term with numeric timestamps", async () => {
    sql.mockReset().mockResolvedValue([
      { term: "Marquis", kind: "reagent-name", gloss: "Reagent test", updated_at: "1700000000000", updated_by: null },
      { term: "Auditory hallucination", kind: "effect-name", gloss: "Hearing sounds with no source", updated_at: "1700000000001", updated_by: "a@example.test" },
    ]);
    expect(await readGlosses()).toEqual([
      { term: "Auditory hallucination", kind: "effect-name", gloss: "Hearing sounds with no source", updated_at: 1700000000001, updated_by: "a@example.test" },
      { term: "Marquis", kind: "reagent-name", gloss: "Reagent test", updated_at: 1700000000000, updated_by: null },
    ]);
  });
});

describe("knownGlossaryTerms", () => {
  it("is the universe plus every term a locale's glossary already holds, the universe's spelling winning", async () => {
    universe.collectGlossaryTerms.mockResolvedValue([
      { term: "Euphoria", kind: "effect-name" },
      { term: "Oral", kind: "route" },
    ]);
    sql.mockReset().mockResolvedValue([
      { term: "Entactogen", kind: "psychoactive-class" },
      { term: "euphoria", kind: "effect-name" },
      { term: "Empathogens", kind: "psychoactive-class" },
    ]);
    expect(await knownGlossaryTerms({} as PublicDataReadAdapter)).toEqual([
      { term: "Empathogens", kind: "psychoactive-class" },
      { term: "Entactogen", kind: "psychoactive-class" },
      { term: "Euphoria", kind: "effect-name" },
      { term: "Oral", kind: "route" },
    ]);
    expect(sql.mock.calls[0][0]).toMatch(/SELECT DISTINCT "term", "kind" FROM "translationGlossary"/);
  });
});

describe("glossDigestInput", () => {
  it("digests the sorted term pairs, independent of arrival order, in the glossary digest's shape", () => {
    const a = glossDigestInput({ tolerance: "Reduced response", "Come Up": "Rising phase", comedown: "Declining phase" });
    const b = glossDigestInput({ comedown: "Declining phase", tolerance: "Reduced response", "Come Up": "Rising phase" });
    expect(a).toBe(b);
    expect(a).toBe(JSON.stringify([["Come Up", "Rising phase"], ["comedown", "Declining phase"], ["tolerance", "Reduced response"]]));
    expect(glossDigestInput({})).toBe("[]");
    expect(glossDigestInput({ comedown: "Declining phase" })).not.toBe(glossDigestInput({ comedown: "Declining phase as effects fade" }));
  });
});
