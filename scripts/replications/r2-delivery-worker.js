/**
 * Cloudflare Worker serving the private `replications` R2 bucket as the public
 * replication-media delivery surface (docs/operations/replication-media-delivery.md#urgent-media-withdrawal).
 *
 * This file is the deployed artifact, kept in-repo as the source of truth.
 * Deploy via dashboard: Workers & Pages -> Create Worker -> paste this file,
 * then Settings -> Bindings -> R2 bucket: variable name `BUCKET`, bucket
 * `replications`. The resulting `https://<name>.<account>.workers.dev` URL is
 * the value for the Postgres deployment variable REPLICATION_MEDIA_BASE_URL.
 *
 * Contract, matching `resolveReplicationUrls` and the migration acceptance
 * checks:
 * - GET/HEAD only; any other method is 405.
 * - Only canonical content-addressed keys (`media/sha256/<2-hex>/<sha256>.<ext>`,
 *   shard repeating the digest's first two characters) are ever looked up;
 *   everything else is 404 without touching the bucket.
 * - Byte ranges are honored (video seeking); responses carry Accept-Ranges.
 *   A GET with no Range header answers 200, never a full-object 206.
 * - Requests without a width selector serve the original. `?width=<allowed-width>` serves a private
 *   fixed-quality WebP rendition of a raster original, without a redirect.
 * - Every response is no-store for browsers and CDNs. Conditional requests
 *   still answer 304 via the object's etag after checking withdrawal status.
 * - A private `_withdrawals/<media-key>` marker blocks GET, HEAD, conditional,
 *   and range delivery with 410 before looking up media bytes. Marker lookup
 *   failures fail closed with 503. Markers are never cached or publicly served.
 * - `Content-Disposition: inline` makes media render instead of downloading.
 * - No credential exists here: the bucket binding is capability, not secret.
 */

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

    // Keep this outside application state and ahead of every media read. R2
    // marker presence is authoritative even for old URLs in cached manifests.
    // Do not add a negative cache: it would extend the withdrawal deadline.
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

    // Forward `range` only when the client actually sent one. R2 populates
    // `R2ObjectBody.range` whenever the option is present, so passing the
    // request headers unconditionally made every plain GET answer 206 with a
    // whole-object Content-Range. RFC 9110 15.3.7 allows 206 only in reply to
    // a range request, and strict consumers reject it: Twitter's card-image
    // fetcher discards the response, which silently stripped the art from
    // every dose.wiki link preview once the cards moved onto this worker.
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

    // Precondition (If-None-Match) satisfied: R2 returns the object without a body.
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
