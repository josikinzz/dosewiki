import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { createBatchTargetRunContext } from "../scripts/batch/lib/batch-targets.mjs";
import { parseArgsFromArgv } from "../scripts/batch/summary/cli.mjs";
import { CONFIG, INPUT_BOUNDS } from "../scripts/batch/summary/config.mjs";
import { parseGeneratedSummary } from "../scripts/batch/summary/parsing.mjs";
import { applySummaryUpdate, processAll } from "../scripts/batch/summary/pipeline.mjs";
import { resolveSourceMaterial } from "../scripts/batch/summary/source-material.mjs";
import {
  buildGenericSourceSections,
  createDryRunResultFromSourceMaterial,
  resolveLocalSourceFileMaterial,
  resolveQuoteSourceMaterial,
} from "../scripts/batch/lib/source-material-resolver.mjs";
import {
  appendResult,
  createArticlePersistence,
  createRunArtifacts,
  updateProgress,
  writeBackup,
  writeFatalProgress,
} from "../scripts/batch/lib/persistence-artifacts.mjs";

const VALID_SUMMARY =
  "This compound is a serotonergic psychedelic with stimulating, visual, and cognitive effects that often begin gradually, intensify over several hours, and taper slowly. Reports commonly describe sensory enhancement, altered thought patterns, emotional amplification, and variable physical stimulation depending on dose, context, and individual sensitivity.";

const ARTICLE = {
  title: "LSD",
  slug: "lsd",
  classification: {
    psychoactive_class: ["psychedelic"],
    chemical_class: ["lysergamide"],
  },
};

describe("summary batch CLI", () => {
  it("parses CLI flags and clamps bounded values", () => {
    const options = parseArgsFromArgv(
      [
        "--concurrency=99",
        "--limit=0",
        "--slugs=lsd, dmt , , mescaline",
        "--dry-run",
        "--reasoning-effort=medium",
      ],
      CONFIG,
      INPUT_BOUNDS,
    );

    expect(options.concurrency).toBe(INPUT_BOUNDS.concurrency.max);
    expect(options.limit).toBe(INPUT_BOUNDS.limit.min);
    expect(options.slugs).toEqual(["lsd", "dmt", "mescaline"]);
    expect(options.dryRun).toBe(true);
    expect(options.reasoningEffort).toBe("medium");
  });

  it("uses explicit source and target flags ahead of configured targets", () => {
    const env = {
      DATA_BACKEND: "postgres",
      SOURCE_POSTGRES_URL: "postgresql://localhost/source",
      POSTGRES_POOLED_URL: "postgresql://localhost/default",
      TARGET_POSTGRES_URL: "postgresql://localhost/target",
    };

    const context = createBatchTargetRunContext({
      operation: "summary batch test",
      argv: [
        "--source-url=postgresql://localhost/explicit-source",
        "--target=postgresql://localhost/explicit-target",
      ],
      env,
      loadsEnvLocal: false,
    });

    expect(context.sourceUrl).toBe("postgresql://localhost/explicit-source");
    expect(context.targetUrl).toBe("postgresql://localhost/explicit-target");
  });
});

describe("summary source material resolution", () => {
  it("prefers summary quotes when both quote and generic source coverage exist", async () => {
    const loadSummaryQuoteForSlug = vi.fn(async () => ({ content: "Quoted summary evidence." }));
    const loadArticleSourcesForSlug = vi.fn(async () => ({
      sources: [{ id: "erowid", displayName: "Erowid" }],
      contents: { erowid: "Fallback source content." },
    }));

    const result = await resolveSourceMaterial({
      article: ARTICLE,
      availability: {
        summaryQuoteSlugs: new Set(["lsd"]),
        articleSourceSlugs: new Set(["lsd"]),
      },
      loadSummaryQuoteForSlug,
      loadArticleSourcesForSlug,
    });

    expect(result.status).toBe("ready");
    expect(result.materialType).toBe("quotes");
    expect(result.userMessage).toContain("Quoted summary evidence.");
    expect(loadSummaryQuoteForSlug).toHaveBeenCalledWith("lsd");
    expect(loadArticleSourcesForSlug).not.toHaveBeenCalled();
  });

  it("keeps the current no-fallback behavior when a summary quote doc is empty", async () => {
    const loadSummaryQuoteForSlug = vi.fn(async () => ({ content: "   " }));
    const loadArticleSourcesForSlug = vi.fn(async () => ({
      sources: [{ id: "erowid", displayName: "Erowid" }],
      contents: { erowid: "Fallback source content." },
    }));

    const result = await resolveSourceMaterial({
      article: ARTICLE,
      availability: {
        summaryQuoteSlugs: new Set(["lsd"]),
        articleSourceSlugs: new Set(["lsd"]),
      },
      loadSummaryQuoteForSlug,
      loadArticleSourcesForSlug,
    });

    expect(result).toEqual({
      slug: "lsd",
      status: "skipped",
      reason: "Summary quote doc exists but has no content",
    });
    expect(loadArticleSourcesForSlug).not.toHaveBeenCalled();
  });

  it("falls back to generic article sources when summary quotes are unavailable", async () => {
    const result = await resolveSourceMaterial({
      article: ARTICLE,
      availability: {
        summaryQuoteSlugs: new Set(),
        articleSourceSlugs: new Set(["lsd"]),
      },
      loadSummaryQuoteForSlug: vi.fn(),
      loadArticleSourcesForSlug: vi.fn(async () => ({
        sources: [{ id: "erowid", displayName: "Erowid" }],
        contents: { erowid: "Fallback source content." },
      })),
    });

    expect(result.status).toBe("ready");
    expect(result.materialType).toBe("generic_sources");
    expect(result.userMessage).toContain("Fallback source content.");
  });

  it("reports missing source docs before loading material", async () => {
    const result = await resolveSourceMaterial({
      article: ARTICLE,
      availability: {
        summaryQuoteSlugs: new Set(),
        articleSourceSlugs: new Set(),
      },
      loadSummaryQuoteForSlug: vi.fn(),
      loadArticleSourcesForSlug: vi.fn(),
    });

    expect(result).toEqual({
      slug: "lsd",
      status: "skipped",
      reason: "No summary quote doc or articleSources doc in source Postgres",
    });
  });
});

