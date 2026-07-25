# Tolerance Extraction

You are given one staged source file: every collected source document for a single substance article. Copy out of it, verbatim, every passage that says anything about tolerance to that substance.

This is mechanical copy-paste. Do not summarise, synthesise, rewrite, or explain.

## Hard rules

1. **Verbatim.** Every passage you output must appear character-for-character in the staged file. Your output is checked by substring match against the source and rejected if any passage drifts. Copy the text; never retype it from memory. Keep the source's own spelling, punctuation, markdown, links, and typos. Numbers and units are copied exactly — never converted, rounded, or reformatted.
2. **Nothing invented.** Write no sentence that is not in the staged file. A fabricated tolerance timeline is the one failure that ruins the published article; every other mistake a reviewer can fix.
3. **An empty result is a correct result.** Most substances have sources that never mention tolerance. A file whose every source carries `*No tolerance content found.*` is a successful run, not a failed one.
4. **Every source, in order.** Emit one `## Source:` block for every source in the staged file, in the order they appear there, including sources that yielded nothing. Never merge, reorder, add, or drop a source.
5. **Complete units.** Extract the whole paragraph, whole list item, or whole table row. Never start or stop mid-sentence. When a tolerance fact sits inside a paragraph about something else, take the entire paragraph.
6. **Include when unsure.** A reviewer discards extras cheaply. A passage you skipped is invisible.

## Input format

```
# <Substance Title> — Collected Sources

## Source: tripsit-factsheets

<full document text>

---

## Source: wikipedia

<full document text>

---
```

One to a dozen sources, ranging from a few lines to tens of thousands of words each. The heading text after `## Source:` is often a slug such as `tripsit-factsheets`; reproduce it exactly as written, without tidying or expanding it.

## Output format

Emit the file body only — no code fences, no preamble, no closing commentary.

```
# <Substance Title> - Tolerance Quotes

> Verbatim extractions from source articles. Generated <YYYY-MM-DD>.

## Source: <first source name>

<verbatim passage>

<verbatim passage>

---

## Source: <second source name>

*No tolerance content found.*

---
```

- `<Substance Title>` is the title on the staged file's first line with ` — Collected Sources` removed.
- `<YYYY-MM-DD>` is today's date.
- Separate multiple passages from the same source with a single blank line. A `---` rule means end of source block and nothing else.
- A source with no qualifying passage gets `*No tolerance content found.*` alone under its heading.
- A source whose document is empty in the staged file gets `*No content available for this source.*`
- Every source block ends with `---`.

## What counts as tolerance content

Any sentence about the body's response changing with repeated exposure to this substance, or about how far apart doses should be spaced. Concretely:

- Tolerance building: how fast, how far, to which effects, after how many doses.
- Tolerance fading: half-tolerance time, baseline reset time, and "wait N days/weeks between uses" advice — including when the word "tolerance" never appears.
- Reduced tolerance after abstinence, and the overdose risk on relapse.
- Cross-tolerance: which substances or classes share it, in which direction, how completely.
- Reverse tolerance, sensitisation, tachyphylaxis, kindling.
- Receptor downregulation or upregulation, enzyme induction, or neuroadaptation offered as the reason tolerance develops.
- Dosing statements that turn on the user's tolerance: "opioid-naive", "in non-tolerated users", "regular users require higher doses", ceiling effects.
- Dependence, withdrawal, and abuse-potential prose **when the same passage also speaks to tolerance**. A paragraph headed "Tolerance and addiction potential" is taken whole.

The word carrying a different meaning does not count: social or political tolerance ("a more tolerant attitude to drugs"), crop tolerance ("herbicide tolerance"), tolerance of heat, cold, stress, or exercise described as a drug *effect*, and food intolerance or allergy.

## Worked examples

Qualifies — the fact is one clause of a paragraph about overdose, so the whole paragraph comes with it:

> The risk of fatal opioid overdoses rise sharply after a period of cessation and relapse, largely because of reduced tolerance. To account for this lack of tolerance, it is safer to only dose a fraction of one's usual dosage if relapsing.

Qualifies — dose-spacing guidance, with the word "tolerance" absent:

> - Take longer breaks (at least several days) between consumption.

Does not qualify — a different sense of the word:

> Phenylpiracetam is typically prescribed as a general stimulant or to increase tolerance to extreme temperatures and stress.

## Before you write the marker

Tolerance is usually one or two embedded sentences rather than a section, and it frequently sits nowhere near a heading that says "Tolerance". Read each source document end to end, and check these places before concluding that a source is silent:

- Headings such as "Tolerance and addiction potential", "Dependence and abuse potential"
- Pharmacology, pharmacokinetics, and mechanism-of-action sections
- Dosage sections and their warnings ("in non-tolerant users", "start low, go slow")
- Harm-reduction, safety, health, and responsible-use notes
- Interaction lists, which often note one drug lowering tolerance to another
- Summary and overview paragraphs

Write `*No tolerance content found.*` when, and only when, no sentence in that source qualifies.

## Schema field mapping

The downstream generator fills four fields from your excerpts. Passages carrying these facts are the highest-value ones to find; a passage carrying none of them is still extracted if it qualifies above.

| Field | What it needs from the source |
| --- | --- |
| `full_tolerance` | How long continuous use takes to build full tolerance, and to which effects |
| `half_tolerance` | How long abstinence takes to halve tolerance |
| `baseline_tolerance` | How long abstinence takes to reset tolerance to baseline |
| `cross_tolerance` | Which substances or drug classes share tolerance with this one |
