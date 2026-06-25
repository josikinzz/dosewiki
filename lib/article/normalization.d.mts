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

export function stripMarkdownCodeFences(text: string): string;
export function normalizeRouteName(routeName: string): string;
export function normalizePharmacologySection(rawPharmacology: unknown): NormalizedPharmacologySection;
export function getLegacyAwareMechanismTags(rawPharmacology: unknown): string[];
export function hasPharmacologyContent(rawPharmacology: unknown): boolean;
