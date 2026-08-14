#!/usr/bin/env python
"""
Brand-coloured RDKit skeletal-structure drawing engine.

The per-substance static pipeline that used this file's CLI is retired: substance
depictions are Convex `moleculeOverrides` rows now. The module survives because
`render_class_structures.py` imports its style/orientation engine (PALETTE,
SCAFFOLD_DEFS, align, _draw_mol_svg) to draw the chemical-class Markush skeletons
in `public/molecules/classes/`.

Why this produces a *consistent* set (the project goal):
  * One engine, one config for every molecule -> identical fonts + stroke weights.
  * "Fill the container": a tight, flexible canvas (-1,-1) whose viewBox hugs the molecule's
    bounding box (no square letterboxing). Shown via object-contain in a fixed box
    (HeroSection.tsx), the molecule fills the container to its limiting dimension (max width OR
    max height). fixedBondLength keeps the bond:stroke:label proportions identical across the
    set so every molecule is drawn in the same style; a modest viewBox floor (2.0×bondLength)
    stops 2-3 atom molecules from over-zooming without padding them into a sea of whitespace
    (see _floor_viewbox).
  * A light, polished line style: thin bonds (bondLineWidth 1.1) with rounded caps/joins
    (see _round_strokes) so vertices read as soft curved corners rather than sharp, chonky
    miters.
  * Per-class canonical orientation (see SCAFFOLD_DEFS + align()): every member of a chemical
    class is drawn in the same textbook orientation (all phenethylamines alike, all
    tryptamines alike, lysergamides indole-down/amide-up, morphinans phenol-up, ...). Tuned by
    eye against the legacy artwork; rigid fused-ring cores use CoordGen directly while flexible
    cores are hard-constrained to a scaffold, then both get a per-class rotation.
  * Molecules matching no scaffold get a deterministic fallback orientation
    (canonicalize_default_orientation): PCA long axis horizontal, rings left, heteroatoms up —
    so one-offs (aspirin, nicotine, ...) land in their familiar textbook pose instead of an
    arbitrary CoordGen angle. SUBSTANCE_ORIENT adds per-slug (rot, flip) tweaks on top.
  * A brand atom palette colour-codes elements (O rose, N violet, S lime, halogens, ...)
    matching the existing site artwork.

Usage:
  render_molecules.py --input coverage.json --outdir public/molecules \
      [--bond-length 28] [--line-width 1.1] [--floor-mult 2.0] [--font /path/to.ttf] \
      [--report report.json]

Input JSON: a list of objects each with at least {"key": <filename-stem>, "smiles": <str|components-obj>}.
A `components` object ({"components": {"Name": "SMILES", ...}}) renders its first component.
"""
import argparse
import json
import os
import re
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
    ("salvinorin",          "O=C1CCCC2CCC3C(=O)OC(c4ccoc4)CC3C12",              0, False, True),   # salvinorins (rigid tricyclic lactone, furan pendant)
    ("thc",                 "C1=CC2c3ccccc3OCC2CC1",                            0, True,  True),   # cannabinoids/THC (benzochromene tricycle)
    ("triazolothieno",      "C1=NCc2nncn2-c2sccc21",                            0, False, False),  # etizolam family (triazolo-thienodiazepines)
    ("triazolobenzo",       "C1=NCc2nncn2-c2ccccc21",                           0, False, False),  # alprazolam/triazolam/clonazolam family
    ("thienodiazepine",     "O=C1CN=C(c2ccccc2)c2ccsc2N1",                      0, True,  False),  # clotiazepam/bentazepam (thieno lactam benzos)
    ("clobazam-dione",      "O=C1CC(=O)N(c2ccccc2)c2ccccc2N1",                  0, False, False),  # clobazam (1,5-benzodiazepine-2,4-dione)
    ("benzodiazepine",      "O=C1CN=C(c2ccccc2)c2ccccc2N1",                   270, True,  False),  # benzos (fused benzo left, pendant phenyl down)
    ("benzodiazepine2",     "O=C1CN=Cc2ccccc2N1",                             270, True,  False),  # pendant-agnostic benzos (bromazepam, tetrazepam)
    ("librium-amidine",     "C1=Nc2ccccc2N=C(c2ccccc2)C1",                    180, True,  False),  # chlordiazepoxide (amidine benzo, no lactam)
    ("quinazolinone",       "O=c1n(-c2ccccc2)cnc2ccccc12",                      0, True,  False),  # methaqualone family (3-arylquinazolin-4-ones)
    ("phenothiazine",       "c1ccc2c(c1)Nc1ccccc1S2",                           0, False, False),  # promethazine/prochlorperazine (tricycle, N-chain up)
    ("quetiapine-core",     "c1ccc2c(c1)N=Cc1ccccc1S2",                         0, False, False),  # dibenzothiazepines (quetiapine)
    ("sildenafil-core",     "O=c1[nH]c(-c2ccccc2)nc2cn[nH]c12",                 0, False, False),  # sildenafil/homosildenafil (pyrazolopyrimidinone)
    ("zolpidem-core",       "c1ccc(-c2cn3ccccc3n2)cc1",                         0, False, False),  # zolpidem (imidazopyridine)
    ("zaleplon-core",       "c1ccc(-c2ccnc3ccnn23)cc1",                         0, False, False),  # zaleplon/sonata (pyrazolopyrimidine)
    ("zopiclone-core",      "O=C1NCc2nccnc12",                                  0, False, False),  # zopiclone/eszopiclone (pyrrolopyrazinone)
    ("indazole-amide",      "O=C(N)c1n[nH]c2ccccc12",                           0, False, False),  # AB-x/AKB48 synthetic cannabinoids (indazole-3-carboxamide)
    ("acylindole",          "O=Cc1c[nH]c2ccccc12",                              0, False, False),  # JWH/AM/UR synthetic cannabinoids (3-acylindoles)
    ("nitazene",            "c1ccc(Cc2nc3ccccc3[nH]2)cc1",                      0, False, False),  # nitazenes (2-benzylbenzimidazoles)
    ("arylcyclohexylamine", "O=C1CCCCC1c1ccccc1",                              90, False, False),  # ketamine/MXE (aryl top, cyclohexanone bottom)
    ("arylcyclohexylamine2","NC1(c2ccccc2)CCCCC1",                              0, False, False),  # PCP-type (piperidine left, cyclohexane up, phenyl down)
    ("tropane",             "C1CC2CCC(C1)N2C",                                180, False, True),   # cocaine/tropanes (rigid cage, aryl/ester right)
    ("fentanyl",            "O=C(CC)N(c1ccccc1)C1CCNCC1",                       0, False, False),  # fentanyls (phenethyl right, anilide left)
    ("anilidopiperidine",   "c1ccccc1NC1CCNCC1",                                0, False, False),  # broader fentanyl family
    ("thiobarbiturate",     "O=C1NC(=S)NC(=O)C1",                               0, False, False),  # thiobarbiturates (thiopental) — same orientation as barbiturates
    ("barbiturate",         "O=C1NC(=O)NC(=O)C1",                               0, False, False),  # barbiturates (2-one bottom, 5-substituents up)
    ("phenidate",           "OC(=O)C(c1ccccc1)C1CCCCN1",                        0, True,  False),  # methylphenidate (phenyl left, ester up, piperidine right)
    ("phenylpiperidine",    "c1ccccc1C1CCNCC1",                                 0, False, False),  # pethidine/ketobemidone/haloperidol (4-phenylpiperidines) — MUST stay after morphinan/tropane/phenidate
    ("tramadol-core",       "OC1(c2ccccc2)CCCCC1",                              0, False, False),  # tramadol/O-DSMT (1-phenylcyclohexanol)
    ("phenylpiperazine",    "c1ccccc1N1CCNCC1",                               270, False, False),  # mCPP/4-FPP/trazodone (N-arylpiperazines)
    ("tryptamine",          "c1ccc2c(c1)c(c[nH]2)CCN",                          0, False, False),  # tryptamines (indole lower-left, chain up-right)
    ("cathinone",           "c1ccccc1C(=O)C(C)N",                              90, False, False),  # cathinones (aryl left, ketone O up, amine chain right)
    ("racetam",             "O=C1CCCN1",                                        0, False, False),  # racetams (2-pyrrolidinone left, N-substituent right) — before phenethylamine so phenylpiracetam lands here
    ("amphetamine",         "c1ccccc1CC(C)N",                                 180, False, False),  # amphetamines (ring left, chain to upper-right, amine top-right — matches 2C-x family)
    ("phenethylamine",      "c1ccccc1CCN",                                    180, False, False),  # 2C-x, scalines, NBOMe (ring left, chain to upper-right, amine top-right)
    ("diphenylmethane",     "C(c1ccccc1)c1ccccc1",                              0, False, False),  # diphenhydramine-type (two phenyls upper-left, chain down-right)
    ("benzylpiperazine",    "c1ccccc1CN1CCNCC1",                                0, False, False),  # BZP/MBZP/quetiapine — after diphenylmethane so benzhydryl piperazines keep that class
    ("xanthine",            "O=c1[nH]c(=O)c2[nH]cnc2[nH]1",                     0, True,  False),  # caffeine/theobromine/theacrine — after amphetamine so fenethylline stays there
    ("benzamide",           "O=C(N)c1ccccc1",                                   0, False, False),  # generic benzamide fallback (U-47700, AH-7921, moclobemide, pagoclone) — keep LAST
]


