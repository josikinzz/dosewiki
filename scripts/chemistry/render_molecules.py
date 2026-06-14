#!/usr/bin/env python
"""
Render consistent, brand-coloured SVG skeletal structures for every substance
from SMILES, using RDKit.

Why this produces a *consistent* set (the project goal):
  * One engine, one config for every molecule -> identical fonts + stroke weights.
  * "Fill the card": a fixed square canvas with no fixedBondLength, so every molecule
    auto-scales to fill the box. bondLineWidth is in canvas pixels with scaleBondWidth=False,
    so the on-screen line weight is identical for every molecule once the SVGs are shown via
    `object-contain` at a uniform size (see HeroSection.tsx).
  * Per-class canonical orientation (see SCAFFOLD_DEFS + align()): every member of a chemical
    class is drawn in the same textbook orientation (all phenethylamines alike, all
    tryptamines alike, lysergamides indole-down/amide-up, morphinans phenol-up, ...). Tuned by
    eye against the legacy artwork; rigid fused-ring cores use CoordGen directly while flexible
    cores are hard-constrained to a scaffold, then both get a per-class rotation.
  * A brand atom palette colour-codes elements (O rose, N violet, S lime, halogens, ...)
    matching the existing site artwork.

Usage:
  render_molecules.py --input coverage.json --outdir public/molecules \
      [--canvas 320] [--line-width 2] [--font /path/to.ttf] [--report report.json]

Input JSON: a list of objects each with at least {"key": <filename-stem>, "smiles": <str|components-obj>}.
A `components` object ({"components": {"Name": "SMILES", ...}}) renders its first component.
"""
import argparse
import json
import os
import sys

from rdkit import Chem, RDLogger
from rdkit.Chem import rdDepictor
from rdkit.Chem.Draw import rdMolDraw2D

RDLogger.DisableLog("rdApp.*")
rdDepictor.SetPreferCoordGen(True)  # ChemDraw-quality default layouts


# ---------------------------------------------------------------------------
# Brand palette: element -> RGB (0-1). Decoded from scripts/util/recolorMolecules.mjs
# + notes-and-plans/reports/molecule-svg-color-audit.md so new art matches old art.
# ---------------------------------------------------------------------------
def _hex(h):
    h = h.lstrip("#")
    return (int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255)


CARBON = _hex("f0abfc")  # fuchsia-300 — carbon skeleton / bonds / default
PALETTE = {
    -1: CARBON,            # default
    1:  CARBON,            # H
    6:  CARBON,            # C
    7:  _hex("c4b5fd"),    # N  violet-300
    8:  _hex("fda4af"),    # O  rose-300
    9:  _hex("fbbf24"),    # F  amber-400
    15: _hex("fbbf24"),    # P  amber-400
    16: _hex("bef264"),    # S  lime-300
    17: _hex("6ee7b7"),    # Cl emerald-300
    35: _hex("fb7185"),    # Br rose-400
    53: _hex("e879f9"),    # I  fuchsia-400
}


