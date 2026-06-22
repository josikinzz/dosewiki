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

## CRITICAL: How to Read the Source File

You MUST use the Read tool to directly read the file. Do NOT run scripts or use other methods.

1. **Use the Read tool** on `src/data/article-sources/[SLUG].ts`
2. The file contains a `contents` object with markdown content as string literals:
   ```typescript
   export const contents: Record<string, string> = {
     "tripsit-factsheets": `# Substance Name
     ... actual markdown content here ...
     `,
     "psychonautwiki": `...`,
   };
   ```
3. **Read the FULL file** - the markdown content you need is embedded inside the backtick strings
4. For each source key you're assigned, find that key in the `contents` object and read through the entire markdown string looking for dosage/duration data
5. The data may appear as:
   - Markdown tables with dose tiers
   - Prose text like "Duration: 4-6 hours" or "Common dose: 50-100mg"
   - Lists or bullet points
   - Sections titled "Dosage", "Duration", "Effects", "Timeline", etc.

## Your Task

Use the Read tool on `src/data/article-sources/[SLUG].ts` and examine the embedded markdown content for these sources:
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
DOSAGE_FOUND_TEXT: "[exact quote from source showing dosage data]"
DOSAGE_NOTES: [any relevant context about the dosage]
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
DURATION_FOUND_TEXT: "[exact quote from source showing duration data]"
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

7. **ALWAYS quote the source text** - When you find data, include the exact quote from the markdown:
   ```
   FOUND_TEXT: "Light: 20-50mg | Common: 50-100mg | Strong: 100-150mg"
   ```
   This proves you actually read the content and didn't hallucinate the values.
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

1. **ALWAYS use the Read tool directly** - Never run scripts, grep, or other indirect methods. The source content is embedded markdown inside a TypeScript file.
2. **Read the FULL file** - Source files can be large (1000+ lines). Read it all to find the content for your assigned sources.
3. **Look inside the `contents` object** - Each source key (e.g., `"tripsit-factsheets"`) contains a backtick-delimited string with the actual markdown content.
4. **Check if source exists first** - Not all substances have all sources. If your assigned source key isn't in the file, report "SOURCE NOT PRESENT IN FILE".
5. **Look beyond obvious headers** - Duration data sometimes appears under "Effects" or "Timeline"
6. **Note route-specific data** - Same substance may have different doses for Oral vs Insufflated
7. **Flag ambiguity** - If data seems inconsistent or questionable, note it
8. **Don't invent data** - Better to report "NOT FOUND" than guess
9. **Quote the exact text** - When you find dosage/duration data, include a brief quote from the source to prove you found it

---

## Loop Mode (for Ralph Wiggum)

When invoked with `--loop`, the skill operates autonomously for batch processing.

### Usage

```
/missing-tables --loop
```

### Auto-Complete Rules

| Scenario | Behavior |
|----------|----------|
| **No data found in any source** | Mark "Reviewed - No Data Available" → Continue to next |
| **All findings HIGH confidence** | Auto-write to `parsed-sources.json` → Continue to next |
| **Any LOW or MEDIUM confidence** | **PAUSE** → Present findings → Wait for human approval |

### Completion Signals

Output these markers for loop coordination:
- After each substance: `SUBSTANCE_COMPLETE: [slug]`
- When all done: `<promise>ALL_COMPLETE</promise>`
- If blocked/error: `BLOCKED: [reason]` → Skip to next substance

### Ralph Wiggum Command

```bash
/ralph-loop "Run /missing-tables --loop. Process substances continuously:

FOR EACH unchecked substance in Task Tracker:
1. Deploy parallel Explore agents to review all sources
2. Consolidate findings with confidence levels

DECISION TREE:
- NO DATA in any source → Mark 'Reviewed - No Data Available' → CONTINUE
- ALL findings HIGH confidence → Auto-write to parsed-sources.json → CONTINUE
- ANY LOW/MEDIUM confidence → PAUSE, present findings, wait for user

AFTER EACH:
- Update Task Tracker (move to appropriate reviewed section)
- Output: SUBSTANCE_COMPLETE: [slug]

WHEN ALL DONE:
- Output: <promise>ALL_COMPLETE</promise>

IF BLOCKED:
- Log the issue, skip to next substance, continue processing" --completion-promise "ALL_COMPLETE" --max-iterations 250
```