# ---------------------------------------------------------------------------
# Per-substance orientation tweaks: slug -> (rot deg CCW, flip_x), applied AFTER the
# scaffold/fallback layout and class rotation. For famous one-off molecules whose
# textbook orientation differs from what the deterministic layout produces.
# Tuned by eye against the depictions people actually recognise (Wikipedia/PubChem).
# ---------------------------------------------------------------------------
SUBSTANCE_ORIENT = {
    "haloperidol": (90, False),   # horizontal: fluorophenacyl left, chlorophenyl right
    "moclobemide": (270, False),  # horizontal: chlorobenzamide left, ethylmorpholine right
}


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


def canonicalize_default_orientation(mol):
    """Deterministic orientation for molecules that match no class scaffold, so unmatched
    molecules still look intentional and consistent instead of landing at whatever angle
    CoordGen happens to pick. Three deterministic steps on the 2D conformer:
      1. rotate the principal axis (PCA of heavy-atom coords) horizontal — long molecules
         read left-to-right;
      2. mirror x so the ring-atom centroid sits in the left half (ring system left,
         chains trailing right — the common textbook reading order);
      3. mirror y so the heteroatom centroid sits in the upper half (O/N labels up).
    Mirroring only changes the depiction; wedges are re-assigned from the final coords at
    draw time, so stereochemistry stays correct."""
    import numpy as np
    conf = mol.GetConformer()
    n = mol.GetNumAtoms()
    if n < 3:
        return
    pts = np.array([[conf.GetAtomPosition(i).x, conf.GetAtomPosition(i).y] for i in range(n)])
    center = pts.mean(axis=0)
    centered = pts - center
    cov = centered.T @ centered
    evals, evecs = np.linalg.eigh(cov)
    principal = evecs[:, -1]  # largest-variance direction
    if abs(evals[-1]) > 1e-9:
        orient_conformer(mol, -np.degrees(np.arctan2(principal[1], principal[0])), False)
        pts = np.array([[conf.GetAtomPosition(i).x, conf.GetAtomPosition(i).y] for i in range(n)])
        center = pts.mean(axis=0)
    ring_idx = [i for i in range(n) if mol.GetAtomWithIdx(i).IsInRing()]
    if ring_idx and pts[ring_idx].mean(axis=0)[0] > center[0] + 1e-6:
        orient_conformer(mol, 0.0, True)
        pts[:, 0] = 2 * center[0] - pts[:, 0]
    het_idx = [i for i in range(n) if mol.GetAtomWithIdx(i).GetAtomicNum() not in (1, 6)]
    if het_idx and pts[het_idx].mean(axis=0)[1] < center[1] - 1e-6:
        from rdkit.Chem import rdMolTransforms
        F = np.identity(4)
        F[1, 1] = -1
        rdMolTransforms.TransformConformer(conf, F)


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
    try:
        canonicalize_default_orientation(mol)
    except Exception:
        pass
    return "default"


