---
name: harm-potential
description: Extract verbatim harm-related text from source articles
---

# Harm Potential Extraction

Extract verbatim harm-related text from source articles for a given substance. Deploys one agent per source to manually read and extract complete sections related to addiction, dependence, LD50, organ toxicity, carcinogenicity, psychosis, seizures, antibiotic properties, and other health risks.

Output is compiled into `harmpotential-quotes/{slug}-harmpotential.md`.

## Usage

```
/harm-potential [substance-slug]
/harm-potential --loop
```

- **No argument**: Start with next unchecked substance in Task Tracker
- **With slug**: Process specific substance
- **--loop**: Continuously process all remaining substances

> **IMPORTANT:** When invoked without an argument, immediately find the first `- [ ]` item in the Task Tracker and begin processing. Do not ask which substance to process—just start.

---

## CRITICAL: FOCUS RULES

**ONE SUBSTANCE AT A TIME. COMPLETE IT FULLY BEFORE MOVING ON.**

When processing a substance:
1. Deploy agents for that substance (one per source, can be parallel)
2. Wait for ALL agents to return
3. Compile the results into the output file
4. Write the output file
5. Update the task tracker
6. **ONLY THEN** proceed to the next substance

**DO NOT:**
- Start processing a second substance before the first is complete
- Dispatch agents for multiple substances simultaneously
- Skip ahead in the task tracker
- Get distracted by other substances

**STAY FOCUSED.** Finish what you started before moving on. This is critical for long loop sessions.

---

## ⛔ ABSOLUTE PROHIBITION: NEVER READ SOURCE CONTENT DIRECTLY

**YOU (the orchestrating agent) MUST NEVER read the `contents` object from source files.**

The ONLY thing you are allowed to do with `src/data/article-sources/{slug}.ts` is:
1. Read the first ~30 lines to extract the `sources` array
2. Count how many sources exist
3. **IMMEDIATELY deploy agents** - one per source

**FORBIDDEN ACTIONS:**
- ❌ Reading the full source file yourself
- ❌ Using Read tool with large limits on source files
- ❌ Scrolling through the `contents` object
- ❌ Extracting harm content yourself without agents
- ❌ Using Grep on source files to find harm content
- ❌ Summarizing or paraphrasing source content yourself

**WHY THIS MATTERS:**
- Source files can be 10,000+ tokens - reading them yourself wastes context
- Agents work in parallel - deploying 5 agents is faster than reading 5 sources sequentially
- You will drift and start "just reading one more" - this always escalates
- After context compaction, you lose track of what approach you were using

**THE PATTERN IS ALWAYS:**
```
1. Read first 30 lines → get sources array
2. Deploy N agents (one per source) → Task tool with Explore subagent
3. Wait for agents → compile their outputs
4. Write file → update tracker → next substance
```

**IF YOU CATCH YOURSELF** reading a source file's `contents` directly, STOP IMMEDIATELY. Delete any files you created incorrectly and restart with agents.

---

## Step 1: Identify Sources (LIMITED READ ONLY)

**Read ONLY the first ~30 lines** of `src/data/article-sources/{slug}.ts` to extract the `sources` array.

```bash
# Use Read tool with limit parameter:
Read file_path="src/data/article-sources/{slug}.ts" limit=30
```

```typescript
// You're looking for this structure (usually lines 1-10):
export const sources = [
  {"id":"psychonautwiki","fileName":"...","displayName":"PsychonautWiki",...},
  {"id":"drugbank","fileName":"...","displayName":"DrugBank",...},
  // ... more sources
];
```

Count the sources. **STOP READING HERE.** Do not scroll down. Do not read the `contents` object.

**You will deploy ONE AGENT PER SOURCE.** Proceed immediately to Step 2.

---

## Step 2: Deploy Agents (One Per Source)

Deploy parallel agents using the Task tool with `subagent_type: Explore`.

**DEPLOY ONE AGENT FOR EACH SOURCE.** For example, if a substance has 6 sources, deploy 6 agents in parallel.

### Agent Prompt Template

Use this exact prompt for each agent, substituting the substance slug and source key:

```
You are extracting verbatim harm-related text from a source article for [SUBSTANCE NAME].

## CRITICAL: HOW TO READ THE SOURCE FILE

You MUST use the Read tool to directly read the ENTIRE file.

1. Use the Read tool on `src/data/article-sources/[SLUG].ts`
2. READ THE ENTIRE FILE - do not use offset/limit, do not skim
3. The file contains a `contents` object with markdown as string literals
4. Find your assigned source key "[SOURCE_KEY]" in the contents object
5. READ THROUGH THE ENTIRE MARKDOWN STRING for your source

## ABSOLUTELY FORBIDDEN:
- DO NOT use grep, regex, or pattern matching to find sections
- DO NOT use scripts or bash commands
- DO NOT use Glob or Grep tools
- DO NOT skip sections or skim
- DO NOT extract snippets or fragments
- You must READ with your eyes and MANUALLY identify relevant content

## WHAT TO EXTRACT

Look for ANY text related to:
- Addiction potential / abuse potential
- Dependence (physical or psychological)
- LD50 / lethal dose / fatal dose / overdose deaths
- Organ toxicity (liver, kidney, heart, brain, bladder damage)
- Carcinogenicity / cancer risk / mutagenicity
- Neurotoxicity
- Psychosis / psychotic episodes
- Seizures / convulsions
- Antibiotic / antimicrobial properties
- Any other notable health risks

## HOW TO EXTRACT

Extract COMPLETE SECTIONS. Do not break paragraphs or sentences.
- If you find a section header like "## Toxicity and harm potential", extract the ENTIRE section
- If you find relevant paragraphs within a larger section, extract the FULL paragraphs with context
- If a sentence mentions harm but is mid-paragraph, extract the WHOLE paragraph
- ERR ON THE SIDE OF TAKING MORE TEXT, not less
- Include the section headers in your extraction
- Preserve all markdown formatting (headers, lists, bold, links)

## OUTPUT FORMAT

Return your findings in this exact format:

---
SOURCE: [source display name, e.g., "PsychonautWiki"]
SOURCE_KEY: [key in contents object, e.g., "psychonautwiki"]

### Extracted Content

[Paste the verbatim extracted text here, with markdown formatting preserved]

---

If you find MULTIPLE relevant sections, include them all under "Extracted Content" with their original headers.

If you find NO relevant harm content in your assigned source, return:

---
SOURCE: [source display name]
SOURCE_KEY: [key]
CONTENT_FOUND: NONE
---
```

### Source Key Reference

| Source | Key in `contents` object |
|--------|--------------------------|
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

## Step 3: Compile Results

After ALL agents return, compile their findings into a single markdown file.

**DO NOT manually copy/paste each agent's output.** Use the Write tool to directly create the output file with all agent content concatenated together.

**Output format:**

```markdown
# {Substance Name} - Harm Potential Quotes

> Verbatim extractions from source articles. Generated {YYYY-MM-DD}.

---

## Source: PsychonautWiki

[extracted content from psychonautwiki agent]

---

## Source: DrugBank

[extracted content from drugbank agent]

---

## Source: TripSit

[extracted content from tripsit agent]

---

... etc for each source that had content
```

**Compilation rules:**
- Only include sources that returned content (skip sources with `CONTENT_FOUND: NONE`)
- Preserve all original markdown formatting from agent outputs
- Use `---` horizontal rules between sources for visual separation
- Include the generation date in the header
- Concatenate all agent outputs verbatim - do not summarize or edit

---

## Step 4: Write Output File

Use the **Write tool** to create the compiled file at:

```
harmpotential-quotes/{slug}-harmpotential.md
```

**This is a single Write tool call** containing the full compiled markdown with all agent outputs concatenated. Do not make multiple writes or manual edits.

If the `harmpotential-quotes/` directory doesn't exist, create it first with:
```bash
mkdir -p harmpotential-quotes
```

---

## Step 5: Update Task Tracker

After successfully writing the output file, update the Task Tracker in this SKILL.md file:

- Change `- [ ] slug` to `- [x] slug (YYYY-MM-DD)`
- If NO sources had harm content, mark as `- [x] slug (YYYY-MM-DD) - NO HARM CONTENT`

---

## Loop Mode

When invoked with `--loop`, operate continuously but **ONE SUBSTANCE AT A TIME**:

1. Find the first unchecked `- [ ]` substance in the Task Tracker
2. **FOCUS ENTIRELY ON THIS ONE SUBSTANCE:**
   - Deploy agents (one per source, parallel is fine)
   - Wait for ALL agents to return
   - Compile output
   - Write file
   - Update tracker
3. Output: `SUBSTANCE_COMPLETE: {slug}`
4. **ONLY NOW** move to the next unchecked substance
5. Repeat until all substances are processed

**CRITICAL:** Do not start the next substance until the current one is 100% complete. No multitasking across substances.

**⚠️ CONTEXT COMPACTION WARNING:** After context compaction, you may lose track of the correct approach. If you find yourself reading source files directly instead of deploying agents, STOP. Re-read this SKILL.md file from the beginning. The prohibition section exists because this exact drift has happened before.

