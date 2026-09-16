import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  assertLocalOnlyCampaignArguments,
  chooseCampaignRunId,
  inspectRunStage,
  localCampaignEnvironment,
} from "./local-subsection-campaign.mjs";
import { resolvePostgresSource, resolvePostgresTarget } from "../lib/data-client.ts";

const terminalSections = {
  summary: { status: "checked" },
  pharmacology: { status: "not_selected" },
  tolerance: { status: "not_selected" },
  harm_potential: { status: "not_selected" },
  history_culture: { status: "not_selected" },
  legality: { status: "not_selected" },
};

function manifest(overrides = {}) {
  return {
    outcome: "prepared",
    sections: terminalSections,
    gates: {
      remap: { result: "passed" },
      section_rechecks: { result: "passed" },
      proactive_scan: { result: "passed" },
      article_wide_packet: { result: "passed" },
      article_wide_sanitize: { result: "passed" },
      article_wide_residue_scan: { result: "passed" },
    },
    ...overrides,
  };
}

describe("local subsection campaign hardening", () => {
  it("treats a process-independent finalized manifest as the only success state", () => {
    expect(inspectRunStage({ manifest: null })).toEqual({ stage: "initialize", reason: "manifest_missing" });
    expect(inspectRunStage({ manifest: manifest(), runFiles: { articleWide: false } }).stage).toBe("article_wide");
    expect(inspectRunStage({
      manifest: manifest({ outcome: "needs_review", finalizedAt: "2026-01-01T00:00:00Z" }),
      runFiles: { articleWide: true },
    }).stage).toBe("finalized");
  });




  it("rejects every production or apply argument", () => {
    expect(() => assertLocalOnlyCampaignArguments(["--slug=example", "--write"]))
      .toThrow(/rejects production\/apply arguments/);
    expect(() => assertLocalOnlyCampaignArguments(["--confirm-citation-write"]))
      .toThrow(/rejects production\/apply arguments/);
    expect(() => assertLocalOnlyCampaignArguments(["--slug=example", "--source-url=postgres://example/dosewiki"]))
      .not.toThrow();
  });

  it("isolates child database selection without losing the explicit source or remote confirmation", () => {
    const sourceUrl = "postgres://reader:p%3Dsecret@source.example/dosewiki?sslmode=require";
    const env = localCampaignEnvironment(sourceUrl, {
      DATA_BACKEND: "postgres",
      SOURCE_POSTGRES_URL: "postgres://stale/other",
      TARGET_POSTGRES_URL: "postgres://writer/production",
      POSTGRES_POOLED_URL: "postgres://pool/production",
      POSTGRES_DIRECT_URL: "postgres://direct/production",
      POSTGRES_IMPORT_CONFIRM: "source.example",
      DATA_WRITES_FROZEN: "1",
    });
    expect(resolvePostgresSource({ argv: [], env }).url).toBe(sourceUrl);
    expect(resolvePostgresTarget({ argv: [], env }).url).toBeNull();
    expect(env.POSTGRES_IMPORT_CONFIRM).toBe("source.example");
    expect(env.DATA_WRITES_FROZEN).toBe("1");
  });

  it("protects finalized slug runs with a distinct successor while preserving researching identity", () => {
    const workbench = mkdtempSync(resolve(tmpdir(), "citation-campaign-run-id-"));
    const base = resolve(workbench, "runs/example");
    mkdirSync(base, { recursive: true });
    writeFileSync(resolve(base, "pi-run-manifest.json"), JSON.stringify({ outcome: "needs_review", finalizedAt: "2026-01-01T00:00:00Z" }));
    expect(chooseCampaignRunId({ workbench, slug: "example", rows: [{ status: "ready" }] })).toBe("example-local-1");
    expect(chooseCampaignRunId({ workbench, slug: "example", rows: [{ status: "researching", runId: "example-repair" }] })).toBe("example-repair");
    expect(chooseCampaignRunId({
      workbench,
      slug: "example",
      rows: [{ status: "ready" }],
      preferredRunId: "example-second-pass-1",
    })).toBe("example-second-pass-1");
  });

  it("reports reconciliation and downstream recovery without restarting sections", () => {
    const reconciliation = manifest({ gates: { remap: { result: "passed" }, section_rechecks: { result: "failed" } } });
    expect(inspectRunStage({ manifest: reconciliation, runFiles: {} })).toEqual({ stage: "reconciliation", reason: "section_rechecks" });

    const downstream = manifest({
      gates: {
        ...manifest().gates,
        article_wide_check: { result: "passed" },
        assemble_draft: { result: "passed" },
        validate: { result: "failed" },
      },
    });
    expect(inspectRunStage({ manifest: downstream, runFiles: { articleWide: true } }))
      .toEqual({ stage: "downstream", reason: "validate" });
  });
});
