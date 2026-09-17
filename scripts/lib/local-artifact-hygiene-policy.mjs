export const LOCAL_ARTIFACT_HYGIENE_POLICIES = [
  {
    path: ".next",
    classification: "generated-output-boundary",
    cleanupBehavior: "manual-review-only",
    protectionRule: "protected-directory-subtree",
    reason: "generated output boundary",
    rationale: "Next.js output may contain reusable cache data and is never removed by hygiene:clean.",
  },
  {
    path: ".generated",
    classification: "generated-output",
    cleanupBehavior: "delete-recursively-when-present",
    protectionRule: "approved-direct-target",
    reason: "generated output",
    rationale: "Local generated scratch output.",
  },
  {
    path: "dist",
    classification: "generated-output",
    cleanupBehavior: "delete-recursively-when-present",
    protectionRule: "approved-direct-target",
    reason: "generated output",
    rationale: "Build output that can be recreated.",
  },
  {
    path: "dist-inline",
    classification: "generated-output",
    cleanupBehavior: "delete-recursively-when-present",
    protectionRule: "approved-direct-target",
    reason: "generated output",
    rationale: "Alternate build output that can be recreated.",
  },
  {
    path: "coverage",
    classification: "generated-output",
    cleanupBehavior: "delete-recursively-when-present",
    protectionRule: "approved-direct-target",
    reason: "generated output",
    rationale: "Test coverage output.",
  },
  {
    path: "public/share",
    classification: "generated-output",
    cleanupBehavior: "delete-recursively-when-present",
    protectionRule: "approved-direct-target",
    reason: "generated output",
    rationale: "Generated public share artifacts.",
  },
  {
    path: "notes-and-plans/exports",
    classification: "generated-export-boundary",
    cleanupBehavior: "manual-review-only",
    protectionRule: "tracked-files-require-retention-policy",
    reason: "generated export boundary",
    rationale: "Script run outputs and operational exports. Tracked files under this boundary require explicit retention metadata and are never removed by hygiene:clean.",
  },
  {
    path: "tmp",
    classification: "local-working-boundary",
    cleanupBehavior: "manual-review-only",
    protectionRule: "protected-directory-subtree",
    reason: "local working boundary",
    rationale: "Temporary work may include unrelated recovery assets and is never removed by hygiene:clean.",
  },
  {
    path: "**/.DS_Store",
    classification: "macos-metadata",
    cleanupBehavior: "delete-discovered-files-outside-protected-directories",
    protectionRule: "skip-protected-directory-subtrees",
    reason: "macOS metadata",
    rationale: "Finder metadata that is safe to remove when discovered outside protected directories.",
  },
  {
    path: "api/_utils",
    classification: "retired-empty-directory",
    cleanupBehavior: "delete-only-when-empty",
    protectionRule: "approved-direct-target-empty-only",
    reason: "empty retired directory",
    rationale: "Retired legacy API helper directory; non-empty contents require separate review.",
  },
  {
    path: "api",
    classification: "retired-empty-directory",
    cleanupBehavior: "delete-only-when-empty",
    protectionRule: "approved-direct-target-empty-only",
    reason: "empty retired directory",
    rationale: "Retired legacy root API directory; non-empty contents require separate review.",
  },
];

const GENERATED_EXPORT_RETENTION_POLICIES = [
  {
    path: "notes-and-plans/exports/assets/*",
    role: "fixture",
    owner: "data-workflow-maintainers",
    retention: "Retain as lightweight visual/reference fixtures used by generated export documentation.",
    freshnessRule: "Review when asset-consuming docs or import flows change.",
    reviewDate: "2026-05-28",
  },
  {
    path: "notes-and-plans/exports/batch/*",
    role: "run-output",
    owner: "data-workflow-maintainers",
    retention: "Retained as transitional batch-generation history until archive retention work classifies or removes it.",
    freshnessRule: "Do not treat as current runtime data; regenerate from the relevant batch command when needed.",
    reviewDate: "2026-05-28",
  },
  {
    path: "notes-and-plans/exports/openrouter/**",
    role: "run-output",
    owner: "data-workflow-maintainers",
    retention: "Retained as transitional OpenRouter rewrite payload/result history until archive retention work classifies or removes it.",
    freshnessRule: "Do not treat as current runtime data; regenerate from the dosage-duration OpenRouter scripts when needed.",
    reviewDate: "2026-05-28",
  },
  {
    path: "notes-and-plans/exports/formal-citations-debug/**",
    role: "review-fixture",
    owner: "citations-maintainers",
    retention: "Retain as a reproducible formal-citations debug packet for source-enrichment review.",
    freshnessRule: "Refresh only by rerunning the formal citations debug workflow for the reviewed article.",
    reviewDate: "2026-05-28",
  },
  {
    path: "notes-and-plans/exports/formal-citations-wikipedia-enrichment-review.md",
    role: "durable-record",
    owner: "citations-maintainers",
    retention: "Retain as the human-readable review record for Wikipedia source enrichment.",
    freshnessRule: "Update only when the corresponding enrichment review is intentionally revised.",
    reviewDate: "2026-05-28",
  },
  {
    path: "notes-and-plans/exports/dosage-duration-direct-note-rewrite-queue.*",
    role: "migration-queue",
    owner: "data-workflow-maintainers",
    retention: "Retain as the reviewed dosage/duration rewrite queue used by OpenRouter batch tooling.",
    freshnessRule: "Regenerate from the dosage-duration export command before a new rewrite campaign.",
    reviewDate: "2026-05-28",
  },
  {
    path: "notes-and-plans/exports/dose-equivalent-table.xlsx",
    role: "durable-record",
    owner: "data-workflow-maintainers",
    retention: "Retain as a spreadsheet export record until a source workbook policy replaces it.",
    freshnessRule: "Review before using as an input to current runtime data.",
    reviewDate: "2026-05-28",
  },
  {
    path: "notes-and-plans/exports/replications/*",
    role: "durable-record",
    owner: "replications-maintainers",
    retention: "Retain as replication import metadata referenced by the replications import guides.",
    freshnessRule: "Regenerate from scripts/replications/scan-replications.mjs before a new import pass.",
    reviewDate: "2026-05-28",
  },
]

