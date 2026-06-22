---
name: subjective-effects
description: Extract verbatim subjective effects-related text from source articles (Cursor workflow).
---

# Subjective Effects Extraction (Cursor)

Extract verbatim subjective effects-related text from source articles for a given substance and compile it into `subjective-effects-quotes/{slug}-subjective-effects.md`.

## Scope and focus
- One substance at a time. Finish it fully before moving to the next.
- **CRITICAL: You MUST update the Task Tracker below after completing EVERY single drug before proceeding to the next one.** This ensures progress is accurately tracked and not lost if the session is interrupted.
- **MANDATORY: Read the ENTIRE source file for each substance.** No shortcuts, no assumptions, no skipping.
- Manual reading only. Do not auto-extract effects content with regex or scripts.
- **Effect descriptions inform user expectations. Completeness and accuracy are critical. Read every word.**

## Excluded sources
**IMPORTANT:** The following sources must be **SKIPPED** during extraction:
- **PsychonautWiki** (`psychonautwiki`) — Do not extract
- **DEIS / Disregard Everything I Say** (`disregardeverythingisay`) — Do not extract

These sources are excluded from this workflow. When reading source files, identify and skip these sources entirely. Do not include them in the output file.

## Usage
- Trigger phrases: "effects" or "subjective" or "experience"
- Provide a substance slug (e.g., `lsd`) or ask for the next unchecked item in your tracker (if you keep one).

## Step 1: Identify sources (limited read only)
- Read only the top of `src/data/article-sources/{slug}.ts` to capture the `sources` array.
- Example:
  `sed -n '1,40p' src/data/article-sources/{slug}.ts`

Record the list of `id` and `displayName` values. Do not read the `contents` object yet.

## Step 2: Extract per source (manual review)

**CRITICAL: Effect descriptions help users understand what to expect. Accuracy and completeness are paramount. NO SHORTCUTS ALLOWED.**

**⚠️ SKIP these sources entirely:** `psychonautwiki`, `disregardeverythingisay` — do not read or extract from them.

For each **non-excluded** source in the `sources` array:

1) **MUST read the ENTIRE source file completely.** Read `src/data/article-sources/{slug}.ts` in full using the `read_file` tool. Do NOT use grep, sed, or any search tools to find effects sections. You MUST read every word of every source to ensure nothing is missed.

2) **NO search shortcuts.** Do NOT use `grep` or `rg` to find "Effects" sections. Do NOT assume you know where effects content might be. Subjective effects information can appear anywhere in a source:
   - In dedicated "Effects" or "Subjective effects" sections
   - In "Subjective Experience" narratives
   - In "Physical Effects", "Cognitive Effects", "Visual Effects" subsections
- Embedded in introductory paragraphs
   - Within experience reports
   - In "Summary" or "Overview" sections
   - Scattered throughout the text as descriptions
   - In comparison sections

3) **Read the complete markdown content** for each source key from the `contents` object. Extract the full text block from the opening backtick to the closing backtick. Read it entirely, word by word.

4) **Manual identification only.** After reading the complete source content, manually identify all subjective effects-related content. Do not use regex or automated searches within the content. Read every sentence carefully.

5) **When in doubt, include it.** If a sentence or paragraph describes any effect or experience (even tangentially), include it. It's better to include too much context than to miss important effect descriptions.

**What constitutes subjective effects content:**

### Physical Effects
- Body high descriptions (tingling, warmth, heaviness, lightness)
- Stimulation vs sedation
- Euphoria (physical)
- Nausea, appetite changes
- Pupil dilation, sweating
- Motor control effects (coordination, tremor)
- Tactile sensations and enhancement
- Temperature regulation changes
- Muscle tension or relaxation
- Heart rate and blood pressure sensations
- Bodily control enhancement or impairment
- Pain perception changes
- Energy levels

### Cognitive Effects
- Thought patterns (acceleration, deceleration, loops)
- Conceptual thinking
- Time distortion (compression, expansion)
- Memory effects (enhancement, suppression)
- Introspection and self-reflection
- Euphoria (cognitive/emotional)
- Anxiety, paranoia
- Ego effects (suppression, dissolution, death)
- Unity and interconnectedness
- Empathy and sociability
- Focus and concentration
- Creativity enhancement
- Mindfulness
- Delusions
- Confusion
- Déjà vu

