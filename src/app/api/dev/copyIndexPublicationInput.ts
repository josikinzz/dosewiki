import { JsonBodyError } from "@/lib/http/readJsonBody";
export type CopyIndexPublicationInput = { expectedRevision: number; operationId: string };
export function parseCopyIndexPublicationInput(raw: { expectedRevision?: unknown; operationId?: unknown }): CopyIndexPublicationInput {
  if (typeof raw.expectedRevision !== "number" || !Number.isSafeInteger(raw.expectedRevision) || raw.expectedRevision < 0) throw new JsonBodyError(400, "A loaded publication revision is required.");
  if (typeof raw.operationId !== "string" || !/^[a-zA-Z0-9_-]{16,128}$/.test(raw.operationId)) throw new JsonBodyError(400, "A stable publication operation ID is required.");
  return { expectedRevision: raw.expectedRevision, operationId: raw.operationId };
}
