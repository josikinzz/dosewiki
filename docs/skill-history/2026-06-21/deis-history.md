---
name: deis
description: Convert DEIS article content into subjective_effects format
---

# DEIS Subjective Effects Converter

Convert "Disregard Everything I Say" source content into the `subjective_effects` schema format.

## Usage

```
/deis <substance-name>
```

Example: `/deis psilocybin-mushrooms`

---

## Step 1: Locate the DEIS Source

Find the source file at `src/data/article-sources/{substance}.ts` and extract the content from the `disregardeverythingisay` key in the `contents` object.

If the substance is not found, list available DEIS articles by searching for files containing "disregardeverythingisay" in `src/data/article-sources/`.

---

## Step 2: Extract Subjective Effects Content

Parse the DEIS markdown and extract ONLY these sections:

### Physical Effects
- Look for `**Physical Effects:**` header
- Extract bullet points with their descriptions
- The intro paragraph before bullets may describe the body high character

### Cognitive Effects
- Look for `**Cognitive Effects:**` header
- Extract the intro paragraph (comparative statements about headspace) → goes to `notes.cognitive`
- Extract bullet points (often just names, sometimes with descriptions)

### Visual Effects
- Look for `**Visual Effects:**` header
- Split into subcategories:
  - `*Enhancements*` → effects like "Increased visual acuity", "Enhancement of colours"
  - `*Distortions*` → effects like "Visual drifting", "Tracers", "After images"
  - `*Geometry*` → usually prose description, NOT a list of effects
  - `*Hallucinatory States*` → "External hallucinations", "Internal hallucinations"

### Auditory Effects
- Look for `**Auditory Effects:**` header
- Usually contains: Enhancements, Distortions, Hallucinations

### Progressive Stages (if present)
- Some substances (like DMT) have distinct experiential stages
- Look for headers like "The First Stage:", "The Second Stage:", etc.
- These become top-level `progressive_stages` entries

---

## Step 3: Transform to Schema Format

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
              { "name": "Increased visual acuity", "description": "" },
              { "name": "Enhancement of colours", "description": "" },
              { "name": "Enhanced pattern recognition", "description": "" }
            ]
          },
          "Distortions": {
            "note": "",
            "effects": [
              { "name": "Visual drifting", "description": "(Melting, Breathing, Morphing and Flowing) - <description>" },
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
              { "name": "External hallucinations", "description": "" },
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
      "multisensory": { "note": "", "subcategories": {} }
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
    "progressive_stages": {
      "1. Stage Name": {
        "note": "<full stage description>",
        "effects": []
      },
      "2. Next Stage": {
        "note": "<description>",
        "effects": []
      }
    },
    "attribution": {
      "author": "Josie Kins",
      "text": "Forked from Subjective Effect Documentation by Josie Kins, <Month> <Year>.",
      "url": "<DEIS source URL>"
    }
  }
}
```

---

## Transformation Rules

### Keep These Patterns

1. **Effect descriptions with parenthetical qualifiers**: Keep as-is
   - Example: `"(Melting, Breathing, Morphing and Flowing) - In comparison to..."`

2. **Comparative statements**: Preserve in descriptions or notes
   - Example: `"In comparison to other psychedelics, this effect can be described as..."`

3. **Geometry prose**: Convert entire paragraph to `note` field, leave `effects` array empty

4. **Progressive stages**: Number them ("1. Taking Off", "2. The Waiting Room") and use as subcategory names with descriptions in `note` field

### Exclude This Content

| Content Type | Reason |
|--------------|--------|
| Onset/Duration/Dosage info | Goes to `dosage`/`duration` sections |
| Introduction/Background | Goes to other article sections |
| Mechanism of action | Goes to `pharmacology` section |
| Health Effects/Addiction/Tolerance | Goes to `harm_potential`/`tolerance` |
| Legal Issues | Goes to `legality` section |
| Trip report links | Drop entirely |
| Conclusion/personal opinions | Drop entirely |
| Misconceptions/debunking sections | Drop entirely |
| Synthesis/extraction links | Drop entirely |

---

## Step 4: Present for Review

Before applying changes, show the user:
1. Summary of extracted content by category
2. Number of effects in each section
3. Any special handling (progressive stages, geometry notes)
4. Ask for confirmation or modifications

---

## Step 5: Add Attribution

Every article with DEIS-sourced subjective effects MUST include an attribution field.

### Extract the Source URL and Date

1. Find the DEIS URL in the source file (looks like `https://disregardeverythingisay.com/post/XXXXXX/...`)
2. Fetch the URL to extract the publication date (format: "Month YYYY")
3. Add the attribution to `subjective_effects`:

```json
{
  "subjective_effects": {
    "notes": { ... },
    "sensory": { ... },
    "cognitive": { ... },
    "physical": { ... },
    "attribution": {
      "author": "Josie Kins",
      "text": "Forked from Subjective Effect Documentation by Josie Kins, March 2012.",
      "url": "https://disregardeverythingisay.com/post/19637689917/salvia-broken-down-and-described"
    }
  }
}
```

### Attribution Format

- **author**: Always `"Josie Kins"` for DEIS content
- **text**: `"Forked from Subjective Effect Documentation by Josie Kins, {Month} {Year}."`
- **url**: The full DEIS article URL from the source file

### UI Rendering