def _draw_mol_svg(mol, bond_length, line_width, font, floor_mult, use_molblock_wedging=False,
                  palette="brand"):
    """Draw an already-positioned mol to a brand-styled SVG. Shared by the SMILES path
    (auto layout) and the override path (human-authored MOL block).

    Tight, flexible canvas (-1,-1): the SVG's viewBox hugs the molecule's bounding box, with
    no square letterboxing. Shown via object-contain in a fixed box (see HeroSection.tsx), the
    molecule itself then fills the container to its limiting dimension. fixedBondLength keeps the
    bond-length:stroke:label proportions identical across the whole set; transparent background.

    When `use_molblock_wedging` is set, the wedge/hash bonds authored in the MOL block are drawn
    verbatim (RDKit does NOT re-pick which bond is wedged) — this is what makes a human's per-bond
    stereo-depiction edits stick.
    """
    d = rdMolDraw2D.MolDraw2DSVG(-1, -1)
    o = d.drawOptions()
    o.fixedBondLength = bond_length
    o.bondLineWidth = line_width
    o.scaleBondWidth = False
    o.padding = 0.06
    o.clearBackground = False           # transparent background
    if palette == "brand":
        o.useBWAtomPalette()
        o.updateAtomPalette(PALETTE)
    # palette == "standard": keep RDKit's default element colours (black C skeleton,
    # blue N, red O, ... — the textbook look, for the public download pack).
    o.annotationFontScale = 0.7
    if font and os.path.exists(font):
        o.fontFile = font
    if use_molblock_wedging:
        o.useMolBlockWedging = True
        draw_mol = rdMolDraw2D.PrepareMolForDrawing(mol, wedgeBonds=False)
        d.DrawMolecule(draw_mol)
    else:
        rdMolDraw2D.PrepareAndDrawMolecule(d, mol)
    d.FinishDrawing()
    svg = _round_strokes(d.GetDrawingText())
    return _floor_viewbox(svg, floor=bond_length * floor_mult)


