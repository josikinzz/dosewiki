import { describe, expect, it } from "vitest";

import { articleArrayIdentity } from "./articlePatch";
import { mergeThreeWay } from "./threeWayMerge";

const route = (name: string, moderate: string) => ({ route: name, dose_ranges: { moderate: { min: 1, max: 2, unit: moderate } } });
const reference = (id: string, title: string) => ({ id, title });

const base = {
  title: "Fixture",
  summary: "Original summary",
  tolerance: { full: "Days" },
  dosage: { routes: [route("oral", "mg"), route("insufflated", "mg")] },
  references: [reference("doi-1", "First"), reference("doi-2", "Second")],
  legality: { countries: { US: { status: "Legal" }, DE: { status: "Legal" } } },
  interactions: { dangerous: ["MAOIs"] },
};

const merge = (mine: unknown, theirs: unknown, choices = {}) =>
  mergeThreeWay(base, mine, theirs, { choices, identity: articleArrayIdentity });

describe("three-way merge of a local draft and the latest record", () => {
  it("keeps both editors' changes when they touched different fields", () => {
    const result = merge({ ...base, summary: "My summary" }, { ...base, tolerance: { full: "Weeks" } });
    expect(result.conflicts).toEqual([]);
    expect(result.unresolved).toEqual([]);
    expect(result.merged).toEqual({ ...base, summary: "My summary", tolerance: { full: "Weeks" } });
    expect(result.mine).toEqual([{ path: "summary", before: "Original summary", after: "My summary" }]);
    expect(result.theirs).toEqual([{ path: "tolerance.full", before: "Days", after: "Weeks" }]);
  });

  it("shows both alternatives when both editors changed the same field, and needs a choice", () => {
    const result = merge({ ...base, summary: "My summary" }, { ...base, summary: "Their summary" });
    expect(result.conflicts).toEqual([{ path: "summary", base: "Original summary", mine: "My summary", theirs: "Their summary" }]);
    expect(result.unresolved).toEqual(["summary"]);
    expect((result.merged as typeof base).summary).toBe("Their summary");

    const chosen = merge({ ...base, summary: "My summary" }, { ...base, summary: "Their summary" }, { summary: "mine" });
    expect(chosen.unresolved).toEqual([]);
    expect((chosen.merged as typeof base).summary).toBe("My summary");
  });

  it("does not call an identical change on both sides a conflict", () => {
    const result = merge({ ...base, summary: "Same" }, { ...base, summary: "Same" });
    expect(result.conflicts).toEqual([]);
    expect((result.merged as typeof base).summary).toBe("Same");
  });

  it("merges routes by route name when the other editor reordered them", () => {
    const mine = { ...base, dosage: { routes: [route("oral", "µg"), route("insufflated", "mg")] } };
    const theirs = { ...base, dosage: { routes: [route("insufflated", "mg"), route("oral", "mg")] } };
    const result = merge(mine, theirs);
    expect(result.conflicts).toEqual([]);
    expect((result.merged as typeof base).dosage.routes).toEqual([route("insufflated", "mg"), route("oral", "µg")]);
    expect(result.mine.map((change) => change.path)).toEqual(["dosage.routes[oral].dose_ranges.moderate"]);
    expect(result.theirs.map((change) => change.path)).toEqual(["dosage.routes order"]);
  });

  it("merges references by id, keeping an added reference and a reorder from each side", () => {
    const mine = { ...base, references: [...base.references, reference("doi-3", "Third")] };
    const theirs = { ...base, references: [reference("doi-2", "Second, corrected"), reference("doi-1", "First")] };
    const result = merge(mine, theirs);
    expect(result.conflicts).toEqual([]);
    expect((result.merged as typeof base).references).toEqual([
      reference("doi-2", "Second, corrected"), reference("doi-1", "First"), reference("doi-3", "Third"),
    ]);
  });

  it("names an overlapping reference edit by its id, not its position", () => {
    const mine = { ...base, references: [reference("doi-2", "Mine"), reference("doi-1", "First")] };
    const theirs = { ...base, references: [reference("doi-1", "First"), reference("doi-2", "Theirs")] };
    const result = merge(mine, theirs);
    expect(result.conflicts.map((conflict) => conflict.path)).toEqual(["references[doi-2].title"]);
    expect((result.merged as typeof base).references.map((entry) => entry.id)).toEqual(["doi-2", "doi-1"]);
    expect(result.mine.map((change) => change.path)).toEqual(["references order"]);
  });

  it("asks which order to keep when both editors moved the same entries differently", () => {
    const three = [reference("a", "A"), reference("b", "B"), reference("c", "C")];
    const start = { references: three };
    const mine = { references: [three[2], three[0], three[1]] };
    const theirs = { references: [three[1], three[0], three[2]] };
    const result = mergeThreeWay(start, mine, theirs, { identity: articleArrayIdentity });
    expect(result.conflicts).toEqual([{ path: "references order", base: ["a", "b", "c"], mine: ["c", "a", "b"], theirs: ["b", "a", "c"] }]);
    const chosen = mergeThreeWay(start, mine, theirs, { identity: articleArrayIdentity, choices: { "references order": "mine" } });
    expect((chosen.merged as typeof start).references.map((entry) => entry.id)).toEqual(["c", "a", "b"]);
  });

  it("treats a removal against an edit of the same entry as a conflict", () => {
    const mine = { ...base, references: [reference("doi-1", "First")] };
    const theirs = { ...base, references: [reference("doi-1", "First"), reference("doi-2", "Second, corrected")] };
    const result = merge(mine, theirs);
    expect(result.conflicts).toEqual([{ path: "references[doi-2]", base: reference("doi-2", "Second"), mine: undefined, theirs: reference("doi-2", "Second, corrected") }]);
    const kept = merge(mine, theirs, { "references[doi-2]": "mine" });
    expect((kept.merged as typeof base).references).toEqual([reference("doi-1", "First")]);
  });

  it("merges legality by country code", () => {
    const mine = { ...base, legality: { countries: { ...base.legality.countries, US: { status: "Controlled" } } } };
    const theirs = { ...base, legality: { countries: { ...base.legality.countries, DE: { status: "Controlled" }, FR: { status: "Legal" } } } };
    const result = merge(mine, theirs);
    expect(result.conflicts).toEqual([]);
    expect((result.merged as typeof base).legality.countries).toEqual({
      US: { status: "Controlled" }, DE: { status: "Controlled" }, FR: { status: "Legal" },
    });
  });

  it("merges a list of names as a set, keeping each side's additions and removals", () => {
    const mine = { ...base, interactions: { dangerous: ["MAOIs", "Lithium"] } };
    const theirs = { ...base, interactions: { dangerous: ["Tramadol"] } };
    const result = merge(mine, theirs);
    expect(result.conflicts).toEqual([]);
    expect((result.merged as typeof base).interactions.dangerous).toEqual(["Tramadol", "Lithium"]);
  });

  it("reads every differing field as a conflict when the original baseline is unknown", () => {
    const result = mergeThreeWay({}, { title: "Mine", body: "Same" }, { title: "Theirs", body: "Same" });
    expect(result.conflicts.map((conflict) => conflict.path)).toEqual(["title"]);
    expect(result.merged).toEqual({ title: "Theirs", body: "Same" });
  });
});
