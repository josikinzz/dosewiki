# Dosage & Duration Extraction Prompt

You are given one staged source file containing every collected source document for a single
psychoactive substance. Transcribe the dosage and duration passages out of it, verbatim, into the
output format below.

This is transcription, not translation. You copy characters. You do not summarise, rewrite,
normalise, convert, reorder, complete, or correct anything. Your output is machine-verified by
substring match against the staged source file: a passage that does not appear
character-for-character in the source fails the check and the whole file is rejected.

## The three rules

**1. Copy exactly.** Every digit, unit, symbol, route name, label, space, and punctuation mark comes
across as written. `15-25mg` stays `15-25mg`, not `15–25 mg`, not `15 to 25 mg`. `45 mg +` stays
`45 mg +`. `1 Hours / 6 Hours` stays `1 Hours / 6 Hours`. `≤0.3 mg` keeps the `≤`. `00:45 – 01:30`
stays in clock notation. Never convert grams to milligrams, hours to minutes, or mg/kg to a total.
Never round. Typos, doubled spaces, misplaced asterisks (`*Onset : *20 - 90 minutes`), and OCR
damage (`7 00mg`) are copied intact, they are the source's, not yours to fix.

**2. Never fill a gap.** If a source gives Light, Common, and Strong but no Threshold or Heavy, you
transcribe three tiers. If it gives oral doses only, you transcribe oral only. If it gives onset but
no total duration, you transcribe onset. Do not supply the missing tier, route, or stage from
another source in the file, from a related substance, or from your own knowledge. An incomplete
table is the correct output for an incomplete source. Never merge two sources' tables into one.

**3. An empty result is a correct result.** Many sources say nothing about dosage or duration,
legal-status pages, chemistry stubs, pharmacology-only entries. Writing
`*No dosage or duration content found.*` under every heading is a complete, successful run.
Inventing a plausible milligram figure is the only real failure, and it is a serious one: these
numbers reach a published dose table that people use to decide what to take.

## Input format

```
# <Substance Title>: Collected Sources

## Source: TripSit Factsheets

<full document text>

---

## Source: Wikipedia

<full document text>

---
```

Source count varies from two to a dozen. Read every source document in full. Dosage and duration
text is not confined to sections labelled "Dosage" or "Duration", it also appears in Quick
Reference blocks, Timeline sections, Use and effects prose, summaries, warnings, and footnotes.

## Output format

Reproduce this exactly, substituting the substance title from the input header, today's date, and
one block per source.

```
# <Substance Title> - Dosage & Duration Quotes

> Verbatim extractions from source articles. Generated <YYYY-MM-DD>.

## Source: <Source Name>

<verbatim extracted text>

---

## Source: <Source Name>

*No dosage or duration content found.*

---
```

- One `## Source:` heading per source in the staged file, in the same order, using the same source
  name. Every source gets a block, including the ones that yielded nothing. Never merge, reorder,
  rename, or omit a source.
- A source with nothing relevant gets `*No dosage or duration content found.*` alone under its
  heading.
- A source that was present but had no document text at all gets
  `*No content available for this source.*`
- Every block ends with a `---` rule.
- Output the file body only. No code fences around it, no preamble, no closing commentary.

## What counts as dosage content

- Dose tiers with numbers: threshold, light, common, moderate, strong, heavy, and any other tier
  label the source uses (Initial, Maintenance, Range, museum level, plateau).
- Route-specific doses: oral, insufflated, smoked, vaporised, IV, IM, sublingual, buccal, rectal,
  transdermal, inhaled. Bioavailability figures stated alongside a route.
- Weight-based (`mg/kg`, `.15 - .3 mg / lb`) and daily (`mg/d`) doses.
- Non-milligram units in a tiered structure, `1-2 seeds`, `1-3 lungs`, `2 drinks`, `0.066 gram`.
  The unit does not matter; the dose statement does.
- Dose stated in prose: "A standard oral dose of 2C-B is between 10 and 40 mg."
- Dose form and preparation notes that change the dose: blotter, pill strength, extract ratio,
  THC percentage, purity.
- Ceiling doses, maximum recommended doses, dose-response remarks, individual-variation caveats,
  dosing warnings.

## What counts as duration content

- Onset, come-up, peak (also "plateau", "strongest"), offset (also "coming down"), after-effects,
  total duration, any time unit, including seconds. Per-route timing differences.
- Time-to-peak-plasma and half-life values.
- Redose intervals and redose timing advice.
- Variability notes ("On a full stomach, onset can be considerably slower.").

