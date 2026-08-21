/**
 * Class (Markush) molblock helpers for the editor.
 *
 * A class structure's dummy atoms stay plain `*`/`R` atoms with V2000 atom-map
 * numbers — that is the only spelling BOTH RDKit and OpenChemLib survive.
 * Verified empirically: pseudoatom symbols like "RN" are read as elements
 * (radon!) by RDKit and case-mangled by OCL, so display labels ("R2", "RN",
 * "Ra") are never written into the molblock. They are injected at draw time
 * via OCL's `setAtomCustomLabel`, keyed by atom index, in both the brand
 * preview (renderMoleculeSvg) and the canvas (OclEditor).
 *
 * OpenChemLib preserves atom order and coordinates through its round-trip but
 * rewrites dummy symbols to `?` and zeroes atom maps. `normalizeClassMolblock`
 * therefore restores each dummy atom line's chemistry tail (symbol + fields +
 * map) from the RDKit source molblock, keeping only OCL's edited coordinates.
 *
 * A molecule carrying custom labels does NOT emit a clean molblock: OCL's
 * `toMolfile` writes each label as a DAT S-group (`M  STY`/`SLB`/`SAL`/
 * `SDT NOSEARCH_OCL_CUSTOM_LABEL`/`SDD`/`SED`) before `M  END` — verified
 * empirically. `stripOclCustomLabelSgroups` removes exactly those groups so
 * canvas emissions stay string-comparable to unlabeled baselines.
 */

export interface ClassDummyAtom {
  /** 0-based atom index in the molblock atom block. */
  index: number;
  /** The R-position atom-map number ("2".."9" etc), keys `rLabels`. */
  mapNum: string;
}

const DUMMY_SYMBOLS = new Set(["*", "R", "?"]);

function atomBlock(lines: string[]): { start: number; count: number } | null {
  const countsIndex = lines.findIndex((line) => line.includes("V2000"));
  if (countsIndex === -1) return null;
  const count = Number.parseInt(lines[countsIndex]?.slice(0, 3).trim() ?? "", 10);
  if (!Number.isFinite(count) || count <= 0) return null;
  return { start: countsIndex + 1, count };
}

/**
 * Find the dummy atoms and their atom-map numbers in an RDKit-written class
 * molblock (the editor's source of truth for R positions). The map number is
 * the last non-zero 3-char field on the atom line, matching how RDKit writes
 * the V2000 `mmm` column.
 */
export function parseClassDummies(molblock: string): ClassDummyAtom[] {
  const lines = molblock.split(/\r?\n/);
  const block = atomBlock(lines);
  if (!block) return [];

  const dummies: ClassDummyAtom[] = [];
  for (let offset = 0; offset < block.count; offset += 1) {
    const line = lines[block.start + offset];
    if (!line || line.length < 40) continue;
    if (!DUMMY_SYMBOLS.has(line.slice(31, 34).trim())) continue;

    const tail = line.slice(34);
    for (let index = tail.length - 3; index >= 0; index -= 3) {
      const value = tail.slice(index, index + 3).trim();
      if (value && value !== "0") {
        dummies.push({ index: offset, mapNum: value });
        break;
      }
    }
  }
  return dummies;
}

/**
 * Restore the chemistry tail (symbol, flags, atom map) of every dummy atom line
 * from the RDKit `sourceMolblock`, keeping the edited coordinates. Run on every
 * molblock OpenChemLib emits so `?`-mangled dummies and dropped atom maps never
 * reach the preview, the guard, or a save. Atom order is preserved by OCL
 * (verified), so line positions correspond.
 */
export function normalizeClassMolblock(
  editedMolblock: string,
  sourceMolblock: string,
  dummies: ClassDummyAtom[],
): string {
  if (dummies.length === 0) return editedMolblock;

  const editedLines = editedMolblock.split(/\r?\n/);
  const sourceLines = sourceMolblock.split(/\r?\n/);
  const editedBlock = atomBlock(editedLines);
  const sourceBlock = atomBlock(sourceLines);
  if (!editedBlock || !sourceBlock || editedBlock.count !== sourceBlock.count) {
    return editedMolblock; // atom count changed: a real edit — leave it to the guard
  }

  for (const dummy of dummies) {
    const editedLine = editedLines[editedBlock.start + dummy.index];
    const sourceLine = sourceLines[sourceBlock.start + dummy.index];
    if (!editedLine || !sourceLine || editedLine.length < 34 || sourceLine.length < 34) continue;
    editedLines[editedBlock.start + dummy.index] =
      editedLine.slice(0, 31) + sourceLine.slice(31);
  }
  return editedLines.join("\n");
}

/**
 * Draw-time atom labels for a class molblock: atom index -> "R2" / "Ra" / "RN".
 */
export function classAtomLabels(
  dummies: ClassDummyAtom[],
  rLabels: Record<string, string>,
): Record<number, string> {
  const labels: Record<number, string> = {};
  for (const dummy of dummies) {
    const label = rLabels[dummy.mapNum];
    if (label) labels[dummy.index] = label;
  }
  return labels;
}

/**
 * Remove the DAT S-groups OCL's `toMolfile` writes for atom custom labels
 * (its `NOSEARCH_OCL_CUSTOM_LABEL` convention). Only S-groups owned by that
 * data name are dropped; any other S-group lines pass through. Identity for
 * molblocks without custom labels, so it is safe on every emission.
 */
export function stripOclCustomLabelSgroups(molblock: string): string {
  if (!molblock.includes("NOSEARCH_OCL_CUSTOM_LABEL")) return molblock;

  const lines = molblock.split(/\r?\n/);
  const labelSgroups = new Set<string>();
  for (const line of lines) {
    const match = /^M {2}SDT +(\d+) +NOSEARCH_OCL_CUSTOM_LABEL\b/.exec(line);
    if (match) labelSgroups.add(match[1]);
  }
  if (labelSgroups.size === 0) return molblock;

  return lines
    .filter((line) => {
      // STY/SLB lead with an entry count, then the S-group id (OCL writes one
      // entry per line); SAL/SDT/SDD/SED lead with the id itself.
      const match =
        /^M {2}(?:STY|SLB) +\d+ +(\d+)/.exec(line) ??
        /^M {2}(?:SAL|SDT|SDD|SED) +(\d+)/.exec(line);
      return !match || !labelSgroups.has(match[1]);
    })
    .join("\n");
}
