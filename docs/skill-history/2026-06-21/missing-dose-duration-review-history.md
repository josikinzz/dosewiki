---
name: missing-tables
description: Manual review of source files for substances missing dosage/duration data
---

# Missing Dosage/Duration Review

Systematically review source files for substances with incomplete dosage/duration data. Uses agent swarms to manually inspect source content, presents findings for human approval, then transcribes validated data to `parsed-sources.json`.

## Usage

```
/missing-tables [substance-slug]
```

- **No argument**: Automatically start with the next unchecked substance
- **With slug**: Review a specific substance

> **IMPORTANT:** When invoked without an argument, immediately find the first `- [ ]` item in the Priority Substances list (or All Other Substances if Priority is complete) and begin reviewing that substance. Do not ask which substance to review—just start.

---

## Step 1: Select Substance from Task Tracker

The full list of **194 candidate substances** is maintained in the **Task Tracker** section at the bottom of this document.

### Issue Codes

| Code | Meaning |
|------|---------|
| `NO_DOSAGE` | Empty dosage.routes array |
| `NO_DURATION` | Empty duration.routes array |
| `MISSING_DURATION:Route` | Has dosage for that route, but no duration |
| `MISSING_DOSAGE:Route` | Has duration for that route, but no dosage |

### Default Behavior (No Argument)

1. Scan the Task Tracker for the first unchecked `- [ ]` substance
2. Check Priority Substances first, then All Other Substances
3. Move it to "Currently Processing"
4. Immediately proceed to Step 2 with that substance

---

## Step 2: Review a Single Substance

For each substance, deploy 3-4 parallel Explore agents to review source files.

### Agent Deployment

Launch agents using the Task tool with `subagent_type: Explore`:

**Agent 1: TripSit + PsychonautWiki**
**Agent 2: Erowid + DrugBank**
**Agent 3: DEIS + The Drug Classroom**
**Agent 4: Drug Users Bible + SaferParty + Wikipedia** (if substance has these sources)

### Agent Prompt Template

```
You are reviewing source content for [SUBSTANCE NAME] to extract dosage and duration data.

## Your Task

Read the article source file at `src/data/article-sources/[SLUG].ts` and extract the content for these sources:
- [SOURCE 1]
- [SOURCE 2]

For EACH source, search for dosage and duration information and report in this EXACT format:

---
SOURCE: [source name]
ROUTE: [route of administration, or "Unspecified" if not stated]

DOSAGE:
{
  "threshold": { "min": [number or null], "max": [number or null], "unit": "[unit]" },
  "light": { "min": [number or null], "max": [number or null], "unit": "[unit]" },
  "moderate": { "min": [number or null], "max": [number or null], "unit": "[unit]" },
  "strong": { "min": [number or null], "max": [number or null], "unit": "[unit]" },
  "heavy": { "min": [number or null], "max": [number or null], "unit": "[unit]" }
}
DOSAGE_NOTES: [any relevant context about the dosage, but do not mention the original source of the data]
DOSAGE_CONFIDENCE: [HIGH/MEDIUM/LOW]

DURATION:
{
  "onset": { "min": [number or null], "max": [number or null], "unit": "[minutes/hours]" },
  "come_up": { "min": [number or null], "max": [number or null], "unit": "[minutes/hours]" },
  "peak": { "min": [number or null], "max": [number or null], "unit": "[minutes/hours]" },
  "offset": { "min": [number or null], "max": [number or null], "unit": "[minutes/hours]" },
  "after_effects": { "min": [number or null], "max": [number or null], "unit": "[minutes/hours]" },
  "total_duration": { "min": [number or null], "max": [number or null], "unit": "[minutes/hours]" }
}
DURATION_NOTES: [any relevant context]
DURATION_CONFIDENCE: [HIGH/MEDIUM/LOW]

DATA_FOUND: [YES/PARTIAL/NO]
---

## Important Guidelines

1. **Look for ANY dosage/duration data**, even if:
   - It uses non-standard units (seeds, drops, hits)
   - It uses different tier names (Low, Medium, High instead of Light, Common, Strong)
   - It's embedded in prose rather than a table
   - It only has partial data (e.g., just onset and total duration)

2. **Map non-standard tiers:**
   - Low → Light
   - Medium/Normal/Typical/Average → Moderate
   - High → Strong
   - Very High/Dangerous → Heavy
   - Common → Moderate

3. **Unit conversions:**
   - mcg/ug → µg
   - grams → g
   - milligrams → mg
   - Keep non-weight units as-is (seeds, drops, ml, etc.)

4. **Confidence levels:**
   - HIGH: Clear structured table with complete tiers
   - MEDIUM: Partial data or embedded in prose but unambiguous
   - LOW: Inferred from context, may need verification

5. **If NO data found**, report:
   ```
   DOSAGE: NOT FOUND
   DURATION: NOT FOUND
   DATA_FOUND: NO
   ```

6. **Do NOT confuse these with dosage data:**
   - Personal consumption logs ("I took 80mg then 30mg")
   - Medical prescription dosages
   - LD50/toxicity data
   - Purity/concentration information
```

