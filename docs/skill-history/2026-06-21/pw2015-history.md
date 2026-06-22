---
name: pw2015
description: Convert PsychonautWiki 2015 Archive content into subjective_effects format
---

# PsychonautWiki 2015 Archive Subjective Effects Converter

Convert archived PsychonautWiki 2015 content from the Internet Archive into the `subjective_effects` schema format.

## Usage

```
/pw2015 <substance-name>
```

Example: `/pw2015 cannabis`

---

## Step 1: Locate the PW-2015 Source

Find the source file at `archive/pw-2015/{substance}.md`.

File naming conventions to try:
- Lowercase with hyphens: `25c-nbome.md`
- Lowercase: `cannabis.md`
- Mixed case: `MDMA.md`, `DPT.md`

If the substance is not found, list available PW-2015 articles:
```bash
ls archive/pw-2015/
```

---

## Step 2: Extract Metadata

### Last Modified Date
Find the line containing "This page was last modified on" near the end of the file:
```
This page was last modified on 10 September 2015, at 10:25.
```
Extract the date in "Month Year" format (e.g., "September 2015").

### Internet Archive URL
The archive URL is on the last non-empty line of the file:
```
https://web.archive.org/web/20150921125720/https://psychonautwiki.org/wiki/Amphetamine
```

---

## Step 3: Extract Subjective Effects Content

Parse the markdown and extract these sections:

### Physical Effects
- Look for `Physical effects` header (may have level 2 or 3 heading, or just be text)
- Extract bullet points with their descriptions
- Many effects have inline descriptions after the effect name

### Cognitive Effects
- Look for `Cognitive effects` header
- Extract the intro paragraph if present → goes to `notes.cognitive`
- Extract bullet points (often have descriptions)

### Visual Effects
- Look for `Visual effects` header
- Split into subcategories:
  - `Enhancements` → effects like "Visual acuity enhancement", "Colour enhancement"
  - `Distortions` → effects like "Drifting", "Tracers", "After images"
  - `Geometry` → usually a prose description (NOT individual effects)
  - `Hallucinatory states` → "Transformations", "Internal hallucinations", "External hallucinations"

### Auditory Effects
- Look for `Auditory effects` header
- Usually contains: Enhancements, Distortions, Hallucinations

### Multi-sensory Effects
- Look for `Multi-sensory effects` header
- Effects like "Synaesthesia"

### Combinational Effects (if present)
- These describe interactions with other drug classes
- Extract as notes if present, or skip if not relevant to subjective effects

---

## Step 4: Transform to Schema Format

```json
{
  "subjective_effects": {
    "notes": {
      "overview": "",
      "sensory": "",
      "cognitive": "<intro paragraph about the headspace/cognitive style>",
      "physical": ""
    },
    "sensory": {
      "visual": {
        "note": "",
        "subcategories": {
          "Enhancements": {
            "note": "",
            "effects": [
              { "name": "Visual acuity enhancement", "description": "" },
              { "name": "Colour enhancement", "description": "" },
              { "name": "Pattern recognition enhancement", "description": "" }
            ]
          },
          "Distortions": {
            "note": "",
            "effects": [
              { "name": "Drifting", "description": "(Melting, Breathing, Morphing and Flowing) - <description>" },
              { "name": "Tracers", "description": "" },
              { "name": "After images", "description": "" }
            ]
          },
          "Geometry": {
            "note": "<full prose description of geometry characteristics>",
            "effects": []
          },
          "Hallucinatory States": {
            "note": "<intro if present>",
            "effects": [
              { "name": "Transformations", "description": "" },
              { "name": "External hallucinations", "description": "<detailed description>" },
              { "name": "Internal hallucinations", "description": "<detailed description>" }
            ]
          }
        }
      },
      "auditory": {
        "note": "",
        "subcategories": {
          "General": {
            "note": "",
            "effects": [
              { "name": "Enhancements", "description": "" },
              { "name": "Distortions", "description": "" },
              { "name": "Hallucinations", "description": "" }
            ]
          }
        }
      },
      "tactile": { "note": "", "subcategories": {} },
      "olfactory": { "note": "", "subcategories": {} },
      "gustatory": { "note": "", "subcategories": {} },
      "multisensory": {
        "note": "",
        "subcategories": {
          "General": {
            "note": "",
            "effects": [
              { "name": "Synaesthesia", "description": "" }
            ]
          }
        }
      }
    },
    "cognitive": {
      "General": {
        "note": "",
        "effects": [
          { "name": "Effect name", "description": "<description if present>" }
        ]
      }
    },
    "physical": {
      "General": {
        "note": "",
        "effects": [
          { "name": "Effect name", "description": "<description>" }
        ]
      }
    },
    "attribution": {
      "author": "Josie Kins",
      "text": "Forked from Subjective Effect Documentation by Josie Kins, September 2015.",
      "url": "https://web.archive.org/web/20150921125720/https://psychonautwiki.org/wiki/Amphetamine"
    }
  }
}
```

