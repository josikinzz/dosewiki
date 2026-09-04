import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { afterEach, test } from "node:test";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { createPublicFixtureCorpus } from "../../src/test/fixtures/publicCorpus.mjs";
import { startPublicReadStub } from "./convexStub.mjs";

const previewsPage = makeFunctionReference("substanceIndex:getPublicPreviewsPage");

const cleanups = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

const startStub = async (corpus = createPublicFixtureCorpus()) => {
  const stub = await startPublicReadStub({ corpus });
  cleanups.push(stub.close);
  return stub;
};

const postQuery = (stub, body) => fetch(`${stub.url}/api/query`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

// fetch (undici) strips a caller-supplied Host header, so the Host guard is
// exercised over a raw node:http request that sends exactly the header given.
const postQueryWithHost = (stub, body, host) => new Promise((resolve, reject) => {
  const { hostname, port } = new URL(stub.url);
  const req = httpRequest(
    { hostname, port, method: "POST", path: "/api/query", headers: { "content-type": "application/json", host } },
    (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        json: () => JSON.parse(Buffer.concat(chunks).toString("utf8")),
      }));
    },
  );
  req.once("error", reject);
  req.end(JSON.stringify(body));
});

test("serves deterministic paginated public projections over loopback", async () => {
  const corpus = createPublicFixtureCorpus();
  const stub = await startStub(corpus);
  assert.match(stub.url, /^http:\/\/127\.0\.0\.1:\d+$/);

  const client = new ConvexHttpClient(stub.url);
  const limit = 32;
  const first = await client.query(previewsPage, { limit });
  const second = await client.query(previewsPage, { limit, cursor: first.cursor });

  assert.ok(corpus.substances.length > limit, "fixture corpus must span more than one page");
  assert.equal(first.items.length, limit);
  assert.equal(first.isDone, false);
  assert.deepEqual(first.items, corpus.substances.slice(0, limit));
  assert.deepEqual(second.items, corpus.substances.slice(limit, limit * 2));
  assert.deepEqual(stub.requests, [
    { path: "substanceIndex:getPublicPreviewsPage", args: { limit } },
    { path: "substanceIndex:getPublicPreviewsPage", args: { limit, cursor: first.cursor } },
  ]);
});

test("walks the whole corpus through the cursor without gaps, overlap, or drift", async () => {
  const corpus = createPublicFixtureCorpus();
  const stub = await startStub(corpus);
  const client = new ConvexHttpClient(stub.url);
  const limit = 100;

  const served = [];
  let cursor;
  let page;
  do {
    page = await client.query(previewsPage, cursor === undefined ? { limit } : { limit, cursor });
    assert.ok(page.items.length > 0, "every page before completion carries items");
    assert.ok(page.items.length <= limit);
    served.push(...page.items);
    cursor = page.cursor;
  } while (!page.isDone);

  assert.equal(page.cursor, null, "the final page reports no next cursor");
  assert.deepEqual(served, corpus.substances);
  assert.equal(new Set(served.map((item) => item.slug)).size, served.length, "slugs are unique");
  assert.equal(stub.requests.length, Math.ceil(corpus.substances.length / limit));
});

test("falls back to the default page size for missing or invalid limits", async () => {
  const stub = await startStub();
  const client = new ConvexHttpClient(stub.url);

  const implicit = await client.query(previewsPage, {});
  const zero = await client.query(previewsPage, { limit: 0 });
  const fractional = await client.query(previewsPage, { limit: 2.5 });

  assert.ok(implicit.items.length > 0);
  assert.equal(zero.items.length, implicit.items.length);
  assert.equal(fractional.items.length, implicit.items.length);
});

