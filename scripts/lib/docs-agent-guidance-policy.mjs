import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const currentGuidanceDocs = [
  "README.md",
  "ARCHITECTURE.md",
  "AGENTS.md",
  "CONTRIBUTING.md",
  "docs/README.md",
  "docs/architecture/project-layout.md",
  "docs/architecture/runtime-and-data.md",
  "docs/architecture/operations-and-direction.md",
  "docs/design/visual-style-guide.md",
  "docs/design/font-swap-howto.md",
];

const agentGuidanceDocs = ["AGENTS.md"];

const retiredRuntimeCurrentDocPatterns = [
  { label: "retired Vite runtime", pattern: /\b(?:Vite dev server|React \+ Vite|Client-side React application delivered by Vite)\b/i },
  { label: "retired inline build", pattern: /\b(?:npm run build:inline|build:inline)\b/ },
  { label: "retired Vite entrypoint", pattern: /\bsrc\/(?:main|App)\.tsx\b/ },
  { label: "retired static routing", pattern: /\b(?:hash-based navigation|hash router|#\/route|static bundle backed by JSON)\b/i },
];

const liveLocalJsonEditPatterns = [
  { label: "direct local article lookup", pattern: /\bFind the article in `?src\/data\/SubstanceIndex\.json`?/i },
  { label: "direct local article edit", pattern: /\bEdit `?src\/data\/SubstanceIndex\.json`?/i },
  { label: "copy generated article JSON locally", pattern: /\bCopy the JSON into .*`?src\/data\/SubstanceIndex\.json`?/i },
  { label: "local JSON as primary modified article data", pattern: /\| `src\/data\/SubstanceIndex\.json` \| Primary article data \(modified\) \|/i },
  { label: "batch output mutates local JSON", pattern: /\b(?:updates|updated with|saves to|saved to) SubstanceIndex\.json\b/i },
];

function readIfExists(repoRoot, relativePath) {
  const absolutePath = resolve(repoRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : null;
}

function lineNumberFor(content, index) {
  return content.slice(0, index).split("\n").length;
}

function collectPatternFailures({ content, docPath, patterns }) {
  const failures = [];

  for (const { label, pattern } of patterns) {
    const match = pattern.exec(content);
    if (match) {
      failures.push(`${docPath}:${lineNumberFor(content, match.index)} advertises ${label}`);
    }
  }

  return failures;
}

function packageMajorVersion(packageJson, dependencyName) {
  const rawVersion = packageJson.dependencies?.[dependencyName] ?? packageJson.devDependencies?.[dependencyName];
  const major = rawVersion?.match(/\d+/)?.[0];
  return major ? Number(major) : null;
}

export function validateReadmeReactMajor(repoRoot, packageJson) {
  const readme = readIfExists(repoRoot, "README.md") ?? "";
  const reactMajor = packageMajorVersion(packageJson, "react");
  if (!reactMajor) {
    return ["package.json: missing react dependency"];
  }

  return readme.includes(`React ${reactMajor}`)
    ? []
    : [`README.md: frontend stack must say React ${reactMajor} to match package.json`];
}

export function validateCurrentGuidanceAvoidsRetiredRuntime(repoRoot, docPaths = currentGuidanceDocs) {
  const failures = [];

  for (const docPath of docPaths) {
    const content = readIfExists(repoRoot, docPath);
    if (content === null) {
      failures.push(`${docPath}: missing current guidance document`);
      continue;
    }

    failures.push(...collectPatternFailures({
      content,
      docPath,
      patterns: retiredRuntimeCurrentDocPatterns,
    }));
  }

  return failures;
}

export function validateRootHasNoLooseSkillFiles(repoRoot) {
  return readdirSync(repoRoot)
    .filter((entry) => /^SKILL\b.*\.md$/i.test(entry))
    .map((entry) => `${entry}: root skill files are ambiguous; agent skills stay in private tooling directories outside the tree`);
}

export function validateAgentGuidanceAvoidsLiveLocalJsonEdits(repoRoot) {
  const failures = [];

  for (const docPath of agentGuidanceDocs) {
    const content = readIfExists(repoRoot, docPath);
    if (content === null) {
      continue;
    }

    const firstLines = content.split("\n").slice(0, 12).join("\n");
    if (/retired|tombstone|not current app/i.test(firstLines)) {
      continue;
    }

    failures.push(...collectPatternFailures({
      content,
      docPath,
      patterns: liveLocalJsonEditPatterns,
    }));
  }

  return failures.sort();
}
