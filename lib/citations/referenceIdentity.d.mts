import type { Reference } from "../../src/schema/substance/shared";

export type ReferenceIdentityInput = Partial<
  Pick<Reference, "id" | "doi" | "pmid" | "isbn" | "url" | "siteName" | "title">
> & {
  name?: string | null;
};

export function normalizeIdentifier(value: unknown): string;
export function normalizeDoi(value: unknown): string;
export function normalizePmid(value: unknown): string;
export function normalizeIsbn(value: unknown): string;
export function canonicalizeReferenceUrl(value: unknown): string;
export function getReferenceIdentityKeys(input: ReferenceIdentityInput): string[];
export function referenceDedupeKey(input: ReferenceIdentityInput): string;
export function findEquivalentReference<T extends ReferenceIdentityInput>(
  references: readonly T[],
  input: ReferenceIdentityInput,
): T | undefined;
export function deterministicReferenceId(input: ReferenceIdentityInput): string;
export function dedupeReferences<T extends ReferenceIdentityInput>(references: T[]): T[];
