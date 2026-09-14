export type ScientificFieldRole =
  | "canonical-identifier"
  | "controlled-label"
  | "prose"
  | "identifier-plus-prose";

export type ScientificSpan = {
  start: number;
  end: number;
  source: string;
};

export type ScientificProjection = {
  path: string;
  role: ScientificFieldRole;
  source: string;
  spans: ScientificSpan[];
};

export type MetaboliteDisplayProjection = {
  name: string;
  abbreviation?: string;
  status?: string;
  qualifications: string[];
  citationTokens: string[];
};

export const SCIENTIFIC_FIELD_ROLES: Readonly<{
  CANONICAL_IDENTIFIER: "canonical-identifier";
  CONTROLLED_LABEL: "controlled-label";
  PROSE: "prose";
  IDENTIFIER_PLUS_PROSE: "identifier-plus-prose";
}>;

export function normalizeScientificPath(pointer: string | readonly (string | number)[]): string;
export function resolveScientificFieldPolicy(pointer: string | readonly (string | number)[]): {
  path: string;
  role: ScientificFieldRole;
  projector: "metabolite" | "scientific-prose" | "label" | null;
} | null;
export function projectMetaboliteDisplay(raw: string): MetaboliteDisplayProjection;
export function nominateScientificSpans(
  pointer: string | readonly (string | number)[],
  value: unknown,
): ScientificProjection | null;
export function restoreScientificSpans(
  projection: ScientificProjection,
  translatedSpans: readonly string[],
): string;
