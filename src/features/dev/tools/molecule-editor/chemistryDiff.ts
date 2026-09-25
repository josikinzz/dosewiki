/**
 * Plain-language identity of an InChI, for the "changed chemistry" panel the
 * molecule editor shows before a structure whose identity changed can publish.
 */

export interface InchiSummary {
  /** Molecular formula layer, e.g. "C10H15N". */
  formula: string;
  /** Number of tetrahedral stereocentres the `/t` layer defines. */
  stereocentres: number;
  /** The `/t`, `/m` and `/s` layers as InChI writes them, or null when achiral. */
  stereoLayer: string | null;
}

/** Split a standard InChI into its formula and stereo layers; null when unreadable. */
export function describeInchi(inchi: string): InchiSummary | null {
  const match = /^InChI=1S?\/([^/]+)(\/.*)?$/.exec(inchi.trim());
  if (!match) return null;
  const layers = (match[2] ?? "").split("/").filter(Boolean);
  const stereo = layers.filter((layer) => /^[tms]/.test(layer));
  const tetrahedral = stereo.find((layer) => layer.startsWith("t"));
  return {
    formula: match[1],
    stereocentres: tetrahedral ? tetrahedral.slice(1).split(",").filter(Boolean).length : 0,
    stereoLayer: stereo.length > 0 ? stereo.join("/") : null,
  };
}

/** The typed confirmation matches the name the chemist is publishing, ignoring case. */
export function matchesTypedName(typed: string, name: string): boolean {
  const expected = name.trim().toLowerCase();
  return expected.length > 0 && typed.trim().toLowerCase() === expected;
}
