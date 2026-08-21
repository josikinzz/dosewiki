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
 *
 * Restores only lines whose edited symbol still reads as a dummy (`*`/`R`, or
 * OCL's `?` mangle). A count-preserving redraw can put a real atom (e.g. C) at
 * a former dummy index; stamping the source tail there would silently convert
 * the user's atom back into a dummy. Count mismatches bail entirely — that is
 * a real edit and the guard owns it.
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
    // The user replaced this atom (count-preserving redraw): leave their line.
    if (!DUMMY_SYMBOLS.has(editedLine.slice(31, 34).trim())) continue;
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

export interface TypedRGroupConversion {
  /** Molblock with the eligible typed R-group atoms rewritten to canonical dummies. */
  molblock: string;
  /** 0-based atom index -> map number, for the atoms converted by this pass. */
  converted: Record<number, string>;
}

/**
 * Convert typed R-group pseudo-atoms into canonical class dummies.
 *
 * OCL's "?..." custom-atom dialog accepts `R1`..`R16` (Greek labels like "Rα"
 * cannot be typed), and `toMolfile` emits each one as symbol `R#` with atom
 * map 0 plus an `M  RGP` line pairing 1-based atom index -> group number —
 * verified empirically; several groups share one line
 * (`M  RGP  2  18   8  19  12`). The class pipeline's canonical spelling is
 * `*` + V2000 atom map instead, so every `R#` atom whose group number is an
 * allowed rLabels key is rewritten in place: symbol cols 31-34 become `*`,
 * the map (mmm) field at cols 60-63 gets the group number, and the pair is
 * pruned from its RGP line (dropped entirely once no pairs remain).
 *
 * Group numbers without an rLabels entry stay untouched — still a visible
 * `R#` atom with its RGP entry, never silently lost. Identity for molblocks
 * without RGP lines, i.e. every substance emission.
 */
export function convertTypedRGroups(
  molblock: string,
  allowedMapNums: readonly string[],
): TypedRGroupConversion {
  const converted: Record<number, string> = {};
  if (allowedMapNums.length === 0 || !molblock.includes("M  RGP")) {
    return { molblock, converted };
  }
  const lines = molblock.split(/\r?\n/);
  const block = atomBlock(lines);
  if (!block) return { molblock, converted };
  const allowed = new Set(allowedMapNums);

  for (let i = 0; i < lines.length; i += 1) {
    if (!/^M {2}RGP/.test(lines[i])) continue;
    // "M  RGP  N aaa nnn ..." — pair count, then (1-based atom, group) pairs.
    const pairs = lines[i].trim().split(/\s+/).slice(3);
    const kept: string[] = [];
    for (let p = 0; p + 1 < pairs.length; p += 2) {
      const atomIndex = Number.parseInt(pairs[p], 10) - 1;
      const mapNum = pairs[p + 1];
      const line = lines[block.start + atomIndex];
      const eligible =
        allowed.has(mapNum) &&
        atomIndex >= 0 &&
        atomIndex < block.count &&
        !!line &&
        line.length >= 63 &&
        line.slice(31, 34).trim() === "R#";
      if (!eligible) {
        kept.push(pairs[p], mapNum);
        continue;
      }
      lines[block.start + atomIndex] =
        line.slice(0, 31) + "*  " + line.slice(34, 60) + mapNum.padStart(3) + line.slice(63);
      converted[atomIndex] = mapNum;
    }
    if (kept.length === 0) {
      lines.splice(i, 1);
      i -= 1;
    } else if (kept.length < pairs.length) {
      // Rebuild in OCL's own format: %3d count, then " %3d %3d" per pair.
      let rebuilt = "M  RGP" + String(kept.length / 2).padStart(3);
      for (const token of kept) rebuilt += " " + token.padStart(3);
      lines[i] = rebuilt;
    }
  }
  return { molblock: lines.join("\n"), converted };
}

/** S-group ids owned by OCL's `NOSEARCH_OCL_CUSTOM_LABEL` data name. */
function oclCustomLabelSgroupIds(lines: string[]): Set<string> {
  const ids = new Set<string>();
  for (const line of lines) {
    const match = /^M {2}SDT +(\d+) +NOSEARCH_OCL_CUSTOM_LABEL\b/.exec(line);
    if (match) ids.add(match[1]);
  }
  return ids;
}

/**
 * Read the custom labels OCL currently displays from a RAW (pre-strip)
 * emission: atom index (0-based; `M  SAL` entries are 1-based) -> label text
 * (`M  SED`). OCL tracks label-atom identity through edits, so this is the
 * ground truth of what the canvas shows — labels survive on their atoms and
 * disappear with them, regardless of how indices shifted since load.
 */
export function parseOclCustomLabelSgroups(molblock: string): Record<number, string> {
  const labels: Record<number, string> = {};
  if (!molblock.includes("NOSEARCH_OCL_CUSTOM_LABEL")) return labels;

  const lines = molblock.split(/\r?\n/);
  const ids = oclCustomLabelSgroupIds(lines);
  if (ids.size === 0) return labels;

  const atomById = new Map<string, number>();
  const textById = new Map<string, string>();
  for (const line of lines) {
    const sal = /^M {2}SAL +(\d+) +\d+ +(\d+)/.exec(line);
    if (sal && ids.has(sal[1])) {
      atomById.set(sal[1], Number.parseInt(sal[2], 10) - 1);
      continue;
    }
    const sed = /^M {2}SED +(\d+) (.+)$/.exec(line);
    if (sed && ids.has(sed[1])) textById.set(sed[1], sed[2].trimEnd());
  }
  for (const [id, atom] of atomById) {
    const text = textById.get(id);
    if (text && atom >= 0) labels[atom] = text;
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
  const labelSgroups = oclCustomLabelSgroupIds(lines);
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