**Auto-continue rules:**
- If agents find content → write file → mark complete → continue to next
- If agents find NO content in ANY source → mark as `- [x] slug (YYYY-MM-DD) - NO HARM CONTENT` → continue to next
- If error occurs → log error, mark as `- [x] slug (YYYY-MM-DD) - ERROR: {reason}` → continue to next

**Completion signal:** Output `<promise>ALL_COMPLETE</promise>` when all substances are processed.

---

## Tips

### For the Orchestrator (YOU):
1. **ONLY read first 30 lines** of source files to get the `sources` array
2. **NEVER read the `contents` object** - that's the agents' job
3. **Deploy agents in parallel** - one per source, using Task tool
4. **Compile agent outputs verbatim** - do not summarize or re-extract

### For the Agents (in their prompt):
1. **ALWAYS use Read tool directly** - Never use grep, find, or other search tools
2. **Read the FULL file** - Source files can be 1000+ lines. Agents read it all.
3. **Look inside `contents` object** - Each source key contains a backtick-delimited string
4. **Check if source exists** - Not all substances have all sources
5. **Preserve formatting** - Keep headers, lists, links, bold text exactly as written
6. **Take more, not less** - Better to extract extra context than miss important info
7. **Don't interpret** - Extract verbatim text only, no paraphrasing or summarizing

---
## Task Tracker

> **Filtered to published substances only** (577 total on site)

**Completed:** 251
**Remaining:** 13

### Completed

