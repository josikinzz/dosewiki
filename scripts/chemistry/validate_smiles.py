#!/usr/bin/env python
"""Read a JSON array of SMILES from stdin; print a JSON array of booleans (parseable?)."""
import sys, json
from rdkit import Chem, RDLogger
RDLogger.DisableLog("rdApp.*")
smiles = json.load(sys.stdin)
print(json.dumps([Chem.MolFromSmiles(s) is not None if isinstance(s, str) else False for s in smiles]))
