---
name: complete-missing-data
description: Manual review and completion of substances missing dosage/duration data
---

# Complete Missing Dosage/Duration Data

Systematically review and extract dosage/duration data for substances that are completely missing both. This skill guides you through checking local source files first, then searching online if needed. **Data is written to this skill file for later batch review and insertion through the approved Convex/app write path.**

## Usage

```
/complete-missing-data [substance-name]
/complete-missing-data --loop
```

- **No argument**: Process the next unchecked substance, then stop
- **With name**: Review a specific substance
- **--loop**: Process ALL remaining substances continuously until complete

> **IMPORTANT:** When invoked without an argument, immediately find the first `- [ ]` item in the Task Tracker and begin reviewing that substance. Do not ask which substance to review—just start.

---

## Loop Mode

When invoked with `--loop`, continuously process substances until all are complete:

```
LOOP START
│
├─→ Find next unchecked substance (- [ ])
│   │
│   ├─→ None remaining? → EXIT LOOP ✓
│   │
│   └─→ Process substance:
│       1. Read source file
│       2. Extract data OR search web
│       3. Write to Extracted Data section
│       4. Update Task Tracker
│       │
│       └─→ CONTINUE LOOP ↑
```

**Loop Behavior:**
- Process each substance without asking for confirmation
- Write all extracted data to the Extracted Data section
- Update the task tracker after each substance
- Only stop when all `- [ ]` items are processed
- Report progress periodically (e.g., "Completed 5/25...")
- If a web search is needed, perform it automatically

**To start the loop, paste this single line:**

```
Run /complete-missing-data --loop - process every unchecked substance in the task tracker continuously, extracting data from local sources or web search, writing results to the skill file, until all 25 are complete. Do not stop or ask for confirmation between substances.
```