---

## Transformation Rules

### Keep These Patterns

1. **Effect descriptions with detailed explanations**: Keep as-is
   - Example: `"Spontaneous tactile sensations - The body high of cannabis is extremely variable..."`

2. **Comparative statements**: Preserve in descriptions or notes
   - Example: `"In comparison to other psychedelics..."`

3. **Geometry prose**: Convert entire paragraph to `note` field, leave `effects` array empty

4. **Dosage-dependent descriptions**: Preserve as-is
   - Example: `"progressively intensify proportional to dosage"`

### Preserve Original Text

Extract all effect names and descriptions **exactly as written** in the source. Do not normalize spelling (keep "Colour" not "Color"), do not rephrase descriptions, and do not modify effect names to match other conventions.

### Exclude This Content

| Content Type | Reason |
|--------------|--------|
| Dosage/Duration tables | Goes to `dosage`/`duration` sections |
| Chemistry section | Goes to `identification` section |
| Pharmacology section | Goes to `pharmacology` section |
| Toxicity and harm potential | Goes to `harm_potential` section |
| Legal issues | Goes to `legality` section |
| Experience reports | Drop entirely |
| Navigation menu/footer | Drop entirely (site chrome) |
| References section | Drop entirely |

---

## Step 5: Present for Review

Before applying changes, show the user:
1. Summary of extracted content by category
2. Number of effects in each section
3. Any special handling (geometry notes, multi-sensory effects)
4. The attribution details (date and URL)
5. Ask for confirmation or modifications

---

## Step 6: Add Attribution

Every article with PW-2015-sourced subjective effects MUST include an attribution field.

### Attribution Format

```json
{
  "attribution": {
    "author": "Josie Kins",
    "text": "Forked from Subjective Effect Documentation by Josie Kins, September 2015.",
    "url": "https://web.archive.org/web/20150921125720/https://psychonautwiki.org/wiki/Amphetamine"
  }
}
```

- **author**: Always `"Josie Kins"` for PW-2015 content
- **text**: `"Forked from Subjective Effect Documentation by Josie Kins, {Month} {Year}."`
- **url**: The full Internet Archive URL from the end of the source file

### UI Rendering

The attribution displays as a right-aligned banner at the bottom of the Subjective Effects section with:
- Josie's avatar (links to her profile)
- The attribution text (author name links to profile, rest links to original article)
- External link icon

---

## Step 7: Apply Changes

1. Resolve the target article through the `/dev` editor, a Convex-backed read helper, or the approved script path.
2. Update the `subjective_effects` field through the authenticated app/API/script write path, including attribution.
3. Sync to production with `npm run convex:sync-production -- --confirm-production-sync` if the dev write should go live.
4. Report success and provide the current local verification URL.

---

## Reference: PW-2015 File Format

Each PW-2015 archive file has this structure:

```
Wayback Machine
[capture count] captures
[date range]
[calendar info]
About this capture
[Substance Name]
[Content sections...]

This page was last modified on [DD] [Month] [YYYY], at [HH:MM].
Content is available under Creative Commons Attribution-ShareAlike 4.0 International unless otherwise noted.

[Footer content...]

https://web.archive.org/web/[timestamp]/https://psychonautwiki.org/wiki/[Substance]
```

### Key Extraction Points

1. **Last modified date**: Line starting with "This page was last modified on"
2. **Archive URL**: Last line of file (starts with `https://web.archive.org/`)
3. **Subjective effects**: Section between "Subjective effects" header and "Toxicity" header

---

## Task Tracker

69 substances have PW-2015 archive content available in `archive/pw-2015/`.

### Progress: 68/69 Completed (99%)

### Remaining (1)

| Substance | Source File | Status |
|-----------|-------------|--------|
| Poppers | `poppers.md` | ⬜ No article in database |

### Completed (68)

