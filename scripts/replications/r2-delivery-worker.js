const R2_KEY_PATTERN = /^media\/sha256\/([0-9a-f]{2})\/([0-9a-f]{64})\.([a-z0-9]{2,5})$/;
const VARIANT_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "avif"]);
const VARIANT_WIDTHS = new Set([64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840]);

const CONTENT_TYPE_BY_EXTENSION = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  webp: "image/webp",
  avif: "image/avif",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  ogg: "audio/ogg",
};

const WITHDRAWAL_PREFIX = "_withdrawals/";

function publicResponse(status, body = null) {
  return new Response(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "cdn-cache-control": "no-store",
      "cloudflare-cdn-cache-control": "no-store",
      "access-control-allow-origin": "*",
      ...(status === 503 ? { "retry-after": "30" } : {}),
    },
  });
}

function objectHeaders(object, key) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.get("content-type")) {
    const extension = key.slice(key.lastIndexOf(".") + 1);
    headers.set("content-type", CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream");
  }
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "no-store");
  headers.set("cdn-cache-control", "no-store");
  headers.set("cloudflare-cdn-cache-control", "no-store");
  headers.set("accept-ranges", "bytes");
  headers.set("content-disposition", "inline");
  headers.set("access-control-allow-origin", "*");
  return headers;
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      const response = publicResponse(405, "Method Not Allowed");
      response.headers.set("allow", "GET, HEAD");
      return response;
    }

    const url = new URL(request.url);
    const key = url.pathname.replace(/^\//, "");
    const match = R2_KEY_PATTERN.exec(key);
    if (!match || !match[2].startsWith(match[1])) {
      return publicResponse(404, "Not Found");
    }

    let deliveryKey = key;
    if (url.searchParams.has("width")) {
      const selector = /^\?width=([1-9]\d*)$/.exec(url.search);
      if (!selector || !VARIANT_WIDTHS.has(Number(selector[1])) || !VARIANT_EXTENSIONS.has(match[3])) {
        return publicResponse(404, "Not Found");
      }
      deliveryKey = `_renditions/v1/${key}/${selector[1]}.webp`;
    }

    try {
      if (await env.BUCKET.head(`${WITHDRAWAL_PREFIX}${key}`)) {
        return publicResponse(410);
      }
    } catch {
      return publicResponse(503);
    }

    if (request.method === "HEAD") {
      let head;
      try {
        head = await env.BUCKET.head(deliveryKey);
      } catch {
        return publicResponse(503);
      }
      if (!head) return publicResponse(404);
      const headers = objectHeaders(head, deliveryKey);
      headers.set("content-length", String(head.size));
      return new Response(null, { status: 200, headers });
    }

    const rangeRequested = request.headers.has("range");
    let object;
    try {
      object = await env.BUCKET.get(deliveryKey, {
        ...(rangeRequested ? { range: request.headers } : {}),
        onlyIf: request.headers,
      });
    } catch {
      return publicResponse(503);
    }
    if (!object) return publicResponse(404, "Not Found");

    const headers = objectHeaders(object, deliveryKey);

    if (!object.body) {
      return new Response(null, { status: 304, headers });
    }

    if (rangeRequested && object.range) {
      const offset = object.range.offset ?? 0;
      const length = object.range.length ?? object.size - offset;
      headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
      headers.set("content-length", String(length));
      return new Response(object.body, { status: 206, headers });
    }

    headers.set("content-length", String(object.size));
    return new Response(object.body, { status: 200, headers });
  },
};