---

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Select substance from Task Tracker                          │
│                         ↓                                       │
│  2. Read local source file (src/data/article-sources/[slug].ts) │
│                         ↓                                       │
│  3. Extract dosage/duration if found                            │
│        ↓ (found)                    ↓ (not found)               │
│  4a. Format data                4b. Search online               │
│        ↓                              ↓                         │
│  5. Write formatted data to EXTRACTED DATA section below        │
│        ↓                                                        │
│  6. Update Task Tracker status                                  │
│        ↓                                                        │
│  7. Continue to next substance or stop                          │
└─────────────────────────────────────────────────────────────────┘
```

> **NOTE:** This skill does not modify live article data directly. All extracted data is written to the "Extracted Data" section below for batch review and later insertion through the approved Convex/app write path.

---

## Step 1: Select Substance

Check the **Task Tracker** at the bottom of this document.

1. Find the first unchecked `- [ ]` substance
2. Note its name and convert to slug (lowercase, hyphens for spaces)
3. Update the tracker to show it's being processed:
   ```
   - [~] Substance Name ← Currently processing
   ```

---

## Step 2: Read Local Source File

Read the article source file:

```
src/data/article-sources/[slug].ts
```

The file contains a `contents` object with source data keyed by source ID:
- `tripsit-factsheets` - TripSit (highest priority for dosage)
- `psychonautwiki` - PsychonautWiki
- `disregardeverythingisay` - DEIS
- `thedrugclassroom` - The Drug Classroom
- `drugusersbible` - Drug Users Bible (duration only)
- `erowid` - Erowid
- `wikipedia` - Wikipedia (usually no dosage data)

### What to Look For

**Dosage Data** - Structured tier tables:
```
Threshold: 5-10 mg
Light: 10-25 mg
Common/Moderate: 25-50 mg
Strong: 50-100 mg
Heavy: 100+ mg
```

**Duration Data** - Timeline stages:
```
Onset: 20-40 minutes
Come up: 30-60 minutes
Peak: 2-4 hours
Offset: 1-2 hours
After effects: 2-6 hours
Total: 4-8 hours
```

### Map Non-Standard Labels

| Source Label | Schema Label |
|--------------|--------------|
| Low | light |
| Medium/Normal/Typical | moderate |
| High | strong |
| Very High/Dangerous | heavy |
| Common | moderate |

### Data That Is NOT Valid

- Personal consumption logs ("I took 80mg then 30mg")
- Medical prescription dosages (unless it's a pharma substance)
- LD50/toxicity data
- Purity/concentration information
- Narrative prose without specific numbers

---

## Step 3: Extract and Format Data

If dosage/duration data is found, format it for `SubstanceIndex.json`:

### Dosage Format

```json
"dosage": {
  "routes": [
    {
      "route": "Oral",
      "dose_ranges": {
        "threshold": { "min": 5, "max": null, "unit": "mg" },
        "light": { "min": 5, "max": 15, "unit": "mg" },
        "moderate": { "min": 15, "max": 30, "unit": "mg" },
        "strong": { "min": 30, "max": 50, "unit": "mg" },
        "heavy": { "min": 50, "max": null, "unit": "mg" }
      }
    }
  ],
  "plateau_dosing": null
}
```

### Duration Format

```json
"duration": {
  "routes": [
    {
      "route": "Oral",
      "stages": {
        "onset": { "min": 20, "max": 40, "unit": "minutes" },
        "come_up": { "min": 30, "max": 60, "unit": "minutes" },
        "peak": { "min": 2, "max": 4, "unit": "hours" },
        "offset": { "min": 1, "max": 2, "unit": "hours" },
        "after_effects": { "min": 2, "max": 6, "unit": "hours" },
        "total_duration": { "min": 4, "max": 8, "unit": "hours" }
      }
    }
  ]
}
```

### Important Notes

- Use `null` for open-ended ranges (e.g., "50+ mg" → `{ "min": 50, "max": null }`)
- Use `null` for single values as both min and max (e.g., "50 mg" → `{ "min": 50, "max": null }`)
- Route names: "Oral", "Insufflated", "Smoked", "Vaporized", "Sublingual", "Buccal", "Intramuscular", "Intravenous", "Rectal"
- Time units: "seconds", "minutes", "hours"
- Dose units: "mg", "µg", "g", "ml", "seeds", "drops" (preserve original units)

---

## Step 4: Web Search Fallback

**If NO usable data found in local sources**, search online.

### Search Queries

```
[substance name] dosage mg threshold light common strong psychonautwiki
[substance name] duration onset peak hours tripsit
[substance name] dose guide harm reduction
```

### Priority Sources

1. **PsychonautWiki** (psychonautwiki.org) - Most comprehensive
2. **TripSit** (drugs.tripsit.me) - Harm reduction focused
3. **Erowid** (erowid.org) - When structured data exists
4. **The Drug Classroom** - Educational content
5. **Reddit** (r/researchchemicals, r/Drugs) - User reports (lower confidence)

### Web Data Guidelines

1. **Cross-reference multiple sources** when possible
2. **Prefer conservative estimates** for harm reduction
3. **Note the source URL** for the data
4. **Flag uncertainty** if data seems unreliable

### Report Web Findings

```
WEB SOURCE: [URL]
CONFIDENCE: [HIGH/MEDIUM/LOW]
ROUTE: [route]

DOSAGE:
- Threshold: [value]
- Light: [range]
- Moderate: [range]
- Strong: [range]
- Heavy: [value]+

DURATION:
- Onset: [range]
- Peak: [range]
- Total: [range]
```

---

## Step 5: Write to Extracted Data Section

After finding data, write the formatted JSON to the **Extracted Data** section at the bottom of this skill file.

Use this exact format:

```
### [Substance Name]
**Source:** [Local source name or Web URL]
**Confidence:** [HIGH/MEDIUM/LOW]
**Date:** YYYY-MM-DD

**Dosage:**
```json
{
  "routes": [
    {
      "route": "Oral",
      "dose_ranges": {
        "threshold": { "min": 5, "max": null, "unit": "mg" },
        "light": { "min": 5, "max": 15, "unit": "mg" },
        "moderate": { "min": 15, "max": 30, "unit": "mg" },
        "strong": { "min": 30, "max": 50, "unit": "mg" },
        "heavy": { "min": 50, "max": null, "unit": "mg" }
      }
    }
  ],
  "plateau_dosing": null
}
```