def render_svg(smiles, bond_length, line_width, font, floor_mult=2.0, slug=None, palette="brand"):
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None, None, None
    scaffold = align(mol)
    if slug in SUBSTANCE_ORIENT:
        rot, flip = SUBSTANCE_ORIENT[slug]
        orient_conformer(mol, rot, flip)
    svg = _draw_mol_svg(mol, bond_length, line_width, font, floor_mult, palette=palette)
    return svg, scaffold, mol


def render_svg_from_molblock(molblock, bond_length, line_width, font, floor_mult=2.0,
                             palette="brand"):
    """Render an override MOL block (human-authored coords + wedges) verbatim."""
    mol = Chem.MolFromMolBlock(molblock)
    if mol is None:
        return None
    return _draw_mol_svg(mol, bond_length, line_width, font, floor_mult,
                         use_molblock_wedging=True, palette=palette)


def _round_strokes(svg):
    """Soften the skeletal lines: round bond caps + joins. RDKit hardcodes butt caps and miter
    joins, which read as sharp/chonky. Rounding the caps lets the bonds meeting at each carbon
    vertex blend into a smooth curved corner (the polished, modern-ChemDraw / PubChem look), and
    round joins clean up the wedge and multi-segment bond strokes. Atom labels are filled paths,
    not strokes, so they are untouched."""
    return (svg.replace("stroke-linecap:butt", "stroke-linecap:round")
               .replace("stroke-linejoin:miter", "stroke-linejoin:round"))


