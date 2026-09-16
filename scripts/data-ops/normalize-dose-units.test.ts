import type { DataClient } from "../lib/data-client.ts";
import { getFunctionName } from "../../lib/postgres/runtime/api.ts";
import { api } from "../../lib/postgres/runtime/api.ts";
import { validateArticleChange, type ArticleDocument } from "../../server/lib/articleLifecycleValidation";
import { contentHash } from "../../lib/proposals/contentHash";
import { describe, expect, it, vi } from "vitest";
import { normalizeNotesText, planDoseUnitEdits, runNormalizeDoseUnits } from "./normalize-dose-units";

const range = (unit: string) => ({ min: 1, max: 2, unit });

function article(slug = "alpha") {
  const route = (name: string) => ({
    route: name,
    bioavailability: "",
    bioavailability_notes: "",
    dose_ranges: {
      threshold: range("ug"),
      light: range("ug"),
      moderate: range("ug"),
      strong: range("ug"),
      heavy: range("ug"),
    },
    notes: "Reported at 10ug; drug names stay.",
    reference_ids: [],
  });
  return {
    id: 1,
    slug,
    title: slug,
    dosage: { routes: [route("oral"), route("sublingual")], plateau_dosing: null },
  };
}

const writeArgs = [
  "--write",
  "--confirm-dose-units",
  "--confirm-write=normalize-dose-units",
  "--expected-deployment=localhost/test-target",
];

function publicationHarness(planned = article(), latest = planned, conflictAfterRead = false) {
  const client = { query: vi.fn(), mutation: vi.fn(), action: vi.fn() } as DataClient;
  // Historical records may omit untouched sections; the lifecycle validates the changed dosage unit.
  let stored = structuredClone(latest) as unknown as ArticleDocument;
  const published: ArticleDocument[] = [];
  const auditUpdates: Record<string, unknown>[] = [];
  vi.spyOn(client, "query").mockImplementation(async (reference) => {
    const name = getFunctionName(reference);
    if (name === getFunctionName(api.substanceIndex.getLookupPage)) {
      return { page: [{ slug: planned.slug }], isDone: true, continueCursor: null };
    }
    if (name === getFunctionName(api.substanceIndex.getBySlug)) return structuredClone(planned);
    if (name === getFunctionName(api.articleLifecycle.get)) {
      const snapshot = { article: structuredClone(stored), baseHash: contentHash(stored) };
      if (conflictAfterRead) stored = { ...stored, title: "Changed after canonical read" };
      return snapshot;
    }
    throw new Error(`Unexpected query: ${name}`);
  });
  vi.spyOn(client, "mutation").mockImplementation(async (reference, args) => {
    if (getFunctionName(reference) !== getFunctionName(api.articleLifecycle.write)) {
      throw new Error("Only canonical publication is supported");
    }
    if (!auditUpdates.some((update) => update.status === "applying")) {
      throw new Error("Publication must be audited before sending");
    }
    if (args.baseHash !== contentHash(stored)) throw new Error("ARTICLE_CONFLICT");
    stored = validateArticleChange(stored, args.article);
    published.push(structuredClone(stored));
    return { status: "published" };
  });
  return {
    stored: () => stored,
    published,
    auditUpdates,
    dependencies: {
      env: {
        DATA_BACKEND: "postgres",
        TARGET_POSTGRES_URL: "postgresql://localhost/test-target",
        DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE: "test-scoped-token",
      } as unknown as NodeJS.ProcessEnv,
      createClient: () => client,
      logger: { log: vi.fn() },
      writeAudit: vi.fn(() => ({
        path: "in-memory-audit",
        entry: { timestamp: "", operation: "normalize-dose-units", intent: "editorArticleWrite", slug: null, mutations: [] },
      })),
      updateAudit: vi.fn((_path: string, updates: Record<string, unknown>) => {
        auditUpdates.push(structuredClone(updates));
        return updates;
      }),
    },
  };
}

describe("planDoseUnitEdits", () => {
  it("targets only ug/mcg unit fields and rewrites them to the micro sign", () => {
    const edits = planDoseUnitEdits([
      {
        slug: "1b-lsd",
        dosage: {
          routes: [
            {
              route: "oral",
              dose_ranges: {
                threshold: range("ug"),
                light: range("UG "),
                moderate: range("mcg"),
                strong: range("µg"),
                heavy: range("mg"),
              },
              notes: "",
            },
          ],
        },
      },
    ]);
    expect(edits.map((edit) => [edit.path, edit.after])).toEqual([
      ["dosage.routes[0].dose_ranges.threshold", "µg"],
      ["dosage.routes[0].dose_ranges.light", "µg"],
      ["dosage.routes[0].dose_ranges.moderate", "µg"],
    ]);
    expect(edits.every((edit) => edit.kind === "unit")).toBe(true);
  });

  it("rewrites number-anchored tokens in route notes and nothing else", () => {
    const edits = planDoseUnitEdits([
      {
        slug: "25c-nbome",
        dosage: {
          routes: [
            { dose_ranges: {}, notes: "documented at 4 mg (4000 ug). This drug is potent; 100-200ug reported." },
          ],
        },
      },
    ]);
    expect(edits).toHaveLength(1);
    expect(edits[0]?.kind).toBe("notes");
    expect(edits[0]?.after).toBe("documented at 4 mg (4000 µg). This drug is potent; 100-200 µg reported.");
  });

  it("returns nothing for clean articles", () => {
    expect(
      planDoseUnitEdits([
        { slug: "clean", dosage: { routes: [{ dose_ranges: { light: range("µg"), heavy: range("mg") }, notes: "a drug of note" }] } },
        { slug: "no-dosage" },
      ]),
    ).toEqual([]);
  });
});

