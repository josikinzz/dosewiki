import { JsonBodyError } from "@/lib/http/readJsonBody";

/**
 * The `<id>` segment of `/api/dev/proposals/<id>[/<action>]`: the segment
 * right after `proposals`, so the same helper serves the detail route and
 * every action route beneath it. Postgres validates the id's shape and table.
 */
export function proposalIdOf(request: Request): string {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const id = decodeURIComponent(segments[segments.indexOf("proposals") + 1] ?? "").trim();
  if (id.length === 0) {
    throw new JsonBodyError(404, "No proposal found for that address.");
  }
  return id;
}
