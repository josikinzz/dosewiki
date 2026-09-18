import { describe, expect, it } from "vitest";
import {
  collapseContributorProfiles,
  projectPublicReportDetail,
  projectPublicReportDetails,
  projectPublicReportPreview,
  projectPublicReportPreviews,
  resolveReportContributorProfile,
} from "./publicData.reportProfileProjection";
import { getTripReportExcerpt, type TripReportDetailRecord, type TripReportPreviewRecord } from "../../src/types/tripReport";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";

const profile = (overrides: Partial<NormalizedUserProfile>): NormalizedUserProfile => ({
  key: "AUTHOR",
  displayName: "Author Name",
  aliases: [],
  avatarUrl: null,
  bio: "",
  links: [],
  hasCustomBio: false,
  ...overrides,
});

const report = (overrides: Partial<TripReportPreviewRecord>): TripReportPreviewRecord => ({
  slug: "report",
  title: "Report",
  featured: false,
  subject: { name: "Author Name" },
  substances: [{ name: "LSD" }],
  excerpt: "A short introduction.",
  ...overrides,
});

const detailReport = (overrides: Partial<TripReportDetailRecord>): TripReportDetailRecord => ({
  ...report({}),
  onset: [],
  peak: [],
  offset: [],
  conclusion: "Done.",
  tags: [],
  ...overrides,
});

