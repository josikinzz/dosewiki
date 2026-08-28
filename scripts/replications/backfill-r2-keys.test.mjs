import { describe, expect, it } from "vitest";

import { planR2KeyBackfill } from "./backfill-r2-keys.mjs";

const SHA_A = "ab".padEnd(64, "0");
const SHA_B = "cd".padEnd(64, "1");
const KEY_A = `media/sha256/ab/${SHA_A}.mp4`;
const KEY_B = `media/sha256/cd/${SHA_B}.webp`;

const exactEntry = (overrides = {}) => ({
  id: "rep1",
  slug: "work-a",
  role: "main",
  keyField: "r2_key",
  storage_id: "mainA",
  expectedStorageId: "mainA",
  r2_key: KEY_A,
  status: "exact",
  ...overrides,
});

const liveRow = (overrides = {}) => ({
  _id: "rep1",
  slug: "work-a",
  storage_id: "mainA",
  thumbnail_storage_id: "thumbA",
  ...overrides,
});

describe("planR2KeyBackfill", () => {
  it("groups a row's exact entries into one CAS update", () => {
    const plan = planR2KeyBackfill(
      [
        exactEntry(),
        exactEntry({
          role: "thumbnail",
          keyField: "thumbnail_r2_key",
          storage_id: "thumbA",
          r2_key: KEY_B,
        }),
      ],
      [liveRow()],
    );
    expect(plan.updates).toEqual([
      {
        id: "rep1",
        slug: "work-a",
        expectedStorageId: "mainA",
        r2_key: KEY_A,
        thumbnail_r2_key: KEY_B,
        expectedThumbnailStorageId: "thumbA",
      },
    ]);
    expect(plan.stale).toEqual([]);
  });

  it("never plans non-exact entries", () => {
    const plan = planR2KeyBackfill(
      [exactEntry({ status: "missing", r2_key: undefined })],
      [liveRow()],
    );
    expect(plan.updates).toEqual([]);
  });

  it("marks entries stale when the live row moved since the ledger", () => {
    const plan = planR2KeyBackfill(
      [exactEntry()],
      [liveRow({ storage_id: "repointed" })],
    );
    expect(plan.updates).toEqual([]);
    expect(plan.stale).toHaveLength(1);
  });

  it("skips keys already attached with the planned value (idempotent rerun)", () => {
    const plan = planR2KeyBackfill([exactEntry()], [liveRow({ r2_key: KEY_A })]);
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toHaveLength(1);
  });

  it("bounds canary waves by slug list and by limit", () => {
    const entries = [
      exactEntry(),
      exactEntry({ id: "rep2", slug: "work-b" }),
    ];
    const rows = [liveRow(), liveRow({ _id: "rep2", slug: "work-b" })];

    expect(planR2KeyBackfill(entries, rows, { slugs: ["work-b"] }).updates).toEqual([
      expect.objectContaining({ slug: "work-b" }),
    ]);
    expect(planR2KeyBackfill(entries, rows, { limit: 1 }).updates).toHaveLength(1);
  });
});
