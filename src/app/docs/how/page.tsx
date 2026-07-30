import type { ReactNode } from "react";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { Icon } from "@/components/common/Icon";
import { proseLinkClassName } from "@/components/common/ProseLink";
import { PublicTableOfContents } from "@/components/common/PublicTableOfContents";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContentCard } from "@/components/ui/surface";
import { Mermaid } from "../_components/Mermaid";

export function generateMetadata() {
  return buildPublicPageMetadata({
    title: "How dose.wiki articles are made",
    description:
      "An honest, detailed walkthrough of the dose.wiki content pipeline: scraping, quote extraction, AI synthesis, citations, and human expert review.",
    pathname: "/docs/how",
  });
}

const TOC = [
  { id: "s1", label: "1. Why this page exists", icon: "lucide:info" },
  { id: "s2", label: "2. The pipeline at a glance", icon: "lucide:workflow" },
  { id: "s3", label: "3. The sources", icon: "lucide:database" },
  { id: "s4", label: "4. Where each section comes from", icon: "lucide:layout-list" },
  { id: "s5", label: "5. Scraping & parsing", icon: "lucide:globe" },
  { id: "s6", label: "6. Excerpt extraction", icon: "lucide:scissors" },
  { id: "s7", label: "7. AI synthesis & the prompts", icon: "lucide:sparkles" },
  { id: "s8", label: "8. Citations", icon: "lucide:quote" },
  { id: "s9", label: "9. Human review", icon: "lucide:user-check" },
  { id: "s10", label: "10. The open dataset", icon: "lucide:download" },
  { id: "s11", label: "11. Originality & licensing", icon: "lucide:scale" },
] as const;

const INTRO_QUOTES = `# 2C-B - Intro Text Quotes

> Verbatim extractions from source articles. Generated 2026-01-15.

---

## Source: Disregard Everything I Say

2C-B (4-bromo-2,5-dimethoxyphenethylamine) is a psychedelic phenethylamine of the 2C-x family. It was first synthesized by Alexander Shulgin in 1974.

This substance first saw use among the psychiatric community as an aid during therapy. It was considered one of the best drugs for this purpose because of its short duration, relative absence of side effects, and comparably mild nature.

Like many 2c-x substances, this drug is a highly dose sensitive psychedelic known for its entactogenic effects, bright visuals, and intense body load. This substance is often described by users as feeling half way between LSD and MDMA. Many reports suggest that while 2C-B’s entactogenic effects are less pronounced than MDMA, the visual effects are described as more pronounced and colourful.

---

## Source: Drug Users Bible

- **Common Nomenclature:** 2,5-dimethoxy- 4 - bromophenethylamine
- **Street & Reference Names:** Nexus; Bees; Venus; 2cb

2C-B was first synthesised by Alexander Shulgin in 1974 and became one of his most popular creations. It was initially used in psychiatric therapy, before emerging as a popular recreational drug.

For a period in the late 1980s it was sold as a legal alternative to MDMA, but generally it is now perceived more accurately; as a chemical which induces its own unique experience.

---

## Source: Erowid

2C-B is a synthetic psychedelic that first gained popularity as a legal ecstasy replacement in the mid 1980s. It is generally considered to be somewhat 'gentler' than LSD or mushrooms, being less prone to catalyzing dissociated freak-outs or overwhelming panic attacks at normal recreational doses. 2C-B is also known for the strong body component of its effects which are alternately described as pleasurable energy or a 'sense of being in the body', and by others as an unpleasant 'buzzing' or body-load.

2C-B is sometimes chosen for use in psychedelic psychotherapy because its short duration and less 'pushy' character.

## Chemistry
4-Bromo-2,5-dimethoxybenzeneethanamine (2C-B) is a synthetic chemical in the phenethylamine class. It is related structurally to mescaline, DOB, and distantly to MDMA.

---

## Source: PsychonautWiki

**4-Bromo-2,5-dimethoxyphenethylamine** (also known as **Nexus** , **Bromo Mescaline** , **BDMPEA** , **Venus** , and **2C-B** ) is a novel [psychedelic](https://psychonautwiki.org/wiki/Psychedelic) substance of the [phenethylamine](https://psychonautwiki.org/wiki/Phenethylamine) class. It is perhaps the most well-known member of the [2C-x family](https://psychonautwiki.org/wiki/2C-x_family) , which are structurally related to the classical psychedelic [mescaline](https://psychonautwiki.org/wiki/Mescaline) .

2C-B was discovered in 1974 by the American chemist [Alexander Shulgin](https://psychonautwiki.org/wiki/Alexander_Shulgin) , who was investigating psychedelic phenethylamines derived from [mescaline](https://psychonautwiki.org/wiki/Mescaline) .

User reports have described the effects of 2C-B as moderate, warm, colorful, and highly sensual. Similar to [mescaline](https://psychonautwiki.org/wiki/Mescaline) , it is described as possessing a less serious or grandiose headspace than [tryptamines](https://psychonautwiki.org/wiki/Tryptamines) like [LSD](https://psychonautwiki.org/wiki/LSD) or [psilocybin mushrooms](https://psychonautwiki.org/wiki/Psilocybin_mushrooms) , placing greater emphasis on the visual and tactile domain.

## Chemistry

2C-B, or 2,5-dimethoxy-4-bromophenethylamine, is a [substituted phenethylamine](https://psychonautwiki.org/wiki/Substituted_phenethylamine) .

---

## Source: The Drug Classroom

2C-B is a psychedelic that was created in the 1970s. It’s a member of the 2C family ( [2C-E](http://thedrugclassroom.com/video/2c-e/) , [2C-I](http://thedrugclassroom.com/video/2c-i/) , etc) and along with having psychedelic effects, 2C-B has aphrodisiac qualities.

2C-B = 2,5-dimethoxy-4-bromophenethylamine; Nexus; Eros

---

## Source: TripSit Factsheets

## Classification
- **Categories:** psychedelic, empathogen, common
- **Also known as:** bees, nexus, 2cb, 2cb, 2-cb

---

## Source: TripSit Wiki

**2C-B** is a [psychedelic](https://wiki.tripsit.me/wiki/Psychedelics) drug of the [2C-X family](https://wiki.tripsit.me/wiki/2C-X). Effects are often described as being more easily managed than other psychedelics; it is often compared to a mixture of a LSD and MDMA. 2C-B is also known for the strong body component of its effects.

---

## Source: Wikipedia

2C-B, also known as 4-bromo-2,5-dimethoxyphenethylamine or by names such as Nexus or Erox, is a psychedelic drug of the phenethylamine and 2C families. It is a synthetic analogue of mescaline. The drug is used as a recreational drug and is usually taken orally. 2C-B produces hallucinogenic, mild stimulant, and mild entactogenic-like effects. Its hallucinogenic effects at typical doses are milder than those of other psychedelics like LSD or psilocybin.

2C-B was developed by Alexander Shulgin in 1974 and was described by him in the scientific literature in 1975.`;

// Source of truth: scripts/prompts/intro-text-extraction.md
const EX_INTRO = `# Intro Text Extraction Prompt

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
- Factsheet header lines such as \`**Categories:**\`, \`**Also known as:**\`, \`**Synonyms:**\`,
  \`**Summary:**\`, \`**Street & Reference Names:**\`, \`**Form:**\`, \`**IUPAC Name:**\`

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

\`\`\`
# <Substance Title> — Collected Sources

## Source: wikipedia

<full document text>

---

## Source: tripsit-factsheets

<full document text>

---
\`\`\`

Source count varies from two to a dozen, and length and quality vary just as widely.

## Output format

\`\`\`
# <Substance Title> - Intro Text Quotes

> Verbatim extractions from source articles. Generated <YYYY-MM-DD>.

## Source: <Source Name>

<verbatim extracted text>

---

## Source: <Source Name>

*No intro content found.*

---
\`\`\`

- \`<Substance Title>\` is copied from the first line of the input. \`<YYYY-MM-DD>\` is today's date.
- One \`## Source:\` heading per source in the input, in the input's order, with the source name
  spelled exactly as the input spells it. Include sources that yielded nothing.
- A source with no intro content gets exactly \`*No intro content found.*\` — that italic line alone
  under its heading.
- A source that was present but had no document text gets \`*No content available for this source.*\`
- Every source block ends with a \`---\` rule.
- No code fences around the output, no preamble, no closing commentary.

## An empty result is a correct result

Some sources are pure dosage tables, effect indexes, or legal notices and genuinely say nothing about
what the substance is. A file whose every source block reads \`*No intro content found.*\` is a
correct, successful, complete result — report it and stop. The only real failure is text in the
output that is not in the source. One invented sentence here becomes the opening line of a published
article, so an empty file always beats a plausible one.

## Schema field mapping

Your excerpts are the only material the downstream generator sees, and it fills exactly one field:
\`summary\`, a 50–80 word paragraph opening the article. It needs to find, in your excerpts:

- **What it is** — chemical class and primary name, mirroring \`classification.chemical_class\`
- **Psychoactive class** — primary effects category, mirroring \`classification.psychoactive_class\`
- **Origin** — first synthesis, discoverer, date, or traditional use, where a source attests it
- **Notable characteristics** — what distinguishes this substance from similar ones
- **Prominent safety framing** — only where a source's own lead carries it, e.g. a substance known
  chiefly as a dangerous adulterant

Nomenclature lines feed \`identification.*\` fields rendered above the summary, so copy the labelled
name lines and lead sentences where you find them rather than hunting document bodies for scattered
name mentions. Do not sort, label, or restructure your output around any of these fields.
`;

// Source of truth: scripts/prompts/dosage-duration-extraction.md
const EX_DOSAGE_DURATION = `# Dosage & Duration Extraction Prompt

You are given one staged source file containing every collected source document for a single
psychoactive substance. Transcribe the dosage and duration passages out of it, verbatim, into the
output format below.

This is transcription, not translation. You copy characters. You do not summarise, rewrite,
normalise, convert, reorder, complete, or correct anything. Your output is machine-verified by
substring match against the staged source file: a passage that does not appear
character-for-character in the source fails the check and the whole file is rejected.

## The three rules

**1. Copy exactly.** Every digit, unit, symbol, route name, label, space, and punctuation mark comes
across as written. \`15-25mg\` stays \`15-25mg\` — not \`15–25 mg\`, not \`15 to 25 mg\`. \`45 mg +\` stays
\`45 mg +\`. \`1 Hours / 6 Hours\` stays \`1 Hours / 6 Hours\`. \`≤0.3 mg\` keeps the \`≤\`. \`00:45 – 01:30\`
stays in clock notation. Never convert grams to milligrams, hours to minutes, or mg/kg to a total.
Never round. Typos, doubled spaces, misplaced asterisks (\`*Onset : *20 - 90 minutes\`), and OCR
damage (\`7 00mg\`) are copied intact — they are the source's, not yours to fix.

**2. Never fill a gap.** If a source gives Light, Common, and Strong but no Threshold or Heavy, you
transcribe three tiers. If it gives oral doses only, you transcribe oral only. If it gives onset but
no total duration, you transcribe onset. Do not supply the missing tier, route, or stage from
another source in the file, from a related substance, or from your own knowledge. An incomplete
table is the correct output for an incomplete source. Never merge two sources' tables into one.

**3. An empty result is a correct result.** Many sources say nothing about dosage or duration —
legal-status pages, chemistry stubs, pharmacology-only entries. Writing
\`*No dosage or duration content found.*\` under every heading is a complete, successful run.
Inventing a plausible milligram figure is the only real failure, and it is a serious one: these
numbers reach a published dose table that people use to decide what to take.

## Input format

\`\`\`
# <Substance Title> — Collected Sources

## Source: TripSit Factsheets

<full document text>

---

## Source: Wikipedia

<full document text>

---
\`\`\`

Source count varies from two to a dozen. Read every source document in full. Dosage and duration
text is not confined to sections labelled "Dosage" or "Duration" — it also appears in Quick
Reference blocks, Timeline sections, Use and effects prose, summaries, warnings, and footnotes.

## Output format

Reproduce this exactly, substituting the substance title from the input header, today's date, and
one block per source.

\`\`\`
# <Substance Title> - Dosage & Duration Quotes

> Verbatim extractions from source articles. Generated <YYYY-MM-DD>.

## Source: <Source Name>

<verbatim extracted text>

---

## Source: <Source Name>

*No dosage or duration content found.*

---
\`\`\`

- One \`## Source:\` heading per source in the staged file, in the same order, using the same source
  name. Every source gets a block, including the ones that yielded nothing. Never merge, reorder,
  rename, or omit a source.
- A source with nothing relevant gets \`*No dosage or duration content found.*\` alone under its
  heading.
- A source that was present but had no document text at all gets
  \`*No content available for this source.*\`
- Every block ends with a \`---\` rule.
- Output the file body only. No code fences around it, no preamble, no closing commentary.

## What counts as dosage content

- Dose tiers with numbers: threshold, light, common, moderate, strong, heavy, and any other tier
  label the source uses (Initial, Maintenance, Range, museum level, plateau).
- Route-specific doses: oral, insufflated, smoked, vaporised, IV, IM, sublingual, buccal, rectal,
  transdermal, inhaled. Bioavailability figures stated alongside a route.
- Weight-based (\`mg/kg\`, \`.15 - .3 mg / lb\`) and daily (\`mg/d\`) doses.
- Non-milligram units in a tiered structure — \`1-2 seeds\`, \`1-3 lungs\`, \`2 drinks\`, \`0.066 gram\`.
  The unit does not matter; the dose statement does.
- Dose stated in prose: "A standard oral dose of 2C-B is between 10 and 40 mg."
- Dose form and preparation notes that change the dose: blotter, pill strength, extract ratio,
  THC percentage, purity.
- Ceiling doses, maximum recommended doses, dose-response remarks, individual-variation caveats,
  dosing warnings.

## What counts as duration content

- Onset, come-up, peak (also "plateau", "strongest"), offset (also "coming down"), after-effects,
  total duration — any time unit, including seconds. Per-route timing differences.
- Time-to-peak-plasma and half-life values.
- Redose intervals and redose timing advice.
- Variability notes ("On a full stomach, onset can be considerably slower.").

## What does not count

Mechanism, receptor binding, metabolism pathways, chemistry, subjective effect descriptions, legal
status, and tolerance-reset timelines measured in days or weeks. These have their own extraction
passes.

Worked boundary:

- **Include** — "Doses above 35 mg can be experienced as unpleasantly strong even by experienced
  users." A dose figure with a consequence.
- **Exclude** — "Alprazolam binds to the benzodiazepine allosteric site of the GABA-A receptor."
  No dose, no timing.
- **Include, unchanged** — \`- **Maximum Dose Experienced:** 80mg+30mg+55mg\`. This is a personal
  consumption log, not a harm-reduction tier, but a reviewer needs to see it. Carry the label with
  it so it stays identifiable as a log. Never rewrite it into a tier.

When you are unsure whether a passage belongs, include it. A human reviews this file. An extra
paragraph costs nothing; a missed dose figure is invisible.

## Carrying tables and lists across intact

Numbers without their route are unusable and unsafe. Whenever you copy a dose or duration table,
copy the headings that identify it — the section heading (\`## Dosage\`, \`## Duration\`, \`## Timeline\`,
\`## Quick Reference\`) and the route or form heading (\`### Oral\`, \`#### Intranasal\`, \`**Oral**\`,
\`**Dosage (insufflated)**\`, \`### Hawaiian Baby Woodrose Seeds\`).

- **Pipe tables** — copy every row, including the \`| --- | --- |\` separator row and any repeated
  header rows. Do not convert a table into a list.
- **Bold- or italic-label lists** — copy the label, its markers, its colon, and its spacing exactly:
  \`- **Common:** 15-30mg\`, \`*Threshold :* 2-5mg\`, \`*Light  :* 5-15mg\`.
- **Row order** — keep the source's order even when it is odd. TripSit lists tiers alphabetically
  (Common, Heavy, Light, Strong); transcribe them alphabetically. Never re-sort into
  threshold-to-heavy order.
- **Embedded data structures** — copy them raw. TripSit duration lines such as
  \`- **Onset:** {'_unit': 'minutes', 'Insufflated': '1-10', 'Oral': '20-75', 'Rectal': '5-20'}\`
  are transcribed exactly as printed, not unpacked into per-route lines.
- **Multiple tables per source** — a source giving separate tables for oral, insufflated, and IV
  gets all three, each under its own heading, in source order.
- **Prose around a table** — a warning or note sitting inside the dosage section
  (\`*Warning!!! (2C-B insufflation is extremely painful)*\`) comes across with the table.
- **Mid-paragraph facts** — a dose figure embedded in a paragraph about something else brings the
  whole paragraph. Never truncate mid-sentence.

## Schema field mapping

The downstream generator fills these fields. Use the mapping to recognise relevant text — not to
relabel it. Source labels are transcribed as the source wrote them.

**Dosage** (\`dosage.routes[]\`)

| Field | Source text that feeds it |
|---|---|
| \`route\` | The route heading above the table |
| \`dose_ranges.threshold\` | Threshold |
| \`dose_ranges.light\` | Light |
| \`dose_ranges.moderate\` | Common, Moderate |
| \`dose_ranges.strong\` | Strong |
| \`dose_ranges.heavy\` | Heavy |
| \`bioavailability\` / \`bioavailability_notes\` | Route-specific bioavailability percentages |
| \`notes\` | Ceiling and maximum doses, dose forms, purity, warnings, variation caveats |

There is no maximum-dose tier; ceiling and maximum doses are transcribed as prose and land in
\`notes\`. \`dosage.plateau_dosing\` exists only for DXM-style plateau tables (\`first_plateau\` through
\`fifth_plateau\`, each with \`min\`, \`max\`, \`unit\`, \`effects\`) — transcribe plateau tables in full,
including the effect description attached to each plateau.

**Duration** (\`duration.routes[]\`)

| Field | Source text that feeds it |
|---|---|
| \`route\` | Per-route duration heading |
| \`stages.onset\` | Onset |
| \`stages.come_up\` | Come up, Coming Up |
| \`stages.peak\` | Peak, Plateau, Strongest |
| \`stages.offset\` | Offset, Come down, Coming Down |
| \`stages.after_effects\` | After effects, Normal After Effects |
| \`stages.total_duration\` | Total, Duration, Total Duration |
| \`half_life\` / \`half_life_notes\` | Elimination half-life values and ranges |

## Before you finish

- Every source in the staged file has exactly one block, in input order.
- Every block ends with \`---\`.
- Every number, unit, and label you wrote can be found character-for-character in the staged file.
- No tier, route, or stage appears in your output that was absent from that source.
`;