_SVG_DIMS_RE = re.compile(r"width='(\d+(?:\.\d+)?)px'\s+height='(\d+(?:\.\d+)?)px'\s+viewBox='0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)'")


def _floor_viewbox(svg, floor):
    """Pad the viewBox of a tight SVG so a tiny molecule (2-3 atoms) does not zoom to fill the
    whole card with cartoonishly heavy strokes. Molecules already larger than `floor` in both
    dimensions are untouched and still fill their container."""
    m = _SVG_DIMS_RE.search(svg)
    if not m:
        return svg
    w, h, vw, vh = (float(x) for x in m.groups())
    tw, th = max(w, floor), max(h, floor)
    if tw == w and th == h:
        return svg
    ox, oy = (tw - vw) / 2.0, (th - vh) / 2.0
    new = (f"width='{tw:g}px' height='{th:g}px' "
           f"viewBox='{-ox:g} {-oy:g} {tw:g} {th:g}'")
    return svg[:m.start()] + new + svg[m.end():]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--bond-length", type=float, default=28.0)
    ap.add_argument("--line-width", type=float, default=1.1)
    ap.add_argument("--floor-mult", type=float, default=2.0)
    ap.add_argument("--font", default="")
    ap.add_argument("--report", default="")
    ap.add_argument("--overrides", default="",
                    help="dir of <slug>.mol overrides drawn verbatim instead of auto layout")
    ap.add_argument("--base-outdir", default="",
                    help="dir to write the post-align <slug>.mol (editor starting point)")
    ap.add_argument("--palette", default="brand", choices=("brand", "standard"),
                    help="'brand' = dose.wiki colours; 'standard' = RDKit default textbook colours")
    args = ap.parse_args()

    items = json.load(open(args.input))
    os.makedirs(args.outdir, exist_ok=True)
    if args.base_outdir:
        os.makedirs(args.base_outdir, exist_ok=True)

    rendered, failed = [], []
    scaffold_counts = {}
    for it in items:
        key = it.get("key") or it.get("slug") or it.get("title")
        if not key:
            failed.append({"key": key, "reason": "no-key"})
            continue

        # 1. Human-authored override wins: draw its coords + wedges verbatim, skip layout.
        override_path = os.path.join(args.overrides, f"{key}.mol") if args.overrides else None
        if override_path and os.path.exists(override_path):
            try:
                with open(override_path) as mf:
                    svg = render_svg_from_molblock(
                        mf.read(), args.bond_length, args.line_width, args.font, args.floor_mult,
                        palette=args.palette)
            except Exception as e:  # noqa: BLE001
                failed.append({"key": key, "reason": f"override-render-error: {e}"})
                continue
            if svg is None:
                failed.append({"key": key, "reason": "unparseable-override"})
                continue
            with open(os.path.join(args.outdir, f"{key}.svg"), "w") as f:
                f.write(svg)
            rendered.append(key)
            scaffold_counts["override"] = scaffold_counts.get("override", 0) + 1
            continue

        # 2. No override: auto layout from SMILES (as before).
        smiles = normalize_smiles(it.get("smiles"))
        if not smiles:
            failed.append({"key": key, "reason": "no-smiles"})
            continue
        try:
            svg, scaffold, mol = render_svg(smiles, args.bond_length, args.line_width, args.font, args.floor_mult, slug=key, palette=args.palette)
        except Exception as e:  # noqa: BLE001
            failed.append({"key": key, "reason": f"render-error: {e}"})
            continue
        if svg is None:
            failed.append({"key": key, "reason": "unparseable-smiles", "smiles": smiles})
            continue
        with open(os.path.join(args.outdir, f"{key}.svg"), "w") as f:
            f.write(svg)
        # Emit the post-align MOL block so the editor can start from production orientation.
        if args.base_outdir and mol is not None:
            try:
                with open(os.path.join(args.base_outdir, f"{key}.mol"), "w") as bf:
                    bf.write(Chem.MolToMolBlock(mol))
            except Exception:  # noqa: BLE001
                pass
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
