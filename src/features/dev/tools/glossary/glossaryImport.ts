/**
 * A glossary CSV import, confirmed before it is sent. A file picker shows a
 * filename, not a blast radius, so the file is read and parsed in the browser
 * first and the same confirm every other bulk write uses names the rows it
 * will rewrite. The file still goes to the server whole, and the server still
 * validates it and writes all of it or none.
 */

import type { ConfirmRequest } from "@/features/dev/components";

import { count, parseGlossaryCsv, STATE_WORD } from "./glossaryModel";

/** The chosen file's text and the terms it lists, or why it cannot be read as a glossary CSV. */
export type GlossaryImportRead = { name: string; csv: string; terms: string[] } | { error: string };

export async function readGlossaryImport(file: File): Promise<GlossaryImportRead> {
  try {
    const csv = await file.text();
    return { name: file.name, csv, terms: parseGlossaryCsv(csv).map((entry) => entry.term) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : `${file.name} could not be read as a glossary CSV.` };
  }
}

/** The confirm naming every term the file rewrites; `onConfirm` sends the file. */
export function importConfirmation(read: { name: string; terms: string[] }, locale: string, onConfirm: () => void): ConfirmRequest {
  return {
    title: `Rewrite ${count(read.terms.length, "term")} in ${locale} from ${read.name}?`,
    description: `Every listed term takes the rendering in the file and becomes ${STATE_WORD.draft}, whatever its status column says; each still needs an explicit approval. Terms the file does not list are untouched.`,
    confirmLabel: `Import ${count(read.terms.length, "row")}`,
    affected: read.terms,
    onConfirm,
  };
}
