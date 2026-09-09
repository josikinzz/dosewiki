/**
 * Cloudflare Worker serving the private `replications` R2 bucket as the public
 * replication-media delivery surface (docs/agents/convex-to-cloudflare-r2-media-handoff.md).
 *
 * This file is the deployed artifact, kept in-repo as the source of truth.
 * Deploy via dashboard: Workers & Pages -> Create Worker -> paste this file,
 * then Settings -> Bindings -> R2 bucket: variable name `BUCKET`, bucket
 * `replications`. The resulting `https://<name>.<account>.workers.dev` URL is
 * the value for the Convex deployment variable REPLICATION_MEDIA_BASE_URL.
 *
 * Contract, matching `resolveReplicationUrls` and the migration acceptance
 * checks:
 * - GET/HEAD only; any other method is 405.
 * - Only canonical content-addressed keys (`media/sha256/<2-hex>/<sha256>.<ext>`,
 *   shard repeating the digest's first two characters) are ever looked up;
 *   everything else is 404 without touching the bucket.
 * - Byte ranges are honored (video seeking); responses carry Accept-Ranges.
 *   A GET with no Range header answers 200, never a full-object 206.
 * - Objects are immutable, so hits are `public, max-age=31536000, immutable`
 *   and conditional requests answer 304 via the object's etag.
 * - `Content-Disposition: inline` — media renders, never downloads.
 * - No credential exists here: the bucket binding is capability, not secret.
 */

const R2_KEY_PATTERN = /^media\/sha256\/([0-9a-f]{2})\/([0-9a-f]{64})\.[a-z0-9]{2,5}$/;

const CONTENT_TYPE_BY_EXTENSION = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  ogg: "audio/ogg",
};

const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

function objectHeaders(object, key) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.get("content-type")) {
    const extension = key.slice(key.lastIndexOf(".") + 1);
    headers.set("content-type", CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream");
  }
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", IMMUTABLE_CACHE);
  headers.set("accept-ranges", "bytes");
  headers.set("content-disposition", "inline");
  headers.set("access-control-allow-origin", "*");
  return headers;
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { allow: "GET, HEAD" },
      });
    }

    const key = new URL(request.url).pathname.replace(/^\//, "");
    const match = R2_KEY_PATTERN.exec(key);
    if (!match || !match[2].startsWith(match[1])) {
      return new Response("Not Found", { status: 404 });
    }

    if (request.method === "HEAD") {
      const head = await env.BUCKET.head(key);
      if (!head) return new Response(null, { status: 404 });
      const headers = objectHeaders(head, key);
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
    const object = await env.BUCKET.get(key, {
      ...(rangeRequested ? { range: request.headers } : {}),
      onlyIf: request.headers,
    });
    if (!object) return new Response("Not Found", { status: 404 });

    const headers = objectHeaders(object, key);

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