### Available Sources by Key

| Source | Key in `contents` object |
|--------|--------------------------|
| TripSit Factsheets | `tripsit` |
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

## Step 3: Consolidate Agent Findings

After agents return, consolidate their findings into a single report:

```
╔════════════════════════════════════════════════════════════════════╗
║         REVIEW RESULTS: [SUBSTANCE NAME]                           ║
╚════════════════════════════════════════════════════════════════════╝

CURRENT STATE IN ARTICLES.JSON:
  Dosage routes: [list or "NONE"]
  Duration routes: [list or "NONE"]
  Missing: [specific gaps identified]

┌────────────────────────────────────────────────────────────────────┐
│                     FINDINGS BY SOURCE                             │
└────────────────────────────────────────────────────────────────────┘

SOURCE: TripSit (HIGH confidence)
├─ Oral Dosage: ✓ Complete (threshold through heavy)
├─ Oral Duration: ✓ Complete (onset through total)
└─ Insufflated: ✗ No data

SOURCE: PsychonautWiki (MEDIUM confidence)
├─ Oral Dosage: ✓ Partial (missing threshold)
├─ Oral Duration: ✓ Complete
└─ Insufflated Dosage: ✓ Complete

SOURCE: Erowid (LOW confidence)
├─ Dosage: ✗ Legal info only
└─ Duration: ✗ No data

... [continue for each source]

┌────────────────────────────────────────────────────────────────────┐
│                     RECOMMENDED DATA                               │
└────────────────────────────────────────────────────────────────────┘

ORAL DOSAGE (from TripSit - highest confidence):
{
  "route": "Oral",
  "source": "tripsit-factsheets",
  "confidence": "high",
  "ranges": {
    "threshold": { "min": 10, "max": null, "unit": "mg" },
    "light": { "min": 10, "max": 25, "unit": "mg" },
    "common": { "min": 25, "max": 50, "unit": "mg" },
    "strong": { "min": 50, "max": 75, "unit": "mg" },
    "heavy": { "min": 75, "max": null, "unit": "mg" }
  }
}

ORAL DURATION (from TripSit):
{
  "route": "Oral",
  "source": "tripsit-factsheets",
  "confidence": "high",
  "stages": {
    "onset": { "min": 20, "max": 40, "unit": "minutes" },
    "peak": { "min": 2, "max": 4, "unit": "hours" },
    "total": { "min": 4, "max": 6, "unit": "hours" }
  }
}

... [continue for each route]
```

---

## Step 4: Web Search Fallback

**If ALL local sources returned NO DATA, search the web.**

This step is triggered when:
- Every agent reported `DATA_FOUND: NO` for both dosage and duration
- Or the specific missing data (e.g., Insufflated duration) wasn't found in any local source

### Search Strategy

Use WebSearch tool with targeted queries:

```
[substance name] dosage mg threshold light common strong
[substance name] duration onset peak hours
[substance name] [route] dose
```

### Priority Search Targets

