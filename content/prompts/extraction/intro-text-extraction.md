# Intro Text Extraction Prompt

Extract introductory content from the supplied collected-source file for one psychoactive substance. Use only the supplied source documents. Extraction preserves source text verbatim; it is not summarisation or article writing.

## 1. Identify sources

The input begins with the substance title and a Collected Sources suffix; each document begins with `## Source: <Source Name>` and is separated from the next by `---`. Sources vary in length and quality.

Account for every source, retaining its exact name and input order. Keep each passage attached to its originating source.


## 2. Decide which complete units qualify

Read every source for passages that orient a reader: what the substance is, its family, and how it is encountered. Judge a paragraph by its main subject, then include or skip it whole.

| Include introductory content | Boundary |
| --- | --- |
| Defining lead sentence, primary name, chemical class or family, psychoactive class | Include definitions and classification, rather than detailed mechanism or receptor data. |
| Common, IUPAC or substitutive names; brands, street names and synonym lists | Copy labelled name lines and lead sentences where present, rather than hunting body text for scattered name mentions. |
| One- or two-sentence characterisation of what the substance does; comparisons to related substances | Keep lead-paragraph characterisation, rather than named-effect lists, descriptions or trip-report phenomenology. |
| Physical form, colour, taste, smell, how it is encountered, and general potency | Dose tiers, numerical dose ranges, mg or mg/kg figures, and effect timing belong to dosage-duration. |
| General recreational, medical, veterinary, therapeutic or traditional use context | A paragraph mainly about clinical dosing or timing is excluded whole, even if it opens with general use context. |
| One-sentence origin note: first synthesis, discoverer, date or traditional origin | Multi-era timelines, cultural reception and discovery narratives beyond one sentence belong to history-culture. |
| Prominent safety framing in the source's own lead | Detailed LD50, addiction, dependence, overdose, organ damage and drug interactions belong to harm-potential. |
| Factsheet header lines such as `**Categories:**`, `**Also known as:**`, `**Synonyms:**`, `**Summary:**`, `**Street & Reference Names:**`, `**Form:**`, `**IUPAC Name:**` | Preserve the source's labels and content as written. |

Also exclude paragraphs mainly about mechanism, receptor binding, half-life, bioavailability or metabolism (pharmacology); tolerance build, decay or cross-tolerance (tolerance); and country legal status, scheduling, court cases or analogue-act discussion (legality).

The decision question is whether the unit mainly answers what the substance is. A definitional passage whose introductory relevance remains uncertain is included. This uncertainty rule does not turn a paragraph mainly about another section's topic into introductory content.

Inspect the lead before the first subheading and sections named Summary, Overview, Description, About, Basics, Classification and Chemistry. Chemistry may contain a separate orienting structural-class paragraph. Before concluding that Wikipedia, PsychonautWiki, DrugBank or Erowid has no introductory content, re-read its first paragraphs.

Most sources yield one to four paragraphs. Treat a longer selection as a reason to reconsider each paragraph's main subject, not as a length cap.

Continue when every candidate has an inclusion or exclusion decision and all likely locations have been examined. A source with no qualifying content is a valid result.

## 3. Preserve the selected material

- Select complete paragraphs, list items, table rows, or sections including their heading. A paragraph stays whole; never trim it to a qualifying sentence.
- Preserve every character: spelling, capitalisation, punctuation, markdown, inline links, footnote markers and within-line whitespace. Copy numbers, units and chemical names without conversion, rounding or reformatting.
- Keep claims within their original source. Do not supply definitions, classes, dates or comparisons from memory, a related substance, or another source block.
- Each content line is copied from that source or is blank. The only authored text is the document metadata, source headings, separators and empty-source markers specified in step 4. Add no labels, quotation marks, formatting or commentary to passages.

Continue when all selected units retain their original wording and provenance. Each passage must match its source character for character; the downstream substring check rejects any drift.

## 4. Emit the excerpt document

Output this excerpt document body, without surrounding code fences, preamble or closing commentary:

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

Use the substance title from the input's first line, without its Collected Sources suffix, and today's date as `YYYY-MM-DD`. Emit exactly one `## Source:` heading for every input source, with its exact name and original order. End every source block with `---`.

For a nonempty document with no qualifying content, place exactly `*No intro content found.*` alone under its source heading. For an empty document, use exactly `*No content available for this source.*`. An all-empty extraction is complete and successful.

## 5. Check completion

Before responding, confirm:

- Every source has been examined and is represented once, in order, including empty results.
- Every selected unit passes the main-subject decision, with the definitional uncertainty rule applied.
- Every selected unit is complete and source-faithful, and every qualifying candidate is included.
- The response follows the excerpt-document format exactly.
- The following downstream needs have been checked wherever the source supplies introductory evidence. They guide coverage, not output organisation or invention.

The downstream generator fills `summary`, a 50–80 word opening paragraph, from these excerpts:

| Need | Source material |
| --- | --- |
| What it is | Chemical class and primary name, mirroring `classification.chemical_class` |
| Psychoactive class | Primary effects category, mirroring `classification.psychoactive_class` |
| Origin | Attested first synthesis, discoverer, date or traditional use |
| Notable characteristics | What distinguishes the substance from similar ones |
| Prominent safety framing | Safety context carried by the source's own lead |

Nomenclature lines also feed `identification.*` fields rendered above the summary. Preserve them in source order; do not sort, label or restructure excerpts around downstream fields.
