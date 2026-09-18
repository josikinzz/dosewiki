import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveLocale } from "../../scripts/translation/locales.mjs";
import {
  approveGlossaryTerms,
  editGlossaryTerm,
  findGlossaryCollisions,
  GlossaryCollisionError,
  glossaryDigestInput,
  pendingRetranslation,
  upsertGlossaryRows,
  type TranslationGlossaryRow,
} from "./glossary";
import { promptVersionFor } from "./liveTranslation";

const sql = vi.hoisted(() => vi.fn());
vi.mock("@server/postgres/runtime/backend", () => ({
  getPostgresClient: () => ({ sql }),
}));
vi.mock("@server/data/publicData", () => ({}));
vi.mock("@server/data/publicData.substances", () => ({}));
beforeEach(() => vi.stubEnv("DATA_WRITES_FROZEN", "0"));
afterEach(() => vi.unstubAllEnvs());


const zh = resolveLocale("zh-Hans");

describe("promptVersionFor over the approved glossary and the glosses", () => {
  it("does not depend on the order rows arrive in", () => {
    const a = promptVersionFor(zh, { tolerance: "耐受性", comedown: "退效", "come-up": "上头" }, { comedown: "Declining phase", tolerance: "Reduced response" });
    const b = promptVersionFor(zh, { "come-up": "上头", comedown: "退效", tolerance: "耐受性" }, { tolerance: "Reduced response", comedown: "Declining phase" });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("changes when a rendering changes, a term is added, or the locale prompt differs", () => {
    const base = promptVersionFor(zh, { comedown: "退效" }, {});
    expect(promptVersionFor(zh, { comedown: "退坡" }, {})).not.toBe(base);
    expect(promptVersionFor(zh, { comedown: "退效", tolerance: "耐受性" }, {})).not.toBe(base);
    expect(promptVersionFor(resolveLocale("nl"), { comedown: "退效" }, {})).not.toBe(base);
  });

  it("changes when a gloss is added or edited, since the gloss is part of the prompt", () => {
    const base = promptVersionFor(zh, { comedown: "退效" }, {});
    const glossed = promptVersionFor(zh, { comedown: "退效" }, { comedown: "Declining phase as effects fade" });
    expect(glossed).not.toBe(base);
    expect(promptVersionFor(zh, { comedown: "退效" }, { comedown: "Declining phase" })).not.toBe(glossed);
  });

  it("digests the sorted term pairs and nothing else", () => {
    expect(glossaryDigestInput({ tolerance: "耐受性", "Come Up": "起效期", comedown: "退效" })).toBe(
      JSON.stringify([["Come Up", "起效期"], ["comedown", "退效"], ["tolerance", "耐受性"]]),
    );
    expect(glossaryDigestInput({})).toBe("[]");
  });
});

const row = (term: string, patch: Partial<TranslationGlossaryRow>): TranslationGlossaryRow => ({
  locale: "zh-Hans", term, target: "x", kind: "effect-name", status: "approved", source: "human",
  reviewed_at: 100, reviewed_by: "a@example.test", retranslated_at: null, updated_at: 100, ...patch,
});

describe("pendingRetranslation", () => {
  it("names approved terms reviewed after they last reached the segments, and nothing else", () => {
    const pending = pendingRetranslation([
      row("Never pushed", { retranslated_at: null }),
      row("Edited since", { reviewed_at: 300, retranslated_at: 200 }),
      row("Up to date", { reviewed_at: 200, retranslated_at: 200 }),
      row("Pushed later", { reviewed_at: 100, retranslated_at: 200 }),
      row("Still a draft", { status: "draft", reviewed_at: null }),
    ]);

    expect(pending).toEqual(["Never pushed", "Edited since"]);
  });
});

type Stored = { term: string; target: string; kind: string; status: "draft" | "approved" };

/**
 * A stand-in for the table: answers the collision finder's approved-rows
 * query and the approve/edit lookups from `stored`, and echoes writes back
 * the way RETURNING would. Every write is remembered on `writes`.
 */
function tableOf(stored: readonly Stored[]) {
  const writes: string[] = [];
  sql.mockImplementation(async (query: string, params: unknown[] = []) => {
    if (query.startsWith("INSERT") || query.startsWith("UPDATE")) {
      writes.push(query);
      const terms = Array.isArray(params[1]) ? (params[1] as string[]) : [params[1] as string];
      return stored.filter((row) => terms.includes(row.term)).map((row) => ({ ...row, reviewed_at: 1, updated_at: 1 }));
    }
    if (query.includes(`"status" = 'approved' AND "kind" = ANY`)) {
      const kinds = params[1] as string[];
      return stored.filter((row) => row.status === "approved" && kinds.includes(row.kind));
    }
    if (query.includes(`"term" = ANY($2::text[]) AND "status" <> 'approved'`)) {
      const terms = params[1] as string[];
      return stored.filter((row) => row.status !== "approved" && terms.includes(row.term));
    }
    if (query.includes(`SELECT "kind"`)) {
      return stored.filter((row) => row.term === params[1]);
    }
    throw new Error(`unexpected query: ${query}`);
  });
  return writes;
}

const stored = (term: string, target: string, kind = "route", status: Stored["status"] = "approved"): Stored => ({ term, target, kind, status });

describe("same-kind rendering uniqueness", () => {
  beforeEach(() => {
    sql.mockReset();
  });

  it("names two candidates in one batch that would share a rendering", async () => {
    tableOf([]);
    const collisions = await findGlossaryCollisions("zh-Hans", [
      { term: "IV", target: "静注", kind: "route" },
      { term: "Intravenous", target: " 静注 ", kind: "route" },
      { term: "Oral", target: "口服", kind: "route" },
    ]);
    expect(collisions).toEqual([{ kind: "route", target: "静注", terms: ["Intravenous", "IV"] }]);
  });

  it("compares candidates against approved rows of the same kind, case-insensitively", async () => {
    tableOf([stored("Sublingual", "SL"), stored("Insufflated", "鼻吸", "route", "draft")]);
    expect(await findGlossaryCollisions("zh-Hans", [{ term: "Under the tongue", target: "sl", kind: "route" }])).toEqual([
      { kind: "route", target: "sl", terms: ["Sublingual", "Under the tongue"] },
    ]);
    expect(await findGlossaryCollisions("zh-Hans", [{ term: "Snorted", target: "鼻吸", kind: "route" }])).toEqual([]);
  });

  it("does not collide across kinds, with itself, or on an empty rendering", async () => {
    tableOf([stored("Euphoria", "欣快", "effect-name"), stored("IV", "静注")]);
    expect(await findGlossaryCollisions("zh-Hans", [{ term: "Euphoria route", target: "欣快", kind: "route" }])).toEqual([]);
    expect(await findGlossaryCollisions("zh-Hans", [{ term: "IV", target: "静注", kind: "route" }])).toEqual([]);
    expect(await findGlossaryCollisions("zh-Hans", [{ term: "IV", target: "静脉注射", kind: "route" }, { term: "Blank", target: "  ", kind: "route" }])).toEqual([]);
  });

  it("lets a singular and its plural share a rendering, but not a third term", async () => {
    tableOf([stored("Replicator", "复现者", "replication"), stored("Category", "类别", "replication")]);
    expect(await findGlossaryCollisions("zh-Hans", [{ term: "Replicators", target: "复现者", kind: "replication" }])).toEqual([]);
    expect(await findGlossaryCollisions("zh-Hans", [{ term: "Categories", target: "类别", kind: "replication" }])).toEqual([]);
    expect(await findGlossaryCollisions("zh-Hans", [{ term: "Artist", target: "复现者", kind: "replication" }])).toEqual([
      { kind: "replication", target: "复现者", terms: ["Artist", "Replicator"] },
    ]);
  });

  it("refuses an approved upsert before writing and lets a draft upsert through", async () => {
    const writes = tableOf([stored("IV", "静注")]);
    const rows = [{ term: "Intravenous", target: "静注", kind: "route" }];
    await expect(upsertGlossaryRows("zh-Hans", rows, { status: "approved", source: "human", reviewedBy: "a@example.test" }))
      .rejects.toBeInstanceOf(GlossaryCollisionError);
    expect(writes).toEqual([]);
    const callsBeforeDraft = sql.mock.calls.length;
    await upsertGlossaryRows("zh-Hans", rows, { status: "draft", source: "model" });
    expect(writes).toHaveLength(1);
    expect(sql.mock.calls.length).toBe(callsBeforeDraft + 1);
  });

  it("refuses to approve drafts that would collide, as they stand in the table", async () => {
    const writes = tableOf([stored("IV", "静注"), stored("Intravenous", "静注", "route", "draft"), stored("Oral", "口服", "route", "draft")]);
    await expect(approveGlossaryTerms("zh-Hans", ["Intravenous", "Oral"], "a@example.test")).rejects.toMatchObject({
      collisions: [{ kind: "route", target: "静注", terms: ["Intravenous", "IV"] }],
    });
    expect(writes).toEqual([]);
    expect(await approveGlossaryTerms("zh-Hans", ["Oral"], "a@example.test")).toEqual(["Oral"]);
    expect(writes).toHaveLength(1);
  });

  it("refuses an edit whose rendering another approved term of that kind already has", async () => {
    const writes = tableOf([stored("IV", "静注"), stored("Intravenous", "静脉注射")]);
    await expect(editGlossaryTerm("zh-Hans", "Intravenous", "静注", "a@example.test")).rejects.toBeInstanceOf(GlossaryCollisionError);
    expect(writes).toEqual([]);
    expect(await editGlossaryTerm("zh-Hans", "IV", "静注", "a@example.test")).toMatchObject({ term: "IV", target: "静注" });
    expect(await editGlossaryTerm("zh-Hans", "Missing", "x", "a@example.test")).toBeNull();
    expect(writes).toHaveLength(1);
  });

  it("allows Artist and Artists without an override, but requires exact acknowledgement for Replicator", async () => {
    const entries = [stored("Artist", "艺术家", "replication"), stored("Artists", "艺术家", "replication", "draft"), stored("Replicator", "艺术家", "replication", "draft")];
    const writes = tableOf(entries);
    await expect(approveGlossaryTerms("zh-Hans", ["Artists"], "reviewer@example.test")).resolves.toEqual(["Artists"]);
    const refusal = await approveGlossaryTerms("zh-Hans", ["Replicator"], "reviewer@example.test").catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(GlossaryCollisionError);
    const confirmation = (refusal as GlossaryCollisionError).collisionConfirmation;
    expect(writes).toHaveLength(1);
    await expect(approveGlossaryTerms("zh-Hans", ["Replicator"], "reviewer@example.test")).rejects.toBeInstanceOf(GlossaryCollisionError);
    expect(writes).toHaveLength(1);
    await expect(approveGlossaryTerms("zh-Hans", ["Replicator"], "reviewer@example.test", confirmation)).resolves.toEqual(["Replicator"]);
    expect(writes).toHaveLength(2);
  });

  it("rejects stale, wrong-locale and exact-value-changed edit acknowledgements before writing", async () => {
    const entries = [stored("Artist", "ART", "replication"), stored("Replicator", "other", "replication")];
    const writes = tableOf(entries);
    const refusal = await editGlossaryTerm("de", "Replicator", "ART", "reviewer@example.test").catch((error: unknown) => error);
    const confirmation = (refusal as GlossaryCollisionError).collisionConfirmation;
    expect(confirmation).toMatch(/^[a-f0-9]{64}$/);
    await expect(editGlossaryTerm("nl", "Replicator", "ART", "reviewer@example.test", confirmation)).rejects.toBeInstanceOf(GlossaryCollisionError);
    await expect(editGlossaryTerm("de", "Replicator", "art", "reviewer@example.test", confirmation)).rejects.toBeInstanceOf(GlossaryCollisionError);
    entries[0].target = "art";
    await expect(editGlossaryTerm("de", "Replicator", "ART", "reviewer@example.test", confirmation)).rejects.toBeInstanceOf(GlossaryCollisionError);
    entries[0].target = "ART";
    entries.push(stored("Creator", "ART", "replication"));
    await expect(editGlossaryTerm("de", "Replicator", "ART", "reviewer@example.test", confirmation)).rejects.toBeInstanceOf(GlossaryCollisionError);
    expect(writes).toEqual([]);
    entries.pop();
    await editGlossaryTerm("de", "Replicator", "ART", "reviewer@example.test", confirmation);
    expect(writes).toHaveLength(1);
  });

  it("acknowledges the entire bulk set, while model and frozen writes still fail closed", async () => {
    const entries = [stored("Artist", "art", "replication")];
    const writes = tableOf(entries);
    const candidates = [
      { term: "Replicator", target: "art", kind: "replication" },
      { term: "Creator", target: "create", kind: "replication" },
      { term: "Maker", target: "create", kind: "replication" },
    ];
    const reviewer = { status: "approved" as const, source: "human" as const, reviewedBy: "reviewer@example.test" };
    const refusal = await upsertGlossaryRows("de", candidates, reviewer).catch((error: unknown) => error);
    expect((refusal as GlossaryCollisionError).collisions).toHaveLength(2);
    const collisionConfirmation = (refusal as GlossaryCollisionError).collisionConfirmation;
    await expect(upsertGlossaryRows("de", candidates.slice(0, 1), { ...reviewer, collisionConfirmation })).rejects.toBeInstanceOf(GlossaryCollisionError);
    await expect(upsertGlossaryRows("de", candidates, { ...reviewer, source: "model", collisionConfirmation })).rejects.toBeInstanceOf(GlossaryCollisionError);
    vi.stubEnv("DATA_WRITES_FROZEN", "1");
    await expect(upsertGlossaryRows("de", candidates, { ...reviewer, collisionConfirmation })).rejects.toThrow();
    await expect(approveGlossaryTerms("de", ["Artist"], reviewer.reviewedBy, collisionConfirmation)).rejects.toThrow();
    await expect(editGlossaryTerm("de", "Artist", "art", reviewer.reviewedBy, collisionConfirmation)).rejects.toThrow();
    expect(writes).toEqual([]);
    vi.stubEnv("DATA_WRITES_FROZEN", "0");
    await upsertGlossaryRows("de", [...candidates].reverse(), { ...reviewer, collisionConfirmation });
    expect(writes).toHaveLength(1);
  });
});
