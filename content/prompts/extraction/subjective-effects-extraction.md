# Subjective Effects Extraction

You are given one staged source file covering a single psychoactive substance. Copy, verbatim, every
passage describing what taking the substance feels like. Produce one output file. Do nothing else.

This is selection and copying, not writing. You never compose a sentence of your own.

## Hard rules

1. **Character-for-character.** Every passage you output must appear in the staged file exactly as you
   reproduce it, same wording, punctuation, curly quotes, em dashes, capitalisation, spelling mistakes,
   numbers, and units. A script re-checks each passage against the staged file by exact substring match.
   One altered character fails the file.
2. **Never join.** Each passage is one contiguous run of source text. Passages separated in the source
   stay separated in your output, one blank line between them. Joining two manufactures text that exists
   nowhere in the source.
3. **Complete units.** Copy whole paragraphs, list items, table rows, sentences. Never begin or end
   mid-sentence. Keep the source's markdown: headings, `-` bullets, bold, `>` markers, table pipes.
4. **Over-include.** Unsure whether a passage counts? Include it. A human reviews this file afterwards;
   an extra paragraph costs them a second, a missed one is invisible forever.
5. **Never supplement.** You know a great deal about these substances. None of it may enter the file. If
   the sources describe no visuals, the file describes no visuals.
6. **An empty result is a correct result.** Many sources are chemistry or pharmacology pages carrying no
   experiential content at all. A file whose every block reads `*No subjective effects content found.*`
   is a successful run. Writing one plausible paragraph to avoid an empty-looking file is the only real
   failure here, and it poisons a published article.

## Input

The staged file concatenates every collected source document for one substance:

```
# <Substance Title>: Collected Sources

## Source: TripSit Factsheets

<full document text>

---

## Source: Drug Users Bible

<full document text>

---
```

Two to a dozen sources, ranging from a two-line factsheet to a book chapter. Read each in full: relevant
material turns up outside "Effects" headings, in overviews, summaries, comparisons, mid-paragraph asides.

## Output

Emit the file body only. No code fences, no preamble, no closing commentary.

```
# <Substance Title> - Subjective Effects Quotes

> Verbatim extractions from source articles. Generated <YYYY-MM-DD>.

## Source: <Source Name>

<verbatim extracted passages>

---

## Source: <Source Name>

*No subjective effects content found.*

---
```

- Take `<Substance Title>` from the staged file's first heading, exactly as written.
- One `## Source:` block per source in the staged file, **in the staged order, including sources that
  yielded nothing**. Never merge, reorder, or omit a source. Reproduce each source name exactly.
- A source with no experiential content gets `*No subjective effects content found.*` alone.
- A source whose document is empty gets `*No content available for this source.*`
- Every block ends with a `---` rule.

## What counts

Text describing what a person perceives, feels, thinks, or does under the substance, as clinical prose,
a bulleted effect list, or first-person narrative:

- **Physical**: body high, tingling, warmth, chills, heaviness, stimulation or sedation, physical
  euphoria, nausea, appetite, pupil dilation, sweating, tremor, coordination, muscle tension, perceived
  heart rate, pain perception, energy, body load.
- **Cognitive**: thought acceleration, deceleration, or looping; time distortion, memory effects,
  introspection, mood lift, anxiety, paranoia, confusion, delusion, ego suppression or dissolution,
  unity, empathy, sociability, focus, creativity, déjà vu.
- **Visual**: colour and acuity enhancement; drifting, melting, breathing, morphing, tracers,
  after-images, depth and perspective distortion, texture repetition; open- and closed-eye geometry and
  its style, complexity, and intensity; internal and external hallucinations, entities, transformations.
- **Other senses**: sound enhancement, distortion, and hallucination; music appreciation; tactile,
  smell, taste, and synaesthetic effects.
- **States and arc**: mystical, near-death, out-of-body, hole, and peak experiences; how effects rise,
  peak, plateau, and fade, and what the comedown and afterglow feel like.

Receptor pharmacology, metabolism, dose tables, duration figures, legality, chemistry, and history belong
to other sections. When one paragraph carries both, copy the whole paragraph.

## Trip reports

First-person experience prose is the richest material this section gets, and it arrives as long
unstructured narrative. Work through it paragraph by paragraph.

**Copy** any paragraph describing perception, sensation, mood, thought, or hallucination, including
timestamped entries, taking the timestamp label along with the paragraph it prefixes, since it is part of
that line. Copy comparative descriptions ("similar to X but with more…") and temporal ones ("at the
peak…", "as it wore off…"). Keep the author's voice, hedges, and asides intact.

**Leave out** paragraphs that are purely logistics or scene-setting: sourcing and price, weighing and
preparation, route and timing of ingestion, who was present and where, unrelated events during the
experience, plans for future trials.

**Carry the sentence.** An effect named inside a longer sentence travels with that sentence, never lifted
out as a phrase. The downstream generator needs a name *and* descriptive prose per effect; a bare keyword
list gives it nothing to describe and cannot be traced to the source.

### Worked examples

Copy whole, timestamp included:

```
**T+2:30** - Content and happy enough, although not tripping high or particularly intensively. The shivers and chills have largely dissipated and there is no perceptible discomfort in terms of body load. Skin feels relatively sensitised, in a strange entactogenic sort of way.
```

Skip, logistics and setting, no effect described:

```
The material was weighed on a milligram scale and taken orally on an empty stomach at 9pm, with a trusted friend present as a sitter.
```

Copy the entire sentence:

```
As the effects intensify, a wide variety of perceptual changes may occur; pupil dilation, visual patterning and movement, mental stimulation, new perspectives, feelings of insight, emotional shifts (mood lift or introspection), anxiety and confusion.
```

Reducing that to `pupil dilation, visual patterning and movement, mental stimulation` is wrong twice
over: it is a fragment, and it drops the qualification that these arrive as effects intensify. And if
that sentence sits three paragraphs of setting away from the next effects paragraph, output both with a
blank line between them rather than closing the gap.

## Schema field mapping

The generator reading this file fills the substance's `subjective_effects` section. Every leaf effect
needs a short name *and* a descriptive sentence, which is why prose matters more than effect names alone.

| Schema field | What to look for |
| --- | --- |
| `notes.overview` | Overall character of the experience; how a source summarises it |
| `notes.physical`, `notes.cognitive`, `notes.sensory` | Category-level summary prose |
| `physical` | Named body effects with descriptions |
| `cognitive` | Named thought, mood, memory, time, and ego effects with descriptions |
| `sensory.visual` | Enhancements, distortions, geometry, hallucinatory states |
| `sensory.auditory` | Sound enhancement, distortion, hallucination, music appreciation |
| `sensory.tactile`, `sensory.olfactory`, `sensory.gustatory`, `sensory.multisensory` | Touch, smell, taste, synaesthesia |
| `progressive_stages` | Onset, come-up, peak, plateau, offset, afterglow, timestamped trip-report entries land here |
| `attribution` | Author, publication, or byline attached to a quoted experience |