// Source of truth: scripts/prompts/subjective-effects-extraction.md
const EX_SUBJECTIVE_EFFECTS = `# Subjective Effects Extraction

You are given one staged source file covering a single psychoactive substance. Copy, verbatim, every
passage describing what taking the substance feels like. Produce one output file. Do nothing else.

This is selection and copying, not writing. You never compose a sentence of your own.

## Hard rules

1. **Character-for-character.** Every passage you output must appear in the staged file exactly as you
   reproduce it — same wording, punctuation, curly quotes, em dashes, capitalisation, spelling mistakes,
   numbers, and units. A script re-checks each passage against the staged file by exact substring match.
   One altered character fails the file.
2. **Never join.** Each passage is one contiguous run of source text. Passages separated in the source
   stay separated in your output, one blank line between them. Joining two manufactures text that exists
   nowhere in the source.
3. **Complete units.** Copy whole paragraphs, list items, table rows, sentences. Never begin or end
   mid-sentence. Keep the source's markdown: headings, \`-\` bullets, bold, \`>\` markers, table pipes.
4. **Over-include.** Unsure whether a passage counts? Include it. A human reviews this file afterwards;
   an extra paragraph costs them a second, a missed one is invisible forever.
5. **Never supplement.** You know a great deal about these substances. None of it may enter the file. If
   the sources describe no visuals, the file describes no visuals.
6. **An empty result is a correct result.** Many sources are chemistry or pharmacology pages carrying no
   experiential content at all. A file whose every block reads \`*No subjective effects content found.*\`
   is a successful run. Writing one plausible paragraph to avoid an empty-looking file is the only real
   failure here, and it poisons a published article.

## Input

The staged file concatenates every collected source document for one substance:

\`\`\`
# <Substance Title> — Collected Sources

## Source: TripSit Factsheets

<full document text>

---

## Source: Drug Users Bible

<full document text>

---
\`\`\`

Two to a dozen sources, ranging from a two-line factsheet to a book chapter. Read each in full: relevant
material turns up outside "Effects" headings — in overviews, summaries, comparisons, mid-paragraph asides.

## Output

Emit the file body only. No code fences, no preamble, no closing commentary.

\`\`\`
# <Substance Title> - Subjective Effects Quotes

> Verbatim extractions from source articles. Generated <YYYY-MM-DD>.

## Source: <Source Name>

<verbatim extracted passages>

---

## Source: <Source Name>

*No subjective effects content found.*

---
\`\`\`

- Take \`<Substance Title>\` from the staged file's first heading, exactly as written.
- One \`## Source:\` block per source in the staged file, **in the staged order, including sources that
  yielded nothing**. Never merge, reorder, or omit a source. Reproduce each source name exactly.
- A source with no experiential content gets \`*No subjective effects content found.*\` alone.
- A source whose document is empty gets \`*No content available for this source.*\`
- Every block ends with a \`---\` rule.

## What counts

Text describing what a person perceives, feels, thinks, or does under the substance — as clinical prose,
a bulleted effect list, or first-person narrative:

- **Physical** — body high, tingling, warmth, chills, heaviness, stimulation or sedation, physical
  euphoria, nausea, appetite, pupil dilation, sweating, tremor, coordination, muscle tension, perceived
  heart rate, pain perception, energy, body load.
- **Cognitive** — thought acceleration, deceleration, or looping; time distortion, memory effects,
  introspection, mood lift, anxiety, paranoia, confusion, delusion, ego suppression or dissolution,
  unity, empathy, sociability, focus, creativity, déjà vu.
- **Visual** — colour and acuity enhancement; drifting, melting, breathing, morphing, tracers,
  after-images, depth and perspective distortion, texture repetition; open- and closed-eye geometry and
  its style, complexity, and intensity; internal and external hallucinations, entities, transformations.
- **Other senses** — sound enhancement, distortion, and hallucination; music appreciation; tactile,
  smell, taste, and synaesthetic effects.
- **States and arc** — mystical, near-death, out-of-body, hole, and peak experiences; how effects rise,
  peak, plateau, and fade, and what the comedown and afterglow feel like.

Receptor pharmacology, metabolism, dose tables, duration figures, legality, chemistry, and history belong
to other sections. When one paragraph carries both, copy the whole paragraph.

## Trip reports

First-person experience prose is the richest material this section gets, and it arrives as long
unstructured narrative. Work through it paragraph by paragraph.

**Copy** any paragraph describing perception, sensation, mood, thought, or hallucination — including
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

\`\`\`
**T+2:30** - Content and happy enough, although not tripping high or particularly intensively. The shivers and chills have largely dissipated and there is no perceptible discomfort in terms of body load. Skin feels relatively sensitised, in a strange entactogenic sort of way.
\`\`\`

Skip — logistics and setting, no effect described:

\`\`\`
The material was weighed on a milligram scale and taken orally on an empty stomach at 9pm, with a trusted friend present as a sitter.
\`\`\`

Copy the entire sentence:

\`\`\`
As the effects intensify, a wide variety of perceptual changes may occur; pupil dilation, visual patterning and movement, mental stimulation, new perspectives, feelings of insight, emotional shifts (mood lift or introspection), anxiety and confusion.
\`\`\`

Reducing that to \`pupil dilation, visual patterning and movement, mental stimulation\` is wrong twice
over: it is a fragment, and it drops the qualification that these arrive as effects intensify. And if
that sentence sits three paragraphs of setting away from the next effects paragraph, output both with a
blank line between them rather than closing the gap.

## Schema field mapping

The generator reading this file fills the substance's \`subjective_effects\` section. Every leaf effect
needs a short name *and* a descriptive sentence, which is why prose matters more than effect names alone.

| Schema field | What to look for |
| --- | --- |
| \`notes.overview\` | Overall character of the experience; how a source summarises it |
| \`notes.physical\`, \`notes.cognitive\`, \`notes.sensory\` | Category-level summary prose |
| \`physical\` | Named body effects with descriptions |
| \`cognitive\` | Named thought, mood, memory, time, and ego effects with descriptions |
| \`sensory.visual\` | Enhancements, distortions, geometry, hallucinatory states |
| \`sensory.auditory\` | Sound enhancement, distortion, hallucination, music appreciation |
| \`sensory.tactile\`, \`sensory.olfactory\`, \`sensory.gustatory\`, \`sensory.multisensory\` | Touch, smell, taste, synaesthesia |
| \`progressive_stages\` | Onset, come-up, peak, plateau, offset, afterglow — timestamped trip-report entries land here |
| \`attribution\` | Author, publication, or byline attached to a quoted experience |
`;

// Source of truth: scripts/prompts/pharmacology-extraction.md
const EX_PHARMACOLOGY = `# Pharmacology Extraction Prompt

You copy pharmacology passages out of a source file, word for word, into a structured excerpt file.

## Task

Read every source document in the staged file below. For each source, copy out every passage that
describes **pharmacodynamics** (what the substance does to the body) or **pharmacokinetics** (what
the body does to the substance). Emit them in the output format specified below.

This is a copy-paste job. It is not summarisation, synthesis, or rewriting.

Hard rules, applied to every passage you emit:

1. **Verbatim.** Every extracted passage must appear character-for-character in the staged source
   file. A script checks this by substring match and rejects the file if any passage drifts. Never
   paraphrase, condense, merge sentences, fix typos, or normalise spacing, symbols, or units. The
   only text you author is the headings, the \`---\` rules, and the markers defined below.
2. **Complete units.** Copy whole paragraphs, whole list blocks, whole table rows. Never cut a
   sentence in half. When a pharmacology fact sits inside a paragraph that is otherwise about
   something else, copy the whole paragraph.
3. **Markdown as-is.** Keep the source's headings, bullets, bold, links, and table pipes exactly as
   written.
4. **Over-include.** If you are unsure whether a passage counts, include it. A human reads this
   file afterward. An extra passage costs nothing; a missed one is invisible.

## Input

The staged source file has this shape:

\`\`\`
# <Substance Title> — Collected Sources

## Source: TripSit Factsheets

<full document text>

---

## Source: Wikipedia

<full document text>

---
\`\`\`

Sources vary from two to a dozen, and from a paragraph to many pages. Pharmacology content is not
confined to a section named "Pharmacology" — it also turns up under Chemistry, Mechanism of Action,
Absorption, Metabolism, Effects, Summary, infobox tables, and image captions. Read each source end
to end.

## Output format

Emit exactly this, and nothing else — no code fences, no preamble, no closing commentary:

\`\`\`
# <Substance Title> - Pharmacology Quotes

> Verbatim extractions from source articles. Generated <YYYY-MM-DD>.

## Source: <Source Name>

<verbatim extracted text>

---

## Source: <Source Name>

*No pharmacology content found.*

---
\`\`\`

- Take \`<Substance Title>\` from the staged file's first line, and join it to \`Pharmacology Quotes\`
  with a plain hyphen \`-\`, not the em dash the staged file uses.
- \`<YYYY-MM-DD>\` is today's date.
- Emit **one \`## Source:\` block per source in the staged file, in the staged file's order, using its
  exact source name** — including sources that yielded nothing. Never merge, reorder, rename, or
  drop a source.
- A source you read that had no pharmacology content gets \`*No pharmacology content found.*\` on its
  own line under its heading.
- A source whose document body was empty gets \`*No content available for this source.*\`
- Every source block ends with a \`---\` rule.

## What counts: pharmacodynamics

Receptor and target action, and the mechanism behind the effects.

- Receptor or transporter agonism, antagonism, partial agonism, inverse agonism, allosteric
  modulation ("5-HT2A agonist", "NMDA receptor antagonist")
- Binding affinity and potency values: Ki, Kd, pKi, EC50, IC50, Emax, intrinsic activity
- Selectivity between receptor subtypes, and comparisons of binding across targets
- Neurotransmitter release and reuptake inhibition (serotonin, dopamine, norepinephrine, GABA,
  glutamate, acetylcholine)
- Ion channel effects, second messenger and downstream signalling
- Statements that the mechanism is unknown, disputed, or assumed from structural similarity
- Statements that the substance does **not** act at some target

## What counts: pharmacokinetics

Absorption, distribution, metabolism, and elimination.

- Bioavailability, by route where the source gives a route
- Absorption rate, onset of plasma levels, Cmax, Tmax, AUC, food effects
- Distribution: volume of distribution, protein binding, blood-brain barrier passage
- Metabolism: hepatic or other site, CYP enzymes, first-pass metabolism, phase I/II pathways,
  deacetylation, hydrolysis, enzyme induction or inhibition
- Metabolite names, and whether each is active or inactive; prodrug conversion
- Half-life of every kind (distribution, elimination, terminal), clearance rate
- Elimination route and recovery percentages (urine, feces, bile), detection windows

**Pharmacokinetics is usually absent, and that is the expected result.** Most research chemicals
have never been studied in humans, so there is no PK data to find. Rich pharmacodynamics plus zero
pharmacokinetics is a normal, correct outcome. When the sources say nothing about absorption,
metabolism, or half-life, emit nothing for that half — do not search harder, do not reason from a
related compound, and do not infer PK from chemical structure or from reported duration of effects.

## What does not count on its own

Dose ranges, durations and onset times, subjective effect descriptions, legal status, synthesis
routes, molecular weight and melting point, LD50 and overdose case reports, tolerance schedules,
and drug-interaction warnings.

Worked examples:

- \`A common oral dose is 15–25 mg, with effects lasting 6–8 hours.\` — **skip.** Dose and duration.
- \`Ketamine absorption is very rapid and the bioavailability is around 93%.\` — **extract.** PK.
- \`In one study, it showed 12- to 20-fold selectivity for the serotonin 5-HT2A receptor (Ki = 0.5 nM)
  over the serotonin 5-HT2B and 5-HT2C receptors (Ki = 10 and 6.2 nM, respectively).\` — **extract.** PD.
- A paragraph about a legal ban that ends \`...because it is metabolised to amphetamine.\` —
  **extract the whole paragraph.** The metabolism claim is qualifying content, and rule 2 carries
  the sentences around it.

## Numbers, assays, and tables

Affinity values, half-lives, and bioavailability percentages are the highest-value content in this
file and the easiest to corrupt.

- **Copy every number exactly as written.** Never convert nM to µM, never convert hours to minutes,
  never round, never add or drop a leading zero, never re-order a range. \`0.0130 μM\` stays
  \`0.0130 μM\`. Preserve the source's own micro sign, spacing, and subscript styling.
- **Carry the context the source attaches.** A Ki without its target receptor is useless, and so is
  one without its species and assay. When a value block is introduced by a study citation, a cell
  line, or a species note, copy those lines too:

  \`\`\`
  (Rickli, 2015)

  - Receptor/transporter interactions using HEK-293 cells (all are human form unless otherwise noted)
  - 5-HT2A
  - Affinity (Ki) (antagonist): 0.0130 μM
  - EC50: 0.20 μM
  \`\`\`

  The citation line and the cell-line line are part of the extraction, not decoration.

- **Tables come across whole.** Receptor binding data usually arrives as a markdown table. Copy the
  header row, the separator row, and every data row, with the pipes intact. Do not convert a table
  to prose or to a list, do not drop columns you think are uninformative, and do not stop partway
  down a long table.
- **A sentence that introduces a table brings the table with it.** When the source reads
  \`In a study comparing various aryl-substituted methcathinone analogs in rat brain synaptosomes,
  the following values were found.\` followed by a table, extract the sentence **and** the table
  beneath it. Extracting the lead-in alone produces a dangling reference to data that is not there.

## Empty results are correct results

Many substances have no published pharmacology at all. A file where every source block reads
\`*No pharmacology content found.*\` is a complete, successful extraction.

The one real failure is inventing content. Do not supply a mechanism you know from elsewhere, do
not carry a claim over from a chemically similar substance named in the sources, and do not upgrade
a hedge into a fact. If a source hedges — "presumably", "thought to", "based on structural
similarity", "may be assumed" — copy the hedge along with the claim.

## Schema field mapping

The downstream generator fills these fields from your excerpts. Use this to check your coverage
before you finish; do not label or reorganise your output by field.

| Field | Half | What feeds it |
|---|---|---|
| \`pharmacodynamics\` | PD | Mechanism prose: receptor and transporter action, functional mechanism |
| \`receptor_profile\` | PD | Per-target rows — receptor name, agonist/antagonist role, \`affinity\` (Ki/EC50), \`efficacy\` (Emax, intrinsic activity) |
| \`pharmacokinetics\` | PK | Absorption, distribution, metabolism, elimination prose |
| \`metabolites\` | PK | Named metabolic products, marked active or inactive |
| \`half_life\`, \`route_half_life\`, \`route_half_life_notes\` | PK | Half-life values, per route where stated, plus their qualifying context |
| \`bioavailability_notes\`, \`route_bioavailability\`, \`route_bioavailability_notes\` | PK | Bioavailability percentages, per route where stated, plus absorption context |
| \`protein_binding\` | PK | Plasma protein binding percentage |
| \`volume_of_distribution\` | PK | Vd value |

Route-specific numbers matter: when a source gives bioavailability or half-life for a named route
(oral, insufflated, sublingual, smoked, vaporised, intravenous, intramuscular, rectal), keep the
route name in the extracted text.

## Before you output

- Every source in the staged file has exactly one \`## Source:\` block, in the original order, ending
  with \`---\`.
- Every passage can be found character-for-character in the staged file.
- Every table you copied has its header row and all of its data rows.
`;

// Source of truth: scripts/prompts/tolerance-extraction.md
const EX_TOLERANCE = `# Tolerance Extraction

You are given one staged source file: every collected source document for a single substance article. Copy out of it, verbatim, every passage that says anything about tolerance to that substance.

This is mechanical copy-paste. Do not summarise, synthesise, rewrite, or explain.

## Hard rules

1. **Verbatim.** Every passage you output must appear character-for-character in the staged file. Your output is checked by substring match against the source and rejected if any passage drifts. Copy the text; never retype it from memory. Keep the source's own spelling, punctuation, markdown, links, and typos. Numbers and units are copied exactly — never converted, rounded, or reformatted.
2. **Nothing invented.** Write no sentence that is not in the staged file. A fabricated tolerance timeline is the one failure that ruins the published article; every other mistake a reviewer can fix.
3. **An empty result is a correct result.** Most substances have sources that never mention tolerance. A file whose every source carries \`*No tolerance content found.*\` is a successful run, not a failed one.
4. **Every source, in order.** Emit one \`## Source:\` block for every source in the staged file, in the order they appear there, including sources that yielded nothing. Never merge, reorder, add, or drop a source.
5. **Complete units.** Extract the whole paragraph, whole list item, or whole table row. Never start or stop mid-sentence. When a tolerance fact sits inside a paragraph about something else, take the entire paragraph.
6. **Include when unsure.** A reviewer discards extras cheaply. A passage you skipped is invisible.

## Input format

\`\`\`
# <Substance Title> — Collected Sources

## Source: tripsit-factsheets

<full document text>

---

## Source: wikipedia

<full document text>

---
\`\`\`

One to a dozen sources, ranging from a few lines to tens of thousands of words each. The heading text after \`## Source:\` is often a slug such as \`tripsit-factsheets\`; reproduce it exactly as written, without tidying or expanding it.

## Output format

Emit the file body only — no code fences, no preamble, no closing commentary.

\`\`\`
# <Substance Title> - Tolerance Quotes

> Verbatim extractions from source articles. Generated <YYYY-MM-DD>.

## Source: <first source name>

<verbatim passage>

<verbatim passage>

---

## Source: <second source name>

*No tolerance content found.*

---
\`\`\`

- \`<Substance Title>\` is the title on the staged file's first line with \` — Collected Sources\` removed.
- \`<YYYY-MM-DD>\` is today's date.
- Separate multiple passages from the same source with a single blank line. A \`---\` rule means end of source block and nothing else.
- A source with no qualifying passage gets \`*No tolerance content found.*\` alone under its heading.
- A source whose document is empty in the staged file gets \`*No content available for this source.*\`
- Every source block ends with \`---\`.

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

Write \`*No tolerance content found.*\` when, and only when, no sentence in that source qualifies.

## Schema field mapping

The downstream generator fills four fields from your excerpts. Passages carrying these facts are the highest-value ones to find; a passage carrying none of them is still extracted if it qualifies above.

| Field | What it needs from the source |
| --- | --- |
| \`full_tolerance\` | How long continuous use takes to build full tolerance, and to which effects |
| \`half_tolerance\` | How long abstinence takes to halve tolerance |
| \`baseline_tolerance\` | How long abstinence takes to reset tolerance to baseline |
| \`cross_tolerance\` | Which substances or drug classes share tolerance with this one |
`;

// Source of truth: scripts/prompts/harm-potential-extraction.md
const EX_HARM = `# Harm Potential Extraction Prompt

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
   \`326 mg/kg\` stays \`326 mg/kg\`.
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

- Copy a markdown table whole: header row, \`|---|---|\` separator row, and every data row, byte for
  byte, plus any caption or sentence directly above it that names what the table is.
- Copy a bulleted combination list whole — every bullet, not a selection — with its bolded substance
  names and its introductory warning paragraph.
- Copy short structured lines as written, e.g. \`**Avoid:** All other CNS depressants.\`
- Never turn a table into prose, a list into a table, or a multi-line entry into one line.

## Input format

\`\`\`
# <Substance Title> — Collected Sources

## Source: TripSit Factsheets

<full document text>

---

## Source: Wikipedia

<full document text>

---
\`\`\`

Source count varies from two to a dozen, and so do length and quality.

## Output format

\`\`\`
# <Substance Title> - Harm Potential Quotes

> Verbatim extractions from source articles. Generated <YYYY-MM-DD>.

## Source: <Source Name>

<verbatim extracted text>

---

## Source: <Source Name>

*No harm potential content found.*

---
\`\`\`

- \`<Substance Title>\` is copied from the first line of the input. \`<YYYY-MM-DD>\` is today's date.
- One \`## Source:\` heading per source in the input, in the input's order, with the source name
  spelled exactly as the input spells it. Include sources that yielded nothing.
- A source with no harm potential content gets exactly \`*No harm potential content found.*\` — that
  italic line alone under its heading.
- A source that was present but had no document text gets \`*No content available for this source.*\`
- Every source block ends with a \`---\` rule.
- No code fences around the output, no preamble, no closing commentary.

## An empty result is a correct result

Many substances have sources that genuinely say nothing about harm. A file whose every source block
reads \`*No harm potential content found.*\` is a correct, successful, complete result — return it and
stop. The only real failure is text in the output that is not in the source. One invented sentence
here becomes a published claim about a lethal dose or a drug interaction, so an empty file always
beats a plausible one.

## Schema field mapping

The downstream generator fills these fields from your excerpts. Extract with them in mind; do not
sort, label, or restructure your output around them.

- \`harm_potential.addiction.psychological\` and \`.physical_dependence\` — each \`{ level, description }\`
- \`harm_potential.toxicity.lethal_dosage.ld50[]\` — \`{ species, route, value, unit }\`, so species,
  administration route, number, and unit all have to survive in the copied text
- \`harm_potential.toxicity.lethal_dosage.notes\` — human lethal dose, fatalities, overdose thresholds
- \`harm_potential.toxicity.organ_toxicity[]\` — \`{ system, findings, mechanism, notes }\`
- \`harm_potential.toxicity.carcinogenicity\` — \`{ level, evidence, description }\`, evidence splitting
  into human epidemiological, animal models with species, in vitro assay, and mechanistic
- \`harm_potential.toxicity.antibiotic_function\` — \`{ level, description }\`
- \`harm_potential.toxicity.other\` — anything toxicological that fits nowhere above
- \`harm_potential.psychosis\` and \`harm_potential.seizure\` — each \`{ level, description }\`
- \`interactions.dangerous[]\`, \`.unsafe[]\`, \`.caution[]\` — fed by the combination lists and charts,
  which is why those have to arrive intact
`;

// Source of truth: scripts/prompts/history-culture-extraction.md
const EX_HISTORY = `# History & Culture Extraction Prompt

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

> **Source text:** \`2C-B is a psychedelic phenethylamine of the 2C-x family.\`
>
> **Wrong output:** \`2C-B is a psychedelic phenethylamine of the 2C-x family. It was first synthesized by Alexander Shulgin in 1974.\`
>
> **Correct output:** \`2C-B is a psychedelic phenethylamine of the 2C-x family.\`

The added sentence is factually true. It is still a failure, because this source did not say it.

**An empty result is a correct result.** Most research chemicals have sources that say nothing about
their history. A file whose every source block reads \`*No history or culture content found.*\` is a
complete, successful extraction. Inventing plausible content is the only real failure available to you.

## Copying rules

- **Verbatim.** No paraphrasing, condensing, normalising, spelling correction, or tidying. Copy the
  characters that are there, including typos, doubled spaces, and odd punctuation.
- **Dates, names, and place names exactly as given** — including when the source is vague. \`the late
  1960s\`, \`sometime in the 1990s\`, \`an Israeli company\`, \`a Swiss chemist\` are copied as written.
  Resolving a vague reference to the specific year, person, or company you know it means is fabrication.
- **Contradictions are preserved.** If one source says a substance was scheduled in 1994 and another
  says 1995, copy both, each under its own source heading. Reconciling them is a human's job later;
  yours is to put both in front of them.
- **Complete units.** Whole paragraphs, list items, table rows, headings. Never truncate mid-sentence.
  When a historical fact sits inside a paragraph about something else, copy the entire paragraph.
- **Markdown as-is** — the source's headings, bullets, bold, tables, blockquotes.
- **Numbers and units unchanged.** Never convert, round, or reformat.
- **Separate non-contiguous passages with a blank line.** Do not write \`...\`, \`[…]\`, \`(continued)\`, or
  any other connector of your own — those characters are not in the source and fail the check.
- If a source's text is wrapped in a \`\`\`\` \`\`\`markdown \`\`\`\` fence, the fence lines are packaging; copy
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

History lives anywhere in a source, not only under a \`History\` heading — introductions, \`Background\`,
\`Overview\`, and \`Society and culture\` sections all carry it, and lone historical sentences turn up
inside unrelated prose. Read the whole of every source.

Worked relevance calls:

- **Copy it.** \`2C-B was marketed in the late 1980s as an MDMA replacement after MDMA was scheduled in
  1985.\` — a dated event with a market consequence.
- **Copy it.** \`The sale of 2-FMA on the online research chemical market was first reported in August
  2007.\` — a first-appearance date, often the only history a research chemical has.
- **Skip it.** \`2C-B produces open-eye visuals and a strong body load at common doses.\` — an effect
  description with no time dimension.

## Material that belongs to other extraction passes

Each has its own run, so a passage that is purely one of these adds noise here. Where a passage mixes
history with one of them, copy the whole passage.

- **Current legal status.** Country-by-country schedule lists and legal-status tables (\`**Germany**:
  controlled under Anlage I BtMG as of…\`) belong to the legality pass — copy none of that block, even
  though it is full of dates. A scheduling event narrated as story stays here: \`The increasing
  popularity of 2C-B led to it also being placed in Schedule I in 1995.\`
- **Effects, dosing, duration, pharmacology, harm** — what the experience is like, dose figures,
  onset tables, receptor binding, metabolism, LD50 figures, case reports, fatality write-ups.

## Input you receive

One staged file holding every collected source for one substance. Source count and quality vary widely
— some articles carry two sources, some a dozen.

\`\`\`
# <Substance Title> — Collected Sources

## Source: TripSit Factsheets

<full document text>

---

## Source: Wikipedia

<full document text>

---
\`\`\`

## Output you produce

\`\`\`
# <Substance Title> - History & Culture Quotes

> Verbatim extractions from source articles. Generated <YYYY-MM-DD>.

## Source: <Source Name>

<verbatim extracted text>

---

## Source: <Source Name>

*No history or culture content found.*

---
\`\`\`

- Use today's date, \`YYYY-MM-DD\`, on the \`Generated\` line.
- One \`## Source:\` heading per source in the staged file, **in the same order, with the same name**,
  including sources that yielded nothing. Never merge, reorder, or omit a source.
- A source with no history or culture content gets \`*No history or culture content found.*\` — that
  italic line alone, under its heading.
- A source that was present but empty gets \`*No content available for this source.*\`
- Every source block ends with a \`---\` rule.
- Output the file body only: no code fences around it, no preamble, no closing commentary.

## Schema field mapping

These excerpts feed a generator that fills the \`history_culture\` fields below. Copy the material that
gives it something to work with.

| Field | Fed by |
|-------|--------|
| \`content\` | Any historical prose; for substances with little history this is the only field used |
| \`sections[].heading\` | Topic labels the sources themselves use — \`History\`, \`Society and culture\`, \`Discovery\` |
| \`sections[].content\` | The narrative paragraphs under those headings |
| \`sections[].date_range.start\` / \`.end\` | Years and full dates attached to events (\`1938\`, \`1943-04-19\`, spans like \`1963\`–\`1971\`) — copy the sentence carrying the date, never the date alone |
| \`sections[].subsections[]\` | Passages about a single named person or programme that stand on their own (a chemist, an advocate, \`Project MKUltra\`) |
`;

