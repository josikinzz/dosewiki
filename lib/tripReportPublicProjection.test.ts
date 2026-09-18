import { describe, expect, it, vi } from "vitest";
import type { Doc } from "@server/postgres/runtime/dataModel";
import { publicTripReport, publicTripReportPreview } from "../server/lib/tripReportPublicProjection";
import { getPublicPreviewsPage } from "../server/tripReports";

vi.mock("server-only", () => ({}));

function publishedReport(): Doc<"tripReports"> {
  return {
    _id: "report-fixture" as Doc<"tripReports">["_id"],
    _creationTime: 1,
    slug: "redacted-report",
    title: "Redacted report",
    owner_email: "private-owner@example.com",
    subject: { name: "Published byline", avatar_url: "https://example.com/avatar.png", pdf_url: "https://example.com/report.pdf" },
    substances: [{ name: "Example" }],
    introduction: "Original introduction.\n",
    onset: [{ time: "T+0:10", description: "First entry." }, { description: "Second entry." }],
    peak: [],
    offset: [],
    tags: ["fixture"],
    license: "author-retained",
    attribution_review: { reviewed_by: "private-editor@example.com", reviewed_at: "2026-09-05T00:00:00.000Z", decision: "declined" },
  };
}

describe("public trip report privacy", () => {
  it("keeps published content and explicit byline policy without owner or moderation identity", () => {
    const stored = publishedReport();
    const visible = publicTripReport(stored);
    expect(visible).not.toHaveProperty("owner_email");
    expect(visible).not.toHaveProperty("attribution_review");
    expect(JSON.stringify(visible)).not.toContain("private-owner@example.com");
    expect(JSON.stringify(visible)).not.toContain("private-editor@example.com");
    expect(visible.attribution_locked).toBe(true);
    expect(visible.subject).toEqual(stored.subject);
    expect(visible.onset).toEqual(stored.onset);
    expect(visible.introduction).toBe("Original introduction.\n");
    expect(visible.license).toBe("author-retained");
  });

  it("returns the identical excerpt without narrative or timeline bodies", () => {
    const visible = publicTripReportPreview(publishedReport());

    expect(visible.excerpt).toBe("Original introduction. First entry. Second entry.");
    expect(visible).not.toHaveProperty("introduction");
    expect(visible).not.toHaveProperty("onset");
    expect(visible).not.toHaveProperty("peak");
    expect(visible).not.toHaveProperty("offset");
    expect(visible).not.toHaveProperty("conclusion");
    expect(visible.subject).toEqual(publishedReport().subject);
    expect(visible.substances).toEqual(publishedReport().substances);
  });

  it("returns raw introductions only when search summaries are requested", async () => {
    const stored = {
      ...publishedReport(),
      introduction: `  Original paragraph.\n\n${"Untranslated introduction. ".repeat(30)}\n`,
      peak: [{ description: "Peak body must stay private to detail reads." }],
      offset: [{ description: "Offset body must stay private to detail reads." }],
      conclusion: "Conclusion body must stay private to detail reads.",
    };
    const withoutIntroduction = { ...publishedReport(), slug: "no-introduction", introduction: undefined };
    const ctx = {
      db: {
        query: () => ({
          paginate: async () => ({
            page: [stored, withoutIntroduction],
            continueCursor: "next",
            isDone: false,
          }),
        }),
      },
    } as never;
    // Registered queries retain their handler for direct in-process tests.
    const registeredQuery = getPublicPreviewsPage as unknown as {
      _handler: (ctx: never, args: { includeSearchSummary?: boolean }) => Promise<unknown>;
    };
    const handler = registeredQuery._handler;

    expect(await handler(ctx, { includeSearchSummary: true })).toEqual({
      items: [
        { slug: stored.slug, title: stored.title, introduction: stored.introduction },
        { slug: withoutIntroduction.slug, title: withoutIntroduction.title, introduction: undefined },
      ],
      cursor: "next",
      isDone: false,
    });
    const expectedPreviews = {
      items: [publicTripReportPreview(stored), publicTripReportPreview(withoutIntroduction)],
      cursor: "next",
      isDone: false,
    };
    expect(await handler(ctx, {})).toEqual(expectedPreviews);
    expect(await handler(ctx, { includeSearchSummary: false })).toEqual(expectedPreviews);
  });

  it("dates the publication from the row's creation, never from the moderation decision", () => {
    const visible = publicTripReport(publishedReport());

    // The row is inserted at promotion, so its creation time is the date the
    // archive gained the report. `reviewed_at` would date an editor's shift.
    expect(visible.published_at).toBe(new Date(1).toISOString());
    expect(JSON.stringify(visible)).not.toContain("2026-09-05T00:00:00.000Z");
  });
});