1. **PsychonautWiki** (psychonautwiki.org) - Often has data not in our cached version
2. **TripSit Wiki** (drugs.tripsit.me) - May have updated factsheets
3. **Erowid Vault** (erowid.org) - Experience vaults sometimes contain dosage info
4. **Bluelight Forums** - Community-sourced dosage discussions
5. **Reddit** (r/researchchemicals, r/Drugs) - User reports with dosage ranges
6. **Academic sources** - PubMed, pharmacology papers for duration data

### Web Search Report Format

```
WEB SOURCE: [URL]
CREDIBILITY: [HIGH/MEDIUM/LOW]
  - HIGH: Established harm reduction site, academic source
  - MEDIUM: Community wiki, well-sourced forum post
  - LOW: Single user report, unverified claim

ROUTE: [route]

DOSAGE:
{
  "threshold": { "min": [value], "max": [value], "unit": "[unit]" },
  "light": { "min": [value], "max": [value], "unit": "[unit]" },
  "moderate": { "min": [value], "max": [value], "unit": "[unit]" },
  "strong": { "min": [value], "max": [value], "unit": "[unit]" },
  "heavy": { "min": [value], "max": [value], "unit": "[unit]" }
}

DURATION:
{
  "onset": { "min": [value], "max": [value], "unit": "[unit]" },
  "peak": { "min": [value], "max": [value], "unit": "[unit]" },
  "total": { "min": [value], "max": [value], "unit": "[unit]" }
}

NOTES: [context, caveats, sample size if from user reports]
```

### Web Data Guidelines

1. **Cross-reference multiple sources** - Don't rely on a single web result
2. **Prefer conservative estimates** - For harm reduction, use lower dose ranges when sources conflict
3. **Note sample size** - "Based on 3 user reports" vs "Established in literature"
4. **Flag uncertainty** - If data seems unreliable, mark confidence as LOW
5. **Cite the URL** - Always record where web data came from

### When to Skip Web Search

- Substance is too obscure (no web results)
- Only finding single anecdotal reports with no corroboration
- Data found is clearly unreliable or contradictory

In these cases, proceed to Human Approval with "No reliable data found" and consider marking the substance as "Reviewed - No Data Available".

---

## Step 5: Human Approval Gate

**STOP and ask the user for approval before proceeding.**

Present the consolidated findings (from local sources AND web search if performed) and ask:

1. Should we add this data to parsed-sources.json? (Y/N)
2. Any adjustments needed to the values?
3. Which sources should we use? (if multiple have data)
4. For web-sourced data: Is the credibility sufficient?

**Do not proceed without explicit user confirmation.**

---

## Step 6: Transcribe to parsed-sources.json

After user approval, add the data to `src/data/parsed-sources.json`.

### Location in File

```json
{
  "substances": {
    "[slug]": {
      "slug": "[slug]",
      "name": "[name]",
      "dosage": [
        // ADD NEW DOSAGE ENTRIES HERE
      ],
      "duration": [
        // ADD NEW DURATION ENTRIES HERE
      ],
      // ... other fields
    }
  }
}
```

### Dosage Entry Format

```json
{
  "route": "Oral",
  "source": "manual-review-[source]",
  "confidence": "high",
  "ranges": {
    "threshold": { "min": 10, "max": null, "unit": "mg" },
    "light": { "min": 10, "max": 25, "unit": "mg" },
    "common": { "min": 25, "max": 50, "unit": "mg" },
    "strong": { "min": 50, "max": 75, "unit": "mg" },
    "heavy": { "min": 75, "max": null, "unit": "mg" }
  },
  "notes": "Manually extracted from [source] on [date]"
}
```

**Source naming conventions:**
- Local source: `"source": "manual-review-tripsit"` or `"manual-review-psychonautwiki"`
- Web source: `"source": "manual-review-web"` with URL in notes
- Multiple web sources: `"source": "manual-review-web-aggregated"`

**For web-sourced data, always include the URL(s) in notes:**
```json
{
  "notes": "Aggregated from psychonautwiki.org and reddit.com/r/researchchemicals (2026-01-10)"
}
```

### Duration Entry Format

