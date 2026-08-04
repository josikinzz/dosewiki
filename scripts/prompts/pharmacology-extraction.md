# Pharmacology Extraction Prompt

You copy pharmacology passages out of a source file, word for word, into a structured excerpt file.

## Task

Read every source document in the staged file below. For each source, copy out every passage that
describes **pharmacodynamics** (what the substance does to the body) or **pharmacokinetics** (what
the body does to the substance). Emit them in the output format specified below.

This is a copy-paste job. It is not summarisation, synthesis, or rewriting.

Hard rules, applied to every passage you emit:

1. **Verbatim.** Every extracted passage must appear character-for-character in the staged source
   file. A script checks this by substring match and rejects the file if any passage drifts. Never
   paraphrase, condense, merge sentences, fix typos, or normalise spacing, symbols, or units. The
   only text you author is the headings, the `---` rules, and the markers defined below.
2. **Complete units.** Copy whole paragraphs, whole list blocks, whole table rows. Never cut a
   sentence in half. When a pharmacology fact sits inside a paragraph that is otherwise about
   something else, copy the whole paragraph.
3. **Markdown as-is.** Keep the source's headings, bullets, bold, links, and table pipes exactly as
   written.
4. **Over-include.** If you are unsure whether a passage counts, include it. A human reads this
   file afterward. An extra passage costs nothing; a missed one is invisible.

## Input

The staged source file has this shape:

```
# <Substance Title> — Collected Sources

## Source: TripSit Factsheets

<full document text>

---

## Source: Wikipedia

<full document text>

---
```

Sources vary from two to a dozen, and from a paragraph to many pages. Pharmacology content is not
confined to a section named "Pharmacology" — it also turns up under Chemistry, Mechanism of Action,
Absorption, Metabolism, Effects, Summary, infobox tables, and image captions. Read each source end
to end.

## Output format

Emit exactly this, and nothing else — no code fences, no preamble, no closing commentary:

```
# <Substance Title> - Pharmacology Quotes

> Verbatim extractions from source articles. Generated <YYYY-MM-DD>.

## Source: <Source Name>

<verbatim extracted text>

---

## Source: <Source Name>

*No pharmacology content found.*

---
```

- Take `<Substance Title>` from the staged file's first line, and join it to `Pharmacology Quotes`
  with a plain hyphen `-`, not the em dash the staged file uses.
- `<YYYY-MM-DD>` is today's date.
- Emit **one `## Source:` block per source in the staged file, in the staged file's order, using its
  exact source name** — including sources that yielded nothing. Never merge, reorder, rename, or
  drop a source.
- A source you read that had no pharmacology content gets `*No pharmacology content found.*` on its
  own line under its heading.
- A source whose document body was empty gets `*No content available for this source.*`
- Every source block ends with a `---` rule.

## What counts: pharmacodynamics

Receptor and target action, and the mechanism behind the effects.

- Receptor or transporter agonism, antagonism, partial agonism, inverse agonism, allosteric
  modulation ("5-HT2A agonist", "NMDA receptor antagonist")
- Binding affinity and potency values: Ki, Kd, pKi, EC50, IC50, Emax, intrinsic activity
- Selectivity between receptor subtypes, and comparisons of binding across targets
- Neurotransmitter release and reuptake inhibition (serotonin, dopamine, norepinephrine, GABA,
  glutamate, acetylcholine)
- Ion channel effects, second messenger and downstream signalling
- Statements that the mechanism is unknown, disputed, or assumed from structural similarity
- Statements that the substance does **not** act at some target

## What counts: pharmacokinetics

Absorption, distribution, metabolism, and elimination.

- Bioavailability, by route where the source gives a route
- Absorption rate, onset of plasma levels, Cmax, Tmax, AUC, food effects
- Distribution: volume of distribution, protein binding, blood-brain barrier passage
- Metabolism: hepatic or other site, CYP enzymes, first-pass metabolism, phase I/II pathways,
  deacetylation, hydrolysis, enzyme induction or inhibition
- Metabolite names, and whether each is active or inactive; prodrug conversion
- Half-life of every kind (distribution, elimination, terminal), clearance rate
- Elimination route and recovery percentages (urine, feces, bile), detection windows

**Pharmacokinetics is usually absent, and that is the expected result.** Most research chemicals
have never been studied in humans, so there is no PK data to find. Rich pharmacodynamics plus zero
pharmacokinetics is a normal, correct outcome. When the sources say nothing about absorption,
metabolism, or half-life, emit nothing for that half — do not search harder, do not reason from a
related compound, and do not infer PK from chemical structure or from reported duration of effects.

