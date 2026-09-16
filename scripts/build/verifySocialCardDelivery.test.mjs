import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildVerificationPlan,
  extractPageMetadata,
  extractNextPageRedirect,
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
    "cache-control": "no-store",
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
    assert.equal(
      plan.routes.find((route) => route.category === "replications").canonicalBehavior,
      "exact",
    );
    assert.equal(
      plan.routes.find((route) => route.category === "contributors").canonicalBehavior,
      "follow-profile-redirect",
    );
  });

  it("hashes delivered bytes and enforces withdrawal-safe response headers", async () => {
    const fetchImpl = async (_url, init = {}) => init.method === "HEAD"
      ? new Response(null, { status: 200, headers: deliveryHeaders() })
      : new Response(bytes, { status: 200, headers: deliveryHeaders() });
    assert.deepEqual(await verifyObject(fetchImpl, { url: cardUrl, key: `media/sha256/${digest.slice(0, 2)}/${digest}.jpg`, sha256: digest }), { sha256: digest, size: bytes.length });
    const corruptFetch = async (_url, init = {}) => init.method === "HEAD"
      ? new Response(null, { status: 200, headers: deliveryHeaders() })
      : new Response("wrong", { status: 200, headers: { ...deliveryHeaders(), "content-length": "5" } });
    await assert.rejects(verifyObject(corruptFetch, { url: cardUrl, key: "key", sha256: digest }), /digest mismatch/);
    const reusableFetch = async (_url, init = {}) => new Response(init.method === "HEAD" ? null : bytes, {
      status: 200,
      headers: { ...deliveryHeaders(), "cache-control": "public, max-age=31536000, immutable" },
    });
    await assert.rejects(verifyObject(reusableFetch, { url: cardUrl, key: "key", sha256: digest }), /Withdrawal-safe cache policy/);
  });

  it("rejects a 206 or a stray Content-Range on the range-less crawler GET", async () => {
    const contentRange = `bytes 0-${bytes.length - 1}/${bytes.length}`;
    const full206Fetch = async (_url, init = {}) => init.method === "HEAD"
      ? new Response(null, { status: 200, headers: deliveryHeaders() })
      : new Response(bytes, { status: 206, headers: { ...deliveryHeaders(), "content-range": contentRange } });
    await assert.rejects(
      verifyObject(full206Fetch, { url: cardUrl, key: "full-206", sha256: digest }),
      /GET full-206: HTTP 206/,
    );

    const strayRangeFetch = async (_url, init = {}) => init.method === "HEAD"
      ? new Response(null, { status: 200, headers: deliveryHeaders() })
      : new Response(bytes, { status: 200, headers: { ...deliveryHeaders(), "content-range": contentRange } });
    await assert.rejects(
      verifyObject(strayRangeFetch, { url: cardUrl, key: "stray-range", sha256: digest }),
      /Unexpected Content-Range on range-less GET/,
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

  it("accepts the intentional contributor-to-artist canonical after following the redirect", async () => {
    const canonical = "https://dose.wiki/replications/artist/013a";
    const html = `<html><head>
      <meta property="og:image" content="${cardUrl}">
      <meta name="twitter:image" content="${cardUrl}">
      <link rel="canonical" href="${canonical}">
      <meta id="__next-page-redirect" http-equiv="refresh" content="0;url=/replications/artist/013a">
    </head></html>`;
    const route = {
      host: "https://dose.wiki",
      category: "contributors",
      pageUrl: "https://dose.wiki/contributors/013a",
      canonicalUrl: "https://dose.wiki/contributors/013a",
      canonicalBehavior: "follow-profile-redirect",
      expectedImageUrl: cardUrl,
    };
    const response = {
      status: 200,
      // This matches the live Next.js behavior: the response stays HTTP 200
      // at the contributor URL and exposes the 308 destination in HTML.
      url: `${route.pageUrl}?social-card-verify=1`,
      text: async () => html,
    };

    assert.equal(extractNextPageRedirect(html), "/replications/artist/013a");
    assert.deepEqual(await verifyRoute(async () => response, route), {
      ogImage: cardUrl,
      twitterImage: cardUrl,
      canonical,
    });

    const wrongCanonical = html.replace(canonical, "https://dose.wiki/replications/artist/someone-else");
    await assert.rejects(
      verifyRoute(async () => ({ ...response, text: async () => wrongCanonical }), route),
      /canonical/,
    );
  });

  it("still accepts a contributor whose profile does not redirect", async () => {
    const canonical = "https://effectindex.com/contributors/reviewer";
    const html = `<html><head>
      <meta property="og:image" content="${cardUrl}">
      <meta name="twitter:image" content="${cardUrl}">
      <link rel="canonical" href="${canonical}">
    </head></html>`;
    const route = {
      host: "https://effectindex.com",
      category: "contributors",
      pageUrl: canonical,
      canonicalUrl: canonical,
      canonicalBehavior: "follow-profile-redirect",
      expectedImageUrl: cardUrl,
    };

    assert.deepEqual(
      await verifyRoute(
        async () => ({ status: 200, url: `${canonical}?social-card-verify=1`, text: async () => html }),
        route,
      ),
      { ogImage: cardUrl, twitterImage: cardUrl, canonical },
    );
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
