# Harm Potential Extraction Prompt

Extract every harm-related passage from the supplied collected-source file for one psychoactive substance. Use only the supplied documents. Extraction preserves source text verbatim; it is not summarisation or article writing.

## 1. Identify sources

The input begins with the substance title and a Collected Sources suffix; each document begins with `## Source: <Source Name>` and is separated from the next by `---`. Sources vary in number, length and quality.

Account for every source, retaining its exact name and input order. Keep each passage attached to its originating source.


## 2. Identify all harm content

Read every source for the following content:

| Include | Context or boundary |
| --- | --- |
| Addiction, abuse potential, habit formation and compulsive redosing | Include physical or psychological dependence, withdrawal and withdrawal timelines. |
| LD50, lethal, toxic or fatal doses, overdose thresholds, deaths, death counts and overdose management | Preserve species, administration route, value and unit wherever supplied. |
| Organ and system toxicity | Include liver, kidney, cardiac, neurological, bladder, respiratory and vascular findings. |
| Neurotoxicity | Include disputed and unresolved findings with their uncertainty. |
| Carcinogenicity, mutagenicity and genotoxicity | Carry the evidence supporting or limiting each claim. |
| Psychosis, HPPD, mania and precipitation of latent mental illness | Preserve the source's qualifications. |
| Seizures and lowered seizure threshold | Preserve the source's qualifications. |
| Dangerous interactions and combinations, contraindications and medications to avoid | Preserve complete combination lists, charts, tables and warnings as specified in step 3. |
| Serotonin syndrome, hyperthermia, hyponatremia and respiratory depression | Include the surrounding harm context. |
| Adulterants, misidentification and substitution risks | Include the source's risk descriptions. |
| Antibiotic or antimicrobial activity | Include this content even when it is not framed as harm. |
| Harm-reduction advice, dosing-interval warnings and route-specific risks | Preserve the advice's conditions and route distinctions. |
| Explicit low-harm, safety or absence-of-known-toxicity statements | These qualify as harm content alongside adverse findings. |

Tolerance build or decay timing alone belongs to tolerance extraction. When it appears within a qualifying section such as Dependence and abuse potential, take the whole section, including its heading and tolerance paragraph.

If a harm fact sits inside a paragraph mainly about something else, take the entire paragraph. Include a passage when its relevance remains uncertain.

Continue when every source has been examined and every qualifying or uncertain passage identified. A source that supplies no harm content is a valid result.

## 3. Preserve complete evidence units

### Passages and source fidelity

- Copy complete paragraphs, list items, table rows and sections including their heading. Keep mixed-topic units whole and every sentence complete.
- Preserve every character, including spelling, capitalisation, punctuation, markdown, inline links, footnote markers, numbers and units. Retain numerical precision and units without conversion, rounding or reformatting.
- Keep hedges and evidence limitations attached to their claims, including reported, assumed or anecdotal status and citation-needed markers.
- Use only claims made by the originating source. Never supply an LD50, interaction, contraindication, threshold, death count or organ finding from memory, a related substance or another source block.
- Every content line is copied from that source or is blank. Author only the metadata, source headings, separators and empty-source markers in step 4; add no headings, labels, quotation marks, formatting or commentary inside extracted content.

### Interaction lists, combination charts and tables

- Copy a markdown table whole: header row, separator row and every data row, with its original formatting. Include any caption or sentence directly above it that names the table.
- Copy a bulleted combination list whole, with every bullet, bolded substance name and introductory warning paragraph.
- Copy short structured lines as written, retaining their labels and values.
- Keep each structure in its source format, with multi-line entries intact.

Continue when every selected unit retains its full content, attached warnings, uncertainty and provenance. Each passage must match its source character for character; the downstream substring check rejects any drift.

## 4. Emit the excerpt document

Output this excerpt document body, without surrounding code fences, preamble or closing commentary:

```
# <Substance Title> - Harm Potential Quotes

> Verbatim extractions from source articles. Generated <YYYY-MM-DD>.

## Source: <Source Name>

<verbatim extracted text>

---

## Source: <Source Name>

*No harm potential content found.*

---
```

Take the substance title from the input's first line, without its Collected Sources suffix. Use today's date as `YYYY-MM-DD`.

Emit exactly one `## Source:` heading for every input source, with its exact name and original order. End every source block with `---`. A nonempty document with no qualifying content gets exactly `*No harm potential content found.*` alone under its heading. An empty document gets exactly `*No content available for this source.*`. An all-empty extraction is complete and successful; missing evidence stays absent.

## 5. Check completion

Before responding, confirm:

- Every source has been examined and is represented once, in order, including empty results.
- Every qualifying or uncertain passage is included as a complete unit, including low-harm statements and qualifying mixed-topic sections.
- Every selected combination list and table is intact with its introductory warning or caption, names, rows and columns.
- Species, route, numbers, units, conditions and uncertainty survive wherever supplied.
- Every claim remains source-faithful and attached to its originating source.
- The response follows the excerpt-document format exactly.
- Every downstream field below has been checked for available evidence. These mappings guide coverage; do not sort, label or restructure output around them.

| Field | Evidence to preserve |
| --- | --- |
| `harm_potential.addiction.psychological` and `.physical_dependence` | Each `{ level, description }` |
| `harm_potential.toxicity.lethal_dosage.ld50[]` | `{ species, route, value, unit }`, with all four elements retained where supplied |
| `harm_potential.toxicity.lethal_dosage.notes` | Human lethal dose, fatalities and overdose thresholds |
| `harm_potential.toxicity.organ_toxicity[]` | `{ system, findings, mechanism, notes }` |
| `harm_potential.toxicity.carcinogenicity` | `{ level, evidence, description }`; evidence distinguishes human epidemiology, animal models with species, in vitro assays and mechanistic evidence |
| `harm_potential.toxicity.antibiotic_function` | `{ level, description }` |
| `harm_potential.toxicity.other` | Toxicological content fitting nowhere above |
| `harm_potential.psychosis` and `harm_potential.seizure` | Each `{ level, description }` |
| `interactions.dangerous[]`, `.unsafe[]`, `.caution[]` | Complete combination lists and charts, preserving their categories |
