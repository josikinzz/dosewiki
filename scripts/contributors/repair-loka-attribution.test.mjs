import { describe, expect, it } from "vitest";
import {
  PROFILE_LINKS,
  WEBSITE_URL,
  planProfileRepair,
  planReplicationRepairs,
} from "./repair-loka-attribution.mjs";

const row = (overrides = {}) => ({
  _id: "id-1",
  slug: "forest-of-life-loka",
  title: "Forest of Life",
  artist: "Loka",
  artist_url: "reddit.com/u/wheressuede",
  credit_line: "Forest of Life by Loka",
  source_url: "https://streamable.com/e/0wiewa",
  rightsholder: "Wheressuede",
  ...overrides,
});

describe("planProfileRepair", () => {
  it("reports a missing profile instead of planning anything", () => {
    expect(planProfileRepair(null)).toEqual({ action: "missing" });
  });

  it("plans the lokavision.com link onto an empty link list", () => {
    const plan = planProfileRepair({ key: "LOKA", links: [] });
    expect(plan.action).toBe("update");
    expect(plan.after).toEqual([...PROFILE_LINKS]);
  });

  it("is a no-op when the link is already there, however it is spelled", () => {
    for (const url of [WEBSITE_URL, "https://lokavision.com", "http://lokavision.com/"]) {
      expect(planProfileRepair({ key: "LOKA", links: [{ label: "x", url }] }).action).toBe(
        "unchanged",
      );
    }
  });

  it("refuses to clobber a link list a human already curated", () => {
    const plan = planProfileRepair({
      key: "LOKA",
      links: [{ label: "elsewhere", url: "https://example.com/" }],
    });
    expect(plan.action).toBe("conflict");
    expect(plan.reason).toContain("https://example.com/");
  });
});

describe("planReplicationRepairs", () => {
  it("repairs the schemeless reddit URL and normalizes both rightsholder casings", () => {
    const { rows, conflicts } = planReplicationRepairs([
      row(),
      row({ _id: "id-2", slug: "symmetry-stream-loka", rightsholder: "wheressuede" }),
    ]);

    expect(conflicts).toEqual([]);
    expect(rows).toHaveLength(2);
    for (const entry of rows) {
      expect(entry.unchanged).toBe(false);
      expect(entry.updates.artist_url).toBe(WEBSITE_URL);
      expect(entry.updates.rightsholder).toBe("Loka");
      // The precondition snapshot is the row as it is stored now, so a row
      // edited after planning fails closed inside the mutation.
      expect(entry.expected.artist_url).toBe("reddit.com/u/wheressuede");
    }
  });

  it("matches her rows with no artist_url at all and leaves other artists alone", () => {
    const { rows } = planReplicationRepairs([
      row({ _id: "id-3", slug: "entropy-loka", artist_url: undefined, rightsholder: undefined }),
      row({ _id: "id-4", slug: "gecko-symmetric-vision", artist: "Symmetric Vision" }),
    ]);

    expect(rows.map((entry) => entry.slug)).toEqual(["entropy-loka"]);
    const [entry] = rows;
    expect(entry.updates.artist_url).toBe(WEBSITE_URL);
    expect(entry.updates).not.toHaveProperty("rightsholder");
  });

  it("is idempotent: a repaired row plans as up-to-date", () => {
    const { rows } = planReplicationRepairs([
      row({ artist_url: WEBSITE_URL, rightsholder: "Loka" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].unchanged).toBe(true);
  });

  it("surfaces a wheressuede residue on a row credited to someone else as a conflict", () => {
    const { rows, conflicts } = planReplicationRepairs([
      row({ artist: "Somebody Else" }),
    ]);
    expect(rows).toEqual([]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toContain("Somebody Else");
  });

  it("refuses to overwrite an artist_url it does not recognize", () => {
    const { conflicts } = planReplicationRepairs([
      row({ artist_url: "https://someones-portfolio.example/" }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toContain("someones-portfolio.example");
  });

  it("synthesizes the canonical credit line for a row that stores none", () => {
    const { rows } = planReplicationRepairs([
      row({ slug: "entropy-loka", title: "entropy", credit_line: undefined, artist_url: undefined, rightsholder: undefined }),
    ]);
    expect(rows[0].updates.credit_line).toBe("entropy by Loka");
    expect(rows[0].creditLineSynthesized).toBe(true);
  });
});