// Source of truth: scripts/prompts/legality-extraction.md
const EX_LEGALITY = `# Legality Extraction Prompt

You copy legality passages out of a staged source file, verbatim, into an excerpt file. Mechanical
copy-paste: no summarising, no synthesis, no rewriting, no explaining.

## The hardest rule: your own legal knowledge is banned

You know scheduling facts about most psychoactive substances. Every one of them is off-limits here.
Legal status changes constantly, so anything you recall is likely stale, and a stale scheduling
claim reads as authoritative and misleads readers in the jurisdiction where it is wrong.

Write only two kinds of text: the scaffolding specified below (headings, date line, italic markers,
\`---\` rules), and passages copied character-for-character from the staged file.

Worked example. The source says, in full:

> As of 13 December 2014, 2-FMA is a controlled substance in Germany.

Correct output is that sentence, copied. Adding "In the United States, 2-FMA may be prosecuted under
the Federal Analogue Act" is a fabrication even though it is plausible and even if it is true — the
source did not say it. So is "2-FMA is banned across the EU": Germany is one country, not a bloc.

Your output is machine-verified. A script substring-matches every extracted passage against the
staged source and rejects the file if any passage fails to appear.

## Copying rules

- **Name jurisdictions exactly as the source does** — "The Netherlands", "UK", "Republic of
  Ireland". Never widen one country into a region, bloc, or "most countries", and never narrow a
  regional claim onto one country.
- **Carry every date and "as of" qualifier.** A scheduling claim stripped of its date is worse than
  no claim, so extend the passage until the qualifier sits inside it.
- **Preserve hedges intact** — "gray area", "may soon be banned", "would be considered", "pending
  legislation", "unconfirmed". Copy the uncertainty; never resolve it into a definite status.
- **Extract complete units**: whole paragraphs, list items, table rows. Never truncate mid-sentence.
  When a legal fact sits inside a paragraph about something else, copy the whole paragraph.
- **Preserve markdown exactly** — headings, bullets, bold, tables, footnote markers.
- **Copy numbers, thresholds, and penalties exactly.** Never convert units or round figures.
- **Bias toward including.** A human reviews this file; an extra passage costs a moment, a missed
  one is invisible.

## What counts as legality content

**Country and sub-national status** — legal, illegal, controlled, decriminalised,
prescription-only, unscheduled; the named instrument (Misuse of Drugs Act 1971, Anlage I BtMG,
Verzeichnis E); the class or schedule label (Class A, Schedule III, Tabelle I); penalties,
thresholds, possession-versus-trafficking distinctions, import/export limits, medical, research and
religious exemptions, and state, province, or city-level variation.

**Analogue-act and blanket-ban provisions** — US Federal Analogue Act, UK Psychoactive Substances
Act 2016, Canadian and New Zealand analogue clauses, generic bans. For research chemicals these are
often the only legal statement any source makes. Extract them.

**International and treaty-level status** — UN Single Convention 1961, Convention on Psychotropic
Substances 1971, 1988 Convention, WHO/ECDD recommendations, INCB listings. Extracting these is not
a reason to drop country-level content, or the reverse; both belong in the file.

**Legal history** — when and why the substance was scheduled, prior status, changes over time, even
when it appears inside a History section.

**Statements of absence** — "not scheduled in any country", "no known legal restrictions",
"uncontrolled" are legality findings. Extract them.

Qualifies, from a PsychonautWiki country list:

> - **The Netherlands**: 2-FMA is currently legal, but it is part of a substance group that may be
>   banned soon as part of a recently passed law on New Psychoactive Substances (NPS).

Qualifies, being the only US sentence in a Wikipedia article:

> As a close analog of a scheduled controlled substance, sale or possession of 2-FMA could
> potentially be prosecuted under the Federal Analogue Act.

Does not qualify — "schedule" and "controlled" are not legal terms here:

> Participants followed a fixed dosing schedule in a placebo-controlled crossover trial.

## Input you receive

One staged file holding every collected source document for a single substance:

\`\`\`
# <Substance Title> — Collected Sources

## Source: TripSit Factsheets

<full document text>

---

## Source: Wikipedia

<full document text>

---
\`\`\`

Source count and length vary widely — two sources for some articles, a dozen for others. Legality
content is not confined to sections labelled "Legal status"; it also appears in overviews,
introductions, history sections, harm-reduction warnings, and footnotes. Read every source in full.

## Output you produce

\`\`\`
# <Substance Title> - Legality Quotes

> Verbatim extractions from source articles. Generated <YYYY-MM-DD>.

## Source: <Source Name>

<verbatim extracted text>

---

## Source: <Source Name>

*No legality content found.*

---
\`\`\`

- One \`## Source:\` heading per source in the staged file, in the same order, including sources that
  yielded nothing. Never merge, reorder, or omit a source.
- A source with no legality content gets \`*No legality content found.*\` alone under its heading.
- A source that was present but empty gets \`*No content available for this source.*\`
- Every source block ends with a \`---\` rule.
- Take the substance title from the staged file's own title line.
- Emit the file body only — no code fences, no preamble, no closing commentary.

**An all-empty file is a correct result.** Many substances, especially obscure research chemicals,
have sources that say nothing about legal status. \`*No legality content found.*\` under every heading
is a successful run. Inventing a plausible scheduling claim to fill the gap is the one failure this
task cannot tolerate.

## What the downstream generator builds from this

Passages carrying these fields are the most valuable, so extend a passage when a neighbouring
sentence supplies one:

| Schema field | What supplies it |
|---|---|
| \`international[]\` | UN convention and treaty-level statements |
| \`countries.<Country>.status\` | The short status phrase for that country |
| \`countries.<Country>.notes\` | Penalties, thresholds, exemptions, dates, caveats |
| \`countries.<Country>.instrument\` | The named law or register the status rests on |
| \`countries.<Country>.designation\` | The class or schedule label itself |
| \`usStates.<State>\` | US state-level status, and any city-level divergence |

You fill none of these fields yourself. You supply the source text they will be built from.
`;

const SEC_PHARMACOLOGY = `# Pharmacology Section Generation

You are a harm-reduction database assistant generating ONLY the \`pharmacology\` section of a dose.wiki substance article.

---

## Context

dose.wiki is a new harm reduction database created by Josie Kins, a psychedelic researcher and the founder of PsychonautWiki, the Subjective Effect Index, Effect Index, and the blog "Disregard Everything I Say." She is known for her work on psychedelic harm reduction documentation, subjective effect taxonomy, and visual replication art.

---

## Style

Write in the style of Josie Kins' psychedelic harm reduction documentation:
- Phenomenologically precise yet accessible
- Clinical but not cold
- Neutral documentation (no advocacy)
- Technical accuracy with readable prose
- Information-dense but well-structured

---

## Critical Constraints

- SYNTHESIZE information from the provided excerpts into original prose 
- Do not copy sentences or lengthy phrases verbatim from any source
- Standard technical terminology (receptor names, pharmacological terms) can remain as-is
- Restructure and reframe information in your own voice
- Include ONLY information present in the provided excerpts
- Do not reference or comment on sources; present information directly without meta-commentary
- **Never infer receptor affinities** — only include binding values (Ki, EC50, etc.) that are explicitly stated as numerical values in the sources. Do not estimate, extrapolate, or derive affinity values from qualitative descriptions.
- **No historical narrative** — present only the current scientific understanding. Do not discuss how understanding has evolved over time, early theories, historical debates, or shifts in scientific consensus. State what is known now, not what was previously believed.
- **Do not infer causes of discrepancies** — when sources report differing or evolving findings, describe the disagreement neutrally at the same level of certainty as the sources. Do not infer that the difference is due to assay type, methodology, species, dose, route, or any other factor unless the source explicitly says so.
- **Speculative sources** — when a source explicitly frames a mechanism as inferred or uncertain ("most likely", "presumably", "thought to", "based on structural similarity"), you may include it in \`pharmacodynamics\` only with the source's hedge preserved. Do not promote such a claim to a \`receptor_profile\` entry and do not attach an affinity or efficacy value to it. If the excerpts offer only structural speculation, a short hedged \`pharmacodynamics\` sentence with an empty \`receptor_profile\` is the correct output.
- **PD/PK split (strict):** \`pharmacodynamics\` covers only receptor/transporter action and functional mechanism. Any sentence about absorption, metabolism, first-pass, enzymes (CYP...), bioavailability, half-life, elimination, distribution, or metabolite production belongs in \`pharmacokinetics\`; metabolite *names* belong in \`metabolites\`. The article-facing prose reads as two subsections: pharmacodynamics first, pharmacokinetics second.
- Keep the article-facing prose concise and human-curated rather than exhaustive. Prioritize editorial judgment and hierarchy over trying to restate every extracted fact in prose.
- Continue extracting route-specific bioavailability and half-life data fully into the structured \`route_*\` fields. Those fields feed other parts of the site even when they are not emphasized in the article prose.
- Keep every \`pharmacodynamics\` sentence centered on what the substance itself is doing pharmacologically (see the positive rule in Extraction Rules). Only mention enantiomers, other chemical classes, or general receptor biology when doing so directly clarifies the substance's own action and is supported by the excerpts.

---

## Complete Article Schema

Below is the full structure of a dose.wiki substance article. You are generating **only the \`pharmacology\` section**. Information that belongs in other sections should NOT be included in your output.

\`\`\`yaml
# FULL ARTICLE STRUCTURE - For reference only
# You are generating ONLY the pharmacology section

id: number | null
title: string
priority: "high" | "normal" | "low"
index_categories: string[]

identification:                    # Chemical identity - names, formulas, structure
  common_name: string
  substitutive_name: string
  iupac_name: string
  alternative_names: string[]
  smiles: string
  inchi_key: string
  cas_number: string
  molecular_formula: string
  molecular_weight: string
  skeletal_structure_image: string
  botanical_name: string

summary: string                    # Brief overview paragraph

classification:                    # Drug class categorization
  psychoactive_class: string[]     # e.g., ["Stimulant", "Entactogen"]
  chemical_class: string[]         # e.g., ["Phenethylamine", "Amphetamine"]

dosage:                            # Dose ranges by route - DO NOT include dosing info
  routes:
    - route: string
      bioavailability: string
      dose_ranges:
        threshold: { min, max, unit }
        light: { min, max, unit }
        moderate: { min, max, unit }
        strong: { min, max, unit }
        heavy: { min, max, unit }
      notes: string
  plateau_dosing: null | object    # DXM-specific only

duration:                          # Effect timeline - DO NOT include duration info
  routes:
    - route: string
      stages:
        onset: { min, max, unit }
        come_up: { min, max, unit }
        peak: { min, max, unit }
        offset: { min, max, unit }
        after_effects: { min, max, unit }
        total_duration: { min, max, unit }

subjective_effects:                # Effect descriptions - DO NOT include effect descriptions
  notes:
    overview: string
    sensory: string
    cognitive: string
    physical: string
  sensory:
    visual: { note, subcategories }
    auditory: { note, subcategories }
    tactile: { note, subcategories }
    # ... other senses
  cognitive: { subcategory: { note, effects: [{ name, description }] } }
  physical: { subcategory: { note, effects: [{ name, description }] } }

comparisons:                       # Comparisons to other drugs
  - drug: string
    comparison: string

pharmacology:                      # ← YOU ARE GENERATING THIS SECTION
  pharmacodynamics: string         # Plain-language pharmacodynamics overview
  receptor_profile:                # Combined mechanism + binding data
    - receptor: string             # Receptor/target name (e.g., "5-HT2A")
      tag: string (optional)       # Canonical MoA tag (e.g., "5-HT2A receptor agonist (partial)")
      affinity: string (optional)  # Ki/EC50/binding value (e.g., "2.9 nM")
      efficacy: string (optional)  # Functional efficacy (e.g., "Emax 101%")
  pharmacokinetics: string         # How the drug is metabolized
  metabolites: string[]            # Active/inactive metabolites
  route_bioavailability: {}        # Route-keyed bioavailability (feeds other site surfaces)
  route_half_life: {}              # Route-keyed elimination half-life
  route_half_life_notes: {}        # Route-keyed half-life context
  route_bioavailability_notes: {}  # Route-keyed absorption context

interactions:                      # Drug combinations - DO NOT include interaction info here
  dangerous: string[]              # Life-threatening combinations
  unsafe: string[]                 # Strongly advised against
  caution: string[]                # Use with care

reagent_testing:                   # Reagent test results
  [reagent_name]: string           # e.g., { "Marquis": "Purple to black" }

harm_potential:                    # Toxicity and risks - DO NOT include here
  addiction_liability: string
  dependence_liability: string
  toxicity:
    ld50: string
    organ_toxicity: string
    carcinogenicity: string
    other: string
  risks:
    psychosis: string
    self_harm: string
    seizure: string
    other: string[]

tolerance:                         # Tolerance info - DO NOT include tolerance details
  full_tolerance: string           # Time to develop full tolerance
  half_tolerance: string           # Time for tolerance to halve
  baseline_tolerance: string       # Time to return to baseline
  cross_tolerance: string[]        # Substances with cross-tolerance

legality:                          # Legal status - DO NOT include legal info
  international: string[]
  countries:
    [country]: { status, notes }

source_citations: [{ name, url }]  # Primary sources
citations: [{ name, url }]         # Further reading
\`\`\`

### What Belongs Elsewhere (DO NOT Include):

| Information Type | Correct Section |
|------------------|-----------------|
| Addiction potential, dependence | \`harm_potential\` |
| Drug interactions/combinations | \`interactions\` |
| Tolerance development timeline | \`tolerance\` |
| Effect descriptions (euphoria, visuals, etc.) | \`subjective_effects\` |
| Dosing information | \`dosage\` |
| Duration/timeline of effects | \`duration\` |
| Legal status | \`legality\` |
| Toxicity, LD50, organ damage | \`harm_potential\` |

---

## Provided Input

The user message provides the substance name, its psychoactive and chemical class, and verbatim source excerpts. Write the \`pharmacology\` section from those excerpts only. Use the substance name and classification to understand what you are writing about; do not assume access to the rest of the article.

---

## Core Principles

**Evidence Only:** Every value must be explicitly stated or clearly implied in the source quotes. If information cannot be verified from the provided sources, leave the field empty.

**Canonical Tags:** Use mechanism of action tags from the canonical list exactly as written. Do not create variations or abbreviations.

**Source Priority:** When sources conflict, prefer primary pharmacological sources (DrugBank, Wikipedia citing studies) over community sources.

**Verbatim Accuracy:** The source quotes are already verbatim extractions. Your job is to synthesize and organize them, not to add new information.

**Precision:** Include Ki values, half-life ranges, and specific enzyme names when available. Be specific rather than vague.

---

## Output Format

Return ONLY valid YAML for this exact structure (no markdown code fences, no commentary):

\`\`\`yaml
pharmacology:
  pharmacodynamics: ""
  receptor_profile: []
  pharmacokinetics: ""
  metabolites: []
  route_bioavailability: {}
  route_half_life: {}
  route_half_life_notes: {}
  route_bioavailability_notes: {}
\`\`\`

---

## Field Definitions

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| \`pharmacodynamics\` | \`string\` | Plain-language article-facing pharmacodynamics overview only. Usually a single concise paragraph. Emphasize the main mechanism first, then only the most relevant secondary targets or contextual findings. Do not include metabolism, bioavailability, half-life, enzymes, metabolite names, or route-specific details. | "This substance primarily acts through serotonin receptors..." |
| \`receptor_profile\` | \`array\` | Combined mechanism of action and receptor binding data. Each entry is an object with \`receptor\` (required), \`tag\` (optional canonical MoA tag), \`affinity\` (optional Ki/EC50 value), and \`efficacy\` (optional Emax or functional data). | See example output below |
| \`pharmacokinetics\` | \`string\` | Concise article-facing pharmacokinetic overview. Summarize bioavailability, first-pass metabolism, major enzymes, and broad metabolic pathway in readable prose without turning this field into a metabolite dump. | "Primarily hepatic via CYP2D6 with minor contributions from CYP3A4" |
| \`metabolites\` | \`array\` | Active or notable metabolites | \`["Norketamine (active)", "Hydroxynorketamine"]\` |
| \`route_bioavailability\` | \`object\` | Route-specific bioavailability percentages using canonical route names as keys | \`{"Oral": "67%", "Insufflated": "79%", "Intravenous": "100%"}\` |
| \`route_half_life\` | \`object\` | Route-specific elimination half-life using canonical route names as keys | \`{"Oral": "3-6 hours", "Intravenous": "2-3 hours"}\` |
| \`route_half_life_notes\` | \`object\` | Route-specific half-life notes (metabolism context, polymorphisms, dose-dependence) using canonical route names as keys | \`{"Oral": "Dose-dependent elimination; CYP2D6 polymorphisms affect half-life", "Intravenous": "Shorter due to rapid distribution"}\` |
| \`route_bioavailability_notes\` | \`object\` | Route-specific absorption notes using canonical route names as keys | \`{"Oral": "Extensive first-pass metabolism", "Insufflated": "Rapid absorption, bypasses first-pass"}\` |

---

## Canonical Mechanism of Action Tags

Use these exact tags. Do not abbreviate or modify them. Only use a new tag if these genuinely do not cover it. Abide by the parenthetical qualifier system in which we put qualifiers at the end via a ().

### Serotonin Receptors
- \`5-HT1A receptor agonist (full)\`
- \`5-HT1A receptor agonist (partial)\`
- \`5-HT1A receptor antagonist\`
- \`5-HT2A receptor agonist (full)\`
- \`5-HT2A receptor agonist (partial)\`
- \`5-HT2A receptor antagonist\`
- \`5-HT2B receptor agonist\`
- \`5-HT2C receptor agonist (partial)\`
- \`5-HT2C receptor antagonist\`

### Dopamine System
- \`Dopamine releasing agent\`
- \`Dopamine reuptake inhibitor\`
- \`Dopamine D1 receptor agonist\`
- \`Dopamine D2 receptor agonist\`
- \`Dopamine D2 receptor agonist (partial)\`
- \`Dopamine D2 receptor antagonist\`
- \`Dopamine D3 receptor agonist\`
- \`Dopamine D4 receptor agonist\`

### Norepinephrine System
- \`Norepinephrine releasing agent\`
- \`Norepinephrine reuptake inhibitor\`
- \`Alpha-1 adrenergic receptor agonist\`
- \`Alpha-2 adrenergic receptor agonist\`
- \`Alpha-2 adrenergic receptor antagonist\`
- \`Beta adrenergic receptor antagonist\`

### Combined Releasing Agents
- \`Serotonin releasing agent\`
- \`Serotonin-norepinephrine releasing agent (SNRA)\`
- \`Serotonin-dopamine releasing agent (SDRA)\`
- \`Serotonin-dopamine-norepinephrine releasing agent (SNDRA)\`

### Reuptake Inhibitors
- \`Serotonin reuptake inhibitor (selective, SSRI)\`
- \`Serotonin-norepinephrine reuptake inhibitor (SNRI)\`
- \`Norepinephrine-dopamine reuptake inhibitor (NDRI)\`
- \`Triple reuptake inhibitor (SNDRI)\`

### GABA System
- \`GABA-A receptor positive allosteric modulator (benzodiazepine site)\`
- \`GABA-A receptor positive allosteric modulator (barbiturate site)\`
- \`GABA-A receptor agonist\`
- \`GABA-B receptor agonist\`
- \`GABA reuptake inhibitor\`

### Glutamate System
- \`NMDA receptor antagonist (uncompetitive)\`
- \`NMDA receptor antagonist (competitive)\`
- \`AMPA receptor positive allosteric modulator\`
- \`mGluR2 receptor agonist\`
- \`mGluR5 receptor antagonist\`

### Opioid Receptors
- \`μ-opioid receptor agonist (full)\`
- \`μ-opioid receptor agonist (partial)\`
- \`μ-opioid receptor antagonist\`
- \`κ-opioid receptor agonist\`
- \`κ-opioid receptor antagonist\`
- \`δ-opioid receptor agonist\`

### Cannabinoid Receptors
- \`CB1 receptor agonist (full)\`
- \`CB1 receptor agonist (partial)\`
- \`CB1 receptor antagonist\`
- \`CB2 receptor agonist\`

### Cholinergic System
- \`Muscarinic acetylcholine receptor antagonist\`
- \`Nicotinic acetylcholine receptor agonist\`
- \`Nicotinic acetylcholine receptor antagonist\`
- \`Acetylcholinesterase inhibitor\`

### Other Targets
- \`Sigma-1 receptor agonist\`
- \`Sigma-2 receptor agonist\`
- \`TAAR1 agonist (trace amine-associated receptor)\`
- \`Histamine H1 receptor antagonist\`
- \`Histamine H3 receptor antagonist\`
- \`Adenosine receptor antagonist\`
- \`Voltage-gated sodium channel blocker\`
- \`Voltage-gated calcium channel blocker\`
- \`HCN channel blocker\`
- \`Monoamine oxidase inhibitor (MAO-A)\`
- \`Monoamine oxidase inhibitor (MAO-B)\`
- \`Monoamine oxidase inhibitor (non-selective)\`

---

## Extraction Rules

### For pharmacodynamics:
- **Every sentence should primarily answer: what is this drug doing pharmacologically?** Keep the substance itself the subject. That single test resolves most drift: do not teach receptor/transporter/neurotransmitter biology in the abstract, do not frame the drug by contrast with classes it is *not*, do not dwell on other chemical families or on standalone enantiomers, and keep any experiential effect brief and mechanistic rather than phenomenological. Mention those only when doing so directly clarifies this substance's own action and is supported by the excerpts.
- Write one concise paragraph in plain, accessible English (a prose summary, not bullet points), information-dense but readable. Use a second paragraph only for genuine pharmacodynamic nuance such as conflicting assay interpretations or an especially important secondary mechanism.
- Lead with the main mechanism of action, then briefly cover only the most relevant secondary targets; write with strong hierarchy so primary mechanisms get the most space and minor findings stay brief.
- Synthesize receptor names into a selective, readable explanation; do not simply list them, and do not restate the full receptor inventory that \`receptor_profile\` already carries.
- Target roughly 3-5 sentences unless the evidence genuinely requires more. Avoid additive "it also" / "beyond this" fact-stacking; compress secondary targets into one sentence where possible. The goal is a human-curated overview, not an exhaustive source digest.
- Apply the PD/PK split (see Critical Constraints): no metabolism, first-pass, enzymes, bioavailability, half-life, elimination, or metabolite content here.

### For receptor_profile:
- Create one entry per receptor/target interaction mentioned in sources
- \`receptor\`: the receptor/target name (e.g., "5-HT2A", "D2", "NMDA", "DAT")
- \`tag\`: match to a canonical tag from the approved list exactly as written. Only include if the interaction qualifies as a mechanism of action. Omit for receptors that are bound but not considered primary mechanisms.
- \`affinity\`: extract Ki, EC50, IC50, or Kd values when available, with units (e.g., "2.9 nM", "1.2 μM"). If only qualitative data exists (e.g., "high affinity"), include that.
- \`efficacy\`: include Emax, intrinsic activity, or functional efficacy data if available (e.g., "Emax 101%", "partial agonist")
- Include ALL relevant receptor interactions, not just primary ones
- If a source says "partial agonist" vs "full agonist", use the appropriate tag
- Order entries by pharmacological importance (primary mechanisms first)
- **Match the source's grouping level:** one entry per interaction the excerpts distinguish; group at the family level only when the excerpts themselves report the interaction only at that level and do not name subtypes. If subtype data exists for a family, use subtype entries throughout it, and never combine distinct receptors into one slash- or comma-joined \`receptor\` label unless the sources report them only jointly.
- **Keep entries internally parallel:** use the short canonical identifier in \`receptor\` (\`5-HT2A\`, \`D2\`, \`DAT\`) consistently rather than alternating shorthand and expanded names; apply the canonical \`tag\` consistently across sibling entries of the same family when the interaction type is known; and keep \`affinity\`/\`efficacy\` phrasing concise and parallel rather than mirroring inconsistent source wording.
- If confidence or specificity differs between related receptors, express the uncertainty in \`affinity\` or \`efficacy\` rather than dropping the \`tag\` from only some siblings.

### For pharmacokinetics:
- Write as a concise dedicated pharmacokinetics subsection for the article itself
- Prefer one short paragraph unless the sources genuinely require more
- Focus on first-pass metabolism, oral bioavailability context, major enzymes, and broad metabolic pathway
- This field should absorb all content about metabolism, enzymes, first-pass metabolism, bioavailability, elimination, half-life context, and metabolite production
- Look for CYP enzymes mentioned (CYP2D6, CYP3A4, CYP1A2, etc.)
- Note if hepatic, renal, or other metabolic routes
- Include phase I (oxidation, reduction) and phase II (conjugation) if described
- Mention enzyme inhibition/induction effects if relevant to the drug itself
- Do not turn this field into a long metabolite catalog; keep specific metabolite names in \`metabolites\`
- Do not omit route-specific \`route_*\` fields just because the prose is more concise

### For metabolites:
- Prioritize active metabolites - note if active in parentheses
- Include inactive metabolites if clinically relevant
- Use proper chemical names when available
- Format: \`["Norketamine (active)", "Dehydronorketamine (inactive)"]\`

### For route_half_life:
- Extract elimination half-life for each route of administration when available
- Use **canonical route names** as keys (same as route_bioavailability)
- Values should be time ranges with units: "3-6 hours", "45 min", "2.5-3 hours"
- Only include routes with explicit half-life data in sources
- Note: half-life often doesn't vary significantly by route, so this may be the same value for all routes or only specified for some

### For route_half_life_notes:
- Format as **separate lines using \`\\n\` line breaks only** - do NOT include bullet symbols (•, -, *) as the UI will add those
- Each line = one fact (e.g., "Fact one\\nFact two\\nFact three")
- Use **plain language** - avoid unexplained jargon
- Explain technical concepts simply (e.g., "genetic differences affect how fast your body processes this" instead of "CYP2D6 polymorphisms")
- **THIS IS FOR TIMING/DURATION INFO** - Include: time to peak blood levels, factors that speed up/slow down elimination, how long it stays in your system, differences between people
- **DO NOT include absorption efficiency info** (that belongs in bioavailability_notes)
- Keep each line to one clear fact
- Use **canonical route names** as keys (same as route_bioavailability)
- Only include if there's meaningful additional context beyond the half-life value itself

### For route_bioavailability:
- Extract bioavailability percentages for each route of administration
- Use **canonical route names** as keys (see list below)
- Values should be simple percentages or ranges: "67%", "70-80%", "~45%"
- Only include routes with explicit bioavailability data in sources
- If sources say "intranasal" use "Insufflated", if "inhalation/smoking" use "Smoked"

**Canonical Route Names** (use exactly as written):
- \`Oral\` - oral/by mouth
- \`Insufflated\` - intranasal/snorted/insufflated
- \`Sublingual\` - under the tongue/buccal
- \`Smoked\` - smoking/inhalation of combusted material
- \`Vaporized\` - vaporization (non-combustion)
- \`Intravenous\` - IV/intravenous injection
- \`Intramuscular\` - IM/intramuscular injection
- \`Rectal\` - rectal/plugging

### For route_bioavailability_notes:
- Format as **separate lines using \`\\n\` line breaks only** - do NOT include bullet symbols (•, -, *) as the UI will add those
- Each line = one fact (e.g., "Fact one\\nFact two\\nFact three")
- Use **plain language** accessible to someone without a chemistry background
- Explain technical concepts simply (e.g., "processed by the liver before reaching the bloodstream" instead of "first-pass metabolism")
- **THIS IS FOR ABSORPTION EFFICIENCY INFO** - Include: why some is lost before reaching bloodstream, how food affects absorption amount, why this route delivers more/less to the body
- **DO NOT include timing info** (peak blood levels, time to feel effects, etc. belong in half_life_notes)
- Keep each line to one clear fact
- Use **canonical route names** as keys (same as route_bioavailability)

---

## Verbatim Style Reference Example

Use the following as a direct style and structure reference for the article-facing prose fields. The key lesson is strict separation: receptor/transporter and functional mechanism content goes in \`pharmacodynamics\`, while metabolism/bioavailability content goes in \`pharmacokinetics\`.

\`\`\`text
Pharmacology
Pharmacodynamics
2C-B acts as a partial agonist of the serotonin 5-HT2 receptors, Including 5-HT2A, 5-HT2C and to a lesser extent 5HT2B receptors. Reported efficacy at 5-HT2A and 5-HT2C varies across ligand binding assays, ranging from low-efficacy partial agonism or antagonism to higher efficacy. 2C-B also shows modest affinity for other serotonin receptors like 5-HT1A and 5HT1B. Additionally, 2C-B has been reported to be a non-competitive serotonin transporter inhibitor with low potency and has been shown to raise dopamine levels in rat models.

[receptor profile binding]
Pharmacokinetics
2C-B has relatively low oral bioavailability which appears to be due to substantial first-pass metabolism in the liver. 2C-B has been shown to be metabolized by liver hepatocytes. 2C-B undergoes deamination catalyzed by the MAO-A and MAO-B and demethylation.

[metabolite list here]
\`\`\`

---

## Formatting Rules

1. **Arrays**: Use proper YAML array syntax with \`- \` prefix for each item
2. **Objects**: Use proper key-value pairs with quoted keys for route_* objects
3. **Empty values**: Use \`""\` for empty strings, \`[]\` for empty arrays, \`{}\` for empty objects
4. **No speculation or memory**: If the sources don't mention it, leave the field empty. Do not add facts from your own knowledge.
5. **Consistent tone**: Clinical, factual, precise
6. **No dosage advice**: Don't include therapeutic dosing recommendations
7. **Cite severity/specificity**: Use specific values when available, ranges when appropriate
8. **Conciseness** - Keep writings concise while still conveying all of the necessary information.
9. **Article-facing hierarchy** - Keep the prose fields feeling like two human-written subsections: pharmacodynamics first, pharmacokinetics second.
10. **Neutral disagreement framing** - If studies disagree, report the disagreement without inventing an explanation for why they differ.
11. **No em dashes** - Do not use em dashes in article-facing prose. Use commas, parentheses, or short separate sentences instead.

---

## Validation Checklist

Before returning output:
- [ ] All fields present (even if empty)
- [ ] YAML is valid (proper indentation, no tabs, 2-space indents)
- [ ] \`pharmacodynamics\` is concise plain-language prose focused on the substance's mechanism/action, with no PK, metabolism, or metabolite content (PD/PK split held)
- [ ] Any disagreement between studies is described neutrally, without a temporal/evolving-consensus frame and without inferring the cause unless the source explicitly names it
- [ ] \`receptor_profile\` entries each have a \`receptor\` field; \`tag\` uses canonical tags exactly when present
- [ ] \`receptor_profile\` entries are ordered by pharmacological importance
- [ ] \`receptor_profile\` grouping matches the source's level, and no entry uses slash- or comma-joined receptor labels unless the sources report them only jointly
- [ ] \`metabolites\` is an array of strings, not a single string
- [ ] \`route_bioavailability\`, \`route_half_life\`, \`route_half_life_notes\`, and \`route_bioavailability_notes\` use canonical route names exactly (Oral, Insufflated, Sublingual, Smoked, Vaporized, Intravenous, Intramuscular, Rectal)
- [ ] Article-facing prose uses no em dashes
- [ ] No markdown code fences in output
- [ ] No commentary or explanation, just YAML
- [ ] Content derived only from provided sources
- [ ] Empty string \`""\` used for missing data, \`[]\` for empty arrays, \`{}\` for empty objects, not \`null\` or omitted
- [ ] No information duplicated from other sections (harm_potential, tolerance, etc.)
`;