```json
{
  "route": "Oral",
  "source": "manual-review-[source]",
  "confidence": "high",
  "stages": {
    "onset": { "min": 20, "max": 40, "unit": "minutes" },
    "comeUp": { "min": 30, "max": 60, "unit": "minutes" },
    "peak": { "min": 2, "max": 4, "unit": "hours" },
    "offset": { "min": 1, "max": 2, "unit": "hours" },
    "afterEffects": { "min": 2, "max": 6, "unit": "hours" },
    "total": { "min": 4, "max": 8, "unit": "hours" }
  }
}
```

**Note:** Use `camelCase` for duration stages in parsed-sources.json (comeUp, afterEffects). The prepopulate script converts to snake_case for SubstanceIndex.json.

---

## Step 7: Update Task Tracker

After completing a substance review, update the tracker section below.

Move the substance from "Pending" to either:
- **Reviewed - Data Added** (if data was found and added)
- **Reviewed - No Data Available** (if no sources had usable data)

---

## Step 8: Propagate to Articles

After adding data to parsed-sources.json, run the prepopulate script:

```bash
node scripts/prepopulate-dosage-duration.mjs --substance=[slug] --dry-run
```

Review the output, then run without `--dry-run` to apply.

Finally, validate the app:

```bash
npm run build
```

---

## Source Priority Reference

When multiple sources have data, prefer in this order:

**For Dosage (harm reduction focus - prefer lowest upper bounds):**
1. TripSit Factsheets (conservative, harm-reduction focused)
2. PsychonautWiki (comprehensive, community-reviewed)
3. Erowid (when structured data exists)
4. The Drug Classroom (educational focus)
5. DEIS (detailed but sometimes higher doses)

**For Duration:**
1. PsychonautWiki (most comprehensive stage breakdown)
2. Erowid (reliable when present)
3. TripSit (often simplified to onset + total)
4. The Drug Classroom
5. DEIS
6. Drug Users Bible (onset + total only)

---

## Tips for Agents

1. **Check if source exists first** - Not all substances have all sources
2. **Look beyond obvious headers** - Duration data sometimes appears under "Effects" or "Timeline"
3. **Note route-specific data** - Same substance may have different doses for Oral vs Insufflated
4. **Flag ambiguity** - If data seems inconsistent or questionable, note it
5. **Don't invent data** - Better to report "NOT FOUND" than guess

---

## Task Tracker

**Last Updated:** 2026-01-10
**Total Candidates:** 194
- Missing dosage entirely: 68
- Missing duration entirely: 72
- Mismatched routes only: 95

### Currently Processing
<!-- Substance currently being reviewed -->


### Pending Review - Priority Substances (8)

- [ ] cocaine - MISSING_DURATION:Insufflated, MISSING_DOSAGE:Oral, MISSING_DOSAGE:Inhaled
- [ ] dmt - MISSING_DURATION:Insufflated, MISSING_DURATION:Intravenous, MISSING_DURATION:Vaporized
- [ ] ketamine - MISSING_DURATION:Rectal, MISSING_DURATION:I.M., MISSING_DOSAGE:Intramuscular
- [ ] mdma - MISSING_DURATION:Insufflated, MISSING_DURATION:Rectal
- [ ] morphine - MISSING_DOSAGE:Injection, MISSING_DOSAGE:Rectal, MISSING_DOSAGE:Iv/im
- [ ] nitrous - MISSING_DOSAGE:Oral
- [ ] salvia - NO_DOSAGE, MISSING_DOSAGE:Oral

### Pending Review - All Other Substances (186)

