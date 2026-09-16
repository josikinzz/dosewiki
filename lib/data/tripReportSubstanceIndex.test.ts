import { describe, expect, it } from "vitest";
import {
  deleteTripReportSubstanceRows,
  findTripReportsBySubstanceNames,
  syncTripReportSubstanceRows,
  tripReportSubstanceKeys,
} from "../../server/lib/tripReportSubstanceIndex";

type Report = {
  _id: string;
  _creationTime: number;
  substances: Array<{ name: string }>;
};
type JoinRow = { _id: string; report_id: string; name_lower: string };

/**
 * A minimal in-memory stand-in for the two tables the helper touches. Only the
 * query shapes the helper actually issues are modelled: the `by_report` and
 * `by_name_lower` index lookups, `first()` presence checks, and a bare
 * `collect()` over `tripReports` for the fallback scan.
 */
function fakeDb(reports: Report[], rows: JoinRow[] = [], ready = false) {
  let nextId = rows.length + 1;
  const joinRows = [...rows];
  const scans: string[] = [];

  function queryTable(table: string) {
    if (table === "publicReadIndexState") {
      return { withIndex: () => ({ unique: async () => ready ? { version: 1, ready: true } : null }) };
    }
    const filterBy = (predicate: (row: JoinRow) => boolean) => ({
      collect: async () => joinRows.filter(predicate),
      first: async () => joinRows.find(predicate) ?? null,
    });
    return {
      withIndex: (
        _index: string,
        range: (q: { eq: (field: string, value: string) => (row: JoinRow) => boolean }) => (row: JoinRow) => boolean,
      ) => filterBy(range({ eq: (field, value) => (row) => (row as never as Record<string, string>)[field] === value })),
      collect: async () => {
        scans.push(table);
        return table === "tripReports" ? [...reports] : [...joinRows];
      },
      first: async () => (table === "tripReports" ? reports[0] ?? null : joinRows[0] ?? null),
    };
  }

  const db = {
    query: (table: string) => queryTable(table),
    get: async (id: string) => reports.find((report) => report._id === id) ?? null,
    insert: async (_table: string, value: { report_id: string; name_lower: string }) => {
      const _id = `row-${nextId++}`;
      joinRows.push({ _id, ...value });
      return _id;
    },
    delete: async (id: string) => {
      const index = joinRows.findIndex((row) => row._id === id);
      if (index !== -1) joinRows.splice(index, 1);
    },
  };

  return { ctx: { db } as never, joinRows, scans };
}

const lsdReport: Report = { _id: "r1", _creationTime: 2, substances: [{ name: "LSD" }, { name: "Cannabis" }] };
const mdmaReport: Report = { _id: "r2", _creationTime: 1, substances: [{ name: "MDMA" }] };
const mixedReport: Report = { _id: "r3", _creationTime: 3, substances: [{ name: "lsd" }, { name: "MDMA" }] };

describe("tripReportSubstanceKeys", () => {
  it("lowercases and deduplicates, but otherwise leaves the stored name alone", () => {
    expect(tripReportSubstanceKeys([{ name: "LSD" }, { name: "lsd" }, { name: " 2C-B " }])).toEqual([
      "lsd",
      " 2c-b ",
    ]);
  });
});

describe("syncTripReportSubstanceRows", () => {
  it("inserts one row per distinct lowercase name and removes stale ones on resync", async () => {
    const { ctx, joinRows } = fakeDb([lsdReport]);

    await expect(syncTripReportSubstanceRows(ctx, "r1" as never, lsdReport.substances)).resolves.toEqual({
      inserted: 2,
      removed: 0,
    });
    expect(joinRows.map((row) => row.name_lower).sort()).toEqual(["cannabis", "lsd"]);

    await expect(
      syncTripReportSubstanceRows(ctx, "r1" as never, [{ name: "LSD" }, { name: "Ketamine" }]),
    ).resolves.toEqual({ inserted: 1, removed: 1 });
    expect(joinRows.map((row) => row.name_lower).sort()).toEqual(["ketamine", "lsd"]);

    // Idempotent once in place.
    await expect(
      syncTripReportSubstanceRows(ctx, "r1" as never, [{ name: "LSD" }, { name: "Ketamine" }]),
    ).resolves.toEqual({ inserted: 0, removed: 0 });
  });

  it("collapses duplicate rows left behind for the same name", async () => {
    const { ctx, joinRows } = fakeDb([lsdReport], [
      { _id: "dup-a", report_id: "r1", name_lower: "lsd" },
      { _id: "dup-b", report_id: "r1", name_lower: "lsd" },
    ]);

    await expect(syncTripReportSubstanceRows(ctx, "r1" as never, [{ name: "LSD" }])).resolves.toEqual({
      inserted: 0,
      removed: 1,
    });
    expect(joinRows).toHaveLength(1);
  });

  it("deletes every row for a report", async () => {
    const { ctx, joinRows } = fakeDb([lsdReport, mdmaReport], [
      { _id: "a", report_id: "r1", name_lower: "lsd" },
      { _id: "b", report_id: "r1", name_lower: "cannabis" },
      { _id: "c", report_id: "r2", name_lower: "mdma" },
    ]);

    await expect(deleteTripReportSubstanceRows(ctx, "r1" as never)).resolves.toBe(2);
    expect(joinRows).toEqual([{ _id: "c", report_id: "r2", name_lower: "mdma" }]);
  });
});

describe("findTripReportsBySubstanceNames", () => {
  it("returns nothing for an empty name list without touching the database", async () => {
    const { ctx, scans } = fakeDb([lsdReport]);
    await expect(findTripReportsBySubstanceNames(ctx, [])).resolves.toEqual([]);
    expect(scans).toEqual([]);
  });

  it("preserves complete results when only some reports have been indexed", async () => {
    const { ctx, scans } = fakeDb([lsdReport, mdmaReport, mixedReport], [
      { _id: "partial", report_id: "r1", name_lower: "lsd" },
    ]);

    const result = await findTripReportsBySubstanceNames(ctx, ["lsd"]);

    expect(result.map((report) => report._id)).toEqual(["r1", "r3"]);
    expect(scans).toEqual(["tripReports"]);
  });

  it("answers through a certified index in creation order, case-insensitively", async () => {
    const { ctx, scans } = fakeDb([lsdReport, mdmaReport, mixedReport], [], true);
    for (const report of [lsdReport, mdmaReport, mixedReport]) {
      await syncTripReportSubstanceRows(ctx, report._id as never, report.substances);
    }

    const result = await findTripReportsBySubstanceNames(ctx, ["LSD", "Mdma"]);

    expect(result.map((report) => report._id)).toEqual(["r2", "r1", "r3"]);
    expect(scans).toEqual([]);
  });

  it("never surfaces a report through a stale join row", async () => {
    const { ctx } = fakeDb([mdmaReport], [{ _id: "stale", report_id: "r2", name_lower: "lsd" }], true);

    await expect(findTripReportsBySubstanceNames(ctx, ["lsd"])).resolves.toEqual([]);
  });
});
