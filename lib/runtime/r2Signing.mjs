import { createHash, createHmac } from "node:crypto";

const sha256Hex = (value) => createHash("sha256").update(value).digest("hex");
const hmac = (key, value) => createHmac("sha256", key).update(value).digest();
const awsEncode = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
  `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
);

/** R2's S3 SigV4 convention, shared by operator copies and authenticated media intake. */
export function signR2Request({ method, url, headers = {}, payloadHash, accessKeyId, secretAccessKey, now = new Date() }) {
  const parsed = new URL(url);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const normalized = new Map([
    ["host", parsed.host],
    ["x-amz-content-sha256", payloadHash],
    ["x-amz-date", amzDate],
  ]);
  for (const [name, value] of Object.entries(headers)) {
    normalized.set(name.toLowerCase(), String(value).trim().replace(/\s+/g, " "));
  }
  const names = [...normalized.keys()].sort();
  const canonicalHeaders = names.map((name) => `${name}:${normalized.get(name)}\n`).join("");
  const canonicalQuery = [...parsed.searchParams.entries()]
    .map(([key, value]) => [awsEncode(key), awsEncode(value)])
    .sort(([aKey, aValue], [bKey, bValue]) => aKey < bKey ? -1 : aKey > bKey ? 1 : aValue < bValue ? -1 : aValue > bValue ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const canonicalRequest = [
    method,
    parsed.pathname.split("/").map((part) => awsEncode(decodeURIComponent(part))).join("/"),
    canonicalQuery,
    canonicalHeaders,
    names.join(";"),
    payloadHash,
  ].join("\n");
  const scope = `${date}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, date), "auto"), "s3"), "aws4_request");
  const signature = hmac(signingKey, stringToSign).toString("hex");
  return {
    ...Object.fromEntries([...normalized.entries()].filter(([name]) => name !== "host")),
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`,
  };
}