const PROTECTED_LOCAL_ARTIFACT_PATHS = [
  ".next",
  "tmp",
  ".git",
  ".claude",
  ".vercel",
  ".vscode",
  "node_modules",
]

const DIRECT_POLICIES = LOCAL_ARTIFACT_HYGIENE_POLICIES.filter(
  (policy) => !policy.path.includes("*"),
);
const GENERATED_EXPORT_BOUNDARY_POLICY = LOCAL_ARTIFACT_HYGIENE_POLICIES.find(
  (policy) => policy.path === "notes-and-plans/exports",
);

function normalizePath(pathname) {
  return pathname.replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+$/, "") || ".";
}

function pathSegments(pathname) {
  return normalizePath(pathname).split("/").filter(Boolean);
}

export function isProtectedLocalArtifactPath(pathname) {
  const segments = pathSegments(pathname);
  if (segments[0] === ".postgres" || segments[0]?.startsWith(".next-")) return true;
  return PROTECTED_LOCAL_ARTIFACT_PATHS.some((protectedPath) => {
    const protectedSegments = pathSegments(protectedPath);
    if (segments.length < protectedSegments.length) {
      return false;
    }

    return protectedSegments.every((segment, index) => segments[index] === segment)
      || segments.includes(protectedPath);
  });
}

export function classifyLocalArtifactPath(pathname) {
  const normalizedPath = normalizePath(pathname);
  const directPolicy = DIRECT_POLICIES.find((policy) => policy.path === normalizedPath);
  if (directPolicy) {
    return directPolicy;
  }

  if (
    GENERATED_EXPORT_BOUNDARY_POLICY &&
    normalizedPath.startsWith(`${GENERATED_EXPORT_BOUNDARY_POLICY.path}/`)
  ) {
    return GENERATED_EXPORT_BOUNDARY_POLICY;
  }

  if (pathSegments(normalizedPath).at(-1) === ".DS_Store") {
    return LOCAL_ARTIFACT_HYGIENE_POLICIES.find((policy) => policy.path === "**/.DS_Store");
  }

  return null;
}

export function directCleanupPolicies() {
  return DIRECT_POLICIES.filter((policy) => (
    policy.cleanupBehavior !== "delete-only-when-empty" &&
    policy.cleanupBehavior !== "manual-review-only"
  ));
}

export function retiredEmptyDirectoryPolicies() {
  return DIRECT_POLICIES.filter((policy) => policy.cleanupBehavior === "delete-only-when-empty");
}

export function dsStorePolicy() {
  return LOCAL_ARTIFACT_HYGIENE_POLICIES.find((policy) => policy.path === "**/.DS_Store");
}

function patternToRegex(pathPattern) {
  const escaped = pathPattern
    .split("**")
    .map((part) => (
      part
        .split("*")
        .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*")
    ))
    .join(".*");
  return new RegExp(`^${escaped}$`);
}

function findGeneratedExportRetentionPolicy(pathname) { const normalizedPath = normalizePath(pathname);
return GENERATED_EXPORT_RETENTION_POLICIES.find((policy) => (
  patternToRegex(policy.path).test(normalizedPath)
)) ?? null; }

export function evaluateGeneratedExportRetention(paths) {
  const generatedExportPaths = paths
    .map(normalizePath)
    .filter((pathname) => pathname.startsWith("notes-and-plans/exports/"))
    .sort((left, right) => left.localeCompare(right));
  const retained = [];
  const unclassified = [];

  for (const pathname of generatedExportPaths) {
    const policy = findGeneratedExportRetentionPolicy(pathname);
    if (!policy) {
      unclassified.push(pathname);
      continue;
    }

    retained.push({
      ...policy,
      policyPath: policy.path,
      path: pathname,
    });
  }

  return {
    tracked: generatedExportPaths.length,
    retained,
    unclassified,
  };
}

export function renderLocalArtifactPolicyMarkdownTable() {
  const rows = [
    "| Path | Classification | Cleanup behavior | Protection rule |",
    "| --- | --- | --- | --- |",
    ...LOCAL_ARTIFACT_HYGIENE_POLICIES.map((policy) => (
      `| \`${policy.path}\` | ${policy.classification} | ${policy.cleanupBehavior} | ${policy.protectionRule} |`
    )),
  ];

  return `${rows.join("\n")}\n`;
}
