#!/usr/bin/env python
"""Render generic Markush (R-group) skeletal structures for each chemical class.

One `<class-key>.svg` per class into `public/molecules/classes`, drawn with the same
brand style/orientation engine as the substance art (imported from render_molecules)
so a class skeleton sits visually beside its members. Dummy atoms carry human R-group
labels (R2, Ra, RN, ...) from the `structure.rLabels` map in chemicalIndexManual.json,
tinted the brand violet so the variable positions read as the "substituted" sites.

Usage:
  render_class_structures.py --manual src/data/indexes/chemicalIndexManual.json \
      --outdir public/molecules/classes [--font ...] [--overrides ...] [--report report.json]
"""
import argparse
import json
import os
import re

from rdkit import Chem, RDLogger
from rdkit.Chem import rdDepictor

import render_molecules as rm

RDLogger.DisableLog("rdApp.*")
rdDepictor.SetPreferCoordGen(True)

# Variable-position (dummy) atoms are tinted violet so the R-labels read as the
# substituted sites; the fixed skeleton keeps the brand fuchsia carbon colour.
R_LABEL_COLOR = rm._hex("c084fc")  # purple-400

# RDKit's FreeType layer walks atom-label strings byte-by-byte, so any
# multi-byte character (Greek positional letters) renders as tofu regardless of
# font. Greek labels are therefore drawn with an ASCII stand-in ("Rα" -> "Ra")
# and the stand-in's baked glyph path is swapped for a real SVG <text> element
# afterwards — browsers render <text> inside <img> SVGs with system fonts,
# which all cover Greek.
# glyph -> (ASCII stand-in, stand-in bbox height as a fraction of the em).
# 'a' is an x-height glyph, 'b' reaches the ascender; both sit on the baseline
# with no descender, so the stand-in bbox bottom is the baseline for <text>.
GREEK_SWAPS = {"α": ("a", 0.52), "β": ("b", 0.72)}

ATOM_PATH_RE = "<path class='atom-{idx}' d='([^']*)' fill='([^']*)'[^>]*/>"


def _swap_last_glyph_for_text(svg, atom_idx, glyph):
    """Replace atom `atom_idx`'s final label glyph path with `glyph` as <text>."""
    matches = list(re.finditer(ATOM_PATH_RE.format(idx=atom_idx), svg))
    if not matches:
        return svg
    target = matches[-1]
    # Path data is "M 121.6 14.5\nL ..." — commands with space-separated x y
    # pairs (Q control points comma-joined); grab every float and pair them up.
    numbers = [float(value) for value in re.findall(r"-?\d+\.?\d*", target.group(1))]
    if len(numbers) < 4 or len(numbers) % 2:
        return svg
    xs = numbers[0::2]
    ys = numbers[1::2]
    size = (max(ys) - min(ys)) / GREEK_SWAPS[glyph][1]
    text = (
        f"<text x='{min(xs):.1f}' y='{max(ys):.1f}' font-family='Helvetica,Arial,sans-serif' "
        f"font-size='{size:.1f}px' fill='{target.group(2)}'>{glyph}</text>"
    )
    return svg[: target.start()] + text + svg[target.end() :]


def _apply_r_labels(mol, r_labels):
    """Set draw labels (Greek transliterated to ASCII); return the swaps to do."""
    greek_swaps = []
    for atom in mol.GetAtoms():
        if atom.GetAtomicNum() != 0:
            continue
        label = r_labels.get(str(atom.GetAtomMapNum()))
        if label:
            drawn = label
            for greek, (ascii_, _ratio) in GREEK_SWAPS.items():
                if greek in drawn:
                    greek_swaps.append((atom.GetIdx(), greek))
                    drawn = drawn.replace(greek, ascii_)
            atom.SetProp("atomLabel", drawn)
        atom.SetAtomMapNum(0)  # hide the ":n" that RDKit would otherwise draw
    return greek_swaps


def _greekify(svg, greek_swaps):
    for atom_idx, glyph in greek_swaps:
        svg = _swap_last_glyph_for_text(svg, atom_idx, glyph)
    return svg