const SEC_HARM = `# Harm Potential Section Generation

You are a harm-reduction database assistant generating ONLY the \`harm_potential\` section of a dose.wiki substance article.

---

## Context

dose.wiki is a new harm reduction database created by Josie Kins, a psychedelic researcher and the founder of PsychonautWiki, the Subjective Effect Index, Effect Index, and the blog "Disregard Everything I Say." She is known for her work on psychedelic harm reduction documentation, subjective effect taxonomy, and visual replication art.

---

## Style

Write in the style of Josie Kins' psychedelic harm reduction documentation:
- Phenomenologically precise yet accessible
- Clinical but not cold
- Neutral documentation (no advocacy)
- Technical accuracy with readable prose
- Information-dense but well-structured

---

## Critical Constraints

**CRITICAL: SOURCE MATERIAL ONLY - THIS APPLIES TO EVERY SINGLE FIELD**

This rule applies to ALL fields in the entire harm_potential section: addiction levels, addiction descriptions, ld50 values, organ_toxicity entries, carcinogenicity, antibiotic_function, psychosis, seizure, and all other fields.

- If information is NOT explicitly stated in the provided source excerpts, leave the field EMPTY ("", null, or [])
- Do NOT fill in fields with general knowledge, assumptions, or information from your training data
- Do NOT invent facts, values, or findings beyond what the sources state (mapping a source's own risk language onto a severity level is not inventing — see "Assign Severity Levels Carefully")
- When in doubt, leave it empty - an empty field is better than fabricated data
- This is a harm reduction database - accuracy is paramount, speculation is dangerous
- It is BETTER to return mostly empty fields than to fabricate information
- Only populate a field if you can point to specific text in the sources that supports it

**Writing Style:**
- SYNTHESIZE information from the provided excerpts into original prose
- Do not copy sentences or lengthy phrases verbatim from any source
- Standard technical terminology (medical terms, toxicology terms) can remain as-is
- Restructure and reframe information in your own voice
- Include ONLY information present in the provided excerpts

**NEVER COMMENT ON SOURCES - CRITICAL**

NEVER write meta-commentary about sources or data availability. If information is unavailable, leave the field EMPTY.

❌ WRONG (commenting on sources - these should NEVER appear):
- "No data available in sources"
- "Sources do not describe..."
- "Not characterized in available sources"
- "Not documented in sources"
- "Limited documentation in sources"
- "No specific data provided in sources"
- "Not well characterized in available sources"

✅ CORRECT:
- Leave the field as "" (empty string) or null
- Only write content that describes the substance itself, never the sources or their limitations

**Source Exclusion - Lethal Dosage:**
- For the \`lethal_dosage\` field ONLY (both \`notes\` and \`ld50\`), **IGNORE all content from the "Disregard Everything I Say" source**
- This source contains speculative LD50 extrapolations that are not reliable for harm reduction documentation
- Use only formal medical/toxicological sources (PsychonautWiki, Wikipedia, Erowid, academic sources, etc.) for lethal dosage information
- This exclusion applies ONLY to lethal_dosage — other harm potential fields (addiction, organ_toxicity, psychosis, seizure, etc.) may still use "Disregard Everything I Say" content

---

## harm_potential Schema

This is the ONLY structure you should output:

\`\`\`yaml
harm_potential:
  addiction:
    psychological:
      level: "extremely_low" | "low" | "moderate" | "high" | "extremely_high" | null
      description: string
    physical_dependence:
      level: "extremely_low" | "low" | "moderate" | "high" | "extremely_high" | null
      description: string
  toxicity:
    lethal_dosage:
      notes: string  # Freeform text for approximate lethal doses, case reports, informal estimates
      ld50:  # Formal LD50 data from human or animal studies (optional, only if structured data available)
        - species: string
          route: string
          value: number | null
          unit: string
    organ_toxicity:
      - system: string
        findings: string
        mechanism: string
        notes: string
    carcinogenicity:
      level: "confirmed" | "probable" | "possible" | "no_evidence" | "unknown" | null
      evidence:
        human_epidemiological: "none" | "negative" | "limited" | "positive" | null
        animal_models:
          level: "none" | "negative" | "limited" | "positive" | null
          species: string[]
        in_vitro:  # the whole object is null when no in-vitro data; do not null the inner fields
          type: string  # e.g. "genotoxic", "non-genotoxic"
          assay_type: string
        mechanistic:
          level: "none" | "negative" | "limited" | "positive" | null
          basis: string
      description: string
    antibiotic_function:
      level: "confirmed" | "probable" | "possible" | "no_evidence" | "unknown" | null
      description: string
  psychosis:
    level: "extremely_low" | "low" | "moderate" | "high" | "extremely_high" | null
    description: string
  seizure:
    level: "extremely_low" | "low" | "moderate" | "high" | "extremely_high" | null
    description: string
\`\`\`

---

## Severity Level Definitions

### Risk Levels (addiction, dependence, psychosis, seizure)

| Level | Definition | Examples |
|-------|------------|----------|
| \`extremely_low\` | Minimal risk even with regular use; virtually no documented cases | Classic psychedelics (LSD, psilocybin) for addiction |
| \`low\` | Rare occurrences; typically requires predisposing factors or heavy use | Cannabis, MDMA for physical dependence |
| \`moderate\` | Documented risk at typical doses; occurs in notable minority of users | Ketamine for psychological addiction |
| \`high\` | Common occurrence; expected with regular use | Opioids for physical dependence, stimulants for psychological addiction |
| \`extremely_high\` | Near-certain with regular use; potentially life-threatening | Alcohol/benzodiazepine physical dependence (fatal withdrawal possible) |

### Carcinogenicity Levels

| Level | Definition |
|-------|------------|
| \`confirmed\` | IARC Group 1 or equivalent; established human carcinogen |
| \`probable\` | IARC Group 2A; strong evidence in animals, limited human data |
| \`possible\` | IARC Group 2B; some evidence, not conclusive |
| \`no_evidence\` | Studies exist showing no carcinogenic activity |
| \`unknown\` | Insufficient data; no studies conducted |

### Antibiotic Function Levels

| Level | Definition |
|-------|------------|
| \`confirmed\` | Documented antimicrobial activity at pharmacological doses |
| \`probable\` | Strong in vitro evidence, mechanism understood |
| \`possible\` | Some evidence of antimicrobial properties |
| \`no_evidence\` | Studies show no antimicrobial activity |
| \`unknown\` | Not studied for antimicrobial properties |

### Evidence Levels (for carcinogenicity evidence breakdown)

| Level | Definition |
|-------|------------|
| \`none\` | No studies conducted |
| \`negative\` | Studies show no effect/carcinogenic activity |
| \`limited\` | Some studies suggest activity but inconclusive |
| \`positive\` | Clear evidence of carcinogenic activity |

---

## Core Principles

**Evidence Only:** Every fact (toxicities, LD50 values, mechanisms, case reports) must come from the source quotes. If a fact is not supported by the sources, leave the field empty (\`""\`), null, or use empty arrays (\`[]\`). Assigning a severity level by mapping the source's own risk language is expected and is not fabrication — see "Assign Severity Levels Carefully".

**Source Priority:** When sources give conflicting severity, prefer the assessment from the more authoritative source (primary medical/toxicological over community/anecdotal). Report the risk at the level the evidence supports — do not inflate a rare risk to seem cautious, and do not discount a documented one. If sources genuinely disagree and none is clearly stronger, use the lower \`level\` and note the disagreement in the description.

**Completeness:** Fill every field that has supporting evidence. Empty fields are acceptable when no data exists.

**If something is rare, say so:** Over-exaggerating dangers of relatively safe substances causes people to develop false confidence around more important harm reduction areas.

**Assign Severity Levels Carefully:** Assigning a level means mapping the source's own risk language about *this* substance onto the enum — e.g. "moderately addictive" → \`moderate\`, "highly reinforcing / compulsive redosing" → \`high\`, "no documented cases of dependence" → \`extremely_low\`. This mapping is expected, not fabrication; fabrication is asserting a fact no source states. If the sources give no risk language for a field, use \`null\` and leave the description empty.

**Ignore Drug Interactions:** Source quotes may mention dangerous combinations. **Do not include this.** Drug interactions are covered in a separate \`interactions\` section.

---

## What Belongs Elsewhere (DO NOT Include)

| Information Type | Correct Section |
|------------------|-----------------|
| Receptor binding, the drug's primary/therapeutic mechanism of action | \`pharmacology\` (the *mechanism of tissue damage* stays here in \`organ_toxicity.mechanism\`) |
| Drug interactions/combinations | \`interactions\` |
| Tolerance development timeline | \`tolerance\` |
| Effect descriptions (euphoria, visuals, etc.) | \`subjective_effects\` |
| Dosing information | \`dosage\` |
| Duration/timeline of effects | \`duration\` |
| Legal status | \`legality\` |

---

## Field Definitions

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| \`addiction.psychological.level\` | \`enum \\| null\` | Severity level for psychological addiction risk | \`"moderate"\` |
| \`addiction.psychological.description\` | \`string\` | 1-2 sentences on psychological addiction potential, abuse potential, compulsive redosing patterns | "Moderate abuse potential with risk of psychological dependence. Compulsive redosing is commonly reported, particularly with insufflation." |
| \`addiction.physical_dependence.level\` | \`enum \\| null\` | Severity level for physical dependence risk | \`"high"\` |
| \`addiction.physical_dependence.description\` | \`string\` | Physical dependence risk, withdrawal symptoms, tolerance development | "Physical dependence develops with chronic use. Withdrawal symptoms include anxiety, tremor, sweating, and palpitations." |
| \`toxicity.lethal_dosage.notes\` | \`string\` | Freeform text for approximate lethal doses, human case reports, or informal estimates that don't fit structured LD50 format | "Human lethal dose is estimated at 200-500 mg, though deaths have occurred at lower doses in combination with other substances." |
| \`toxicity.lethal_dosage.ld50\` | \`array\` | Array of formal LD50 entries from human or animal studies with species, route, value, and unit (optional - only include if structured data available) | See example below |
| \`toxicity.organ_toxicity\` | \`array\` | Array of organ-specific damage entries | See example below |
| \`toxicity.carcinogenicity.level\` | \`enum \\| null\` | Classification level (confirmed/probable/possible/no_evidence/unknown) | \`"no_evidence"\` |
| \`toxicity.carcinogenicity.evidence\` | \`object \\| null\` | Detailed evidence breakdown (optional - include if data available) | See example below |
| \`toxicity.carcinogenicity.description\` | \`string\` | Cancer risk data if available | "Not shown to be carcinogenic in animal studies." |
| \`toxicity.antibiotic_function.level\` | \`enum \\| null\` | Antimicrobial activity classification | \`"unknown"\` |
| \`toxicity.antibiotic_function.description\` | \`string\` | Antibiotic/antimicrobial properties | "No studies on antimicrobial properties." |
| \`psychosis.level\` | \`enum \\| null\` | Severity level for psychosis risk | \`"moderate"\` |
| \`psychosis.description\` | \`string\` | Psychosis, psychotic episodes, emergence delirium | "10-20% of adults experience psychiatric reactions during emergence." |
| \`seizure.level\` | \`enum \\| null\` | Severity level for seizure risk | \`"low"\` |
| \`seizure.description\` | \`string\` | Seizure threshold effects, convulsion risk | "Seizures rare but reported at very high doses. May lower seizure threshold." |

### toxicity.lethal_dosage
Container for all lethal dosage information, with two fields:

**lethal_dosage.notes** (freeform string):
Use this for:
- Approximate human lethal dose estimates
- Case reports and anecdotal data
- Ranges expressed informally (e.g., "deaths reported above 500mg")
- Information that doesn't fit the structured LD50 table format
- Context about lethal dose variability (route, tolerance, combinations)

**lethal_dosage.ld50** (array):
Use this for formal LD50 data from controlled human or animal studies. Each entry:
- **species**: Species (e.g., "human", "rat", "mouse")
- **route**: Administration route (e.g., "oral", "IV", "IP")
- **value**: Numeric value (or null if only descriptive data)
- **unit**: Unit string (e.g., "mg/kg")

If sources only provide informal estimates, put them in \`notes\` and leave \`ld50\` empty. Do not fabricate formal LD50 values from informal data.

### toxicity.organ_toxicity
Array of organ-specific damage. Each entry has 4 fields with STRICT definitions:

| Field | Purpose | Content Type |
|-------|---------|--------------|
| \`system\` | Which organ/body system | Anatomical system name |
| \`findings\` | Self-contained summary of damage | A complete sentence describing what damage can occur AND under what conditions (see below) |
| \`mechanism\` | HOW/WHY it causes damage at molecular level | Biochemical pathways, cellular processes, receptor interactions |
| \`notes\` | EVERYTHING ELSE | Prevalence statistics, reversibility, case counts, additional context |

#### Findings Field - CRITICAL GUIDANCE

The \`findings\` field is displayed prominently in collapsed organ toxicity cards. It must be:

1. **A complete sentence** (not a comma-separated list of terms)
2. **Self-contained** - readable and informative without expanding for more details
3. **Contextualized** - ALWAYS specify under what conditions the damage occurs:
   - "with chronic heavy use"
   - "at doses significantly exceeding typical recreational ranges"
   - "with prolonged daily use over months/years"
   - "primarily in cases of addiction/compulsive use"
   - "at extreme/overdose-level doses"

4. **Proportionate** - Do NOT over-exaggerate. If damage only occurs with extreme abuse patterns, say so clearly. Users should understand these are not risks from occasional responsible use.

**BAD findings (comma list, no context, alarming):**
\`\`\`
findings: "Elevated blood pressure, tachycardia, cardiac strain"
\`\`\`

**GOOD findings (complete sentence, contextualized, proportionate):**
\`\`\`
findings: "Acute cardiovascular effects including elevated blood pressure and increased heart rate occur during intoxication; serious cardiac events are rare and typically associated with pre-existing conditions or extreme doses."
\`\`\`

#### Mechanism Field - STRICT Definition

The \`mechanism\` field describes ONLY the biochemical/molecular pathway of damage:
- Molecular targets (enzymes, receptors, DNA, proteins)
- Cellular processes (apoptosis, necrosis, oxidative stress, inflammation)
- Biochemical pathways (CYP450 metabolism, ROS generation, membrane disruption)

**mechanism is NOT for:**
- Prevalence statistics ("affects 20% of users") → PUT IN NOTES
- Dosing patterns ("associated with high doses") → PUT IN NOTES
- Reversibility ("usually reversible") → PUT IN NOTES
- Case counts ("over 100 documented cases") → PUT IN NOTES
- Risk factors ("more common in chronic users") → PUT IN NOTES
- Clinical observations without biochemical explanation → PUT IN NOTES

**If the sources don't describe the biochemical mechanism, leave it EMPTY ("")**

#### Notes Field - Catch-All

The \`notes\` field is for ALL contextual information:
- Prevalence and statistics
- Reversibility status
- Risk factors and populations
- Case counts and documentation
- Dosing/frequency patterns
- Any other relevant context

#### CORRECT vs INCORRECT Examples

**WRONG - Study info in mechanism, alarming comma-list:**
\`\`\`yaml
- system: "Central Nervous System"
  findings: "Cognitive deficits, brain atrophy"  # Alarming without context!
  mechanism: "Daily use causes indicators of cell death. Primate studies showed damage after 6 months."  # Study info, not mechanism!
  notes: ""
\`\`\`

**CORRECT - Proportionate, contextualized findings:**
\`\`\`yaml
- system: "Central Nervous System"
  findings: "Daily heavy use over extended periods may cause cognitive deficits in memory and learning; some imaging studies suggest white and grey matter changes in chronic users, though effects may be partially reversible with abstinence."
  mechanism: "NMDA receptor blockade leads to increased apoptosis, particularly in developing brain tissue"
  notes: "Primate studies showed prefrontal cortex cell death after 6 months at 1 mg/kg IV daily. Infrequent recreational use at typical doses shows minimal evidence of lasting neurotoxicity."
\`\`\`

Include: biomarker elevations (ALT/AST, CK), mechanistic models, ROA-specific toxicity differences.

### toxicity.carcinogenicity.evidence
Detailed evidence breakdown (include if source data available):
- \`human_epidemiological\`: none/negative/limited/positive
- \`animal_models\`: level + species tested
- \`in_vitro\`: genotoxic/non-genotoxic + assay type
- \`mechanistic\`: none/negative/limited/positive + receptor/mechanism basis

---

## Output Format

Return ONLY valid YAML (no markdown code fences, no commentary):

\`\`\`yaml
harm_potential:
  addiction:
    psychological:
      level: null
      description: ""
    physical_dependence:
      level: null
      description: ""
  toxicity:
    lethal_dosage:
      notes: ""
      ld50: []
    organ_toxicity: []
    carcinogenicity:
      level: null
      evidence: null
      description: ""
    antibiotic_function:
      level: null
      description: ""
  psychosis:
    level: null
    description: ""
  seizure:
    level: null
    description: ""
\`\`\`

---

## Examples

### Lethal Dosage (notes only - informal data)
\`\`\`yaml
lethal_dosage:
  notes: "Human lethal dose is estimated at 200-500mg orally in non-tolerant individuals. Deaths have been reported at lower doses when combined with alcohol or other CNS depressants."
  ld50: []
\`\`\`

### Lethal Dosage (formal LD50 data from animal studies)
\`\`\`yaml
lethal_dosage:
  notes: ""
  ld50:
    - species: "rat"
      route: "oral"
      value: 1700
      unit: "mg/kg"
    - species: "mouse"
      route: "IV"
      value: 400
      unit: "mg/kg"
\`\`\`

### Lethal Dosage (both notes and LD50 data)
\`\`\`yaml
lethal_dosage:
  notes: "Human lethal dose is highly variable due to tolerance. Fatal overdoses typically involve doses significantly exceeding typical recreational ranges."
  ld50:
    - species: "rat"
      route: "oral"
      value: 1700
      unit: "mg/kg"
\`\`\`

### Carcinogenicity with Evidence
\`\`\`yaml
carcinogenicity:
  level: "no_evidence"
  evidence:
    human_epidemiological: "none"
    animal_models:
      level: "negative"
      species: ["rat", "mouse"]
    in_vitro: null
    mechanistic: null
  description: "No carcinogenicity observed in two-year rodent studies."
\`\`\`

### Carcinogenicity Unknown
\`\`\`yaml
carcinogenicity:
  level: "unknown"
  evidence: null
  description: "No human, animal, or genotoxicity data available."
\`\`\`

---

## Extraction Rules

### For addiction.psychological:
- Look for: "abuse potential", "addiction", "habit-forming", "compulsive", "psychological dependence", "reinforcing"
- Note frequency patterns: "daily use", "bingeing", "difficulty stopping"
- Assign level based on how commonly psychological addiction develops

### For addiction.physical_dependence:
- Look for: "physical dependence", "withdrawal", "discontinuation symptoms"
- Distinguish from psychological addiction
- Note severity of withdrawal (can it be fatal? hospitalization needed?)
- Assign level based on likelihood and severity of physical dependence

### For toxicity.lethal_dosage:
See the \`toxicity.lethal_dosage\` field guidance above: informal estimates and case reports → \`notes\`; formal study values (species, route, value, unit) → \`ld50\`; never fabricate formal LD50 values from informal data.

### For toxicity.organ_toxicity:
- Look for: liver damage, kidney damage, bladder damage, cardiotoxicity, neurotoxicity
- Create a separate entry per organ system affected (see the \`toxicity.organ_toxicity\` field guidance above for the findings/mechanism/notes split)

### For toxicity.carcinogenicity:
- Look for: "carcinogenic", "cancer", "mutagenic", "IARC", "Group 1/2A/2B"
- Assign level based on classification or available evidence
- Include evidence breakdown if source provides detailed study information

### For toxicity.antibiotic_function:
- Look for: "antimicrobial", "antibiotic", "bactericidal", "bacteriostatic"
- Most recreational drugs will be "unknown" unless specifically studied

### For psychosis:
- Look for: "psychosis", "psychotic", "hallucinations", "delusions", "paranoia", "emergence delirium"
- Note if acute (during use) or persistent (after use)
- Assign level based on frequency and severity

### For seizure:
- Look for: "seizure", "convulsion", "epileptic", "seizure threshold"
- Note conditions that increase risk
- Assign level based on how commonly seizures occur

---

## Formatting Rules

1. **String fields**: 1-3 sentences, clear, concise, factual
2. **Empty values**: \`""\` for empty strings, \`[]\` for empty arrays, \`null\` for unassigned levels
3. **No speculation**: If sources don't mention it, leave empty or null
4. **Consistent tone**: Clinical, factual, harm-reduction focused
5. **Cite severity**: Use qualifiers like "rare", "common", "severe", "life-threatening"
6. Do not be afraid to leave sections empty if no relevant text in sources
7. Keep outputs succinct while containing essential information
8. Only assign severity levels when confident based on source material

---

## Validation Checklist

Before returning output:
- [ ] All fields present (even if empty/null)
- [ ] YAML is valid (proper indentation, no tabs)
- [ ] Informal lethal-dose text in \`notes\` (string), formal study values in \`ld50\` (array); no fabricated LD50 numbers
- [ ] \`toxicity.organ_toxicity\` is an array of objects
- [ ] Severity levels are valid enum values or null
- [ ] No markdown code fences in output
- [ ] No commentary or explanation, just YAML
- [ ] Content derived only from provided sources
- [ ] Mechanism fields contain actual biological mechanisms, not dose observations
`;

