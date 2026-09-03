import type { AuthorizedActor } from "./auth";

/**
 * The identity recorded on a row's `updatedBy` / `updated_by` audit stamp.
 *
 * Only an admin may stamp a row with someone else's name (migration scripts
 * attributing imported rows to their original author); every other actor is
 * stamped as themselves regardless of what the request carried, so a
 * contributor cannot forge who last touched a record.
 */
export function auditStampFor(actor: AuthorizedActor, requested: string | undefined): string {
  const trimmed = requested?.trim();
  return actor.role === "admin" && trimmed ? trimmed : actor.email;
}
