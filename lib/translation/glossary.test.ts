import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveLocale } from "../../scripts/translation/locales.mjs";
import {
  findGlossaryCollisions,
  assertNoCollisions,
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
  it("names approved revisions not yet requested, ignoring legacy premature completion stamps", () => {
    const pending = pendingRetranslation([
      row("Never pushed", { retranslation_requested_at: null }),
      row("Edited since", { reviewed_at: 300, retranslation_requested_at: 200 }),
      row("Requested", { reviewed_at: 200, retranslation_requested_at: 200 }),
      row("Requested later", { reviewed_at: 100, retranslation_requested_at: 200 }),
      row("Legacy premature completion", { reviewed_at: 100, retranslated_at: 200 }),
      row("Still a draft", { status: "draft", reviewed_at: null }),
    ]);
    expect(pending).toEqual(["Never pushed", "Edited since", "Legacy premature completion"]);
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

  it("binds approval collision acknowledgement to locale, exact targets and the entire collision set", async () => {
    const entries = [stored("Artist", "ART", "replication")];
    tableOf(entries);
    const candidates = [{term:"Replicator",target:"ART",kind:"replication"}];
    const refusal = await assertNoCollisions("de", candidates).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(GlossaryCollisionError);
    const confirmation = (refusal as GlossaryCollisionError).collisionConfirmation;
    await expect(assertNoCollisions("de", candidates, confirmation)).resolves.toBeUndefined();
    await expect(assertNoCollisions("nl", candidates, confirmation)).rejects.toBeInstanceOf(GlossaryCollisionError);
    await expect(assertNoCollisions("de", [{...candidates[0],target:"art"}], confirmation)).rejects.toBeInstanceOf(GlossaryCollisionError);
    entries.push(stored("Creator", "ART", "replication"));
    await expect(assertNoCollisions("de", candidates, confirmation)).rejects.toBeInstanceOf(GlossaryCollisionError);
  });

  it("protects reviewed rows, human drafts and saved review entries against model redrafts", async () => {
    sql.mockResolvedValue([]);
    await upsertGlossaryRows("zh-Hans", [{term:"Euphoria",target:"欣快",kind:"effect-name"}], {status:"draft",source:"model"});
    const query = sql.mock.calls[0][0];
    expect(query).toContain(`ON CONFLICT ("locale", "term") DO NOTHING`);
    vi.stubEnv("DATA_WRITES_FROZEN", "1");
    await expect(upsertGlossaryRows("zh-Hans", [{term:"Euphoria",target:"欣快",kind:"effect-name"}], {status:"draft",source:"model"})).rejects.toThrow();
  });
});
