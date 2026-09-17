# History & Culture Extraction Prompt

Extract every history and culture passage from the supplied collected-source file for one substance. Use only the supplied documents. Extraction preserves source text verbatim; it is not summarisation, synthesis or rewriting. Missing history stays absent rather than being completed from memory.

## 1. Identify sources

The staged file begins with the substance title and a Collected Sources suffix; each document begins with `## Source: <Source Name>` and is separated from the next by `---`. Source count, length and quality vary.

Account for every source, retaining its exact name and input order. Keep each passage attached to its originating source.


## 2. Decide which history and culture passages qualify

Read every source end to end. Relevant material may appear in introductions, Background, Overview and Society and culture, as well as History sections. A lone historical sentence inside otherwise unrelated prose qualifies its whole paragraph.

| Include | Content to select |
| --- | --- |
| Discovery and synthesis | First synthesis, chemist, laboratory or company, original research purpose, patents and accidental-discovery stories |
| Medical and therapeutic history | Early clinical use, research programmes and trials, psychotherapy use, approval or rejection history, and brands under which the substance was sold |
| Market and recreational emergence | First street or research-chemical market appearance, spread, first seizures or vendor reports, street-name origins and slang etymology |
| Counterculture and the arts | Associated movements, scenes and eras, named advocates and public figures, and influence on music, literature, film or art |
| Programmes and controversies | State or military research, notable incidents framed as historical events, media coverage and moral panics |
| Traditional and indigenous use | Ceremonial and ritual use, shamanic practice, ethnobotanical history, pre-modern records and significance to a people |
| Modern revival | Renewed research interest, current clinical programmes and shifts in scientific or public attitude |

Apply these boundaries beside the inclusion criteria:

- Current country-by-country schedule lists and legal-status tables belong to legality extraction. Exclude those blocks even when they contain dates. Include a scheduling event narrated as part of a historical story, such as a legal change linked to market developments.
- Pure effects, dosing, duration, pharmacology or harm content belongs to other extraction passes. This includes experience descriptions, dose figures, onset tables, receptor binding, metabolism, LD50 figures, case reports and fatality write-ups without a historical framing.
- Where a passage mixes qualifying history with another topic, copy the whole passage. Include a passage when its historical or cultural relevance remains uncertain.

Continue when every source has been reviewed and every qualifying or uncertain passage identified. A source with no history or culture content is a valid result.

## 3. Preserve complete units and historical uncertainty

- Copy complete paragraphs, list items, table rows and headings. Keep mixed-topic paragraphs whole and every sentence complete.
- Preserve all characters, including typos, doubled spaces, unusual punctuation and markdown headings, bullets, bold, tables and blockquotes. Numbers and units retain their original form without conversion or rounding.
- Copy dates, names and place names exactly as given, including vague dates or unnamed people and companies. Never resolve a vague reference using outside knowledge.
- Preserve contradictions between sources, each under its own source heading. Reconciliation belongs to later review, not extraction.
- Retain the sentence carrying an event date, rather than extracting a date in isolation.
- Separate non-contiguous passages with a blank line. Use no invented connectors or commentary. If a source is wrapped in a markdown code fence, copy its contents without the packaging fence lines.
- Author only the metadata, source headings, separators and empty-source markers defined in step 4. Every historical claim must come from its own source; do not fill gaps with remembered facts, even if they are true.

Continue when every selected unit retains its complete wording, ambiguity and provenance. Each passage must match its source character for character; the downstream substring check rejects any drift.

## 4. Emit the excerpt document

Output this excerpt document body, without surrounding code fences, preamble or closing commentary:

```
# <Substance Title> - History & Culture Quotes

> Verbatim extractions from source articles. Generated <YYYY-MM-DD>.

## Source: <Source Name>

<verbatim extracted text>

---

## Source: <Source Name>

*No history or culture content found.*

---
```

Take the substance title from the input's first line, without its Collected Sources suffix. Use today's date as `YYYY-MM-DD`.

Emit exactly one `## Source:` heading for every input source, with its exact name and original order. End every source block with `---`. A nonempty document with no qualifying content gets exactly `*No history or culture content found.*` alone under its heading. An empty document gets exactly `*No content available for this source.*`. An all-empty extraction is complete and successful.

## 5. Check completion

Before responding, confirm:

- Every source has been read end to end and is represented once, in order, including empty results.
- Every qualifying or uncertain passage is included, including historical sentences embedded in other topics.
- Current legal-status lists and tables remain excluded; narrated historical scheduling events remain eligible.
- Every selected unit is complete, with dates attached to their event sentences, vague references unresolved and source contradictions intact.
- Every historical claim matches its originating source rather than outside knowledge.
- The response follows the excerpt-document format exactly.
- Every downstream field below has been checked for available evidence. These fields guide coverage, not authored labels or output reorganisation.

The excerpts feed these `history_culture` fields:

| Field | Fed by |
| --- | --- |
| `content` | Any historical prose; for substances with little history this is the only field used |
| `sections[].heading` | Topic labels used by the sources, including History, Society and culture, and Discovery |
| `sections[].content` | Narrative paragraphs under those headings |
| `sections[].date_range.start` / `.end` | Years, full dates and date spans attached to events, retained in their sentences |
| `sections[].subsections[]` | Standalone passages about a single named person or programme |
