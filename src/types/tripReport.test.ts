import { describe, expect, it } from "vitest";
import {
  toPublicReportDetail,
  toPublicReportPreview,
  toReportCardModel,
  type PublicReportPreview,
  type ReportCardModel,
  type TripReportDetailRecord,
} from "./tripReport";

const detailReport: TripReportDetailRecord = {
  slug: "ketamine-field-notes",
  title: "Ketamine Field Notes",
  featured: true,
  subject: {
    name: "Example Author",
    avatar_url: "https://example.com/avatar.png",
    profile_key: "AUTHOR",
    trip_date: "2026-04-01",
    setting: "Home",
    pdf_url: "https://example.com/tracker.pdf",
  },
  substances: [
    { name: "Ketamine", dose: "50 mg", roa: "intranasal" },
    { name: "Cannabis" },
  ],
  introduction: undefined,
  onset: [],
  peak: [{ time: "T+00:40", description: "Peak effects." }],
  offset: [],
  conclusion: undefined,
  tags: ["dissociative"],
};

describe("trip report contract adapters", () => {
  it("projects stored reports into public previews with resolved author metadata", () => {
    expect(
      toPublicReportPreview({
        slug: detailReport.slug,
        title: detailReport.title,
        featured: detailReport.featured,
        subject: detailReport.subject,
        substances: detailReport.substances,
        excerpt: "",
      }, {
        authorAvatarUrl: "https://example.com/resolved-avatar.png",
        authorProfileKey: "RESOLVED",
      }),
    ).toEqual({
      title: "Ketamine Field Notes",
      slug: "ketamine-field-notes",
      author: "Example Author",
      featured: true,
      substanceNames: ["Ketamine", "Cannabis"],
      substances: [
        { name: "Ketamine", dose: "50 mg", roa: "intranasal" },
        { name: "Cannabis" },
      ],
      introduction: "",
      tripDate: "2026-04-01",
      age: undefined,
      gender: undefined,
      height: undefined,
      weight: undefined,
      medications: undefined,
      setting: "Home",
      authorAvatarUrl: "https://example.com/resolved-avatar.png",
      authorProfileKey: "RESOLVED",
    });
  });

  it("keeps detail records as full trip reports for timeline-only rendering paths", () => {
    const detail = toPublicReportDetail(detailReport);

    expect(detail.peak).toEqual([{ time: "T+00:40", description: "Peak effects." }]);
    expect(detail.onset).toEqual([]);
    expect(detail.subject.pdf_url).toBe("https://example.com/tracker.pdf");
  });

  it("builds report card models from previews without timeline placeholders", () => {
    const preview: PublicReportPreview = {
      title: "Preview Report",
      slug: "preview-report",
      author: "Preview Author",
      featured: false,
      substanceNames: ["LSD"],
      substances: [{ name: "LSD", dose: "100ug", roa: "oral" }],
      introduction: "Short excerpt",
      authorAvatarUrl: null,
      authorProfileKey: "PREVIEW",
    };

    expect(toReportCardModel(preview)).toEqual({
      slug: "preview-report",
      title: "Preview Report",
      featured: false,
      subject: {
        name: "Preview Author",
        trip_date: undefined,
        avatar_url: undefined,
        profile_key: "PREVIEW",
      },
      substances: [{ name: "LSD", dose: "100ug", roa: "oral" }],
    });
  });

  it("preserves optional subject fields and substance detail for cards built from detail records", () => {
    expect(toReportCardModel(detailReport)).toEqual({
      slug: "ketamine-field-notes",
      title: "Ketamine Field Notes",
      featured: true,
      subject: {
        name: "Example Author",
        trip_date: "2026-04-01",
        avatar_url: "https://example.com/avatar.png",
        profile_key: "AUTHOR",
      },
      substances: [
        { name: "Ketamine", dose: "50 mg", roa: "intranasal" },
        { name: "Cannabis" },
      ],
    });
  });

  it("does not allow card models to satisfy detail-only report contracts", () => {
    const card: ReportCardModel = toReportCardModel(detailReport);

    expect(card).not.toHaveProperty("onset");

    const consumeDetail = (_report: TripReportDetailRecord) => undefined;
    // @ts-expect-error Card models intentionally omit timelines and detail-only fields.
    consumeDetail(card);
  });
});
