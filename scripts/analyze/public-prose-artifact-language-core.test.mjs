import { describe, expect, it } from "vitest";

import {
  assertNoPublicProseArtifactLanguage,
  assertNoPublicProseNamedSourceAttribution,
  auditPublicProseArtifactLanguage,
  auditPublicProseNamedSourceAttribution,
  extractPublicProseFields,
} from "./public-prose-artifact-language-core.mjs";

describe("public prose artifact-language audit", () => {
  it("flags hard extraction language in public article fields with slug, field, value, snippet, and match", () => {
    const report = auditPublicProseArtifactLanguage([
      {
        slug: "example",
        title: "Example",
        editorial_review: {
          note: "The source material is acceptable in editor-only metadata.",
        },
        references: [
          { title: "The source states nothing relevant here." },
        ],
        harm_potential: {
          psychosis: {
            level: "low",
            description: "The quote says psychotic reactions are uncommon at typical doses.",
          },
        },
      },
    ]);

    expect(report.findingCount).toBe(1);
    expect(report.findings[0]).toMatchObject({
      slug: "example",
      field: "harm_potential.psychosis.description",
      match: "The quote says",
      patternId: "quote_says",
      value: "The quote says psychotic reactions are uncommon at typical doses.",
    });
    expect(report.findings[0].snippet).toContain("The quote says");
  });

  it("scans proposal replacement values without requiring a full article object", () => {
    const report = auditPublicProseArtifactLanguage({
      proposals: [
        {
          slug: "proposal-drug",
          title: "Proposal Drug",
          fieldPath: "legality.countries[\"United States\"].notes",
          replacementValue: "Based on the source material, this remains controlled federally.",
        },
      ],
    });

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({
      slug: "proposal-drug",
      field: "legality.countries[\"United States\"].notes",
      match: "Based on the source material",
    });
  });

  it("flags residual source-attribution phrases from manual repair worklists", () => {
    const report = auditPublicProseArtifactLanguage({
      deployments: {
        publicRead: {
          sections: {
            legality: {
              entries: [
                {
                  slug: "doi",
                  title: "DOI",
                  fieldPath: "legality.countries.Australia.notes",
                  originalValue:
                    "Sources conflict on current status. One source indicates DOI is controlled. Another source states it is not listed.",
                },
              ],
            },
            pharmacology: {
              entries: [
                {
                  slug: "carisoprodol",
                  title: "Carisoprodol",
                  fieldPath: "pharmacology.route_half_life_notes.Oral",
                  originalValue:
                    "Some sources report an elimination half-life of approximately 8 hours.",
                },
                {
                  slug: "zopiclone",
                  title: "Zopiclone",
                  fieldPath: "pharmacology.pharmacokinetics",
                  originalValue:
                    "DrugBank states the metabolite is active, while the quoted source describes it as inactive.",
                },
                {
                  slug: "tolerance-example",
                  title: "Tolerance Example",
                  fieldPath: "tolerance.baseline_tolerance",
                  originalValue:
                    "Baseline sensitivity usually returns after 14 days, though some sources suggest it may take longer.",
                },
              ],
            },
            harm_potential: {
              entries: [
                {
                  slug: "25p-nbome",
                  title: "25P-NBOMe",
                  fieldPath: "harm_potential.toxicity.lethal_dosage.notes",
                  originalValue:
                    "No lethal-dose or LD50 data were provided. The source describes risks similar to other NBOMe compounds.",
                },
              ],
            },
            legality_more: {
              entries: [
                {
                  slug: "pagoclone",
                  title: "Pagoclone",
                  fieldPath: "legality.countries.Canada.notes",
                  originalValue:
                    "A June 2018 source lists Pagoclone as unscheduled in Canada.",
                },
              ],
            },
          },
        },
      },
    });

    expect(report.findings.map((finding) => finding.match)).toEqual([
      "Sources conflict",
      "One source indicates",
      "Another source states",
      "Some sources report",
      "quoted source describes",
      "The source describes",
      "A June 2018 source lists",
    ]);
    expect(report.findings.every((finding) => finding.slug !== "unknown")).toBe(true);
  });

  it("keeps named-source attribution out of the default artifact-language mode", () => {
    const report = auditPublicProseArtifactLanguage({
      slug: "named-default",
      dosage: {
        notes: "TripSit notes tentative dosage information, while DrugBank lists a short half-life.",
      },
    });

    expect(report.mode).toBe("artifact");
    expect(report.findings).toEqual([]);
  });

  it("flags named-source attribution in the separate named-source mode", () => {
    const report = auditPublicProseNamedSourceAttribution({
      slug: "named-source",
      title: "Named Source",
      dosage: {
        notes: "TripSit notes tentative dosage information, while DrugBank lists a short half-life.",
      },
      pharmacology: {
        pharmacokinetics: "According to the PsychonautWiki page, onset values are variable.",
      },
      harm_potential: {
        notes: "TripSit also warns against combining it with depressants. Wikipedia excerpt says it is uncommon.",
        addiction: {
          description: "TripSit categorizes the compound as habit-forming.",
        },
      },
      references: [
        { title: "DrugBank" },
      ],
    });

    expect(report.mode).toBe("named-source");
    expect(report.findings.map((finding) => finding.match)).toEqual([
      "According to the PsychonautWiki page",
      "TripSit notes",
      "DrugBank lists",
      "TripSit also warns",
      "Wikipedia excerpt says",
      "TripSit categorizes",
    ]);
    expect(report.findings.every((finding) => finding.slug === "named-source")).toBe(true);
  });

  it("can run artifact and named-source checks together when requested", () => {
    const report = auditPublicProseArtifactLanguage(
      {
        slug: "all-mode",
        legality: {
          notes: "DrugBank lists this entry separately. The quote says it is controlled.",
        },
      },
      { mode: "all" },
    );

    expect(report.findings.map((finding) => finding.match)).toEqual([
      "DrugBank lists",
      "The quote says",
    ]);
  });

  it("throws a separate formatted error for named-source attribution", () => {
    expect(() =>
      assertNoPublicProseNamedSourceAttribution({
        slug: "bad-named",
        history_culture: {
          content: "Wikipedia describes early use as controversial.",
        },
      }),
    ).toThrow(/Public prose named-source attribution audit failed/);
  });

  it("scans OpenRouter rewrite result rows and apply-summary after values", () => {
    const report = auditPublicProseArtifactLanguage([
      {
        articleSlug: "rewrite-drug",
        fieldPath: "dosage.routes[oral].notes",
        response: {
          parsed: {
            rewrittenText: "The source states oral dosing should be approached cautiously.",
          },
        },
      },
      {
        changes: [
          {
            slug: "summary-drug",
            title: "Summary Drug",
            changes: [
              {
                fieldPath: "duration.routes[0].half_life_notes",
                after: "The provided source notes a long elimination period.",
              },
            ],
          },
        ],
      },
    ]);

    expect(report.findings.map((finding) => finding.slug)).toEqual([
      "rewrite-drug",
      "summary-drug",
    ]);
    expect(report.findings.map((finding) => finding.field)).toEqual([
      "dosage.routes[oral].notes",
      "duration.routes[0].half_life_notes",
    ]);
  });

  it("can limit checks to selected public section roots", () => {
    const article = {
      slug: "section-limit",
      harm_potential: {
        seizure: {
          level: "low",
          description: "The source states seizure risk is uncommon.",
        },
      },
      legality: {
        notes: "The source material describes current legal status.",
      },
    };

    const report = auditPublicProseArtifactLanguage(article, { sections: ["legality"] });

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].field).toBe("legality.notes");
  });

  it("throws a formatted error in fail mode helpers", () => {
    expect(() =>
      assertNoPublicProseArtifactLanguage({
        slug: "bad",
        history_culture: {
          content: "According to the provided source, the compound appeared in the 1960s.",
        },
      }),
    ).toThrow(/Public prose artifact-language audit failed/);
  });

  it("extracts public prose roots and excludes editor-only metadata", () => {
    const fields = extractPublicProseFields({
      slug: "fields",
      summary: "Summary prose.",
      editorial_review: {
        notes: "Editor-only notes.",
      },
      references: [
        { title: "Reference title." },
      ],
      legality: {
        countries: {
          Canada: {
            status: "Controlled",
            notes: "Legal prose.",
          },
        },
      },
    });

    expect(fields.map((field) => field.fieldPath)).toEqual([
      "summary",
      "legality.countries.Canada.status",
      "legality.countries.Canada.notes",
    ]);
  });

  it("does not flag physical source material wording in Changa dosage prose", () => {
    const report = auditPublicProseArtifactLanguage({
      slug: "changa",
      dosage: {
        routes: [
          {
            route: "smoked",
            notes:
              "Dosage values are approximate; actual potency varies considerably depending on the specific blend and source material.",
          },
        ],
      },
    });

    expect(report.findings).toEqual([]);
  });
});