- [ ] 1d-lsd - NO_DOSAGE, NO_DURATION
- [ ] 2-fa - MISSING_DOSAGE:Insufflated
- [ ] 2-ma - NO_DURATION, MISSING_DURATION:Insufflated
- [ ] 2-mec - MISSING_DURATION:Insufflated
- [ ] 2-meo-ketamine - NO_DOSAGE, NO_DURATION
- [ ] 2-mmc - NO_DURATION, MISSING_DURATION:Insufflated, MISSING_DURATION:Oral
- [ ] 2-mppp - MISSING_DURATION:Insufflated
- [ ] 2-nmc - NO_DOSAGE, NO_DURATION
- [ ] 25b-nboh - MISSING_DURATION:Sublingual, MISSING_DOSAGE:Oral
- [ ] 25c-nboh - MISSING_DOSAGE:Oral
- [ ] 25c-nbome - MISSING_DOSAGE:Oral
- [ ] 25d-nbome - MISSING_DOSAGE:Oral
- [ ] 25e-nboh - NO_DOSAGE, NO_DURATION
- [ ] 25e-nbome - MISSING_DURATION:Sublingual, MISSING_DOSAGE:Oral
- [ ] 25g-nbome - MISSING_DURATION:Sublingual, MISSING_DOSAGE:Oral
- [ ] 25h-nbome - NO_DOSAGE, MISSING_DOSAGE:Oral
- [ ] 25i-nbf - NO_DOSAGE, NO_DURATION
- [ ] 25i-nbmd - MISSING_DURATION:Sublingual, MISSING_DOSAGE:Oral
- [ ] 25ip-nbome - MISSING_DURATION:Sublingual, MISSING_DOSAGE:Oral
- [ ] 25n-nbome - MISSING_DOSAGE:Insufflated
- [ ] 25t-2-nbome - MISSING_DURATION:Sublingual, MISSING_DOSAGE:Oral
- [ ] 25t-4-nbome - MISSING_DURATION:Sublingual, MISSING_DOSAGE:Oral
- [ ] 2c-b-fly - MISSING_DOSAGE:Insufflated
- [ ] 2c-b-fly-nbome - NO_DURATION, MISSING_DURATION:Insufflated
- [ ] 3-cl-pcp - NO_DOSAGE, NO_DURATION
- [ ] 3-cmc - NO_DURATION, MISSING_DURATION:Insufflated, MISSING_DURATION:Oral
- [ ] 3-fluoromethamphetamine - NO_DOSAGE, NO_DURATION
- [ ] 3-ho-pcp - MISSING_DOSAGE:Insufflated
- [ ] 3-me-pcpy - NO_DOSAGE, NO_DURATION
- [ ] 3-mec - NO_DURATION, MISSING_DURATION:Insufflated, MISSING_DURATION:Oral
- [ ] 3-meo-pcp - MISSING_DOSAGE:Rectal, MISSING_DOSAGE:Intramuscular
- [ ] 3-meo-pcpr - MISSING_DURATION:Insufflated
- [ ] 3-meo-pcpy - MISSING_DURATION:Insufflated
- [ ] 3-meomc - MISSING_DURATION:Insufflated, MISSING_DOSAGE:Oral
- [ ] 34-dichloromethylphenidate - NO_DOSAGE, NO_DURATION
- [ ] 3f-pcp - NO_DOSAGE, NO_DURATION
- [ ] 4-aco-dalt - MISSING_DURATION:Vaporized
- [ ] 4-aco-dpt - MISSING_DURATION:Insufflated, MISSING_DOSAGE:Oral
- [ ] 4-cbc - MISSING_DURATION:Insufflated
- [ ] 4-cma - NO_DOSAGE, NO_DURATION
- [ ] 4-cmc - NO_DURATION, MISSING_DURATION:Oral
- [ ] 4-epd - MISSING_DURATION:Insufflated, MISSING_DOSAGE:Oral
- [ ] 4-fluoromethylphenidate - NO_DOSAGE, NO_DURATION
- [ ] 4-fluoropentedrone - NO_DOSAGE, NO_DURATION
- [ ] 4-fluorophenibut - NO_DOSAGE, NO_DURATION
- [ ] 4-fmc - MISSING_DURATION:Insufflated
- [ ] 4-ho-mcpt - NO_DOSAGE, MISSING_DOSAGE:Oral
- [ ] 4-ho-mpt - MISSING_DURATION:Vaporized
- [ ] 4-ho-pipt - NO_DOSAGE, NO_DURATION
- [ ] 4-mec - MISSING_DURATION:Insufflated
- [ ] 4-meo-butyrfentanyl - NO_DOSAGE, MISSING_DOSAGE:Oral
- [ ] 4-methylmethylphenidate - MISSING_DURATION:Insufflated
- [ ] 4-mpd - NO_DOSAGE, NO_DURATION
- [ ] 4-mpm - MISSING_DURATION:Insufflated
- [ ] 4-mta - NO_DOSAGE, NO_DURATION
- [ ] 4-mxp - NO_DOSAGE, NO_DURATION
- [ ] 4-pro-dmt - NO_DOSAGE, NO_DURATION
- [ ] 4f-eph - MISSING_DOSAGE:Insufflated
- [ ] 4f-neb - MISSING_DURATION:Insufflated
- [ ] 4f-php - MISSING_DURATION:Insufflated, MISSING_DOSAGE:Oral
- [ ] 4f-pvp - NO_DURATION, MISSING_DURATION:Insufflated
- [ ] 5-bromo-dmt - MISSING_DURATION:Vaporized, MISSING_DOSAGE:Oral
- [ ] 5-eapb - NO_DURATION, MISSING_DURATION:Insufflated, MISSING_DURATION:Oral
- [ ] 5-iai - NO_DOSAGE, MISSING_DOSAGE:Oral
- [ ] 5-meo-dalt - MISSING_DURATION:Vaporized
- [ ] 5-meo-dibf - MISSING_DURATION:Insufflated
- [ ] 5-meo-eipt - MISSING_DURATION:Insufflated
- [ ] 5-meo-malt - NO_DURATION, MISSING_DURATION:Insufflated, MISSING_DURATION:Oral, MISSING_DURATION:Vaporized
- [ ] 5-meo-met - MISSING_DURATION:Vaporized
- [ ] 5-meo-mipt - MISSING_DURATION:Inhaled
- [ ] 5-meo-pyr-t - MISSING_DURATION:Vaporized
- [ ] 5-methylethylone - NO_DURATION, MISSING_DURATION:Insufflated, MISSING_DURATION:Oral
- [ ] 5f-akb48 - MISSING_DURATION:Vaporized, MISSING_DOSAGE:Inhaled
- [ ] 6-mapb - MISSING_DURATION:Insufflated
- [ ] a-pihp - MISSING_DURATION:Insufflated, MISSING_DURATION:Vaporized
- [ ] ab-chminaca - NO_DURATION, MISSING_DURATION:Oral
- [ ] ab-fubinaca - NO_DURATION, MISSING_DURATION:Oral, MISSING_DURATION:Vaporized
- [ ] ah-7921 - MISSING_DOSAGE:Inhaled
- [ ] aleph-2 - NO_DOSAGE, MISSING_DOSAGE:Oral
- [ ] alpha-pcyp - NO_DOSAGE, NO_DURATION
- [ ] alpha-php - NO_DOSAGE, NO_DURATION
- [ ] alpha-pihp - NO_DOSAGE, NO_DURATION
- [ ] alpha-pvp - NO_DOSAGE, NO_DURATION
- [ ] am-2201 - MISSING_DURATION:Vaporized, MISSING_DOSAGE:Oral, MISSING_DOSAGE:Inhaled
- [ ] am-694 - NO_DOSAGE, MISSING_DOSAGE:Inhaled
- [ ] amfecloral - NO_DOSAGE, MISSING_DOSAGE:Oral
- [ ] ayahuasca - NO_DOSAGE, MISSING_DOSAGE:Oral
- [ ] bk-2c-b - NO_DOSAGE, MISSING_DOSAGE:Oral
- [ ] c30-nbome - NO_DOSAGE, NO_DURATION
- [ ] cake - NO_DURATION, MISSING_DURATION:Oral
- [ ] canket - NO_DOSAGE, NO_DURATION
- [ ] changa - MISSING_DOSAGE:Inhaled
- [ ] chlordiazepoxide - NO_DOSAGE, NO_DURATION
- [ ] chloroform - NO_DOSAGE, MISSING_DOSAGE:Oral
- [ ] citalopram - NO_DURATION, MISSING_DURATION:Oral
- [ ] coluracetam - MISSING_DURATION:Sublingual
- [ ] d2pm - MISSING_DURATION:Rectal
- [ ] datura - NO_DOSAGE, MISSING_DOSAGE:Oral
- [ ] desomorphine - MISSING_DOSAGE:Intravenous
- [ ] det - MISSING_DURATION:Smoked, MISSING_DURATION:Vaporized
- [ ] diethyl-ether - NO_DOSAGE, MISSING_DOSAGE:Oral
- [ ] dmxe - NO_DOSAGE, NO_DURATION
- [ ] ethaqualone - NO_DURATION, MISSING_DURATION:Oral
- [ ] ethketamine - NO_DURATION, MISSING_DURATION:Oral
- [ ] eutylone - NO_DOSAGE, NO_DURATION
- [ ] fenethylline - NO_DURATION, MISSING_DURATION:Oral
- [ ] fentanyl - MISSING_DOSAGE:Oral
- [ ] flmodafinil - NO_DOSAGE, NO_DURATION
- [ ] furanylfentanyl - MISSING_DURATION:Insufflated
- [ ] hdep-28 - MISSING_DURATION:Insufflated
- [ ] hexen - NO_DOSAGE, NO_DURATION
- [ ] huperzine-a - MISSING_DURATION:Insufflated, MISSING_DOSAGE:Oral
- [ ] indapyrophenidone - MISSING_DURATION:Insufflated, MISSING_DURATION:Vaporized, MISSING_DOSAGE:Oral
- [ ] isophenmetrazine - MISSING_DURATION:Insufflated
- [ ] jwh-018 - NO_DOSAGE, MISSING_DOSAGE:Inhaled
- [ ] jwh-073 - NO_DOSAGE, MISSING_DOSAGE:Inhaled
- [ ] k-2c-i - NO_DURATION, MISSING_DURATION:Oral
- [ ] kanna - MISSING_DURATION:Insufflated, MISSING_DURATION:Vaporized
- [ ] khat - NO_DOSAGE, MISSING_DOSAGE:Oral
- [ ] l-theanine - NO_DOSAGE, NO_DURATION
- [ ] lagochilus-inebrians - MISSING_DURATION:Inhaled
- [ ] lean - NO_DOSAGE, MISSING_DOSAGE:Oral
- [ ] lithium - NO_DOSAGE, NO_DURATION
- [ ] lorazepam - MISSING_DURATION:Intramuscular
- [ ] mal - NO_DOSAGE, NO_DURATION
- [ ] md-php - NO_DOSAGE, NO_DURATION
- [ ] mdpv - MISSING_DURATION:Rectal
- [ ] meai - NO_DOSAGE, MISSING_DOSAGE:Oral
- [ ] mebroqualone - MISSING_DURATION:Sublingual, MISSING_DURATION:Vaporized, MISSING_DOSAGE:Oral
- [ ] mefloquine - NO_DURATION, MISSING_DURATION:Oral
- [ ] methiopropamine - MISSING_DOSAGE:Smoked
- [ ] methoxyketamine - MISSING_DURATION:Insufflated, MISSING_DOSAGE:Oral
- [ ] methoxypiperamide - NO_DOSAGE, MISSING_DOSAGE:Oral
- [ ] methylmethaqualone - MISSING_DURATION:Sublingual, MISSING_DURATION:Vaporized, MISSING_DOSAGE:Oral
- [ ] midazolam - MISSING_DURATION:Insufflated, MISSING_DURATION:Intramuscular, MISSING_DURATION:Rectal
- [ ] mipt - MISSING_DURATION:Insufflated, MISSING_DURATION:Vaporized
- [ ] mt-45 - MISSING_DOSAGE:Insufflated
- [ ] neb - MISSING_DURATION:Insufflated
- [ ] nicotine - NO_DOSAGE, NO_DURATION
- [ ] nitracaine - NO_DURATION, MISSING_DURATION:Insufflated, MISSING_DURATION:Oral
- [ ] nitrous-oxide - NO_DOSAGE, NO_DURATION
- [ ] nm-2-ai - MISSING_DOSAGE:Insufflated
- [ ] noopept - MISSING_DURATION:Insufflated, MISSING_DURATION:Sublingual
- [ ] nutmeg - NO_DOSAGE, NO_DURATION
- [ ] opium - MISSING_DURATION:Smoked
- [ ] oxymorphone - MISSING_DURATION:Insufflated
- [ ] pagoclone - NO_DURATION, MISSING_DURATION:Oral
- [ ] parafluorofentanyl - NO_DURATION, MISSING_DURATION:Insufflated
- [ ] pce - MISSING_DURATION:Insufflated, MISSING_DOSAGE:Oral
- [ ] pcp - MISSING_DURATION:Insufflated
- [ ] pentazocine - MISSING_DURATION:Intramuscular, MISSING_DURATION:Intravenous, MISSING_DOSAGE:Oral
- [ ] pentedrone - MISSING_DURATION:Rectal
- [ ] pentobarbital - MISSING_DURATION:Intramuscular, MISSING_DURATION:Intravenous
- [ ] pfbt - MISSING_DURATION:Insufflated, MISSING_DOSAGE:Oral
- [ ] phenetrazine - NO_DURATION, MISSING_DURATION:Insufflated, MISSING_DURATION:Oral
- [ ] pipradrol - NO_DURATION, MISSING_DURATION:Insufflated
- [ ] pipt - MISSING_DURATION:Vaporized, MISSING_DOSAGE:Oral
- [ ] pmma - NO_DURATION, MISSING_DURATION:Oral
- [ ] pre-084 - NO_DOSAGE, MISSING_DOSAGE:Oral
- [ ] pregabalin - MISSING_DURATION:Medical, MISSING_DURATION:Non-medical
- [ ] propofol - NO_DURATION, MISSING_DURATION:Intravenous
- [ ] propylhexedrine - MISSING_DURATION:Insufflated
- [ ] propylphenidate - MISSING_DOSAGE:Insufflated
- [ ] psilocin - MISSING_DURATION:Insufflated
- [ ] pst - NO_DOSAGE, MISSING_DOSAGE:Oral
- [ ] pv-8 - NO_DURATION, MISSING_DURATION:Oral
- [ ] pvt - NO_DOSAGE, MISSING_DOSAGE:Oral
- [ ] pyrazolam - MISSING_DOSAGE:Insufflated
- [ ] pyrophenidone - MISSING_DURATION:Insufflated, MISSING_DURATION:Vaporized, MISSING_DOSAGE:Oral
- [ ] scopolamine - NO_DOSAGE, NO_DURATION
- [ ] sentia - NO_DOSAGE, MISSING_DOSAGE:Oral
- [ ] sertraline - NO_DURATION, MISSING_DURATION:Oral
- [ ] sinicuichi - NO_DOSAGE, MISSING_DOSAGE:Oral
- [ ] th-pvp - NO_DURATION, MISSING_DURATION:Insufflated, MISSING_DURATION:Oral, MISSING_DURATION:Vaporized
- [ ] thiopental - NO_DOSAGE, MISSING_DOSAGE:Oral
- [ ] thiopropamine - MISSING_DURATION:Oral, MISSING_DOSAGE:Insufflated
- [ ] tiletamine - MISSING_DURATION:Intramuscular
- [ ] tobacco - NO_DOSAGE, MISSING_DOSAGE:Inhaled
- [ ] tramadol - MISSING_DURATION:Nonmedical
- [ ] u-51754 - MISSING_DURATION:Rectal, MISSING_DOSAGE:Oral
- [ ] valerylfentanyl - NO_DURATION, MISSING_DURATION:Oral
- [ ] yopo - NO_DOSAGE, NO_DURATION
- [ ] zaleplon - NO_DOSAGE, NO_DURATION
- [ ] zolazepam - NO_DURATION, MISSING_DURATION:Insufflated, MISSING_DURATION:Intramuscular, MISSING_DURATION:Oral

### Reviewed - Data Added
<!-- Format: - [x] slug (YYYY-MM-DD) - Added [routes] from [source] -->


### Reviewed - No Data Available
<!-- Format: - [x] slug (YYYY-MM-DD) - [reason] -->


---

## Session Log

<!-- Record each review session here for continuity -->

### Session: [DATE]
**Reviewed:** [substance]
**Outcome:** [Added data / No data / Skipped]
**Notes:** [Any relevant observations]

---
