# Pharmacology Extraction Prompt

Extract every pharmacodynamics or pharmacokinetics passage from the supplied collected-source file for one substance. Use only the supplied documents. Extraction preserves source text verbatim; it is not summarisation, synthesis or rewriting.

## 1. Identify sources

The staged file begins with the substance title and a Collected Sources suffix; each document begins with `## Source: <Source Name>` and is separated from the next by `---`. Source count, length and quality vary.

Account for every source, retaining its exact name and input order. Keep each passage attached to its originating source.


## 2. Find and classify every pharmacology passage

Read each source end to end. Relevant material may appear under Pharmacology, Chemistry, Mechanism of Action, Absorption, Metabolism, Effects or Summary, or in infobox tables and image captions.

### Pharmacodynamics: target action and mechanism

Include passages covering:

- Receptor or transporter agonism, antagonism, partial agonism, inverse agonism or allosteric modulation.
- Binding affinity and potency: Ki, Kd, pKi, EC50, IC50, Emax and intrinsic activity.
- Selectivity between receptor subtypes and binding comparisons across targets.
- Neurotransmitter release and reuptake inhibition, including serotonin, dopamine, norepinephrine, GABA, glutamate and acetylcholine.
- Ion channel effects, second messengers and downstream signalling.
- Mechanisms described as unknown, disputed or assumed from structural similarity.
- Statements that the substance does not act at a target.

### Pharmacokinetics: absorption, distribution, metabolism and elimination

Include passages covering:

- Bioavailability, with administration route where stated.
- Absorption rate, onset of plasma levels, Cmax, Tmax, AUC and food effects.
- Volume of distribution, protein binding and blood-brain barrier passage.
- Metabolic sites, CYP enzymes, first-pass metabolism, phase I/II pathways, deacetylation, hydrolysis, and enzyme induction or inhibition.
- Metabolite names, active or inactive status, and prodrug conversion.
- Distribution, elimination and terminal half-lives, and clearance rate.
- Elimination routes, recovery percentages in urine, feces or bile, and detection windows.

Complete the same source review whether or not PK is found. Absent pharmacokinetic data is a normal result, including alongside rich pharmacodynamics. Once the supplied sources have been reviewed, leave unsupported PK absent. Do not infer it from structure, a related compound or reported effect duration, or seek material beyond the supplied file.

### Relevance boundary

On their own, dose ranges, effect duration and onset times, subjective effects, legal status, synthesis routes, molecular weight, melting point, LD50, overdose case reports, tolerance schedules and drug-interaction warnings do not qualify. Plasma-level timing qualifies under PK; effect timing alone does not.

If a pharmacology fact appears inside a paragraph mainly about another topic, include the whole paragraph. Include a passage when its pharmacological relevance remains uncertain.

Continue when every source has been reviewed and each qualifying or uncertain passage identified. A source with no qualifying pharmacology is a valid result.

## 3. Preserve complete units and attached context

- Copy whole paragraphs, whole list blocks and whole table rows. Preserve source headings, bullets, bold, links and table pipes. A mixed-topic paragraph stays whole.
- Copy every character exactly, including typos, spacing, punctuation, symbols and units. Preserve numerical precision, leading zeroes, range order, micro signs and subscript styling without conversion or rounding.
- Carry the context attached to each value: target receptor, species, assay, study citation and cell-line notes. Include the introductory lines that establish this context.
- Keep administration route names attached to half-life and bioavailability values wherever stated, including oral, insufflated, sublingual, smoked, vaporised, intravenous, intramuscular and rectal routes.
- Copy a selected table whole: header, separator and every data row, with every column intact. Include its introductory sentence. A selected sentence introducing a table also requires the table beneath it. Retain the original table format.
- Preserve hedges and limitations with their claims, including assumptions based on structural similarity. Keep each claim under its own source; never supply a mechanism from memory or transfer a claim from a related substance.
- Author only the metadata, headings, separators and markers defined in step 4. All extracted text remains source text, without added explanation or merged sentences.

Continue when every selected unit is intact, with its attached context and original provenance. Each passage must match its source character for character; the downstream substring check rejects any drift.

## 4. Emit the excerpt document

Output this excerpt document body, without surrounding code fences, preamble or closing commentary:

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

Take the substance title from the staged file's first line, without its Collected Sources suffix. Join it to `Pharmacology Quotes` with a plain hyphen `-`. Use today's date as `YYYY-MM-DD`.

Emit exactly one `## Source:` heading for every input source, with its exact name and original order. End every source block with `---`. A nonempty document with no qualifying content gets exactly `*No pharmacology content found.*` alone under its heading. An empty document gets exactly `*No content available for this source.*`. An all-empty extraction is complete and successful.

## 5. Check completion

Before responding, confirm:

- Every source has been reviewed end to end and is represented once, in order.
- Every qualifying or uncertain pharmacology passage is included as a complete unit.
- Every selected table has its header, separator, all rows and columns, and introductory context.
- Values retain their targets, assay/species context and routes wherever supplied; all wording and hedges remain source-faithful.
- Unsupported PD or PK remains absent.
- The response follows the excerpt-document format exactly.
- Every downstream field below has been checked for available evidence. These fields guide coverage, not output labels or reorganisation.

| Field | Half | What feeds it |
| --- | --- | --- |
| `pharmacodynamics` | PD | Mechanism prose: receptor and transporter action, functional mechanism |
| `binding_sites` | PD | Per-target rows: target name, mechanism role, `affinity` (Ki/EC50), `efficacy` (Emax, intrinsic activity) |
| `pharmacokinetics` | PK | Absorption, distribution, metabolism and elimination prose |
| `metabolites` | PK | Named metabolic products, marked active or inactive |
| `half_life`, `route_half_life`, `route_half_life_notes` | PK | Half-life values, per route where stated, with qualifying context |
| `bioavailability_notes`, `route_bioavailability`, `route_bioavailability_notes` | PK | Bioavailability percentages, per route where stated, with absorption context |
| `protein_binding` | PK | Plasma protein binding percentage |
| `volume_of_distribution` | PK | Vd value |
