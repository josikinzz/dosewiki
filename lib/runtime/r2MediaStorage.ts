import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdtemp, open, rm } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signR2Request } from "./r2Signing.mjs";
import { assertDataWritesNotFrozen } from "./dataWriteFreeze";
import { encodeR2ImageRenditions } from "./r2ImageRenditions";

export type R2MediaObject = {
  r2Key: string;
  sha256: string;
  fileSize: number;
  mimeType: string;
};

type UploadReceipt = R2MediaObject & {
  actorEmail: string;
  expiresAt: number;
  purpose: "replication-studio";
  target: string;
};

type R2StorageConfig = { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string };

function signReceipt(receipt: unknown, config: R2StorageConfig): string {
  const payload = Buffer.from(JSON.stringify(receipt)).toString("base64url");
  const signature = createHmac("sha256", config.secretAccessKey).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function readReceipt(token: string, config: R2StorageConfig): Record<string, unknown> {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || token.length > 4096) throw new Error("Invalid upload receipt.");
  const expected = createHmac("sha256", config.secretAccessKey).update(payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error("Invalid upload receipt.");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
}

function storageConfig(): R2StorageConfig {
  const endpoint = process.env.CLOUDFLARE_R2_S3_ENDPOINT;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 media storage is not configured.");
  }
  const delivery = new URL(process.env.REPLICATION_MEDIA_BASE_URL ?? "");
  if (delivery.protocol !== "https:" || delivery.username || delivery.password || delivery.search || delivery.hash) {
    throw new Error("R2 media delivery is not configured.");
  }
  const url = new URL(endpoint);
  const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!local && (url.protocol !== "https:" || !/^[a-z0-9]+\.r2\.cloudflarestorage\.com$/.test(url.hostname)))
    || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/"
    || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error("R2 media storage target is invalid.");
  }
  return { endpoint: url.origin, bucket, accessKeyId, secretAccessKey };
}

function objectUrl(config: R2StorageConfig, key: string) {
  const match = /^media\/sha256\/([a-f0-9]{2})\/([a-f0-9]{64})\.[a-z0-9]{2,5}$/.exec(key);
  if (!match || match[1] !== match[2].slice(0, 2)) {
    throw new Error("Invalid content-addressed media key.");
  }
  return `${config.endpoint}/${config.bucket}/${key}`;
}

export function r2MediaObject(sha256: string, fileSize: number, mimeType: string, extension: string): R2MediaObject {
  if (!/^[a-f0-9]{64}$/.test(sha256) || !/^[a-z0-9]{2,5}$/.test(extension)
    || !Number.isSafeInteger(fileSize) || fileSize <= 0 || !/^(image|video|audio)\/[a-z0-9.+-]+$/.test(mimeType)) {
    throw new Error("Invalid media upload metadata.");
  }
  return { r2Key: `media/sha256/${sha256.slice(0, 2)}/${sha256}.${extension}`, sha256, fileSize, mimeType };
}

function uploadRequest(object: R2MediaObject) {
  const config = storageConfig();
  const uploadUrl = objectUrl(config, object.r2Key);
  const uploadHeaders = signR2Request({
    method: "PUT", url: uploadUrl, ...config, payloadHash: object.sha256,
    headers: { "content-type": object.mimeType, "if-none-match": "*", "x-amz-meta-sha256": object.sha256 },
  });
  return { uploadUrl, uploadHeaders, method: "PUT" as const };
}

/** Authorizes only these bytes at an immutable key. The server alone can issue the finish receipt. */
export function startR2MediaUpload(object: R2MediaObject, actorEmail: string) {
  assertDataWritesNotFrozen("replication-studio.upload-start");
  const config = storageConfig();
  const receipt: UploadReceipt = {
    ...object, actorEmail, purpose: "replication-studio", expiresAt: Date.now() + 15 * 60_000,
    target: `${config.endpoint}/${config.bucket}`,
  };
  return { ...uploadRequest(object), uploadToken: signReceipt(receipt, config) };
}

