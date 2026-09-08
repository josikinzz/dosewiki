import { describe, expect, it } from "vitest";

import { validateDeliveryHeaders } from "./verify-r2-media-copy.mjs";

const object = { key: "media/sha256/aa/example.webp", contentType: "image/webp" };

describe("validateDeliveryHeaders", () => {
  it("accepts the public immutable inline media contract", () => {
    const headers = new Headers({
      "accept-ranges": "bytes",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=31536000, immutable",
      "content-disposition": "inline",
      "content-type": "image/webp",
    });
    expect(validateDeliveryHeaders(headers, object, "HEAD")).toEqual({
      content_type: "image/webp",
      cache_control: "public, max-age=31536000, immutable",
      content_disposition: "inline",
      accept_ranges: "bytes",
    });
  });

  it("rejects a wrong MIME type, mutable cache, forced download, missing byte ranges, or private CORS", () => {
    const valid = {
      "accept-ranges": "bytes",
      "cache-control": "public, max-age=31536000, immutable",
      "access-control-allow-origin": "*",
      "content-disposition": "inline",
      "content-type": "image/webp",
    };
    for (const patch of [
      { "content-type": "application/octet-stream" },
      { "cache-control": "no-cache" },
      { "content-disposition": "attachment" },
      { "accept-ranges": "none" },
      { "access-control-allow-origin": "https://dose.wiki" },
    ]) {
      expect(() => validateDeliveryHeaders(new Headers({ ...valid, ...patch }), object, "GET")).toThrow();
    }
  });
});
