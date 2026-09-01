import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildVerificationPlan,
  extractPageMetadata,
  parseImmutableCardUrl,
  verifyObject,
  verifyRoute,
  runVerification,
} from "./verifySocialCardDelivery.mjs";
import { sha256Bytes } from "./socialCardR2Pipeline.mjs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const bytes = Buffer.from("card-bytes");
const digest = sha256Bytes(bytes);
const cardUrl = `https://dosewiki-media.gremblinzuwu.workers.dev/media/sha256/${digest.slice(0, 2)}/${digest}.jpg`;

function deliveryHeaders() {
  return {
    "content-type": "image/jpeg",
    "content-length": String(bytes.length),
    "cache-control": "public, max-age=31536000, immutable",
    "content-disposition": "inline",
    "accept-ranges": "bytes",
  };
}

describe("exhaustive social-card delivery verification", () => {
  it("rejects non-canonical keys and constructs both-host route coverage", () => {
    assert.throws(() => parseImmutableCardUrl(`https://dosewiki-media.gremblinzuwu.workers.dev/media/sha256/00/${digest}.jpg`), /Non-canonical/);
    const plan = buildVerificationPlan({
      promotion: { planDigest: "a".repeat(64) },
      cards: { replications: { work: cardUrl }, contributors: { artist: cardUrl }, effects: {}, reports: {} },
    });
    assert.equal(plan.objects.length, 1);
    assert.equal(plan.routes.length, 4);
    assert.deepEqual(new Set(plan.routes.map((route) => route.host)), new Set(["https://dose.wiki", "https://effectindex.com"]));
  });

  it("hashes delivered bytes and enforces immutable response headers", async () => {
    const fetchImpl = async (_url, init = {}) => init.method === "HEAD"
      ? new Response(null, { status: 200, headers: deliveryHeaders() })
      : new Response(bytes, { status: 200, headers: deliveryHeaders() });
    assert.deepEqual(await verifyObject(fetchImpl, { url: cardUrl, key: `media/sha256/${digest.slice(0, 2)}/${digest}.jpg`, sha256: digest }), { sha256: digest, size: bytes.length });
    const corruptFetch = async (_url, init = {}) => init.method === "HEAD"
      ? new Response(null, { status: 200, headers: deliveryHeaders() })
      : new Response("wrong", { status: 200, headers: { ...deliveryHeaders(), "content-length": "5" } });
    await assert.rejects(verifyObject(corruptFetch, { url: cardUrl, key: "key", sha256: digest }), /digest mismatch/);
  });

  it("accepts a full-byte HTTP 206 and rejects partial or inconsistent ranges", async () => {
    const full206Headers = {
      ...deliveryHeaders(),
      "content-range": `bytes 0-${bytes.length - 1}/${bytes.length}`,
    };
    const full206Fetch = async (_url, init = {}) => init.method === "HEAD"
      ? new Response(null, { status: 200, headers: deliveryHeaders() })
      : new Response(bytes, { status: 206, headers: full206Headers });
    assert.deepEqual(
      await verifyObject(full206Fetch, { url: cardUrl, key: "full-206", sha256: digest }),
      { sha256: digest, size: bytes.length },
    );

    const partialBytes = bytes.subarray(0, 4);
    const partialDigest = sha256Bytes(partialBytes);
    const partial206Fetch = async (_url, init = {}) => init.method === "HEAD"
      ? new Response(null, { status: 200, headers: { ...deliveryHeaders(), "content-length": String(partialBytes.length) } })
      : new Response(partialBytes, {
        status: 206,
        headers: {
          ...deliveryHeaders(),
          "content-length": String(partialBytes.length),
          "content-range": `bytes 0-${partialBytes.length - 1}/${bytes.length}`,
        },
      });
    await assert.rejects(
      verifyObject(partial206Fetch, { url: cardUrl, key: "partial-206", sha256: partialDigest }),
      /Incomplete HTTP 206 response/,
    );
  });

  it("parses arbitrary attribute order and requires exact canonical and social tags", async () => {
    const html = `<html><head>
      <meta content="${cardUrl}" property="og:image">
      <meta content="${cardUrl}" name="twitter:image">
      <link href="https://effectindex.com/replications/work" rel="canonical">
    </head></html>`;
    assert.deepEqual(extractPageMetadata(html), { ogImage: cardUrl, twitterImage: cardUrl, canonical: "https://effectindex.com/replications/work" });
    const route = {
      pageUrl: "https://effectindex.com/replications/work",
      canonicalUrl: "https://effectindex.com/replications/work",
      expectedImageUrl: cardUrl,
    };
    assert.deepEqual(await verifyRoute(async () => new Response(html, { status: 200 }), route), { ogImage: cardUrl, twitterImage: cardUrl, canonical: route.canonicalUrl });
    const fallback = html.replaceAll(cardUrl, "https://effectindex.com/effectindex/social-card.png");
    await assert.rejects(verifyRoute(async () => new Response(fallback, { status: 200 }), route), /og:image/);
  });

  it("derives an exhaustive object-complete marker from exact resumable coverage without fetching", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "social-card-verify-"));
    const ledger = path.join(root, "verification.jsonl");
    const plan = buildVerificationPlan({ promotion: { planDigest: "b".repeat(64) }, cards: { replications: { work: cardUrl } } });
    await writeFile(ledger, `${JSON.stringify({ type: "object-verified", planDigest: plan.planDigest, runId: "predeploy", key: plan.objects[0].key, sha256: digest, size: bytes.length })}\n`);
    let fetches = 0;
    await runVerification({ plan, ledgerPath: ledger, fetchImpl: async () => { fetches += 1; throw new Error("must resume"); }, objectsOnly: true, runId: "predeploy" });
    const rows = (await readFile(ledger, "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(fetches, 0);
    assert.equal(rows.some((row) => row.type === "object-verification-complete" && row.objectCount === 1 && row.totalBytes === bytes.length && row.exhaustive === true), true);
  });
});
