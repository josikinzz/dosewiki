import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { checkRepository, compareToBaseline, scanEmDashes } from "./em-dash-policy.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const EM = "\u2014";

test("JSX text and string literals are reader-facing violations", () => {
  const source = `// setup ${EM} ok\nexport const label = "Dose ${EM} duration";\nexport function View() {\n  return <p>Onset ${EM} peak</p>;\n}\n`;
  const scan = scanEmDashes("src/features/x/View.tsx", source);
  assert.deepEqual(scan.violations.map(({ line }) => line), [2, 4]);
  assert.equal(scan.comments, 1);
});

test("template literal parts are violations and block comments count once per dash", () => {
  const source = `/* one ${EM} two ${EM} three */\nconst title = \`\${name} ${EM} demo \${effect}\`;\n`;
  const scan = scanEmDashes("lib/x.ts", source);
  assert.deepEqual(scan.violations.map(({ line }) => line), [2]);
  assert.equal(scan.comments, 2);
});

test("every occurrence in content and message catalogs is a violation", () => {
  const scan = scanEmDashes("content/about/about.md", `A ${EM} B\nC ${EM} D ${EM} E\n`);
  assert.equal(scan.violations.length, 3);
  assert.equal(scan.comments, 0);
});

test("stylesheet occurrences are comments", () => {
  const scan = scanEmDashes("src/styles/site.css", `/* spacing ${EM} tuned */\n.a { color: red; }\n`);
  assert.deepEqual(scan.violations, []);
  assert.equal(scan.comments, 1);
});

test("the comment baseline is a ratchet that fails when it grows or goes stale", () => {
  const baseline = { "src/a.ts": 2, "src/b.ts": 1 };
  assert.deepEqual(compareToBaseline({ "src/a.ts": 2, "src/b.ts": 1 }, baseline, 3), []);
  assert.match(compareToBaseline({ "src/a.ts": 3, "src/b.ts": 1 }, baseline, 3).join("\n"), /src\/a\.ts has 3 comment em dashes; the baseline allows 2/);
  assert.match(compareToBaseline({ "src/a.ts": 2, "src/b.ts": 1, "src/c.ts": 1 }, baseline, 3).join("\n"), /src\/c\.ts has 1 comment em dash; the baseline allows 0/);
  assert.match(compareToBaseline({ "src/a.ts": 1, "src/b.ts": 1 }, baseline, 3).join("\n"), /src\/a\.ts now has 1.*shrink/);
  assert.match(compareToBaseline({ "src/a.ts": 2, "src/b.ts": 1 }, { ...baseline, "src/c.ts": 1 }, 3).join("\n"), /baseline allows 4 comment em dashes, above its ceiling of 3/);
});

test("the repository carries no reader-facing em dashes and matches its comment baseline", () => {
  const { violations, baselineProblems } = checkRepository(repoRoot);
  assert.deepEqual(violations, []);
  assert.deepEqual(baselineProblems, []);
});