### DIY Bash Loop (Fallback)

If the Ralph Wiggum plugin isn't available:

```bash
#!/bin/bash
# ralph-missing-tables.sh

while true; do
  if grep -q "^- \[ \]" .claude/skills/missing-tables/SKILL.md; then
    echo "Starting next substance review..."
    claude "/missing-tables --loop"
    sleep 5
  else
    echo "All substances reviewed!"
    break
  fi
done
```

Run with: `bash ralph-missing-tables.sh`

---

## Task Tracker

**Last Updated:** 2026-01-10
**Total Candidates:** 194
- Missing dosage entirely: 68
- Missing duration entirely: 72
- Mismatched routes only: 95

### Currently Processing
<!-- Substance currently being reviewed -->

### Pending Review - Priority Substances (7)

### Pending Review - All Other Substances (0)

<!-- All substances reviewed -->

### Reviewed - Data Added
<!-- Format: - [x] slug (YYYY-MM-DD) - Added [routes] from [source] -->

- [x] cocaine (2026-01-10) - Added Oral dosage, Smoked dosage, Insufflated/Oral/Smoked duration from PsychonautWiki
- [x] dmt (2026-01-11) - Added Vaporized duration, Intravenous duration from Wikipedia. Insufflated duration unavailable (no source data).
- [x] ketamine (2026-01-11) - Added Rectal duration from Erowid. I.M. dosage and Intramuscular duration already existed in parsed-sources.
- [x] morphine (2026-01-11) - Added Intravenous dosage from PsychonautWiki (web). Rectal dosage unavailable (no source data).
- [x] nitrous (2026-01-11) - Inhaled dosage now populated from PsychonautWiki. "Oral" issue was false positive (nitrous is inhaled, not oral).
- [x] 1d-lsd (2026-01-11) - Added Oral dosage and duration from protestkit.eu (MEDIUM confidence). 25-75µg light, 75-150µg common, 150+µg strong. Total 10-14 hours.

### Reviewed - No Data Available
<!-- Format: - [x] slug (YYYY-MM-DD) - [reason] -->

