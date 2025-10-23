# Molecule SVG Coverage Audit (2025-02-28)

## Overview
- Generated fresh diff between `articles.json` (581 articles) and `moleculeSvgMappings.json` (306 mappings after this pass).
- Identified 282 substances without an assigned molecule asset and 434 dataset SVGs still unused.
- Stored machine-readable snapshots for reuse:
  - `notes and plans/molecule-audit-20250228.json` – complete lists and aggregate counts.
  - `notes and plans/molecule-audit-suggestions.json` – top similarity candidates (string-distance ≥0.85).

## Confirmed Matches Added
- **2M2B → 2-Methyl-2-butanol.svg** (article 667) — exact chemical synonym (`2-methylbutan-2-ol`) present in the article data.
- **Datura (ids 662 & 663) → Hyoscyamine.svg** — plant entry represents tropane alkaloid mixture; hyoscyamine is one of the primary constituents and no dedicated hyoscyamine article exists. Both Datura records now reuse the same structural asset.
- **Psilocybin Mushrooms (id 200)** now surface **Psilocybin.svg** plus **Psilocin.svg** so the hero covers the prodrug and active metabolite pair.
- **Ayahuasca (id 661)** links to **DMT.svg** and **Harmine.svg**, reflecting both tryptamine payload and MAOI co-factor.
- **Khat (id 685)** maps to **Cathinone.svg**.
- **Cannabis (id 311)** presents **THC.svg** alongside **CBD.svg** to represent the dominant cannabinoid split.
- **Kava (id 208)** uses **Kavain.svg** plus **Dihydrokavain.svg**.
- **Kratom (id 206)** leverages **Mitragynine.svg** and **7-Hydroxymitragynine.svg**.
- **Amanita Muscaria (id 201)** renders **Muscimol.svg** with **Ibotenic acid.svg**.
- **Yopo (id 199)** pairs **Bufotenin.svg** with **5-MeO-DMT.svg** to call out the major and trace tryptamines.

## Near Matches Rejected (Top Signal)
Scores come from normalized Levenshtein comparison; all reviewed and intentionally **not** mapped.
- 4'-Fluoro-4-methylaminorex ↔ 4,7-Fluoro-4-methylaminorex (0.957) — distinct substitution pattern.
- 25C-NB3OMe ↔ 25C-NBOMe (0.889) — 3-methoxy benzyl analogue lacks dedicated art.
- 25E/25H/25P/25T NB(O)Me/H ↔ baseline NB series (0.857–0.875) — specific analogues missing.
- 2M2B **(resolved)** ↔ 2-Methyl-2-butanol (0.867) — retained for traceability although now mapped.
- 4-HO-McPT / 4-HO-PiPT ↔ 4-HO-MiPT (0.857) — different tail substitutions.
- 4-Me-NEB ↔ 4-methyl-NEP (0.900) — β-keto vs β-hydroxy difference.
- Methamphetamine ↔ β-methylamphetamine (0.882) — nomenclature collision; structures differ (β substitution vs N-methyl).
- Phendimetrazine ↔ Phenmetrazine (0.867) — prodrug vs parent compound; requires unique SVG.

## Remaining Gaps & Next Steps
- The majority of the 290 uncovered substances are novel NBOMe/NBOH variants, β-keto cathinones, or bespoke lysergamides absent from the dataset; new artwork required.
- Several botanical entries (e.g., Kratom leaf mixtures, Kambo) represent multi-compound preparations; consider policy for selecting a “canonical” molecule or leaving them intentionally blank.
- Future automation: incorporate synonym dictionaries (IUPAC positional rearrangements such as "butan-2-ol" ↔ "2-butanol") to surface additional high-confidence leads before manual review.
- Hero components now accept up to three molecule assets per article; run `node scripts/syncMoleculeAssets.mjs` before release if new SVG files enter the dataset so the public bundle stays in sync.
