import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_POLICY_PATH = "docs/architecture/feature-reachability.json";
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIPPED_DIRS = new Set([
  ".git",
  ".next",
  "dist",
  "dist-inline",
  "node_modules",
]);

function readJsonFile(pathname, fallback) {
  if (!existsSync(pathname)) {
    return fallback;
  }

  return JSON.parse(readFileSync(pathname, "utf8"));
}

function walkCodeFiles(root, files = []) {
  if (!existsSync(root)) {
    return files;
  }

  for (const entry of readdirSync(root)) {
    const fullPath = path.join(root, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry)) {
        walkCodeFiles(fullPath, files);
      }
      continue;
    }

    if (stats.isFile() && CODE_EXTENSIONS.has(path.extname(entry))) {
      files.push(fullPath);
    }
  }

  return files;
}

function isTestFile(pathname) {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(pathname);
}

function normalizePath(pathname) {
  return pathname.split(path.sep).join("/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function featureImportPattern(featureName) {
  const escapedFeatureName = escapeRegExp(featureName);

  return new RegExp(
    [
      `@/features/${escapedFeatureName}(?:/|["'])`,
      `src/features/${escapedFeatureName}(?:/|["'])`,
      `features/${escapedFeatureName}(?:/|["'])`,
    ].join("|"),
  );
}

function d3ImportPattern() {
  return /from\s+["']d3(?:-[^"']+)?["']|import\s+\*\s+as\s+d3\s+from\s+["']d3["']/;
}

function listFeatureNames(repoRoot) {
  const featuresRoot = path.join(repoRoot, "src/features");
  if (!existsSync(featuresRoot)) {
    return [];
  }

  return readdirSync(featuresRoot)
    .filter((entry) => statSync(path.join(featuresRoot, entry)).isDirectory())
    .sort();
}

function readPolicy(repoRoot, policyPath = DEFAULT_POLICY_PATH) {
  return readJsonFile(path.join(repoRoot, policyPath), { dormantFeatures: {} });
}

function findImporters(repoRoot, featureName) {
  const roots = ["src/app", "src/components", "src/features", "lib"].map((root) =>
    path.join(repoRoot, root),
  );
  const pattern = featureImportPattern(featureName);
  const featureRoot = normalizePath(path.join(repoRoot, "src/features", featureName));
  const activeRouteImporters = [];
  const nonRouteImporters = [];
  const testImporters = [];

  for (const file of roots.flatMap((root) => walkCodeFiles(root))) {
    const normalizedFile = normalizePath(file);
    if (normalizedFile.startsWith(`${featureRoot}/`)) {
      continue;
    }

    const content = readFileSync(file, "utf8");
    if (!pattern.test(content)) {
      continue;
    }

    const relativePath = normalizePath(path.relative(repoRoot, file));
    if (isTestFile(relativePath)) {
      testImporters.push(relativePath);
    } else if (relativePath.startsWith("src/app/")) {
      activeRouteImporters.push(relativePath);
    } else {
      nonRouteImporters.push(relativePath);
    }
  }

  return {
    activeRouteImporters: activeRouteImporters.sort(),
    nonRouteImporters: nonRouteImporters.sort(),
    testImporters: testImporters.sort(),
  };
}

function countFeatureFiles(repoRoot, featureName) {
  return walkCodeFiles(path.join(repoRoot, "src/features", featureName)).length;
}

function classifyFeature({ featureName, importers, policy }) {
  const dormantMetadata = policy.dormantFeatures?.[featureName];

  if (importers.activeRouteImporters.length > 0) {
    return {
      status: "active",
      reason: "Imported by active App Router source.",
      dormantMetadata: null,
    };
  }

  if (dormantMetadata) {
    return {
      status: "dormant",
      reason: "Retained by explicit dormant feature metadata.",
      dormantMetadata,
    };
  }

  return {
    status: "unreachable",
    reason: "No active App Router importer and no dormant feature metadata.",
    dormantMetadata: null,
  };
}

function findD3SourceImporters(repoRoot) {
  const roots = ["src", "lib", "scripts"].map((root) => path.join(repoRoot, root));
  const importers = [];

  for (const file of roots.flatMap((root) => walkCodeFiles(root))) {
    const relativePath = normalizePath(path.relative(repoRoot, file));
    if (relativePath.startsWith("src/features/graph/")) {
      continue;
    }

    if (d3ImportPattern().test(readFileSync(file, "utf8"))) {
      importers.push(relativePath);
    }
  }

  return importers.sort();
}

export function createFeatureReachabilityReport({
  repoRoot = process.cwd(),
  policyPath = DEFAULT_POLICY_PATH,
} = {}) {
  const policy = readPolicy(repoRoot, policyPath);
  const packageJson = readJsonFile(path.join(repoRoot, "package.json"), {
    dependencies: {},
    devDependencies: {},
  });
  const featureNames = listFeatureNames(repoRoot);
  const features = featureNames.map((featureName) => {
    const importers = findImporters(repoRoot, featureName);
    const classification = classifyFeature({ featureName, importers, policy });

    return {
      name: featureName,
      fileCount: countFeatureFiles(repoRoot, featureName),
      ...importers,
      ...classification,
    };
  });
  // Shared feature code can be reached through another routed feature.
  // Seed only real route importers so a disconnected cycle never becomes active.
  const reachable = new Set(features.filter((feature) => feature.status === "active").map((feature) => feature.name));
  let advanced = true;
  while (advanced) {
    advanced = false;
    for (const feature of features) {
      if (reachable.has(feature.name)) continue;
      const parent = feature.nonRouteImporters
        .map((importer) => /^src\/features\/([^/]+)\//.exec(importer)?.[1])
        .find((name) => name && reachable.has(name));
      if (!parent) continue;
      reachable.add(feature.name);
      feature.status = "active";
      feature.reason = `Imported by route-reachable feature ${parent}.`;
      feature.dormantMetadata = null;
      advanced = true;
    }
  }


  return {
    policyPath,
    features,
    packageDependencies: packageJson.dependencies ?? {},
    packageDevDependencies: packageJson.devDependencies ?? {},
    d3SourceImporters: findD3SourceImporters(repoRoot),
  };
}

function hasRequiredDormantMetadata(metadata) {
  return Boolean(metadata?.owner && metadata?.since && metadata?.deleteTrigger);
}

export function collectFeatureReachabilityFailures(report) {
  const failures = [];

  for (const feature of report.features) {
    if (feature.status === "unreachable") {
      failures.push({
        kind: "unreachable-feature",
        feature: feature.name,
        message: `${feature.name} is compiled under src/features but has no active route importer or dormant policy metadata.`,
      });
    }

    if (feature.status === "dormant" && !hasRequiredDormantMetadata(feature.dormantMetadata)) {
      failures.push({
        kind: "incomplete-dormant-metadata",
        feature: feature.name,
        message: `${feature.name} dormant metadata must include owner, since, and deleteTrigger.`,
      });
    }
  }

  const hasD3Dependency = Boolean(report.packageDependencies.d3);
  const hasD3TypeDependency = Boolean(report.packageDevDependencies["@types/d3"]);
  const graphFeature = report.features.find((feature) => feature.name === "graph");
  const graphRetainsD3 =
    graphFeature?.status === "active" ||
    (graphFeature?.status === "dormant" && hasRequiredDormantMetadata(graphFeature.dormantMetadata));

  if ((hasD3Dependency || hasD3TypeDependency) && !graphRetainsD3 && report.d3SourceImporters.length === 0) {
    failures.push({
      kind: "unused-d3-dependency",
      feature: "graph",
      message: "d3 and @types/d3 may only remain when an active or explicitly dormant graph feature imports them.",
    });
  }

  return failures;
}

export function renderFeatureReachabilityReport(report) {
  const lines = ["Feature reachability report", ""];

  for (const feature of report.features) {
    lines.push(
      `- ${feature.name}: ${feature.status} (${feature.fileCount} code file(s)) - ${feature.reason}`,
    );
    if (feature.activeRouteImporters.length > 0) {
      lines.push(`  active route importers: ${feature.activeRouteImporters.join(", ")}`);
    }
    if (feature.nonRouteImporters.length > 0) {
      lines.push(`  non-route importers: ${feature.nonRouteImporters.join(", ")}`);
    }
    if (feature.testImporters.length > 0) {
      lines.push(`  test importers: ${feature.testImporters.join(", ")}`);
    }
  }

  return lines.join("\n");
}

function runCli() {
  const report = createFeatureReachabilityReport();
  const failures = collectFeatureReachabilityFailures(report);

  console.log(renderFeatureReachabilityReport(report));

  if (failures.length > 0) {
    console.error("\nFeature reachability failures:");
    for (const failure of failures) {
      console.error(`- ${failure.kind}: ${failure.message}`);
    }
  }

  if (process.argv.includes("--check") && failures.length > 0) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
