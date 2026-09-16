import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { approveAndApplyHandler, revertHandler } from "../server/changeProposalReview";
import { deriveProposalTargets, hashProposalTarget } from "../server/lib/changeProposalTargets";
import { contentHash } from "./proposals/contentHash";
import {
  SERVER_KEY,
  createCtx,
  admin,
  editor,
  proposalRow,
  asAdmin,
  type Row,
} from "./changeProposalReviewFixture";

// Copy block and About proposal kinds; the article and index layout kinds live in
// dataChangeProposalReview.test.ts.


beforeEach(() => {
  process.env.DATA_ADMIN_KEY = SERVER_KEY;
});

afterEach(() => {
  delete process.env.DATA_ADMIN_KEY;
});

const storedHero: Row = {
  _id: "cb1",
  _creationTime: 1700000000000,
  key: "home-hero",
  kind: "plain",
  body: "Stored welcome.",
  label: "Home hero",
  group: "Home",
  updatedAt: "2026-01-01T00:00:00.000Z",
  updatedBy: "admin@example.com",
};

const proposedHero = {
  key: "home-hero",
  kind: "plain" as const,
  body: "Proposed welcome.",
  label: "Home hero",
  group: "Home",
};

const proposedLinks = {
  key: "home-links",
  kind: "list" as const,
  items: ["First", " Second ", ""],
  label: "Home links",
  group: "Home",
};

const storedAbout: Row = {
  _id: "sc1",
  _creationTime: 1700000000000,
  key: "about",
  aboutMarkdown: "# Stored mission",
  aboutSubtitle: "Stored subtitle",
  founderProfileKeys: ["JOSIE"],
  updatedAt: "2026-01-01T00:00:00.000Z",
  updatedBy: "admin@example.com",
};

const proposedAbout = {
  aboutMarkdown: "# Proposed mission",
  aboutSubtitle: "Proposed subtitle",
  founderProfileKeys: ["JOSIE", "SAM"],
};

/** A stored row as `readProposalTarget` returns it: content without Postgres's system fields. */
function rowContent(row: Row) {
  const { _id: _rowId, _creationTime: _createdAt, ...content } = row;
  return content;
}

describe("change proposal targets for copy blocks and About", () => {
  it("derives one copyBlock target per trimmed key and one about target", async () => {
    const { ctx } = createCtx({});

    await expect(
      deriveProposalTargets(ctx, {
        copyBlocks: [{ key: " home-hero " }, { key: "home-links" }],
        about: proposedAbout,
      }),
    ).resolves.toEqual([
      { kind: "copyBlock", key: "home-hero" },
      { kind: "copyBlock", key: "home-links" },
      { kind: "about", key: "about" },
    ]);
    await expect(deriveProposalTargets(ctx, { copyBlocks: [] })).resolves.toEqual([]);
  });

  it("hashes the stored row content, hashes absence as null, and reads no siteConfig row but About", async () => {
    const { ctx } = createCtx({
      copyBlocks: [storedHero],
      siteConfig: [storedAbout, { _id: "sc2", key: "safety-banner-display", enabled: true }],
    });

    expect(await hashProposalTarget(ctx, { kind: "copyBlock", key: "home-hero" })).toBe(
      contentHash(rowContent(storedHero)),
    );
    expect(await hashProposalTarget(ctx, { kind: "copyBlock", key: "home-links" })).toBe(contentHash(null));
    expect(await hashProposalTarget(ctx, { kind: "about", key: "about" })).toBe(contentHash(rowContent(storedAbout)));
    await expect(hashProposalTarget(ctx, { kind: "about", key: "safety-banner-display" })).rejects.toMatchObject({
      data: { code: "PROPOSAL_TARGET_INVALID" },
    });
  });
});

