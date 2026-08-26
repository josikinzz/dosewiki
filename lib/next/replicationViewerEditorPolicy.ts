import { JsonBodyError } from "../../src/lib/http/readJsonBody";
import { isEditorHost } from "./publicConstructionPolicy";

/** Fail closed when an immersive-viewer edit reaches a public deployment host. */
export function requireReplicationViewerEditorHost(request: Request): void {
  const host = request.headers.get("host") ?? new URL(request.url).host;
  if (process.env.NODE_ENV !== "development" && !isEditorHost(host)) {
    throw new JsonBodyError(404, "This editor is not available on this host.");
  }
}