test("fails closed for unknown reads, writes, and non-query endpoints", async () => {
  const stub = await startStub();
  const client = new ConvexHttpClient(stub.url);
  const unknown = makeFunctionReference("unknown:read");

  await assert.rejects(client.query(unknown, {}), /not allowlisted/i);
  await assert.rejects(client.query(makeFunctionReference("substanceIndex:replaceAll"), {}), /not allowlisted/i);

  const missingPath = await postQuery(stub, { args: [{}] });
  assert.equal(missingPath.status, 200);
  assert.deepEqual(await missingPath.json(), {
    status: "error",
    errorMessage: "Public fixture query is not allowlisted: <missing>",
  });

  const mutationResponse = await fetch(`${stub.url}/api/mutation`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "substanceIndex:replaceAll", args: [{}] }),
  });
  assert.equal(mutationResponse.status, 405);

  const actionResponse = await fetch(`${stub.url}/api/action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "substanceIndex:rebuild", args: [{}] }),
  });
  assert.equal(actionResponse.status, 405);

  const getResponse = await fetch(`${stub.url}/api/query`);
  assert.equal(getResponse.status, 405);

  const malformed = await fetch(`${stub.url}/api/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  assert.equal(malformed.status, 400);

  assert.deepEqual(
    stub.requests.map(({ path }) => path),
    ["unknown:read", "substanceIndex:replaceAll", ""],
    "only parsed query bodies are recorded; rejected transports never reach the allowlist",
  );
});

test("rejects requests whose Host header is not the loopback address", async () => {
  const corpus = createPublicFixtureCorpus();
  const stub = await startStub(corpus);
  const body = { path: "substanceIndex:getPublicPreviewsPage", args: [{ limit: 1 }] };

  for (const host of ["fixture.example.com", "localhost", "0.0.0.0:80", "[::1]:3210"]) {
    const response = await postQueryWithHost(stub, body, host);
    assert.equal(response.status, 421, `Host ${JSON.stringify(host)} must be refused`);
  }
  assert.equal(stub.requests.length, 0, "refused requests never reach the query handlers");

  const loopbackPort = new URL(stub.url).port;
  const accepted = await postQueryWithHost(stub, body, `127.0.0.1:${loopbackPort}`);
  assert.equal(accepted.status, 200);
  assert.deepEqual(accepted.json().value.items, corpus.substances.slice(0, 1));
});

test("refuses to bind anywhere except 127.0.0.1", async () => {
  const corpus = createPublicFixtureCorpus();
  for (const host of ["0.0.0.0", "localhost", "::1", ""]) {
    let error;
    try {
      const stub = await startPublicReadStub({ corpus, host });
      cleanups.push(stub.close);
    } catch (caught) {
      error = caught;
    }
    assert.ok(error, `host ${JSON.stringify(host)} must be refused, but the stub started`);
    assert.match(error.message, /must bind to 127\.0\.0\.1/);
  }
});

test("close is idempotent and releases the port", async () => {
  const stub = await startPublicReadStub({ corpus: createPublicFixtureCorpus() });
  await stub.close();
  await stub.close();
  await assert.rejects(fetch(`${stub.url}/api/query`, { method: "POST", body: "{}" }));
});

test("the public fixture corpus is non-empty, internally consistent, and free of private data", () => {
  const corpus = createPublicFixtureCorpus();

  for (const [name, rows] of Object.entries(corpus)) {
    assert.ok(Array.isArray(rows) && rows.length > 0, `${name} must be a non-empty array`);
    assert.equal(new Set(rows.map((row) => row.slug)).size, rows.length, `${name} slugs are unique`);
  }

  const substanceNames = new Set(corpus.substances.map((row) => row.name));
  for (const report of corpus.reports) {
    for (const reference of report.substances) {
      assert.ok(substanceNames.has(reference), `report ${report.slug} references unknown substance ${reference}`);
    }
  }

  const serialized = JSON.stringify(corpus);
  assert.equal(serialized.includes("@"), false, "no email-like strings leak into the public corpus");
  assert.equal(serialized.includes("editorial_review"), false, "no editorial workflow state leaks into the public corpus");
});