- [x] 1-4-butanediol (2026-01-11)
- [x] 1b-lsd (2026-01-11)
- [x] 1cp-al-lad (2026-01-11)
- [x] 1cp-lsd (2026-01-11)
- [x] 1cp-mipla (2026-01-11)
- [x] 1d-lsd (2026-01-11) - NO HARM CONTENT
- [x] 1p-eth-lad (2026-01-11)
- [x] 1p-lsd (2026-01-11)
- [x] 1v-lsd (2026-01-11)
- [x] 2-aminoindane (2026-01-11)
- [x] 2-chloroephenidine (2026-01-11) - NO HARM CONTENT
- [x] 2-fa (2026-01-11)
- [x] 2-fea (2026-01-11)
- [x] 2-fluorodeschloroketamine (2026-01-11)
- [x] 2-fma (2026-01-11)
- [x] 2-ma (2026-01-11)
- [x] 2-me-dmt (2026-01-11) - NO HARM CONTENT
- [x] 2-mec (2026-01-11) - NO HARM CONTENT
- [x] 2-mmc (2026-01-11) - NO HARM CONTENT
- [x] 2-mppp (2026-01-11)
- [x] 2-nmc (2026-01-11)
- [x] 2-pa (2026-01-11) - NO HARM CONTENT
- [x] 2-pta (2026-01-11) - NO HARM CONTENT
- [x] 25-dma (2026-01-11)
- [x] 25b-nboh (2026-01-11)
- [x] 25b-nbome (2026-01-11)
- [x] 25c-nboh (2026-01-11)
- [x] 25c-nbome (2026-01-11)
- [x] 25d-nbome (2026-01-11)
- [x] 25e-nboh (2026-01-11)
- [x] 25e-nbome (2026-01-11)
- [x] 25g-nbome (2026-01-11)
- [x] 25h-nbome (2026-01-11)
- [x] 25i-nbf (2026-01-11) - NO HARM CONTENT
- [x] 25i-nbmd (2026-01-11)
- [x] 25i-nboh (2026-01-11)
- [x] 25i-nbome (2026-01-11)
- [x] 25ip-nbome (2026-01-11)
- [x] 25n-nbome (2026-01-11)
- [x] 25p-nbome (2026-01-11)
- [x] 25t-2-nbome (2026-01-11) - NO HARM CONTENT
- [x] 25t-4-nbome (2026-01-11)
- [x] 2c-b (2026-01-11)
- [x] 2c-b-an (2026-01-11) - NO HARM CONTENT
- [x] 2c-b-fly (2026-01-11)
- [x] 2c-b-fly-nbome (2026-01-11)
- [x] 2c-c (2026-01-11)
- [x] 2c-d (2026-01-11)
- [x] 2c-e (2026-01-11)
- [x] 2c-g (2026-01-11) - NO HARM CONTENT
- [x] 2c-i (2026-01-11)
- [x] 2c-ip (2026-01-11) - NO HARM CONTENT
- [x] 2c-n (2026-01-11)
- [x] 2c-p (2026-01-11)
- [x] 2c-t (2026-01-11)
- [x] 2c-t-2 (2026-01-11)
- [x] 2c-t-21 (2026-01-11)
- [x] 2c-t-4 (2026-01-11)
- [x] 2c-t-7 (2026-01-11)
- [x] 2m2b (2026-01-11)
- [x] 3-4-ctmp (2026-01-11)
- [x] 3-cl-pcp (2026-01-11)
- [x] 3-cmc (2026-01-11)
- [x] 3-fa (2026-01-11)
- [x] 3-fea (2026-01-11)
- [x] 3-fma (2026-01-11)
- [x] 3-fmc (2026-01-11)
- [x] 3-fpm (2026-01-11)
- [x] 3-ho-pce (2026-01-11)
- [x] 3-ho-pcp (2026-01-11)
- [x] 3-me-pcpy (2026-01-11) - NO HARM CONTENT
- [x] 3-mec (2026-01-11) - NO HARM CONTENT
- [x] 3-meo-pce (2026-01-11)
- [x] 3-meo-pcmo (2026-01-11)
- [x] 3-meo-pcp (2026-01-11)
- [x] 3-meo-pcpr (2026-01-11) - NO HARM CONTENT
- [x] 3-meo-pcpy (2026-01-11)
- [x] 3-meomc (2026-01-11)
- [x] 3-mmc (2026-01-11)
- [x] 3-oh-phenazepam (2026-01-11)
- [x] 3c-e (2026-01-11)
- [x] 3c-p (2026-01-11)
- [x] 4-4-dmar (2026-01-11)
- [x] 4-aco-dalt (2026-01-11) - NO HARM CONTENT
- [x] 4-aco-det (2026-01-11)
- [x] 4-aco-dipt (2026-01-11)
- [x] 4-aco-dmt (2026-01-11)
- [x] 4-aco-dpt (2026-01-11)
- [x] 4-aco-met (2026-01-11)
- [x] 4-aco-mipt (2026-01-11)
- [x] 4-benzylpiperidine (2026-01-11)
- [x] 4-cbc (2026-01-11)
- [x] 4-cmc (2026-01-11)
- [x] 4-emc (2026-01-11)
- [x] 4-epd (2026-01-11) - NO HARM CONTENT
- [x] 4-fa (2026-01-11)
- [x] 4-fea (2026-01-11) - NO HARM CONTENT
- [x] 4-fluorobutyrfentanyl (2026-01-11)
- [x] 4-fluoropentedrone (2026-01-11) - NO HARM CONTENT
- [x] 4-fma (2026-01-11)
- [x] 4-fmc (2026-01-11)
- [x] 4-fpp (2026-01-11)
- [x] 4-ho-det (2026-01-11)
- [x] 4-ho-dipt (2026-01-11)
- [x] 4-ho-dpt (2026-01-11)
- [x] 4-ho-ept (2026-01-11)
- [x] 4-ho-mcpt (2026-01-11) - NO HARM CONTENT
- [x] 4-ho-met (2026-01-11)
- [x] 4-ho-mipt (2026-01-11)
- [x] 4-ho-mpmi (2026-01-11)
- [x] 4-ho-mpt (2026-01-11)
- [x] 4-ho-pipt (2026-01-11) - NO HARM CONTENT
- [x] 4-mec (2026-01-11)
- [x] 4-meo-butyrfentanyl (2026-01-11)
- [x] 4-meo-mipt (2026-01-11)
- [x] 4-meo-pcp (2026-01-11)
- [x] 4-methylaminorex (2026-01-11)
- [x] 4-methylmethylphenidate (2026-01-11)
- [x] 4-mpd (2026-01-11)
- [x] 4-mpm (2026-01-11)
- [x] 4-pro-dmt (2026-01-11)
- [x] 4f-eph (2026-01-11)
- [x] 4f-mph (2026-01-11)
- [x] 4f-neb (2026-01-11) - NO HARM CONTENT
- [x] 4f-php (2026-01-11)
- [x] 4f-pvp (2026-01-11)
- [x] 5-apb (2026-01-11)
- [x] 5-apdb (2026-01-11)
- [x] 5-apdi (2026-01-11)
- [x] 5-bpdi (2026-01-11)
- [x] 5-bromo-dmt (2026-01-11)
- [x] 5-dbfpv (2026-01-11)
- [x] 5-eapb (2026-01-11)
- [x] 5-hydroxytryptophan (2026-01-11)
- [x] 5-iai (2026-01-11)
- [x] 5-it (2026-01-11)
- [x] 5-mapb (2026-01-11)
- [x] 5-mapdb (2026-01-11)
- [x] 5-meo-dalt (2026-01-11)
- [x] 5-meo-dibf (2026-01-11)
- [x] 5-meo-dipt (2026-01-11)
- [x] 5-meo-dmt (2026-01-11)
- [x] 5-meo-dpt (2026-01-11)
- [x] 5-meo-eipt (2026-01-11)
- [x] 5-meo-malt (2026-01-11)
- [x] 5-meo-met (2026-01-11)
- [x] 5-meo-mipt (2026-01-11)
- [x] 5-meo-mt (2026-01-11)
- [x] 5-meo-nipt (2026-01-11)
- [x] 5-meo-pyr-t (2026-01-11)
- [x] 5-methylethylone (2026-01-11)
- [x] 5-ppdi (2026-01-11)
- [x] 5f-akb48 (2026-01-11)
- [x] 5f-pb-22 (2026-01-11)
- [x] 6-apb (2026-01-11)
- [x] 6-apdb (2026-01-11)
- [x] 6-eapb (2026-01-11)
- [x] 6-mapb (2026-01-11)
- [x] 6-mddm (2026-01-11)
- [x] a-php (2026-01-11)
- [x] a-pihp (2026-01-11)
- [x] a-pvp (2026-01-11)
- [x] ab-chminaca (2026-01-11)
- [x] ab-fubinaca (2026-01-11)
- [x] acetildenafil (2026-01-11)
- [x] acetylfentanyl (2026-01-11)
- [x] acrylfentanyl (2026-01-11)
- [x] adinazolam (2026-01-11)
- [x] adrafinil (2026-01-11)
- [x] afloqualone (2026-01-11)
- [x] ah-7921 (2026-01-11)
- [x] al-lad (2026-01-11)
- [x] alcohol (2026-01-11)
- [x] ald-52 (2026-01-11)
- [x] aleph (2026-01-11)
- [x] aleph-2 (2026-01-11)
- [x] allobarbital (2026-01-11)
- [x] allylescaline (2026-01-11)
- [x] alpha-gpc (2026-01-11)
- [x] alprazolam (2026-01-11)
- [x] am-2201 (2026-01-11)
- [x] am-694 (2026-01-11)
- [x] amfecloral (2026-01-11)
- [x] amfonelic-acid (2026-01-11)
- [x] aminorex (2026-01-11)
- [x] aminotadalafil (2026-01-11)
- [x] amobarbital (2026-01-11)
- [x] amphetamine (2026-01-11)
- [x] amt (2026-01-11)
- [x] aniracetam (2026-01-11)
- [x] armodafinil (2026-01-11)
- [x] ashwagandha (2026-01-11)
- [x] aspirin (2026-01-11)
- [x] atomoxetine (2026-01-11)
- [x] ayahuasca (2026-01-11)
- [x] baclofen (2026-01-11)
- [x] barbital (2026-01-11)
- [x] bentazepam (2026-01-11)
- [x] benzydamine (2026-01-11)
- [x] bk-2c-b (2026-01-11)
- [x] bod (2026-01-11)
- [x] bromantane (2026-01-11)
- [x] bromazepam (2026-01-11)
- [x] bromazolam (2026-01-11)
- [x] bromo-dragonfly (2026-01-11)
- [x] brotizolam (2026-01-11)
- [x] buphedrone (2026-01-11)
- [x] buprenorphine (2026-01-11)
- [x] bupropion (2026-01-11)
- [x] buspirone (2026-01-11)
- [x] butylone (2026-01-11)
- [x] butyrfentanyl (2026-01-11)
- [x] bzp (2026-01-11)
- [x] caffeine (2026-01-11)
- [x] cake (2026-01-11)
- [x] camazepam (2026-01-11)
- [x] cannabis (2026-01-11)
- [x] carisoprodol (2026-01-11)
- [x] cathinone (2026-01-11)
- [x] changa (2026-01-11)
- [x] chloral-betaine (2026-01-11)
- [x] chloral-hydrate (2026-01-11)
- [x] chloroform (2026-01-11)
- [x] choline-bitartrate (2026-01-11)
- [x] cinolazepam (2026-01-11)
- [x] citalopram (2026-01-11)
- [x] citicoline (2026-01-11)
- [x] clobazam (2026-01-11)
- [x] clomethiazole (2026-01-11)
- [x] clonazepam (2026-01-11)
- [x] clonazolam (2026-01-11)
- [x] clonidine (2026-01-11)
- [x] cloniprazepam (2026-01-11)
- [x] clonitazene (2026-01-11)
- [x] clorazepate (2026-01-11)
- [x] clotiazepam (2026-01-11)
- [x] cloxazolam (2026-01-11)
- [x] cocaine (2026-01-11)
- [x] codeine (2026-01-11)
- [x] coluracetam (2026-01-11)
- [x] creatine (2026-01-11)
- [x] crl-40-940 (2026-01-11)
- [x] crl-40-941 (2026-01-11)
- [x] cyclazodone (2026-01-11)
- [x] cyclizine (2026-01-11)
- [x] cyclo-methiodrone (2026-01-11)
- [x] cyclobenzaprine (2026-01-11)
- [x] cyclopropylmescaline (2026-01-11)
- [x] d2pm (2026-01-11)
- [x] dalt (2026-01-11)
- [x] lsd (2026-01-11)

