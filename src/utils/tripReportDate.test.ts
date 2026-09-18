import { describe, expect, it } from "vitest";
import { formatTripDateLabel, parseTripDate, tripDateSortValue } from "./tripReportDate";

describe("parseTripDate", () => {
  it("reads each shape the corpus actually uses", () => {
    expect(parseTripDate("2020-03-15")).toEqual({
      year: 2020,
      month: 3,
      day: 15,
      approximate: false,
    });
    expect(parseTripDate("2021/07/02")).toEqual({
      year: 2021,
      month: 7,
      day: 2,
      approximate: false,
    });
    expect(parseTripDate("October 4th 2020")).toEqual({
      year: 2020,
      month: 10,
      day: 4,
      approximate: false,
    });
    expect(parseTripDate("Feb 27, 2021")).toEqual({
      year: 2021,
      month: 2,
      day: 27,
      approximate: false,
    });
    expect(parseTripDate("23rd of October, 2020")).toEqual({
      year: 2020,
      month: 10,
      day: 23,
      approximate: false,
    });
    expect(parseTripDate("April 2012")).toEqual({ year: 2012, month: 4, approximate: false });
    expect(parseTripDate("Thu Mar 09 2023 04:00:01 GMT-0500")).toEqual({
      year: 2023,
      month: 3,
      day: 9,
      approximate: false,
    });
    expect(parseTripDate("15. 8. 2021")).toEqual({
      year: 2021,
      month: 8,
      day: 15,
      approximate: false,
    });
    expect(parseTripDate("09/2018")).toEqual({ year: 2018, month: 9, approximate: false });
    expect(parseTripDate("2013")).toEqual({ year: 2013, approximate: false });
    expect(parseTripDate("~2012")).toEqual({ year: 2012, approximate: true });
  });

  it("accepts a calendar-invalid day the author wrote rather than dropping the date", () => {
    // 31/06/2016 names a June 31st. The source said day-first, so the day is
    // reported as written; a Date-based parser would have rolled it into July.
    expect(parseTripDate("31/06/2016")).toEqual({
      year: 2016,
      month: 6,
      day: 31,
      approximate: false,
    });
  });

  it("returns null for values with no recoverable year", () => {
    expect(parseTripDate("Sometime")).toBeNull();
    expect(parseTripDate("~Early 2010's")).toBeNull();
    expect(parseTripDate(null)).toBeNull();
    expect(parseTripDate(undefined)).toBeNull();
    expect(parseTripDate("")).toBeNull();
    expect(parseTripDate("   ")).toBeNull();
  });
});

describe("formatTripDateLabel", () => {
  it("labels day-precision sources at month precision", () => {
    expect(formatTripDateLabel("2020-03-15")).toBe("March 2020");
    expect(formatTripDateLabel("2026-07-24")).toBe("July 2026");
    expect(formatTripDateLabel("February 17, 2013")).toBe("February 2013");
    expect(formatTripDateLabel("12th of January 2017")).toBe("January 2017");
    expect(formatTripDateLabel("Thu Mar 09 2023 04:00:01 GMT-0500")).toBe("March 2023");
    expect(formatTripDateLabel("27. 3. 2021")).toBe("March 2021");
  });

  it("labels month-precision and year-precision sources", () => {
    expect(formatTripDateLabel("December 2016")).toBe("December 2016");
    expect(formatTripDateLabel("09/2018")).toBe("September 2018");
    expect(formatTripDateLabel("2013")).toBe("2013");
  });

  it("marks hedged values as approximate", () => {
    expect(formatTripDateLabel("~2012")).toBe("around 2012");
    expect(formatTripDateLabel("~2016")).toBe("around 2016");
  });

  it("passes an unparseable value through verbatim, trimmed", () => {
    expect(formatTripDateLabel("Sometime")).toBe("Sometime");
    expect(formatTripDateLabel("~Early 2010's")).toBe("~Early 2010's");
    expect(formatTripDateLabel("  Sometime  ")).toBe("Sometime");
  });

  it("returns null only for a missing value", () => {
    expect(formatTripDateLabel(null)).toBeNull();
    expect(formatTripDateLabel(undefined)).toBeNull();
    expect(formatTripDateLabel("")).toBeNull();
    expect(formatTripDateLabel("   ")).toBeNull();
  });
});

describe("slash date ambiguity", () => {
  it("resolves the ordering when exactly one component rules out a month", () => {
    expect(formatTripDateLabel("13/03/2018")).toBe("March 2018");
    expect(parseTripDate("13/03/2018")).toEqual({
      year: 2018,
      month: 3,
      day: 13,
      approximate: false,
    });

    expect(formatTripDateLabel("09/30/2020")).toBe("September 2020");
    expect(parseTripDate("09/30/2020")).toEqual({
      year: 2020,
      month: 9,
      day: 30,
      approximate: false,
    });
  });

  it("never fabricates a month when both components could be one", () => {
    expect(formatTripDateLabel("01/03/2018")).toBe("2018");
    expect(parseTripDate("01/03/2018")).toEqual({ year: 2018, approximate: false });
    expect(parseTripDate("01/03/2018")?.month).toBeUndefined();
    expect(parseTripDate("01/03/2018")?.day).toBeUndefined();
    expect(tripDateSortValue("01/03/2018")).toBe(20180000);

    expect(formatTripDateLabel("11/6/2022")).toBe("2022");
    expect(parseTripDate("9/7/2023")?.month).toBeUndefined();
  });
});

describe("two-digit years", () => {
  it("reads a two-digit year as 20YY, and keeps the ambiguity rule", () => {
    expect(formatTripDateLabel("03/16")).toBe("March 2016");
    expect(formatTripDateLabel("3/4/18")).toBe("2018");
    expect(parseTripDate("3/4/18")).toEqual({ year: 2018, approximate: false });
  });
});

describe("tripDateSortValue", () => {
  it("zeroes the components the source did not state", () => {
    expect(tripDateSortValue("2020-03-15")).toBe(20200315);
    expect(tripDateSortValue("09/2018")).toBe(20180900);
    expect(tripDateSortValue("2013")).toBe(20130000);
  });

  it("ignores hedging", () => {
    expect(tripDateSortValue("~2012")).toBe(20120000);
  });

  it("is null exactly when nothing parses", () => {
    expect(tripDateSortValue("Sometime")).toBeNull();
    expect(tripDateSortValue("~Early 2010's")).toBeNull();
    expect(tripDateSortValue(null)).toBeNull();
  });

  it("orders mixed corpus shapes newest first and leaves unknowns to the caller", () => {
    const corpus = [
      "2013",
      "Sometime",
      "02/09/2021",
      "2026-07-24",
      "~Early 2010's",
      "September 2018",
    ];

    const keyed = corpus.map((raw) => ({ raw, key: tripDateSortValue(raw) }));
    const parsed = keyed.filter((entry) => entry.key !== null);
    const unknown = keyed.filter((entry) => entry.key === null).map((entry) => entry.raw);

    parsed.sort((left, right) => (right.key as number) - (left.key as number));

    expect(parsed.map((entry) => formatTripDateLabel(entry.raw))).toEqual([
      "July 2026",
      "2021",
      "September 2018",
      "2013",
    ]);
    expect(unknown).toEqual(["Sometime", "~Early 2010's"]);
  });
});
