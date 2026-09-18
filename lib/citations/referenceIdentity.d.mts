import type {
  Reference,
  ReferenceMetadataProvenanceEntry,
} from "../../src/schema/substance/shared";

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
export function hasUnsafeReferenceMarkup(value: unknown): boolean;
export function stripReferenceHtmlMarkup(value: unknown): string;
export function getReferenceIdentityKeys(input: ReferenceIdentityInput): string[];
export function referenceDedupeKey(input: ReferenceIdentityInput): string;
export function findEquivalentReference<T extends ReferenceIdentityInput>(
  references: readonly T[],
  input: ReferenceIdentityInput,
): T | undefined;
export function deterministicReferenceId(input: ReferenceIdentityInput): string;
export const MAX_REFERENCE_METADATA_PROVENANCE: number;
export function normalizeReferenceMetadataProvenance(value: unknown): ReferenceMetadataProvenanceEntry[];
export function mergeReferenceAuthors(...authorLists: unknown[][]): string[];
export function haveCompatibleReferenceIdentity(
  left: ReferenceIdentityInput,
  right: ReferenceIdentityInput,
): boolean;
export function referenceIdentitiesOverlap(
  left: ReferenceIdentityInput,
  right: ReferenceIdentityInput,
): boolean;
export function mergeReferenceMetadata<T extends ReferenceIdentityInput>(
  canonicalReference: T,
  incomingReference: ReferenceIdentityInput & Partial<Reference>,
  options?: { allowTrustedScalarOverride?: boolean },
): T & Partial<Reference>;
export function mergeReferenceCollections<T extends ReferenceIdentityInput>(
  existingReferences: readonly T[],
  incomingReferences: readonly T[],
  options?: {
    allowTrustedScalarOverride?: boolean;
    retainExistingUnmatched?: boolean;
  },
): { references: T[]; remap: Map<string, string> };
export function dedupeReferences<T extends ReferenceIdentityInput>(references: T[]): T[];