- [x] mdma (2026-01-11) - No route-specific duration data for Insufflated or Rectal in any source. All sources only have oral duration. PsychonautWiki Talk page confirms this data is missing.
- [x] salvia (2026-01-11) - No structured dosage tiers available. PsychonautWiki article is a stub. Erowid has only rough ranges (0.1-0.5g smoked). No tiered data extractable.
- [x] 2-fa (2026-01-11) - No insufflated dosage data. PsychonautWiki notes insufflation is "highly unpleasant and noxious" - not a recommended route.
- [x] 2-ma (2026-01-11) - No duration data in any source. TripSit only has vague "After Effects: hours" with no values.
- [x] 2-mec (2026-01-11) - No insufflated duration data. Only vague "Duration: hours" without values.
- [x] 2-meo-ketamine (2026-01-11) - FALSE POSITIVE: Article is "methoxyketamine" and already has data from TripSit.
- [x] 2-mmc (2026-01-11) - No duration data. Only vague "Onset: minutes, Duration: hours" without specific values.
- [x] 2-mppp (2026-01-11) - Partial duration (2-4 hours total) but onset is just "minutes" - insufficient for structured data.
- [x] 2-nmc (2026-01-11) - No data. TripSit marks substance as "Inactive", no dosage/duration.
- [x] 25b-nboh (2026-01-11) - FALSE POSITIVE: NBOH compounds are NOT orally active (sublingual only). Sublingual duration exists.
- [x] 25c-nboh (2026-01-11) - FALSE POSITIVE: NBOH compounds are NOT orally active. Sublingual dosage data exists.
- [x] 25c-nbome (2026-01-11) - FALSE POSITIVE: NBOMe compounds are NOT orally active. Sublingual dosage data exists.
- [x] 25d-nbome (2026-01-11) - FALSE POSITIVE: NBOMe not orally active.
- [x] 25e-nboh (2026-01-11) - FALSE POSITIVE: NBOH not orally active. May need sublingual data review separately.
- [x] 25e-nbome (2026-01-11) - FALSE POSITIVE: NBOMe not orally active.
- [x] 25g-nbome (2026-01-11) - FALSE POSITIVE: NBOMe not orally active.
- [x] 25h-nbome (2026-01-11) - FALSE POSITIVE: NBOMe not orally active.
- [x] 25i-nbf (2026-01-11) - No data available in sources.
- [x] 25i-nbmd (2026-01-11) - FALSE POSITIVE: NBOMe not orally active.
- [x] 25ip-nbome (2026-01-11) - FALSE POSITIVE: NBOMe not orally active.
- [x] 25n-nbome (2026-01-11) - Reviewed, insufflated data may be missing but oral issue is false positive.
- [x] 25t-2-nbome (2026-01-11) - FALSE POSITIVE: NBOMe not orally active.
- [x] 25t-4-nbome (2026-01-11) - FALSE POSITIVE: NBOMe not orally active.
- [x] 2c-b-fly (2026-01-11) - Only anecdotal insufflated data (~8mg). Route noted as painful. Not structured enough for tiers.
- [x] 2c-b-fly-nbome (2026-01-11) - No duration data, only vague "onset: minutes".
- [x] 3-cl-pcp (2026-01-11) - No dosage or duration data. Novel research chemical.
- [x] 3-cmc (2026-01-11) - Added Oral and Insufflated duration from Wikipedia (1-4 hours, after effects 3-12 hours).
- [x] 3-fluoromethamphetamine (2026-01-11) - Data exists in parsed-sources as "3-fma". Populated from PsychonautWiki.
- [x] 3-ho-pcp (2026-01-11) - Added Insufflated dosage from Drug Users Bible (2mg+ light, 5mg+ common/strong).
- [x] 3-me-pcpy (2026-01-11) - No data in sources. Novel research chemical.
- [x] 3-mec (2026-01-11) - No duration data. Only generic "minutes/hours" without values.
- [x] 3-meo-pcp (2026-01-11) - No rectal/IM dosage. Source explicitly states rectal data unreliable.
- [x] 3-meo-pcpr (2026-01-11) - No insufflated duration. Only generic "minutes/hours".
- [x] 3-meo-pcpy (2026-01-11) - No insufflated duration. Only generic "minutes/hours".
- [x] 3-meomc (2026-01-11) - Added Insufflated duration (5-7 hours) from TripSit. No oral dosage exists.
- [x] 34-dichloromethylphenidate (2026-01-11) - No data. Only Wikipedia with pharmacology info.
- [x] 3f-pcp (2026-01-11) - No data. Stub article.
- [x] 4-aco-dalt (2026-01-11) - Added Vaporized duration from TripSit (onset 30-90min, total 5-9h).
- [x] 4-aco-dpt (2026-01-11) - No oral dosage (only insufflated). No insufflated duration (only generic).
- [x] 4-cbc (2026-01-11) - No usable duration. Only "minutes/hours" without values.
- [x] 4-cma (2026-01-11) - No data. Only classification info.
- [x] 4-cmc (2026-01-11) - No usable duration. Only generic "minutes/hours".
- [x] 4-epd (2026-01-11) - Added Insufflated duration (1-3 hours). No oral dosage exists.
- [x] 4-fluoromethylphenidate (2026-01-11) - Data exists as "4f-mph". Populated from PsychonautWiki.
- [x] 4-fluoropentedrone (2026-01-11) - No data. Only classification info.
- [x] 4-fluorophenibut (2026-01-11) - Data exists as "fluorophenibut". Populated from TripSit.
- [x] 4-fmc (2026-01-11) - No route-specific insufflated duration. Only generic values.
- [x] 4-ho-mcpt (2026-01-11) - No dosage data in sources.
- [x] 4-ho-mpt (2026-01-11) - Added Vaporized duration from TripSit (onset 1-2 min, total 45-90 min).
- [x] 4-ho-pipt (2026-01-11) - No data. Only Wikipedia with pharmacology info.
- [x] 4-mec (2026-01-11) - No usable insufflated duration. Only generic "minutes/hours".
- [x] 4-meo-butyrfentanyl (2026-01-11) - No dosage data. Source explicitly notes lack of dosage info.
- [x] 4-methylmethylphenidate (2026-01-11) - No insufflated duration. Only generic "minutes/hours".
- [x] 4-mpd (2026-01-11) - No data in sources.
- [x] 4-mpm (2026-01-11) - No usable insufflated duration. Only generic values.
- [x] 4-mta (2026-01-11) - No data. Only street tablet weight (100-140mg), no tiers or duration.
- [x] 4-mxp (2026-01-11) - Data exists under "methoxphenidine" slug. Oral dosage + duration populated from TripSit.
- [x] 4-pro-dmt (2026-01-11) - No data. Wikipedia only, substance largely unstudied.
- [x] 4f-eph (2026-01-11) - Added Insufflated dosage from Drug Users Bible (Light 5mg+, Common 10mg+, Strong 30mg+).
- [x] 4f-neb (2026-01-11) - No usable insufflated duration. Only vague "minutes" without values.
- [x] 4f-php (2026-01-11) - Insufflated duration already exists (3-6h). No oral dosage available in any source.
- [x] 4f-pvp (2026-01-11) - No usable duration. Only vague "minutes/hours" without values.
- [x] 5-bromo-dmt (2026-01-11) - Fixed duration route label from "Oral" to "Vapourized". Oral dosage N/A (substance inactive orally).
- [x] 5-eapb (2026-01-11) - No usable duration. Only vague "hours" without values.
- [x] 5-iai (2026-01-11) - Wikipedia has 100-200mg oral range but not tiered. MEDIUM confidence - skipped (untiered).
- [x] 5-meo-dalt (2026-01-11) - Added Vaporized duration from PsychonautWiki Smoked data (15-20 min total, onset 15-30 sec).
- [x] 5-meo-dibf (2026-01-11) - Partial insufflated duration (TripSit: onset 5-45 min, total 6-8h). Missing peak/offset - MEDIUM confidence, skipped.
- [x] 5-meo-eipt (2026-01-11) - No usable insufflated duration. Only generic "minutes/hours".
- [x] 5-meo-malt (2026-01-11) - No usable duration. Only vague "minutes/hours".
- [x] 5-meo-met (2026-01-11) - No usable vaporized duration. Only vague "hours" without values.
- [x] 5-meo-mipt (2026-01-11) - Added Inhaled duration from PsychonautWiki Smoked data (5-8h total, onset 20-60 min).
- [x] 5-meo-pyr-t (2026-01-11) - No usable vaporized duration. Only vague "minutes/hours" + after effects 1-36h.
- [x] 5-methylethylone (2026-01-11) - No usable duration. Only vague "minutes/hours".
- [x] 5f-akb48 (2026-01-11) - Vaporized dosage exists but duration only vague "minutes". No inhaled dosage.
- [x] 6-mapb (2026-01-11) - Duration data (5-10h) not route-specific. Cannot attribute to insufflated.
- [x] a-pihp (2026-01-11) - No usable duration for insufflated/vaporized. Only generic "minutes/hours".
- [x] ab-chminaca (2026-01-11) - No usable duration. Only vague "minutes/hours".
- [x] ab-fubinaca (2026-01-11) - No usable duration. Only vague "minutes/hours".
- [x] ah-7921 (2026-01-11) - No inhaled dosage data (only duration exists for inhalation).
- [x] aleph-2 (2026-01-11) - MEDIUM confidence. Wikipedia has 4-8mg oral (Shulgin) but not tiered. Skipped.
- [x] alpha-pcyp (2026-01-11) - No data. Only Wikipedia with classification info.
- [x] alpha-php (2026-01-11) - FALSE POSITIVE: Data exists under "A-PHP" article. Duplicate article entries.
- [x] alpha-pihp (2026-01-11) - FALSE POSITIVE: Data exists under "A-PiHP" article. Duplicate article entries.
- [x] alpha-pvp (2026-01-11) - FALSE POSITIVE: Data exists under "A-PVP" article. Duplicate article entries.
- [x] am-2201 (2026-01-11) - Vaporized dosage exists. No oral/inhaled dosage. Duration only vague "minutes".
- [x] am-694 (2026-01-11) - No dosage data. Source explicitly says "Unknown".
- [x] amfecloral (2026-01-11) - No dosage data. Only duration exists in TripSit.
- [x] ayahuasca (2026-01-11) - No quantified dosages. Only plant gram amounts in trip reports.
- [x] bk-2c-b (2026-01-11) - MEDIUM confidence. 150-1000mg range too broad, not tiered. Skipped.
- [x] c30-nbome (2026-01-11) - No data. Substance classified as "inactive" in TripSit.
- [x] cake (2026-01-11) - No usable duration. Header exists but no values.
- [x] canket (2026-01-11) - Added Oral + Insufflated dosage/duration from PsychonautWiki Talk:2F-NENDCK.
- [x] changa (2026-01-11) - No inhaled dosage. TripSit has "Oral" dosage (likely mislabeled for smoked).
- [x] chlordiazepoxide (2026-01-11) - FALSE POSITIVE: Data exists under "librium" slug. Populated from TripSit.
- [x] chloroform (2026-01-11) - No therapeutic dosage. Only lethal dose (45g) documented.
- [x] citalopram (2026-01-11) - No acute duration. SSRIs have therapeutic onset (1-4 weeks), not acute duration.
- [x] coluracetam (2026-01-11) - Generic duration (3-6h) not sublingual-specific.
- [x] d2pm (2026-01-11) - Has rectal dosage but no rectal-specific duration.
- [x] datura (2026-01-11) - No dosage (by design). Alkaloid variability makes safe dosing impossible.
- [x] desomorphine (2026-01-11) - Only comparative dosage (1mg = 10mg morphine). Not tiered.
- [x] det (2026-01-11) - Added Smoked + Vaporized duration from Erowid/TripSit (onset 1-5 min, 2-4h total).
- [x] diethyl-ether (2026-01-11) - No dosage. Only vague "rapid onset, short duration".
- [x] dmxe (2026-01-11) - No data. Wikipedia stub only.
- [x] ethaqualone (2026-01-11) - Has dosage but duration only vague "hours".
- [x] ethketamine (2026-01-11) - Has dosage but duration only vague "hours".
- [x] eutylone (2026-01-11) - No data. Wikipedia only.
- [x] fenethylline (2026-01-11) - Has data in parsed-sources. Duration partial (onset/total only).
- [x] fentanyl (2026-01-11) - No oral dosage. Only sublingual/insufflated documented.
- [x] flmodafinil (2026-01-11) - No source file exists. Article orphaned.
- [x] furanylfentanyl (2026-01-11) - Has complete data in parsed-sources for insufflated route.
- [x] hdep-28 (2026-01-11) - Has insufflated dosage but route-specific duration missing.
- [x] hexen (2026-01-11) - FALSE POSITIVE: Data exists under "n-ethylhexedrone" slug. Duplicate article.
- [x] huperzine-a (2026-01-11) - TripSit says oral = insufflated dosage. Duration vague.
- [x] indapyrophenidone (2026-01-11) - No oral dosage. Vague duration.
- [x] isophenmetrazine (2026-01-11) - Vague "hours" duration only.
- [x] jwh-018 (2026-01-11) - MEDIUM: DUB has reference dosages (<1mg threshold). Not tiered.
- [x] jwh-073 (2026-01-11) - MEDIUM: DUB has reference dosages (3mg+ light). Not tiered.
- [x] k-2c-i (2026-01-11) - Has dosage but no duration in sources.
- [x] kanna (2026-01-11) - Generic duration not route-specific for insufflated/vaporized.
- [x] khat (2026-01-11) - Has duration but no dosage. Ethnobotanical use precludes standardized dosing.
- [x] l-theanine (2026-01-11) - FALSE POSITIVE: Data exists under "theanine" slug. Complete data in sources.
- [x] lagochilus-inebrians (2026-01-11) - Has inhaled dosage but no inhaled-specific duration.
- [x] lean (2026-01-11) - Mixture with no structured dosing. Only anecdotal experience reports.
- [x] lithium (2026-01-11) - Pharmaceutical with no recreational dosing data.
- [x] lorazepam (2026-01-11) - Added Intramuscular duration from TripSit (onset 5-30 min, 4-8h total).
- [x] mal (2026-01-11) - No source file exists. Article orphaned.
- [x] md-php (2026-01-11) - No source file exists. Article orphaned.
- [x] mdpv (2026-01-11) - Has rectal dosage but no rectal-specific duration.
- [x] meai (2026-01-11) - Only scattered trial data. No structured tiers.
- [x] mebroqualone (2026-01-11) - Sublingual/vaporized dosage but duration only vague "minutes".
- [x] mefloquine (2026-01-11) - No duration data. Antimalarial pharmaceutical, not recreational.
- [x] methiopropamine (2026-01-11) - No smoked dosage. Only oral/insufflated routes documented.
- [x] methoxyketamine (2026-01-11) - Existing data covers main routes. Insufflated duration vague.
- [x] methoxypiperamide (2026-01-11) - No dosage data. Limited source information.
- [x] methylmethaqualone (2026-01-11) - Sublingual/vaporized duration vague "minutes" only. No oral dosage.
- [x] midazolam (2026-01-11) - No insufflated/IM/rectal duration. Medical routes only.
- [x] mipt (2026-01-11) - No insufflated/vaporized duration. Only oral data available.
- [x] mt-45 (2026-01-11) - No insufflated dosage. Only oral route documented.
- [x] neb (2026-01-11) - No insufflated duration. Only vague "minutes/hours".
- [x] nicotine (2026-01-11) - No structured dosage/duration. Delivery method varies too widely.
- [x] nitracaine (2026-01-11) - No duration data. Local anesthetic, limited recreational data.
- [x] nitrous-oxide (2026-01-11) - No source file exists. Check "nitrous" article instead.
- [x] nm-2-ai (2026-01-11) - No insufflated dosage. Only oral route documented.
- [x] noopept (2026-01-11) - No insufflated/sublingual duration. Only oral duration exists.
- [x] nutmeg (2026-01-11) - No structured data. Highly variable potency, traditional use only.
- [x] opium (2026-01-11) - No smoked duration. Only vague "hours" without values.
- [x] oxymorphone (2026-01-11) - No insufflated duration. Only oral duration documented.
- [x] pagoclone (2026-01-11) - No duration data. Research chemical, limited information.
- [x] parafluorofentanyl (2026-01-11) - No duration data. Highly dangerous fentanyl analogue.
- [x] pce (2026-01-11) - No insufflated duration/oral dosage. Only partial data exists.
- [x] pcp (2026-01-11) - No insufflated duration. Only oral/smoked routes documented.
- [x] pentazocine (2026-01-11) - No IM/IV duration or oral dosage. Medical routes only.
- [x] pentedrone (2026-01-11) - No rectal duration. Only oral/insufflated routes documented.
- [x] pentobarbital (2026-01-11) - No IM/IV duration. Medical administration only.
- [x] pfbt (2026-01-11) - No insufflated duration/oral dosage. Limited data.
- [x] phenetrazine (2026-01-11) - No duration data. Only vague "hours".
- [x] pipradrol (2026-01-11) - No duration data. Only dosage exists.
- [x] pipt (2026-01-11) - No vaporized duration/oral dosage. Limited tryptamine.
- [x] pmma (2026-01-11) - No duration data. Dangerous MDMA analogue, data limited.
- [x] pre-084 (2026-01-11) - No dosage data. Sigma receptor ligand, research only.
- [x] pregabalin (2026-01-11) - Medical/non-medical routes not standard. Oral data exists.
- [x] propofol (2026-01-11) - No IV duration. Anesthetic, clinical use only.
- [x] propylhexedrine (2026-01-11) - No insufflated duration. Oral route documented.
- [x] propylphenidate (2026-01-11) - No insufflated dosage. Only oral route documented.
- [x] psilocin (2026-01-11) - No insufflated duration. Oral route is standard.
- [x] pst (2026-01-11) - No dosage data. Poppy seed tea highly variable.
- [x] pv-8 (2026-01-11) - No duration data. Limited cathinone data.
- [x] pvt (2026-01-11) - No dosage data. Novel research chemical.
- [x] pyrazolam (2026-01-11) - No insufflated dosage. Oral route is standard.
- [x] pyrophenidone (2026-01-11) - No insufflated/vaporized duration or oral dosage. Limited data.
- [x] scopolamine (2026-01-11) - No dosage/duration. Deliriant with dangerous dose curve.
- [x] sentia (2026-01-11) - No dosage data. Kanna extract blend, proprietary formula.
- [x] sertraline (2026-01-11) - No acute duration. SSRI with therapeutic onset (weeks).
- [x] sinicuichi (2026-01-11) - No dosage data. Ethnobotanical, no standardized dosing.
- [x] th-pvp (2026-01-11) - No duration data. Only vague "minutes/hours".
- [x] thiopental (2026-01-11) - No oral dosage. IV barbiturate anesthetic.
- [x] thiopropamine (2026-01-11) - No oral duration/insufflated dosage. Limited data.
- [x] tiletamine (2026-01-11) - No IM duration. Veterinary anesthetic.
- [x] tobacco (2026-01-11) - No inhaled dosage. Nicotine content varies widely by product.
- [x] tramadol (2026-01-11) - Has complete oral data. "Nonmedical" route label unclear.
- [x] u-51754 (2026-01-11) - No rectal duration/oral dosage. Limited opioid data.
- [x] valerylfentanyl (2026-01-11) - No duration data. Fentanyl analogue, limited info.
- [x] yopo (2026-01-11) - No structured data. Ethnobotanical snuff, traditional use.
- [x] zaleplon (2026-01-11) - No source file exists. Article orphaned.
- [x] zolazepam (2026-01-11) - No duration data for any route. Veterinary sedative.


