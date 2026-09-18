#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { lstat, readFile, readlink } from "node:fs/promises";

function isRealCredentialCandidate(candidate) {
  return !/(?:your|example|placeholder|replace|generate|random|dummy|sample|synthetic|not-a-real|x{4,}|\.{3})/i.test(candidate);
}

const rules = [
  [
    "HOSTED_DEPLOY_KEY",
    /(?:^|[\r\n])\s*(?:export\s+)?[A-Z0-9_]*DEPLOY_KEY\s*=\s*(?:["']((?:prod|preview|dev):[A-Za-z0-9:_-]{3,}\|[A-Za-z0-9+/_=-]{20,})["']|((?:prod|preview|dev):[A-Za-z0-9:_-]{3,}\|[A-Za-z0-9+/_=-]{20,}))(?:\s|$)/,
    (match) => isRealCredentialCandidate(match[1] ?? match[2] ?? ""),
  ],
  [
    "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
    /(?:^|[\r\n])\s*(?:export\s+)?CLOUDFLARE_R2_SECRET_ACCESS_KEY\s*=\s*(?:["']([A-Za-z0-9+/_=-]{32,})["']|([A-Za-z0-9+/_=-]{32,}))(?:\s|$)/,
    (match) => isRealCredentialCandidate(match[1] ?? match[2] ?? ""),
  ],
  ["OPENAI_STYLE_API_KEY", /sk[-_](?:live|test|or|proj)[-_][A-Za-z0-9]{20,}/],
  ["GITHUB_CLASSIC_PAT", /gh[pousr]_[A-Za-z0-9]{36,}/],
  ["GITHUB_FINE_GRAINED_PAT", /github_pat_[A-Za-z0-9_]{22,}/],
  ["SLACK_TOKEN", /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ["GOOGLE_API_KEY", /AIza[A-Za-z0-9_-]{35}/],
  ["GOOGLE_OAUTH_TOKEN", /ya29\.[A-Za-z0-9_-]{20,}/],
  ["AWS_ACCESS_KEY_ID", /(?:AKIA|ASIA)[A-Z0-9]{16}/],
  ["NPM_ACCESS_TOKEN", /npm_[A-Za-z0-9]{36,}/],
  [
    "PRIVATE_KEY",
    /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----[\r\n]+(?:[A-Za-z0-9+/=]{16,}[\r\n]+){2,}-----END\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/,
  ],
  [
    "CREDENTIAL_BEARING_URI",
    /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^\s/:]+:([^\s/@]+)@([^\s/:?#]+)/i,
    // Test fixtures point at RFC 2606 reserved names or the loopback host;
    // nothing routable lives there, so such a URI carries no usable secret.
    (match) =>
      isRealCredentialCandidate(match[1]) &&
      !/^(?:localhost|127\.0\.0\.1|\[::1\]|example|(?:[^\s]*\.)?(?:example|test|invalid|localhost))$/i.test(match[2]),
  ],
  [
    "GENERIC_SECRET_ASSIGNMENT",
    /(?:^|[\r\n])\s*(?:export\s+)?[A-Z0-9_]*(?:PASSWORD|API_KEY|SECRET_KEY|SECRET|AUTH_TOKEN|ADMIN_KEY|ACCESS_TOKEN|DATA_ADMIN_TOKEN)[A-Z0-9_]*\s*=\s*(?:["']([A-Za-z0-9+/_=:.|-]{20,})["']|([A-Za-z0-9+/_=:.|-]{20,}))(?:\s|$)/,
    (match) => isRealCredentialCandidate(match[1] ?? match[2] ?? ""),
  ],
];

function runGit(args, encoding = "utf8") {
  try {
    return execFileSync("git", args, {
      encoding,
      maxBuffer: 128 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    console.error("Secret scan could not read the Git index.");
    process.exit(2);
  }
}

function splitNullSeparated(buffer) {
  return buffer
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function listPaths(mode) {
  if (mode === "--tracked") {
    return splitNullSeparated(runGit(["ls-files", "-z"], "buffer"));
  }

  if (mode === "--staged") {
    return splitNullSeparated(
      runGit(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], "buffer"),
    );
  }

  console.error("Usage: node scripts/security/scan-secrets.mjs --tracked|--staged");
  process.exit(2);
}

async function readTrackedContent(pathname, mode) {
  if (mode === "--staged") {
    return runGit(["show", `:${pathname}`], "buffer");
  }

  try {
    const stats = await lstat(pathname);
    if (stats.isSymbolicLink()) {
      return Buffer.from(await readlink(pathname));
    }
    return await readFile(pathname);
  } catch {
    return runGit(["show", `:${pathname}`], "buffer");
  }
}

function printablePath(pathname) {
  let redacted = pathname;
  for (const [, pattern] of rules) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    redacted = redacted.replace(new RegExp(pattern.source, flags), "[REDACTED]");
  }
  return redacted.replaceAll("\r", "\\r").replaceAll("\n", "\\n").replaceAll("\t", "\\t");
}

function hasAcceptedMatch(content, pattern, acceptsMatch) {
  if (!acceptsMatch) {
    return pattern.test(content);
  }

  const globalPattern = new RegExp(pattern.source, `${pattern.flags}g`);
  return [...content.matchAll(globalPattern)].some((match) => acceptsMatch(match));
}

const mode = process.argv[2] ?? "--tracked";
const paths = listPaths(mode);
const findings = [];

for (const pathname of paths) {
  const content = (await readTrackedContent(pathname, mode)).toString("utf8");
  for (const [ruleId, pattern, acceptsMatch] of rules) {
    if (hasAcceptedMatch(content, pattern, acceptsMatch)) {
      findings.push({ ruleId, pathname });
    }
  }
}

if (findings.length === 0) {
  console.log(`Scanned ${paths.length} ${mode === "--staged" ? "staged" : "tracked"} files; no potential secrets found.`);
  process.exit(0);
}

console.log(`Secret scan found ${findings.length} potential credential finding(s).`);
console.log("Rule Filename");
for (const finding of findings) {
  console.log(`${finding.ruleId} ${printablePath(finding.pathname)}`);
}
console.log("Matched values are intentionally redacted. Remove the credential or document a safe test fixture.");
process.exit(1);
