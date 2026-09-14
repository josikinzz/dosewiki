import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { appendFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const OPERATION = "publish-social-cards";
export const DEFAULT_CDN_BASE = "https://dosewiki-media.gremblinzuwu.workers.dev";
export const CONTENT_TYPE = "image/jpeg";
export const CACHE_CONTROL = "public, max-age=31536000, immutable";
export const CONTENT_DISPOSITION = "inline";
export const KEY_PATTERN = /^media\/sha256\/([0-9a-f]{2})\/([0-9a-f]{64})\.jpg$/;
const VERIFIED_OBJECT_STATUSES = new Set(["verified-reuse", "uploaded-verified"]);

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function digestFile(filename) {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(filename)) {
    hash.update(chunk);
    size += chunk.length;
  }
  return { sha256: hash.digest("hex"), size };
}

export async function digestStream(stream) {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk);
    hash.update(bytes);
    size += bytes.length;
  }
  return { sha256: hash.digest("hex"), size };
}

export function canonicalKey(sha256) {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`Invalid SHA-256: ${sha256}`);
  return `media/sha256/${sha256.slice(0, 2)}/${sha256}.jpg`;
}

/**
 * A card that already lives at its content-addressed key on this CDN. The
 * entity generator carries such cards forward verbatim (per-replication cards
 * are only re-rendered on an explicit offline rebuild), so a refresh must
 * accept them without a local file: they have nothing to upload.
 */
function publishedCardKey(cardPath, cdnBase = DEFAULT_CDN_BASE) { const prefix = `${cdnBase.replace(/\/+$/, "")}/`;
if (!cardPath.startsWith(prefix)) return null;
const key = cardPath.slice(prefix.length);
return KEY_PATTERN.test(key) ? key : null; }

function relativeCardPath(cardPath) { if (cardPath.startsWith("/local/social-cards/")) {
  return cardPath.slice("/local/social-cards/".length);
}
if (cardPath.startsWith("/images/social/")) {
  return cardPath.slice("/images/social/".length);
}
let url;
try {
  url = new URL(cardPath);
} catch {
  throw new Error(`Unsupported social-card path: ${cardPath}`);
}
if (url.pathname.startsWith("/social-cards/")) {
  return url.pathname.slice("/social-cards/".length);
}
throw new Error(`Unsupported social-card path: ${cardPath}`); }

function collectCardLeaves(value, trail = [], leaves = []) {
  for (const [key, child] of Object.entries(value ?? {})) {
    const childTrail = [...trail, key];
    if (typeof child === "string") leaves.push({ trail: childTrail, cardPath: child });
    else if (child && typeof child === "object") collectCardLeaves(child, childTrail, leaves);
    else throw new Error(`Invalid card manifest value at ${childTrail.join(".")}`);
  }
  return leaves;
}

function setAtTrail(root, trail, value) {
  let cursor = root;
  for (const part of trail.slice(0, -1)) cursor = cursor[part];
  cursor[trail.at(-1)] = value;
}

export async function mapConcurrent(items, concurrency, worker) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 64) {
    throw new Error(`Concurrency must be an integer from 1 to 64, received ${concurrency}`);
  }
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  }));
}

