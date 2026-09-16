import { describe, expect, it } from "vitest";
import type { MutationCtx } from "@server/postgres/runtime/server";
import { recordArticleRevision } from "../server/lib/articleRevisionJournal";
import { createEmptyArticle } from "../src/data/schema/defaults.generated";
import { referenceSchema } from "../src/schema/substance/shared";

function fixture() {
  const empty = createEmptyArticle();
  const article = {
    ...empty, harm_potential: empty.harm_potential, id: 1, title: "Fixture", slug: "fixture", summary: "Before.",
    references: [
      referenceSchema.parse({ id: "unchanged", title: "Stable source", url: "https://example.org/stable" }),
      referenceSchema.parse({ id: "changed", title: "Old title", url: "https://example.org/changed" }),
    ],
  };
  const evidence = [
    { _id: "unaffected", section: "pharmacology", fieldPath: "pharmacology.notes", referenceIds: ["unchanged"], status: "supported", entailmentVerdict: "supported" },
    { _id: "source-change", section: "pharmacology", fieldPath: "pharmacology.notes", referenceIds: ["changed"], status: "supported", entailmentVerdict: "supported" },
    { _id: "text-change", section: "summary", fieldPath: "summary", referenceIds: ["unchanged"], status: "supported", entailmentVerdict: "supported" },
    { _id: "same-section-stable", section: "identification", fieldPath: "identification.botanical_name", referenceIds: ["unchanged"], status: "supported", entailmentVerdict: "supported" },
    { _id: "same-section-changed", section: "identification", fieldPath: "identification.common_name", referenceIds: ["unchanged"], status: "supported", entailmentVerdict: "supported" },
  ];
  const records = new Map<string, Record<string, unknown>>(evidence.map((row) => [row._id, { ...row }]));
  let sequence = 0;
  const ctx = {
    db: {
      query: () => ({ withIndex: () => ({ take: async () => evidence }) }),
      patch: async (id: string, patch: Record<string, unknown>) => { records.set(id, { ...records.get(id), ...patch }); },
      insert: async (table: string, value: Record<string, unknown>) => {
        const id = `${table}-${++sequence}`;
        records.set(id, value);
        return id;
      },
    },
  } as unknown as MutationCtx;
  return { article, records, ctx };
}

describe("article revision citation evidence", () => {
  it("decertifies changed sources and sections without discarding unrelated support", async () => {
    const { article: before, records, ctx } = fixture();
    const unaffected = { ...records.get("unaffected") };
    const after = { ...before, summary: "After.", references: before.references.map((ref) => ref.id === "changed" ? { ...ref, title: "Corrected title" } : ref) };
    await recordArticleRevision(ctx, {
      before, after, actor: { email: "editor@example.org", role: "admin" },
      changeId: "fixture-change", baseHash: "fixture-base", summary: "Correct source metadata and summary.",
    });
    expect(records.get("unaffected")).toEqual(unaffected);
    expect(records.get("source-change")?.status).toBe("needs_review");
    expect(records.get("text-change")?.status).toBe("needs_review");
  });

  it("decertifies support for a removed reference even when prose is unchanged", async () => {
    const { article: before, records, ctx } = fixture();
    const unaffected = { ...records.get("unaffected") };
    await recordArticleRevision(ctx, {
      before, after: { ...before, references: before.references.filter((ref) => ref.id !== "changed") },
      actor: { email: "editor@example.org", role: "admin" }, changeId: "fixture-removal", baseHash: "fixture-base", summary: "Remove source.",
    });
    expect(records.get("source-change")?.status).toBe("needs_review");
    expect(records.get("unaffected")).toEqual(unaffected);
    expect(records.get("text-change")?.status).toBe("supported");
  });

  it("preserves evidence for an unchanged field in the same section", async () => {
    const { article: before, records, ctx } = fixture();
    await recordArticleRevision(ctx, {
      before, after: { ...before, identification: { ...before.identification, common_name: "Updated name" } },
      actor: { email: "editor@example.org", role: "admin" }, changeId: "fixture-field-change", baseHash: "fixture-base", summary: "Correct one field.",
    });
    expect(records.get("same-section-changed")?.status).toBe("needs_review");
    expect(records.get("same-section-stable")?.status).toBe("supported");
  });
});
