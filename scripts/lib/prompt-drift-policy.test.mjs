import { describe, expect, it } from "vitest";

import {
  META_COMMENTARY_RULE,
  PROMPT_DRIFT_STATUS,
  collectDataPromptInventory,
  collectLocalPromptInventory,
  comparePromptInventories,
  sectionFileToPromptKey,
} from "./prompt-drift-policy.mjs";

function prompt(key, content, extras = {}) {
  return {
    key,
    kind: key === "generator" ? "generator" : "section",
    content,
    ...extras,
  };
}

function statusByKey(drift) {
  return Object.fromEntries(drift.map((entry) => [entry.key, entry.status]));
}

describe("prompt drift policy", () => {
  it("normalizes section prompt filenames into Postgres prompt keys", () => {
    expect(sectionFileToPromptKey("base.md")).toBe("section_base");
    expect(sectionFileToPromptKey("harmPotential.md")).toBe("section_harm_potential");
    expect(sectionFileToPromptKey("dosageDuration.md")).toBe("section_dosage_duration");
  });

  it("classifies identical, local-only, Postgres-only, generator, and section prompt drift", () => {
    const source = new Map([
      ["generator", prompt("generator", "same")],
      ["section_base", prompt("section_base", "local only")],
      ["section_summary", prompt("section_summary", "same")],
    ]);
    const target = collectDataPromptInventory([
      { key: "generator", content: "same", updatedAt: "2026-04-27T00:00:00.000Z" },
      { key: "section_summary", content: "same", updatedAt: "2026-04-27T00:00:00.000Z" },
      { key: "section_harm_potential", content: "target only", updatedAt: "2026-04-27T00:00:00.000Z" },
      { key: "runtime_experiment", content: "ignored", updatedAt: "2026-04-27T00:00:00.000Z" },
    ]);

    expect(statusByKey(comparePromptInventories(source, target))).toEqual({
      generator: PROMPT_DRIFT_STATUS.IDENTICAL,
      section_base: PROMPT_DRIFT_STATUS.MISSING_IN_TARGET,
      section_harm_potential: PROMPT_DRIFT_STATUS.MISSING_IN_SOURCE,
      section_summary: PROMPT_DRIFT_STATUS.IDENTICAL,
    });
  });

  it("classifies changed content separately from named policy differences", () => {
    const source = new Map([
      ["section_base", prompt("section_base", "local body")],
    ]);
    const target = new Map([
      ["section_base", prompt("section_base", "data body", { updatedAt: "2026-04-27T00:00:00.000Z" })],
    ]);

    const [result] = comparePromptInventories(source, target);

    expect(result.status).toBe(PROMPT_DRIFT_STATUS.CONTENT_DIFFERENT);
    expect(result.recommendation).toBe("review-required");
  });

  it("classifies the meta-commentary addition as a safe policy difference", () => {
    const base = "Use sources carefully.\n";
    const source = new Map([
      ["section_summary", prompt("section_summary", `${base}${META_COMMENTARY_RULE}\n`)],
    ]);
    const target = new Map([
      ["section_summary", prompt("section_summary", base, { updatedAt: "2026-04-27T00:00:00.000Z" })],
    ]);

    const [result] = comparePromptInventories(source, target);

    expect(result.status).toBe(PROMPT_DRIFT_STATUS.SAFE_POLICY_DIFFERENCE);
    expect(result.policy).toBe("meta-commentary-rule-added-locally");
  });

  it("classifies the target-only meta-commentary rule as review-required", () => {
    const base = "Use sources carefully.\n";
    const source = new Map([
      ["section_summary", prompt("section_summary", base)],
    ]);
    const target = new Map([
      ["section_summary", prompt("section_summary", `${base}${META_COMMENTARY_RULE}\n`, { updatedAt: "2026-04-27T00:00:00.000Z" })],
    ]);

    const [result] = comparePromptInventories(source, target);

    expect(result.status).toBe(PROMPT_DRIFT_STATUS.REVIEW_REQUIRED);
    expect(result.policy).toBe("meta-commentary-rule-missing-locally");
  });

  it("refuses generator migration when a required section contract is missing", () => {
    expect(() => collectLocalPromptInventory({
      rootDir: "/repo",
      readFile: (filePath) => {
        if (filePath.endsWith("/generator.md")) return "## Core Principles\nEvidence only.";
        throw new Error("Missing section contract");
      },
      onError: () => {},
    })).toThrow(/Generator composition requires/);
  });

  it("includes generator prompt drift in compare results", () => {
    const source = new Map([
      ["generator", prompt("generator", "local generator")],
    ]);
    const target = collectDataPromptInventory([
      { key: "generator", content: "data generator", updatedAt: "2026-04-27T00:00:00.000Z" },
    ]);

    expect(comparePromptInventories(source, target)).toMatchObject([
      {
        key: "generator",
        status: PROMPT_DRIFT_STATUS.CONTENT_DIFFERENT,
      },
    ]);
  });
});
