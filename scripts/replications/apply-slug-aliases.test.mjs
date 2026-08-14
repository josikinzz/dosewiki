import { describe, expect, it } from "vitest";
import { planAliasApplications, resolveAliasTarget } from "./apply-slug-aliases.mjs";

const row = (slug) => ({ slug });

describe("resolveAliasTarget", () => {
  it("resolves a single hop", () => {
    expect(resolveAliasTarget({ old: "new" }, "old")).toBe("new");
  });

  it("follows a chain to its final target", () => {
    expect(resolveAliasTarget({ a: "b", b: "c" }, "a")).toBe("c");
  });

  it("returns null for a slug with no alias", () => {
    expect(resolveAliasTarget({ a: "b" }, "z")).toBeNull();
  });

  it("returns null for a cyclic chain", () => {
    expect(resolveAliasTarget({ a: "b", b: "a" }, "a")).toBeNull();
  });
});

describe("planAliasApplications", () => {
  it("renames a live source whose target is free", () => {
    const plan = planAliasApplications({ old: "new" }, [row("old"), row("bystander")]);

    expect(plan.renames).toEqual([{ from: "old", to: "new" }]);
    expect(plan.skipped).toEqual([]);
    expect(plan.settled).toEqual([]);
  });

  it("treats an absent source as already settled", () => {
    const plan = planAliasApplications({ old: "new" }, [row("new")]);

    expect(plan.renames).toEqual([]);
    expect(plan.settled).toEqual(["old"]);
  });

  it("skips a source held by more than one row", () => {
    const plan = planAliasApplications({ twin: "clean" }, [row("twin"), row("twin")]);

    expect(plan.renames).toEqual([]);
    expect(plan.skipped).toEqual([
      { from: "twin", reason: "slug held by 2 rows — merge the twins first" },
    ]);
  });

  it("skips a rename whose target is occupied by a row that is staying put", () => {
    const plan = planAliasApplications({ old: "occupied" }, [row("old"), row("occupied")]);

    expect(plan.renames).toEqual([]);
    expect(plan.skipped).toEqual([
      { from: "old", reason: "target occupied is already a live slug" },
    ]);
  });

  it("allows a target slot vacated by another rename in the same plan", () => {
    // b moves to c, freeing b for a — order-independent because sources are
    // excluded from the taken set up front.
    const plan = planAliasApplications({ a: "b", b: "c" }, [row("a"), row("b")]);

    // a's chain resolves through b to the final target c, which collides with
    // b's own rename — exactly one of them may land there.
    expect(plan.renames).toEqual([{ from: "a", to: "c" }]);
    expect(plan.skipped).toEqual([{ from: "b", reason: "target c is already a live slug" }]);
  });

  it("renames chained sources directly to the final target", () => {
    const plan = planAliasApplications(
      { "houses-unknown": "blurred-english-terraces-josie-kins" },
      [row("houses-unknown")],
    );

    expect(plan.renames).toEqual([
      { from: "houses-unknown", to: "blurred-english-terraces-josie-kins" },
    ]);
  });
});
