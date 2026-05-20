export const LOCAL_ARTIFACT_HYGIENE_POLICIES = [
  {
    path: ".next",
    classification: "generated-output",
    cleanupBehavior: "delete-recursively-when-present",
    protectionRule: "approved-direct-target",
    reason: "generated output",
    rationale: "Next.js build and development output.",
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
    path: "tmp",
    classification: "generated-output",
    cleanupBehavior: "delete-recursively-when-present",
    protectionRule: "approved-direct-target",
    reason: "generated output",
    rationale: "Temporary local working output.",
  },
  {
    path: ".codex-dev.log",
    classification: "local-process-file",
    cleanupBehavior: "delete-file-when-present",
    protectionRule: "approved-direct-target",
    reason: "local process file",
    rationale: "Local development process log.",
  },
  {
    path: ".codex-dev.pid",
    classification: "local-process-file",
    cleanupBehavior: "delete-file-when-present",
    protectionRule: "approved-direct-target",
    reason: "local process file",
    rationale: "Local development process pid file.",
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

export const PROTECTED_LOCAL_ARTIFACT_PATHS = [
  ".git",
  ".claude",
  ".vercel",
  ".vscode",
  "node_modules",
];

const DIRECT_POLICIES = LOCAL_ARTIFACT_HYGIENE_POLICIES.filter(
  (policy) => !policy.path.includes("*"),
);

function normalizePath(pathname) {
  return pathname.replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+$/, "") || ".";
}

function pathSegments(pathname) {
  return normalizePath(pathname).split("/").filter(Boolean);
}

export function isProtectedLocalArtifactPath(pathname) {
  const segments = pathSegments(pathname);
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

  if (pathSegments(normalizedPath).at(-1) === ".DS_Store") {
    return LOCAL_ARTIFACT_HYGIENE_POLICIES.find((policy) => policy.path === "**/.DS_Store");
  }

  return null;
}

export function directCleanupPolicies() {
  return DIRECT_POLICIES.filter((policy) => policy.cleanupBehavior !== "delete-only-when-empty");
}

export function retiredEmptyDirectoryPolicies() {
  return DIRECT_POLICIES.filter((policy) => policy.cleanupBehavior === "delete-only-when-empty");
}

export function dsStorePolicy() {
  return LOCAL_ARTIFACT_HYGIENE_POLICIES.find((policy) => policy.path === "**/.DS_Store");
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