export function readR2MediaUploadReceipt(uploadToken: string, actorEmail: string): R2MediaObject {
  const config = storageConfig();
  const receipt = readReceipt(uploadToken, config) as unknown as UploadReceipt;
  if (receipt.actorEmail !== actorEmail || receipt.purpose !== "replication-studio"
    || receipt.target !== `${config.endpoint}/${config.bucket}` || !Number.isFinite(receipt.expiresAt) || receipt.expiresAt < Date.now()) {
    throw new Error("Upload receipt expired or belongs to another editor. Start the upload again.");
  }
  objectUrl(config, receipt.r2Key);
  return { r2Key: receipt.r2Key, sha256: receipt.sha256, fileSize: receipt.fileSize, mimeType: receipt.mimeType };
}

async function readR2MediaMetadata(r2Key: string, config: R2StorageConfig): Promise<R2MediaObject> {
  const url = objectUrl(config, r2Key);
  const response = await fetch(url, {
    method: "HEAD", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000),
    headers: signR2Request({ method: "HEAD", url, ...config, payloadHash: createHash("sha256").update("").digest("hex") }),
  });
  if (!response.ok) throw new Error("R2 media is missing.");
  const filename = r2Key.slice(r2Key.lastIndexOf("/") + 1);
  const separator = filename.lastIndexOf(".");
  return r2MediaObject(filename.slice(0, separator), Number(response.headers.get("content-length")), response.headers.get("content-type")?.split(";")[0].trim() ?? "", filename.slice(separator + 1));
}

export type MediaPublicationBinding = {
  purpose: "replication-rendition" | "replication-import";
  subject: string;
  actorEmail: string;
  targetIdentity: string;
};

function assertPublicationBinding(binding: MediaPublicationBinding): void {
  if (!["replication-rendition", "replication-import"].includes(binding.purpose)
    || !binding.subject || !binding.actorEmail || !binding.targetIdentity) {
    throw new Error("Media publication requires an exact purpose, subject, actor and Postgres target.");
  }
}

export async function verifyMediaForPublication(
  r2Key: string,
  binding: MediaPublicationBinding,
  expectedObject?: R2MediaObject,
): Promise<{ object: R2MediaObject; token: string }> {
  assertDataWritesNotFrozen("media.verify-publication");
  assertPublicationBinding(binding);
  const config = storageConfig();
  const object = await readR2MediaMetadata(r2Key, config);
  if (expectedObject && (object.r2Key !== expectedObject.r2Key || object.sha256 !== expectedObject.sha256
    || object.fileSize !== expectedObject.fileSize || object.mimeType !== expectedObject.mimeType)) {
    throw new Error("Stored media metadata does not match the authorized upload.");
  }
  await prepareR2MediaForPublication(object);
  assertDataWritesNotFrozen("media.publication-receipt");
  const token = signReceipt({
    ...binding, ...object, target: `${config.endpoint}/${config.bucket}`, expiresAt: Date.now() + 15 * 60_000,
  }, config);
  return { object, token };
}

export function assertMediaPublicationReceipt(
  token: string,
  r2Key: string,
  binding: MediaPublicationBinding,
): R2MediaObject {
  assertDataWritesNotFrozen("media.publish");
  assertPublicationBinding(binding);
  const config = storageConfig();
  const receipt = readReceipt(token, config);
  if (receipt.purpose !== binding.purpose || receipt.subject !== binding.subject || receipt.actorEmail !== binding.actorEmail
    || receipt.targetIdentity !== binding.targetIdentity || receipt.r2Key !== r2Key
    || receipt.target !== `${config.endpoint}/${config.bucket}` || typeof receipt.expiresAt !== "number"
    || !Number.isFinite(receipt.expiresAt) || receipt.expiresAt < Date.now()) {
    throw new Error("Media receipt expired or does not match this publication.");
  }
  objectUrl(config, r2Key);
  const object = r2MediaObject(receipt.sha256 as string, receipt.fileSize as number, receipt.mimeType as string, r2Key.slice(r2Key.lastIndexOf(".") + 1));
  if (object.r2Key !== r2Key) throw new Error("Media receipt digest does not match its key.");
  return object;
}

