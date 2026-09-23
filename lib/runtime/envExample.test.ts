// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { ADMIN_INTENTS, getAdminIntentEnvVar } from "../../server/lib/adminIntentTokens";

/**
 * `.env.example` documents every variable the runtime reads.
 *
 * Scope is the application runtime: `lib/`, `server/`, and `src/`. `scripts/`
 * is left out on purpose: operator commands take their targets, confirmations,
 * and credentials from their own headers and runbooks (see
 * docs/operations/data-credentials.md), and listing those in the app's env
 * template would invite setting operator credentials on a deployment.
 *
 * A read is a literal `process.env.NAME` or `process.env["NAME"]` outside a
 * test file. Reads through an `env` parameter or a computed key are not seen;
 * the scoped admin tokens, read through their registry, are checked from that
 * registry below.
 */

const RUNTIME_ROOTS = ["lib", "server", "src"];
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$|\.d\.ts$/;
const TEST_DIRECTORIES = new Set(["src/test", "node_modules"]);
const ENV_READ = /process\.env(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[\s*(["'`])([A-Za-z_][A-Za-z0-9_]*)\2\s*\])/g;

/**
 * Variables the platform or the build sets, never an operator. Each needs a reason.
 */
const PLATFORM_PROVIDED: Record<string, string> = {
  NODE_ENV: "Set by Next.js and Node tooling for the running mode.",
  VERCEL: "Set to 1 by Vercel on its build and runtime.",
  VERCEL_ENV: "Set by Vercel to production, preview, or development.",
  NEXT_PUBLIC_EDITOR_BUILD: "Derived in next.config.ts from DOSEWIKI_BUILD_SURFACE, which .env.example documents.",
};

function sourceFiles(root: string, directory = root): string[] {
  const repoRelative = relative(process.cwd(), directory);
  if (TEST_DIRECTORIES.has(repoRelative)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(root, path);
    return SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name) ? [path] : [];
  });
}

/** Literal env names a source file reads. */
function envReads(source: string): string[] {
  return [...source.matchAll(ENV_READ)].map((match) => match[1] ?? match[3] ?? "");
}

/** Names `.env.example` lists, as a live assignment or a commented example. */
function documentedNames(envExample: string): Set<string> {
  return new Set([...envExample.matchAll(/^[ \t]*#?[ \t]*([A-Z_][A-Z0-9_]*)=/gm)].map((match) => match[1]!));
}

/** Every read name that is neither documented nor platform-provided, with its first reader. */
function undocumentedReads(files: Record<string, string>, envExample: string): Record<string, string> {
  const documented = documentedNames(envExample);
  const missing: Record<string, string> = {};
  for (const [file, source] of Object.entries(files)) {
    for (const name of envReads(source)) {
      if (!documented.has(name) && !(name in PLATFORM_PROVIDED)) missing[name] ??= file;
    }
  }
  return missing;
}

function runtimeSources(): Record<string, string> {
  return Object.fromEntries(
    RUNTIME_ROOTS.flatMap((root) => sourceFiles(join(process.cwd(), root))).map((path) => [
      relative(process.cwd(), path),
      readFileSync(path, "utf8"),
    ]),
  );
}

const envExample = readFileSync(join(process.cwd(), ".env.example"), "utf8");

describe(".env.example coverage", () => {
  it("documents every variable the runtime reads", () => {
    expect(
      undocumentedReads(runtimeSources(), envExample),
      "Document each variable in .env.example (a commented `# NAME=` line is enough), " +
        "or add it to PLATFORM_PROVIDED with a reason if the platform or build sets it.",
    ).toEqual({});
  });

  it("documents every scoped admin token the intent registry reads", () => {
    const documented = documentedNames(envExample);
    const scoped = ADMIN_INTENTS.map(getAdminIntentEnvVar).filter((name): name is string => Boolean(name));

    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.filter((name) => !documented.has(name))).toEqual([]);
  });

  it("keeps the platform allowlist to variables the runtime actually reads", () => {
    const read = new Set(Object.values(runtimeSources()).flatMap(envReads));

    expect(Object.keys(PLATFORM_PROVIDED).filter((name) => !read.has(name))).toEqual([]);
  });

  it("fails a new read of an undocumented variable", () => {
    const files = {
      "lib/example.ts": [
        'const a = process.env.DOCUMENTED_EXAMPLE;',
        'const b = process.env["BRACKETED_EXAMPLE"];',
        "const c = process.env.NODE_ENV;",
        "const d = process.env.UNDOCUMENTED_EXAMPLE;",
        "const e = process.env['UNDOCUMENTED_BRACKET'];",
      ].join("\n"),
    };
    const example = "# DOCUMENTED_EXAMPLE=\nBRACKETED_EXAMPLE=placeholder\n";

    expect(undocumentedReads(files, example)).toEqual({
      UNDOCUMENTED_EXAMPLE: "lib/example.ts",
      UNDOCUMENTED_BRACKET: "lib/example.ts",
    });
  });
});
