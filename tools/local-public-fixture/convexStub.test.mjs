import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { createPublicFixtureCorpus } from "../../src/test/fixtures/publicCorpus.mjs";
import { startPublicReadStub } from "./convexStub.mjs";

const cleanups = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

const startStub = async () => {
  const stub = await startPublicReadStub({ corpus: createPublicFixtureCorpus() });
  cleanups.push(stub.close);
  return stub;
};

test("serves deterministic paginated public projections over loopback", async () => {
  const stub = await startStub();
  assert.match(stub.url, /^http:\/\/127\.0\.0\.1:\d+$/);

  const client = new ConvexHttpClient(stub.url);
  const query = makeFunctionReference("substanceIndex:getPublicPreviewsPage");
  const first = await client.query(query, { limit: 32 });
  const second = await client.query(query, { limit: 32, cursor: first.cursor });

  assert.equal(first.items.length, 32);
  assert.equal(first.isDone, false);
  assert.equal(first.items[0].slug, "fixture-substance-001");
  assert.equal(second.items[0].slug, "fixture-substance-033");
  assert.equal(stub.requests.length, 2);
});

test("fails closed for unknown reads, writes, and non-query endpoints", async () => {
  const stub = await startStub();
  const client = new ConvexHttpClient(stub.url);
  const unknown = makeFunctionReference("unknown:read");

  await assert.rejects(client.query(unknown, {}), /not allowlisted/i);

  const mutationResponse = await fetch(`${stub.url}/api/mutation`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "substanceIndex:replaceAll", args: [{}] }),
  });
  assert.equal(mutationResponse.status, 405);

  const getResponse = await fetch(`${stub.url}/api/query`);
  assert.equal(getResponse.status, 405);
});

test("generates production-scale public-only fixture counts", () => {
  const corpus = createPublicFixtureCorpus();
  assert.equal(corpus.substances.length, 577);
  assert.equal(corpus.effects.length, 233);
  assert.equal(corpus.reports.length, 163);
  assert.equal(JSON.stringify(corpus).includes("@"), false);
  assert.equal(JSON.stringify(corpus).includes("editorial_review"), false);
});
