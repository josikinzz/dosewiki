import { describe, expect, it } from "vitest";

import {
  parseSourceCorpus,
  ParseSourceCorpusError,
  type ParseSourceCorpusOptions,
  type ParseSourceCorpusReporter,
  type ParseSourceCorpusWriteContext,
  type ParseSourceCorpusWriteResult,
  type SourceCatalogEntry,
  type SubstanceSourceDocument,
} from "../scripts/parsers/parse-source-corpus";
import type { ParsedOutputShape } from "../scripts/parsers/contracts";
import type {
  ParsedInteraction,
  ParsedSubstanceData,
  ParserResult,
  SourceParser,
} from "../scripts/parsers/types";
import {
  parseCliOptions,
  runParseSourcesCli,
} from "../scripts/parse-sources-cli";
import { resolveParserSource } from "../scripts/parsers/registry";

function createParserResult(overrides: Partial<ParserResult> = {}): ParserResult {
  return {
    dosage: [],
    duration: [],
    effects: [],
    interactions: [],
    legal: [],
    internationalLaw: [],
    narrativeContent: {
      experienceReports: [],
      synthesis: [],
      qualitativeComments: [],
      generalNotes: [],
    },
    sectionsExtracted: [],
    ...overrides,
  };
}

function createSourceDocument(
  slug: string,
  sources: SubstanceSourceDocument["sources"],
): SubstanceSourceDocument {
  return {
    slug,
    substanceName: slug.toUpperCase(),
    sources,
    contents: Object.fromEntries(
      sources.map((source) => [source.id, `Fixture content for ${source.id}`]),
    ),
  };
}

function createMemoryRunOptions(args: {
  entries: SourceCatalogEntry[];
  documents: Record<string, SubstanceSourceDocument | null>;
  parsers: Record<string, SourceParser>;
  existingData?: Record<string, ParsedSubstanceData> | null;
  enrichment?: ParseSourceCorpusOptions["enrichment"];
  reporter?: ParseSourceCorpusReporter;
  writeCalls?: Array<{
    output: ParsedOutputShape;
    context: ParseSourceCorpusWriteContext;
  }>;
}): ParseSourceCorpusOptions {
  return {
    catalog: {
      listSubstances: () => args.entries,
      loadSubstance: (entry) => args.documents[entry.slug] ?? null,
    },
    parserRegistry: {
      getParser: (sourceId) => args.parsers[sourceId],
    },
    enrichment:
      args.enrichment ??
      ({
        enrich: () => ({
          substancesEnriched: 0,
          interactionsAdded: 0,
          interactionsOverridden: 0,
          categoriesMapped: {},
        }),
      } satisfies ParseSourceCorpusOptions["enrichment"]),
    persistence: {
      readExistingParsedData: () => args.existingData ?? null,
      writeParsedOutput: (output, context): ParseSourceCorpusWriteResult => {
        args.writeCalls?.push({ output, context });
        return { outputPath: "memory://parsed-sources.json" };
      },
    },
    reporter: args.reporter,
  };
}

