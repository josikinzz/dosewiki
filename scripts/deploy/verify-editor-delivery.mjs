#!/usr/bin/env node
import fs from "node:fs/promises";
import { createHash } from "node:crypto";

// Read-only. Never accepts cookies, bypass tokens, credentials, or automatic redirects.
const [auditPath, inventoryPath] = process.argv.slice(2);
if (!auditPath || !inventoryPath) {
  throw new Error("Usage: node scripts/deploy/verify-editor-delivery.mjs <editor-artifact-audit.json> <host-inventory.json>");
}
const audit = JSON.parse(await fs.readFile(auditPath, "utf8"));
const inventory = JSON.parse(await fs.readFile(inventoryPath, "utf8"));
if (audit.surface !== "editor" || audit.accessBoundary !== "application-auth" || !audit.editorModules?.length) {
  throw new Error("An actual audited editor build, with editor module/chunk identities, is required.");
}
if (audit.middleware?.registered !== true) throw new Error("The completed build must verify its document, API and asset middleware gate first.");
if (!Array.isArray(inventory.hosts) || !inventory.hosts.length) throw new Error("host-inventory.json must contain hosts: [{origin, kind}].");
const kinds = new Set(inventory.hosts.map(({ kind }) => kind));
for (const kind of ["custom", "default", "preview", "public"]) {
  if (!kinds.has(kind)) throw new Error(`Host inventory is missing the ${kind} exposure class.`);
}
for (const origin of ["https://dev.dose.wiki", "https://dosewiki-admin.vercel.app", "https://dose.wiki", "https://www.dose.wiki", "https://effectindex.com", "https://www.effectindex.com"]) {
  if (!inventory.hosts.some((entry) => entry.origin === origin)) throw new Error(`Host inventory is missing ${origin}.`);
}
const files = [...new Set(audit.editorModules.flatMap(({ files }) => files))].filter((file) => file.endsWith(".js"));
if (!files.length) throw new Error("The audit contains no emitted editor JavaScript chunks to probe.");
const knownAssetHashes = new Set(audit.assets.map(({ sha256 }) => sha256));
const challengeOrigins = new Set(inventory.challengeOrigins ?? []);
const checks = [];
let failed = false;
for (const { origin, kind } of inventory.hosts) {
  const parsed = new URL(origin);
  if (parsed.protocol !== "https:" || parsed.origin !== origin || parsed.username || parsed.password) throw new Error(`Invalid HTTPS origin: ${origin}`);
  const targets = files.map((file) => ({ pathname: `/_next/${file}`, headers: {} }));
  if (kind !== "public") {
    targets.push({ pathname: "/fentanyl", headers: {} });
    targets.push({ pathname: "/fentanyl?_rsc=delivery-proof", headers: { RSC: "1", "Next-Router-Prefetch": "1" } });
    targets.push({ pathname: "/api/dev/articles", headers: {} });
  }
  for (const { pathname, headers } of targets) {
    try {
      let url = new URL(pathname, origin);
      let response;
      const redirects = [];
      for (let hop = 0; hop < 9; hop += 1) {
        response = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(20000) });
        const location = response.headers.get("location");
        if (![301, 302, 303, 307, 308].includes(response.status) || !location) break;
        if (hop === 8) throw new Error("Redirect limit exceeded");
        const next = new URL(location, url);
        if (next.protocol !== "https:" || next.username || next.password) throw new Error("Unsafe redirect target");
        redirects.push({ status: response.status, from: url.href, to: next.href });
        await response.body?.cancel();
        url = next;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const loginHtml = response.status === 200 && response.headers.get("content-type")?.includes("text/html")
        && (challengeOrigins.has(url.origin) || (url.origin === origin && url.pathname === "/sign-in"));
      // Editor JavaScript is public, but private documents/data must require an app
      // session. Public builds must never return an emitted editor chunk.
      const denied = !knownAssetHashes.has(sha256) && ([401, 403, 404].includes(response.status) || Boolean(loginHtml));
      const editorAsset = kind !== "public" && pathname.startsWith("/_next/static/");
      const allowedAsset = editorAsset && response.status === 200 && knownAssetHashes.has(sha256);
      const passed = denied || allowedAsset;
      failed ||= !passed;
      checks.push({ origin, kind, pathname, status: response.status, denied, allowedAsset, passed, finalUrl: url.href, redirects, cacheControl: response.headers.get("cache-control"), bytes: bytes.byteLength, sha256 });
    } catch (error) {
      failed = true;
      checks.push({ origin, kind, pathname, denied: false, passed: false, error: String(error) });
    }
  }
}
console.log(JSON.stringify({
  version: 2,
  checkedAt: new Date().toISOString(),
  applicationBoundaryPassed: !failed,
  staticAssetsArePublic: true,
  remainingProof: "Verify current host inventory, public artifact separation, and authenticated role/ownership behavior. This anonymous probe does not prove authorization for signed-in accounts or revoke previously delivered code.",
  checks,
}, null, 2));
process.exitCode = failed ? 1 : 0;
