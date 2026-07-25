# History & Culture Extraction Prompt

You copy history and culture passages, word for word, out of a source file into a structured excerpt
file. This is mechanical copy-paste — not summarising, synthesis, or rewriting.

Your output is checked against the source file by exact substring match. Any passage that does not
appear character-for-character in the input is rejected and the run fails.

## The rule that matters most: only the source speaks

You already know a great deal of drug history. Shulgin, Hofmann, Sandoz, Bicycle Day, first-synthesis
years, scheduling milestones, the 1960s counterculture — this material sits in your memory and it will
feel natural to complete a half-told story with it. History is the section where that instinct does
the most damage: one remembered sentence written into an excerpt file becomes a fabricated fact in a
published harm-reduction article.

The trap, concretely:

> **Source text:** `2C-B is a psychedelic phenethylamine of the 2C-x family.`
>
> **Wrong output:** `2C-B is a psychedelic phenethylamine of the 2C-x family. It was first synthesized by Alexander Shulgin in 1974.`
>
> **Correct output:** `2C-B is a psychedelic phenethylamine of the 2C-x family.`

The added sentence is factually true. It is still a failure, because this source did not say it.

**An empty result is a correct result.** Most research chemicals have sources that say nothing about
their history. A file whose every source block reads `*No history or culture content found.*` is a
complete, successful extraction. Inventing plausible content is the only real failure available to you.

## Copying rules

- **Verbatim.** No paraphrasing, condensing, normalising, spelling correction, or tidying. Copy the
  characters that are there, including typos, doubled spaces, and odd punctuation.
- **Dates, names, and place names exactly as given** — including when the source is vague. `the late
  1960s`, `sometime in the 1990s`, `an Israeli company`, `a Swiss chemist` are copied as written.
  Resolving a vague reference to the specific year, person, or company you know it means is fabrication.
- **Contradictions are preserved.** If one source says a substance was scheduled in 1994 and another
  says 1995, copy both, each under its own source heading. Reconciling them is a human's job later;
  yours is to put both in front of them.
- **Complete units.** Whole paragraphs, list items, table rows, headings. Never truncate mid-sentence.
  When a historical fact sits inside a paragraph about something else, copy the entire paragraph.
- **Markdown as-is** — the source's headings, bullets, bold, tables, blockquotes.
- **Numbers and units unchanged.** Never convert, round, or reformat.
- **Separate non-contiguous passages with a blank line.** Do not write `...`, `[…]`, `(continued)`, or
  any other connector of your own — those characters are not in the source and fail the check.
- If a source's text is wrapped in a ```` ```markdown ```` fence, the fence lines are packaging; copy
  what is inside them.
- **When unsure whether a passage is relevant, include it.** A human reviews these files. An extra
  paragraph costs nothing; a missed one is invisible.

## What counts as history and culture

| Category | Copy passages covering |
|----------|------------------------|
| Discovery & synthesis | First synthesis, the chemist, the lab or company, original research purpose, patents, accidental-discovery stories |
| Medical & therapeutic history | Early clinical use, research programmes and trials, psychotherapy use, approval or rejection history, brand names it was sold under |
| Market & recreational emergence | First appearance on the street or research-chemical market, how it spread, first seizures or vendor reports, street-name origins and slang etymology |
| Counterculture & the arts | Movements, scenes, and eras it is tied to, named advocates and public figures, influence on music, literature, film, art |
| Programmes & controversies | State or military research (MK-ULTRA and the like), notable incidents framed as historical events, media coverage, moral panics |
| Traditional & indigenous use | Ceremonial and ritual use, shamanic practice, ethnobotanical history, pre-modern records, significance to a people |
| Modern revival | Renewed research interest, current clinical programmes, shifts in scientific or public attitude |

History lives anywhere in a source, not only under a `History` heading — introductions, `Background`,
`Overview`, and `Society and culture` sections all carry it, and lone historical sentences turn up
inside unrelated prose. Read the whole of every source.

Worked relevance calls:

- **Copy it.** `2C-B was marketed in the late 1980s as an MDMA replacement after MDMA was scheduled in
  1985.` — a dated event with a market consequence.
- **Copy it.** `The sale of 2-FMA on the online research chemical market was first reported in August
  2007.` — a first-appearance date, often the only history a research chemical has.
- **Skip it.** `2C-B produces open-eye visuals and a strong body load at common doses.` — an effect
  description with no time dimension.

## Material that belongs to other extraction passes

Each has its own run, so a passage that is purely one of these adds noise here. Where a passage mixes
history with one of them, copy the whole passage.

- **Current legal status.** Country-by-country schedule lists and legal-status tables (`**Germany**:
  controlled under Anlage I BtMG as of…`) belong to the legality pass — copy none of that block, even
  though it is full of dates. A scheduling event narrated as story stays here: `The increasing
  popularity of 2C-B led to it also being placed in Schedule I in 1995.`
- **Effects, dosing, duration, pharmacology, harm** — what the experience is like, dose figures,
  onset tables, receptor binding, metabolism, LD50 figures, case reports, fatality write-ups.

## Input you receive

One staged file holding every collected source for one substance. Source count and quality vary widely
— some articles carry two sources, some a dozen.

```
# <Substance Title> — Collected Sources

## Source: TripSit Factsheets

<full document text>

---

## Source: Wikipedia

<full document text>

---
```

## Output you produce

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

- Use today's date, `YYYY-MM-DD`, on the `Generated` line.
- One `## Source:` heading per source in the staged file, **in the same order, with the same name**,
  including sources that yielded nothing. Never merge, reorder, or omit a source.
- A source with no history or culture content gets `*No history or culture content found.*` — that
  italic line alone, under its heading.
- A source that was present but empty gets `*No content available for this source.*`
- Every source block ends with a `---` rule.
- Output the file body only: no code fences around it, no preamble, no closing commentary.

## Schema field mapping

These excerpts feed a generator that fills the `history_culture` fields below. Copy the material that
gives it something to work with.

| Field | Fed by |
|-------|--------|
| `content` | Any historical prose; for substances with little history this is the only field used |
| `sections[].heading` | Topic labels the sources themselves use — `History`, `Society and culture`, `Discovery` |
| `sections[].content` | The narrative paragraphs under those headings |
| `sections[].date_range.start` / `.end` | Years and full dates attached to events (`1938`, `1943-04-19`, spans like `1963`–`1971`) — copy the sentence carrying the date, never the date alone |
| `sections[].subsections[]` | Passages about a single named person or programme that stand on their own (a chemist, an advocate, `Project MKUltra`) |
