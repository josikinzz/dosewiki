export interface InchiSummary {
  formula: string;
  stereocentres: number;
  stereoLayer: string | null;
}

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

export function matchesTypedName(typed: string, name: string): boolean {
  const expected = name.trim().toLowerCase();
  return expected.length > 0 && typed.trim().toLowerCase() === expected;
}