# ---------------------------------------------------------------------------
# Class scaffolds, most-specific first, so every member of a class shares one canonical
# orientation. Two layout strategies (chosen per scaffold by `rigid`):
#   * flexible cores (chains, single ring + side chain): hard-constrain the molecule to the
#     scaffold template — RDKit lays the class out identically. Needed because plain CoordGen
#     orients flexible molecules differently depending on their substituents.
#   * rigid fused-ring cores (ergoline, morphinan): plain CoordGen already orients the whole
#     class identically and cleanly; template alignment would re-canonicalise per molecule
#     (drift) or tilt, so we skip it and only use the match to pick the class rotation.
# `rot`/`flip` then rotate/mirror the (already consistent) molecule into the canonical
# textbook orientation, tuned by eye against the legacy artwork.
# Cores are validated SMILES (several are Murcko scaffolds of a representative drug).
# ---------------------------------------------------------------------------
SCAFFOLD_DEFS = [
    # name,                  SMILES,                                            rot, flip,  rigid
    ("ergoline",            "C1=C2c3cccc4[nH]cc(c34)CC2NCC1",                  270, False, False),  # LSD family (indole bottom, amide top)
    ("morphinan",           "C1=CC2C3Cc4cccc5c4C2(CCN3)C(C1)O5",                0, False, False),  # 4,5-epoxymorphinans (morphine/codeine/heroin...)
    ("morphinan2",          "c1ccc2c(c1)CC1NCCC23CCCCC13",                      0, False, False),  # non-epoxy morphinans (dextromethorphan, levorphanol...)
    ("benzodiazepine",      "O=C1CN=C(c2ccccc2)c2ccccc2N1",                   270, True,  False),  # benzos (fused benzo left, pendant phenyl down)
    ("arylcyclohexylamine", "O=C1CCCCC1c1ccccc1",                              90, False, False),  # ketamine/MXE (aryl top, cyclohexanone bottom)
    ("arylcyclohexylamine2","NC1(c2ccccc2)CCCCC1",                              0, False, False),  # PCP-type (piperidine left, cyclohexane up, phenyl down)
    ("tropane",             "C1CC2CCC(C1)N2C",                                  0, False, False),  # cocaine/tropanes (benzoate left, tropane right)
    ("fentanyl",            "O=C(CC)N(c1ccccc1)C1CCNCC1",                       0, False, False),  # fentanyls (phenethyl right, anilide left)
    ("anilidopiperidine",   "c1ccccc1NC1CCNCC1",                                0, False, False),  # broader fentanyl family
    ("thiobarbiturate",     "O=C1NC(=S)NC(=O)C1",                               0, False, False),  # thiobarbiturates (thiopental) — same orientation as barbiturates
    ("barbiturate",         "O=C1NC(=O)NC(=O)C1",                               0, False, False),  # barbiturates (2-one bottom, 5-substituents up)
    ("phenidate",           "OC(=O)C(c1ccccc1)C1CCCCN1",                        0, True,  False),  # methylphenidate (phenyl left, ester up, piperidine right)
    ("tryptamine",          "c1ccc2c(c1)c(c[nH]2)CCN",                          0, False, False),  # tryptamines (indole lower-left, chain up-right)
    ("cathinone",           "c1ccccc1C(=O)C(C)N",                              90, False, False),  # cathinones (aryl left, ketone O up, amine chain right)
    ("amphetamine",         "c1ccccc1CC(C)N",                                 180, False, False),  # amphetamines (ring left, chain to upper-right, amine top-right — matches 2C-x family)
    ("phenethylamine",      "c1ccccc1CCN",                                    180, False, False),  # 2C-x, scalines, NBOMe (ring left, chain to upper-right, amine top-right)
    ("diphenylmethane",     "C(c1ccccc1)c1ccccc1",                              0, False, False),  # diphenhydramine-type (two phenyls upper-left, chain down-right)
]


def orient_conformer(mol, deg, flip_x):
    """Rotate (deg, CCW) and optionally mirror (negate x) a molecule's 2D conformer in place."""
    if deg == 0 and not flip_x:
        return
    import numpy as np
    from rdkit.Chem import rdMolTransforms
    conf = mol.GetConformer()
    th = np.radians(deg)
    c, s = np.cos(th), np.sin(th)
    Rz = np.identity(4)
    Rz[0, 0] = c; Rz[0, 1] = -s; Rz[1, 0] = s; Rz[1, 1] = c
    M = Rz
    if flip_x:
        F = np.identity(4); F[0, 0] = -1
        M = Rz @ F
    rdMolTransforms.TransformConformer(conf, M)


# benzene ring matcher for the orientation heuristic
_BENZENE = Chem.MolFromSmarts("c1ccccc1")


def canonicalize_polycyclic_orientation(mol, scaffold):
    """Force a deterministic orientation for rigid fused-ring drugs whose substituent
    variety defeats template alignment (e.g. morphinans). Rotate so the aromatic-ring
    centroid sits ABOVE the nitrogen centroid, then mirror to a canonical handedness fixed
    by the signed area of the matched scaffold atoms. Because the scaffold match is the same
    atom set in the same order for every class member, the handedness is consistent across the
    whole class regardless of substituents."""
    import numpy as np
    conf = mol.GetConformer()

    def centroid(idxs):
        ps = [conf.GetAtomPosition(i) for i in idxs]
        return np.array([sum(p.x for p in ps) / len(ps), sum(p.y for p in ps) / len(ps)])

    benz = mol.GetSubstructMatch(_BENZENE)
    n_idx = [a.GetIdx() for a in mol.GetAtoms() if a.GetSymbol() == "N"]
    if not benz or not n_idx:
        return
    # rotate so vector (N centroid -> aromatic centroid) points straight up (+y)
    v = centroid(benz) - centroid(n_idx)
    if np.hypot(*v) < 1e-6:
        return
    orient_conformer(mol, 90.0 - np.degrees(np.arctan2(v[1], v[0])), False)
    # deterministic mirror: signed area of the ordered scaffold-match polygon flips sign only
    # under reflection, so it pins a consistent handedness for the whole class.
    match = mol.GetSubstructMatch(scaffold)
    if len(match) >= 3:
        pts = [conf.GetAtomPosition(i) for i in match]
        area = sum(pts[i].x * pts[(i + 1) % len(pts)].y - pts[(i + 1) % len(pts)].x * pts[i].y
                   for i in range(len(pts)))
        if area < 0:
            orient_conformer(mol, 0.0, True)


def build_templates():
    # Templates are unrotated; they are only used for substructure matching and (for flexible
    # cores) the hard-constraint layout. The canonical rotation is applied to the finished
    # molecule in align().
    templates = []
    for name, smi, rot, flip, rigid in SCAFFOLD_DEFS:
        m = Chem.MolFromSmiles(smi)
        if m is None:
            print(f"WARN: bad scaffold {name}: {smi}", file=sys.stderr)
            continue
        rdDepictor.Compute2DCoords(m)
        rdDepictor.StraightenDepiction(m)
        templates.append((name, m, rot, flip, rigid))
    return templates


