#!/usr/bin/env bun
/** Prepare private responsive images, then explicitly upload a pinned local plan. */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { assertDataWritesNotFrozen } from "../../lib/runtime/dataWriteFreeze";
import { signR2Request } from "../../lib/runtime/r2Signing.mjs";
import { encodeR2ImageRenditions } from "../../lib/runtime/r2ImageRenditions";
import { RESPONSIVE_WIDTHS } from "../../lib/next/r2ImagePolicy";

const OPERATION = "upload-r2-image-renditions";
const HOST = "dosewiki-media.gremblinzuwu.workers.dev";
const WIDTHS = RESPONSIVE_WIDTHS;
const KEY = /^media\/sha256\/([a-f0-9]{2})\/([a-f0-9]{64})\.(jpg|jpeg|png|webp|avif)$/;
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const argv = process.argv.slice(2);
const flag = (name: string) => {
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const i = argv.indexOf(name);
  return i < 0 ? undefined : argv[i + 1];
};
const out = path.resolve(flag("--out") ?? "");
if (!flag("--out")) throw new Error("--out is required");
const concurrency = Number(flag("--concurrency") ?? 4);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new Error("--concurrency must be 1..16");
const validKey = (key: string) => {
  const m = KEY.exec(key);
  return !!m && m[2].startsWith(m[1]);
};
async function parallel<T>(items: T[], task: (item: T) => Promise<void>) {
  let cursor = 0;
  let failure: unknown;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!failure && cursor < items.length) {
      const item = items[cursor++];
      try { await task(item); } catch (error) { failure = error; }
    }
  }));
  if (failure) throw failure;
}
function append(name: string, record: unknown) {
  fs.appendFileSync(path.join(out, name), `${JSON.stringify(record)}\n`);
}
function readLines<T>(name: string): T[] {
  const file = path.join(out, name);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
}
type Variant = { key: string; sha256: string; size: number; width: number };
type Source = { key: string; sourceBytes: number; variants: Variant[] };
fs.mkdirSync(out, { recursive: true });
sharp.concurrency(1);
sharp.cache(false);

