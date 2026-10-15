import type { ConfirmRequest } from "@/features/dev/components";

import { count, parseGlossaryCsv, STATE_WORD } from "./glossaryModel";

export type GlossaryImportRead = { name: string; csv: string; terms: string[] } | { error: string };

export async function readGlossaryImport(file: File): Promise<GlossaryImportRead> {
  try {
    const csv = await file.text();
    return { name: file.name, csv, terms: parseGlossaryCsv(csv).map((entry) => entry.term) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : `${file.name} could not be read as a glossary CSV.` };
  }
}

export function importConfirmation(read: { name: string; terms: string[] }, locale: string, onConfirm: () => void): ConfirmRequest {
  return {
    title: `Rewrite ${count(read.terms.length, "term")} in ${locale} from ${read.name}?`,
    description: `Every listed term takes the rendering in the file and becomes ${STATE_WORD.draft}, whatever its status column says; each still needs an explicit approval. Terms the file does not list are untouched.`,
    confirmLabel: `Import ${count(read.terms.length, "row")}`,
    affected: read.terms,
    onConfirm,
  };
}