export function r2MediaPublicUrl(r2Key: string): string {
  objectUrl(storageConfig(), r2Key);
  return `${process.env.REPLICATION_MEDIA_BASE_URL!.replace(/\/+$/, "")}/${r2Key}`;
}

/** Operator preflight verifies bytes outside the retryable database transaction. */
export async function verifyProfileAvatarForImport(
  r2Key: string,
  profileKey: string,
  actorEmail: string,
  targetIdentity: string,
): Promise<string> {
  assertDataWritesNotFrozen("profile-avatar.verify");
  if (!targetIdentity || !profileKey || !actorEmail) throw new Error("Profile avatar receipt requires an actor, profile and Postgres target.");
  const config = storageConfig();
  const object = await readR2MediaMetadata(r2Key, config);
  const match = /\/([a-f0-9]{64})\.(png|jpe?g|webp)$/.exec(r2Key);
  if (!match) throw new Error("Profile avatar must be PNG, JPEG or WebP.");
  const mimeType = match[2] === "png" ? "image/png" : match[2] === "webp" ? "image/webp" : "image/jpeg";
  if (object.fileSize > 2 * 1024 * 1024 || object.mimeType !== mimeType) {
    throw new Error("Profile avatar MIME does not match its key or exceeds 2 MB.");
  }
  await prepareR2MediaForPublication(object);
  assertDataWritesNotFrozen("profile-avatar.receipt");
  return signReceipt({
    purpose: "profile-avatar-import", r2Key, profileKey, actorEmail, targetIdentity,
    target: `${config.endpoint}/${config.bucket}`, expiresAt: Date.now() + 15 * 60_000,
  }, config);
}

/** Pure authenticated evidence check; never reads storage from a SQL handler. */
export function assertProfileAvatarImportReceipt(
  token: string,
  profileKey: string,
  r2Key: string,
  actorEmail: string,
  targetIdentity: string | undefined,
): void {
  assertDataWritesNotFrozen("profile-avatar.import");
  const config = storageConfig();
  const receipt = readReceipt(token, config);
  if (!targetIdentity || receipt.purpose !== "profile-avatar-import" || receipt.profileKey !== profileKey
    || receipt.r2Key !== r2Key || receipt.actorEmail !== actorEmail || receipt.targetIdentity !== targetIdentity
    || receipt.target !== `${config.endpoint}/${config.bucket}` || typeof receipt.expiresAt !== "number"
    || !Number.isFinite(receipt.expiresAt) || receipt.expiresAt < Date.now()) {
    throw new Error("Profile avatar receipt expired or does not match this actor, profile and target.");
  }
}

/** Withdrawal markers are authoritative, including when origin bytes still exist. */
export async function assertR2MediaNotWithdrawn(r2Key: string): Promise<void> {
  const config = storageConfig();
  objectUrl(config, r2Key);
  const url = `${config.endpoint}/${config.bucket}/_withdrawals/${r2Key}`;
  const response = await fetch(url, {
    method: "HEAD", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000),
    headers: signR2Request({ method: "HEAD", url, ...config, payloadHash: createHash("sha256").update("").digest("hex") }),
  });
  await response.body?.cancel();
  if (response.status === 404) return;
  if (response.ok) throw new Error("This media has been withdrawn and cannot be uploaded or republished.");
  throw new Error("Media withdrawal status could not be verified.");
}

/** Stream the stored bytes: metadata is not proof that a client uploaded the claimed digest. */
async function verifyR2MediaObject(object: R2MediaObject, source?: FileHandle): Promise<void> {
  const config = storageConfig();
  const url = objectUrl(config, object.r2Key);
  const response = await fetch(url, {
    method: "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(120_000),
    headers: signR2Request({ method: "GET", url, ...config, payloadHash: createHash("sha256").update("").digest("hex") }),
  });
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) !== object.fileSize
    || response.headers.get("content-type")?.split(";")[0].trim() !== object.mimeType) {
    await response.body?.cancel();
    throw new Error("Uploaded media is missing or its size/content type does not match.");
  }
  const reader = response.body.getReader();
  const hash = createHash("sha256");
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > object.fileSize) throw new Error("Uploaded media exceeds its declared size.");
      hash.update(value);
      if (source) await source.writeFile(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  if (size !== object.fileSize || hash.digest("hex") !== object.sha256) {
    throw new Error("Uploaded media failed digest verification.");
  }
  await assertR2MediaNotWithdrawn(object.r2Key);
}

