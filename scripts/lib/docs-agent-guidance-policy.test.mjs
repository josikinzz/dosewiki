import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  validateAgentGuidanceAvoidsLiveLocalJsonEdits,
  validateCurrentGuidanceAvoidsRetiredRuntime,
  validateReadmeReactMajor,
  validateRootHasNoLooseSkillFiles,
} from "./docs-agent-guidance-policy.mjs";

const repoRoot = process.cwd();
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));

describe("docs and agent guidance policy", () => {
  it("keeps the README React major aligned with package.json", () => {
    expect(validateReadmeReactMajor(repoRoot, packageJson)).toEqual([]);
  });

  it("keeps current contributor docs off the retired Vite/static runtime", () => {
    expect(validateCurrentGuidanceAvoidsRetiredRuntime(repoRoot)).toEqual([]);
  });

  it("keeps ambiguous root skill files out of the active repository root", () => {
    expect(validateRootHasNoLooseSkillFiles(repoRoot)).toEqual([]);
  });

  it("keeps active agent guidance from directing live article fixes through local JSON edits", () => {
    expect(validateAgentGuidanceAvoidsLiveLocalJsonEdits(repoRoot)).toEqual([]);
  });
});
