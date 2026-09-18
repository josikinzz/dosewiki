import { describe, expect, it } from "vitest";

import type { Id } from "@server/postgres/runtime/dataModel";
import projectionFixture from "./fixtures/contributor-profile-import-projection-a3e501a7.json";
import {
  buildContributorProfileImportPayload,
  type ContributorProfileImportProjection,
  type LiveContributorProfileSnapshot,
} from "./contributorProfileImportAdapter";

const projection = projectionFixture as ContributorProfileImportProjection;
const avatarR2Key =
  "media/sha256/ab/ab00000000000000000000000000000000000000000000000000000000000000.webp";

function liveProfiles(): LiveContributorProfileSnapshot[] {
  return projection.existingProfiles.map((profile) => ({
    _id: profile.profileId as Id<"contributorProfiles">,
    key: profile.key,
    displayName: profile.displayName,
    aliases: [],
    ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
    bio: "",
    links: profile.existingLinks,
  }));
}

describe("buildContributorProfileImportPayload", () => {
  it("converts the pinned a3e501a7 projection into full CAS entries", () => {
    const payload = buildContributorProfileImportPayload({
      projection,
      liveProfiles: liveProfiles(),
      operationId: projection.campaignId,
      dryRun: true,
      avatarBindings: {
        FRAKTALITY: { avatarStorageId: "storage-avatar" as Id<"_storage"> },
      },
    });

    expect(payload.entries).toHaveLength(43);
    expect(payload.entries.filter((entry) => entry.outcome === "existing-profile")).toHaveLength(4);
    expect(payload.entries.filter((entry) => entry.outcome === "reviewed-new")).toHaveLength(8);
    expect(payload.entries.filter((entry) => !["existing-profile", "reviewed-new"].includes(entry.outcome)))
      .toHaveLength(31);

    const angus = payload.entries.find(
      (entry) => entry.outcome === "existing-profile" && entry.profile.key === "ANGUSLONG",
    );
    expect(angus).toMatchObject({
      expected: { links: [] },
      profile: { links: expect.arrayContaining([
        expect.objectContaining({ url: "https://algaart.com/" }),
      ]) },
    });
    if (!angus || angus.outcome !== "existing-profile") throw new Error("Missing Angus CAS entry.");
    expect(angus.profile.links).toHaveLength(3);
    expect(angus.profile.links.some((link) => link.url.includes("reddit.com"))).toBe(false);

    const bryan = payload.entries.find(
      (entry) => entry.outcome === "reviewed-new" && entry.profile.key === "BRYANITCH",
    );
    expect(bryan).toMatchObject({
      profile: { avatarR2Key: null, avatarStorageId: null, avatarUrl: null },
    });
    const fraktality = payload.entries.find(
      (entry) => entry.outcome === "reviewed-new" && entry.profile.key === "FRAKTALITY",
    );
    expect(fraktality).toMatchObject({
      profile: { avatarStorageId: "storage-avatar", avatarR2Key: null, avatarUrl: null },
    });
  });

  it("fails when a projection attempts to import an evidence-only fourth link", () => {
    const changed = structuredClone(projection);
    const angus = changed.existingProfiles.find((profile) => profile.key === "ANGUSLONG")!;
    angus.addLinks.push(...angus.evidenceOnlyLinks);
    angus.evidenceOnlyLinks = [];

    expect(() => buildContributorProfileImportPayload({
      projection: changed,
      liveProfiles: liveProfiles(),
      operationId: changed.campaignId,
      dryRun: true,
    })).toThrow(/exceeds the 3-link reviewed plan limit/);
  });

  it("projects an R2 avatar reference for the mutation's typed fail-closed dry run", () => {
    const payload = buildContributorProfileImportPayload({
      projection,
      liveProfiles: liveProfiles(),
      operationId: projection.campaignId,
      dryRun: true,
      avatarBindings: { BRYANITCH: { avatarR2Key } },
    });
    const bryan = payload.entries.find(
      (entry) => entry.outcome === "reviewed-new" && entry.profile.key === "BRYANITCH",
    );
    expect(bryan).toMatchObject({ profile: { avatarR2Key } });
  });

  it("preserves an existing avatar when its binding is missing or empty", () => {
    const current = liveProfiles();
    current[0] = { ...current[0], avatarUrl: "https://artist.example/avatar.webp" };
    const changedProjection = structuredClone(projection);
    changedProjection.existingProfiles[0].avatarUrl = "https://artist.example/avatar.webp";

    for (const avatarBindings of [undefined, { [current[0].key]: {} }]) {
      const payload = buildContributorProfileImportPayload({
        projection: changedProjection,
        liveProfiles: current,
        operationId: changedProjection.campaignId,
        dryRun: true,
        avatarBindings,
      });
      const entry = payload.entries.find(
        (candidate) => candidate.outcome === "existing-profile" && candidate.profile.key === current[0].key,
      );
      expect(entry).toMatchObject({
        expected: { avatarUrl: "https://artist.example/avatar.webp" },
        profile: { avatarUrl: "https://artist.example/avatar.webp" },
      });
    }
  });

  it("rejects a misspelled avatar binding key instead of silently omitting it", () => {
    expect(() => buildContributorProfileImportPayload({
      projection,
      liveProfiles: liveProfiles(),
      operationId: projection.campaignId,
      dryRun: true,
      avatarBindings: { BRYANITC: { avatarUrl: "https://artist.example/avatar.webp" } },
    })).toThrow(/not present in the reviewed projection/);
  });

  it("fails when the live CAS input drifted from the projection", () => {
    const current = liveProfiles();
    current[0] = { ...current[0], links: [{ label: "Changed", url: "https://changed.example/" }] };

    expect(() => buildContributorProfileImportPayload({
      projection,
      liveProfiles: current,
      operationId: projection.campaignId,
      dryRun: true,
    })).toThrow(/Existing links drifted/);
  });
});