export async function buildPlan({ manifestPath, assetsRoot, cdnBase = DEFAULT_CDN_BASE, concurrency = 12 }) {
  const sourceText = await readFile(manifestPath, "utf8");
  const sourceManifest = JSON.parse(sourceText);
  if (!sourceManifest.cards || typeof sourceManifest.cards !== "object") {
    throw new Error("Input manifest must contain a cards object");
  }
  const inputManifestSha256 = sha256Bytes(sourceText);
  const normalizedCdnBase = cdnBase.replace(/\/+$/, "");
  const leaves = collectCardLeaves(sourceManifest.cards);
  const logicalCards = new Array(leaves.length);
  await mapConcurrent(leaves, concurrency, async (leaf, index) => {
    const publishedKey = publishedCardKey(leaf.cardPath, normalizedCdnBase);
    if (publishedKey) {
      logicalCards[index] = {
        category: leaf.trail[0],
        slug: leaf.trail.slice(1).join("/"),
        trail: leaf.trail,
        sourcePath: leaf.cardPath,
        sha256: KEY_PATTERN.exec(publishedKey)[2],
        key: publishedKey,
        published: true,
      };
      return;
    }
    const relativePath = relativeCardPath(leaf.cardPath);
    const filename = path.resolve(assetsRoot, relativePath);
    const root = `${path.resolve(assetsRoot)}${path.sep}`;
    if (!filename.startsWith(root)) throw new Error(`Card path escapes asset root: ${leaf.cardPath}`);
    const metadata = await stat(filename);
    if (!metadata.isFile()) throw new Error(`Social card is not a file: ${filename}`);
    const digest = await digestFile(filename);
    logicalCards[index] = {
      category: leaf.trail[0],
      slug: leaf.trail.slice(1).join("/"),
      trail: leaf.trail,
      sourcePath: leaf.cardPath,
      relativePath,
      filename,
      sha256: digest.sha256,
      size: digest.size,
      key: canonicalKey(digest.sha256),
      contentType: CONTENT_TYPE,
      published: false,
    };
  });
  logicalCards.sort((left, right) => left.trail.join("\0").localeCompare(right.trail.join("\0")));
  const uniqueByKey = new Map();
  for (const card of logicalCards) {
    if (card.published) continue;
    const prior = uniqueByKey.get(card.key);
    if (prior && (prior.sha256 !== card.sha256 || prior.size !== card.size)) {
      throw new Error(`Local content collision for ${card.key}`);
    }
    if (!prior) uniqueByKey.set(card.key, card);
  }
  const objects = [...uniqueByKey.values()].sort((left, right) => left.key.localeCompare(right.key));
  const publishedCardCount = logicalCards.filter((card) => card.published).length;
  const candidateManifest = structuredClone(sourceManifest);
  for (const card of logicalCards) {
    setAtTrail(candidateManifest.cards, card.trail, `${normalizedCdnBase}/${card.key}`);
  }
  const planMaterial = {
    inputManifestSha256,
    cdnBase: normalizedCdnBase,
    cards: logicalCards.map(({ category, slug, sha256, size, key, published }) => ({ category, slug, sha256, size, key, published })),
  };
  const planDigest = sha256Bytes(JSON.stringify(planMaterial));
  candidateManifest.promotion = {
    operation: OPERATION,
    planDigest,
    inputManifestSha256,
    logicalCardCount: logicalCards.length,
    publishedCardCount,
    uniqueObjectCount: objects.length,
  };
  return {
    manifestPath: path.resolve(manifestPath),
    assetsRoot: path.resolve(assetsRoot),
    inputManifestSha256,
    planDigest,
    sourceManifest,
    candidateManifest,
    logicalCards,
    objects,
    totalBytes: objects.reduce((total, object) => total + object.size, 0),
    cdnBase: normalizedCdnBase,
  };
}

export async function writeAtomic(filename, content) {
  const resolved = path.resolve(filename);
  await mkdir(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, resolved);
}

export async function writeCandidateManifest(filename, plan) {
  await writeAtomic(filename, `${JSON.stringify(plan.candidateManifest, null, 2)}\n`);
}