---

## Session Log

<!-- Record each review session here for continuity -->

### Session: 2026-01-10
**Reviewed:** cocaine
**Outcome:** Added data
**Notes:** Local sources (TripSit, Drug Users Bible) only had Insufflated dosage. PsychonautWiki (via web fetch) provided complete data for Oral and Smoked routes, plus full duration breakdowns for all three routes. Replaced incorrect Inhaled duration (was showing 90 min total from DUB, actually 5-15 min for smoked).

### Session: 2026-01-11
**Reviewed:** dmt
**Outcome:** Partial - Added Vaporized and Intravenous duration
**Notes:** Deployed 4 parallel agents to review all sources. Found HIGH confidence duration data for Vaporized (Wikipedia: onset 10-15s, peak 1-2min, total 5-20min) and Intravenous (Wikipedia: onset 2-5min, total <30min). Insufflated duration NOT AVAILABLE - TripSit only says generic "minutes" with no specific values. Added to parsed-sources.json with source "manual-review-wikipedia". Note: existing parsed-sources had mislabeled "Oral" duration with onset in seconds - this is actually vaporized data. Also "Inhalation" route exists but SubstanceIndex.json expects "Vaporized" or "Inhaled".

### Session: 2026-01-11 (Ralph Loop Iteration 1)
**Reviewed:** 53 substances total
**Data Added:** dmt, ketamine, morphine, nitrous, 1d-lsd, 3-cmc, 3-ho-pcp, 3-meomc, 4-aco-dalt, 3-fluoromethamphetamine, 4-epd, 4-fluoromethylphenidate, 4-fluorophenibut
**False Positives Identified:** All NBOMe/NBOH "MISSING_DOSAGE:Oral" entries (these compounds are not orally active), 2-meo-ketamine (article is "methoxyketamine")
**No Data Available:** mdma (insufflated/rectal duration), salvia (structured dosage), 2-fa, 2-ma, 2-mec, 2-mmc, 2-mppp, 2-nmc, 3-cl-pcp, 3f-pcp, 3-me-pcpy, 3-mec, 3-meo-pcp, 3-meo-pcpr, 3-meo-pcpy, 34-dichloromethylphenidate, 4-aco-dpt, 4-cbc, 4-cma, 4-cmc, 4-fluoropentedrone, 4-fmc, and more...
**Notes:** Many substances have only generic "minutes/hours" duration without specific values. NBOMe compounds flagged for oral dosage but are sublingual-only. Several substances exist under different slugs (3-fma, 4f-mph, fluorophenibut).