describe("parseSourceCorpus", () => {
  it("filters to one substance and writes the parsed output through persistence", async () => {
    const writeCalls: Array<{
      output: ParsedOutputShape;
      context: ParseSourceCorpusWriteContext;
    }> = [];

    const result = await parseSourceCorpus({
      ...createMemoryRunOptions({
        entries: [{ slug: "lsd" }, { slug: "mdma" }],
        documents: {
          lsd: createSourceDocument("lsd", [
            {
              id: "fixture",
              fileName: "fixture.md",
              displayName: "Fixture Source",
              size: 100,
              tokens: 25,
            },
          ]),
          mdma: createSourceDocument("mdma", [
            {
              id: "fixture",
              fileName: "fixture.md",
              displayName: "Fixture Source",
              size: 100,
              tokens: 25,
            },
          ]),
        },
        parsers: {
          fixture: {
            sourceId: "fixture",
            parse: () =>
              createParserResult({
                dosage: [
                  {
                    route: "Oral",
                    source: "fixture",
                    confidence: "high",
                    ranges: { common: { min: 10, max: 20, unit: "mg" } },
                  },
                ],
                sectionsExtracted: ["dosage"],
              }),
          },
        },
        writeCalls,
      }),
      substance: "lsd",
    });

    expect(result.stats).toMatchObject({ total: 1, parsed: 1, withDosage: 1 });
    expect(Object.keys(result.substances)).toEqual(["lsd"]);
    expect(result.substances.lsd.sourcesCoverage).toEqual([
      {
        sourceId: "fixture",
        displayName: "Fixture Source",
        sectionsExtracted: ["dosage"],
        tokensOriginal: 25,
      },
    ]);
    expect(writeCalls).toHaveLength(1);
    expect(Object.keys(writeCalls[0].output.substances)).toEqual(["lsd"]);
  });

  it("fails before parsing when a requested substance is missing", async () => {
    await expect(
      parseSourceCorpus({
        ...createMemoryRunOptions({
          entries: [{ slug: "lsd" }],
          documents: {},
          parsers: {},
        }),
        substance: "missing",
      }),
    ).rejects.toMatchObject({
      name: "ParseSourceCorpusError",
      code: "SUBSTANCE_NOT_FOUND",
      message: 'Substance "missing" not found',
    } satisfies Partial<ParseSourceCorpusError>);
  });

  it("skips known unsupported sources intentionally without failing the run", async () => {
    const warnings: string[] = [];

    const result = await parseSourceCorpus(
      createMemoryRunOptions({
        entries: [{ slug: "fixtureamine" }],
        documents: {
          fixtureamine: createSourceDocument("fixtureamine", [
            {
              id: "bluelight",
              fileName: "bluelight.md",
              displayName: "Bluelight",
              size: 100,
              tokens: 12,
            },
          ]),
        },
        parsers: {},
        reporter: {
          warning: (message) => warnings.push(message),
        },
      }),
    );

    expect(result.stats).toMatchObject({ total: 1, parsed: 1 });
    expect(result.substances.fixtureamine.sourcesCoverage).toEqual([]);
    expect(warnings).toEqual([
      "Skipping fixtureamine:bluelight; known unsupported source (Bluelight)",
    ]);
  });

  it("parses an alias source through the canonical parser and coverage identity", async () => {
    const warnings: string[] = [];
    const parser: SourceParser = {
      sourceId: "tripsit-factsheets",
      parse: () =>
        createParserResult({
          dosage: [
            {
              route: "Oral",
              source: "tripsit-factsheets",
              confidence: "high",
              ranges: { common: { min: 10, max: 20, unit: "mg" } },
            },
          ],
          sectionsExtracted: ["dosage"],
        }),
    };

    const result = await parseSourceCorpus({
      ...createMemoryRunOptions({
        entries: [{ slug: "fixtureamine" }],
        documents: {
          fixtureamine: createSourceDocument("fixtureamine", [
            {
              id: "TripSit",
              fileName: "tripsit.md",
              displayName: "Legacy TripSit Name",
              size: 100,
              tokens: 12,
            },
          ]),
        },
        parsers: {},
        reporter: {
          warning: (message) => warnings.push(message),
        },
      }),
      parserRegistry: {
        getParser: () => undefined,
        resolveSource(sourceId) {
          return {
            ...resolveParserSource(sourceId),
            parser,
          };
        },
      },
    });

    expect(warnings).toEqual([]);
    expect(result.substances.fixtureamine.dosage[0].source).toBe("tripsit-factsheets");
    expect(result.substances.fixtureamine.sourcesCoverage).toEqual([
      {
        sourceId: "tripsit-factsheets",
        displayName: "TripSit Factsheets",
        sectionsExtracted: ["dosage"],
        tokensOriginal: 12,
      },
    ]);
  });

  it("preserves manual legal edits after enrichment and recalculates interaction stats", async () => {
    const writeCalls: Array<{
      output: ParsedOutputShape;
      context: ParseSourceCorpusWriteContext;
    }> = [];

    const enrichedInteraction: ParsedInteraction = {
      substance: "MDMA",
      severity: "unsafe",
      source: "combo-fixture",
    };

    const result = await parseSourceCorpus(
      createMemoryRunOptions({
        entries: [{ slug: "lsd" }],
        documents: {
          lsd: createSourceDocument("lsd", [
            {
              id: "legal-fixture",
              fileName: "legal.md",
              displayName: "Legal Fixture",
              size: 100,
              tokens: 20,
            },
          ]),
        },
        parsers: {
          "legal-fixture": {
            sourceId: "legal-fixture",
            parse: () =>
              createParserResult({
                legal: [
                  {
                    country: "US",
                    status: "Schedule I",
                    source: "legal-fixture",
                  },
                ],
                sectionsExtracted: ["legal"],
              }),
          },
        },
        existingData: {
          lsd: {
            slug: "lsd",
            name: "LSD",
            dosage: [],
            duration: [],
            effects: [],
            interactions: [],
            legal: [
              {
                country: "US",
                status: "Manually reviewed",
                source: "editor",
                manuallyEdited: true,
              },
            ],
            internationalLaw: [],
            narrativeContent: {
              experienceReports: [],
              synthesis: [],
              qualitativeComments: [],
              generalNotes: [],
            },
            sourcesCoverage: [],
          } as unknown as ParsedSubstanceData,
        },
        enrichment: {
          enrich(substances) {
            substances.lsd.interactions = [enrichedInteraction];
            substances.lsd.sourcesCoverage = [
              ...substances.lsd.sourcesCoverage,
              {
                sourceId: "combo-fixture",
                displayName: "Combo Fixture",
                sectionsExtracted: ["interactions"],
                tokensOriginal: 0,
              },
            ];
            return {
              substancesEnriched: 1,
              interactionsAdded: 1,
              interactionsOverridden: 0,
              categoriesMapped: { lsd: 1 },
            };
          },
        },
        writeCalls,
      }),
    );

    expect(result.stats.withInteractions).toBe(1);
    expect(result.preservedManualLegalEntries).toBe(1);
    expect(result.substances.lsd.interactions).toEqual([enrichedInteraction]);
    expect(result.substances.lsd.legal).toEqual([
      {
        country: "US",
        status: "Manually reviewed",
        source: "editor",
        manuallyEdited: true,
      },
    ]);
    expect(writeCalls[0].context).toMatchObject({
      stats: expect.objectContaining({ withInteractions: 1 }),
      enrichmentStats: expect.objectContaining({ interactionsAdded: 1 }),
      preservedManualLegalEntries: 1,
    });
  });
});

describe("parse-sources CLI adapter", () => {
  it("maps command-line arguments into parseSourceCorpus options", async () => {
    const options = parseCliOptions([
      "--substance",
      "lsd",
      "--output",
      "tmp/parsed.json",
      "--verbose",
      "--stats",
    ]);

    expect(options).toMatchObject({
      substance: "lsd",
      output: "tmp/parsed.json",
      verbose: true,
      stats: true,
    });

    const invocations: ParseSourceCorpusOptions[] = [];
    await runParseSourcesCli(
      ["--substance", "lsd", "--output", "tmp/parsed.json"],
      async (runOptions) => {
        invocations.push(runOptions);
        return {} as Awaited<ReturnType<typeof parseSourceCorpus>>;
      },
    );

    expect(invocations).toHaveLength(1);
    expect(invocations[0].substance).toBe("lsd");
    expect(invocations[0].catalog).toBeTruthy();
    expect(invocations[0].parserRegistry).toBeTruthy();
    expect(invocations[0].enrichment).toBeTruthy();
    expect(invocations[0].persistence).toBeTruthy();
    expect(invocations[0].reporter).toBeTruthy();
  });
});