export async function readJsonLines(filename) {
  try {
    const text = await readFile(filename, "utf8");
    return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSONL at ${filename}:${index + 1}: ${error.message}`);
      }
    });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export function createLedgerWriter(filename) {
  let chain = Promise.resolve();
  return async (record) => {
    chain = chain.then(async () => {
      await mkdir(path.dirname(path.resolve(filename)), { recursive: true });
      await appendFile(filename, `${JSON.stringify({ ...record, recordedAt: new Date().toISOString() })}\n`);
    });
    return chain;
  };
}

function latestVerifiedObjects(records, planDigest) { const verified = new Map();
for (const record of records) {
  if (record.planDigest !== planDigest || record.type !== "object") continue;
  if (VERIFIED_OBJECT_STATUSES.has(record.status)) verified.set(record.key, record);
}
return verified; }

function latestPreflightObjects(records, planDigest) { const results = new Map();
for (const record of records) {
  if (record.planDigest !== planDigest || record.type !== "object") continue;
  if (VERIFIED_OBJECT_STATUSES.has(record.status) || record.status === "absent") results.set(record.key, record);
}
return results; }

export function hasCompletedCanary(records, planDigest) {
  return records.some((record) => record.type === "canary-complete" && record.planDigest === planDigest);
}

function hasCompletedFullRun(records, planDigest, objectCount) { return records.some((record) => record.type === "full-complete" && record.planDigest === planDigest && record.objectCount === objectCount); }

/**
 * The verifier scopes its run to every unique key in the candidate manifest,
 * which is a superset of the publisher's uploadable objects once carried-through
 * cards are in play. So the gate is per-object: an exhaustive completion for
 * this plan, and within that run an exact digest/size verification of every
 * object this plan publishes.
 */
function hasCompletedObjectVerification(records, plan) { const completion = records.find((record) => (
  record.type === "object-verification-complete"
  && record.planDigest === plan.planDigest
  && typeof record.runId === "string"
  && record.runId.length > 0
  && record.exhaustive === true
  && record.objectCount >= plan.objects.length
));
if (!completion) return false;
const verifiedByKey = new Map();
for (const record of records) {
  if (record.type === "object-verified" && record.planDigest === plan.planDigest && record.runId === completion.runId) {
    verifiedByKey.set(record.key, record);
  }
}
return plan.objects.every((object) => {
  const verified = verifiedByKey.get(object.key);
  return verified && verified.sha256 === object.sha256 && verified.size === object.size;
}); }

export function selectCanaryObjects(plan, selectors) {
  if (!Array.isArray(selectors) || selectors.length === 0) throw new Error("Canary selector file must contain a non-empty JSON array");
  const selectedKeys = new Set();
  for (const selector of selectors) {
    if (typeof selector === "string" && KEY_PATTERN.test(selector)) selectedKeys.add(selector);
    else {
      const category = typeof selector === "string" ? selector.split(":", 1)[0] : selector?.category;
      const slug = typeof selector === "string" ? selector.slice(category.length + 1) : selector?.slug;
      const card = plan.logicalCards.find((entry) => entry.category === category && entry.slug === slug);
      if (!card) throw new Error(`Unknown canary selector: ${JSON.stringify(selector)}`);
      selectedKeys.add(card.key);
    }
  }
  return plan.objects.filter((object) => selectedKeys.has(object.key));
}

export function assertRemoteDigest(object, actual, label = "R2") {
  if (actual.sha256 !== object.sha256 || actual.size !== object.size) {
    throw new Error(`IMMUTABLE COLLISION at ${object.key}: ${label} has ${actual.size}/${actual.sha256}, expected ${object.size}/${object.sha256}`);
  }
}

export async function processObjects({
  plan,
  objects,
  storage,
  ledgerPath,
  mode,
  concurrency = 4,
  resume = true,
}) {
  if (!new Set(["preflight", "canary-apply", "full-apply"]).has(mode)) throw new Error(`Invalid object phase: ${mode}`);
  const records = await readJsonLines(ledgerPath);
  const prior = resume
    ? mode === "preflight"
      ? latestPreflightObjects(records, plan.planDigest)
      : latestVerifiedObjects(records, plan.planDigest)
    : new Map();
  const append = createLedgerWriter(ledgerPath);
  await append({ type: "run-start", operation: OPERATION, mode, planDigest: plan.planDigest, objectCount: objects.length });
  let verified = 0;
  let absent = 0;
  let uploaded = 0;
  let reused = 0;
  let resumed = 0;
  await mapConcurrent(objects, concurrency, async (object) => {
    const priorRecord = prior.get(object.key);
    if (priorRecord && priorRecord.sha256 === object.sha256 && priorRecord.size === object.size) {
      resumed += 1;
      if (priorRecord.status === "absent") absent += 1;
      else {
        verified += 1;
        if (priorRecord.status === "verified-reuse") reused += 1;
      }
      return;
    }
    const exists = await storage.exists(object.key);
    if (exists) {
      const actual = await storage.digest(object.key);
      try {
        assertRemoteDigest(object, actual);
      } catch (error) {
        await append({ type: "object", status: "collision", planDigest: plan.planDigest, key: object.key, sha256: object.sha256, size: object.size, actual });
        throw error;
      }
      await append({ type: "object", status: "verified-reuse", planDigest: plan.planDigest, key: object.key, sha256: object.sha256, size: object.size });
      reused += 1;
      verified += 1;
      return;
    }
    if (mode === "preflight") {
      await append({ type: "object", status: "absent", planDigest: plan.planDigest, key: object.key, sha256: object.sha256, size: object.size });
      absent += 1;
      return;
    }
    await storage.write(object);
    const actual = await storage.digest(object.key);
    try {
      assertRemoteDigest(object, actual, "post-write R2 readback");
    } catch (error) {
      await append({ type: "object", status: "post-write-mismatch", planDigest: plan.planDigest, key: object.key, sha256: object.sha256, size: object.size, actual });
      throw error;
    }
    await append({ type: "object", status: "uploaded-verified", planDigest: plan.planDigest, key: object.key, sha256: object.sha256, size: object.size });
    uploaded += 1;
    verified += 1;
  });
  const summary = { verified, absent, uploaded, reused, resumed };
  if (mode === "canary-apply" && verified === objects.length) {
    await append({ type: "canary-complete", operation: OPERATION, planDigest: plan.planDigest, objectCount: objects.length, summary });
  }
  if (mode === "full-apply" && verified === objects.length) {
    await append({ type: "full-complete", operation: OPERATION, planDigest: plan.planDigest, objectCount: plan.objects.length, summary });
  }
  return summary;
}

export async function installCandidateManifest({
  plan,
  candidatePath,
  targetPath,
  rollbackPath,
  publisherLedgerPath,
  verificationLedgerPath,
}) {
  const publisherRecords = await readJsonLines(publisherLedgerPath);
  if (!hasCompletedFullRun(publisherRecords, plan.planDigest, plan.objects.length)) {
    throw new Error("Refusing manifest install without a complete object-publication ledger");
  }
  const verificationRecords = await readJsonLines(verificationLedgerPath);
  if (!hasCompletedObjectVerification(verificationRecords, plan)) {
    throw new Error("Refusing manifest install without exhaustive object verification for this exact plan and byte count");
  }
  const candidateText = await readFile(candidatePath, "utf8");
  const candidate = JSON.parse(candidateText);
  if (candidate.promotion?.planDigest !== plan.planDigest) throw new Error("Candidate manifest plan digest mismatch");
  const currentText = await readFile(targetPath, "utf8");
  try {
    await stat(rollbackPath);
    throw new Error(`Rollback manifest already exists: ${rollbackPath}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await writeAtomic(rollbackPath, currentText);
  await writeAtomic(targetPath, candidateText);
  const append = createLedgerWriter(publisherLedgerPath);
  await append({
    type: "manifest-installed",
    operation: OPERATION,
    planDigest: plan.planDigest,
    targetPath: path.resolve(targetPath),
    rollbackPath: path.resolve(rollbackPath),
    priorManifestSha256: sha256Bytes(currentText),
    candidateManifestSha256: sha256Bytes(candidateText),
  });
}

export function parseFlagValues(argv, name) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === name) values.push(argv[index + 1]);
    else if (arg.startsWith(`${name}=`)) values.push(arg.slice(name.length + 1));
  }
  return values.filter((value) => value !== undefined);
}

export function parseFlagValue(argv, name, fallback) {
  return parseFlagValues(argv, name).at(-1) ?? fallback;
}