if (!argv.includes("--write")) {
  const keysPath = flag("--keys");
  if (!keysPath) throw new Error("Preparation requires --keys <JSON containing keys[]>");
  const keys = [...new Set<string>(JSON.parse(fs.readFileSync(keysPath, "utf8")).keys)].sort();
  if (!keys.length || keys.some((key) => !validKey(key))) throw new Error("Invalid or empty canonical raster key inventory");
  const prior = new Map(readLines<Source>("prepared.jsonl").map((row) => [row.key, row]));
  let completed = 0;
  const unavailableSources: { key: string; status: 404 | 410 }[] = [];
  await parallel(keys, async (key) => {
    const old = prior.get(key);
    if (old && old.variants.length === WIDTHS.length && old.variants.every((v) => {
      const filename = path.join(out, v.key);
      return fs.existsSync(filename) && fs.statSync(filename).size === v.size && hash(fs.readFileSync(filename)) === v.sha256;
    })) { completed++; return; }
    const response = await fetch(`https://${HOST}/${key}`, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(120000) });
    if (response.status === 404 || response.status === 410) {
      const unavailable: { key: string; status: 404 | 410 } = { key, status: response.status };
      unavailableSources.push(unavailable);
      append("unavailable-sources.jsonl", { ...unavailable, checkedAt: new Date().toISOString() });
      console.error(JSON.stringify({ unavailableSource: key, status: response.status, disposition: "Preserve missing or withdrawn delivery; never substitute another original." }));
      completed++;
      return;
    }
    if (!response.ok) throw new Error(`Source ${key}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== KEY.exec(key)![2]) throw new Error(`Source digest mismatch: ${key}`);
    const variants: Variant[] = [];
    for await (const { key: variantKey, width, bytes: buffer } of encodeR2ImageRenditions(bytes, key)) {
      const filename = path.join(out, variantKey);
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, buffer);
      variants.push({ key: variantKey, sha256: hash(buffer), size: buffer.length, width });
    }
    append("prepared.jsonl", { key, sourceBytes: bytes.length, variants } satisfies Source);
    completed++;
    if (completed % 25 === 0) console.log(JSON.stringify({ prepared: completed, total: keys.length }));
  });
  const records = new Map(readLines<Source>("prepared.jsonl").map((row) => [row.key, row]));
  const unavailableKeys = new Set(unavailableSources.map((source) => source.key));
  const sources = keys.flatMap((key) => records.has(key) && !unavailableKeys.has(key) ? [records.get(key)!] : []);
  const plan = { version: 1, bucket: "replications", sourceHost: HOST, widths: WIDTHS, quality: 75, sources, unavailableSources };
  const serialized = `${JSON.stringify(plan)}\n`;
  fs.writeFileSync(path.join(out, "plan.json"), serialized);
  console.log(JSON.stringify({ dryRun: true, sources: sources.length, unavailableSources, objects: sources.length * WIDTHS.length, bytes: sources.reduce((n, s) => n + s.variants.reduce((a, v) => a + v.size, 0), 0), planSha256: hash(serialized), plan: path.join(out, "plan.json") }));
} else {
  assertDataWritesNotFrozen(OPERATION);
  if (flag("--confirm-write") !== OPERATION || flag("--bucket") !== "replications") throw new Error(`Require --confirm-write=${OPERATION} --bucket=replications`);
  const planBytes = fs.readFileSync(path.join(out, "plan.json"));
  const planHash = hash(planBytes);
  if (flag("--confirm-plan") !== planHash) throw new Error("--confirm-plan must match exact plan.json SHA-256");
  const plan = JSON.parse(planBytes.toString()) as { version: number; bucket: string; sourceHost: string; widths: number[]; quality: number; sources: Source[] };
  if (plan.version !== 1 || plan.bucket !== "replications" || plan.sourceHost !== HOST || plan.quality !== 75 || JSON.stringify(plan.widths) !== JSON.stringify(WIDTHS)) throw new Error("Plan contract mismatch");
  const endpoint = process.env.CLOUDFLARE_R2_S3_ENDPOINT;
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accountId || !accessKeyId || !secretAccessKey || process.env.CLOUDFLARE_R2_BUCKET !== plan.bucket) throw new Error("Missing or mismatched R2 credentials");
  const target = new URL(endpoint);
  if (target.protocol !== "https:" || target.hostname !== `${accountId}.r2.cloudflarestorage.com` || target.pathname !== "/" || target.search || target.username || target.password) throw new Error("Unapproved R2 endpoint");
  const signed = async (method: string, key: string, body?: Buffer, headers: Record<string, string> = {}) => {
    const url = `${target.origin}/${plan.bucket}/${key}`;
    const backing = body?.buffer;
    if (backing && !(backing instanceof ArrayBuffer)) throw new Error("Rendition upload requires an ArrayBuffer-backed payload");
    const payload = body && backing instanceof ArrayBuffer ? new Uint8Array(backing, body.byteOffset, body.byteLength) : undefined;
    for (let attempt = 0; ; attempt++) {
      if (method === "PUT") assertDataWritesNotFrozen(OPERATION);
      try {
        const response = await fetch(url, { method, headers: signR2Request({ method, url, headers, payloadHash: hash(body ?? ""), accessKeyId, secretAccessKey }), ...(payload ? { body: payload } : {}), redirect: "error", signal: AbortSignal.timeout(120000) });
        if (method === "PUT" || response.status === 429) await response.arrayBuffer();
        if (response.status !== 429 || attempt >= 3) return response;
        const retryAfter = response.headers.get("retry-after");
        const seconds = retryAfter && /^\d+$/.test(retryAfter)
          ? Number(retryAfter)
          : Math.max(0, (Date.parse(retryAfter ?? "") - Date.now()) / 1000);
        await delay(Math.max(5000 * (attempt + 1), Number.isFinite(seconds) ? seconds * 1000 : 0));
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
        if (attempt >= 2 || typeof code !== "string" || !["ECONNRESET", "ETIMEDOUT", "ConnectionClosed"].includes(code)) throw error;
        // PUT is create-only. An ambiguous completed write returns 412 on retry,
        // then must pass the same remote digest verification as a fresh object.
        await delay(500 * (attempt + 1));
      }
    }
  };
  // Validate the entire source and destination set before the first remote write.
  const seen = new Set<string>();
  for (const source of plan.sources) {
    if (!validKey(source.key) || source.variants.length !== WIDTHS.length) throw new Error("Invalid source plan");
    for (let i = 0; i < WIDTHS.length; i++) {
      const v = source.variants[i];
      if (v.width !== WIDTHS[i] || v.key !== `_renditions/v1/${source.key}/${v.width}.webp` || seen.has(v.key)) throw new Error("Invalid or duplicate rendition destination");
      seen.add(v.key);
      const bytes = fs.readFileSync(path.join(out, v.key));
      if (bytes.length !== v.size || hash(bytes) !== v.sha256) throw new Error(`Local rendition drift: ${v.key}`);
    }
  }
  let completed = 0;
  await parallel(plan.sources, async (source) => {
    const marker = await signed("HEAD", `_withdrawals/${source.key}`);
    if (marker.ok) { append("upload-skipped-withdrawn.jsonl", { key: source.key }); return; }
    if (marker.status !== 404) throw new Error(`Withdrawal lookup ${source.key}: ${marker.status}`);
    for (const variant of source.variants) {
      const bytes = fs.readFileSync(path.join(out, variant.key));
      const uploaded = await signed("PUT", variant.key, bytes, { "content-type": "image/webp", "if-none-match": "*", "x-amz-meta-sha256": variant.sha256 });
      if (!uploaded.ok && uploaded.status !== 412) throw new Error(`R2 PUT ${variant.key}: ${uploaded.status}`);
      const verified = await signed("HEAD", variant.key);
      if (!verified.ok || Number(verified.headers.get("content-length")) !== variant.size || verified.headers.get("x-amz-meta-sha256") !== variant.sha256) throw new Error(`R2 verification failed: ${variant.key}`);
      append("uploaded.jsonl", { key: variant.key, sha256: variant.sha256, size: variant.size, planSha256: planHash, verifiedAt: new Date().toISOString() });
    }
    completed++;
    if (completed % 25 === 0) console.log(JSON.stringify({ uploadedSources: completed, total: plan.sources.length }));
  });
  console.log(JSON.stringify({ complete: true, verifiedSources: completed, planSha256: planHash }));
}
