export type CorpusDescriptor = {
  id: string;
  label: string;
  dataset: string;
  itemKey: string;
  excludedGroups: readonly string[];
  excludedKeys: readonly string[];
  conditionalKeys: Readonly<Record<string, string>>;
  safetyGroups: readonly string[];
  markupFields: Readonly<Record<string, string>>;
};

export const SUBSTANCE_EXCLUDED_GROUPS: readonly string[];
export const SUBSTANCE_EXCLUDED_KEYS: readonly string[];
export const SUBSTANCE_SAFETY_GROUPS: readonly string[];
export const CORPORA: Readonly<Record<"substances" | "effects" | "articles", CorpusDescriptor> & Record<string, CorpusDescriptor>>;
export function resolveCorpus(id: string): CorpusDescriptor;
