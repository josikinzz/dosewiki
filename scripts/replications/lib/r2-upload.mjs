import { readFile } from "node:fs/promises";
import path from "node:path";
import { api } from "../../../lib/postgres/runtime/api.ts";
import { uploadR2Media, verifyMediaForPublication, r2MediaPublicUrl } from "../../../lib/runtime/r2MediaStorage.ts";
import { replicationMediaIdentity, replicationMediaKeyFromUrl, REPLICATION_MEDIA_KEY_FIELDS } from "../../../lib/runtime/replicationMediaIdentity.mjs";

export { r2MediaPublicUrl };

async function authorize(client, apiKey) {
  return await client.query(api.replications.authorizeMediaUpload, { apiKey });
}

export async function uploadReplicationBytes(client, apiKey, bytes, contentType, extension) {
  await authorize(client, apiKey);
  const object = await uploadR2Media(bytes, contentType, extension.replace(/^\./, "").toLowerCase());
  return object.r2Key;
}

export async function uploadReplicationFile(client, apiKey, filePath, contentType) {
  return await uploadReplicationBytes(client, apiKey, await readFile(filePath), contentType, path.extname(filePath));
}

async function publicationReceipts(client, apiKey, purpose, subject, keys, sourceKey) {
  const actor = await authorize(client, apiKey);
  const mediaReceipts = {};
  for (const field of REPLICATION_MEDIA_KEY_FIELDS) {
    if (keys[field] === undefined) continue;
    const { token } = await verifyMediaForPublication(keys[field], { ...actor, purpose, subject });
    mediaReceipts[field] = token;
  }
  const sourceMediaReceipt = sourceKey
    ? (await verifyMediaForPublication(sourceKey, { ...actor, purpose, subject })).token
    : undefined;
  return { mediaReceipts, ...(sourceMediaReceipt ? { sourceMediaReceipt } : {}) };
}

export async function replicationImportReceipts(client, apiKey, slug, keys) {
  return await publicationReceipts(client, apiKey, "replication-import", slug, keys);
}

export async function updateReplicationMedia(client, apiKey, row, keys, fileSize, provenance) {
  return await client.mutation(api.replications.updateMediaRenditions, {
    apiKey,
    id: row._id,
    expected: replicationMediaIdentity(row),
    keys,
    ...(await publicationReceipts(client, apiKey, "replication-rendition", row._id, keys, row.r2_key ?? replicationMediaKeyFromUrl(row.url))),
    ...(fileSize === undefined ? {} : { file_size: fileSize }),
    ...(provenance === undefined ? {} : { provenance }),
  });
}
