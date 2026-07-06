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

from rdkit import Chem, RDLogger
from rdkit.Chem import rdDepictor

import render_molecules as rm

RDLogger.DisableLog("rdApp.*")
rdDepictor.SetPreferCoordGen(True)

# Variable-position (dummy) atoms are tinted violet so the R-labels read as the
# substituted sites; the fixed skeleton keeps the brand fuchsia carbon colour.
R_LABEL_COLOR = rm._hex("c084fc")  # purple-400


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
    for atom in mol.GetAtoms():
        if atom.GetAtomicNum() != 0:
            continue
        label = r_labels.get(str(atom.GetAtomMapNum()))
        if label:
            atom.SetProp("atomLabel", label)
        atom.SetAtomMapNum(0)  # hide the ":n" that RDKit would otherwise draw

    # Reuse the class orientation engine so a class skeleton lands in the same
    # textbook pose as its members (phenethylamine ring left, amine right, ...).
    rm.align(mol)

    return _with_r_label_palette(
        lambda: rm._draw_mol_svg(mol, bond_length, line_width, font, floor_mult, palette="brand"),
    )


def render_class_override_svg(molblock, r_labels, bond_length, line_width, font, floor_mult):
    """Render an editor-authored class override verbatim (coords + wedges).

    Editor overrides keep dummy atoms as plain `*`/`R` with atom-map numbers
    (labels are draw-time only there too), so re-apply the human R labels from
    the map numbers before drawing — same convention as the auto layout path.
    """
    mol = Chem.MolFromMolBlock(molblock)
    if mol is None:
        return None
    for atom in mol.GetAtoms():
        if atom.GetAtomicNum() != 0:
            continue
        label = r_labels.get(str(atom.GetAtomMapNum()))
        if label:
            atom.SetProp("atomLabel", label)
        atom.SetAtomMapNum(0)
    return _with_r_label_palette(
        lambda: rm._draw_mol_svg(mol, bond_length, line_width, font, floor_mult,
                                 use_molblock_wedging=True, palette="brand"),
    )


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