describe("public report profile projection", () => {
  it("collapses public contributor profiles whose keys are aliases of canonical profiles", () => {
    const profiles = [
      profile({ key: "AUTHOR", aliases: ["old-author"] }),
      profile({ key: "OLD-AUTHOR", displayName: "Old Author" }),
      profile({ key: "OTHER", displayName: "Other" }),
    ];

    expect(collapseContributorProfiles(profiles).map((entry) => entry.key)).toEqual(["AUTHOR", "OTHER"]);
  });

  it("keeps a profile that lists its own key among its aliases", () => {
    // A key-shaped alias is part of the write model, not evidence of a duplicate row:
    // `renameProfile` records the old key as an alias so a renamed profile keeps resolving,
    // and the Effect Index identity import writes the lowercased key alongside real handles.
    // Reading those as alias rows collapsed the live 13-row table to a single profile, which
    // emptied dose.wiki's founder cards and removed every report author link.
    const profiles = [
      profile({ key: "JOSIE", displayName: "Josie Kins", aliases: ["josie", "josikinz", "josie kins"] }),
      profile({ key: "KAYTWO", displayName: "Kaytwo", aliases: ["kaytwo", "kaylee"] }),
      profile({ key: "LYREA", displayName: "Lyrea", aliases: ["oldhandle"] }),
    ];

    expect(collapseContributorProfiles(profiles).map((entry) => entry.key)).toEqual([
      "JOSIE",
      "KAYTWO",
      "LYREA",
    ]);
  });

  it("keeps the canonical profile when it both self-aliases and claims a duplicate row", () => {
    const profiles = [
      profile({ key: "AUTHOR", aliases: ["author", "old-author"] }),
      profile({ key: "OLD-AUTHOR", displayName: "Old Author" }),
    ];

    expect(collapseContributorProfiles(profiles).map((entry) => entry.key)).toEqual(["AUTHOR"]);
  });

  it("ignores blank aliases and aliases that name no row in the table", () => {
    const profiles = [profile({ key: "VISCID", displayName: "Viscid", aliases: ["viscid", "mark gillis", ""] })];

    expect(collapseContributorProfiles(profiles).map((entry) => entry.key)).toEqual(["VISCID"]);
  });

  it("matches report authors by exact display name and by alias only", () => {
    const profiles = [profile({ displayName: "Alice Example", aliases: ["legacy alice"] })];

    expect(resolveReportContributorProfile(profiles, "Alice Example")?.key).toBe("AUTHOR");
    expect(resolveReportContributorProfile(profiles, "legacy alice")?.key).toBe("AUTHOR");
    // A bare given name is another contributor's to claim, so it stays unresolved
    // until this profile records it as an alias.
    expect(resolveReportContributorProfile(profiles, "Alice")).toBeNull();
  });

  it("projects previews with profile avatars and author profile keys", () => {
    const projected = projectPublicReportPreview(
      report({
        excerpt: "One ".repeat(34).trimEnd() + "…",
        subject: { name: "legacy alice", trip_date: "2024-01-01" },
      }),
      [profile({ aliases: ["legacy alice"], avatarUrl: "https://example.com/profile.png" })],
    );

    expect(projected).toMatchObject({
      author: "legacy alice",
      authorAvatarUrl: "https://example.com/profile.png",
      authorProfileKey: "AUTHOR",
      tripDate: "2024-01-01",
    });
    expect(projected.introduction.length).toBeLessThanOrEqual(171);
  });

  it("keeps report-provided avatars ahead of profile avatars", () => {
    const projected = projectPublicReportPreview(
      report({ subject: { name: "Author Name", avatar_url: "https://example.com/report.png" } }),
      [profile({ avatarUrl: "https://example.com/profile.png" })],
    );

    expect(projected.authorAvatarUrl).toBe("https://example.com/report.png");
  });

  it("uses timeline body text when a report has no introduction", () => {
    expect(getTripReportExcerpt({
      introduction: undefined,
      onset: [{ time: "T+00:10", description: "The room began to stretch outward." }],
      peak: [{ description: "Complex colors moved across the ceiling." }],
      offset: [],
      conclusion: "I felt calm afterward.",
    })).toBe(
      "The room began to stretch outward. Complex colors moved across the ceiling. I felt calm afterward.",
    );
  });

  it("uses fallback profile keys only when a contributor report preview has no matched profile", () => {
    const projected = projectPublicReportPreview(report({ subject: { name: "Unmatched" } }), [], {
      fallbackAuthorProfileKey: "AUTHOR",
    });

    expect(projected.authorProfileKey).toBe("AUTHOR");
    expect(projected.authorAvatarUrl).toBeNull();
  });

  it("enriches detail reports with matched profile keys and avatar fallback", () => {
    const projected = projectPublicReportDetail(
      detailReport({ subject: { name: "legacy alice" } }),
      [profile({ aliases: ["legacy alice"], avatarUrl: "https://example.com/profile.png" })],
    );

    expect(projected.subject).toMatchObject({
      name: "legacy alice",
      profile_key: "AUTHOR",
      avatar_url: "https://example.com/profile.png",
    });
  });

  it("keeps attributing legacy reports by author name when no editor review is recorded", () => {
    // The imported corpus carries no `profile_key` and no `attribution_review`;
    // name matching is the only thing attributing every published report today.
    const profiles = [profile({ key: "NERVEWING", displayName: "nervewing", avatarUrl: "https://example.com/n.png" })];
    const legacy = detailReport({ subject: { name: "nervewing" } });

    expect(projectPublicReportDetail(legacy, profiles).subject).toMatchObject({
      profile_key: "NERVEWING",
      avatar_url: "https://example.com/n.png",
    });
    expect(projectPublicReportPreview(report({ subject: { name: "nervewing" } }), profiles)).toMatchObject({
      authorProfileKey: "NERVEWING",
      authorAvatarUrl: "https://example.com/n.png",
    });
  });

  it("refuses to attribute a reviewed report on its byline alone", () => {
    // A promoted submission carries the review marker. Its byline is a string an
    // anonymous submitter typed, so matching a real contributor's name grants
    // nothing: no profile key, no avatar, no link to their page.
    const profiles = [profile({ key: "NERVEWING", displayName: "nervewing", avatarUrl: "https://example.com/n.png" })];
    const impersonating = {
      subject: { name: "nervewing" },
      attribution_review: {
        reviewed_by: "editor@example.com",
        reviewed_at: "2026-06-11T12:00:00.000Z",
        decision: "declined" as const,
      },
    };

    expect(projectPublicReportDetail(detailReport(impersonating), profiles).subject).toEqual({
      name: "nervewing",
    });
    expect(projectPublicReportPreview(report(impersonating), profiles)).toMatchObject({
      authorProfileKey: undefined,
      authorAvatarUrl: null,
    });
  });

  it("honours the profile key an editor assigned to a reviewed report", () => {
    const profiles = [
      profile({ key: "NERVEWING", displayName: "nervewing", avatarUrl: "https://example.com/n.png" }),
      profile({ key: "ADA", displayName: "Ada Lovelace", avatarUrl: "https://example.com/a.png" }),
    ];
    const reviewed = {
      subject: { name: "Ada Lovelace", profile_key: "ADA" },
      attribution_review: {
        reviewed_by: "editor@example.com",
        reviewed_at: "2026-06-11T12:00:00.000Z",
        decision: "assigned" as const,
      },
    };

    expect(projectPublicReportDetail(detailReport(reviewed), profiles).subject).toMatchObject({
      profile_key: "ADA",
      avatar_url: "https://example.com/a.png",
    });
    expect(projectPublicReportPreview(report(reviewed), profiles)).toMatchObject({
      authorProfileKey: "ADA",
      authorAvatarUrl: "https://example.com/a.png",
    });
  });

  it("sorts projected previews and detail reports by featured first, then title", () => {
    const records = [
      report({ slug: "z", title: "Zed", featured: false }),
      report({ slug: "b", title: "Beta", featured: true }),
      report({ slug: "a", title: "Alpha", featured: true }),
    ];
    const detailRecords = [
      detailReport({ slug: "z", title: "Zed", featured: false }),
      detailReport({ slug: "b", title: "Beta", featured: true }),
      detailReport({ slug: "a", title: "Alpha", featured: true }),
    ];

    expect(projectPublicReportPreviews(records, []).map((entry) => entry.slug)).toEqual(["a", "b", "z"]);
    expect(projectPublicReportDetails(detailRecords, []).map((entry) => entry.slug)).toEqual(["a", "b", "z"]);
  });
});