The attribution displays as a right-aligned banner at the bottom of the Subjective Effects section with:
- Josie's avatar (links to her profile)
- The attribution text (author name links to profile, rest links to original article)
- External link icon

---

## Step 6: Apply Changes

1. Resolve the target article through the `/dev` editor, a Convex-backed read helper, or the approved script path.
2. Update the `subjective_effects` field through the authenticated app/API/script write path, including attribution.
3. Sync to production with `npm run convex:sync-production -- --confirm-production-sync` if the dev write should go live.
4. Report success and provide the current local verification URL.

---

## Reference: Completed Examples

### LSD (first conversion)
- Physical: 5 effects with detailed descriptions
- Cognitive: 15 effects (names only), intro paragraph in notes.cognitive
- Visual: Enhancements (3), Distortions (6 with Visual drifting description), Geometry (note only), Hallucinatory States (2)
- Auditory: 3 effects

### DMT (second conversion)
- Physical: 2 effects (tactile sensations, changes in gravity)
- Cognitive: 7 effects (names only), intro paragraph about sober/clear headspace
- Visual: Same structure as LSD
- Auditory: 3 effects
- Progressive Stages: 4 numbered stages (Taking Off, The Waiting Room, The Other Side, Coming Down) - displayed as collapsible sections

---

## Task Tracker

43 substances have DEIS content available in `src/data/article-sources/`.

### Progress: 36/43 Completed (84%)

### Completed (36)

| Substance | Source File | Completed |
|-----------|-------------|-----------|
| 1P-LSD | `1p-lsd.ts` | ✅ |
| 25B-NBOMe | `25b-nbome.ts` | ✅ |
| 25I-NBOMe | `25i-nbome.ts` | ✅ |
| 2C-B | `2c-b.ts` | ✅ |
| 2C-C | `2c-c.ts` | ✅ |
| 2C-E | `2c-e.ts` | ✅ |
| 2C-I | `2c-i.ts` | ✅ |
| 2C-P | `2c-p.ts` | ✅ |
| 2C-T-2 | `2c-t-2.ts` | ✅ |
| 2C-T-7 | `2c-t-7.ts` | ✅ |
| 3-MeO-PCMo | `3-meo-pcmo.ts` | ✅ |
| 4-AcO-DMT | `4-aco-dmt.ts` | ✅ |
| 4-AcO-MET | `4-aco-met.ts` | ✅ |
| 4-HO-MiPT | `4-ho-mipt.ts` | ✅ |
| 5-MeO-DMT | `5-meo-dmt.ts` | ✅ |
| 5-MeO-MiPT | `5-meo-mipt.ts` | ✅ |
| AL-LAD | `al-lad.ts` | ✅ |
| AMT | `amt.ts` | ✅ |
| Ayahuasca | `ayahuasca.ts` | ✅ |
| Dextromethorphan | `dextromethorphan.ts` | ✅ |
| Diphenidine | `diphenidine.ts` | ✅ |
| DMT | `dmt.ts` | ✅ |
| DOB | `dob.ts` | ✅ |
| Ephenidine | `ephenidine.ts` | ✅ |
| Ketamine | `ketamine.ts` | ✅ |
| LSA | `lsa.ts` | ✅ |
| LSD | `lsd.ts` | ✅ |
| MDAI | `mdai.ts` | ✅ |
| MDMA | `mdma.ts` | ✅ |
| Methoxetamine | `methoxetamine.ts` | ✅ |
| Methoxphenidine | `methoxphenidine.ts` | ✅ |
| Methylone | `methylone.ts` | ✅ |
| Nitrous Oxide | `nitrous.ts` | ✅ |
| Psilocin | `psilocin.ts` | ✅ |
| Psilocybin Mushrooms | `psilocybin-mushrooms.ts` | ✅ |
| Salvia | `salvia.ts` | ✅ |

### No Article Yet (2)

| Substance | Source File | Status |
|-----------|-------------|--------|
| 25C-NBOMe | `25c-nbome.ts` | ⏳ No article |
| 25N-NBOMe | `25n-nbome.ts` | ⏳ No article |

### No Effects Section in DEIS (5)

| Substance | Source File | Status |
|-----------|-------------|--------|
| Datura | `datura.ts` | 🔍 No effects section |
| Diphenhydramine | `diphenhydramine.ts` | 🔍 No effects section |
| DOC | `doc.ts` | 🔍 No effects section |
| DOM | `dom.ts` | 🔍 No effects section |
| Mescaline | `mescaline.ts` | 🔍 No effects section |

---

## Maintaining This Tracker

### After Completing a Transcription

1. Move the substance row from **Remaining** to **Completed** table
2. Change the status from `⬜` to `✅`
3. Update the progress count at the top (e.g., `7/43 Completed (16%)`)
4. Keep tables alphabetically sorted

### Verifying Completion

An article is considered complete when its Convex-backed `subjective_effects` field contains:
- Populated `sensory.visual.subcategories` with Enhancements, Distortions, Geometry, and/or Hallucinatory States
- Populated `cognitive` and `physical` sections with effects from the DEIS source
- `notes.cognitive` containing the headspace description paragraph

### Finding New DEIS Sources

If new DEIS content is added to `article-sources/`:
```bash
grep -l "disregardeverythingisay" src/data/article-sources/*.ts | wc -l
```

Compare the count to this tracker and add any new substances to the Remaining table
