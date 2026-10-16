import type { EditorMode } from "./moleculeEditorTypes";

export type MoleculeEditorSelection = { mode: EditorMode; selected: string | null };

const MODES: readonly EditorMode[] = ["substances", "classes", "templates"];

export function isEditorMode(value: string): value is EditorMode {
  return (MODES as readonly string[]).includes(value);
}

export function parseMoleculeEditorSlug(slug: string | undefined): MoleculeEditorSelection {
  if (!slug) return { mode: "substances", selected: null };
  const [first, second] = slug.split("/");
  if (isEditorMode(first)) return { mode: first, selected: second || null };
  return { mode: "substances", selected: first || null };
}

export function moleculeEditorSlug({ mode, selected }: MoleculeEditorSelection): string | undefined {
  if (selected) return `${mode}/${selected}`;
  return mode === "substances" ? undefined : mode;
}
