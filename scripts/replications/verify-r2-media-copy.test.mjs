import { describe, expect, it } from "vitest";

import { validateDeliveryHeaders } from "./verify-r2-media-copy.mjs";

const object = { key: "media/sha256/aa/example.webp", contentType: "image/webp" };

describe("validateDeliveryHeaders", () => {
  it("accepts the withdrawal-safe inline media contract", () => {
    const headers = new Headers({
      "accept-ranges": "bytes",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
      "content-disposition": "inline",
      "content-type": "image/webp",
    });
    expect(validateDeliveryHeaders(headers, object, "HEAD")).toEqual({
      content_type: "image/webp",
      cache_control: "no-store",
      content_disposition: "inline",
      accept_ranges: "bytes",
    });
  });

  it("rejects wrong MIME, reusable caches, forced downloads, missing ranges, or private CORS", () => {
    const valid = {
      "accept-ranges": "bytes",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "content-disposition": "inline",
      "content-type": "image/webp",
    };
    for (const patch of [
      { "content-type": "application/octet-stream" },
      { "cache-control": "no-cache" },
      { "cache-control": "public, max-age=31536000, immutable" },
      { "content-disposition": "attachment" },
      { "accept-ranges": "none" },
      { "access-control-allow-origin": "https://dose.wiki" },
    ]) {
      expect(() => validateDeliveryHeaders(new Headers({ ...valid, ...patch }), object, "GET")).toThrow();
    }
  });
});