describe("shared source material resolver", () => {
  it("normalizes quote-backed ready and would-skip dry-run results", async () => {
    const ready = await resolveQuoteSourceMaterial({
      slug: "lsd",
      loadQuotes: vi.fn(async () => "Quoted material"),
      buildUserMessage: (quotes) => `Message: ${quotes}`,
      missingReason: "No quotes",
    });
    const skipped = await resolveQuoteSourceMaterial({
      slug: "dmt",
      loadQuotes: vi.fn(async () => null),
      buildUserMessage: (quotes) => `Message: ${quotes}`,
      missingReason: "No quotes",
    });

    expect(ready).toMatchObject({
      slug: "lsd",
      status: "ready",
      materialType: "quotes",
      userMessage: "Message: Quoted material",
    });
    expect(createDryRunResultFromSourceMaterial(ready, "LSD")).toMatchObject({
      status: "dry-run",
      sourceMaterial: "quotes",
      reason: null,
    });
    expect(createDryRunResultFromSourceMaterial(skipped, "DMT")).toMatchObject({
      status: "would-skip",
      reason: "No quotes",
    });
  });

  it("normalizes local source files and missing or empty source files", () => {
    const loadSourceFile = vi.fn((slug) => {
      if (slug === "missing") return null;
      if (slug === "empty") return { substanceName: "Empty", sources: [], contents: {} };
      return {
        substanceName: "Fixtureamine",
        sources: [{ id: "erowid", displayName: "Erowid" }],
        contents: { erowid: "Allowed text" },
      };
    });

    expect(
      resolveLocalSourceFileMaterial({
        slug: "fixtureamine",
        loadSourceFile,
        buildUserMessage: (sourceData) => sourceData.contents.erowid,
      }),
    ).toMatchObject({
      status: "ready",
      materialType: "local_source_file",
      userMessage: "Allowed text",
    });
    expect(
      resolveLocalSourceFileMaterial({
        slug: "missing",
        loadSourceFile,
        buildUserMessage: vi.fn(),
      }),
    ).toMatchObject({ status: "skipped", reason: "No source file" });
    expect(
      resolveLocalSourceFileMaterial({
        slug: "empty",
        loadSourceFile,
        buildUserMessage: vi.fn(),
      }),
    ).toMatchObject({ status: "skipped", reason: "No sources in file" });
  });

  it("truncates generic source sections using shared policy", () => {
    const { sections, truncatedSources } = buildGenericSourceSections(
      {
        sources: [{ id: "erowid", displayName: "Erowid" }],
        contents: { erowid: "abcdefghijklmnopqrstuvwxyz" },
      },
      { maxGenericSourceChars: 10, maxCharsPerSource: 10 },
    );

    expect(truncatedSources).toBe(1);
    expect(sections[0]).toContain("abcdefghij");
    expect(sections[0]).toContain("[Source content truncated for batch generation]");
  });
});

describe("summary YAML parsing", () => {
  it("repairs simple quoted YAML scalars and validates the summary string", () => {
    const debugWriter = vi.fn();
    const result = parseGeneratedSummary(`\`\`\`yaml\nsummary: "${VALID_SUMMARY}\n\`\`\``, null, debugWriter);

    expect(result).toBe(VALID_SUMMARY);
    expect(debugWriter).not.toHaveBeenCalled();
  });

  it("rejects source-meta commentary in generated summaries", () => {
    expect(() =>
      parseGeneratedSummary(
        "summary: Based on the provided sources, the compound produces vivid sensory changes, emotional amplification, altered thought patterns, visual distortions, time dilation, and a long arc of changing intensity that begins gradually, peaks strongly, and resolves slowly across the full experience.",
        null,
        vi.fn(),
      ),
    ).toThrow("Summary contains source-meta commentary");
  });
});

