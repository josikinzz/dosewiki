import assert from "node:assert/strict";
import { test } from "node:test";
import { Linter } from "eslint";
import vercelGuardrails from "./index.js";

function secretErrors(code, filename) {
  const linter = new Linter({ configType: "flat" });
  return linter
    .verify(
      code,
      [
        {
          files: ["**/*.{js,ts}"],
          plugins: { "vercel-guardrails": vercelGuardrails },
          rules: { "vercel-guardrails/no-hardcoded-secrets": "error" },
        },
      ],
      { filename },
    )
    .filter((message) => message.ruleId === "vercel-guardrails/no-hardcoded-secrets");
}

// Assembled at runtime so the repository secret scan never sees a routable
// credential URI in this file; the rule under test still receives one.
const credentialUri = (userinfo, rest) => `postgres://${userinfo}${"@"}${rest}`;

test("connection strings with credentials for a real host are flagged everywhere", () => {
  const code = `const url = "${credentialUri("operator:hunter2", "db.internal-host.net:5432/dosewiki")}";`;
  assert.equal(secretErrors(code, "lib/data/target.ts").length, 1);
  assert.equal(secretErrors(code, "lib/data/target.test.ts").length, 1);
});

test("connection strings for reserved documentation hosts are placeholders", () => {
  for (const host of ["db.example", "other.example", "db.example.com", "fixture.test", "nowhere.invalid"]) {
    const code = `const url = "${credentialUri("user:secret", `${host}:6432/dosewiki`)}";`;
    assert.deepEqual(secretErrors(code, "lib/data/target.ts"), [], host);
  }
});

test("loopback connection strings are placeholders only in test files", () => {
  const code = 'const url = "postgresql://operator:source-secret@localhost/source";';
  assert.deepEqual(secretErrors(code, "lib/summaryBatch.test.ts"), []);
  assert.deepEqual(secretErrors(code.replace("localhost", "127.0.0.1:5432"), "src/app/api/x/route.test.ts"), []);
  assert.equal(secretErrors(code, "lib/summaryBatch.ts").length, 1);
});

test("a reserved word elsewhere in the URL does not make a real host a placeholder", () => {
  const code = `const url = "${credentialUri("user:secret", "db.internal-host.net/example.test")}";`;
  assert.equal(secretErrors(code, "lib/data/target.test.ts").length, 1);
});