def _with_r_label_palette(draw):
    """Run a draw callback with dummy atoms (the R positions) tinted violet."""
    palette = dict(rm.PALETTE)
    palette[0] = R_LABEL_COLOR
    orig = rm.PALETTE
    rm.PALETTE = palette
    try:
        return draw()
    finally:
        rm.PALETTE = orig


def render_class_svg(smiles, r_labels, bond_length, line_width, font, floor_mult):
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None
    # Attach human R-group labels to the dummy atoms by their map number.
    greek_swaps = _apply_r_labels(mol, r_labels)

    # Reuse the class orientation engine so a class skeleton lands in the same
    # textbook pose as its members (phenethylamine ring left, amine right, ...).
    rm.align(mol)

    svg = _with_r_label_palette(
        lambda: rm._draw_mol_svg(mol, bond_length, line_width, font, floor_mult, palette="brand"),
    )
    return _greekify(svg, greek_swaps) if svg else svg


def render_class_override_svg(molblock, r_labels, bond_length, line_width, font, floor_mult):
    """Render an editor-authored class override verbatim (coords + wedges).

    Editor overrides keep dummy atoms as plain `*`/`R` with atom-map numbers
    (labels are draw-time only there too), so re-apply the human R labels from
    the map numbers before drawing — same convention as the auto layout path.
    """
    mol = Chem.MolFromMolBlock(molblock)
    if mol is None:
        return None
    greek_swaps = _apply_r_labels(mol, r_labels)
    svg = _with_r_label_palette(
        lambda: rm._draw_mol_svg(mol, bond_length, line_width, font, floor_mult,
                                 use_molblock_wedging=True, palette="brand"),
    )
    return _greekify(svg, greek_swaps) if svg else svg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manual", required=True)
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--bond-length", type=float, default=28.0)
    ap.add_argument("--line-width", type=float, default=1.1)
    ap.add_argument("--floor-mult", type=float, default=2.0)
    ap.add_argument("--font", default="")
    ap.add_argument("--overrides", default="src/data/molecules/class-overrides",
                    help="dir of <class-key>.mol overrides drawn verbatim instead of auto layout")
    ap.add_argument("--report", default="")
    args = ap.parse_args()

    manual = json.load(open(args.manual))
    os.makedirs(args.outdir, exist_ok=True)

    rendered, failed = [], []
    for cls in manual["classes"]:
        key = cls["key"]
        structure = cls.get("structure")
        if not structure or not structure.get("smiles"):
            continue

        override_path = os.path.join(args.overrides, f"{key}.mol") if args.overrides else None
        if override_path and os.path.exists(override_path):
            try:
                with open(override_path) as mf:
                    molblock = mf.read()
                svg = render_class_override_svg(
                    molblock, structure.get("rLabels", {}),
                    args.bond_length, args.line_width, args.font, args.floor_mult)
            except Exception as e:  # noqa: BLE001
                failed.append({"key": key, "reason": f"override-render-error: {e}"})
                continue
            if svg is None:
                failed.append({"key": key, "reason": "unparseable-override"})
                continue
            with open(os.path.join(args.outdir, f"{key}.svg"), "w") as f:
                f.write(svg)
            rendered.append(key)
            continue

        try:
            svg = render_class_svg(
                structure["smiles"], structure.get("rLabels", {}),
                args.bond_length, args.line_width, args.font, args.floor_mult)
        except Exception as e:  # noqa: BLE001
            failed.append({"key": key, "reason": f"render-error: {e}"})
            continue
        if svg is None:
            failed.append({"key": key, "reason": "unparseable-smiles"})
            continue
        with open(os.path.join(args.outdir, f"{key}.svg"), "w") as f:
            f.write(svg)
        rendered.append(key)

    print(f"Rendered {len(rendered)} class structures, {len(failed)} failed")
    for f in failed:
        print("  FAIL", f["key"], f["reason"])
    if args.report:
        json.dump({"rendered": rendered, "failed": failed},
                  open(args.report, "w"), indent=2)


if __name__ == "__main__":
    main()