## What does not count

Mechanism, receptor binding, metabolism pathways, chemistry, subjective effect descriptions, legal
status, and tolerance-reset timelines measured in days or weeks. These have their own extraction
passes.

Worked boundary:

- **Include**: "Doses above 35 mg can be experienced as unpleasantly strong even by experienced
  users." A dose figure with a consequence.
- **Exclude**: "Alprazolam binds to the benzodiazepine allosteric site of the GABA-A receptor."
  No dose, no timing.
- **Include, unchanged**: `- **Maximum Dose Experienced:** 80mg+30mg+55mg`. This is a personal
  consumption log, not a harm-reduction tier, but a reviewer needs to see it. Carry the label with
  it so it stays identifiable as a log. Never rewrite it into a tier.

When you are unsure whether a passage belongs, include it. A human reviews this file. An extra
paragraph costs nothing; a missed dose figure is invisible.

## Carrying tables and lists across intact

Numbers without their route are unusable and unsafe. Whenever you copy a dose or duration table,
copy the headings that identify it, the section heading (`## Dosage`, `## Duration`, `## Timeline`,
`## Quick Reference`) and the route or form heading (`### Oral`, `#### Intranasal`, `**Oral**`,
`**Dosage (insufflated)**`, `### Hawaiian Baby Woodrose Seeds`).

- **Pipe tables**: copy every row, including the `| --- | --- |` separator row and any repeated
  header rows. Do not convert a table into a list.
- **Bold- or italic-label lists**: copy the label, its markers, its colon, and its spacing exactly:
  `- **Common:** 15-30mg`, `*Threshold :* 2-5mg`, `*Light  :* 5-15mg`.
- **Row order**: keep the source's order even when it is odd. TripSit lists tiers alphabetically
  (Common, Heavy, Light, Strong); transcribe them alphabetically. Never re-sort into
  threshold-to-heavy order.
- **Embedded data structures**: copy them raw. TripSit duration lines such as
  `- **Onset:** {'_unit': 'minutes', 'Insufflated': '1-10', 'Oral': '20-75', 'Rectal': '5-20'}`
  are transcribed exactly as printed, not unpacked into per-route lines.
- **Multiple tables per source**: a source giving separate tables for oral, insufflated, and IV
  gets all three, each under its own heading, in source order.
- **Prose around a table**: a warning or note sitting inside the dosage section
  (`*Warning!!! (2C-B insufflation is extremely painful)*`) comes across with the table.
- **Mid-paragraph facts**: a dose figure embedded in a paragraph about something else brings the
  whole paragraph. Never truncate mid-sentence.

## Schema field mapping

The downstream generator fills these fields. Use the mapping to recognise relevant text, not to
relabel it. Source labels are transcribed as the source wrote them.

**Dosage** (`dosage.routes[]`)

| Field | Source text that feeds it |
|---|---|
| `route` | The route heading above the table |
| `dose_ranges.threshold` | Threshold |
| `dose_ranges.light` | Light |
| `dose_ranges.moderate` | Common, Moderate |
| `dose_ranges.strong` | Strong |
| `dose_ranges.heavy` | Heavy |
| `bioavailability` / `bioavailability_notes` | Route-specific bioavailability percentages |
| `notes` | Ceiling and maximum doses, dose forms, purity, warnings, variation caveats |

There is no maximum-dose tier; ceiling and maximum doses are transcribed as prose and land in
`notes`. `dosage.plateau_dosing` exists only for DXM-style plateau tables (`first_plateau` through
`fifth_plateau`, each with `min`, `max`, `unit`, `effects`), transcribe plateau tables in full,
including the effect description attached to each plateau.

**Duration** (`duration.routes[]`)

| Field | Source text that feeds it |
|---|---|
| `route` | Per-route duration heading |
| `stages.onset` | Onset |
| `stages.come_up` | Come up, Coming Up |
| `stages.peak` | Peak, Plateau, Strongest |
| `stages.offset` | Offset, Come down, Coming Down |
| `stages.after_effects` | After effects, Normal After Effects |
| `stages.total_duration` | Total, Duration, Total Duration |
| `half_life` / `half_life_notes` | Elimination half-life values and ranges |

## Before you finish

- Every source in the staged file has exactly one block, in input order.
- Every block ends with `---`.
- Every number, unit, and label you wrote can be found character-for-character in the staged file.
- No tier, route, or stage appears in your output that was absent from that source.
