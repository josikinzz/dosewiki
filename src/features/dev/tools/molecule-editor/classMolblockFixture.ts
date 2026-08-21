/** Real RDKit (2026.03) molblock for the phenethylamine class Markush SMILES —
 * dummy atoms spelled "R" with atom maps in the aaa column. The JS MinimalLib
 * spells dummies "*"; both are handled. Shared by the class molblock tests. */
export const RDKIT_PHENETHYLAMINE = "\n     RDKit          2D\n\n 17 17  0  0  0  0  0  0  0  0999 V2000\n    3.7500    3.8971    0.0000 R   0  0  0  0  0  1  0  0  0  9  0  0\n    3.0000    2.5981    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0\n    3.7500    1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    5.2500    1.2990    0.0000 R   0  0  0  0  0  1  0  0  0  8  0  0\n    3.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    3.7500   -1.2990    0.0000 R   0  0  0  0  0  1  0  0  0  7  0  0\n    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    0.7500   -1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    1.5000   -2.5981    0.0000 R   0  0  0  0  0  1  0  0  0  2  0  0\n   -0.7500   -1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n   -1.5000   -2.5981    0.0000 R   0  0  0  0  0  1  0  0  0  3  0  0\n   -1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n   -3.0000    0.0000    0.0000 R   0  0  0  0  0  1  0  0  0  4  0  0\n   -0.7500    1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n   -1.5000    2.5981    0.0000 R   0  0  0  0  0  1  0  0  0  5  0  0\n    0.7500    1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    1.5000    2.5981    0.0000 R   0  0  0  0  0  1  0  0  0  6  0  0\n  1  2  1  0\n  2  3  1  0\n  3  4  1  0\n  3  5  1  0\n  5  6  1  0\n  5  7  1  0\n  7  8  2  0\n  8  9  1  0\n  8 10  1  0\n 10 11  1  0\n 10 12  2  0\n 12 13  1  0\n 12 14  1  0\n 14 15  1  0\n 14 16  2  0\n 16 17  1  0\n 16  7  1  0\nM  END\n\n";

export const R_LABELS: Record<string, string> = {
  "2": "R2", "3": "R3", "4": "R4", "5": "R5", "6": "R6",
  "7": "Rb", "8": "Ra", "9": "RN",
};

/** OCL-style emission of a fresh benzene redraw: 6 plain carbons, no dummies,
 * zeroed chemistry tails — the shape the canvas emits after the user erases
 * the class structure and draws a new molecule. */
export const OCL_BENZENE = [
  "",
  "  OCL editor",
  "",
  "  6  6  0  0  0  0  0  0  0  0999 V2000",
  "    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "    0.7500    1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "   -0.7500    1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "   -1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "   -0.7500   -1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "    0.7500   -1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "  1  2  2  0",
  "  2  3  1  0",
  "  3  4  2  0",
  "  4  5  1  0",
  "  5  6  2  0",
  "  6  1  1  0",
  "M  END",
  "",
].join("\n");

/** Raw (pre-strip) OCL emission of a partial redraw: benzene plus ONE surviving
 * labeled dummy (atom 7, 1-based, still displaying "RN"). OCL writes the
 * displayed label as a NOSEARCH_OCL_CUSTOM_LABEL DAT S-group whose SAL entry
 * carries the atom's CURRENT index — the shape parseOclCustomLabelSgroups and
 * the emission seam consume. */
export const OCL_BENZENE_WITH_SURVIVOR_RAW = [
  "",
  "  OCL editor",
  "",
  "  7  7  0  0  0  0  0  0  0  0999 V2000",
  "    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "    0.7500    1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "   -0.7500    1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "   -1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "   -0.7500   -1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "    0.7500   -1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "    3.0000    0.0000    0.0000 ?   0  0  0  0  0  0  0  0  0  0  0  0",
  "  1  2  2  0",
  "  2  3  1  0",
  "  3  4  2  0",
  "  4  5  1  0",
  "  5  6  2  0",
  "  6  1  1  0",
  "  1  7  1  0",
  "M  STY  1   1 DAT",
  "M  SLB  1   1   1",
  "M  SAL   1  1   7",
  "M  SDT   1 NOSEARCH_OCL_CUSTOM_LABEL",
  "M  SDD   1     3.0000    0.0000    DA    ALL  1       5",
  "M  SED   1 RN",
  "M  END",
  "",
].join("\n");