### Visual Effects
**Enhancements:**
- Color enhancement
- Visual acuity enhancement
- Pattern recognition enhancement
- Magnification

**Distortions:**
- Drifting (melting, breathing, morphing, flowing)
- Color shifting
- Tracers
- After images
- Depth perception distortions
- Perspective distortions
- Symmetrical texture repetition
- Scenery slicing

**Geometry:**
- Open-eye geometry descriptions
- Closed-eye geometry descriptions
- Geometry style (algorithmic, organic, structured, unstructured)
- Geometry complexity and intensity levels

**Hallucinatory States:**
- Internal hallucinations (autonomous entities, settings, scenarios)
- External hallucinations
- Transformations
- Machinescapes
- Shadow people

### Auditory Effects
- Sound enhancement
- Sound distortions
- Auditory hallucinations
- Music appreciation enhancement

### Other Sensory Effects
- Tactile enhancement or distortion
- Olfactory (smell) effects
- Gustatory (taste) effects
- Synesthesia (cross-sensory experiences)

### Experiential States
- Mystical experiences
- Near-death experiences
- Out-of-body experiences
- Hole experiences (dissociatives)
- Peak experiences

**Remember: Effect descriptions help users understand what to expect. Read everything.**

### Reading source files

**MANDATORY APPROACH:**
1. Use the `read_file` tool to read `src/data/article-sources/{slug}.ts` completely
2. Read the entire file from start to finish
3. For each source in the `sources` array, locate its corresponding entry in the `contents` object
4. Read the complete markdown string for that source (from opening backtick to closing backtick)
5. Do NOT skip any sections. Do NOT assume certain sources won't have effects content.
6. Read every word carefully, looking for subjective effects-related information

**DO NOT:**
- Use grep/rg to search for "Effects" sections
- Skip sources you think won't have effects content
- Read only parts of files
- Use sed or other tools to extract specific sections
- Make assumptions about where effects content might be

**Helper scripts are NOT recommended** for this task as they may encourage skipping full file reads. Read the complete source file using `read_file` tool.

### What to extract
Look for any text related to the subjective effects schema fields:

**Physical Effects**
- Body high, stimulation/sedation, nausea, motor effects

**Cognitive Effects**
- Thought patterns, time distortion, ego effects, emotional states

**Sensory Effects**
- Visual (enhancements, distortions, geometry, hallucinations)
- Auditory (enhancement, distortion, hallucination)
- Tactile, olfactory, gustatory

### How to extract
- Extract complete sections or full paragraphs; keep headers and formatting.
- If an effect description is mid-paragraph, include the whole paragraph.
- Err on the side of including more context.
- Preserve any lists, bullet points, or structured effect descriptions.

### First-person narratives (high value)
**First-person experience narratives are especially valuable.** These provide authentic, detailed descriptions of subjective effects that structured lists cannot capture.

Sources with rich first-person narratives:
- **Drug Users Bible** — Personal trip reports and detailed experiential accounts
- **Isomer Design** — First-person phenethylamine/tryptamine experience descriptions

When extracting from these sources:
- Include complete narrative passages, not just effect keywords
- Preserve the author's voice and descriptive language
- Extract full paragraphs that describe the quality/character of effects
- Include temporal descriptions ("at the peak...", "as it wore off...")
- Capture comparative descriptions ("similar to X but with more...")

## Step 3: Compile results
Create a single markdown file with one section per source that has content.

Output format:

```
# {Substance Name} - Subjective Effects Quotes

> Verbatim extractions from source articles. Generated YYYY-MM-DD.

---

## Source: Drug Users Bible

[verbatim extracted text]

---

## Source: Erowid

[verbatim extracted text]

---

## Source: The Drug Classroom

[verbatim extracted text]
```

Rules:
- Skip sources with no subjective effects content.
- Preserve markdown formatting.
- Do not paraphrase.

