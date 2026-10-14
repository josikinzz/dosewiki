import { describe, expect, it } from "vitest";

import worker from "./r2-delivery-worker.js";

const key = `media/sha256/aa/${"a".repeat(64)}.jpg`;
const origin = "https://dosewiki-media.gremblinzuwu.workers.dev";
const url = `${origin}/${key}`;
const variantKey = `_renditions/v1/${key}/640.webp`;

function expectNoStore(response) {
  for (const header of ["cache-control", "cdn-cache-control", "cloudflare-cdn-cache-control"]) {
    expect(response.headers.get(header)).toBe("no-store");
  }
}

function fixture() {
  const objects = new Map([
    [key, "original bytes"],
    [variantKey, "variant bytes"],
  ]);
  const reads = [];
  let markerUnavailable = false;
  let mediaUnavailable = false;
  const metadata = (name, value) => ({
    size: value.length,
    httpEtag: name.startsWith("_renditions/") ? '"variant"' : '"original"',
    writeHttpMetadata(headers) {
      headers.set("cache-control", "public, max-age=60");
      headers.set("cdn-cache-control", "public, max-age=60");
      headers.set("cloudflare-cdn-cache-control", "public, max-age=60");
    },
  });
  const env = {
    BUCKET: {
      async head(name) {
        reads.push(name);
        const marker = name.startsWith("_withdrawals/");
        if (marker ? markerUnavailable : mediaUnavailable) throw new Error("R2 unavailable");
        const value = objects.get(name);
        return value === undefined ? null : metadata(name, value);
      },
      async get(name, options) {
        reads.push(name);
        if (mediaUnavailable) throw new Error("R2 unavailable");
        const value = objects.get(name);
        if (value === undefined) return null;
        const meta = metadata(name, value);
        if (options.onlyIf.get("if-none-match") === meta.httpEtag) return meta;
        if (options.range?.get("range")) {
          return { ...meta, body: value.slice(0, 4), range: { offset: 0, length: 4 } };
        }
        return { ...meta, body: value };
      },
    },
  };
  return {
    env,
    objects,
    reads,
    failMarkerReads() { markerUnavailable = true; },
    failMediaReads() { mediaUnavailable = true; },
  };
}

const requestKinds = [
  {},
  { method: "HEAD" },
  { headers: { "if-none-match": '"original"' } },
  { headers: { range: "bytes=0-3" } },
];

describe("R2 managed media delivery", () => {
  it("rejects noncanonical selectors without reading R2", async () => {
    const f = fixture();
    for (const query of [
      "?width=63", "?width=100", "?width=064", "?width=64&width=64", "?width=64&quality=75", "?%77idth=64",
    ]) {
      const response = await worker.fetch(new Request(`${url}${query}`), f.env);
      expect(response.status).toBe(404);
      expectNoStore(response);
    }
    expect(f.reads).toEqual([]);
  });
});

describe("R2 managed media withdrawal", () => {
  it("blocks fresh, HEAD, conditional and range requests for originals and all renditions before media reads", async () => {
    const f = fixture();
    for (const target of [url, `${url}?width=640`]) {
      const before = await worker.fetch(new Request(target), f.env);
      expect(before.status).toBe(200);
    }
    f.objects.set(`_withdrawals/${key}`, "approved incident record");
    f.reads.length = 0;

    for (const target of [url, `${url}?social-card-integrity=original`, `${url}?width=640`, `${url}?width=128`]) {
      for (const options of [...requestKinds, { headers: { "if-none-match": '"variant"' } }]) {
        const response = await worker.fetch(new Request(target, options), f.env);
        expect(response.status).toBe(410);
        expect(await response.text()).toBe("");
        expectNoStore(response);
        expect(response.headers.has("etag")).toBe(false);
        expect(response.headers.has("content-range")).toBe(false);
      }
    }
    expect(new Set(f.reads)).toEqual(new Set([`_withdrawals/${key}`]));

    f.objects.delete(`_withdrawals/${key}`);
    const restored = await worker.fetch(new Request(`${url}?width=640`), f.env);
    expect(restored.status).toBe(200);
    expect(await restored.text()).toBe("variant bytes");
    const restoredOriginal = await worker.fetch(new Request(url), f.env);
    expect(await restoredOriginal.text()).toBe("original bytes");
  });


  it("fails closed before reading originals or renditions when withdrawal status is unavailable", async () => {
    const f = fixture();
    f.failMarkerReads();
    for (const target of [url, `${url}?width=640`]) {
      for (const options of requestKinds) {
        const response = await worker.fetch(new Request(target, options), f.env);
        expect(response.status).toBe(503);
        expect(await response.text()).toBe("");
        expect(response.headers.get("retry-after")).toBe("30");
        expectNoStore(response);
      }
    }
    expect(new Set(f.reads)).toEqual(new Set([`_withdrawals/${key}`]));
  });

  it("never exposes private markers, renditions, or noncanonical media paths", async () => {
    const f = fixture();
    f.objects.set(`_withdrawals/${key}`, "private incident record");
    for (const path of [
      `_withdrawals/${key}`, variantKey, `${variantKey}?width=640`,
      `_renditions%2fv1%2f${key}%2f640.webp`, key.replace("/aa/", "/bb/"),
    ]) {
      for (const options of [{}, { method: "HEAD" }]) {
        const response = await worker.fetch(new Request(`${origin}/${path}`, options), f.env);
        expect(response.status).toBe(404);
        expect(await response.text()).not.toMatch(/private incident record|variant bytes/);
        expectNoStore(response);
      }
    }
    expect(f.reads).toEqual([]);
  });
});
