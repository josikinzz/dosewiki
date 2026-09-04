import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Source walker for architecture policy scanners. Every consumer names the
 * prohibited outcome in its test title and reports offenders as
 * `repo/relative/path[:line]` so a failure identifies the exact file.
 */
export const REPO_ROOT = process.cwd();

export interface SourceScanOptions {
  /** File name filter. Default: TypeScript sources only. */
  extensions?: RegExp;
  /** Include *.test.* and *.spec.* files. Default false. */
  includeTests?: boolean;
  /** Directory names skipped at any depth. */
  skipDirectories?: readonly string[];
}

export interface SourceFile {
  /** Repo-relative posix path, e.g. "src/components/ui/button.tsx". */
  path: string;
  text: string;
}

const DEFAULT_EXTENSIONS = /\.(?:ts|tsx)$/;
const TEST_FILE = /\.(?:test|spec)\.[^.]+$/;
const DEFAULT_SKIPPED_DIRECTORIES = ["node_modules", "runs", "deprecated", "archive"] as const;

/** Repo-relative paths of every matching file under `roots`, sorted. Missing roots contribute nothing. */
export function listSourceFiles(roots: readonly string[], options: SourceScanOptions = {}): string[] {
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  const skipped = options.skipDirectories ?? DEFAULT_SKIPPED_DIRECTORIES;
  const results: string[] = [];

  const walk = (relativePath: string) => {
    const absolute = path.join(REPO_ROOT, relativePath);
    let stat;
    try {
      stat = statSync(absolute);
    } catch {
      return;
    }
    if (stat.isFile()) {
      if (extensions.test(relativePath) && (options.includeTests || !TEST_FILE.test(relativePath))) {
        results.push(relativePath);
      }
      return;
    }
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (entry.isDirectory() && skipped.includes(entry.name)) continue;
      walk(path.posix.join(relativePath, entry.name));
    }
  };

  for (const root of roots) walk(root);
  return results.sort();
}

/** `listSourceFiles` plus file contents. */
export function readSourceFiles(roots: readonly string[], options?: SourceScanOptions): SourceFile[] {
  return listSourceFiles(roots, options).map((relativePath) => ({
    path: relativePath,
    text: readFileSync(path.join(REPO_ROOT, relativePath), "utf8"),
  }));
}