describe("summary batch pipeline", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not persist writes during dry runs", async () => {
    const persistSuccessfulUpdate = vi.fn();
    const processArticleForEntry = vi.fn();
    const writeProgress = vi.fn();
    const appendRunResult = vi.fn();
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const results = await processAll({
      articles: [
        ARTICLE,
        { ...ARTICLE, title: "DMT", slug: "dmt" },
      ],
      availability: {
        summaryQuoteSlugs: new Set(["lsd"]),
        articleSourceSlugs: new Set(),
      },
      options: {
        concurrency: 1,
        verbose: false,
        dryRun: true,
      },
      runArtifacts: {
        runId: "test-run",
        sourceUrl: "https://source.example",
        targetUrl: "https://target.example",
        resultsPath: "/tmp/results.jsonl",
        backupPath: "/tmp/backup.json",
      },
      loadSummaryQuoteForSlug: vi.fn(async () => ({ content: "Summary quote material." })),
      loadArticleSourcesForSlug: vi.fn(async () => null),
      processArticleForEntry,
      persistSuccessfulUpdate,
      writeProgress,
      appendRunResult,
      log: vi.fn(),
      errorLog: vi.fn(),
    });

    expect(results).toMatchObject({
      completed: 1,
      skipped: 1,
      failed: 0,
    });
    expect(processArticleForEntry).not.toHaveBeenCalled();
    expect(persistSuccessfulUpdate).not.toHaveBeenCalled();
    expect(writeProgress).toHaveBeenCalledTimes(4);
    expect(appendRunResult).toHaveBeenCalledTimes(1);
    expect(stdoutSpy).toHaveBeenCalled();
  });
});

describe("batch persistence artifacts", () => {
  it("writes backup documents, progress lifecycle, JSONL results, and fatal status", () => {
    const dir = mkdtempSync(join(tmpdir(), "dose-batch-"));
    const runArtifacts = createRunArtifacts(
      { concurrency: 2, all: true, dryRun: false, reasoningEffort: "medium" },
      "postgresql://operator:source-secret@localhost/source",
      "postgresql://operator:target-secret@localhost/target",
      {
        model: "test-model",
        progressDir: dir,
        backupDir: dir,
        debugDir: dir,
      },
      "test-run",
    );

    const targetArticlesBySlug = new Map([["lsd", { title: "LSD", slug: "lsd", summary: "old" }]]);
    const backupPath = writeBackup({
      runArtifacts,
      articles: [ARTICLE],
      targetArticlesBySlug,
      sourceUrl: "postgresql://operator:source-secret@localhost/source",
      targetUrl: "postgresql://operator:target-secret@localhost/target",
    });
    updateProgress(runArtifacts, { runId: runArtifacts.runId, status: "running", completed: 0 });
    appendResult(runArtifacts, { slug: "lsd", status: "success" });
    writeFatalProgress(runArtifacts, new Error("boom"));

    const backup = JSON.parse(readFileSync(backupPath!, "utf8"));
    expect(backup).toMatchObject({
      sourceIdentity: "localhost/source",
      targetIdentity: "localhost/target",
      count: 1,
      articles: [{ slug: "lsd", summary: "old" }],
    });
    expect(readFileSync(backupPath!, "utf8")).not.toMatch(/source-secret|target-secret|postgresql:\/\//);
    expect(readFileSync(runArtifacts.resultsPath, "utf8").trim()).toBe(
      JSON.stringify({ slug: "lsd", status: "success" }),
    );
    expect(JSON.parse(readFileSync(runArtifacts.progressPath, "utf8"))).toMatchObject({
      status: "fatal_error",
      error: "boom",
    });
  });

  it("persists sanitized payloads without implicitly updating local JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dose-batch-"));
    const articlesFile = join(dir, "SubstanceIndex.json");
    const postgresClient = { mutation: vi.fn(async (..._args: unknown[]) => ({ updated: 1 })) };
    const localArticles = [{ title: "LSD", slug: "lsd" }];
    const persist = createArticlePersistence({
      postgresClient,
      adminKey: "admin",
      sourceArticlesBySlug: new Map([
        ["lsd", { title: "LSD", slug: "lsd", "β_notes": "kept" }],
      ]),
      targetArticlesBySlug: new Map(),
      localArticles,
      articlesFile,
      updateLocalJson: false,
      applyUpdate: applySummaryUpdate,
    });

    await persist({ title: "LSD", slug: "lsd", summary: "new summary" });

    const [, payload] = postgresClient.mutation.mock.calls[0] as [
      unknown,
      { apiKey: string; articles: Array<Record<string, unknown>> },
    ];
    expect(payload?.articles[0]).not.toHaveProperty("β_notes");
    expect(payload?.articles[0]).not.toHaveProperty("beta_notes");
    expect(() => readFileSync(articlesFile, "utf8")).toThrow();

    expect(() =>
      createArticlePersistence({
        postgresClient,
        adminKey: "admin",
        sourceArticlesBySlug: new Map([
          ["lsd", { title: "LSD", slug: "lsd" }],
        ]),
        targetArticlesBySlug: new Map(),
        localArticles,
        articlesFile,
        updateLocalJson: true,
        applyUpdate: applySummaryUpdate,
      }),
    ).toThrow(/separate local export refresh/i);
  });
});
