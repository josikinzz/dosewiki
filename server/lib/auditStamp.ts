import type { AuthorizedActor } from "./auth";

export function auditStampFor(actor: AuthorizedActor, requested: string | undefined): string {
  const trimmed = requested?.trim();
  return actor.role === "admin" && trimmed ? trimmed : actor.email;
}
