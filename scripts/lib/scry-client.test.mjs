import assert from "node:assert/strict";
import test from "node:test";
import { buildScryHeaders, getScryApiKey, getScryQueryUrl, queryScry } from "./scry-client.mjs";

test("getScryApiKey trims configured key", () => {
  assert.equal(getScryApiKey({ SCRY_API_KEY: "  key  " }), "key");
  assert.equal(getScryApiKey({ SCRY_API_KEY: " " }), null);
});

test("getScryQueryUrl uses the public Scry endpoint by default", () => {
  assert.equal(getScryQueryUrl({}), "https://api.scry.io/v1/scry/query");
  assert.equal(getScryQueryUrl({ SCRY_QUERY_URL: " https://example.test/query " }), "https://example.test/query");
});

test("buildScryHeaders builds bearer auth and optional budget", () => {
  assert.deepEqual(buildScryHeaders({ apiKey: "secret", budget: "0.05" }), {
    Authorization: "Bearer secret",
    "Content-Type": "text/plain",
    "X-Scry-Budget": "0.05",
  });
});

test("queryScry posts SQL as text", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ rows: [{ ok: true }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await queryScry("SELECT 1", {
    apiKey: "secret",
    fetchImpl,
    queryUrl: "https://example.test/scry",
  });

  assert.deepEqual(result.body, { rows: [{ ok: true }] });
  assert.equal(calls[0].url, "https://example.test/scry");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.body, "SELECT 1");
  assert.equal(calls[0].init.headers.Authorization, "Bearer secret");
});
