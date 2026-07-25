# Harm Potential Extraction Prompt

You are given one file containing every collected source document for a single psychoactive
substance. Copy the harm-related passages out of it, verbatim, into the excerpt file described
under **Output format**. Output that file body and nothing else.

This is mechanical copy-and-paste, not summarising. A script then checks your output by searching
each extracted passage for a character-for-character match in the source; a passage that does not
match exactly is rejected and the whole file fails.

## Hard rules

1. **Every line inside a source block is either copied from that source or a blank line.** No
   headings you wrote, no labels, no quotation marks you added, no bolding you added, no bridging
   sentences, no commentary.
2. **Copy the passage exactly** — spelling, capitalisation, punctuation, markdown, inline links,
   footnote markers. Numbers and units too: no conversion, rounding, or reformatting, so
   `326 mg/kg` stays `326 mg/kg`.
3. **Hedges are part of the text.** "may cause", "has been reported", "is assumed to", "anecdotal",
   "though the evidence is limited", "[citation needed]" — copy them with the sentence they belong
   to. Never restate a hedged claim as a definite one.
4. **Extract only what the source says.** If the source states no LD50, the excerpt contains no
   LD50. The same holds for every interaction, contraindication, threshold dose, death count, and
   organ finding. Never supply a figure from your own knowledge, from a chemically related
   substance, or from a different source block in the same file.
5. **Keep passages under the source they came from.** Never move text between source blocks, merge
   sources, reorder them, or omit one.
6. **Extract complete units.** Whole paragraphs, list items, table rows, and sections including
   their heading. Never stop mid-sentence. When a harm fact sits inside a paragraph about something
   else, take the whole paragraph.
7. **When unsure, include it.** A human reviews these excerpts. An extra passage costs nothing; a
   missed one is invisible.

## What counts as harm potential content

- Addiction, abuse potential, habit-forming, compulsive redosing
- Dependence — physical or psychological — withdrawal and withdrawal timelines
- LD50, lethal/toxic/fatal dose, overdose thresholds, deaths and death counts, overdose management
- Organ and system toxicity: liver, kidney, cardiac, neurological, bladder, respiratory, vascular
- Neurotoxicity, including disputed or unresolved neurotoxicity
- Carcinogenicity, mutagenicity, genotoxicity, and the evidence behind such claims
- Psychosis, HPPD, mania, precipitation of latent mental illness
- Seizures and lowered seizure threshold
- Dangerous interactions and combinations; contraindications; medications to avoid
- Serotonin syndrome, hyperthermia, hyponatremia, respiratory depression
- Adulterants, misidentification, and substitution risks
- Antibiotic or antimicrobial activity
- Harm reduction advice, dosing-interval warnings, route-specific risks
- Explicit statements of **low** harm, safety, or absence of known toxicity — these count too

Qualifies: *"1B-LSD has no known toxic dose. However, higher doses increase the risk of adverse
psychological reactions."* — an absence-of-toxicity statement is harm content.

Does not qualify on its own: *"Tolerance builds almost immediately after ingestion, and takes about
5-7 days to reduce by half."* — that is tolerance timing. But if it sits inside a section headed
"Dependence and abuse potential", extract the whole section including that paragraph. Rule 6 wins.

## Interaction lists, combination charts, and tables

The highest-value content in this section, and the easiest to damage.

- Copy a markdown table whole: header row, `|---|---|` separator row, and every data row, byte for
  byte, plus any caption or sentence directly above it that names what the table is.
- Copy a bulleted combination list whole — every bullet, not a selection — with its bolded substance
  names and its introductory warning paragraph.
- Copy short structured lines as written, e.g. `**Avoid:** All other CNS depressants.`
- Never turn a table into prose, a list into a table, or a multi-line entry into one line.

## Input format

```
# <Substance Title> — Collected Sources

## Source: TripSit Factsheets

<full document text>

---

## Source: Wikipedia

<full document text>

---
```

Source count varies from two to a dozen, and so do length and quality.

## Output format

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

- `<Substance Title>` is copied from the first line of the input. `<YYYY-MM-DD>` is today's date.
- One `## Source:` heading per source in the input, in the input's order, with the source name
  spelled exactly as the input spells it. Include sources that yielded nothing.
- A source with no harm potential content gets exactly `*No harm potential content found.*` — that
  italic line alone under its heading.
- A source that was present but had no document text gets `*No content available for this source.*`
- Every source block ends with a `---` rule.
- No code fences around the output, no preamble, no closing commentary.

## An empty result is a correct result

Many substances have sources that genuinely say nothing about harm. A file whose every source block
reads `*No harm potential content found.*` is a correct, successful, complete result — return it and
stop. The only real failure is text in the output that is not in the source. One invented sentence
here becomes a published claim about a lethal dose or a drug interaction, so an empty file always
beats a plausible one.

## Schema field mapping

The downstream generator fills these fields from your excerpts. Extract with them in mind; do not
sort, label, or restructure your output around them.

- `harm_potential.addiction.psychological` and `.physical_dependence` — each `{ level, description }`
- `harm_potential.toxicity.lethal_dosage.ld50[]` — `{ species, route, value, unit }`, so species,
  administration route, number, and unit all have to survive in the copied text
- `harm_potential.toxicity.lethal_dosage.notes` — human lethal dose, fatalities, overdose thresholds
- `harm_potential.toxicity.organ_toxicity[]` — `{ system, findings, mechanism, notes }`
- `harm_potential.toxicity.carcinogenicity` — `{ level, evidence, description }`, evidence splitting
  into human epidemiological, animal models with species, in vitro assay, and mechanistic
- `harm_potential.toxicity.antibiotic_function` — `{ level, description }`
- `harm_potential.toxicity.other` — anything toxicological that fits nowhere above
- `harm_potential.psychosis` and `harm_potential.seizure` — each `{ level, description }`
- `interactions.dangerous[]`, `.unsafe[]`, `.caution[]` — fed by the combination lists and charts,
  which is why those have to arrive intact