describe("runNormalizeDoseUnits", () => {
  it("plans every lookup page without publishing or creating an audit in a dry run", async () => {
    const client = { query: vi.fn(), mutation: vi.fn(), action: vi.fn() } as DataClient;
    vi.spyOn(client, "query")
      .mockResolvedValueOnce({ page: [{ slug: "alpha" }], isDone: false, continueCursor: "page-2" })
      .mockResolvedValueOnce({ page: [{ slug: "beta" }], isDone: true, continueCursor: null })
      .mockResolvedValueOnce(article("alpha"))
      .mockResolvedValueOnce(article("beta"));
    const mutation = vi.spyOn(client, "mutation").mockRejectedValue(new Error("Dry run must not publish"));
    const writeAudit = vi.fn();
    const result = await runNormalizeDoseUnits([], {
      env: { DATA_BACKEND: "postgres", POSTGRES_POOLED_URL: "postgresql://localhost/test-source" } as unknown as NodeJS.ProcessEnv,
      createClient: () => client,
      logger: { log: vi.fn() },
      writeAudit,
    });

    expect([...new Set(result.edits.map((edit) => edit.slug))]).toEqual(["alpha", "beta"]);
    expect(mutation).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("publishes every tier and note together while retaining the latest unrelated content", async () => {
    const planned = article();
    const latest = { ...planned, title: "Concurrently corrected title" };
    const harness = publicationHarness(planned, latest);
    const result = await runNormalizeDoseUnits(writeArgs, harness.dependencies);

    expect(harness.published).toHaveLength(1);
    expect(harness.stored()).toEqual({
      ...latest,
      dosage: {
        ...latest.dosage,
        routes: latest.dosage.routes.map((route) => ({
          ...route,
          notes: "Reported at 10 µg; drug names stay.",
          dose_ranges: Object.fromEntries(Object.entries(route.dose_ranges).map(([tier, value]) => [
            tier, { ...value, unit: "µg" },
          ])),
        })),
      },
    });
    expect(result.edits).toHaveLength(12);
    expect(result.auditLogPath).toBe("in-memory-audit");
    expect(harness.auditUpdates[harness.auditUpdates.length - 1]).toMatchObject({ status: "completed" });
    expect(JSON.stringify(harness.auditUpdates)).not.toContain("test-scoped-token");
  });

  it("refuses changed dose bounds without publishing any part of the plan", async () => {
    const planned = article();
    const latest = article();
    latest.dosage.routes[0].dose_ranges.light.max = 3;
    const harness = publicationHarness(planned, latest);

    await expect(runNormalizeDoseUnits(writeArgs, harness.dependencies)).rejects.toThrow("Stale dose-unit plan");
    expect(harness.published).toEqual([]);
    expect(harness.stored()).toEqual(latest);
    expect(harness.auditUpdates[harness.auditUpdates.length - 1]).toMatchObject({ status: "failed", completed: 0 });
  });

  it("refuses reordered routes even when their planned tier values are identical", async () => {
    const planned = article();
    const latest = article();
    latest.dosage.routes.reverse();
    const harness = publicationHarness(planned, latest);

    await expect(runNormalizeDoseUnits(writeArgs, harness.dependencies)).rejects.toThrow("routes were reordered");
    expect(harness.published).toEqual([]);
    expect(harness.stored()).toEqual(latest);
  });

  it("leaves a concurrent post-read edit intact when canonical publication rejects the revision", async () => {
    const planned = article();
    const harness = publicationHarness(planned, planned, true);

    await expect(runNormalizeDoseUnits(writeArgs, harness.dependencies)).rejects.toThrow("ARTICLE_CONFLICT");
    expect(harness.published).toEqual([]);
    expect(harness.stored()).toEqual({ ...planned, title: "Changed after canonical read" });
    expect(harness.auditUpdates[harness.auditUpdates.length - 1]).toMatchObject({ status: "failed", completed: 0 });
  });

  it("retains the exact baseline and stable operation identity in an audit before publication", async () => {
    const first = publicationHarness(article());
    const second = publicationHarness(article());
    await runNormalizeDoseUnits(writeArgs, first.dependencies);
    await runNormalizeDoseUnits(writeArgs, second.dependencies);

    expect(first.auditUpdates[0]).toEqual(second.auditUpdates[0]);
    expect(first.auditUpdates[0]).toMatchObject({
      status: "applying",
      operations: [{
        baseHash: contentHash(article()),
        changeId: expect.stringMatching(/^normalize-dose-units:[a-f0-9]{64}$/),
      }],
    });
  });

  it("blocks publication when the destructive confirmation is missing", async () => {
    const harness = publicationHarness(article());
    await expect(runNormalizeDoseUnits(writeArgs.filter((arg) => arg !== "--confirm-dose-units"), harness.dependencies))
      .rejects.toThrow("requires --confirm-dose-units");
    expect(harness.published).toEqual([]);
    expect(harness.auditUpdates).toEqual([]);
  });

  it("never publishes with an explicit dry-run flag even when write flags are present", async () => {
    const harness = publicationHarness(article());
    await expect(runNormalizeDoseUnits([...writeArgs, "--dry-run"], harness.dependencies))
      .rejects.toThrow("dry-run mode");
    expect(harness.published).toEqual([]);
    expect(harness.auditUpdates).toEqual([]);
  });
});

describe("normalizeNotesText", () => {
  it("never touches words containing ug", () => {
    const text = "drugs, jugs, and plugs stay; 10ug and 25 mcg change";
    expect(normalizeNotesText(text)).toBe("drugs, jugs, and plugs stay; 10 µg and 25 µg change");
  });
});