| Substance | Source File | Completed |
|-----------|-------------|-----------|
| 1,4-Butanediol | `14bd.md` | ✅ |
| 2-Aminoindane | `2-aminoindane.md` | ✅ |
| 2-FMA | `2fma.md` | ✅ |
| 2-Methyl-2-butanol | `2-methyl-2-butanol.md` | ✅ |
| 25C-NBOMe | `25c-nbome.md` | ✅ |
| 25D-NBOMe | `25D-nbome.md` | ✅ |
| 25N-NBOMe | `25n-nbome.md` | ✅ |
| 2C-D | `2cd.md` | ✅ |
| 3-FPM | `3-fpm.md` | ✅ |
| 4-FA | `4fa.md` | ✅ |
| 5-MeO-DALT | `5-meo-dalt.md` | ✅ |
| A-PVP | `a-pvp.md` | ✅ |
| Alcohol | `alcohol.md` | ✅ |
| Alprazolam | `alprazolam.md` | ✅ |
| Amphetamine | `amphetamine.md` | ✅ |
| Benzydamine | `benzydamine.md` | ✅ |
| Caffeine | `caffiene.md` | ✅ |
| Cannabis | `cannabis.md` | ✅ |
| Clonazepam | `clonazepam.md` | ✅ |
| Clonazolam | `clonazolam.md` | ✅ |
| Cocaine | `cocaine.md` | ✅ |
| Codeine | `codiene.md` | ✅ |
| Dehydroxyfluorafinil | `dehydroxyfluorafinil.md` | ✅ |
| Deschloroetizolam | `deschloroetizolam.md` | ✅ |
| Diazepam | `diazepam.md` | ✅ |
| Diclazepam | `diclazepam.md` | ✅ |
| Dihydrocodeine | `dihydrocodiene.md` | ✅ |
| DOB | `dob.md` | ✅ |
| DOM | `dom.md` | ✅ |
| DPT | `DPT.md` | ✅ |
| Escaline | `escaline.md` | ✅ |
| Ethylmorphine | `ethylmorphine.md` | ✅ |
| Ethylphenidate | `ethylphenidate.md` | ✅ |
| Etizolam | `etizolam.md` | ✅ |
| Flubromazolam | `flubromazelam.md` | ✅ |
| Flubromazepam | `flubromazepam.md` | ✅ |
| Gabapentin | `gabapentin.md` | ✅ |
| GBL | `gbl.md` | ✅ |
| GHB | `ghb.md` | ✅ |
| Heroin | `heroin.md` | ✅ |
| Isopropylphenidate | `isopropylphenidate.md` | ✅ |
| Kratom | `kratom.md` | ✅ |
| Lorazepam | `lorazepam.md` | ✅ |
| MDAI | `mdai.md` | ✅ |
| MDMA | `MDMA.md` | ✅ |
| Mephedrone | `mephedrone.md` | ✅ |
| Mescaline | `mesclaine.md` | ✅ |
| Methamphetamine | `methamphetamine.md` | ✅ |
| Methaqualone | `methaqualone.md` | ✅ |
| Methiopropamine | `methiopropramine.md` | ✅ |
| Methylone | `methylone.md` | ✅ |
| Methylphenidate | `methylphenidate.md` | ✅ |
| Mirtazapine | `mirtazapine.md` | ✅ |
| Modafinil | `modafinil.md` | ✅ |
| Nicotine | `nicotine.md` | ✅ |
| Nifoxipam | `nifoxipam.md` | ✅ |
| NM-2AI | `nm2ai.md` | ✅ |
| Noopept | `noopept.md` | ✅ |
| O-Desmethyltramadol | `odesmethyltramadol.md` | ✅ |
| Oxycodone | `oxycodone.md` | ✅ |
| Phenibut | `phenibut.md` | ✅ |
| Pregabalin | `pregabalin.md` | ✅ |
| Prochlorperazine | `prochlorperazine.md` | ✅ |
| Pyrazolam | `pyrazolam.md` | ✅ |
| Quetiapine | `quetiapine.md` | ✅ |
| Tianeptine | `tianeptine.md` | ✅ |
| Tramadol | `tramadol.md` | ✅ |
| Zopiclone | `zopiclone.md` | ✅ |

---

## Maintaining This Tracker

### After Completing a Transcription

1. Move the substance row from **Remaining** to **Completed** table
2. Change the status from `⬜ Pending` to `✅`
3. Update the progress count at the top (e.g., `1/69 Completed (1%)`)
4. Keep tables alphabetically sorted

### Verifying Completion

An article is considered complete when its Convex-backed `subjective_effects` field contains:
- Populated `physical` section with effects from the PW-2015 source
- Populated `cognitive` section with effects from the PW-2015 source
- Populated `sensory.visual.subcategories` if visual effects were present
- Attribution with correct date and Internet Archive URL

### Notes on Source Quality

PW-2015 archives vary in quality:
- Some have detailed effect descriptions; others just list effect names
- Some have full visual effects sections; others have minimal or none
- Effect names may use UK spelling (colour vs color)
- Some sections may be incomplete or stub-like

When source content is sparse, note this in the commit message and preserve what's available rather than inventing content.

---

## Differences from DEIS Skill

| Aspect | DEIS | PW-2015 |
|--------|------|---------|
| Source location | `src/data/article-sources/*.ts` | `archive/pw-2015/*.md` |
| Source key | `disregardeverythingisay` in contents | Full markdown file |
| Author | Josie Kins | Josie Kins |
| Attribution text | "Forked from Subjective Effect Documentation by Josie Kins, {Month} {Year}." | "Forked from Subjective Effect Documentation by Josie Kins, {Month} {Year}." |
| URL source | Extracted from source file (DEIS URL) | Last line of file (Internet Archive URL) |
| Date source | Fetched from DEIS URL | "This page was last modified on..." line |
| Content style | More editorial, detailed descriptions | Wiki-style, variable quality |
| Effect structure | Often has progressive stages | Standard section hierarchy |