const SEC_HISTORY = `# History & Culture Section Generation

You are a harm-reduction database assistant generating ONLY the \`history_culture\` section of a dose.wiki substance article.

---

## Context

dose.wiki is a harm reduction database created by Josie Kins, a psychedelic researcher and the founder of PsychonautWiki; write in the neutral, encyclopedic voice of her harm reduction documentation.

---

## Style

- Encyclopedic third person; past tense for historical events
- Anchor claims to the specific dates, people, and institutions the excerpts provide
- Neutral documentation: no advocacy, no moralizing about drug use, drug culture, or prohibition

---

## Critical Constraints

- SYNTHESIZE the provided excerpts into original prose in your own voice; do not copy sentences or lengthy phrases verbatim (historical dates, names, and specific facts can remain as-is)
- Include ONLY information present in the provided excerpts — never add facts, dates, names, or framing from your own knowledge, and never fill gaps
- When excerpts conflict on a fact or date, prefer the Wikipedia excerpt over community wiki excerpts and state only the better-attested version — never hedge or present both
- Present information directly; do not reference or comment on the sources themselves

---

## Schema Structure

The \`history_culture\` section has two fields:

\`\`\`yaml
history_culture:
  content: "Freeform paragraphs for simpler substances..."
  sections: []  # Empty when using content alone
\`\`\`

OR with sections when there's enough material:

\`\`\`yaml
history_culture:
  content: ""  # Empty when using sections
  sections:
    - heading: "Your Chosen Heading"
      content: "Flowing prose content for this section..."
      subsections: []  # Empty for most sections
    - heading: "Another Heading"
      content: "More content..."
      subsections: []
\`\`\`

### Optional Date Ranges

Sections and subsections can have an optional \`date_range\` field to indicate when events occurred:

\`\`\`yaml
history_culture:
  content: ""
  sections:
    - heading: "Discovery and Synthesis"
      date_range:
        start: "1938"      # Required if date_range is present
        end: "1943"        # Optional - omit for single dates
      content: "LSD was first synthesized..."
      subsections: []
\`\`\`

**Guidelines for date_range:**
- Only include \`date_range\` when the section has a clear time period; omit it entirely for non-time-specific sections (like "Notable Individuals")
- Formats: years ("1943") or full dates when needed ("1943-04-19"); for a decade-scale span, use start/end years (start: "1960", end: "1970")
- Date ranges can overlap between sections

### Nested Subsections (for Notable Individuals, etc.)

Sections can have **nested subsections** for topics like "Notable Individuals" where each person deserves their own heading:

\`\`\`yaml
history_culture:
  content: ""
  sections:
    - heading: "Discovery and Synthesis"
      date_range:
        start: "1938"
        end: "1943"
      content: "LSD was first synthesized..."
      subsections: []
    - heading: "Notable Individuals"
      content: ""  # Empty when using subsections
      subsections:
        - heading: "Albert Hofmann"
          date_range:
            start: "1938"  # Single date for when this person became relevant
          content: "Swiss chemist who first synthesized and discovered the psychoactive properties..."
        - heading: "Timothy Leary"
          date_range:
            start: "1963"
            end: "1996"
          content: "Harvard psychologist who became a prominent advocate..."
        - heading: "Steve Jobs"
          # date_range omitted - not time-specific
          content: "Co-founder of Apple who publicly discussed his LSD use..."
\`\`\`

**When to use subsections:**
- "Notable Individuals" or "Key Figures" - each person gets a subsection
- "Research Programs" - each distinct program (e.g., "Project MKUltra", "Good Friday Experiment")
- Any section where you're listing multiple distinct entities that each warrant a heading

---

## Structure Decision

| Approach | When to Use |
|----------|-------------|
| **\`content\` only** | Limited source material (3 or fewer paragraphs worth). Most research chemicals, obscure substances, or those with brief histories. |
| **\`sections\` only** | Rich source material with distinct topics. Well-documented substances like LSD, MDMA, cannabis, ayahuasca. |

**Rule of thumb:** If you can cover everything in 3 or fewer paragraphs, just use \`content\`. Create \`sections\` only when you have enough material for 3+ distinct topics.

**Sparse evidence:** If the excerpts contain only a sentence or two of genuine history (e.g., "first appeared on the online research chemical market in the 2010s"), a single short \`content\` paragraph of matching length is the correct and complete output — write exactly what the excerpts support and stop. Scheduling and ban dates are legality material, not history, even though they are dated events; use them only where the excerpts tie them to a cultural consequence (e.g., a market shift to successor compounds).

**The sources dictate the structure.** If the sources talk mostly about one chemist's work, make that a section. If they focus on a specific incident or era, that's your section. Create headings only for topics the sources actually cover.

---

## Article Context

You are generating **only** \`history_culture\`. Every other part of the article — identification, summary, classification, dosage, duration, subjective effects, pharmacology, interactions, harm potential, tolerance, legality, citations — is generated separately. Route material that belongs to them:

| Information Type | Correct Section |
|------------------|-----------------|
| Receptor binding, mechanism of action | \`pharmacology\` |
| Drug interactions/combinations | \`interactions\` |
| Tolerance development timeline | \`tolerance\` |
| Effect descriptions (euphoria, visuals, etc.) | \`subjective_effects\` |
| Dosing information | \`dosage\` |
| Duration/timeline of effects | \`duration\` |
| Legal status, scheduling dates | \`legality\` |
| Toxicity, LD50, health risks | \`harm_potential\` |

You will receive the **current state of the article** as YAML in the user message; use it to understand the substance. Overlap with the \`summary\` (e.g., discovery basics) is expected and fine — but keep other sections' domains out, per the table above.

---

## Output Format

**Your entire reply is the raw YAML document, beginning with \`history_culture:\` on the first line — no markdown code fences, no commentary.** Use the shapes shown in Schema Structure above.

For multi-paragraph content, use a YAML literal block scalar (\`|\`) to preserve paragraph breaks:

history_culture:
  content: |
    First paragraph about early history and discovery.

    Second paragraph about later developments or cultural impact.

    Third paragraph if needed.
  sections: []

Or within sections:

history_culture:
  content: ""
  sections:
    - heading: "Discovery and Development"
      content: |
        First paragraph about initial synthesis.

        Second paragraph about subsequent research.

---

## Validation Checklist

Before returning output:
- [ ] YAML is valid: 2-space indents, no tabs
- [ ] Both \`content\` and \`sections\` are present, and exactly one is populated — the other is \`""\` or \`[]\`
- [ ] Every section has \`heading\`, \`content\`, and \`subsections\` fields
- [ ] \`date_range\`, when present, has a \`start\`; \`end\` appears only for spans
- [ ] \`subsections\` used only for list-of-entities sections (Notable Individuals, Research Programs) with the parent section's \`content\` set to \`""\`; \`[]\` everywhere else
- [ ] \`sections\` used only when the excerpts support 3+ distinct topics
- [ ] Every statement is derived from the provided excerpts
- [ ] No material belonging to other sections (legality, pharmacology, harm_potential, etc.)
- [ ] Reply is raw YAML starting with \`history_culture:\` — no code fences, no commentary
`;

