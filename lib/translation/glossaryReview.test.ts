import { describe, expect, it, vi } from "vitest";
import { projectGlossaryReviewRows } from "./glossaryReview";
import type { TranslationGlossaryRow } from "./glossary";
import type { ReviewEntry } from "./reviewTypes";
vi.mock("server-only", () => ({}));
const base: TranslationGlossaryRow = {
  locale: "zh-Hans",
  term: "Replication",
  target: "复现",
  kind: "replication",
  status: "approved",
  source: "human",
  reviewed_at: 10,
  reviewed_by: "old@example.test",
  retranslated_at: null,
  updated_at: 10,
};
const entry: ReviewEntry = {
  locale: "zh-Hans",
  scope: "glossary",
  sourceId: "Replication",
  revision: 1,
  draft: { source: "Replication", context: "replication", target: "体验再现" },
  approved: { source: "Replication", context: "replication", target: "复现" },
  updatedAt: 20,
};
describe("glossary editable projection", () => {
  it("preserves effective approved wording while exposing saved draft and exact revision", () => {
    const [row] = projectGlossaryReviewRows([base], [entry]);
    expect(row).toMatchObject({
      target: "体验再现",
      status: "draft",
      approved_target: "复现",
      revision: "10:1",
      review_provenance: "legacy_unverified",
    });
    expect(base.target).toBe("复现");
    expect(base.status).toBe("approved");
  });
  it("never treats legacy actor metadata or a seeded approval as proof of human review", () => {
    expect(projectGlossaryReviewRows([base], [])[0].review_provenance).toBe(
      "legacy_unverified",
    );
    expect(
      projectGlossaryReviewRows([base], [entry])[0].review_provenance,
    ).toBe("legacy_unverified");
    expect(
      projectGlossaryReviewRows([base], [entry], new Set([base.term]))[0]
        .review_provenance,
    ).toBe("human_review");
  });
  it("invalidates tokens on base updates as well as saved draft revisions", () => {
    expect(
      projectGlossaryReviewRows([{ ...base, updated_at: 11 }], [entry])[0]
        .revision,
    ).toBe("11:1");
    expect(
      projectGlossaryReviewRows([base], [{ ...entry, revision: 2 }])[0]
        .revision,
    ).toBe("10:2");
  });
});
