import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scannerPath = path.join(repoRoot, "scripts/security/scan-secrets.mjs");

function git(root, ...args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
}

async function createRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), "dosewiki-secret-scan-"));
  git(root, "init", "--quiet");
  git(root, "config", "user.email", "scanner-test@example.invalid");
  git(root, "config", "user.name", "Secret Scanner Test");
  return root;
}

function runScanner(root, mode = "--tracked") {
  return spawnSync(process.execPath, [scannerPath, mode], {
    cwd: root,
    encoding: "utf8",
  });
}

test("tracked scan covers files regardless of extension or binary bytes", async () => {
  const root = await createRepo();

  try {
    await writeFile(path.join(root, "notes.uncommon-extension"), "ordinary documentation\n");
    await writeFile(path.join(root, "asset.bin"), Buffer.from([0, 1, 2, 3, 4]));
    git(root, "add", "notes.uncommon-extension", "asset.bin");

    const result = runScanner(root);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Scanned 2 tracked files; no potential secrets found\./);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("findings report only the rule and filename, never the matched value", async () => {
  const root = await createRepo();
  const syntheticValue = ["sk", "live", "A".repeat(24)].join("-");

  try {
    await writeFile(path.join(root, "configuration.weird"), `token=${syntheticValue}\n`);
    git(root, "add", "configuration.weird");

    const result = runScanner(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /OPENAI_STYLE_API_KEY\s+configuration\.weird/);
    assert.doesNotMatch(result.stdout, new RegExp(syntheticValue));
    assert.doesNotMatch(result.stderr, new RegExp(syntheticValue));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("staged scan reads the index rather than an unstaged clean replacement", async () => {
  const root = await createRepo();
  const syntheticValue = ["ghp", "B".repeat(36)].join("_");

  try {
    await writeFile(path.join(root, "credentials.txt"), `${syntheticValue}\n`);
    git(root, "add", "credentials.txt");
    await writeFile(path.join(root, "credentials.txt"), "clean working tree content\n");

    const result = runScanner(root, "--staged");

    assert.equal(result.status, 1);
    assert.match(result.stdout, /GITHUB_CLASSIC_PAT\s+credentials\.txt/);
    assert.doesNotMatch(result.stdout, new RegExp(syntheticValue));
    assert.doesNotMatch(result.stderr, new RegExp(syntheticValue));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("repository-specific hosted deploy-key and R2 credential shapes are detected and redacted", async () => {
  const root = await createRepo();
  const deploySecret = ["prod", "acme-deployment"].join(":") + "|" + "D".repeat(40);
  const r2Secret = ["E".repeat(20), "F".repeat(20)].join("");

  try {
    await writeFile(
      path.join(root, "provider.env"),
      `PROVIDER_DEPLOY_KEY=${deploySecret}\nCLOUDFLARE_R2_SECRET_ACCESS_KEY="${r2Secret}"\n`,
    );
    git(root, "add", "provider.env");

    const result = runScanner(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /HOSTED_DEPLOY_KEY\s+provider\.env/);
    assert.match(result.stdout, /CLOUDFLARE_R2_SECRET_ACCESS_KEY\s+provider\.env/);
    for (const secret of [deploySecret, r2Secret]) {
      assert.doesNotMatch(result.stdout, new RegExp(secret));
      assert.doesNotMatch(result.stderr, new RegExp(secret));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("documentation labels and user-facing password guidance are not credentials", async () => {
  const root = await createRepo();

  try {
    const documentedHeader = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
    await writeFile(
      path.join(root, "security-notes.md"),
      `A scanner may describe the header as ${documentedHeader} without containing key material.\n`,
    );
    await writeFile(
      path.join(root, "messages.ts"),
      'export const validation = { password: "Password must be at least sixteen characters" };\n',
    );
    await writeFile(
      path.join(root, "example.env"),
      "WORKOS_COOKIE_PASSWORD=your-secure-random-cookie-password\n",
    );
    await writeFile(
      path.join(root, "provider-examples.env"),
      [
        "PROVIDER_DEPLOY_KEY=prod:your-deployment|your-deploy-key-placeholder",
        "CLOUDFLARE_R2_SECRET_ACCESS_KEY=your-r2-secret-access-key-placeholder",
        "",
      ].join("\n"),
    );
    git(root, "add", "security-notes.md", "messages.ts", "example.env", "provider-examples.env");

    const result = runScanner(root);

    assert.equal(result.status, 0, result.stdout);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("repository-native admin token and secret variable names are detected and redacted", async () => {
  const root = await createRepo();
  const editorToken = ["Q7wR9tY2uI4oP6aS8dF1gH"].join("");
  const authSecret = ["Zx3Cv5Bn7M9kL1jH4gF2dSa"].join("");
  const cronSecret = ["Lq0wE9rT8yU7iO6pL5kJ4hGf"].join("");

  try {
    await writeFile(
      path.join(root, "native.env"),
      [
        `DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE=${editorToken}`,
        `AUTH_SECRET=${authSecret}`,
        `CRON_SECRET="${cronSecret}"`,
        "",
      ].join("\n"),
    );
    git(root, "add", "native.env");

    const result = runScanner(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /GENERIC_SECRET_ASSIGNMENT\s+native\.env/);
    for (const secret of [editorToken, authSecret, cronSecret]) {
      assert.doesNotMatch(result.stdout, new RegExp(secret));
      assert.doesNotMatch(result.stderr, new RegExp(secret));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("credential-shaped text in a filename is redacted from findings", async () => {
  const root = await createRepo();
  const syntheticValue = ["sk", "proj", "C".repeat(24)].join("-");
  const pathname = `leak-${syntheticValue}.txt`;

  try {
    await writeFile(path.join(root, pathname), `${syntheticValue}\n`);
    git(root, "add", pathname);

    const result = runScanner(root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /OPENAI_STYLE_API_KEY\s+leak-\[REDACTED\]\.txt/);
    assert.doesNotMatch(result.stdout, new RegExp(syntheticValue));
    assert.doesNotMatch(result.stderr, new RegExp(syntheticValue));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