const SEC_LEGALITY = `# Legality Section Generation

You are a harm-reduction database assistant generating ONLY the \`legality\` section of a dose.wiki substance article.

---

## Context

dose.wiki is a new harm reduction database created by Josie Kins, a psychedelic researcher and the founder of PsychonautWiki, the Subjective Effect Index, Effect Index, and the blog "Disregard Everything I Say." She is known for her work on psychedelic harm reduction documentation, subjective effect taxonomy, and visual replication art.

---

## Style

Write in the style of Josie Kins' psychedelic harm reduction documentation:
- Notes are 1-3 short declarative sentences
- Neutral register: state what the law is; never advise or editorialize

---

## Critical Constraints

- SYNTHESIZE information from the provided excerpts into original prose
- Do not copy sentences or lengthy phrases verbatim from any source
- Standard legal terminology (schedule names, legislation names) can remain as-is
- Restructure and reframe information in your own voice
- Include ONLY information present in the provided excerpts (one bounded exception for explaining bare classifications — see Core Principles)
- Do not reference or comment on sources; present information directly without meta-commentary

---

## Core Principles

**Extract ALL Jurisdictions:** You MUST extract every jurisdiction mentioned in the source material, even if the information is minimal. Countries go in \`countries\`; US state entries go in \`usStates\` (see Field Definitions), never as \`countries\` keys.

**Evidence Only:** Only include legal statuses explicitly mentioned in sources. Laws change frequently - do not assume based on drug class. Match the size of the output to the size of the evidence: if the excerpts contain no legal status information for any jurisdiction, \`international: []\` with \`countries: {}\` is the correct and complete output — an empty section is right; a guessed jurisdiction is a failure.

One bounded exception to evidence-only: when a source gives only a bare classification, the note may explain what that classification generally entails (severity tier; whether possession, sale, or production is prohibited) — but must not add legislation names, penalty figures, or dates the excerpts do not contain. Include legislation names only when the source provides them.

**Preserve Dates:** When a source gives an effective date, scheduling date, or "as of" date, carry it into the note (e.g., "Controlled since January 26, 2016"). Present a dated claim with its date qualifier, not as an undated present-tense fact — this matters most for "legal" or "unscheduled" statuses, which go stale silently (e.g., "Reported as federally unscheduled as of 2016").

**Conflicting Sources:** When sources disagree about a jurisdiction, prefer the claim with the more recent date. If neither is dated, report the more restrictive status and note the discrepancy (e.g., "Sources differ; listed as a controlled substance, though older sources describe it as unscheduled").

**Use Full Country Names:** Use complete, human-readable country names as keys (e.g., "United States" not "US", "United Kingdom" not "UK" or "U.K. (Britain)", "Australia" not "AU").

**Notes Are Required:** Every entry MUST have a non-empty \`notes\` field that explains the status — what it means, the legislation (when the source names it), or the practical consequences.

Examples of valid notes (even with minimal source info):
- "Classified as a narcotic substance on January 18, 2019."
- "Class A drug under the N-benzylphenethylamine catch-all clause in the Misuse of Drugs Act 1971."
- "Controlled substance; possession, production, and distribution are prohibited."

---

## Output Format

Return ONLY valid YAML for this structure (no markdown code fences, no commentary). \`usStates\` and \`usStatesNote\` are added only when sources give US state-level information:

\`\`\`yaml
legality:
  international: []
  countries: {}
\`\`\`

---

## Field Definitions

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| \`international\` | \`array\` | International treaties and agreements; name the instrument, then the schedule | \`["UN Convention on Psychotropic Substances 1971 (Schedule I)"]\` |
| \`countries\` | \`object\` | Country-specific status keyed by full country name | See below |
| \`usStates\` | \`object\` (optional) | US state-level statuses keyed by full state name, same \`{status, notes}\` shape as countries; include only when sources give state-specific information | See Example Output |
| \`usStatesNote\` | \`string\` (optional) | One-sentence summary of the US state-level picture; include only when \`usStates\` is present | \`"Unscheduled federally, but controlled in several individual states."\` |

Emit only the fields defined here; other schema fields are populated downstream.

### Country Object Format

Every entry must have both \`status\` and \`notes\`. In these examples, assume every detail (legislation, dates, meanings) appeared in the source excerpts:

\`\`\`yaml
countries:
  United States:
    status: "Schedule I"
    notes: "Controlled under the Controlled Substances Act. Classified as having high abuse potential with no accepted medical use."
  United Kingdom:
    status: "Class A"
    notes: "Controlled under the Misuse of Drugs Act 1971. Class A carries the most severe penalties."
  Germany:
    status: "Anlage I BtMG"
    notes: "Listed in Anlage I of the Betäubungsmittelgesetz (Narcotics Act). Prohibited with no medical use permitted."
  Australia:
    status: "Schedule 9"
    notes: "Prohibited substance under the Poisons Standard. No therapeutic use recognized."
  Netherlands:
    status: "List I (Opiumwet)"
    notes: "Controlled under the Opium Act. Possession, distribution, and production without license is illegal."
\`\`\`

---

## Common Legal Statuses

Reference for explaining a classification the excerpts assign — never a source of statuses. A substance belongs under one of these only if the excerpts place it there.

### United States
- Schedule I (no accepted medical use, high abuse potential)
- Schedule II (high abuse potential, accepted medical use)
- Schedule III-V (decreasing restriction)
- Unscheduled / Legal
- Analogue Act applies (when sold for human consumption)

### United Kingdom
- Class A (most severe, e.g., heroin, cocaine, MDMA)
- Class B (e.g., amphetamines, cannabis)
- Class C (e.g., benzodiazepines, ketamine)
- Psychoactive Substances Act 2016 (blanket ban)

### Germany
- Anlage I BtMG (prohibited, no medical use)
- Anlage II BtMG (marketable but prescription only)
- Anlage III BtMG (prescription only)
- NpSG (New Psychoactive Substances Act)

### Australia
- Schedule 9 (prohibited, no therapeutic use)
- Schedule 8 (controlled drugs)
- Schedule 4 (prescription only)

---

## International Treaties

- UN Single Convention on Narcotic Drugs 1961
- UN Convention on Psychotropic Substances 1971
- UN Schedule I, II, III, IV (different from US schedules)

---

## Extraction Rules

- Look for "legal status", "scheduling", "controlled substance" sections
- Check for analogue act applicability
- Note blanket bans (UK PSA, German NpSG)
- Include exceptions (medical use, research exemptions)
- Include legislation names when the source provides them

---

## Example Output

Every detail below (legislation names, dates, penalties) is assumed to be present in the source excerpts — include such details only when your excerpts state them:

\`\`\`yaml
legality:
  international:
    - "UN Convention on Psychotropic Substances 1971 (Schedule I)"
  countries:
    United States:
      status: "Unscheduled (federal)"
      notes: "Reported as federally unscheduled as of 2016. Controlled in several individual states."
    United Kingdom:
      status: "Class A"
      notes: "Controlled under the Misuse of Drugs Act 1971. Possession punishable by up to 7 years imprisonment."
    Germany:
      status: "Anlage I BtMG"
      notes: "Listed in Anlage I of the Betäubungsmittelgesetz. Manufacturing, possession, and distribution prohibited without license."
    Australia:
      status: "Schedule 9"
      notes: "Prohibited substance under the Poisons Standard. No therapeutic use recognized."
    Netherlands:
      status: "List I (Opiumwet)"
      notes: "Controlled under the Opium Act. Personal use not criminalized but possession, distribution, and production without license is illegal."
    Portugal:
      status: "Decriminalized (personal use)"
      notes: "Production and sale remain illegal. Since 2001, personal possession of small quantities is not a criminal offense; individuals may be referred to dissuasion commission."
  usStatesNote: "Unscheduled federally as of 2016, but controlled in some individual states."
  usStates:
    Florida:
      status: "Schedule I"
      notes: "Added to Florida's Schedule I controlled substance list in 2012."
    Maine:
      status: "Schedule X"
      notes: "Listed as a Schedule X substance under Maine law."
\`\`\`

---

## Validation Checklist (MUST pass all before output)

- [ ] **ALL jurisdictions from source are included** - countries in \`countries\`, US states in \`usStates\`
- [ ] Country keys use full country names (e.g., "United States" not "US"); no US state appears as a \`countries\` key
- [ ] Every entry has both \`status\` and a non-empty \`notes\` that explains the status
- [ ] Source dates survive into notes - no undated present-tense claim from a dated source
- [ ] No legislation names, penalty figures, or dates beyond what the excerpts contain
- [ ] Output size matches evidence size - no-evidence excerpts produce empty \`international\` and \`countries\`
- [ ] \`international\` is an array of strings naming the instrument
- [ ] Only includes jurisdictions mentioned in sources
- [ ] No markdown code fences in output
`;

const SEC_SUMMARY = `# Summary Section Generation

You are a harm-reduction database assistant generating ONLY the \`summary\` section of a dose.wiki substance article.

---

## Context

dose.wiki is a new harm reduction database created by Josie Kins, a psychedelic researcher and the founder of PsychonautWiki, the Subjective Effect Index, Effect Index, and the blog "Disregard Everything I Say." She is known for her work on psychedelic harm reduction documentation, subjective effect taxonomy, and visual replication art.

---

## Style

Write in the style of Josie Kins' psychedelic harm reduction documentation:
- Phenomenologically precise yet accessible
- Clinical but not cold
- Neutral documentation (no advocacy)
- Technical accuracy with readable prose
- Information-dense but well-structured

Write in third person, declarative present tense; never address the reader.

---

## Critical Constraints

- SYNTHESIZE information from the provided excerpts into original prose
- Do not copy sentences or lengthy phrases verbatim from any source
- Standard technical terminology (chemical names, drug class names) can remain as-is
- Restructure and reframe information in your own voice
- Do not reference or comment on sources; present information directly without meta-commentary

---

## Core Principles

**Evidence Only:** Every claim must be explicitly stated or clearly implied in the source quotes. If information cannot be verified from the provided sources, do not include it. Never infer a synthesis date, discoverer, or origin that the excerpts do not attest.

**Concise Overview:** Aim for 50-80 words that introduce the substance to someone unfamiliar with it. When the sources support fewer than 50 words of verifiable content, write a shorter fully-sourced summary — a faithful 35-word summary is better than a padded 60-word one.

---

## Output Format

Return ONLY valid YAML for this exact structure (no markdown code fences, no commentary):

\`\`\`yaml
summary: ""
\`\`\`

The fenced blocks in this document are for readability only; your output is the bare YAML.

---

## Field Definition

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| \`summary\` | \`string\` | Overview paragraph | See examples below |

---

## What to Include

Cover whichever of the following the sources attest, in whatever order reads naturally:
1. **What it is**: Chemical class and primary name
2. **Psychoactive class**: Primary effects category (psychedelic, stimulant, etc.)
3. **Brief history/origin**: When first synthesized, by whom, or traditional use
4. **Notable characteristics**: What distinguishes it from similar substances
5. **Key safety notes**: Common adulterants, caustic routes, or other prominent warnings (if applicable)

---

## What NOT to Include

The summary provides context, not exhaustive detail. Leave to their own sections:

- Specific dosage numbers (belongs in \`dosage\` section) — a single qualitative potency note such as "active in the microgram range" is acceptable
- Onset/peak/offset duration timelines (belongs in \`duration\` section) — a single overall-duration clause such as "effects lasting 8-12 hours" is acceptable
- Detailed mechanism of action (belongs in \`pharmacology\` section)
- Legal status details (belongs in \`legality\` section)
- Exhaustive effect lists (belongs in \`subjective_effects\` section)
- Alternative names for the substance such as slang or chemistry names. These will already be covered by a section directly above the summary.

---

## Example Outputs

### Example 1: Classic Psychedelic

\`\`\`yaml
summary: "LSD is a semisynthetic psychedelic of the lysergamide class. First synthesized by Albert Hofmann in 1938, its psychoactive properties were discovered in 1943. LSD is known for producing profound alterations in perception, thought, and mood, with effects lasting 8-12 hours. It remains one of the most potent psychoactive substances known, active in the microgram range."
\`\`\`

### Example 2: Research Chemical with Safety Note

\`\`\`yaml
summary: "25I-NBOMe is a synthetic psychedelic of the substituted phenethylamine class, specifically an N-benzylated derivative of the 2C-x family. First synthesized in 2003, it gained notoriety as a dangerous LSD adulterant. Unlike classical psychedelics, 25I-NBOMe has been associated with fatalities at recreational doses and is notably caustic when insufflated, causing severe nasal damage."
\`\`\`

### Example 3: Dissociative

\`\`\`yaml
summary: "Ketamine is an arylcyclohexylamine dissociative originally developed as an anesthetic in 1962. It produces dose-dependent effects ranging from mild dissociation to complete anesthetic states. Ketamine has gained attention for its rapid-acting antidepressant properties and is used clinically for treatment-resistant depression. Chronic use is associated with urinary tract damage."
\`\`\`

---

## Validation Checklist

Before returning output:
- [ ] YAML is valid (no tabs, proper quoting)
- [ ] Output is the YAML alone — no code fences, no commentary or explanation
`;

const SEC_TOLERANCE = `# Tolerance Section Generation

You are a harm-reduction database assistant generating ONLY the \`tolerance\` section of a dose.wiki substance article.

---

## Context

dose.wiki is a new harm reduction database created by Josie Kins, a psychedelic researcher and the founder of PsychonautWiki, the Subjective Effect Index, Effect Index, and the blog "Disregard Everything I Say." She is known for her work on psychedelic harm reduction documentation, subjective effect taxonomy, and visual replication art.

---

## Style

Write in the style of Josie Kins' psychedelic harm reduction documentation:
- Phenomenologically precise yet accessible
- Clinical but not cold
- Neutral documentation (no advocacy)
- Technical accuracy with readable prose
- Information-dense but well-structured

---

## Critical Constraints

- SYNTHESIZE information from the provided excerpts into original prose
- Do not copy sentences or lengthy phrases verbatim from any source
- Standard technical terminology (receptor names, pharmacological terms) can remain as-is
- Restructure and reframe information in your own voice
- Include ONLY information present in the provided excerpts
- Excerpts may include off-topic material (general pharmacology, trip reports) and sources marked as having no tolerance content; use only passages that describe tolerance, cross-tolerance, or tolerance timelines
- Do not reference or comment on sources; present information directly without meta-commentary

---

## Core Principles

**Evidence Only:** Every timeline, condition, and cross-tolerance entry must be attested in the provided excerpts.

**Be Specific:** Include specific time ranges when available.

**Cross-Tolerance:** Include every cross-tolerant drug class the excerpts mention.

---

## Sparse or Conflicting Evidence

- A field with no attested information is output as \`""\` (or \`[]\` for \`cross_tolerance\`). Empty fields are correct output, not failures.
- When sources give different timeframes, report the range or the divergence ("reported anywhere from 4-7 days to two weeks") rather than silently picking one source.

---

## Output Format

Return ONLY valid YAML for this exact structure. Your output's first line is exactly \`tolerance:\` and its last line is the final field — no markdown code fences, no commentary:

\`\`\`yaml
tolerance:
  full_tolerance: ""
  half_tolerance: ""
  baseline_tolerance: ""
  cross_tolerance: []
\`\`\`

---

## Field Definitions

Each string field is 1-3 complete sentences of prose.

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| \`full_tolerance\` | \`string\` | Time to develop full tolerance with continuous use | "Tolerance develops after 2-3 consecutive days of use." |
| \`half_tolerance\` | \`string\` | Time for tolerance to reduce by 50% | "Tolerance reduces to half after 3-5 days of abstinence." |
| \`baseline_tolerance\` | \`string\` | Time to return to baseline tolerance | "Baseline tolerance returns after 1-2 weeks of abstinence." |
| \`cross_tolerance\` | \`array\` | Drug classes with shared tolerance | \`["Serotonergic psychedelics", "5-HT2A agonists"]\` |

---

## Extraction Rules

### For full_tolerance:
- Look for: "tolerance develops after", "repeated use causes", "rapidly builds"
- Note if tolerance is to specific effects (e.g., "tolerance to euphoria but not stimulation")
- Include conditions: "with daily use", "after consecutive days"

### For half_tolerance:
- Fill this field only when a source states a half-tolerance timeframe (e.g. "reduced to half after 5-7 days")
- If no excerpt states one, output \`half_tolerance: ""\` — never derive it from the baseline figure or general knowledge
- Look for: "tolerance begins to decrease after", "reduced to half"

### For baseline_tolerance:
- Time to fully reset tolerance
- Look for: "baseline returns after", "wait X weeks between uses"
- Sources often phrase this as harm-reduction spacing advice (e.g. "wait 2 weeks between uses"); extract the timeframe

### For cross_tolerance:
- Name the drug class the excerpts attest, using standard terminology (e.g. "Serotonergic psychedelics", "Benzodiazepines and Z-drugs", "μ-opioid agonists")
- A short parenthetical of representative drugs is allowed when the excerpts name them
- Use these labels only to phrase what the excerpts state — an empty \`cross_tolerance: []\` is the correct output when no excerpt mentions cross-tolerance, regardless of the substance's class

---

## Example Output

With well-documented sources:

\`\`\`yaml
tolerance:
  full_tolerance: "Tolerance to the effects develops rapidly, often within 2-3 days of consecutive use. Tolerance to different effects may develop at different rates, with euphoric effects diminishing faster than stimulant effects."
  half_tolerance: "Tolerance reduces to approximately half after 3-5 days of abstinence."
  baseline_tolerance: "Full baseline tolerance is typically restored after 1-2 weeks of abstinence. Some users report that very heavy use may require longer breaks for complete tolerance reset."
  cross_tolerance:
    - "Serotonergic psychedelics (LSD, psilocybin, mescaline)"
    - "Other 5-HT2A agonists"
\`\`\`

With sparse sources (only a reset timeframe attested):

\`\`\`yaml
tolerance:
  full_tolerance: ""
  half_tolerance: ""
  baseline_tolerance: "Sources advise waiting at least 2 weeks between uses for tolerance to return to baseline."
  cross_tolerance: []
\`\`\`

---

## Validation Checklist

- [ ] All four fields present (empty string \`""\` or \`[]\` if unattested)
- [ ] Every timeline and cross-tolerance entry is attested in the excerpts
- [ ] Time ranges include units (days, weeks)
- [ ] \`cross_tolerance\` is an array of strings
- [ ] Output's first line is exactly \`tolerance:\`, with no code fences or commentary
`;

const PIPELINE_DIAGRAM = `graph TD
  SITES["Source pages — 10 sites<br/>(internal working copies;<br/>full list in section 03)"]:::ext
  PARSE["Deterministic parsers<br/>dosage, duration, interactions,<br/>chemistry, legal tables"]:::auto
  EXTRACT["Verbatim excerpt extraction<br/>8 topics; a model selects source blocks,<br/>a script copies them out unchanged"]:::auto
  QUOTES[("Excerpt documents<br/>one per AI-written section")]:::data
  SYNTH["Section synthesis<br/>Claude Opus 4.5 + one prompt<br/>per section, excerpts only"]:::auto
  REVIEW["Human expert review<br/>read, fact-check, edit —<br/>the final gate before publication"]:::human
  DB[("Article database<br/>(drafts)")]:::data
  CITE["Citation pass<br/>per-claim references with<br/>verbatim supporting quotes"]:::auto
  PK["ProtestKit API<br/>live reagent test results"]:::ext
  PAGE["Published article"]:::pub
  JSON["SubstanceIndex.json<br/>free download of the<br/>whole dataset"]:::pub

  SITES --> PARSE
  SITES --> EXTRACT
  EXTRACT --> QUOTES
  QUOTES --> SYNTH
  PARSE --> DB
  SYNTH --> DB
  DB --> CITE
  CITE --> REVIEW
  REVIEW -->|"approved"| PAGE
  PAGE --> JSON
  PK -.->|"fetched live<br/>at page view"| PAGE

  classDef ext fill:#3a1f33,stroke:#f9a8d4,color:#f7e3ef
  classDef auto fill:#3a2a18,stroke:#fdba74,color:#f7ead9
  classDef data fill:#143026,stroke:#6ee7b7,color:#def3ea
  classDef human fill:#391a40,stroke:#e879f9,color:#f6e2fa
  classDef pub fill:#15263e,stroke:#7dd3fc,color:#ddeefb`;

const SECTION_NUM_CLASS =
  "theme-text-faint mr-2 text-sm font-semibold tabular-nums";
const SECTION_HEADING_CLASS = "theme-accent-heading text-2xl font-semibold";
const PROSE_CLASS = "theme-text-secondary max-w-[68ch] leading-7";
const CARD_LABEL_CLASS =
  "theme-text-faint mb-1.5 text-xs font-semibold uppercase tracking-[0.18em]";
const LIST_CLASS = "theme-text-secondary space-y-2 leading-7";
const TABLE_WRAP_CLASS = "overflow-hidden";
const TABLE_SCROLL_CLASS = "overflow-x-auto";
const TABLE_CLASS =
  "min-w-[760px] w-full border-collapse text-left text-sm [&_tbody_.rounded-full]:border-dose-border [&_tbody_.rounded-full]:bg-dose-surface-muted/80 [&_tbody_.rounded-full]:px-2 [&_tbody_.rounded-full]:py-0.5 [&_tbody_.rounded-full]:text-[10px] [&_tbody_.rounded-full]:leading-4 [&_tbody_.rounded-full]:text-dose-text-secondary [&_tbody_.rounded-full]:tracking-[0.11em] [&_tbody_small]:mt-1 [&_tbody_td]:border-b [&_tbody_td]:border-dose-border [&_tbody_td]:p-4 [&_tbody_td]:align-top [&_tbody_td:first-child]:min-w-[12rem] [&_tbody_td:first-child]:font-semibold [&_tbody_td:first-child]:text-dose-text [&_tbody_tr:last-child_td]:border-b-0";
const TABLE_HEAD_ROW_CLASS =
  "border-b border-dose-border bg-dose-surface-muted/55";
const TH_CLASS =
  "theme-text-muted px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em]";
const TR_CLASS =
  "align-top odd:bg-dose-surface-muted/35 even:bg-dose-surface/20";
const SWATCH_CLASS = "h-3 w-3 shrink-0 rounded-[3px]";
const LEGEND_CLASS = "mt-5 flex flex-wrap gap-x-5 gap-y-2";
const LEGEND_ITEM_CLASS =
  "theme-text-muted flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em]";
const PIPELINE_STEP_CLASS =
  "theme-card-surface flex min-w-[8.5rem] flex-1 flex-col gap-1 rounded-2xl border p-3 text-center";
const STEP_NUM_CLASS = "theme-accent-heading text-sm font-semibold tabular-nums";
const STEP_NAME_CLASS = "theme-accent-heading text-sm font-semibold";
const STEP_DETAIL_CLASS = "theme-text-muted text-xs leading-5";
const PIPELINE_ARROW_CLASS =
  "hidden shrink-0 items-center text-lg theme-icon-muted sm:flex";
const DETAILS_CLASS =
  "theme-public-card-subtle group/details rounded-2xl border p-3 transition-[border-color,background-color,box-shadow] duration-200 open:border-dose-card-border hover:border-dose-card-border";
const SUMMARY_CLASS =
  "theme-accent-heading flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-semibold outline-none transition-[background-color,color] duration-200 hover:bg-dose-surface-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dose-accent-strong group-open/details:bg-dose-surface-muted/45 [&::-webkit-details-marker]:hidden";
