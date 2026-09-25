import type { EditorMode } from "./moleculeEditorTypes";

/**
 * The molecule editor's place in the URL: `/dev/molecule-editor/<mode>/<slug>`.
 * The shell hands the tool everything after the tab as one slug (`<mode>/<slug>`,
 * or a bare `<mode>` with nothing open); this module is the only reader and
 * writer of that shape.
 */
export type MoleculeEditorSelection = { mode: EditorMode; selected: string | null };

const MODES: readonly EditorMode[] = ["substances", "classes", "templates"];

export function isEditorMode(value: string): value is EditorMode {
  return (MODES as readonly string[]).includes(value);
}

export function parseMoleculeEditorSlug(slug: string | undefined): MoleculeEditorSelection {
  if (!slug) return { mode: "substances", selected: null };
  const [first, second] = slug.split("/");
  if (isEditorMode(first)) return { mode: first, selected: second || null };
  // Older deep links (`/dev/molecules/<slug>`) name a substance directly.
  return { mode: "substances", selected: first || null };
}

/** The shell slug for a selection; undefined is the bare tool address. */
export function moleculeEditorSlug({ mode, selected }: MoleculeEditorSelection): string | undefined {
  if (selected) return `${mode}/${selected}`;
  return mode === "substances" ? undefined : mode;
}