TEMPLATES = build_templates()


def normalize_smiles(value):
    """Accept a SMILES string or a {'components': {...}} preparation object."""
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, dict) and isinstance(value.get("components"), dict):
        for s in value["components"].values():
            if isinstance(s, str) and s.strip():
                return s.strip()
    return None


def align(mol):
    """Give `mol` a clean, class-consistent, canonically-oriented 2D depiction.

    Returns the matched scaffold name (or 'default'). Strategies (see SCAFFOLD_DEFS):
      * morphinan / morphinan2 -> CoordGen + canonicalize_polycyclic_orientation (deterministic
        aromatic-up + canonical handedness). Their substituent variety defeats both template
        alignment and StraightenDepiction, so we force orientation geometrically.
      * rigid cores -> plain CoordGen + StraightenDepiction, then the class rotation.
      * flexible cores -> hard-constrain to the scaffold template, then the class rotation.
    The rotation is applied to the finished, already-consistent molecule, so the class stays
    consistent while landing in its canonical orientation.
    """
    rdDepictor.Compute2DCoords(mol)
    for name, tpl, rot, flip, rigid in TEMPLATES:
        if mol.HasSubstructMatch(tpl):
            try:
                if name in ("morphinan", "morphinan2"):
                    canonicalize_polycyclic_orientation(mol, tpl)
                elif rigid:
                    rdDepictor.StraightenDepiction(mol)
                else:
                    rdDepictor.GenerateDepictionMatching2DStructure(mol, tpl)
                orient_conformer(mol, rot, flip)
                return name
            except Exception:
                continue
    try:
        rdDepictor.StraightenDepiction(mol)
    except Exception:
        pass
    return "default"


def render_svg(smiles, canvas, line_width, font):
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None, None
    scaffold = align(mol)
    # "Fill the card": a fixed square canvas with no fixedBondLength, so every
    # molecule auto-scales to fill the box. bondLineWidth is in CANVAS pixels and
    # scaleBondWidth=False keeps it constant -> identical on-screen line weight for
    # every molecule once the SVG is shown via object-contain at a uniform size.
    d = rdMolDraw2D.MolDraw2DSVG(canvas, canvas)
    o = d.drawOptions()
    o.bondLineWidth = line_width        # identical line weight across the whole set
    o.scaleBondWidth = False
    o.padding = 0.08
    o.clearBackground = False           # transparent background
    o.useBWAtomPalette()
    o.updateAtomPalette(PALETTE)
    o.minFontSize = 13                  # keep atom-label sizes tight + consistent
    o.maxFontSize = 19
    o.annotationFontScale = 0.7
    if font and os.path.exists(font):
        o.fontFile = font
    rdMolDraw2D.PrepareAndDrawMolecule(d, mol)
    d.FinishDrawing()
    return d.GetDrawingText(), scaffold


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--canvas", type=int, default=320)
    ap.add_argument("--line-width", type=float, default=2.0)
    ap.add_argument("--font", default="")
    ap.add_argument("--report", default="")
    args = ap.parse_args()

    items = json.load(open(args.input))
    os.makedirs(args.outdir, exist_ok=True)

    rendered, failed = [], []
    scaffold_counts = {}
    for it in items:
        key = it.get("key") or it.get("slug") or it.get("title")
        smiles = normalize_smiles(it.get("smiles"))
        if not key or not smiles:
            failed.append({"key": key, "reason": "no-smiles"})
            continue
        try:
            svg, scaffold = render_svg(smiles, args.canvas, args.line_width, args.font)
        except Exception as e:  # noqa: BLE001
            failed.append({"key": key, "reason": f"render-error: {e}"})
            continue
        if svg is None:
            failed.append({"key": key, "reason": "unparseable-smiles", "smiles": smiles})
            continue
        with open(os.path.join(args.outdir, f"{key}.svg"), "w") as f:
            f.write(svg)
        rendered.append(key)
        scaffold_counts[scaffold] = scaffold_counts.get(scaffold, 0) + 1

    report = {
        "rendered": len(rendered),
        "failed": len(failed),
        "rendered_slugs": rendered,
        "scaffold_counts": dict(sorted(scaffold_counts.items(), key=lambda x: -x[1])),
        "failures": failed,
    }
    if args.report:
        json.dump(report, open(args.report, "w"), indent=2)
    print(f"Rendered {len(rendered)} SVGs to {args.outdir}  (failed: {len(failed)})")
    print("Scaffold usage:", json.dumps(report["scaffold_counts"]))
    if failed:
        print("Failures:", json.dumps(failed[:20], indent=2))


if __name__ == "__main__":
    main()