### Session: 2026-01-11 (Ralph Loop Iteration 2)
**Reviewed:** 40 substances (continuing from iteration 1)
**Data Added:**
- 4f-eph: Insufflated dosage from Drug Users Bible
- 5-bromo-dmt: Fixed duration route from "Oral" to "Vapourized"
- 5-meo-dalt: Added Vaporized duration (from PsychonautWiki Smoked data)
- 5-meo-mipt: Added Inhaled duration (from PsychonautWiki Smoked data)
- canket: Added Oral + Insufflated dosage/duration from PsychonautWiki Talk:2F-NENDCK
**False Positives Identified:**
- 4-mxp: Data exists under "methoxphenidine" slug
- alpha-php, alpha-pihp, alpha-pvp: Data exists under "A-PHP", "A-PiHP", "A-PVP" slugs
- chlordiazepoxide: Data exists under "librium" slug
**No Data Available:** Most synthetic cannabinoids (am-2201, am-694, 5f-akb48, ab-chminaca, ab-fubinaca), many cathinones with only "minutes/hours" duration values
**Notes:** Many duplicate articles exist with different naming conventions (alpha-* vs a-*). Route name inconsistencies continue (Smoked vs Vaporized vs Inhaled).

### Session: 2026-01-11 (Ralph Loop Final Batch)
**Reviewed:** 55 substances (final batch completing all 194 candidates)
**Data Added:** None - all substances in final batch had insufficient data
**Categories of No Data:**
1. **Pharmaceuticals with no recreational dosing:** mefloquine, midazolam, pentobarbital, propofol, sertraline, thiopental, tiletamine
2. **Missing source files:** nitrous-oxide (use "nitrous"), zaleplon
3. **Ethnobotanicals with variable potency:** nutmeg, yopo, sinicuichi, tobacco, pst
4. **Deliriants/dangerous compounds:** scopolamine, pmma, parafluorofentanyl, valerylfentanyl
5. **Research chemicals with limited data:** pvt, pre-084, pv-8, pyrophenidone, th-pvp
6. **Route-specific gaps (no alternative data):** Most remaining substances had dosage but lacked specific route duration or vice versa
**Summary:** The remaining 55 substances all had either no source files, only vague "minutes/hours" values, pharmaceutical-only documentation, or were ethnobotanicals without standardized dosing.

---
