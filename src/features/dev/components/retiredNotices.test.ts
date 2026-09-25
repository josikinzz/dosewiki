import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Every dev tool reports through `Notice`. These are the notice systems it
// replaced; neither the modules nor their component names may come back.
const RETIRED_MODULE = /from\s+["'][^"']*\/(EditorNotice|ActionNotice|devNoticeLifecycle|TagNotice)["']/;
const RETIRED_COMPONENT = /<\s*(EditorNotice|ActionNotice|TagNotice|CopyResultNotice)\b/;

const SRC = join(process.cwd(), "src");
const SELF = relative(SRC, __filename);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "node_modules" ? [] : sourceFiles(path);
    }
    return /\.(ts|tsx|mts)$/.test(name) ? [path] : [];
  });
}

describe("retired notice modules", () => {
  it("are imported and rendered nowhere", () => {
    const offenders = sourceFiles(SRC)
      .filter((path) => relative(SRC, path) !== SELF)
      .filter((path) => {
        const text = readFileSync(path, "utf8");
        return RETIRED_MODULE.test(text) || RETIRED_COMPONENT.test(text);
      })
      .map((path) => relative(SRC, path));

    expect(offenders).toEqual([]);
  });
});
