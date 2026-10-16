import { JsonBodyError } from "@/lib/http/readJsonBody";

export function proposalIdOf(request: Request): string {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const id = decodeURIComponent(segments[segments.indexOf("proposals") + 1] ?? "").trim();
  if (id.length === 0) {
    throw new JsonBodyError(404, "No proposal found for that address.");
  }
  return id;
}
