import { describe, expect, it } from "vitest";

import worker from "./r2-delivery-worker.js";

const key = `media/sha256/aa/${"a".repeat(64)}.jpg`;
const origin = "https://dosewiki-media.gremblinzuwu.workers.dev";
const url = `${origin}/${key}`;
const variantKey = `_renditions/v1/${key}/640.webp`;
const videoKey = key.replace(/\.jpg$/, ".mp4");

function expectNoStore(response) {
  for (const header of ["cache-control", "cdn-cache-control", "cloudflare-cdn-cache-control"]) {
    expect(response.headers.get(header)).toBe("no-store");
  }
}

function fixture() {
  const objects = new Map([
    [key, "original bytes"],
    [variantKey, "variant bytes"],
    [videoKey, "video bytes"],
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
  it("serves originals without caching, retaining HEAD and conditional responses", async () => {
    const f = fixture();
    const original = await worker.fetch(new Request(`${url}?social-card-integrity=original`), f.env);
    expect(original.status).toBe(200);
    expect(original.headers.has("content-range")).toBe(false);
    expect(original.headers.get("content-type")).toBe("image/jpeg");
    expect(original.headers.get("content-disposition")).toBe("inline");
    expect(await original.text()).toBe("original bytes");
    expectNoStore(original);

    const head = await worker.fetch(new Request(url, { method: "HEAD" }), f.env);
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe("14");
    expect(await head.text()).toBe("");
    expectNoStore(head);

    const conditional = await worker.fetch(new Request(url, { headers: { "if-none-match": '"original"' } }), f.env);
    expect(conditional.status).toBe(304);
    expect(await conditional.text()).toBe("");
    expectNoStore(conditional);
  });

  it("preserves video byte ranges without caching partial responses", async () => {
    const f = fixture();
    const range = await worker.fetch(new Request(`${origin}/${videoKey}`, { headers: { range: "bytes=0-3" } }), f.env);
    expect(range.status).toBe(206);
    expect(range.headers.get("content-type")).toBe("video/mp4");
    expect(range.headers.get("accept-ranges")).toBe("bytes");
    expect(range.headers.get("content-range")).toBe("bytes 0-3/11");
    expect(range.headers.get("content-length")).toBe("4");
    expect(await range.text()).toBe("vide");
    expectNoStore(range);
  });

  it("serves fixed WebP renditions at both width boundaries without redirecting or replacing originals", async () => {
    const f = fixture();
    for (const width of [64, 3840]) {
      f.objects.set(`_renditions/v1/${key}/${width}.webp`, `rendition ${width}`);
      const response = await worker.fetch(new Request(`${url}?width=${width}`), f.env);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/webp");
      expect(response.headers.has("location")).toBe(false);
      expect(await response.text()).toBe(`rendition ${width}`);
      expectNoStore(response);
    }
    const original = await worker.fetch(new Request(url), f.env);
    expect(await original.text()).toBe("original bytes");
  });

  it("uses rendition metadata for HEAD and conditional delivery", async () => {
    const f = fixture();
    const head = await worker.fetch(new Request(`${url}?width=640`, { method: "HEAD" }), f.env);
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe("13");
    expect(head.headers.get("content-type")).toBe("image/webp");
    expect(await head.text()).toBe("");
    expectNoStore(head);
    const conditional = await worker.fetch(new Request(`${url}?width=640`, { headers: { "if-none-match": '"variant"' } }), f.env);
    expect(conditional.status).toBe(304);
    expect(conditional.headers.get("etag")).toBe('"variant"');
    expectNoStore(conditional);
  });

  it("admits renditions only for the supported raster original formats", async () => {
    const f = fixture();
    for (const extension of ["jpg", "jpeg", "png", "webp", "avif", "gif", "svg", "mp4", "ogg"]) {
      const originalKey = key.replace(/\.jpg$/, `.${extension}`);
      f.objects.set(`_renditions/v1/${originalKey}/640.webp`, "rendition bytes");
      const response = await worker.fetch(new Request(`${origin}/${originalKey}?width=640`), f.env);
      const supported = ["jpg", "jpeg", "png", "webp", "avif"].includes(extension);
      expect(response.status).toBe(supported ? 200 : 404);
      if (supported) expect(await response.text()).toBe("rendition bytes");
      expectNoStore(response);
    }
  });

  it("rejects noncanonical selectors without reading R2", async () => {
    const f = fixture();
    for (const query of [
      "?width=63", "?width=3841", "?width=100", "?width=064", "?width=64.0",
      "?width=-64", "?width=", "?width=NaN", "?width=64&width=64", "?width=64&quality=75",
      "?width=64&", "?%77idth=64", "?width=%36%34",
    ]) {
      const response = await worker.fetch(new Request(`${url}${query}`), f.env);
      expect(response.status).toBe(404);
      expectNoStore(response);
    }
    expect(f.reads).toEqual([]);
  });

  it("returns no-store 404 for missing originals and renditions without falling back", async () => {
    const f = fixture();
    for (const options of [{}, { method: "HEAD" }]) {
      const missingVariant = await worker.fetch(new Request(`${url}?width=128`, options), f.env);
      expect(missingVariant.status).toBe(404);
      expect(missingVariant.headers.has("location")).toBe(false);
      expect(await missingVariant.text()).not.toContain("original bytes");
      expectNoStore(missingVariant);
    }
    f.objects.delete(key);
    const missing = await worker.fetch(new Request(url), f.env);
    expect(missing.status).toBe(404);
    expectNoStore(missing);
  });

  it("rejects unsupported methods without cacheable errors or bucket reads", async () => {
    const f = fixture();
    const response = await worker.fetch(new Request(url, { method: "POST" }), f.env);
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
    expectNoStore(response);
    expect(f.reads).toEqual([]);
  });

  it("returns no-store service errors when media reads fail after the marker check", async () => {
    const f = fixture();
    f.failMediaReads();
    for (const options of [{}, { method: "HEAD" }]) {
      const response = await worker.fetch(new Request(url, options), f.env);
      expect(response.status).toBe(503);
      expectNoStore(response);
    }
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

  it("blocks video range delivery after withdrawal", async () => {
    const f = fixture();
    f.objects.set(`_withdrawals/${videoKey}`, "approved incident record");
    const response = await worker.fetch(new Request(`${origin}/${videoKey}`, { headers: { range: "bytes=0-3" } }), f.env);
    expect(response.status).toBe(410);
    expect(await response.text()).toBe("");
    expect(f.reads).toEqual([`_withdrawals/${videoKey}`]);
    expectNoStore(response);
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
