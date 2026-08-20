import { describe, expect, it } from "vitest";
import {
  CREDIT_REASSIGNMENTS,
  planCreditReassignments,
  retextCredit,
} from "./reassign-replication-credits.mjs";

function row(fields = {}) {
  return {
    _id: `id-${fields.slug ?? "x"}`,
    slug: "a-work",
    title: "A work",
    artist: "StingrayZ",
    credit_line: "A work by StingrayZ",
    ...fields,
  };
}

describe("planCreditReassignments", () => {
  const subject = {
    slug: "a-work",
    from: "StingrayZ",
    to: "Symmetric Vision",
    reason: "handle rename",
  };

  it("moves the credit line with the name and leaves the rightsholder alone", () => {
    // The rows renamed before this run kept "StingrayZ" as rightsholder; it
    // records the licensing identity, not the display credit.
    const { rows } = planCreditReassignments(
      [row({ rightsholder: "StingrayZ", artist_url: "https://gfycat.com/@StingrayZ" })],
      [subject],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].updates).toEqual({
      title: "A work",
      artist: "Symmetric Vision",
      credit_line: "A work by Symmetric Vision",
      artist_url: "https://gfycat.com/@StingrayZ",
      rightsholder: "StingrayZ",
    });
    expect(rows[0].expected.artist).toBe("StingrayZ");
  });

  it("retargets artist_url only when the subject says the stored link names someone else", () => {
    const misattributed = {
      slug: "a-work",
      from: "Loka",
      to: "Symmetric Vision",
      artistUrl: "https://symmetric-vision.xyz/",
      reason: "misattribution",
    };
    const { rows } = planCreditReassignments(
      [row({ artist: "Loka", credit_line: "A work by Loka", artist_url: "https://lokavision.com/" })],
      [misattributed],
    );

    expect(rows[0].updates.artist_url).toBe("https://symmetric-vision.xyz/");
    // The precondition still carries what is stored today, or the swap is blind.
    expect(rows[0].expected.artist_url).toBe("https://lokavision.com/");
  });

  it("gives a row with no credit line the corpus's standard one", () => {
    // The mutation's validator requires a credit_line string; an empty one
    // would print as a blank byline.
    const { rows } = planCreditReassignments([row({ credit_line: undefined })], [subject]);

    expect(rows[0].updates.credit_line).toBe("A work by Symmetric Vision");
    expect(rows[0].expected.credit_line).toBeNull();
    expect(rows[0].updates).not.toHaveProperty("artist_url");
  });

  it("reports an already-corrected row as settled instead of rewriting it", () => {
    const plan = planCreditReassignments(
      [row({ artist: "Symmetric Vision", credit_line: "A work by Symmetric Vision" })],
      [subject],
    );

    expect(plan.rows).toEqual([]);
    expect(plan.settled).toEqual([{ slug: "a-work", artist: "Symmetric Vision" }]);
    expect(plan.blocked).toEqual([]);
  });

  it("blocks a row credited to a third name, and a subject with no row at all", () => {
    const plan = planCreditReassignments([row({ artist: "Josie Kins" })], [
      subject,
      { ...subject, slug: "gone" },
    ]);

    expect(plan.rows).toEqual([]);
    expect(plan.blocked).toEqual([
      { slug: "a-work", why: 'credited "Josie Kins", expected "StingrayZ"' },
      { slug: "gone", why: "no row with this slug" },
    ]);
  });
});

describe("retextCredit", () => {
  it("replaces the stored spelling case-insensitively, everywhere it appears", () => {
    expect(retextCredit("stingrayz on tour, by StingrayZ", "StingrayZ", "Symmetric Vision")).toBe(
      "Symmetric Vision on tour, by Symmetric Vision",
    );
  });
});

describe("CREDIT_REASSIGNMENTS", () => {
  it("names one target artist and never renames a slug", () => {
    expect(CREDIT_REASSIGNMENTS).toHaveLength(7);
    expect(new Set(CREDIT_REASSIGNMENTS.map((entry) => entry.to))).toEqual(
      new Set(["Symmetric Vision"]),
    );
    // Only the misattributed row rewrites the artist's link.
    expect(CREDIT_REASSIGNMENTS.filter((entry) => entry.artistUrl).map((entry) => entry.slug)).toEqual([
      "embedded-geometry-test-pole-loka",
    ]);
    expect(CREDIT_REASSIGNMENTS.every((entry) => entry.reason.length > 0)).toBe(true);
  });
});
