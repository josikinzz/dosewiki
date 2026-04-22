import { afterEach, describe, expect, it, vi } from "vitest";

import { parseArgsFromArgv, getSourceUrl, getTargetUrl } from "../scripts/batch/summary/cli.mjs";
import { CONFIG, INPUT_BOUNDS } from "../scripts/batch/summary/config.mjs";
import { parseGeneratedSummary } from "../scripts/batch/summary/parsing.mjs";
import { processAll } from "../scripts/batch/summary/pipeline.mjs";
import { resolveSourceMaterial } from "../scripts/batch/summary/source-material.mjs";

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

  it("prefers explicit URLs, then read URL fallbacks, and defaults target to source", () => {
    const env = {
      SOURCE_CONVEX_URL: "https://source.example",
      CONVEX_PUBLIC_READ_URL: "https://public.example",
      CONVEX_URL: "https://convex.example",
      TARGET_CONVEX_URL: "https://target.example",
    };

    expect(
      getSourceUrl({ sourceUrl: "https://explicit.example" }, env),
    ).toBe("https://explicit.example");
    expect(getSourceUrl({ sourceUrl: null }, env)).toBe("https://source.example");
    expect(getTargetUrl({ targetUrl: null }, "https://fallback.example", env)).toBe(
      "https://target.example",
    );
    expect(getTargetUrl({ targetUrl: null }, "https://fallback.example", {})).toBe(
      "https://fallback.example",
    );
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