/** Prepare private variants only after byte verification and before publication evidence. */
async function prepareR2MediaForPublication(object: R2MediaObject): Promise<void> {
  if (!/\.(?:jpg|jpeg|png|webp|avif)$/.test(object.r2Key)) {
    await verifyR2MediaObject(object);
    return;
  }
  const config = storageConfig();
  const directory = await mkdtemp(join(tmpdir(), "dosewiki-renditions-"));
  try {
    const filename = join(directory, "source");
    const source = await open(filename, "wx", 0o600);
    try {
      await verifyR2MediaObject(object, source);
    } finally {
      await source.close();
    }
    for await (const variant of encodeR2ImageRenditions(filename, object.r2Key)) {
      const url = `${config.endpoint}/${config.bucket}/${variant.key}`;
      const digest = createHash("sha256").update(variant.bytes).digest("hex");
      const backing = variant.bytes.buffer;
      if (!(backing instanceof ArrayBuffer)) throw new Error("Renditions require ArrayBuffer-backed bytes.");
      await assertR2MediaNotWithdrawn(object.r2Key);
      assertDataWritesNotFrozen("media.rendition-upload");
      const uploaded = await fetch(url, {
        method: "PUT", redirect: "error", signal: AbortSignal.timeout(120_000),
        headers: signR2Request({
          method: "PUT", url, ...config, payloadHash: digest,
          headers: { "content-type": "image/webp", "if-none-match": "*", "x-amz-meta-sha256": digest },
        }),
        body: new Uint8Array(backing, variant.bytes.byteOffset, variant.bytes.byteLength),
      });
      await uploaded.body?.cancel();
      if (!uploaded.ok && uploaded.status !== 412) throw new Error("R2 rejected the image rendition.");
      const verified = await fetch(url, {
        method: "HEAD", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000),
        headers: signR2Request({ method: "HEAD", url, ...config, payloadHash: createHash("sha256").update("").digest("hex") }),
      });
      await verified.body?.cancel();
      if (!verified.ok || Number(verified.headers.get("content-length")) !== variant.bytes.length
        || verified.headers.get("content-type")?.split(";")[0].trim() !== "image/webp"
        || verified.headers.get("x-amz-meta-sha256") !== digest) {
        throw new Error("Stored image rendition does not match the prepared bytes.");
      }
    }
    await assertR2MediaNotWithdrawn(object.r2Key);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Small trusted server uploads (avatars) share the same immutable objects and verification. */
export async function uploadR2Media(bytes: Uint8Array, mimeType: string, extension: string): Promise<R2MediaObject> {
  const buffer = bytes.buffer;
  if (!(buffer instanceof ArrayBuffer)) throw new Error("Media uploads require ArrayBuffer-backed bytes.");
  const object = r2MediaObject(createHash("sha256").update(bytes).digest("hex"), bytes.byteLength, mimeType, extension);
  const { uploadUrl, uploadHeaders } = uploadRequest(object);
  assertDataWritesNotFrozen("media.upload");
  await assertR2MediaNotWithdrawn(object.r2Key);
  assertDataWritesNotFrozen("media.upload");
  const response = await fetch(uploadUrl, {
    method: "PUT", headers: uploadHeaders, body: new Uint8Array(buffer, bytes.byteOffset, bytes.byteLength),
    redirect: "error", signal: AbortSignal.timeout(120_000),
  });
  await response.body?.cancel();
  if (!response.ok && response.status !== 412) throw new Error("R2 rejected the media upload.");
  await verifyR2MediaObject(object);
  return object;
}