## Step 4: Write output file
Write to:
`subjective-effects-quotes/{slug}-subjective-effects.md`

Create the directory if needed:
`mkdir -p subjective-effects-quotes`

## Step 5: Update tracker
After completing extraction for a substance, update the Task Tracker section at the bottom of this file:
1. Change `- [ ] {slug}` to `- [x] {slug}` with the completion date
2. Update the Progress counts (Completed/Remaining)

Example:
```
- [ ] lsd (high)
```
becomes:
```
- [x] lsd (high) — 2026-01-13
```

## Source key reference
| Source | Key in `contents` object | Status |
|--------|--------------------------|--------|
| TripSit Factsheets | `tripsit-factsheets` | ✅ Include |
| TripSit Wiki | `tripsit-wiki` | ✅ Include |
| PsychonautWiki | `psychonautwiki` | ❌ **EXCLUDED** |
| Erowid | `erowid` | ✅ Include |
| DrugBank | `drugbank` | ✅ Include |
| DEIS | `disregardeverythingisay` | ❌ **EXCLUDED** |
| The Drug Classroom | `thedrugclassroom` | ✅ Include |
| Drug Users Bible | `drugusersbible` | ✅ Include |
| SaferParty | `saferparty` | ✅ Include |
| Wikipedia | `wikipedia` | ✅ Include |
| Isomer Design | `isomerdesign` | ✅ Include |

## Source priority for subjective effects
Drug Users Bible has rich narrative descriptions. Prioritize reading these sources (PsychonautWiki and DEIS are **excluded** from this workflow):

1. **Drug Users Bible** - Rich first-person subjective narratives ⭐
2. **Isomer Design** - First-person phenethylamine/tryptamine experiences ⭐
3. **Erowid** - Experience descriptions and effect summaries
4. **The Drug Classroom** - Effect summaries and comparisons
5. **TripSit** - Basic effect descriptions
6. **Wikipedia** - General effect overviews
7. **DrugBank** - Clinical effect information
8. **SaferParty** - User-reported effects

⭐ = Contains valuable first-person narrative descriptions

**Excluded (do not extract):** PsychonautWiki, DEIS (Disregard Everything I Say)

## Schema field mapping
When reviewing extracted content, mentally map to these schema fields:

| Schema Field | What to Look For |
|--------------|------------------|
| `notes.overview` | General effect summary, character of experience |
| `notes.sensory` | Overall sensory experience notes |
| `notes.cognitive` | Overall cognitive experience notes |
| `notes.physical` | Overall physical experience notes |
| `sensory.visual` | Visual effects (geometry, hallucinations, enhancements) |
| `sensory.auditory` | Auditory effects |
| `sensory.tactile` | Touch-related effects |
| `cognitive` | Thought patterns, time distortion, ego effects |
| `physical` | Body high, stimulation, nausea, motor effects |

---

## Task Tracker

253 substances with priority "high" or "normal". Mark as `[x]` when complete. Start with one drug, then move onto the next, then the next, etc, etc, until you are complete.

**MANDATORY: You MUST update this tracker after completing EVERY single drug before proceeding to the next one.**

### Progress
- Total: 253
- Completed: 164
- Remaining: 89

### Checklist

