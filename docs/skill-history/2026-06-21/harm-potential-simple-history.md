---
name: harm-potential-simple
description: Extract verbatim harm-related text from source articles (single-agent version)
---

# Harm Potential Extraction (Simple)

Extract verbatim harm-related text from source articles for substances. Process one substance at a time, reading source files directly and compiling harm-related content.

Output goes to `harmpotential-quotes/{slug}-harmpotential.md`.

---

## How to Use

1. Find the next unchecked `- [ ]` substance in the Task Tracker below
2. Process it following the steps in this file
3. Mark it complete and optionally continue to the next one

---

## Step 1: Read the Source File

Read the full source file at:
```
src/data/article-sources/{slug}.ts
```

The file has this structure:
```typescript
export const sources = [
  {"id":"psychonautwiki","fileName":"...","displayName":"PsychonautWiki",...},
  {"id":"drugbank","fileName":"...","displayName":"DrugBank",...},
  // ... more sources
];

export const contents = {
  "psychonautwiki": `
    ... markdown content ...
  `,
  "drugbank": `
    ... markdown content ...
  `,
  // ... more content
};
```

---

## Step 2: Extract Harm Content

For EACH source in the `contents` object, look for ANY text related to:

- **Addiction** - addiction potential, abuse potential, habit-forming
- **Dependence** - physical dependence, psychological dependence, withdrawal
- **Lethal dose** - LD50, fatal dose, overdose deaths, lethal toxicity
- **Organ toxicity** - liver damage, kidney damage, heart damage, brain damage
- **Carcinogenicity** - cancer risk, carcinogenic
- **Neurotoxicity** - nerve damage, brain damage
- **Psychosis** - psychotic episodes, hallucinations (negative), paranoia
- **Self-harm** - suicidal ideation, self-injury
- **Seizures** - convulsions, epileptic episodes
- **Other risks** - any other notable health warnings

### Extraction Rules

- Extract **COMPLETE SECTIONS** - don't break paragraphs
- If you find a header like "## Toxicity" or "## Harm Potential", take the ENTIRE section
- If harm info is in a paragraph, take the WHOLE paragraph
- **ERR ON THE SIDE OF MORE TEXT** - better to include extra context
- Preserve all markdown formatting (headers, lists, bold, links)
- Extract VERBATIM - do not paraphrase or summarize

---

## Step 3: Write Output File

Create the output file at:
```
harmpotential-quotes/{slug}-harmpotential.md
```

Use this format:

```markdown
# {Substance Name} - Harm Potential Quotes

> Verbatim extractions from source articles. Generated {YYYY-MM-DD}.

---

## Source: PsychonautWiki

[paste extracted content here]

---

## Source: DrugBank

[paste extracted content here]

---

## Source: TripSit

[paste extracted content here]

---

... etc for each source that had harm content
```

**Rules:**
- Only include sources that HAD harm content
- Skip sources with no relevant content
- Use `---` between sources for visual separation
- Preserve original markdown formatting

---

## Step 4: Update Task Tracker

After writing the file, update this SKILL-simple.md:

- Change `- [ ] slug` to `- [x] slug (YYYY-MM-DD)`
- If NO sources had harm content: `- [x] slug (YYYY-MM-DD) - NO HARM CONTENT`

---

## Source Key Reference

| Source | Key in `contents` |
|--------|-------------------|
| TripSit Factsheets | `tripsit-factsheets` |
| TripSit Wiki | `tripsit-wiki` |
| PsychonautWiki | `psychonautwiki` |
| Erowid | `erowid` |
| DrugBank | `drugbank` |
| DEIS | `disregardeverythingisay` |
| The Drug Classroom | `thedrugclassroom` |
| Drug Users Bible | `drugusersbible` |
| SaferParty | `saferparty` |
| Wikipedia | `wikipedia` |
| Isomer Design | `isomerdesign` |

---

## Task Tracker

**Remaining:** 0

- [x] tapentadol (2026-01-12)
- [x] temazepam (2026-01-12)
- [x] thiopental (2026-01-12)
- [x] thiopropamine (2026-01-12)
- [x] tianeptine (2026-01-12)
- [x] tma-2 (2026-01-12)
- [x] tma-6 (2026-01-12)
- [x] tramadol (2026-01-12)
- [x] trazodone (2026-01-12)
- [x] triazolam (2026-01-12)
- [x] valerylfentanyl (2026-01-12)
- [x] zolpidem (2026-01-12)
- [x] zopiclone (2026-01-12)
