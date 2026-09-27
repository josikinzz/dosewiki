/**
 * The Molecules list column's rules: what each record's depiction is, which
 * records a filter keeps, how search matches, and the words the column and
 * the pane use for them. Pure, so the column and the tests share one answer.
 */
import type { EditorMode } from "./moleculeEditorTypes";
import { groupMoleculePickerItems, type MoleculePickerGroup, type MoleculePickerItem } from "./moleculePickerOrdering";

/**
 * Where a record's drawing comes from. `none`: no stored row, so the public
 * page draws nothing. `seeded`: the automatic baseline the import wrote.
 * `editor`: someone saved it by hand here. `template`: a class template
 * aligned it. `saved`: a stored row whose source the list did not say.
 */
export type DepictionState = "none" | "seeded" | "editor" | "template" | "saved";

export type MoleculeListFilter = "all" | "todo" | "edited";

export interface MoleculeListRow extends MoleculePickerItem {
  depiction: DepictionState;
  /** The stored row's last save, when the list read carried it. */
  updatedAt?: string | number | null;
}

export type OverrideSummary = { source?: string | null; updatedAt?: string | number | null };

/** The state of one record from the stored-row summary (or the picker's own flag). */
export function depictionStateOf(summary: OverrideSummary | undefined, hasOverride: boolean): DepictionState {
  if (!summary) return hasOverride ? "saved" : "none";
  if (summary.source === "seeded") return "seeded";
  if (summary.source === "editor") return "editor";
  if (summary.source === "template") return "template";
  return "saved";
}

/** Hand-finished drawings; everything else still wants a look. */
export function isEdited(state: DepictionState): boolean {
  return state === "editor" || state === "template" || state === "saved";
}

export function matchesMoleculeFilter(row: MoleculeListRow, filter: MoleculeListFilter): boolean {
  if (filter === "all") return true;
  return filter === "edited" ? isEdited(row.depiction) : !isEdited(row.depiction);
}

/** Case-insensitive match on the name or the key, ignoring spaces and punctuation between words. */
export function matchesMoleculeSearch(row: MoleculePickerItem, query: string): boolean {
  const needle = normalize(query);
  if (!needle) return true;
  return normalize(row.title).includes(needle) || normalize(row.slug).includes(needle);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s\-_,.()·]+/g, "");
}

export function countMoleculeFilters(rows: readonly MoleculeListRow[]): Record<MoleculeListFilter, number> {
  let edited = 0;
  for (const row of rows) if (isEdited(row.depiction)) edited += 1;
  return { all: rows.length, edited, todo: rows.length - edited };
}

/** The rows a filter and a search keep, grouped as the picker grouped them. */
export function visibleMoleculeGroups(
  rows: readonly MoleculeListRow[],
  filter: MoleculeListFilter,
  query: string,
): MoleculePickerGroup<MoleculeListRow>[] {
  return groupMoleculePickerItems(
    rows.filter((row) => matchesMoleculeFilter(row, filter) && matchesMoleculeSearch(row, query)),
  );
}

/** One word per mode for the column's nouns. */
export const MODE_NOUN: Record<EditorMode, { one: string; many: string }> = {
  substances: { one: "substance", many: "substances" },
  classes: { one: "class", many: "classes" },
  templates: { one: "template", many: "templates" },
};

export function countNoun(count: number, mode: EditorMode): string {
  const noun = MODE_NOUN[mode];
  return `${count.toLocaleString("en")} ${count === 1 ? noun.one : noun.many}`;
}

/** Filter labels per mode: a template is saved or not, a depiction edited or still to do. */
export const FILTER_LABEL: Record<EditorMode, Record<MoleculeListFilter, string>> = {
  substances: { all: "All", todo: "To do", edited: "Edited" },
  classes: { all: "All", todo: "Not saved", edited: "Saved" },
  templates: { all: "All", todo: "Not saved", edited: "Saved" },
};

/** The short state a row and the pane header show. */
export function depictionLabel(state: DepictionState, mode: EditorMode): string {
  if (mode === "templates") return state === "none" ? "No template yet" : "Saved template";
  switch (state) {
    case "none":
      return mode === "classes" ? "Not saved" : "No depiction";
    case "seeded":
      return "Automatic layout";
    case "template":
      return "Aligned by a template";
    case "editor":
      return "Edited by hand";
    case "saved":
      return "Saved";
  }
}

/** What the public page draws today, one sentence, for the pane. */
export function depictionSentence(state: DepictionState, mode: EditorMode): string {
  if (mode === "templates") {
    return state === "none"
      ? "No template is saved for this class yet. Templates stay private: saving one changes no public page."
      : "Templates stay private: saving one changes no public page until you apply it to the class.";
  }
  const page = mode === "classes" ? "The class page" : "The article";
  switch (state) {
    case "none":
      return mode === "classes"
        ? "The class page draws this structure from its generic layout until a depiction is saved."
        : "The article shows no structure until a depiction is saved.";
    case "seeded":
      return `${page} shows the automatic layout, which nobody has checked by hand yet.`;
    case "template":
      return `${page} shows a drawing a class template aligned.`;
    case "editor":
    case "saved":
      return `${page} shows this saved drawing.`;
  }
}

/** Which filter shows a record, so a deep link outside the filter can say where it is. */
export function filterHiding(row: MoleculeListRow | undefined, filter: MoleculeListFilter): boolean {
  return !!row && !matchesMoleculeFilter(row, filter);
}
