import { describe, expect, it } from "vitest";

import worker from "./r2-delivery-worker.js";

const key = `media/sha256/aa/${"a".repeat(64)}.jpg`;
const url = `https://media.example/${key}`;

function fixture() {
  const objects = new Map([[key, "original bytes"]]);
  let unavailable = false;
  const metadata = (value) => ({
    size: value.length,
    httpEtag: '"original"',
    writeHttpMetadata(headers) { headers.set("content-type", "image/jpeg"); },
  });
  const env = {
    BUCKET: {
      async head(name) {
        if (unavailable) throw new Error("R2 unavailable");
        const value = objects.get(name);
        return value === undefined ? null : metadata(value);
      },
      async get(name, options) {
        const value = objects.get(name);
        if (value === undefined) return null;
        if (options.onlyIf.get("if-none-match") === '"original"') return metadata(value);
        if (options.range?.get("range")) {
          return { ...metadata(value), body: value.slice(0, 4), range: { offset: 0, length: 4 } };
        }
        return { ...metadata(value), body: value };
      },
    },
  };
  return { env, objects, failMarkerReads() { unavailable = true; } };
}

describe("R2 managed media withdrawal", () => {
  it("blocks fresh, HEAD, conditional and range requests before serving previously available media", async () => {
    const f = fixture();
    const before = await worker.fetch(new Request(url), f.env);
    expect(await before.text()).toBe("original bytes");
    f.objects.set(`_withdrawals/${key}`, "approved incident record");

    for (const options of [
      {},
      { method: "HEAD" },
      { headers: { "if-none-match": '"original"' } },
      { headers: { range: "bytes=0-3" } },
    ]) {
      const response = await worker.fetch(new Request(`${url}?old-manifest=1`, options), f.env);
      expect(response.status).toBe(410);
      expect(await response.text()).toBe("");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("no-store");
      expect(response.headers.has("etag")).toBe(false);
    }

    // Removing the approved marker, without rewriting media, recovers delivery.
    f.objects.delete(`_withdrawals/${key}`);
    const restored = await worker.fetch(new Request(url), f.env);
    expect(restored.status).toBe(200);
    expect(await restored.text()).toBe("original bytes");
  });

  it("fails closed when withdrawal status cannot be read", async () => {
    const f = fixture();
    f.failMarkerReads();
    const response = await worker.fetch(new Request(url), f.env);
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("never exposes incident marker contents through the public namespace", async () => {
    const f = fixture();
    f.objects.set(`_withdrawals/${key}`, "private incident record");
    const response = await worker.fetch(new Request(`https://media.example/_withdrawals/${key}`), f.env);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("private incident record");
  });

  it("preserves ordinary HEAD, conditional, and range delivery without a marker", async () => {
    const f = fixture();
    const head = await worker.fetch(new Request(url, { method: "HEAD" }), f.env);
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe("14");
    expect(await head.text()).toBe("");
    const conditional = await worker.fetch(new Request(url, { headers: { "if-none-match": '"original"' } }), f.env);
    expect(conditional.status).toBe(304);
    const range = await worker.fetch(new Request(url, { headers: { range: "bytes=0-3" } }), f.env);
    expect(range.status).toBe(206);
    expect(range.headers.get("content-range")).toBe("bytes 0-3/14");
    expect(await range.text()).toBe("orig");
  });
});
