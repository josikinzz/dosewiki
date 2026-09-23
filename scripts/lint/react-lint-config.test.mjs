import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const eslint = new ESLint({ cwd: repoRoot });

async function ruleIds(code, file = "src/features/lint-fixture/Fixture.tsx") {
  const [result] = await eslint.lintText(code, { filePath: path.join(repoRoot, file) });
  return result.messages.map((message) => `${message.severity === 2 ? "error" : "warn"}:${message.ruleId}`);
}

test("a conditional hook call is a lint error", async () => {
  const code = `import { useState } from "react";
export function Fixture({ open }: { open: boolean }) {
  if (open) {
    const [value] = useState(0);
    return <p>{value}</p>;
  }
  return null;
}
`;
  assert.ok((await ruleIds(code)).includes("error:react-hooks/rules-of-hooks"));
});

test("a missing effect dependency is a lint warning", async () => {
  const code = `import { useEffect } from "react";
export function Fixture({ label }: { label: string }) {
  useEffect(() => {
    document.title = label;
  }, []);
  return null;
}
`;
  assert.ok((await ruleIds(code)).includes("warn:react-hooks/exhaustive-deps"));
});

test("Next core web vitals rules apply to application code", async () => {
  const code = `export function Fixture() {
  return <script src="https://example.com/widget.js" />;
}
`;
  assert.ok((await ruleIds(code, "src/app/lint-fixture/page.tsx")).includes("error:@next/next/no-sync-scripts"));
});