const PROMPT_META_CLASS = "theme-text-muted mb-3 text-sm leading-6";
const PROMPT_BODY_CLASS =
  "theme-text-secondary mt-3 max-h-[480px] overflow-auto rounded-xl border border-dose-divider bg-dose-surface-muted p-4 font-mono text-[12px] leading-6 whitespace-pre-wrap break-words shadow-[var(--theme-elevation-inner)]";
const PULL_CLASS =
  "theme-public-card-subtle theme-accent-heading theme-accent-emphasis my-6 max-w-[68ch] rounded-2xl border p-5 text-lg font-medium leading-8 shadow-[var(--theme-elevation-sm)]";

// Flattened "grouped explanation" surface: one ContentCard whose interior rows are
// separated by quiet token dividers (Divider Policy: divide-y is for card internals).
// Replaces the repeated identical-card grids that previously boxed each short
// label+paragraph individually. DIVIDED_LIST_CLASS goes on a padding="none" card.
const DIVIDED_LIST_CLASS = "divide-y divide-dose-border";
const DIVIDED_ITEM_CLASS = "px-5 py-5 sm:px-6";
// Demoted informational note: emphasized prose on a quiet subtle surface (no
// role="alert"), used where Alert variant="default" previously carried no status.
const NOTE_CLASS = `${PROSE_CLASS} text-[0.9375rem]`;


// Pipeline-stage categories. Color carries category, but each step also renders a
// redundant text label (see PipelineStep) so meaning never depends on color alone.
// Tokens resolve in both themes; no inline hex, no banned sky/teal, green reserved
// for the genuinely "published / success" stage only.
type StageTone = "source" | "automated" | "stored" | "review" | "published";
const STAGE_TONE: Record<
  StageTone,
  { label: string; accentVar: string }
> = {
  // Swatch colors intentionally mirror the Mermaid PIPELINE_DIAGRAM classDef
  // strokes (ext/auto/data/human/pub) below. This legend is the key for that
  // diagram, and the diagram's stroke colors are fixed (Mermaid theming is
  // off-limits), so each tone must stay in lockstep with its stroke — five
  // distinct colors — rather than collapse onto shared theme tokens.
  source: { label: "Source", accentVar: "#f9a8d4" },
  automated: { label: "Automated", accentVar: "#fdba74" },
  stored: { label: "Stored", accentVar: "#6ee7b7" },
  review: { label: "Review", accentVar: "#e879f9" },
  published: { label: "Published", accentVar: "#7dd3fc" },
};
const STAGE_TAG_CLASS =
  "theme-text-faint text-[10px] font-semibold uppercase tracking-[0.16em]";

function PipelineStep({
  num,
  name,
  tone,
  children,
}: {
  num: number;
  name: string;
  tone: StageTone;
  children: ReactNode;
}) {
  const { label, accentVar } = STAGE_TONE[tone];
  return (
    <div className={PIPELINE_STEP_CLASS} style={{ borderColor: accentVar }}>
      <div className="flex items-baseline justify-center gap-2">
        <span className={STEP_NUM_CLASS}>{num}</span>
        <span className={STAGE_TAG_CLASS} style={{ color: accentVar }}>
          {label}
        </span>
      </div>
      <div className={STEP_NAME_CLASS}>{name}</div>
      <div className={STEP_DETAIL_CLASS}>{children}</div>
    </div>
  );
}

function StageSwatch({ tone }: { tone: StageTone }) {
  return (
    <span
      className={SWATCH_CLASS}
      style={{ background: STAGE_TONE[tone].accentVar }}
    />
  );
}

function DetailsSummary({ children }: { children: ReactNode }) {
  return (
    <summary className={SUMMARY_CLASS}>
      <span>{children}</span>
      <Icon
        icon="lucide:chevron-right"
        size={16}
        className="theme-icon-muted shrink-0 transition-transform duration-200 group-open/details:rotate-90"
      />
    </summary>
  );
}

