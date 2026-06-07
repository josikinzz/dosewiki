import { describe, expect, it } from "vitest";
import {
  collapseContributorProfiles,
  projectPublicReportDetail,
  projectPublicReportDetails,
  projectPublicReportPreview,
  projectPublicReportPreviews,
  resolveReportContributorProfile,
} from "./publicData.reportProfileProjection";
import type { TripReportDetailRecord, TripReportPreviewRecord } from "../../src/types/tripReport";
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
  introduction: "A short introduction.",
  onset: [],
  peak: [],
  offset: [],
  conclusion: undefined,
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

  it("matches report authors by exact display name, alias, and first-name fallback", () => {
    const profiles = [profile({ displayName: "Alice Example", aliases: ["legacy alice"] })];

    expect(resolveReportContributorProfile(profiles, "Alice Example")?.key).toBe("AUTHOR");
    expect(resolveReportContributorProfile(profiles, "legacy alice")?.key).toBe("AUTHOR");
    expect(resolveReportContributorProfile(profiles, "Alice")?.key).toBe("AUTHOR");
  });

  it("projects previews with profile avatars and author profile keys", () => {
    const projected = projectPublicReportPreview(
      report({
        introduction: "One ".repeat(80),
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
    const projected = projectPublicReportPreview(
      report({
        introduction: undefined,
        onset: [{ time: "T+00:10", description: "The room began to stretch outward." }],
        peak: [{ description: "Complex colors moved across the ceiling." }],
        conclusion: "I felt calm afterward.",
      }),
      [],
    );

    expect(projected.introduction).toBe(
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

  it("sorts projected previews and detail reports by featured first, then title", () => {
    const records = [
      report({ slug: "z", title: "Zed", featured: false }),
      report({ slug: "b", title: "Beta", featured: true }),
      report({ slug: "a", title: "Alpha", featured: true }),
    ];

    expect(projectPublicReportPreviews(records, []).map((entry) => entry.slug)).toEqual(["a", "b", "z"]);
    expect(projectPublicReportDetails(records, []).map((entry) => entry.slug)).toEqual(["a", "b", "z"]);
  });
});
