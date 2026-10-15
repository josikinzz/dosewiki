export interface ClassDummyAtom {
  index: number;
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
    return editedMolblock;
  }

  for (const dummy of dummies) {
    const editedLine = editedLines[editedBlock.start + dummy.index];
    const sourceLine = sourceLines[sourceBlock.start + dummy.index];
    if (!editedLine || !sourceLine || editedLine.length < 34 || sourceLine.length < 34) continue;
    if (!DUMMY_SYMBOLS.has(editedLine.slice(31, 34).trim())) continue;
    editedLines[editedBlock.start + dummy.index] =
      editedLine.slice(0, 31) + sourceLine.slice(31);
  }
  return editedLines.join("\n");
}

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
  molblock: string;
  converted: Record<number, string>;
}

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
      let rebuilt = "M  RGP" + String(kept.length / 2).padStart(3);
      for (const token of kept) rebuilt += " " + token.padStart(3);
      lines[i] = rebuilt;
    }
  }
  return { molblock: lines.join("\n"), converted };
}

function oclCustomLabelSgroupIds(lines: string[]): Set<string> {
  const ids = new Set<string>();
  for (const line of lines) {
    const match = /^M {2}SDT +(\d+) +NOSEARCH_OCL_CUSTOM_LABEL\b/.exec(line);
    if (match) ids.add(match[1]);
  }
  return ids;
}

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

export function stripOclCustomLabelSgroups(molblock: string): string {
  if (!molblock.includes("NOSEARCH_OCL_CUSTOM_LABEL")) return molblock;

  const lines = molblock.split(/\r?\n/);
  const labelSgroups = oclCustomLabelSgroupIds(lines);
  if (labelSgroups.size === 0) return molblock;

  return lines
    .filter((line) => {
      const match =
        /^M {2}(?:STY|SLB) +\d+ +(\d+)/.exec(line) ??
        /^M {2}(?:SAL|SDT|SDD|SED) +(\d+)/.exec(line);
      return !match || !labelSgroups.has(match[1]);
    })
    .join("\n");
}