**Duration:**
```json
{
  "routes": [
    {
      "route": "Oral",
      "stages": {
        "onset": { "min": 20, "max": 40, "unit": "minutes" },
        "come_up": { "min": 30, "max": 60, "unit": "minutes" },
        "peak": { "min": 2, "max": 4, "unit": "hours" },
        "offset": { "min": 1, "max": 2, "unit": "hours" },
        "after_effects": { "min": 2, "max": 6, "unit": "hours" },
        "total_duration": { "min": 4, "max": 8, "unit": "hours" }
      }
    }
  ]
}
```

---
```

If NO data was found, write:

```
### [Substance Name]
**Source:** N/A
**Confidence:** N/A
**Date:** YYYY-MM-DD
**Status:** NO DATA AVAILABLE
**Notes:** [Brief explanation of what was checked]

---
```

---

## Step 6: Update Task Tracker

After writing data to the Extracted Data section:

**If data was extracted:**
```
- [x] Substance Name - EXTRACTED from [source] (YYYY-MM-DD)
```

**If no data available anywhere:**
```
- [x] Substance Name - NO DATA AVAILABLE (YYYY-MM-DD)
```

---

## Step 7: Continue or Stop

After completing a substance, either:
- **Continue**: Move to the next `- [ ]` substance in the tracker
- **Stop**: If the user requested only one substance, or after a reasonable batch

When stopping, inform the user how many substances were processed and how many remain.

---

## Later: Batch Insert Through Convex/App Path

When ready to insert the extracted data:

1. Review all entries in the **Extracted Data** section
2. Resolve each target substance through `/dev`, a Convex-backed read helper, or the approved script path
3. Replace the empty `dosage` and `duration` objects with the extracted JSON through the authenticated app/API/script write path
4. Sync to production with `npm run convex:sync-production -- --confirm-production-sync` if the dev write should go live
5. Move processed entries from Extracted Data to an "Inserted" section or delete them

---

## Task Tracker

**Last Updated:** 2026-01-11
**Total Substances:** 25 (missing both dosage AND duration)

### Currently Processing
<!-- Move substance here when working on it -->


### Pending Review (0)

<!-- All substances have been processed -->

### Completed - Data Extracted
<!-- Format: - [x] Name - EXTRACTED [routes] from [source] (YYYY-MM-DD) -->
<!-- Data is in the "Extracted Data" section below, awaiting batch insert -->
- [x] Nutmeg - EXTRACTED Oral from PsychonautWiki (2026-01-11)
- [x] MAL - EXTRACTED Oral from PsychonautWiki (2026-01-11)
- [x] DMXE - EXTRACTED Insufflated/Sublingual from Bluelight (2026-01-11) - LOW confidence
- [x] Flmodafinil - EXTRACTED Oral from multiple nootropic sources (2026-01-11)
- [x] Eutylone - EXTRACTED Oral from anecdotal reports (2026-01-11) - LOW confidence
- [x] alpha-PCYP - EXTRACTED Oral/Insufflated extrapolated from α-PVP (2026-01-11) - LOW confidence
- [x] Yopo - EXTRACTED Insufflated from Drug Users Bible (2026-01-11)
- [x] Zaleplon - EXTRACTED Oral from Wikipedia/experience reports (2026-01-11)


### Completed - Already in SubstanceIndex.json
<!-- Substances that were added directly before this skill existed -->
- [x] Nicotine - Added Smoked/Oral/Buccal from PsychonautWiki (2026-01-11)


### Completed - No Data Available
<!-- Format: - [x] Name - NO DATA AVAILABLE (YYYY-MM-DD) -->
- [x] 2-MeO-Ketamine - NO DATA AVAILABLE (2026-01-11)
- [x] 2-NMC - NO DATA AVAILABLE - TripSit lists as "Inactive" (2026-01-11)
- [x] 25E-NBOH - NO DATA AVAILABLE - PsychonautWiki stub (2026-01-11)
- [x] 25I-NBF - NO DATA AVAILABLE - No PsychonautWiki page (2026-01-11)
- [x] 3-Cl-PCP - NO DATA AVAILABLE - PsychonautWiki dosage not populated (2026-01-11)
- [x] 3-Me-PCPy - NO DATA AVAILABLE - PsychonautWiki 404 (2026-01-11)
- [x] 3,4-Dichloromethylphenidate - NO DATA AVAILABLE (2026-01-11)
- [x] 3F-PCP - NO DATA AVAILABLE - Talk page only (2026-01-11)
- [x] 4-CMA - NO DATA AVAILABLE - NEUROTOXIC, no safe dose (2026-01-11)
- [x] 4-Fluoropentedrone - NO DATA AVAILABLE (2026-01-11)
- [x] 4-HO-PiPT - NO DATA AVAILABLE - First identified 2021 (2026-01-11)
- [x] 4-MPD - NO DATA AVAILABLE - Inconsistent reports only (2026-01-11)
- [x] 4-MTA - NO DATA AVAILABLE - DANGEROUS, multiple fatalities (2026-01-11)
- [x] 4-PrO-DMT - NO DATA AVAILABLE - No PsychonautWiki page (2026-01-11)
- [x] C30-NBOMe - SUBSTANCE DOES NOT EXIST (2026-01-11)
- [x] Lithium - NO RECREATIONAL DATA - Prescription only (2026-01-11)
- [x] Scopolamine - NO DATA AVAILABLE - Redirects to Datura (2026-01-11)


---

## Source Priority Reference

When multiple sources have data, prefer:

**For Dosage:**
1. TripSit (conservative, harm-reduction focused)
2. PsychonautWiki (comprehensive)
3. The Drug Classroom (educational)
4. DEIS (detailed)

**For Duration:**
1. PsychonautWiki (most complete stage breakdown)
2. TripSit
3. DEIS
4. Drug Users Bible (onset + total only)

---

## Common Issues

### Substance Not Found in Source Files

Some substances may not have a source file at all. In this case:
1. Search online directly
2. Note in the tracker that no local source exists

### Multiple Routes

If a substance has data for multiple routes (e.g., Oral AND Insufflated), add all routes to the arrays:

```json
"dosage": {
  "routes": [
    { "route": "Oral", "dose_ranges": {...} },
    { "route": "Insufflated", "dose_ranges": {...} }
  ]
}
```

### Partial Data

If you only find dosage OR duration (not both):
- Still add whatever data is available
- Note in the tracker what was added
- The substance may need follow-up for the missing piece

### Non-Standard Units

Preserve the original units when they make sense:
- Seeds (for LSA-containing plants)
- Drops (for liquid preparations)
- ml (for volumetric dosing)

---

## Session Log

<!-- Record each session for continuity -->

### Session: 2026-01-11
**Reviewed:** Nicotine
**Outcome:** Added Smoked/Oral/Buccal dosage and duration from PsychonautWiki
**Notes:** First substance completed manually before skill was created

### Session: 2026-01-11 (Loop Mode)
**Reviewed:** All 25 pending substances
**Outcome:**
- 8 substances with data extracted (Nutmeg, MAL, DMXE, Flmodafinil, Eutylone, alpha-PCYP, Yopo, Zaleplon)
- 16 substances with no data available
- 1 substance (C30-NBOMe) does not exist

**Method:** Local source files checked first, then web search for missing data
**Sources used:** PsychonautWiki, TripSit, Bluelight, Wikipedia, Erowid, nootropic vendor sites

**Notes on substances with no data:**
- Many are very new research chemicals (first identified 2020-2021)
- Some PsychonautWiki pages exist but have empty dosage tables
- 4-CMA and 4-MTA flagged as dangerous with no safe human dose
- C30-NBOMe appears to be a typo/non-existent compound
- Lithium and Scopolamine are not recreational substances

---

## Extracted Data

> **This section contains extracted dosage/duration data awaiting batch insertion through the approved Convex/app write path.**
>
> When ready to insert:
> 1. Review each entry below
> 2. Apply the JSON to the corresponding article through the authenticated app/API/script write path
> 3. Sync to production if needed
> 4. Move or delete the entry from this section

<!-- Add extracted data below this line -->

### Nutmeg
**Source:** PsychonautWiki (https://psychonautwiki.org/wiki/Nutmeg)
**Confidence:** HIGH
**Date:** 2026-01-11

**Dosage:**
```json
{
  "routes": [
    {
      "route": "Oral",
      "dose_ranges": {
        "threshold": null,
        "light": { "min": 5, "max": 15, "unit": "g" },
        "moderate": { "min": 15, "max": 20, "unit": "g" },
        "strong": { "min": 20, "max": 30, "unit": "g" },
        "heavy": { "min": 30, "max": null, "unit": "g" }
      }
    }
  ],
  "plateau_dosing": null
}
```

**Duration:**
```json
{
  "routes": [
    {
      "route": "Oral",
      "stages": {
        "onset": { "min": 3, "max": 8, "unit": "hours" },
        "come_up": null,
        "peak": { "min": 9, "max": 12, "unit": "hours" },
        "offset": null,
        "after_effects": null,
        "total_duration": { "min": 12, "max": 72, "unit": "hours" }
      }
    }
  ]
}
```

**Notes:** Myristicin degrades after grinding, making potency unpredictable. Considered dangerous deliriant with severe side effects.

---

### MAL (Methallylescaline)
**Source:** PsychonautWiki (https://psychonautwiki.org/wiki/Methallylescaline)
**Confidence:** HIGH
**Date:** 2026-01-11

**Dosage:**
```json
{
  "routes": [
    {
      "route": "Oral",
      "dose_ranges": {
        "threshold": { "min": 5, "max": null, "unit": "mg" },
        "light": { "min": 15, "max": 25, "unit": "mg" },
        "moderate": { "min": 25, "max": 40, "unit": "mg" },
        "strong": { "min": 40, "max": 60, "unit": "mg" },
        "heavy": { "min": 60, "max": null, "unit": "mg" }
      }
    }
  ],
  "plateau_dosing": null
}
```

**Duration:**
```json
{
  "routes": [
    {
      "route": "Oral",
      "stages": {
        "onset": { "min": 20, "max": 60, "unit": "minutes" },
        "come_up": { "min": 30, "max": 90, "unit": "minutes" },
        "peak": { "min": 3, "max": 5, "unit": "hours" },
        "offset": { "min": 2, "max": 4, "unit": "hours" },
        "after_effects": { "min": 4, "max": 8, "unit": "hours" },
        "total_duration": { "min": 6, "max": 12, "unit": "hours" }
      }
    }
  ]
}
```

**Notes:** Shulgin documented 40-60mg with 8-12 hour duration in PiHKAL. About 6x potency of mescaline.

---

### DMXE (Deoxymethoxetamine)
**Source:** Bluelight forums, Erowid experience reports
**Confidence:** LOW (anecdotal reports only)
**Date:** 2026-01-11

**Dosage:**
```json
{
  "routes": [
    {
      "route": "Insufflated",
      "dose_ranges": {
        "threshold": { "min": 5, "max": null, "unit": "mg" },
        "light": { "min": 10, "max": 30, "unit": "mg" },
        "moderate": { "min": 30, "max": 60, "unit": "mg" },
        "strong": { "min": 60, "max": 120, "unit": "mg" },
        "heavy": { "min": 120, "max": null, "unit": "mg" }
      }
    },
    {
      "route": "Sublingual",
      "dose_ranges": {
        "threshold": { "min": 10, "max": null, "unit": "mg" },
        "light": { "min": 15, "max": 30, "unit": "mg" },
        "moderate": { "min": 30, "max": 50, "unit": "mg" },
        "strong": { "min": 50, "max": 80, "unit": "mg" },
        "heavy": { "min": 80, "max": null, "unit": "mg" }
      }
    }
  ],
  "plateau_dosing": null
}
```

**Duration:**
```json
{
  "routes": [
    {
      "route": "Insufflated",
      "stages": {
        "onset": { "min": 5, "max": 15, "unit": "minutes" },
        "come_up": null,
        "peak": { "min": 1, "max": 2, "unit": "hours" },
        "offset": null,
        "after_effects": null,
        "total_duration": { "min": 2, "max": 4, "unit": "hours" }
      }
    },
    {
      "route": "Sublingual",
      "stages": {
        "onset": { "min": 15, "max": 30, "unit": "minutes" },
        "come_up": null,
        "peak": { "min": 1, "max": 3, "unit": "hours" },
        "offset": null,
        "after_effects": null,
        "total_duration": { "min": 3, "max": 5, "unit": "hours" }
      }
    }
  ]
}
```

**Notes:** Data from anecdotal Bluelight reports. Similar to MXE. Very limited human data available.

---

### Flmodafinil (CRL-40,940)
**Source:** Multiple nootropic sources
**Confidence:** MEDIUM
**Date:** 2026-01-11

**Dosage:**
```json
{
  "routes": [
    {
      "route": "Oral",
      "dose_ranges": {
        "threshold": { "min": 25, "max": null, "unit": "mg" },
        "light": { "min": 50, "max": 100, "unit": "mg" },
        "moderate": { "min": 100, "max": 150, "unit": "mg" },
        "strong": { "min": 150, "max": 200, "unit": "mg" },
        "heavy": { "min": 200, "max": null, "unit": "mg" }
      }
    }
  ],
  "plateau_dosing": null
}
```

**Duration:**
```json
{
  "routes": [
    {
      "route": "Oral",
      "stages": {
        "onset": { "min": 30, "max": 60, "unit": "minutes" },
        "come_up": null,
        "peak": { "min": 4, "max": 8, "unit": "hours" },
        "offset": null,
        "after_effects": null,
        "total_duration": { "min": 8, "max": 12, "unit": "hours" }
      }
    }
  ]
}
```

**Notes:** 2-4x more potent than modafinil. Longer half-life. Not FDA approved - research chemical. Morning dosing only.

---

### Eutylone
**Source:** PsychonautWiki Talk page, anecdotal reports
**Confidence:** LOW
**Date:** 2026-01-11

**Dosage:**
```json
{
  "routes": [
    {
      "route": "Oral",
      "dose_ranges": {
        "threshold": { "min": 50, "max": null, "unit": "mg" },
        "light": { "min": 75, "max": 100, "unit": "mg" },
        "moderate": { "min": 100, "max": 150, "unit": "mg" },
        "strong": { "min": 150, "max": 200, "unit": "mg" },
        "heavy": { "min": 200, "max": null, "unit": "mg" }
      }
    }
  ],
  "plateau_dosing": null
}
```

**Duration:**
```json
{
  "routes": [
    {
      "route": "Oral",
      "stages": {
        "onset": { "min": 15, "max": 45, "unit": "minutes" },
        "come_up": null,
        "peak": { "min": 1, "max": 2, "unit": "hours" },
        "offset": null,
        "after_effects": { "min": 2, "max": 6, "unit": "hours" },
        "total_duration": { "min": 3, "max": 5, "unit": "hours" }
      }
    }
  ]
}
```

**Notes:** Less potent than butylone, methylone, ethylone. MDMA-like but shorter duration and weaker. Schedule I in US.

---

### alpha-PCYP
**Source:** Erowid, PubChem, DEA
**Confidence:** LOW (extrapolated from α-PVP potency data)
**Date:** 2026-01-11

**Dosage:**
```json
{
  "routes": [
    {
      "route": "Oral",
      "dose_ranges": {
        "threshold": { "min": 2, "max": null, "unit": "mg" },
        "light": { "min": 5, "max": 10, "unit": "mg" },
        "moderate": { "min": 10, "max": 20, "unit": "mg" },
        "strong": { "min": 20, "max": 30, "unit": "mg" },
        "heavy": { "min": 30, "max": null, "unit": "mg" }
      }
    },
    {
      "route": "Insufflated",
      "dose_ranges": {
        "threshold": { "min": 1, "max": null, "unit": "mg" },
        "light": { "min": 2, "max": 5, "unit": "mg" },
        "moderate": { "min": 5, "max": 10, "unit": "mg" },
        "strong": { "min": 10, "max": 15, "unit": "mg" },
        "heavy": { "min": 15, "max": null, "unit": "mg" }
      }
    }
  ],
  "plateau_dosing": null
}
```

**Duration:**
```json
{
  "routes": [
    {
      "route": "Oral",
      "stages": {
        "onset": { "min": 30, "max": 60, "unit": "minutes" },
        "come_up": null,
        "peak": { "min": 2, "max": 4, "unit": "hours" },
        "offset": null,
        "after_effects": null,
        "total_duration": { "min": 4, "max": 6, "unit": "hours" }
      }
    },
    {
      "route": "Insufflated",
      "stages": {
        "onset": { "min": 5, "max": 15, "unit": "minutes" },
        "come_up": null,
        "peak": { "min": 1, "max": 2, "unit": "hours" },
        "offset": null,
        "after_effects": null,
        "total_duration": { "min": 2, "max": 4, "unit": "hours" }
      }
    }
  ]
}
```

**Notes:** Reported 2x more potent than α-PVP. Doses extrapolated by halving α-PVP values. Very limited data.

---

### 2-MeO-Ketamine
**Source:** N/A
**Confidence:** N/A
**Date:** 2026-01-11
**Status:** NO DATA AVAILABLE
**Notes:** No PsychonautWiki page exists. TripSit lists it as "very rare" with unknown pharmacological properties. Slightly less potent than ketamine according to limited sources.

---

### 2-NMC
**Source:** N/A
**Confidence:** N/A
**Date:** 2026-01-11
**Status:** NO DATA AVAILABLE
**Notes:** TripSit factsheet marks this as "Inactive" compound. No dosage data available.

---

### 25E-NBOH
**Source:** N/A
**Confidence:** N/A
**Date:** 2026-01-11
**Status:** NO DATA AVAILABLE
**Notes:** PsychonautWiki page exists but is marked as stub with no dosage/duration data populated. Blotters reported 300-1500µg but no tier breakdown.

---

### 25I-NBF
**Source:** N/A
**Confidence:** N/A
**Date:** 2026-01-11
**Status:** NO DATA AVAILABLE
**Notes:** No PsychonautWiki page. Only Wikipedia entry exists. No human dosage data found. Related to 25I-NBOMe but distinct compound.

---

### 3-Cl-PCP
**Source:** N/A
**Confidence:** N/A
**Date:** 2026-01-11
**Status:** NO DATA AVAILABLE
**Notes:** PsychonautWiki page exists but dosage table not populated. Described as having "sensitive dose-response" - start extremely low. First synthesized 2020.

---

### 3-Me-PCPy
**Source:** N/A
**Confidence:** N/A
**Date:** 2026-01-11
**Status:** NO DATA AVAILABLE
**Notes:** PsychonautWiki page returns 404. Very new substance (2021). Suggested to start from sub-mg range. May be active 5-10mg oral based on related compounds.

---

### 3,4-Dichloromethylphenidate
**Source:** N/A
**Confidence:** N/A
**Date:** 2026-01-11
**Status:** NO DATA AVAILABLE
**Notes:** No harm reduction data found. Obscure methylphenidate analogue.

---

### 3F-PCP
**Source:** N/A
**Confidence:** N/A
**Date:** 2026-01-11
**Status:** NO DATA AVAILABLE
**Notes:** PsychonautWiki Talk page only. First identified 2020. No dosage table available. Reported as "very strong" with unpredictable effects.

---

### 4-CMA
**Source:** N/A
**Confidence:** N/A
**Date:** 2026-01-11
**Status:** NO DATA AVAILABLE - DANGEROUS SUBSTANCE
**Notes:** Prodrug for 4-CA which is SEVERELY NEUROTOXIC. Selectively destroys serotonergic neurons in animal studies. NO SAFE HUMAN DOSE established. Use strongly discouraged.

---

### 4-Fluoropentedrone
**Source:** N/A
**Confidence:** N/A
**Date:** 2026-01-11
**Status:** NO DATA AVAILABLE
**Notes:** Obscure pentedrone analogue. No PsychonautWiki page. TripSit has entry but no dosage data.

---

### 4-HO-PiPT
**Source:** N/A
**Confidence:** N/A
**Date:** 2026-01-11
**Status:** NO DATA AVAILABLE
**Notes:** No PsychonautWiki page. First identified 2021 in Canada. Wikipedia notes it has "psychedelic effects" but no dosage data. Related tryptamines active 10-25mg but cannot extrapolate.

---

### 4-MPD
**Source:** N/A
**Confidence:** N/A
**Date:** 2026-01-11
**Status:** NO DATA AVAILABLE
**Notes:** Inconsistent anecdotal data only. Reports range from 15-20mg insufflated to 100mg+ oral with no effect. Documented fatal intoxication. Heavy cardiovascular effects reported.

---

### 4-MTA
**Source:** N/A
**Confidence:** N/A
**Date:** 2026-01-11
**Status:** NO DATA AVAILABLE - DANGEROUS SUBSTANCE
**Notes:** Strong serotonin releaser similar to PMA. MAO-A inhibitor. Multiple fatalities reported. Street tablets contained 100-140mg but this is NOT a safe dose. NO safe human dose established.

---

### 4-PrO-DMT
**Source:** N/A
**Confidence:** N/A
**Date:** 2026-01-11
**Status:** NO DATA AVAILABLE
**Notes:** No PsychonautWiki page. First sold 2019. Prodrug of psilocin (4-HO-DMT). May have similar dosing to 4-AcO-DMT (10-30mg oral) but cannot confirm.

---

### C30-NBOMe
**Source:** N/A
**Confidence:** N/A
**Date:** 2026-01-11
**Status:** SUBSTANCE DOES NOT EXIST
**Notes:** No compound called "C30-NBOMe" found in any database. May be a typo or misidentification. NBOMe compounds use 25x naming (25C, 25I, 25B, etc.).

---

### Lithium
**Source:** N/A
**Confidence:** N/A
**Date:** 2026-01-11
**Status:** NO RECREATIONAL DATA AVAILABLE
**Notes:** Prescription medication for bipolar disorder. Therapeutic range 600-1200mg/day lithium carbonate. Not used recreationally. Narrow therapeutic index - toxicity occurs near therapeutic doses.

---

### Scopolamine
**Source:** N/A
**Confidence:** N/A
**Date:** 2026-01-11
**Status:** NO DATA AVAILABLE
**Notes:** PsychonautWiki redirects to Datura. Isolated scopolamine dosing not documented for recreational use. Medical patches contain 1.5mg. Extremely dangerous deliriant - no safe recreational dose.

---

### Yopo
**Source:** Drug Users Bible (local source)
**Confidence:** LOW
**Date:** 2026-01-11

**Dosage:**
```json
{
  "routes": [
    {
      "route": "Insufflated",
      "dose_ranges": {
        "threshold": { "min": 3, "max": null, "unit": "seeds" },
        "light": { "min": 3, "max": 5, "unit": "seeds" },
        "moderate": { "min": 5, "max": 7, "unit": "seeds" },
        "strong": { "min": 7, "max": 10, "unit": "seeds" },
        "heavy": { "min": 10, "max": null, "unit": "seeds" }
      }
    }
  ],
  "plateau_dosing": null
}
```

**Duration:**
```json
{
  "routes": [
    {
      "route": "Insufflated",
      "stages": {
        "onset": { "min": 0, "max": 1, "unit": "minutes" },
        "come_up": null,
        "peak": { "min": 3, "max": 5, "unit": "minutes" },
        "offset": null,
        "after_effects": { "min": 1, "max": 3, "unit": "hours" },
        "total_duration": { "min": 5, "max": 15, "unit": "minutes" }
      }
    }
  ]
}
```

**Notes:** Very short duration insufflated (5-15 min main effects). Seeds contain bufotenin primarily. Traditional preparation mixed with lime. Very painful administration.

---

### Zaleplon
**Source:** Wikipedia, PsychonautWiki experience reports
**Confidence:** MEDIUM
**Date:** 2026-01-11

**Dosage:**
```json
{
  "routes": [
    {
      "route": "Oral",
      "dose_ranges": {
        "threshold": { "min": 5, "max": null, "unit": "mg" },
        "light": { "min": 10, "max": 20, "unit": "mg" },
        "moderate": { "min": 20, "max": 40, "unit": "mg" },
        "strong": { "min": 40, "max": 75, "unit": "mg" },
        "heavy": { "min": 75, "max": null, "unit": "mg" }
      }
    }
  ],
  "plateau_dosing": null
}
```

**Duration:**
```json
{
  "routes": [
    {
      "route": "Oral",
      "stages": {
        "onset": { "min": 15, "max": 30, "unit": "minutes" },
        "come_up": null,
        "peak": { "min": 1, "max": 2, "unit": "hours" },
        "offset": null,
        "after_effects": { "min": 2, "max": 4, "unit": "hours" },
        "total_duration": { "min": 3, "max": 6, "unit": "hours" }
      }
    }
  ]
}
```

**Notes:** Z-drug hypnotic (Sonata). Prescribed 5-20mg for insomnia. Recreational doses 40-100mg produce deliriant/hallucinogenic effects. Controlled substance.

---