- [x] 1-4-butanediol (high) — 2026-01-15
- [x] 1b-lsd (high) — 2026-01-15 (no data in valid sources)
- [x] 1cp-al-lad (high) — 2026-01-15 (no data in valid sources)
- [x] 1cp-lsd (high) — 2026-01-15
- [x] 1cp-mipla (high) — 2026-01-15 (no data in valid sources)
- [x] 1p-eth-lad (high) — 2026-01-15
- [x] 1p-lsd (high) — 2026-01-15
- [x] 1v-lsd (high) — 2026-01-15 (no data in valid sources)
- [x] 2-aminoindane (high) — 2026-01-15
- [x] 2-chloroephenidine (high) — 2026-01-15 (no data in valid sources)
- [x] 2-fa (high) — 2026-01-15
- [x] 2-fea (high) — 2026-01-15 (no data in valid sources)
- [x] 2-fluorodeschloroketamine (high) — 2026-01-15 (no data in valid sources)
- [x] 2-fma (high) — 2026-01-15
- [x] 2-meo-ketamine (high) — 2026-01-15 (source file does not exist)
- [x] 2-mmc (high) — 2026-01-15 (no data in valid sources)
- [x] 25b-nboh (high) — 2026-01-15
- [x] 25b-nbome (high) — 2026-01-15
- [x] 25c-nboh (high) — 2026-01-15
- [x] 25c-nbome (high) — 2026-01-15
- [x] 25d-nbome (high) — 2026-01-15
- [x] 25e-nboh (high) — 2026-01-15 (no data)
- [x] 25e-nbome (high) — 2026-01-15
- [x] 25i-nbf (high) — 2026-01-15 (no data)
- [x] 25i-nbmd (high) — 2026-01-15 (no data)
- [x] 25i-nboh (high) — 2026-01-15
- [x] 25i-nbome (high) — 2026-01-15
- [x] 25ip-nbome (high) — 2026-01-15
- [x] 2c-b (high) — 2026-01-15
- [x] 2c-b-an (high) — 2026-01-15
- [x] 2c-b-fly (high) — 2026-01-15
- [x] 2c-b-fly-nbome (high) — 2026-01-15 (no data)
- [x] 2c-c (high) — 2026-01-15
- [x] 2c-d (high) — 2026-01-15
- [x] 2c-e (high) — 2026-01-15
- [x] 2c-g (high) — 2026-01-15
- [x] 2c-i (high) — 2026-01-15
- [x] 2c-ip (high) — 2026-01-15
- [x] 2c-t (normal) — 2026-01-15
- [x] 2c-t-2 (normal) — 2026-01-15
- [x] 2c-t-21 (normal) — 2026-01-15
- [x] 2c-t-4 (normal) — 2026-01-15
- [x] 2c-t-7 (normal) — 2026-01-15
- [x] 2m2b (high) — 2026-01-15
- [x] 3-cl-pcp (high) — 2026-01-15
- [x] 3-cmc (high) — 2026-01-15
- [x] 3-fa (high) — 2026-01-15
- [x] 3-fea (high) — 2026-01-15 (no data in valid sources)
- [x] 3-fmc (high) — 2026-01-15
- [x] 3-ho-pce (high) — 2026-01-15 (no data in valid sources)
- [x] 3-ho-pcp (high) — 2026-01-15
- [x] 3-me-pcpy (high) — 2026-01-15
- [x] 3-mec (high) — 2026-01-15 (no data in valid sources)
- [x] 3-meo-pce (high) — 2026-01-15
- [x] 3-meo-pcmo (high) — 2026-01-15
- [x] 3-meo-pcp (high) — 2026-01-15
- [x] 3-meo-pcpr (high) — 2026-01-15 (no data in valid sources)
- [x] 3-meo-pcpy (high) — 2026-01-15 (no data in valid sources)
- [x] 3-mmc (high) — 2026-01-15
- [x] 34-ctmp (high) — 2026-01-15 (no data in valid sources)
- [x] 3f-pcp (high) — 2026-01-15 (no data in valid sources)
- [x] 4-aco-det (high) — 2026-01-15
- [x] 4-aco-dipt (high) — 2026-01-15
- [x] 4-aco-dmt (high) — 2026-01-15
- [x] 4-aco-met (high) — 2026-01-15
- [x] 4-aco-mipt (high) — 2026-01-15 (no data in valid sources)
- [x] 4-cmc (high) — 2026-01-15
- [x] 4-emc (high) — 2026-01-15
- [x] 4-fa (high) — 2026-01-15
- [x] 4-fluorobutyrfentanyl (high) — 2026-01-15
- [x] 4-fma (high) — 2026-01-15
- [x] 4-fmc (high) — 2026-01-15
- [x] 4-ho-dipt (high) — 2026-01-15
- [x] 4-mec (high) — 2026-01-15
- [x] 4-meo-butyrfentanyl (high) — 2026-01-15 (no data in valid sources)
- [x] 4-meo-pcp (high) — 2026-01-15
- [x] 4-methylmethylphenidate (high) — 2026-01-15
- [x] 5-apb (high) — 2026-01-15
- [x] 5-mapb (high) — 2026-01-15
- [x] 5-meo-dipt (high) — 2026-01-15
- [x] 5-meo-dmt (high) — 2026-01-15
- [x] 5-meo-mipt (high) — 2026-01-15
- [x] 5-methylethylone (high) — 2026-01-15
- [x] 6-apb (high) — 2026-01-15
- [x] ab-fubinaca (high) — 2026-01-15
- [x] acetylfentanyl (high) — 2026-01-15
- [x] acrylfentanyl (high) — 2026-01-15
- [x] adrafinil (high) — 2026-01-15
- [x] al-lad (high) — 2026-01-15
- [x] aleph (normal) — 2026-01-15
- [x] aleph-2 (normal) — 2026-01-15
- [x] allylescaline (normal) — 2026-01-15
- [x] alprazolam (high) — 2026-01-15
- [x] amobarbital (high) — 2026-01-15
- [x] amphetamine (high) — 2026-01-15
- [x] amt (high) — 2026-01-15
- [x] armodafinil (high) — 2026-01-15
- [x] ayahuasca (high) — 2026-01-15
- [x] baclofen (high) — 2026-01-15
- [x] bk-2c-b (high) — 2026-01-15
- [x] bromazepam (high) — 2026-01-15
- [x] bromazolam (high) — 2026-01-15
- [x] bromo-dragonfly (normal) — 2026-01-15
- [x] brotizolam (high) — 2026-01-15
- [x] buprenorphine (high) — 2026-01-15
- [x] butylone (high) — 2026-01-15 (no data in valid sources)
- [x] butyrfentanyl (high) — 2026-01-15
- [x] caffeine (high) — 2026-01-15
- [x] canket (high) — 2026-01-15 (source file does not exist)
- [x] cannabis (high) — 2026-01-15
- [x] carisoprodol (high) — 2026-01-15
- [x] clonazepam (high) — 2026-01-15
- [x] clonazolam (high) — 2026-01-15
- [x] cocaine (high) — 2026-01-15
- [x] codeine (high) — 2026-01-15
- [x] datura (high) — 2026-01-15
- [x] delorazepam (high) — 2026-01-15
- [x] deschloroetizolam (high) — 2026-01-15
- [x] deschloroketamine (high) — 2026-01-15
- [x] desmethylflunitrazepam (high) — 2026-01-15 (no data in valid sources)
- [x] desomorphine (high) — 2026-01-15
- [x] desoxypipradrol (high) — 2026-01-15
- [x] det (high) — 2026-01-15
- [x] dexmethylphenidate (high) — 2026-01-15
- [x] dextroamphetamine (high) — 2026-01-15
- [x] dextromethorphan (high) — 2026-01-15
- [x] diazepam (high) — 2026-01-15
- [x] diclazepam (high) — 2026-01-15
- [x] dihydrocodeine (high) — 2026-01-15
- [x] dimenhydrinate (high) — 2026-01-15
- [x] diphenhydramine (high) — 2026-01-15
- [x] diphenidine (high) — 2026-01-15
- [x] dipt (high) — 2026-01-15
- [x] dmt (high) — 2026-01-15
- [x] dmxe (high) — 2026-01-15
- [x] dob (high) — 2026-01-15
- [x] doc (high) — 2026-01-15
- [x] doet (normal) — 2026-01-15
- [x] doi (high) — 2026-01-15
- [x] dom (high) — 2026-01-15
- [x] dpt (high) — 2026-01-15
- [x] ephedrine (high) — 2026-01-15
- [x] ephenidine (high) — 2026-01-15
- [x] ept (high) — 2026-01-15 (no data in valid sources)
- [x] escaline (normal) — 2026-01-15
- [x] eszopiclone (high) — 2026-01-15
- [x] eth-lad (high) — 2026-01-15
- [x] ethketamine (high) — 2026-01-15
- [x] ethylmorphine (high) — 2026-01-15
- [x] ethylone (high) — 2026-01-15
- [x] ethylphenidate (high) — 2026-01-15
- [x] etizolam (high) — 2026-01-15
- [x] eutylone (high) — 2026-01-15
- [x] f-phenibut (high) — 2026-01-15 (no data in valid sources)
- [x] fentanyl (high) — 2026-01-15
- [x] flmodafinil (high) — 2026-01-15 (source file does not exist)
- [x] flualprazolam (high) — 2026-01-15
- [x] flubromazepam (high) — 2026-01-15
- [x] flubromazolam (high) — 2026-01-15
- [x] fluclotizolam (high) — 2026-01-15
- [x] flunitrazepam (high) — 2026-01-15
- [x] flunitrazolam (high) — 2026-01-15
- [x] fluorophenibut (high) — 2026-01-15
- [x] furanylfentanyl (high) — 2026-01-15
- [x] gabapentin (high) — 2026-01-15
- [x] gbl (high) — 2026-01-15
- [x] ghb (high) — 2026-01-15
- [x] h-2c-b (high) — 2026-01-15
- [ ] heroin (high)
- [ ] hxe (high)
- [ ] hydrocodone (high)
- [ ] hydromorphone (high)
- [ ] ibogaine (high)
- [ ] isomethadone (high)
- [ ] jwh-018 (high)
- [ ] jwh-073 (high)
- [ ] k-2c-b (high)
- [ ] k-2c-i (high)
- [ ] kava (high)
- [ ] ketamine (high)
- [ ] kratom (high)
- [ ] lithium (high)
- [ ] lorazepam (high)
- [ ] lsa (high)
- [ ] lsd (high)
- [ ] lsz (high)
- [ ] mda (high)
- [ ] mdma (high)
- [ ] meclonazepam (high)
- [ ] memantine (high)
- [ ] mephedrone (high)
- [ ] mescaline (high)
- [ ] met (high)
- [ ] methadone (high)
- [ ] methallylescaline (high)
- [ ] methamphetamine (high)
- [ ] methaqualone (high)
- [ ] methcathinone (high)
- [ ] methiopropamine (high)
- [ ] methoxetamine (high)
- [ ] methoxyacetyl-fentanyl (high)
- [ ] methoxyketamine (high)
- [ ] methylmethaqualone (high)
- [ ] methylone (high)
- [ ] methylphenidate (high)
- [ ] metizolam (high)
- [ ] midazolam (high)
- [ ] mipla (high)
- [ ] modafinil (high)
- [ ] morphine (high)
- [ ] n-methylbisfluoromodafinil (high)
- [ ] nep (high)
- [ ] nicomorphine (high)
- [ ] nicotine (high)
- [ ] nifoxipam (high)
- [ ] nitemazepam (high)
- [ ] nm-2-ai (high)
- [ ] nutmeg (high)
- [ ] o-desmethyltramadol (high)
- [ ] o-pce (high)
- [ ] oxazepam (high)
- [ ] oxycodone (high)
- [ ] oxymorphone (high)
- [ ] parafluorofentanyl (high)
- [ ] pce (high)
- [ ] pcp (high)
- [ ] pentobarbital (high)
- [ ] phenethylamine (high)
- [ ] phenibut (high)
- [ ] phenobarbital (high)
- [ ] pipradrol (high)
- [ ] pregabalin (high)
- [ ] propranolol (high)
- [ ] proscaline (normal)
- [ ] psilocybin-mushrooms (high)
- [ ] pyrazolam (high)
- [ ] quetiapine (high)
- [ ] scopolamine (high)
- [ ] secobarbital (high)
- [ ] tapentadol (high)
- [ ] temazepam (high)
- [ ] thiopental (high)
- [ ] thiopropamine (high)
- [ ] tianeptine (high)
- [ ] tma-2 (normal)
- [ ] tma-6 (normal)
- [ ] tramadol (high)
- [ ] trazodone (high)
- [ ] triazolam (high)
- [ ] valerylfentanyl (high)
- [ ] zolpidem (high)
- [ ] zopiclone (high)