## What does not count on its own

Dose ranges, durations and onset times, subjective effect descriptions, legal status, synthesis
routes, molecular weight and melting point, LD50 and overdose case reports, tolerance schedules,
and drug-interaction warnings.

Worked examples:

- `A common oral dose is 15–25 mg, with effects lasting 6–8 hours.` — **skip.** Dose and duration.
- `Ketamine absorption is very rapid and the bioavailability is around 93%.` — **extract.** PK.
- `In one study, it showed 12- to 20-fold selectivity for the serotonin 5-HT2A receptor (Ki = 0.5 nM)
  over the serotonin 5-HT2B and 5-HT2C receptors (Ki = 10 and 6.2 nM, respectively).` — **extract.** PD.
- A paragraph about a legal ban that ends `...because it is metabolised to amphetamine.` —
  **extract the whole paragraph.** The metabolism claim is qualifying content, and rule 2 carries
  the sentences around it.

## Numbers, assays, and tables

Affinity values, half-lives, and bioavailability percentages are the highest-value content in this
file and the easiest to corrupt.

- **Copy every number exactly as written.** Never convert nM to µM, never convert hours to minutes,
  never round, never add or drop a leading zero, never re-order a range. `0.0130 μM` stays
  `0.0130 μM`. Preserve the source's own micro sign, spacing, and subscript styling.
- **Carry the context the source attaches.** A Ki without its target receptor is useless, and so is
  one without its species and assay. When a value block is introduced by a study citation, a cell
  line, or a species note, copy those lines too:

  ```
  (Rickli, 2015)

  - Receptor/transporter interactions using HEK-293 cells (all are human form unless otherwise noted)
  - 5-HT2A
  - Affinity (Ki) (antagonist): 0.0130 μM
  - EC50: 0.20 μM
  ```

  The citation line and the cell-line line are part of the extraction, not decoration.

- **Tables come across whole.** Receptor binding data usually arrives as a markdown table. Copy the
  header row, the separator row, and every data row, with the pipes intact. Do not convert a table
  to prose or to a list, do not drop columns you think are uninformative, and do not stop partway
  down a long table.
- **A sentence that introduces a table brings the table with it.** When the source reads
  `In a study comparing various aryl-substituted methcathinone analogs in rat brain synaptosomes,
  the following values were found.` followed by a table, extract the sentence **and** the table
  beneath it. Extracting the lead-in alone produces a dangling reference to data that is not there.

## Empty results are correct results

Many substances have no published pharmacology at all. A file where every source block reads
`*No pharmacology content found.*` is a complete, successful extraction.

The one real failure is inventing content. Do not supply a mechanism you know from elsewhere, do
not carry a claim over from a chemically similar substance named in the sources, and do not upgrade
a hedge into a fact. If a source hedges — "presumably", "thought to", "based on structural
similarity", "may be assumed" — copy the hedge along with the claim.

## Schema field mapping

The downstream generator fills these fields from your excerpts. Use this to check your coverage
before you finish; do not label or reorganise your output by field.

| Field | Half | What feeds it |
|---|---|---|
| `pharmacodynamics` | PD | Mechanism prose: receptor and transporter action, functional mechanism |
| `binding_sites` | PD | Per-target rows — target name, mechanism role, `affinity` (Ki/EC50), `efficacy` (Emax, intrinsic activity) |
| `pharmacokinetics` | PK | Absorption, distribution, metabolism, elimination prose |
| `metabolites` | PK | Named metabolic products, marked active or inactive |
| `half_life`, `route_half_life`, `route_half_life_notes` | PK | Half-life values, per route where stated, plus their qualifying context |
| `bioavailability_notes`, `route_bioavailability`, `route_bioavailability_notes` | PK | Bioavailability percentages, per route where stated, plus absorption context |
| `protein_binding` | PK | Plasma protein binding percentage |
| `volume_of_distribution` | PK | Vd value |

Route-specific numbers matter: when a source gives bioavailability or half-life for a named route
(oral, insufflated, sublingual, smoked, vaporised, intravenous, intramuscular, rectal), keep the
route name in the extracted text.

## Before you output

- Every source in the staged file has exactly one `## Source:` block, in the original order, ending
  with `---`.
- Every passage can be found character-for-character in the staged file.
- Every table you copied has its header row and all of its data rows.
