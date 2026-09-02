import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadPlan, planProfilePatches } from "./apply-profile-patches.mjs";

/** Shapes lifted from the live `contributorProfiles:getByKey` projection. */
const LOKA = {
  key: "LOKA",
  displayName: "Loka",
  aliases: ["loka", "wheressuede"],
  avatarUrl: null,
  bio: "",
  links: [{ label: "Reddit", url: "https://www.reddit.com/user/wheressuede/" }],
  hasCustomBio: false,
  role: "Replication Artist",
  replicationOrder: [],
  reportOrder: [],
};

const APPROVE_LOKA = {
  key: "loka",
  why: "Owner-listed approved replicator.",
  expected: { displayName: "Loka", aliases: ["wheressuede", "loka"], approved_replicator: false },
  patch: { aliases: ["loka", "wheressuede", "lokavision"], approved_replicator: true },
};

function profiles(...rows) {
  return new Map(rows.map((row) => [row.key, row]));
}

describe("planProfilePatches", () => {
  it("plans an update against a profile that still matches its reviewed state", () => {
    const [row] = planProfilePatches([{ ...APPROVE_LOKA, key: "LOKA" }], profiles(LOKA));

    expect(row).toMatchObject({
      key: "LOKA",
      action: "update",
      displayName: "Loka",
      patch: APPROVE_LOKA.patch,
      // A deployment predating the flag reads back no key; that is `false`.
      before: { aliases: ["loka", "wheressuede"], approved_replicator: false },
    });
  });

  it("fails closed on a profile whose reviewed fields moved, naming the field", () => {
    const renamed = { ...LOKA, displayName: "Loka Vision" };
    const [row] = planProfilePatches([{ ...APPROVE_LOKA, key: "LOKA" }], profiles(renamed));

    expect(row).toEqual({
      key: "LOKA",
      action: "drifted",
      field: "displayName",
      expected: "Loka",
      live: "Loka Vision",
    });
  });

  it("reports a profile that already reads as patched as settled, tolerating folded-in aliases", () => {
    const applied = {
      ...LOKA,
      // The editor patch folds the key and display name back in, so the
      // stored list is wider than the plan's; that is still settled.
      aliases: ["loka", "wheressuede", "lokavision", "loka vision"],
      approved_replicator: true,
    };
    const [row] = planProfilePatches(
      [{ ...APPROVE_LOKA, key: "LOKA", expected: { displayName: "Loka" } }],
      profiles(applied),
    );

    expect(row.action).toBe("settled");
  });

  it("reports a missing profile rather than inventing one", () => {
    expect(planProfilePatches([{ ...APPROVE_LOKA, key: "NOBODY" }], profiles(LOKA))).toEqual([
      { key: "NOBODY", action: "missing" },
    ]);
  });
});

describe("loadPlan", () => {
  function writePlan(plan) {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "profile-patches-")), "plan.json");
    fs.writeFileSync(file, JSON.stringify(plan));
    return file;
  }

  it("uppercases keys and refuses duplicates, empty patches, and unknown expectations", () => {
    expect(loadPlan(writePlan({ patches: [APPROVE_LOKA] }))[0].key).toBe("LOKA");

    expect(() => loadPlan(writePlan({ patches: [APPROVE_LOKA, { ...APPROVE_LOKA, key: "LOKA" }] }))).toThrow(
      /twice/,
    );
    expect(() => loadPlan(writePlan({ patches: [{ key: "LOKA", patch: {} }] }))).toThrow(/no patch/);
    expect(() =>
      loadPlan(writePlan({ patches: [{ key: "LOKA", expected: { bio: "" }, patch: { archival: true } }] })),
    ).toThrow(/unsupported field "bio"/);
    expect(() => loadPlan(writePlan({ patches: [] }))).toThrow(/no patches/);
  });
});