describe("changeProposalReview apply and revert for copy blocks", () => {
  const targets = [
    { kind: "copyBlock", key: "home-hero", baseHash: contentHash(rowContent(storedHero)) },
    { kind: "copyBlock", key: "home-links", baseHash: contentHash(null) },
  ];

  it("writes each block through the upsert handler as the approver and snapshots what was there", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin, editor],
      copyBlocks: [storedHero],
      changeProposals: [proposalRow({ targets, payload: { copyBlocks: [proposedHero, proposedLinks] } })],
    });

    const result = await approveAndApplyHandler(ctx, asAdmin);

    expect(result).toEqual({ status: "applied", revalidatePaths: ["/copy-blocks"] });
    expect(rowsOf("copyBlocks").get("cb1")).toMatchObject({
      key: "home-hero",
      body: "Proposed welcome.",
      updatedBy: "admin@example.com",
    });
    const links = [...rowsOf("copyBlocks").values()].find((row) => row.key === "home-links");
    expect(links).toMatchObject({ kind: "list", items: ["First", "Second"], body: undefined, updatedBy: "admin@example.com" });

    const proposal = rowsOf("changeProposals").get("proposal_p1")!;
    expect(proposal).toMatchObject({
      status: "applied",
      snapshotBefore: [
        { kind: "copyBlock", key: "home-hero", document: rowContent(storedHero) },
        { kind: "copyBlock", key: "home-links", document: null },
      ],
    });
    const appliedHashes = proposal.appliedHashes as Array<{ key: string; hash: string }>;
    expect(appliedHashes.map((entry) => entry.key)).toEqual(["home-hero", "home-links"]);
    expect(appliedHashes[0].hash).toBe(contentHash(rowContent(rowsOf("copyBlocks").get("cb1")!)));
  });

  it("requests changes without writing when a block moved under the proposal", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin],
      copyBlocks: [{ ...storedHero, body: "Edited meanwhile." }],
      changeProposals: [proposalRow({ targets, payload: { copyBlocks: [proposedHero, proposedLinks] } })],
    });

    const result = await approveAndApplyHandler(ctx, asAdmin);

    expect(result).toMatchObject({ status: "changes_requested" });
    expect(rowsOf("copyBlocks").get("cb1")).toMatchObject({ body: "Edited meanwhile." });
    expect(rowsOf("copyBlocks").size).toBe(1);
  });

  it("reverts by writing the stored block back and deleting the block the proposal created", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin, editor],
      copyBlocks: [storedHero],
      changeProposals: [proposalRow({ targets, payload: { copyBlocks: [proposedHero, proposedLinks] } })],
    });
    await approveAndApplyHandler(ctx, asAdmin);
    expect(rowsOf("copyBlocks").size).toBe(2);

    const result = await revertHandler(ctx, asAdmin);

    expect(result).toEqual({ status: "reverted", revalidatePaths: ["/copy-blocks"] });
    expect(rowsOf("copyBlocks").size).toBe(1);
    expect(rowsOf("copyBlocks").get("cb1")).toMatchObject({
      key: "home-hero",
      kind: "plain",
      body: "Stored welcome.",
      label: "Home hero",
      group: "Home",
      updatedBy: "admin@example.com",
    });
    expect(rowsOf("changeProposals").get("proposal_p1")).toMatchObject({ status: "reverted" });
  });
});

describe("changeProposalReview apply and revert for About", () => {
  const aboutTargets = (baseHash: string) => [{ kind: "about", key: "about", baseHash }];

  it("writes About through the save handler as the approver and revalidates /about", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin, editor],
      siteConfig: [storedAbout],
      changeProposals: [
        proposalRow({ targets: aboutTargets(contentHash(rowContent(storedAbout))), payload: { about: proposedAbout } }),
      ],
    });

    const result = await approveAndApplyHandler(ctx, asAdmin);

    expect(result).toEqual({ status: "applied", revalidatePaths: ["/about"] });
    expect(rowsOf("siteConfig").get("sc1")).toMatchObject({
      key: "about",
      aboutMarkdown: "# Proposed mission",
      aboutSubtitle: "Proposed subtitle",
      founderProfileKeys: ["JOSIE", "SAM"],
      updatedBy: "admin@example.com",
    });
    expect(rowsOf("siteConfig").size).toBe(1);
    expect(rowsOf("changeProposals").get("proposal_p1")).toMatchObject({
      status: "applied",
      snapshotBefore: [{ kind: "about", key: "about", document: rowContent(storedAbout) }],
    });
  });

  it("reverts About to the snapshot, dropping the snapshot's audit fields in favour of the reverter", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin, editor],
      siteConfig: [storedAbout],
      changeProposals: [
        proposalRow({ targets: aboutTargets(contentHash(rowContent(storedAbout))), payload: { about: proposedAbout } }),
      ],
    });
    await approveAndApplyHandler(ctx, asAdmin);

    const result = await revertHandler(ctx, asAdmin);

    expect(result).toEqual({ status: "reverted", revalidatePaths: ["/about"] });
    const row = rowsOf("siteConfig").get("sc1")!;
    expect(row).toMatchObject({
      key: "about",
      aboutMarkdown: "# Stored mission",
      aboutSubtitle: "Stored subtitle",
      founderProfileKeys: ["JOSIE"],
      updatedBy: "admin@example.com",
    });
    expect(row.updatedAt).not.toBe(storedAbout.updatedAt);
  });

  it("creates the About row when none existed and removes it again on revert", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin],
      changeProposals: [proposalRow({ targets: aboutTargets(contentHash(null)), payload: { about: proposedAbout } })],
    });

    await approveAndApplyHandler(ctx, asAdmin);
    expect(rowsOf("siteConfig").size).toBe(1);

    await revertHandler(ctx, asAdmin);
    expect(rowsOf("siteConfig").size).toBe(0);
    expect(rowsOf("changeProposals").get("proposal_p1")).toMatchObject({ status: "reverted" });
  });
});

