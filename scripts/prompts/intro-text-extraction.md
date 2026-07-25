# Intro Text Extraction Prompt

You are given one file containing every collected source document for a single psychoactive
substance. Copy the introductory passages out of it, verbatim, into the excerpt file described under
**Output format**. Output that file body and nothing else.

This is mechanical copy-and-paste. You are not summarising, condensing, or explaining. A script
checks your output afterwards by searching each extracted passage for a character-for-character
match in the source; a passage that does not match exactly is rejected and the whole file fails.

## Hard rules

1. **Every line inside a source block is either copied from that source or a blank line.** No
   headings you wrote, no labels, no quotation marks you added, no bolding you added, no bridging
   sentences, no commentary.
2. **Copy the passage exactly**, including spelling, capitalisation, punctuation, markdown, inline
   links, footnote markers, and any surrounding whitespace within a line.
3. **Numbers, units, and chemical names are copied character for character.** No conversion,
   rounding, or reformatting.
4. **Extract complete units.** Whole paragraphs, whole list items, whole table rows, whole sections
   including their heading. Never stop mid-sentence and never take half a paragraph. A paragraph is
   in or out as a unit — decide on its main subject, then copy or skip the whole thing.
5. **Extract only what the source says.** Never write a definition, a chemical class, a synthesis
   date, or a comparison from your own knowledge, from a chemically related substance, or from a
   different source block in the same file.
6. **Keep passages under the source they came from.** Never move text between source blocks, merge
   sources, reorder them, or omit one.
7. **When unsure whether a definitional passage is introductory enough, include it.** A human
   reviews these excerpts. An extra passage costs nothing; a missed one is invisible.

## What counts as intro content

Passages that orient a reader who knows nothing about the substance yet — what it is, what family it
belongs to, and how it is encountered:

- The defining lead sentence: *"X is a psychedelic substance of the phenethylamine class."*
- Psychoactive class (psychedelic, stimulant, dissociative, depressant, opioid, deliriant) and
  chemical class or family (tryptamine, lysergamide, arylcyclohexylamine, benzodiazepine, cathinone)
- Names: common name, IUPAC or substitutive name, brand names, street names, synonym lists
- A one-or-two-sentence characterisation of what the substance does, at lead-paragraph granularity
- Comparison to related substances — *"a synthetic analogue of mescaline"*, *"described as halfway
  between LSD and MDMA"*, *"milder than LSD or psilocybin"*
- Physical form and how it is encountered: powder, crystal, blotter, pill, liquid, vial, plant
  material; colour, taste, smell; a general potency statement
- General use context: recreational, medical, veterinary, therapeutic, traditional
- A one-sentence origin note — who first synthesised it and when, or its traditional origin
- Factsheet header lines such as `**Categories:**`, `**Also known as:**`, `**Synonyms:**`,
  `**Summary:**`, `**Street & Reference Names:**`, `**Form:**`, `**IUPAC Name:**`

## What does not count

Nearly every sentence in a source article can be argued to be introductory, which is how this
extraction fails: the excerpt file ends up being the source pasted back. Seven other extraction runs
already collect the topics below from the same file. Leave them there.

| Content | Collected by |
|---------|--------------|
| Dose tiers, mg values, mg/kg figures, threshold/light/common/strong ranges | dosage-duration |
| Onset, come-up, peak, offset, after-effects, total duration | dosage-duration |
| Mechanism of action, receptor binding, half-life, bioavailability, metabolism | pharmacology |
| Named effects and their descriptions, effect lists, trip-report phenomenology | subjective-effects |
| Tolerance build and decay, cross-tolerance | tolerance |
| LD50, addiction, dependence, overdose, organ damage, drug interactions | harm-potential |
| Legal status by country, scheduling, court cases, analogue-act discussion | legality |
| Multi-era timelines, cultural reception, discovery narratives beyond one sentence | history-culture |

Test a candidate paragraph by asking which question it answers. *What is this?* keeps it. *How much,
how long, how does it work, is it legal, what does it feel like, what happened next?* drops it.

Most sources yield one to four paragraphs. A source block much longer than that is the article
pasted back — re-check each of its paragraphs against the table.

**Qualifies** — how the substance is encountered is definitional:

> Ketamine is generally sold to the recreational user in one of two forms: in the evaporated salts,
> which are sold as a powder, or crystals (often referred to as shards), as well as in multi-dose
> vials for use in veterinary and human medicine.

**Does not qualify** — opens like an introduction, then turns into dosage and duration. Rule 4
governs it: the paragraph is one unit whose subject is clinical dosing, so the whole thing is
skipped rather than trimmed back to its first sentence.

> For decades, ketamine has been a popular anesthetic in humans and in veterinary settings. Most
> often it is delivered intravenously, but it can be given intramuscularly, albeit with some
> injection site pain, a longer recovery time, and a greater likelihood of vomiting. Anesthesia
> usually begins with 1-2 mg/kg (IV) or 8-10 mg/kg (IM). Its dissociative anesthetic effects have an
> IV onset of 1-2 minutes.

## Where to look

The lead paragraphs before a document's first subheading, and sections headed Summary, Overview,
Description, About, Basics, Classification, or Chemistry. A second orienting paragraph often sits
further down under Chemistry, naming the structural class — take it too.

Encyclopedic sources open with a definitional lead by construction. Before marking a Wikipedia,
PsychonautWiki, DrugBank, or Erowid document as having no intro content, re-read its first
paragraphs; on those sources that marker is almost always a miss.

## Input format

```
# <Substance Title> — Collected Sources

## Source: wikipedia

<full document text>

---

## Source: tripsit-factsheets

<full document text>

---
```

Source count varies from two to a dozen, and length and quality vary just as widely.

## Output format

```
# <Substance Title> - Intro Text Quotes

> Verbatim extractions from source articles. Generated <YYYY-MM-DD>.

## Source: <Source Name>

<verbatim extracted text>

---

## Source: <Source Name>

*No intro content found.*

---
```

- `<Substance Title>` is copied from the first line of the input. `<YYYY-MM-DD>` is today's date.
- One `## Source:` heading per source in the input, in the input's order, with the source name
  spelled exactly as the input spells it. Include sources that yielded nothing.
- A source with no intro content gets exactly `*No intro content found.*` — that italic line alone
  under its heading.
- A source that was present but had no document text gets `*No content available for this source.*`
- Every source block ends with a `---` rule.
- No code fences around the output, no preamble, no closing commentary.

## An empty result is a correct result

Some sources are pure dosage tables, effect indexes, or legal notices and genuinely say nothing about
what the substance is. A file whose every source block reads `*No intro content found.*` is a
correct, successful, complete result — report it and stop. The only real failure is text in the
output that is not in the source. One invented sentence here becomes the opening line of a published
article, so an empty file always beats a plausible one.

## Schema field mapping

Your excerpts are the only material the downstream generator sees, and it fills exactly one field:
`summary`, a 50–80 word paragraph opening the article. It needs to find, in your excerpts:

- **What it is** — chemical class and primary name, mirroring `classification.chemical_class`
- **Psychoactive class** — primary effects category, mirroring `classification.psychoactive_class`
- **Origin** — first synthesis, discoverer, date, or traditional use, where a source attests it
- **Notable characteristics** — what distinguishes this substance from similar ones
- **Prominent safety framing** — only where a source's own lead carries it, e.g. a substance known
  chiefly as a dangerous adulterant

Nomenclature lines feed `identification.*` fields rendered above the summary, so copy the labelled
name lines and lead sentences where you find them rather than hunting document bodies for scattered
name mentions. Do not sort, label, or restructure your output around any of these fields.
