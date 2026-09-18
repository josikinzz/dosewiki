import { api } from "../../lib/postgres/runtime/api.ts"
import { mediaTypeFromContentType } from "./article-media-evidence.mjs";

/**
 * Whether the public surfaces will publish this row, per `isPublishableReplication`.
 *
 * The data queries deliberately return every stored row (the rights and
 * provenance tooling needs figures to stay visible), so the gate lives app-side
 * in `src/types/replications.ts`. Restated here as the one thing a written row
 * must be checked against, and cross-checked against the real implementation in
 * this script's test rather than left as a comment claiming they agree.
 */
export function expectsPublication(row) {
  return (
    row.role === "replication" &&
    (row.type === "image" || row.type === "video" || row.type === "audio")
  );
}

/**
 * Read one written row back the way the site does, and insist it is what was planned.
 *
 * `getBySlug` is the query the permalink uses, so this asks production the same
 * question a visitor's page load asks. Every clause is a way a row can look
 * inserted and still be wrong: a resolved URL that 404s (an upload that landed
 * somewhere else), a served content type that disagrees with the row's `format`
 * (the browser downloads the file instead of drawing it), a role that did not
 * survive the mutation (a figure entering the gallery, or a replication withheld
 * from it).
 */
export async function verifyInsertedRow({ client, row, fetchImpl = fetch }) {
  const reasons = [];
  const live = await client.query(api.replications.getBySlug, { slug: row.slug });

  if (!live) {
    return { ok: false, reasons: [`getBySlug returned nothing for ${row.slug}`] };
  }
  for (const field of ["role", "artist", "type", "format", "storage_id", "r2_key", "title"]) {
    if (live[field] !== row[field]) {
      reasons.push(`${field} is ${JSON.stringify(live[field])}, planned ${JSON.stringify(row[field])}`);
    }
  }
  if (expectsPublication(live) !== expectsPublication(row)) {
    reasons.push(
      `the publication gate reads the stored row as ${expectsPublication(live)} where the plan says ${expectsPublication(row)}`,
    );
  }
  if (typeof live.url !== "string" || !live.url) {
    return { ok: false, reasons: [...reasons, "resolved url is null — the row has no media and no page"] };
  }

  let status = 0;
  let servedContentType = null;
  try {
    const response = await fetchImpl(live.url, { method: "GET" });
    status = response.status;
    servedContentType = response.headers.get("content-type");
    if (!response.ok) {
      reasons.push(`the resolved url served HTTP ${status}`);
    }
  } catch (error) {
    reasons.push(`the resolved url could not be fetched: ${String(error)}`);
  }

  const served = mediaTypeFromContentType(servedContentType);
  if (!served) {
    reasons.push(`the resolved url served ${servedContentType ?? "no content type"}, which maps to no media type`);
  } else if (served.type !== row.type || served.format !== row.format) {
    reasons.push(
      `the resolved url serves ${served.type}/${served.format} where the row says ${row.type}/${row.format}`,
    );
  }

  return { ok: reasons.length === 0, reasons, status, servedContentType };
}

