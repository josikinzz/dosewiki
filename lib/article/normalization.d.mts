import type { Pharmacology } from "../../src/schema";

export type NormalizedPharmacologySection = Pharmacology & {
  summary?: string;
  route_bioavailability?: Record<string, string>;
  route_half_life?: Record<string, string>;
  route_half_life_notes?: Record<string, string>;
  route_bioavailability_notes?: Record<string, string>;
  bioavailability_notes?: string;
  half_life?: string;
};

export type BindingSiteMigrationStatus =
  | "empty"
  | "legacy"
  | "canonical"
  | "equivalent"
  | "conflict"
  | "invalid";

export type BindingSiteMigrationPlan = {
  status: BindingSiteMigrationStatus;
  bindingSites: Pharmacology["binding_sites"];
  legacyKeys: string[];
  conflicts: string[];
  issues: string[];
  suspiciousTargets: Array<{ index: number; target: string; reason: string }>;
  needsMigration: boolean;
};

export function stripMarkdownCodeFences(text: string): string;
export function normalizeRouteName(routeName: string): string;
export function planBindingSiteMigration(rawPharmacology: unknown): BindingSiteMigrationPlan;
export function migratePharmacologyBindingSites(rawPharmacology: unknown): Record<string, unknown>;
export function remapBindingSiteFieldPath(fieldPath: unknown):
  | { status: "remapped"; path: string }
  | { status: "unmappable"; path: string; reason: string }
  | { status: "unchanged"; path: unknown };
export function remapBindingSiteEvidencePath(input: {
  slug: string;
  claimKey: string;
  fieldPath: unknown;
}): ReturnType<typeof remapBindingSiteFieldPath>;
export function normalizePharmacologySection(rawPharmacology: unknown): NormalizedPharmacologySection;
export function getLegacyAwareMechanismTags(rawPharmacology: unknown): string[];
export function hasPharmacologyContent(rawPharmacology: unknown): boolean;
export function hasHarmPotentialContent(rawHarmPotential: unknown): boolean;