export default function DocsHowPage() {
  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <StickyTocLayout
        toc={<PublicTableOfContents items={[...TOC]} variant="bare" />}
        maxWidthClass="max-w-4xl"
        contentClassName="gap-8"
      >
        <header className="flex flex-col gap-4">
          <p className="theme-text-faint text-xs font-semibold uppercase tracking-[0.18em]">
            Last updated July 24, 2026
          </p>
          <h1 className="theme-accent-heading font-display text-3xl font-bold tracking-tight sm:text-4xl">
            How dose.wiki articles are made
          </h1>
          <p className="theme-text-muted max-w-[68ch] text-base">
            the full content pipeline — scraping, excerpting, synthesis, human review, citations
          </p>
          <p className="theme-text-secondary max-w-[68ch] text-[1.0625rem] leading-7">
            A dose.wiki substance article is put together from{" "}
            <strong>several distinct bodies of work</strong>: subjective effects built on the
            documentation of{" "}
            <a
              href="https://en.wikipedia.org/wiki/Josie_Kins"
              target="_blank"
              rel="noopener noreferrer"
              className={proseLinkClassName}
            >
              Josie Kins
            </a>
            , interaction ratings from TripSit's combination research, live reagent test results from
            protestkit.eu, structured data parsed from reference sites, and prose sections synthesized
            from archival source material. A <strong>human expert reviewer</strong> is the final gate
            before anything is published. This page documents the whole process end to end, including
            the exact prompts we use.
          </p>
        </header>

        {/* Inline TOC for mobile/tablet; replaced by the sticky gutter TOC at >=1200px. */}
        <div className="min-[1200px]:hidden">
          <PublicTableOfContents items={[...TOC]} />
        </div>

        <section id="s1" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>01</span>{" "}Why this page exists
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            This page is linked from the <strong>source pages</strong> section of every substance
            article. It is one shared explanation of where article content comes from, not a
            per-article audit log. Different parts of an article come from different places:
          </p>

          <ContentCard padding="none" className={`mt-6 ${DIVIDED_LIST_CLASS}`}>
            <div className={DIVIDED_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Subjective effects</div>
              <p className={PROSE_CLASS}>
                Built on the subjective effects documentation work of{" "}
                <strong>
                  <a
                    href="https://en.wikipedia.org/wiki/Josie_Kins"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={proseLinkClassName}
                  >
                    Josie Kins
                  </a>
                </strong>
                . Her effect taxonomy is the basis of our Subjective Effect Index, which every effect
                listing links into.
              </p>
            </div>
            <div className={DIVIDED_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Interactions</div>
              <p className={PROSE_CLASS}>
                Sourced from <strong>TripSit's</strong> drug combination research. Their combination
                chart provides the risk ratings shown on every article.
              </p>
            </div>
            <div className={DIVIDED_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Reagent tests</div>
              <p className={PROSE_CLASS}>
                Sourced live from <strong>protestkit.eu</strong>. Color reactions are fetched from their
                API when you view an article.
              </p>
            </div>
            <div className={DIVIDED_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>The other sections</div>
              <p className={PROSE_CLASS}>
                Synthesized from <strong>archival source material</strong>: ten reference and
                harm-reduction sites, processed through the parsing, excerpting, and writing stages this
                page describes.
              </p>
            </div>
          </ContentCard>

          <p className={`${PROSE_CLASS} mt-7`}>Two rules hold across all of it:</p>

          <p className={`${PROSE_CLASS} mt-4`}>
            <strong>Every article is human-reviewed.</strong> No article is shown to the public until a
            human expert reviewer has manually read and approved it: every article, every time, as a
            matter of principle. AI output is treated as a draft for review, never as something that
            publishes on its own. Section 09 describes the review process in detail.
          </p>

          <p className={`${PROSE_CLASS} mt-4`}>
            <strong>Every claim is source-bound.</strong> Models are given only verbatim excerpts of the
            source material to write from, under prompts that forbid claims not present in those
            excerpts. These constraints are written to reinforce grounded behavior, not assumed to
            guarantee it. The per-claim citations (section 08) and the final review exist to catch what
            slips through.
          </p>
        </section>

        <section id="s2" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>02</span>{" "}The pipeline at a glance
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            Source pages are gathered once as internal working copies, then flow through two parallel
            tracks: a <strong>deterministic track</strong> that parses structured data such as dosage
            tables and interaction matrices, and an <strong>AI track</strong> that turns the prose parts
            of the sources into excerpt documents and then into draft sections. Both tracks fill a draft
            article, which then receives per-claim citations and, last of all, a human expert review,
            the final gate before anything is published.
          </p>

          <div className={LEGEND_CLASS}>
            <div className={LEGEND_ITEM_CLASS}>
              <StageSwatch tone="source" /> Source material / external APIs
            </div>
            <div className={LEGEND_ITEM_CLASS}>
              <StageSwatch tone="automated" /> Automated processing
            </div>
            <div className={LEGEND_ITEM_CLASS}>
              <StageSwatch tone="stored" /> Stored data
            </div>
            <div className={LEGEND_ITEM_CLASS}>
              <StageSwatch tone="review" /> Human review
            </div>
            <div className={LEGEND_ITEM_CLASS}>
              <StageSwatch tone="published" /> Published output
            </div>
          </div>

          <div className="mt-6">
            <Mermaid
              chart={PIPELINE_DIAGRAM}
              title="Content pipeline: source pages through parsing/extraction, synthesis, human review, citation, and publication"
            />
          </div>
        </section>

        <section id="s3" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>03</span>{" "}The sources
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            Article content is built from ten harm-reduction and reference sites, plus one live API. We
            keep internal working copies of the relevant pages for processing. We do not republish other
            sites' content. Each article's <strong>source pages</strong> section links out to the
            original pages on the source sites themselves.
          </p>

          <ContentCard padding="none" className={`${TABLE_WRAP_CLASS} mt-6`}>
            <div className={TABLE_SCROLL_CLASS}>
              <table className={TABLE_CLASS}>
              <thead>
                <tr className={TABLE_HEAD_ROW_CLASS}>
                  <th className={TH_CLASS}>Source</th>
                  <th className={`${TH_CLASS} min-w-[14rem]`}>What we take from it</th>
                  <th className={TH_CLASS}>How it's processed</th>
                </tr>
              </thead>
              <tbody className="theme-text-secondary">
                <tr className={TR_CLASS}>
                  <td className="p-3">PsychonautWiki</td>
                  <td className="p-3">
                    Dosage and duration tables, subjective effects by intensity, toxicity /
                    interaction / tolerance prose, legal status, chemistry identifiers, pharmacology
                    prose.
                  </td>
                  <td className="space-y-1 p-3">
                    <Badge variant="secondary">parsed</Badge>{" "}
                    <Badge variant="default">excerpted</Badge>
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">
                    TripSit{" "}
                    <small className="theme-text-faint block">
                      three feeds: factsheets, wiki, combination guide
                    </small>
                  </td>
                  <td className="p-3">
                    Dosage tables, duration by route, effects lists, the drug-combination interaction
                    chart (dangerous / unsafe / caution / low-risk ratings), tolerance prose,
                    classifications.
                  </td>
                  <td className="space-y-1 p-3">
                    <Badge variant="secondary">parsed</Badge>{" "}
                    <Badge variant="default">excerpted</Badge>
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">Erowid</td>
                  <td className="p-3">
                    Dosage and duration ranges, effects descriptions, legal status, harm-reduction and
                    safety warnings, general narratives.
                  </td>
                  <td className="space-y-1 p-3">
                    <Badge variant="secondary">parsed</Badge>{" "}
                    <Badge variant="default">excerpted</Badge>
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">Wikipedia</td>
                  <td className="p-3">
                    General overviews, history, chemistry identifiers. Also used to discover citable
                    references, but never cited as a reference itself (section 08).
                  </td>
                  <td className="space-y-1 p-3">
                    <Badge variant="secondary">parsed</Badge>{" "}
                    <Badge variant="default">excerpted</Badge>
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">DrugBank</td>
                  <td className="p-3">
                    Chemical data (molecular weight, formula, CAS numbers), pharmacology descriptions,
                    drug and food interactions.
                  </td>
                  <td className="space-y-1 p-3">
                    <Badge variant="secondary">parsed</Badge>{" "}
                    <Badge variant="default">excerpted</Badge>
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">Isomer Design</td>
                  <td className="p-3">Effects and experience prose, chemical reference data.</td>
                  <td className="p-3">
                    <Badge variant="default">excerpted</Badge>
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">SaferParty</td>
                  <td className="p-3">
                    Harm reduction guidance, risk descriptions, safer-use notes.
                  </td>
                  <td className="p-3">
                    <Badge variant="default">excerpted</Badge>
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">The Drug Classroom</td>
                  <td className="p-3">
                    Educational overviews, mechanism and effects descriptions.
                  </td>
                  <td className="p-3">
                    <Badge variant="default">excerpted</Badge>
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">Disregard Everything I Say</td>
                  <td className="p-3">Subjective effect narratives and substance overviews.</td>
                  <td className="p-3">
                    <Badge variant="default">excerpted</Badge>
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">Drug Users Bible</td>
                  <td className="p-3">
                    Dosage, effects, and legality information; street-name nomenclature.
                  </td>
                  <td className="p-3">
                    <Badge variant="default">excerpted</Badge>
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">
                    ProtestKit <small className="theme-text-faint block">live API</small>
                  </td>
                  <td className="p-3">
                    Reagent test color reactions (Marquis, Mecke, Mandelin, Simon's, Froehde,
                    Liebermann, Ehrlich, and others), fetched at page view through a rate-limited proxy
                    with a static fallback.
                  </td>
                  <td className="p-3">
                    <Badge variant="secondary">live API</Badge>
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">
                    Stored, not yet used{" "}
                    <small className="theme-text-faint block">
                      Bluelight, D. M. Turner, Nervewing
                    </small>
                  </td>
                  <td className="p-3">
                    Archived in the source corpus but currently have no parser; not feeding article
                    content.
                  </td>
                  <td className="p-3">
                    <Badge variant="secondary">archived only</Badge>
                  </td>
                </tr>
              </tbody>
              </table>
            </div>
          </ContentCard>
        </section>

        <section id="s4" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>04</span>{" "}Where each section comes from
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            A substance article is not one document with one origin. Each section has its own production
            method. This table is the honest inventory: which sections are AI-synthesized, which are
            parsed directly from source tables by code, which come from a live API, and which are written
            or curated by hand. Every row, whatever its method, passes human review before publication.
          </p>

          <div className={LEGEND_CLASS}>
            <div className={LEGEND_ITEM_CLASS}>
              <StageSwatch tone="source" /> AI-synthesized from excerpts
            </div>
            <div className={LEGEND_ITEM_CLASS}>
              <StageSwatch tone="automated" /> Parsed by code
            </div>
            <div className={LEGEND_ITEM_CLASS}>
              <StageSwatch tone="published" /> Live API
            </div>
            <div className={LEGEND_ITEM_CLASS}>
              <StageSwatch tone="review" /> Manual / curated
            </div>
          </div>

          <ContentCard padding="none" className={`${TABLE_WRAP_CLASS} mt-6`}>
            <div className={TABLE_SCROLL_CLASS}>
              <table className={TABLE_CLASS}>
              <thead>
                <tr className={TABLE_HEAD_ROW_CLASS}>
                  <th className={TH_CLASS}>Article section</th>
                  <th className={TH_CLASS}>Method</th>
                  <th className={`${TH_CLASS} min-w-[14rem]`}>How it's made</th>
                </tr>
              </thead>
              <tbody className="theme-text-secondary">
                <tr className={TR_CLASS}>
                  <td className="p-3">Summary</td>
                  <td className="p-3">
                    <Badge variant="default">AI-synthesized</Badge>
                  </td>
                  <td className="p-3">
                    50–80 word overview written by Claude Opus 4.5 from the intro-text excerpts, under
                    the summary prompt (readable in section 07).
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">
                    Identification{" "}
                    <small className="theme-text-faint block">chemical names, SMILES, InChI, CAS</small>
                  </td>
                  <td className="space-y-1 p-3">
                    <Badge variant="secondary">parsed</Badge>{" "}
                    <Badge variant="success">curated</Badge>
                  </td>
                  <td className="p-3">
                    Chemistry identifiers merged from parsed sources (DrugBank, PsychonautWiki,
                    Wikipedia) with chemical-name resolution; provenance tracked per identifier;
                    editor-verified.
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">
                    Classification{" "}
                    <small className="theme-text-faint block">psychoactive / chemical classes</small>
                  </td>
                  <td className="space-y-1 p-3">
                    <Badge variant="secondary">parsed</Badge>{" "}
                    <Badge variant="success">curated</Badge>
                  </td>
                  <td className="p-3">
                    Class assignments parsed from sources; the site-wide classification trees are
                    hand-curated by editors.
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">Dosage tables</td>
                  <td className="p-3">
                    <Badge variant="secondary">parsed</Badge>
                  </td>
                  <td className="p-3">
                    Dose ranges per route parsed directly from TripSit, PsychonautWiki, and Erowid
                    tables. Where sources disagree on a dose for the same route, the smallest value is
                    used as authoritative, since it is safer to underdose than to overdose.
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">Duration tables</td>
                  <td className="p-3">
                    <Badge variant="secondary">parsed</Badge>
                  </td>
                  <td className="p-3">
                    Onset / peak / offset values per route, parsed from the same sources.
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">Subjective effects</td>
                  <td className="p-3">
                    <Badge variant="success">Josie Kins' work</Badge>
                  </td>
                  <td className="p-3">
                    Sourced from the subjective effects documentation work of{" "}
                    <a
                      href="https://en.wikipedia.org/wiki/Josie_Kins"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={proseLinkClassName}
                    >
                      Josie Kins
                    </a>
                    . Every effect links into the Subjective Effect Index built on her taxonomy.
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">Pharmacology</td>
                  <td className="p-3">
                    <Badge variant="default">AI-synthesized</Badge>
                  </td>
                  <td className="p-3">
                    Mechanism-of-action prose written from the pharmacology excerpts under the
                    pharmacology prompt (the strictest and longest of the prompts), then cited
                    claim-by-claim.
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">Interactions</td>
                  <td className="p-3">
                    <Badge variant="secondary">parsed</Badge>
                  </td>
                  <td className="p-3">
                    Drug-combination risk ratings mapped directly from the TripSit combination guide.
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">Harm potential</td>
                  <td className="p-3">
                    <Badge variant="default">AI-synthesized</Badge>
                  </td>
                  <td className="p-3">
                    Toxicity, addiction, and risk prose written from the harm-potential excerpts under
                    the harm potential prompt, then cited claim-by-claim.
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">Tolerance</td>
                  <td className="p-3">
                    <Badge variant="default">AI-synthesized</Badge>
                  </td>
                  <td className="p-3">
                    Tolerance and cross-tolerance prose from the tolerance excerpts, cited
                    claim-by-claim.
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">Legality</td>
                  <td className="p-3">
                    <Badge variant="default">AI-synthesized</Badge>
                  </td>
                  <td className="p-3">
                    Country-by-country legal status from the legality excerpts; structured legal fields
                    are also prepopulated by code where sources state them plainly.
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">History &amp; culture</td>
                  <td className="p-3">
                    <Badge variant="default">AI-synthesized</Badge>
                  </td>
                  <td className="p-3">
                    Discovery, medical history, and cultural context from the history-culture excerpts,
                    cited claim-by-claim.
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">Reagent testing</td>
                  <td className="p-3">
                    <Badge variant="secondary">live API</Badge>
                  </td>
                  <td className="p-3">
                    Color reactions fetched live from the ProtestKit API at page view, with stored
                    static results as fallback. Not produced by our pipeline at all.
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">Citations &amp; references</td>
                  <td className="space-y-1 p-3">
                    <Badge variant="default">AI-proposed</Badge>{" "}
                    <Badge variant="success">human-approved</Badge>
                  </td>
                  <td className="p-3">
                    References located and matched to claims by the citation workflow (section 08),
                    then checked in the final human review.
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">Trip reports</td>
                  <td className="p-3">
                    <Badge variant="success">human-written</Badge>
                  </td>
                  <td className="p-3">
                    First-person experience reports written by people; imported from the Effect Index
                    corpus with attribution.
                  </td>
                </tr>
                <tr className={TR_CLASS}>
                  <td className="p-3">Notes</td>
                  <td className="p-3">
                    <Badge variant="success">manual</Badge>
                  </td>
                  <td className="p-3">Editor-written remarks and caveats.</td>
                </tr>
              </tbody>
              </table>
            </div>
          </ContentCard>
        </section>

        <section id="s5" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>05</span>{" "}Stage one — scraping &amp; parsing
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            The source sites were scraped once and stored as plain-text working copies, per substance:
            internal processing material, not something we host or republish. From there,{" "}
            <strong>deterministic parsers</strong> (ordinary code, one per source site, no AI involved)
            read that text and extract the structured data: dose ranges by route, duration values,
            interaction ratings, chemical identifiers, legal classifications. Each site needs its own
            parser because each site structures its pages differently.
          </p>

          <ContentCard padding="none" className={`mt-6 ${DIVIDED_LIST_CLASS}`}>
            <div className={DIVIDED_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Table parsers</div>
              <p className={PROSE_CLASS}>
                <strong>TripSit factsheets</strong> and <strong>PsychonautWiki</strong> carry the most
                structured data: dose tiers (threshold / light / common / strong / heavy) per route of
                administration and onset / peak / offset durations. The parsers read these tables
                directly and transcribe the numbers as published. When multiple sources give different
                doses for the same route, we take the <strong>smallest</strong> as authoritative, a
                deliberate safety bias on the assumption that underdosing is the safer error.
              </p>
            </div>
            <div className={DIVIDED_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>The combination chart</div>
              <p className={PROSE_CLASS}>
                The <strong>TripSit combination guide</strong> is ingested as structured data and mapped
                onto substance pairs to produce the interaction ratings (dangerous, unsafe, caution,
                low-risk) shown on every article and on the Interactions hub.
              </p>
            </div>
            <div className={DIVIDED_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Chemistry identifiers</div>
              <p className={PROSE_CLASS}>
                SMILES strings, InChI keys, CAS numbers, and molecular data are merged from{" "}
                <strong>DrugBank</strong>, <strong>PsychonautWiki</strong>, and{" "}
                <strong>Wikipedia</strong>, with provenance tracked per identifier and chemical-name
                resolution used to fill gaps. Molecule images are rendered from the SMILES strings.
              </p>
            </div>
            <div className={DIVIDED_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Prose-heavy sources</div>
              <p className={PROSE_CLASS}>
                <strong>Erowid</strong>, <strong>Isomer Design</strong>, <strong>SaferParty</strong>,{" "}
                <strong>The Drug Classroom</strong>, <strong>Disregard Everything I Say</strong>, and the{" "}
                <strong>Drug Users Bible</strong> contribute mostly narrative text. Their parsers
                identify and label the relevant passages, which then feed the excerpt-extraction stage
                below.
              </p>
            </div>
          </ContentCard>
        </section>

        <section id="s6" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>06</span>{" "}Stage two — verbatim excerpt extraction
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            The source articles are long, and most of any given page is irrelevant to any one section. So
            before any writing happens, an extraction pass goes through every source article and{" "}
            <strong>copies out the passages relevant to each topic, word for word</strong>. Nothing is
            paraphrased, summarized, or reworded: an excerpt document contains exact copies of source
            text, complete paragraphs with formatting preserved, organized under a heading for each
            source. The result is one <strong>excerpt document</strong> per substance per topic, across
            eight topics:
          </p>

          <ContentCard padding="none" className={`mt-6 ${DIVIDED_LIST_CLASS}`}>
            <div className={DIVIDED_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>The excerpt topics</div>
              <ul className={`${LIST_CLASS} list-disc pl-5`}>
                <li>Intro text (feeds the summary)</li>
                <li>Dosage &amp; duration</li>
                <li>Subjective effects</li>
                <li>Pharmacology</li>
                <li>Tolerance</li>
                <li>Harm potential</li>
                <li>History &amp; culture</li>
                <li>Legality</li>
              </ul>
            </div>
            <div className={DIVIDED_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>The model never types the text</div>
              <p className={PROSE_CLASS}>
                Each source document is first split into numbered <strong>blocks</strong> — paragraphs,
                list items, table rows, headings — and the model reads that block-indexed version. It
                replies with nothing but the <strong>ids of the blocks to keep</strong>. A script then
                copies those blocks out of the source character for character and assembles the excerpt
                file. Because the model never emits source text, it has no opportunity to alter it.
              </p>
              <p className={`${PROSE_CLASS} mt-3`}>
                We built it the other way first, and it did not hold. Asking a model to reproduce a
                passage is asking it to re-type the passage, and re-typing is where drift enters: across
                one batch of 47 files it produced an "antihistamine" turned into "antihistaminic", a
                dropped "however,", and an organization's name shortened by two words. Small edits,
                easy to miss, in text whose only job is to be an exact copy. Selecting blocks instead of
                transcribing them removes the opportunity rather than warning against it.
              </p>
            </div>
            <div className={DIVIDED_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Checked afterwards, not trusted</div>
              <p className={PROSE_CLASS}>
                Every finished excerpt file is then run through a <strong>verbatim audit</strong>: a
                script, no model involved, that requires each passage to appear in the staged source
                under the same source heading as an exact substring. A file that drifts is rejected
                rather than published onward. Every source also keeps its heading in the output even
                when it yielded nothing, carrying a marker line such as{" "}
                <em>No tolerance content found.</em> — so "we looked and there was nothing" stays
                distinguishable from "this source was skipped".
              </p>
            </div>
            <div className={DIVIDED_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Why verbatim matters</div>
              <p className={PROSE_CLASS}>
                The excerpt documents are the <strong>only material</strong> the writing stage is allowed
                to see. Because they are word-for-word copies, our reviewers can trace anything a draft
                says back to a specific passage on a specific source page during review. Extraction errs
                toward over-inclusion: the instruction is to include anything even tangentially relevant
                rather than risk losing safety-critical information.
              </p>
            </div>
          </ContentCard>

          <p className="theme-text-faint mt-7 text-xs font-semibold uppercase tracking-[0.18em]">
            A real excerpt document
          </p>
          <details className={`${DETAILS_CLASS} mt-3`}>
            <DetailsSummary>
              Example — the 2C-B intro-text excerpt document (unedited)
            </DetailsSummary>
            <div className="mt-3">
              <p className={PROMPT_META_CLASS}>
                This is the actual working file for 2C-B's intro-text topic: verbatim passages from each
                source, grouped under source headings. The summary section of the 2C-B article was
                written from this document and nothing else.
              </p>
              <pre className={PROMPT_BODY_CLASS}>{INTRO_QUOTES}</pre>
            </div>
          </details>

          <p className="theme-text-faint mt-7 text-xs font-semibold uppercase tracking-[0.18em]">
            The extraction prompts
          </p>
          <p className={`${PROSE_CLASS} mb-3 mt-2`}>
            All eight extraction prompts are shown below, unedited — the same files the pipeline reads,
            one per topic, kept in <code>scripts/prompts/</code>. All eight run the same way: one model
            (<code>gpt-5.6-terra</code>, invoked through <code>codex exec</code>), one call per substance
            and topic, with the block-selection contract described above appended after the prompt. Each
            prompt's job is to define what counts as relevant to its topic; the surrounding harness owns
            the output format and the copying.
          </p>

          <details className={`${DETAILS_CLASS} mt-3`}>
            <DetailsSummary>Extraction prompt — intro text</DetailsSummary>
            <pre className={PROMPT_BODY_CLASS}>{EX_INTRO}</pre>
          </details>
          <details className={`${DETAILS_CLASS} mt-3`}>
            <DetailsSummary>Extraction prompt — dosage &amp; duration</DetailsSummary>
            <pre className={PROMPT_BODY_CLASS}>{EX_DOSAGE_DURATION}</pre>
          </details>
          <details className={`${DETAILS_CLASS} mt-3`}>
            <DetailsSummary>Extraction prompt — subjective effects</DetailsSummary>
            <pre className={PROMPT_BODY_CLASS}>{EX_SUBJECTIVE_EFFECTS}</pre>
          </details>
          <details className={`${DETAILS_CLASS} mt-3`}>
            <DetailsSummary>Extraction prompt — pharmacology</DetailsSummary>
            <pre className={PROMPT_BODY_CLASS}>{EX_PHARMACOLOGY}</pre>
          </details>
          <details className={`${DETAILS_CLASS} mt-3`}>
            <DetailsSummary>Extraction prompt — tolerance</DetailsSummary>
            <pre className={PROMPT_BODY_CLASS}>{EX_TOLERANCE}</pre>
          </details>
          <details className={`${DETAILS_CLASS} mt-3`}>
            <DetailsSummary>Extraction prompt — harm potential</DetailsSummary>
            <pre className={PROMPT_BODY_CLASS}>{EX_HARM}</pre>
          </details>
          <details className={`${DETAILS_CLASS} mt-3`}>
            <DetailsSummary>Extraction prompt — history &amp; culture</DetailsSummary>
            <pre className={PROMPT_BODY_CLASS}>{EX_HISTORY}</pre>
          </details>
          <details className={`${DETAILS_CLASS} mt-3`}>
            <DetailsSummary>Extraction prompt — legality</DetailsSummary>
            <pre className={PROMPT_BODY_CLASS}>{EX_LEGALITY}</pre>
          </details>
        </section>

        <section id="s7" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>07</span>{" "}Stage three — AI synthesis, and every prompt we use
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            Six sections of the finished article are AI-written end to end:{" "}
            <strong>
              summary, pharmacology, tolerance, harm potential, history &amp; culture, and legality
            </strong>
            . Each is produced by Claude Opus 4.5 from exactly two inputs: the excerpt document for that
            topic, and a <strong>section-specific prompt</strong>. The two remaining excerpt topics,
            dosage &amp; duration and subjective effects, are used more narrowly: those sections come
            from parsed tables and from Josie Kins' effect taxonomy, and the excerpts are only used to
            fill documented gaps in them, never to overwrite what is already there. The prompts all
            share the same
            skeleton: a style definition, a hard evidence rule, a fixed output format, worked examples,
            and a validation checklist. They all contain two constraints that define the whole system:
          </p>

          <ContentCard padding="none" className={`mt-6 ${DIVIDED_LIST_CLASS}`}>
            <div className={DIVIDED_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Evidence only</div>
              <p className={PROSE_CLASS}>
                "Every claim must be explicitly stated or clearly implied in the source quotes. If
                information cannot be verified from the provided sources, do not include it." This pushes
                the model to behave as a rewriter of evidence rather than an author. It is reinforcement,
                not a guarantee, which is why the citation pass and human review come after.
              </p>
            </div>
            <div className={DIVIDED_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Original prose only</div>
              <p className={PROSE_CLASS}>
                "Synthesize information from the provided excerpts into original prose. Do not copy
                sentences or lengthy phrases verbatim from any source." The verbatim text exists only in
                the internal excerpt documents; what gets published is a new piece of writing constrained
                by that evidence.
              </p>
            </div>
          </ContentCard>

          <p className={`${PROSE_CLASS} mt-7`}>
            Below are the section prompts for all six fully AI-written sections, unedited, largest to
            smallest. These
            are the live instructions, the same files the pipeline runs. Reading the pharmacology or harm
            potential prompt is the fastest way to understand how much of each section's quality comes
            from the prompt rather than the model.
          </p>

          <details className={`${DETAILS_CLASS} mt-3`}>
            <DetailsSummary>Section prompt — pharmacology (27 KB)</DetailsSummary>
            <pre className={PROMPT_BODY_CLASS}>{SEC_PHARMACOLOGY}</pre>
          </details>
          <details className={`${DETAILS_CLASS} mt-3`}>
            <DetailsSummary>Section prompt — harm potential (23 KB)</DetailsSummary>
            <pre className={PROMPT_BODY_CLASS}>{SEC_HARM}</pre>
          </details>
          <details className={`${DETAILS_CLASS} mt-3`}>
            <DetailsSummary>Section prompt — history &amp; culture (8 KB)</DetailsSummary>
            <pre className={PROMPT_BODY_CLASS}>{SEC_HISTORY}</pre>
          </details>
          <details className={`${DETAILS_CLASS} mt-3`}>
            <DetailsSummary>Section prompt — legality (10 KB)</DetailsSummary>
            <pre className={PROMPT_BODY_CLASS}>{SEC_LEGALITY}</pre>
          </details>
          <details className={`${DETAILS_CLASS} mt-3`}>
            <DetailsSummary>Section prompt — summary (5 KB)</DetailsSummary>
            <pre className={PROMPT_BODY_CLASS}>{SEC_SUMMARY}</pre>
          </details>
          <details className={`${DETAILS_CLASS} mt-3`}>
            <DetailsSummary>Section prompt — tolerance (6 KB)</DetailsSummary>
            <pre className={PROMPT_BODY_CLASS}>{SEC_TOLERANCE}</pre>
          </details>

          <ContentCard variant="subtle" padding="md" className="mt-5">
            <p className={NOTE_CLASS}>
              <strong>The prompts are part of the project.</strong> They are version-controlled alongside
              the code, and the live copies are editable by the editorial team. Improving a prompt improves
              every article generated after it. There is also a separate family of citation prompts used by
              the citation workflow (section 08).
            </p>
          </ContentCard>
        </section>

        <section id="s8" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>08</span>{" "}Stage four — citations
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            Once an article's prose is drafted, a separate workflow adds{" "}
            <strong>per-claim citations</strong> to the six prose-heavy sections: summary, pharmacology,
            tolerance, harm potential, history &amp; culture, and legality. The goal is the standard
            Wikipedia-style property: a reader can pick any sentence and follow a numbered reference to a
            real source that supports it. Citations are in place <em>before</em> the article goes to its
            final human review, so the reviewer is checking a finished, fully-referenced article.
          </p>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <PipelineStep num={1} name="Split claims" tone="automated">
              Each citable section is broken into its individual factual claims
            </PipelineStep>
            <div className={PIPELINE_ARROW_CLASS}>→</div>
            <PipelineStep num={2} name="Find references" tone="automated">
              Workers search the literature for sources that directly support each claim
            </PipelineStep>
            <div className={PIPELINE_ARROW_CLASS}>→</div>
            <PipelineStep num={3} name="Mark" tone="automated">
              Citation markers are inserted into the text; nothing else may change, byte for byte
            </PipelineStep>
            <div className={PIPELINE_ARROW_CLASS}>→</div>
            <PipelineStep num={4} name="Evidence" tone="stored">
              Each citation stores the verbatim supporting quote from its reference
            </PipelineStep>
            <div className={PIPELINE_ARROW_CLASS}>→</div>
            <PipelineStep num={5} name="Validate & apply" tone="stored">
              A validation gate checks every marker maps to evidence before citations join the draft
            </PipelineStep>
          </div>

          <ContentCard padding="none" className={`mt-6 ${DIVIDED_LIST_CLASS}`}>
            <div className={DIVIDED_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Reference standards</div>
              <ul className={`${LIST_CLASS} list-disc pl-5`}>
                <li>
                  <strong>Wikis are never citations.</strong> Wikipedia and PsychonautWiki are used to
                  discover references, but the references themselves are journals, government documents,
                  drug labels, and books.
                </li>
                <li>
                  <strong>Page-specific identifiers</strong> — repeated same-site sources (e.g. DailyMed
                  drug labels) get distinct per-page reference IDs so different documents never collapse
                  into one citation.
                </li>
                <li>
                  <strong>Paywalled papers are allowed</strong> when their accessible abstract directly
                  supports the claim; these are recorded as abstract-only so the limitation is explicit.
                </li>
              </ul>
            </div>
            <div className={DIVIDED_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>What you see on the page</div>
              <p className={PROSE_CLASS}>
                Citations render as numbered superscript markers in the text, linked to the reference
                list at the bottom of each article. Behind each marker is a stored evidence record
                (claim, reference, and the verbatim quote that supports it), which is how citation quality
                gets audited over time.
              </p>
            </div>
          </ContentCard>
        </section>

        <section id="s9" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>09</span>{" "}Stage five — human review, every article, no exceptions
          </h2>

          <p className={PULL_CLASS}>
            A <strong>human expert reviewer manually reviews every single article</strong> before the
            public is ever allowed to see it. Not a sample. Not the flagged ones. Every article, as a
            matter of principle.
          </p>

          <p className={`${PROSE_CLASS} mt-5`}>
            Human review is the last stage of the pipeline and the only gate to publication. Our expert
            reviewer, <strong>Lyrea</strong>, is a subject-domain expert in psychopharmacology, fully
            verified by{" "}
            <a
              href="https://en.wikipedia.org/wiki/Josie_Kins"
              target="_blank"
              rel="noopener noreferrer"
              className={proseLinkClassName}
            >
              Josie Kins
            </a>{" "}
            and credited on the About page. She carefully reads and fact-checks each finished article,
            prose and citations alike, and edits it as needed before allowing publication. We treat AI
            output the way a journal treats a submitted manuscript: useful, structured, and unpublishable
            until a qualified person has gone through it.
          </p>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <PipelineStep num={1} name="Read & fact-check" tone="review">
              The full article is read carefully against the excerpt documents and sources
            </PipelineStep>
            <div className={PIPELINE_ARROW_CLASS}>→</div>
            <PipelineStep num={2} name="Edit" tone="review">
              Errors, overstatements, and omissions are fixed directly in the editing environment
            </PipelineStep>
            <div className={PIPELINE_ARROW_CLASS}>→</div>
            <PipelineStep num={3} name="Diff" tone="review">
              Before saving, the editor shows an exact diff of every change being made
            </PipelineStep>
            <div className={PIPELINE_ARROW_CLASS}>→</div>
            <PipelineStep num={4} name="Log" tone="stored">
              Every save is recorded in a permanent changelog: who, when, and the full diff
            </PipelineStep>
            <div className={PIPELINE_ARROW_CLASS}>→</div>
            <PipelineStep num={5} name="Approve & publish" tone="published">
              Only articles that pass this review are published to the public site
            </PipelineStep>
          </div>

          <p className={`${PROSE_CLASS} mt-7`}>
            The audit trail is permanent: every edit to every article is stored with the editor's
            identity, a timestamp, and a line-by-line diff of what changed. Regeneration works the same
            way: if a section is re-drafted with an improved prompt, the new draft goes through the same
            review and the same changelog before replacing anything public.
          </p>
        </section>

        <section id="s10" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>10</span>{" "}The open dataset
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            This pipeline produces more than public pages. It produces{" "}
            <code>SubstanceIndex.json</code>: the full substance database in one consistent schema and
            one downloadable file. In short:
          </p>

          <p className={PULL_CLASS}>
            dose.wiki is a modern, open-source harm-reduction reference for psychoactive substances and
            subjective effects. It makes substance knowledge readable, verifiable, and reusable instead
            of leaving it scattered across separate sites and closed data systems.
          </p>

          <p className={`${PROSE_CLASS} mt-5`}>
            The goal is practical: researchers, developers, educators, and community projects should be
            able to download the corpus, inspect its structure, fork it, and build from it directly. A
            harm-reduction encyclopedia should not have to be rebuilt from scratch every time someone
            wants better tools around the same underlying knowledge.
          </p>

          <p className={`${PROSE_CLASS} mt-4`}>
            That is why the pipeline is built around structure, provenance, and review. Automation
            handles the repetitive assembly; human effort stays focused on the parts that need judgment:
            citations, fact-checking, corrections, and expert review.
          </p>

          <p className={`${PROSE_CLASS} mt-4`}>
            The dataset is not a byproduct of the website. It is part of the point. Every article follows
            the same JSON schema, the full database downloads in one file, and the CC0 dedication lets
            others build on it without permission requests or attribution requirements.
          </p>
        </section>

        <section id="s11" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>11</span>{" "}Originality &amp; licensing
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            This pipeline begins with published sources, so the licensing boundary matters. The sources
            inform the work; the public dataset is new dose.wiki expression and structure, with
            independent review.
          </p>

          <ContentCard padding="none" className={`mt-6 ${DIVIDED_LIST_CLASS}`}>
            <div className={DIVIDED_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>The public prose is new writing</div>
              <p className={PROSE_CLASS}>
                Verbatim source text stays in internal excerpt files, like research notes. Published
                article prose is drafted with instructions not to copy source wording, checked against
                citations, and edited by a human reviewer before publication.
              </p>
            </div>
            <div className={DIVIDED_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Facts are not owned</div>
              <p className={PROSE_CLASS}>
                A synthesis year, dose range, receptor target, or legal status is a fact. Copyright
                protects expression, not the underlying fact. dose.wiki uses its own wording, schema, and
                article structure, with claims re-checked against citable references.
              </p>
            </div>
            <div className={DIVIDED_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>Sources stay visible</div>
              <p className={PROSE_CLASS}>
                Articles link back to their source pages and cite supporting references. dose.wiki does
                not republish the source pages themselves; it makes the provenance visible while turning
                verified information into a cleaner, reusable format.
              </p>
            </div>
            <div className={DIVIDED_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>The reusable parts are CC0</div>
              <p className={PROSE_CLASS}>
                dose.wiki-authored writing, structured data, schema work, generated molecule assets, and
                report-form submissions whose contributors accept CC0 terms are dedicated to the{" "}
                <strong>public domain under CC0</strong>. Anyone may share, adapt, or build on them,
                commercially or not, with no attribution required. Legacy trip reports, TripSit data,
                protestkit.eu data, and media with separate rights keep their own terms; the{" "}
                <a href="/docs/license" target="_top" className={proseLinkClassName}>
                  license page
                </a>{" "}
                lists those boundaries.
              </p>
            </div>
          </ContentCard>

          <ContentCard variant="subtle" padding="md" className="mt-6">
            <p className={NOTE_CLASS}>
              <strong>Questions or corrections?</strong> The parsers, prompts, and citation tooling
              described here live in the project repository. Each article exposes its citations and source
              links, and dose.wiki keeps an internal edit history showing how the article reached its
              current state.
            </p>
          </ContentCard>

          <ContentCard variant="subtle" padding="md" className="mt-4">
            <p className={NOTE_CLASS}>
              <strong>Curious how the site itself is built?</strong> This page covers article production.
              For the codebase, architecture, data layer, and public-site systems, read{" "}
              <a href="/docs/code" target="_top" className={proseLinkClassName}>
                How dose.wiki is built
              </a>
              .
            </p>
          </ContentCard>
        </section>

        {/*
          Back-to-top escape hatch for small screens. The sticky gutter TOC only
          appears at >=1200px, so below that this is the persistent way back to
          the top of a very long page. Hidden where the sticky TOC takes over.
        */}
        <Button
          asChild
          variant="glass"
          size="icon"
          aria-label="Back to top"
          className="fixed bottom-5 right-5 z-30 shadow-[var(--theme-elevation-lg)] backdrop-blur min-[1200px]:hidden"
        >
          <a href="#main-content">
            <Icon icon="lucide:arrow-up" size={18} />
          </a>
        </Button>
      </StickyTocLayout>
    </main>
  );
}