### Remaining

- [x] datura (2026-01-12)
- [x] dehydroxyfluorafinil (2026-01-12)
- [x] delorazepam (2026-01-12)
- [x] deschloroetizolam (2026-01-12)
- [x] deschloroketamine (2026-01-12)
- [x] desmethylflunitrazepam (2026-01-12)
- [x] desomorphine (2026-01-12)
- [x] desoxypipradrol (2026-01-12)
- [x] det (2026-01-12)
- [x] dexmethylphenidate (2026-01-12)
- [x] dextroamphetamine (2026-01-12)
- [x] dextromethorphan (2026-01-12)
- [x] dextromoramide (2026-01-12)
- [x] dextropropoxyphene (2026-01-12)
- [x] diazepam (2026-01-12)
- [x] dichloropane (2026-01-12)
- [x] diclazepam (2026-01-12)
- [x] diclofensine (2026-01-12)
- [x] diethyl-ether (2026-01-12)
- [x] dihydrocodeine (2026-01-12)
- [x] dimemebfe (2026-01-12)
- [x] dimenhydrinate (2026-01-12)
- [x] diphenhydramine (2026-01-12)
- [x] diphenidine (2026-01-12)
- [x] dipipanone (2026-01-12)
- [x] dipt (2026-01-12)
- [x] dmaa (2026-01-12)
- [x] dmt (2026-01-12)
- [x] dmxe (2026-01-12)
- [x] dob (2026-01-12)
- [x] doc (2026-01-12)
- [x] doet (2026-01-12)
- [x] doi (2026-01-12)
- [x] doip (2026-01-12)
- [x] dom (2026-01-12)
- [x] don (2026-01-12)
- [x] dopr (2026-01-12)
- [x] doxylamine (2026-01-12)
- [x] dpt (2026-01-12)
- [x] ephedrine (2026-01-12)
- [x] ephenidine (2026-01-12)
- [x] ephylone (2026-01-12)
- [x] ept (2026-01-12)
- [x] escaline (2026-01-12)
- [x] estazolam (2026-01-12)
- [x] eszopiclone (2026-01-12)
- [x] et (2026-01-12)
- [x] eth-cat (2026-01-12)
- [x] eth-lad (2026-01-12)
- [x] ethaqualone (2026-01-12)
- [x] ethchlorvynol (2026-01-12)
- [x] ethketamine (2026-01-12)
- [x] ethylmorphine (2026-01-12)
- [x] ethylone (2026-01-12)
- [x] ethylphenidate (2026-01-12)
- [x] etizolam (2026-01-12)
- [x] eutylone (2026-01-12)
- [x] f-phenibut (2026-01-12)
- [x] fasoracetam (2026-01-12)
- [x] fenethylline (2026-01-12)
- [x] fentanyl (2026-01-12)
- [x] flualprazolam (2026-01-12)
- [x] flubromazepam (2026-01-12)
- [x] flubromazolam (2026-01-12)
- [x] fluclotizolam (2026-01-12)
- [x] flunitrazepam (2026-01-12)
- [x] flunitrazolam (2026-01-12)
- [x] fluorolintane (2026-01-12)
- [x] fluorophenibut (2026-01-12)
- [x] flurazepam (2026-01-12)
- [x] flutazolam (2026-01-12)
- [x] flutoprazepam (2026-01-12)
- [x] furanylfentanyl (2026-01-12)
- [x] gaba (2026-01-12)
- [x] gabapentin (2026-01-12)
- [x] gbl (2026-01-12)
- [x] ghb (2026-01-12)
- [x] glaucine (2026-01-12)
- [x] glutethimide (2026-01-12)
- [x] h-2c-b (2026-01-12)
- [x] halazepam (2026-01-12)
- [x] haloperidol (2026-01-12)
- [x] hdep-28 (2026-01-12)
- [x] heroin (2026-01-12)
- [x] hexedrone (2026-01-12)
- [x] hexobarbital (2026-01-12)
- [x] homosildenafil (2026-01-12)
- [x] hot-2 (2026-01-12)
- [x] hot-7 (2026-01-12)
- [x] huperzine-a (2026-01-12)
- [x] hxe (2026-01-12)
- [x] hydrocodone (2026-01-12)
- [x] hydromorphone (2026-01-12)
- [x] hydroxyzine (2026-01-12)
- [x] ibogaine (2026-01-12)
- [x] ibuprofen (2026-01-12)
- [x] indapex (2026-01-12)
- [x] indapyrophenidone (2026-01-12)
- [x] isomethadone (2026-01-12)
- [x] isophenmetrazine (2026-01-12)
- [x] isopropylphenidate (2026-01-12)
- [x] isoproscaline (2026-01-12) - NO HARM CONTENT
- [x] jwh-018 (2026-01-12)
- [x] jwh-073 (2026-01-12) - NO HARM CONTENT
- [x] k-2c-b (2026-01-12) - NO HARM CONTENT
- [x] k-2c-i (2026-01-12) - NO HARM CONTENT
- [x] k-ivp (2026-01-12) - NO HARM CONTENT
- [x] kanna (2026-01-12)
- [x] kava (2026-01-12)
- [x] ketamine (2026-01-12)
- [x] ketazolam (2026-01-12)
- [x] ketobemidone (2026-01-12)
- [x] khat (2026-01-12)
- [x] kratom (2026-01-12)
- [x] lae-32 (2026-01-12)
- [x] lagochilus-inebrians (2026-01-12)
- [x] lean (2026-01-12)
- [x] librium (2026-01-12)
- [x] lisdexamfetamine (2026-01-12)
- [x] lithium (2026-01-12)
- [x] loprazolam (2026-01-12)
- [x] lorazepam (2026-01-12)
- [x] lormetazepam (2026-01-12)
- [x] lsa (2026-01-12)
- [x] lsm-775 (2026-01-12)
- [x] lsz (2026-01-12)
- [x] marinol (2026-01-12)
- [x] mbdb (2026-01-12)
- [x] mbzp (2026-01-12)
- [x] mcpp (2026-01-12)
- [x] mda (2026-01-12)
- [x] mdai (2026-01-12)
- [x] mdea (2026-01-12)
- [x] mdma (2026-01-12)
- [x] mdoh (2026-01-12)
- [x] mdpa (2026-01-12) - NO HARM CONTENT
- [x] mdphp (2026-01-12)
- [x] mdpv (2026-01-12)
- [x] meai (2026-01-12) - NO HARM CONTENT
- [x] mebroqualone (2026-01-12) - NO HARM CONTENT
- [x] meclofenoxate (2026-01-12)
- [x] meclonazepam (2026-01-12) - NO HARM CONTENT
- [x] medazepam (2026-01-12) - NO HARM CONTENT
- [x] mefloquine (2026-01-12)
- [x] melatonin (2026-01-12)
- [x] mem (2026-01-12)
- [x] memantine (2026-01-12)
- [x] mephedrone (2026-01-12)
- [x] mephenaqualone (2026-01-12)
- [x] mescaline (2026-01-12)
- [x] met (2026-01-12)
- [x] metaclazepam (2026-01-12)
- [x] metaxalone (2026-01-12)
- [x] methadone (2026-01-12)
- [x] methallylescaline (2026-01-12)
- [x] methamnetamine (2026-01-12) - NO HARM CONTENT
- [x] methamphetamine (2026-01-12)
- [x] methaqualone (2026-01-12)
- [x] methcathinone (2026-01-12)
- [x] methiopropamine (2026-01-12)
- [x] methoxetamine (2026-01-12)
- [x] methoxphenidine (2026-01-12)
- [x] methoxyacetyl-fentanyl (2026-01-12)
- [x] methoxyketamine (2026-01-12)
- [x] methoxypiperamide (2026-01-12) - NO HARM CONTENT
- [x] methylmethaqualone (2026-01-12)
- [x] methylnaphthidate (2026-01-12)
- [x] methylone (2026-01-12)
- [x] methylphenidate (2026-01-12)
- [x] methyprylon (2026-01-12)
- [x] metizolam (2026-01-12)
- [x] mexazolam (2026-01-12)
- [x] mexedrone (2026-01-12)
- [x] midazolam (2026-01-12)
- [x] mipla (2026-01-12)
- [x] mipt (2026-01-12)
- [x] mk-801 (2026-01-12)
- [x] moclobemide (2026-01-12)
- [x] modafinil (2026-01-12)
- [x] morpheridine (2026-01-12)
- [x] morphine (2026-01-12)
- [x] mt-45 (2026-01-12)
- [x] mxm (2026-01-12)
- [x] n-acetylcysteine (2026-01-12)
- [x] n-ethylhexedrone (2026-01-12)
- [x] n-methylbisfluoromodafinil (2026-01-12)
- [x] naloxone (2026-01-12)
- [x] naphyrone (2026-01-12)
- [x] naproxen (2026-01-12)
- [x] neb (2026-01-12)
- [x] nefiracetam (2026-01-12)
- [x] nep (2026-01-12)
- [x] nicomorphine (2026-01-12)
- [x] nicotine (2026-01-12)
- [x] nifoxipam (2026-01-12)
- [x] nimetazepam (2026-01-12)
- [x] nitemazepam (2026-01-12) - NO HARM CONTENT
- [x] nitracaine (2026-01-12)
- [x] nitrazepam (2026-01-12)
- [x] nitrazolam (2026-01-12)
- [x] nitrous (2026-01-12)
- [x] nm-2-ai (2026-01-12)
- [x] noopept (2026-01-12)
- [x] nordazepam (2026-01-12)
- [x] norflurazepam (2026-01-12)
- [x] nutmeg (2026-01-12)
- [x] o-desmethyltramadol (2026-01-12)
- [x] o-pce (2026-01-12)
- [x] opium (2026-01-12)
- [x] oxazepam (2026-01-12)
- [x] oxazolam (2026-01-12)
- [x] oxiracetam (2026-01-12)
- [x] oxycodone (2026-01-12)
- [x] oxymorphone (2026-01-12)
- [x] pagoclone (2026-01-12)
- [x] paracetamol (2026-01-12)
- [x] parafluorofentanyl (2026-01-12)
- [x] pargy-lad (2026-01-12)
- [x] pbp (2026-01-12) - NO HARM CONTENT
- [x] pce (2026-01-12) - NO HARM CONTENT
- [x] pcp (2026-01-12)
- [x] pemoline (2026-01-12)
- [x] pentazocine (2026-01-12)
- [x] pentedrone (2026-01-12)
- [x] pentobarbital (2026-01-12)
- [x] pentylone (2026-01-12)
- [x] pethidine (2026-01-12)
- [x] pfbt (2026-01-12) - NO HARM CONTENT
- [x] phenazepam (2026-01-12)
- [x] phenethylamine (2026-01-12)
- [x] phenetrazine (2026-01-12) - NO HARM CONTENT
- [x] phenibut (2026-01-12)
- [x] phenmetrazine (2026-01-12)
- [x] phenobarbital (2026-01-12)
- [x] phentermine (2026-01-12)
- [x] phenylpiracetam (2026-01-12)
- [x] picamilon (2026-01-12)
- [x] pinazepam (2026-01-12)
- [x] pipradrol (2026-01-12)
- [x] pipt (2026-01-12) - NO HARM CONTENT
- [x] piracetam (2026-01-12)
- [x] pma (2026-01-12)
- [x] pmma (2026-01-12)
- [x] pramiracetam (2026-01-12)
- [x] prazepam (2026-01-12)
- [x] pre-084 (2026-01-12) - NO HARM CONTENT
- [x] pregabalin (2026-01-12)
- [x] prl-8-53 (2026-01-12)
- [x] pro-lad (2026-01-12)
- [x] prochlorperazine (2026-01-12)
- [x] progesterone (2026-01-12)
- [x] prolintane (2026-01-12)
- [x] promethazine (2026-01-12)
- [x] propofol (2026-01-12)
- [x] propoxyphene (2026-01-12)
- [x] propranolol (2026-01-12)
- [x] propylhexedrine (2026-01-12)
- [x] propylphenidate (2026-01-12)
- [x] proscaline (2026-01-12)
- [x] pseudoephrine (2026-01-12)
- [x] psilocin (2026-01-12)
- [x] psilocybin-mushrooms (2026-01-12)
- [x] pst (2026-01-12)
- [x] pv-8 (2026-01-12)
- [x] pvt (2026-01-12)
- [x] pyrazolam (2026-01-12)
- [x] pyrophenidone (2026-01-12)
- [x] quazepam (2026-01-12)
- [x] quetiapine (2026-01-12)
- [x] rilmazafone (2026-01-12)
- [x] risperidone (2026-01-12)
- [x] rolicyclidine (2026-01-12)
- [x] ronlax (2026-01-12)
- [x] salvia (2026-01-12)
- [x] salvinorin-b-methoxymethyl-ether (2026-01-12)
- [x] sam-e (2026-01-12)
- [x] scopolamine (2026-01-12)
- [x] secobarbital
- [ ] tapentadol
- [ ] temazepam
- [ ] thiopental
- [ ] thiopropamine
- [ ] tianeptine
- [ ] tma-2
- [ ] tma-6
- [ ] tramadol
- [ ] trazodone
- [ ] triazolam
- [ ] valerylfentanyl
- [ ] zolpidem
- [ ] zopiclone
