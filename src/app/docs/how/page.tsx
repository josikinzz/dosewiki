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

const EX_INTRO = `# Intro Text Extraction Prompt

You are extracting introductory and summary content from source articles about a psychoactive substance.

## Task
Extract verbatim text that describes WHAT the substance IS - its identity, classification, and basic characteristics. This is the "encyclopedia-style" introduction content.

## What to Extract

### Basic Identity
- Full chemical name and common names
- Street names and slang
- Drug class/category (psychedelic, stimulant, depressant, dissociative, etc.)
- Chemical family (tryptamine, phenethylamine, lysergamide, benzodiazepine, etc.)
- Brief description of what the substance is

### General Characteristics
- Physical appearance (color, form, taste, smell)
- Common forms available (powder, crystal, blotter, pill, plant material)
- Routes of administration (brief mention, NOT detailed dosing)
- General potency statements
- Comparison to related substances

### Brief Context
- One-sentence mentions of discovery (NOT detailed history)
- One-sentence legal status summary (NOT detailed legality)
- General use context (recreational, therapeutic, traditional)

## What NOT to Extract
These belong in OTHER extraction categories:

| Category | Goes To |
|----------|---------|
| Detailed dosage tiers | dosage-duration |
| Duration/onset timing | dosage-duration |
| Mechanism of action | pharmacology |
| Half-life, bioavailability | pharmacology |
| Receptor binding details | pharmacology |
| Metabolism details | pharmacology |
| Legal status by country | legality |
| Historical timeline | history-culture |
| Detailed discovery narrative | history-culture |
| Subjective effects lists | subjective-effects |
| Physical/cognitive effects | subjective-effects |
| Tolerance information | tolerance |

## Extraction Rules
1. Extract COMPLETE paragraphs - do not truncate mid-sentence
2. Preserve markdown formatting (headers, lists, bold, etc.)
3. Be SELECTIVE - only include content that describes what the substance IS
4. If a paragraph mixes intro with detailed effects/dosage, extract only the intro portion
5. Intro content is typically 1-4 paragraphs per source
6. Do NOT paraphrase - extract verbatim text only

## Where to Find Intro Content
- Opening paragraphs after the title
- "Overview" or "Summary" sections
- "Description" or "About" sections
- Lead paragraphs in Wikipedia-style articles
- Brief descriptions in factsheet headers

## Output Format

For each source that has intro content, output:

\`\`\`
## Source: {Source Name}

{verbatim extracted text}

---
\`\`\`

If a source has NO intro content, output:

\`\`\`
## Source: {Source Name}

*No intro content found.*

---
\`\`\`

## Schema Field Mapping
When extracting, look for content that answers:
- \`name\` - What is the common name?
- \`aliases\` - What are the street names/slang?
- \`drug_class\` - What type of drug is this?
- \`chemical_class\` - What chemical family?
- \`description\` - 1-2 sentence summary
- \`appearance\` - What does it look like?
- \`common_forms\` - Powder, pill, blotter, etc.
- \`routes\` - How is it typically taken?

## Important
Keep intro extractions concise and focused. This content will be used for the opening section of articles - users want to quickly understand what a substance is before diving into details.`;

const EX_LEGALITY = `# Legality Extraction Prompt

You are extracting legality-related content from source articles about a psychoactive substance.

## Task
Extract ALL verbatim text related to legal status, scheduling, and regulatory information from the provided source content.

## What to Extract

### International Status
- UN Convention classifications (1961, 1971, 1988)
- International scheduling (Schedule I, II, III, IV)
- WHO recommendations
- International treaties and agreements
- INCB (International Narcotics Control Board) status

### Country-Specific Legal Status
For each country mentioned, extract:
- Legal/illegal status
- Schedule/Class classification (e.g., Schedule I, Class A, Tabelle I, Anlage I)
- Controlled substance designation
- Prescription status
- Possession limits and thresholds
- Penalties for possession, sale, manufacture
- Decriminalization status
- Medical/research exemptions
- Recent legal changes
- Regional variations (states, territories, provinces)

### Historical Legal Context
- When the substance was first scheduled
- Legal history timeline
- Changes in legal status over time
- Reasons for scheduling
- Analog act coverage (e.g., Federal Analogue Act)

### Legal Terminology Reference

**US Scheduling:**
- Schedule I - High abuse potential, no accepted medical use
- Schedule II - High abuse potential, accepted medical use
- Schedule III - Moderate abuse potential
- Schedule IV - Low abuse potential
- Schedule V - Lowest abuse potential

**UK Classification:**
- Class A - Most harmful (heroin, cocaine, LSD, MDMA)
- Class B - Less harmful (cannabis, amphetamines)
- Class C - Least harmful of controlled (benzos, GHB)

**German Classification:**
- Anlage I - Not marketable, no medical use
- Anlage II - Marketable but not prescribable
- Anlage III - Prescribable controlled substances

**UN Conventions:**
- 1961 Single Convention - Narcotics (opioids, cannabis, coca)
- 1971 Convention on Psychotropic Substances - Psychedelics, stimulants, sedatives
- 1988 Convention - Precursors and trafficking

## Extraction Rules
1. Extract COMPLETE paragraphs and sections - do not truncate mid-sentence
2. Preserve all markdown formatting (headers, lists, bold, etc.)
3. Include surrounding context when legal information is embedded in other text
4. When in doubt, INCLUDE the content - it's better to have too much than miss critical legal info
5. Do NOT paraphrase - extract verbatim text only
6. Extract from ALL sources that contain legal content

## Output Format

For each source that has legal content, output:

\`\`\`
## Source: {Source Name}

{verbatim extracted text}

---
\`\`\`

If a source has NO legal content, output:

\`\`\`
## Source: {Source Name}

*No legality content found.*

---
\`\`\`

## Important
Legal information is CRITICAL for user safety. Be thorough and extract everything even tangentially related to legal status, penalties, or scheduling.`;

const EX_TOLERANCE = `# Tolerance Extraction Prompt

You are extracting tolerance-related content from source articles about a psychoactive substance.

## Task
Extract ALL verbatim text related to tolerance development, tolerance reduction, and cross-tolerance from the provided source content.

## What to Extract

### Tolerance Development
- How quickly tolerance develops (immediate, hours, days, weeks)
- Degree of tolerance (partial, full, complete)
- Specific timelines mentioned (e.g., "tolerance develops after 3-4 doses")
- Factors affecting tolerance development
- Differences between acute and chronic tolerance

### Tolerance Reduction/Reset
- How long until tolerance returns to baseline
- Half-tolerance (time for tolerance to reduce by 50%)
- Full reset timeline
- Factors affecting tolerance reduction
- Differences in reset time based on usage patterns

### Cross-Tolerance
- Substances with which cross-tolerance exists
- Degree of cross-tolerance (partial, full)
- Direction of cross-tolerance (unidirectional, bidirectional)
- Mechanisms of cross-tolerance
- Receptor systems involved

### Related Information
- Sensitization or reverse tolerance
- Long-term tolerance changes
- Receptor downregulation/upregulation mentions
- Comparisons to tolerance profiles of similar substances
- Notes on whether tolerance develops to specific effects (e.g., "tolerance to euphoria but not cardiac effects")

## Extraction Rules
1. Extract COMPLETE paragraphs and sections - do not truncate mid-sentence
2. Preserve all markdown formatting (headers, lists, bold, etc.)
3. Include surrounding context when tolerance information is embedded in other text
4. Extract specific timelines and numbers whenever mentioned
5. Do NOT paraphrase - extract verbatim text only
6. Extract from ALL sources that contain tolerance content

## Output Format

For each source that has tolerance content, output:

\`\`\`
## Source: {Source Name}

{verbatim extracted text}

---
\`\`\`

If a source has NO tolerance content, output:

\`\`\`
## Source: {Source Name}

*No tolerance content found.*

---
\`\`\`

## Schema Field Mapping
When extracting, look for content that maps to these fields:
- \`full_tolerance\` - Time for full tolerance to develop
- \`half_tolerance\` - Time for tolerance to reduce by 50%
- \`baseline_tolerance\` - Time for complete tolerance reset
- \`cross_tolerance\` - Array of substances with cross-tolerance

## Important
Tolerance information helps users understand safe dosing intervals. Be thorough in extracting all timing and mechanism information.`;

const EX_HARM = `You are extracting verbatim harm-related text from source articles about a substance.

## WHAT TO EXTRACT

Look for ANY text related to:
- Addiction potential / abuse potential / habit-forming
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

Extract COMPLETE SECTIONS verbatim. Do not break paragraphs or sentences.
- If you find a section header like "## Toxicity and harm potential", extract the ENTIRE section
- If you find relevant paragraphs within a larger section, extract the FULL paragraphs
- ERR ON THE SIDE OF TAKING MORE TEXT, not less
- Include the section headers in your extraction
- Preserve all markdown formatting (headers, lists, bold, links)

## OUTPUT FORMAT

For each source that contains harm-related content, output:

## Source: [Source Name]

[Verbatim extracted text with markdown preserved]

---

If a source has NO harm-related content, skip it entirely (don't mention it).

Do NOT summarize or paraphrase. Extract VERBATIM text only.`;

const EX_PHARMACOLOGY = `---
name: pharmacology
description: Extract verbatim pharmacology-related text from source articles (Cursor workflow).
---

# Pharmacology Extraction (Cursor)

Extract verbatim pharmacology-related text from source articles for a given substance and compile it into \`pharmacology-quotes/{slug}-pharmacology.md\`.

## Scope and focus
- One substance at a time. Finish it fully before moving to the next.
- **MANDATORY: Read the ENTIRE source file for each substance.** No shortcuts, no assumptions, no skipping.
- Manual reading only. Do not auto-extract pharmacology content with regex or scripts.
- **This is harm reduction information. Completeness and accuracy are critical. Read every word.**

## Usage
- Trigger phrases: "pharmacology" or "mechanism of action"
- Provide a substance slug (e.g., \`lsd\`) or ask for the next unchecked item in your tracker (if you keep one).

## Step 1: Identify sources (limited read only)
- Run \`npx convex run articleSources:getBySlug '{"slug":"{slug}"}'\` and read the \`sources\` array from the JSON response.
- Example:
  \`npx convex run articleSources:getBySlug '{"slug":"lsd"}'\`

Record the list of \`id\` and \`displayName\` values. Do not read the \`contents\` object yet.

## Step 2: Extract per source (manual review)

**CRITICAL: This is harm reduction information. Accuracy and completeness are paramount. NO SHORTCUTS ALLOWED.**

For each source in the \`sources\` array:

1) **MUST read the ENTIRE article-source document completely.** Fetch it with \`npx convex run articleSources:getBySlug '{"slug":"{slug}"}'\` and read the full JSON output. Do NOT use grep, sed, or any search tools to find pharmacology sections. You MUST read every word of every source to ensure nothing is missed.

2) **NO search shortcuts.** Do NOT use \`grep\` or \`rg\` to find "Pharmacology" sections. Do NOT assume you know where pharmacology content might be. Pharmacology information can appear anywhere in a source:
   - In dedicated "Pharmacology" or "Pharmacokinetics" sections
   - Embedded in "Chemistry" sections
   - Within "Mechanism of Action" paragraphs
   - In "Summary" or "Overview" sections
   - Scattered throughout the text
   - In footnotes or references
   - In tables or structured data

3) **Read the complete markdown content** for each source key from the \`contents\` object. Extract the full text block from the opening backtick to the closing backtick. Read it entirely, word by word.

4) **Manual identification only.** After reading the complete source content, manually identify all pharmacology-related content. Do not use regex or automated searches within the content. Read every sentence carefully.

5) **When in doubt, include it.** If a sentence or paragraph mentions any pharmacology-related concept (even tangentially), include it. It's better to include too much context than to miss critical information.

**What constitutes pharmacology content:**
- Any mention of receptors, neurotransmitters, enzymes, transporters
- Any mention of metabolism, half-life, bioavailability, clearance
- Any mention of mechanism of action, binding, affinity
- Any mention of metabolites, prodrugs, drug interactions
- Any pharmacokinetic or pharmacodynamic data
- Any mention of how the drug works in the body

**Remember: This is harm reduction data. Missing information could have serious consequences. Read everything.**

### Reading source files

**MANDATORY APPROACH:**
1. Fetch the full document with \`npx convex run articleSources:getBySlug '{"slug":"{slug}"}'\` and read the JSON output completely
2. Read the entire file from start to finish
3. For each source in the \`sources\` array, locate its corresponding entry in the \`contents\` object
4. Read the complete markdown string for that source (from opening backtick to closing backtick)
5. Do NOT skip any sections. Do NOT assume certain sources won't have pharmacology content.
6. Read every word carefully, looking for pharmacology-related information

**DO NOT:**
- Use grep/rg to search for "Pharmacology" sections
- Skip sources you think won't have pharmacology content
- Read only parts of files
- Use sed or other tools to extract specific sections
- Make assumptions about where pharmacology content might be

**Helper scripts are NOT recommended** for this task as they may encourage skipping full file reads. Read the complete source file using \`read_file\` tool.

### What to extract
Look for any text related to the pharmacology schema fields:

**Mechanism of Action**
- Receptor agonism/antagonism (e.g., "5-HT2A agonist", "NMDA antagonist")
- Neurotransmitter effects (dopamine, serotonin, norepinephrine, GABA, glutamate)
- Enzyme inhibition/induction (MAO, CYP450 enzymes)
- Transporter effects (reuptake inhibition, release)
- Ion channel modulation
- Second messenger systems

**Receptor Binding**
- Binding affinity values (Ki, IC50, EC50)
- Receptor selectivity profiles
- Comparison of binding across receptor subtypes
- Functional activity (full agonist, partial agonist, inverse agonist)

**Metabolism**
- Metabolic pathways (hepatic, CYP enzymes involved)
- Phase I and Phase II metabolism
- First-pass metabolism
- Enzyme induction or inhibition effects

**Metabolites**
- Active metabolites and their names
- Inactive metabolites
- Prodrug conversion
- Metabolite activity profiles

**Half-life**
- Elimination half-life
- Distribution half-life
- Terminal half-life
- Context-sensitive half-time
- Duration of action vs half-life

**Bioavailability**
- Oral bioavailability percentages
- Route-specific bioavailability (intranasal, sublingual, rectal, etc.)
- Factors affecting absorption
- Food effects on absorption

### How to extract
- Extract complete sections or full paragraphs; keep headers and formatting.
- If a pharmacology sentence is mid-paragraph, include the whole paragraph.
- Err on the side of including more context.
- Preserve any tables, lists, or structured data.

## Step 3: Compile results
Create a single markdown file with one section per source that has content.

Output format:

\`\`\`
# {Substance Name} - Pharmacology Quotes

> Verbatim extractions from source articles. Generated YYYY-MM-DD.

---

## Source: PsychonautWiki

[verbatim extracted text]

---

## Source: DrugBank

[verbatim extracted text]
\`\`\`

Rules:
- Skip sources with no pharmacology content.
- Preserve markdown formatting.
- Do not paraphrase.

## Step 4: Write output file
Write to:
\`pharmacology-quotes/{slug}-pharmacology.md\`

Create the directory if needed:
\`mkdir -p pharmacology-quotes\`

## Source key reference
| Source | Key in \`contents\` object |
|--------|--------------------------|
| TripSit Factsheets | \`tripsit-factsheets\` |
| TripSit Wiki | \`tripsit-wiki\` |
| PsychonautWiki | \`psychonautwiki\` |
| Erowid | \`erowid\` |
| DrugBank | \`drugbank\` |
| DEIS | \`disregardeverythingisay\` |
| The Drug Classroom | \`thedrugclassroom\` |
| Drug Users Bible | \`drugusersbible\` |
| SaferParty | \`saferparty\` |
| Wikipedia | \`wikipedia\` |
| Isomer Design | \`isomerdesign\` |

## Source priority for pharmacology
DrugBank and Wikipedia tend to have the most detailed pharmacology information. PsychonautWiki often has mechanism of action summaries. The Drug Classroom provides accessible explanations. Prioritize reading:

1. **DrugBank** - Most comprehensive pharmacology data
2. **Wikipedia** - Often detailed pharmacokinetics sections
3. **PsychonautWiki** - Mechanism of action summaries
4. **The Drug Classroom** - Clear explanations
5. **Isomer Design** - Chemical/pharmacological details for phenethylamines/tryptamines
6. **Erowid** - Sometimes has pharmacology basics
7. **TripSit** - Basic mechanism info

## Schema field mapping
When reviewing extracted content, mentally map to these schema fields:

| Schema Field | What to Look For |
|--------------|------------------|
| \`mechanism_of_action\` | Primary receptor targets, neurotransmitter effects |
| \`receptor_binding\` | Ki values, binding affinities, selectivity data |
| \`metabolism\` | CYP enzymes, hepatic processing, metabolic pathways |
| \`metabolites\` | Named metabolic products (active or inactive) |
| \`half_life\` | Elimination time, plasma half-life |
| \`bioavailability_notes\` | Absorption rates, route comparisons |

`;

const EX_HISTORY = `---
name: history-culture
description: Extract verbatim history/culture-related text from source articles (Cursor workflow).
---

# History & Culture Extraction (Cursor)

Extract verbatim history and culture-related text from source articles for a given substance and compile it into \`history-culture-quotes/{slug}-history-culture.md\`.

## Scope and focus
- One substance at a time. Finish it fully before moving to the next.
- **MANDATORY: Read the ENTIRE source file for each substance.** No shortcuts, no assumptions, no skipping.
- Manual reading only. Do not auto-extract history content with regex or scripts.
- **Historical accuracy matters. Completeness is critical. Read every word.**

## Usage
- Trigger phrases: "history" or "culture" or "history-culture"
- Provide a substance slug (e.g., \`lsd\`) or ask for the next unchecked item in your tracker (if you keep one).

## Step 1: Identify sources (limited read only)
- Run \`npx convex run articleSources:getBySlug '{"slug":"{slug}"}'\` and read the \`sources\` array from the JSON response.
- Example:
  \`npx convex run articleSources:getBySlug '{"slug":"lsd"}'\`

Record the list of \`id\` and \`displayName\` values. Do not read the \`contents\` object yet.

## Step 2: Extract per source (manual review)

**CRITICAL: Historical accuracy is paramount. NO SHORTCUTS ALLOWED.**

For each source in the \`sources\` array:

1) **MUST read the ENTIRE article-source document completely.** Fetch it with \`npx convex run articleSources:getBySlug '{"slug":"{slug}"}'\` and read the full JSON output. Do NOT use grep, sed, or any search tools to find history sections. You MUST read every word of every source to ensure nothing is missed.

2) **NO search shortcuts.** Do NOT use \`grep\` or \`rg\` to find "History" sections. Do NOT assume you know where history content might be. Historical information can appear anywhere in a source:
   - In dedicated "History" or "History and culture" sections
   - In "Society and culture" sections
   - Embedded in introductory paragraphs
   - Within "Background" sections
   - In "Overview" or "Summary" sections
   - Scattered throughout the text as contextual mentions
   - In footnotes or references
   - In tables or structured data

3) **Read the complete markdown content** for each source key from the \`contents\` object. Extract the full text block from the opening backtick to the closing backtick. Read it entirely, word by word.

4) **Manual identification only.** After reading the complete source content, manually identify all history/culture-related content. Do not use regex or automated searches within the content. Read every sentence carefully.

5) **When in doubt, include it.** If a sentence or paragraph mentions any history-related concept (even tangentially), include it. It's better to include too much context than to miss critical information.

**What constitutes history/culture content:**

### Discovery & Synthesis
- Date of first synthesis or discovery
- Researcher/chemist who synthesized or discovered it (e.g., Albert Hofmann, Alexander Shulgin, Anton Köllisch)
- Laboratory, company, or institution (e.g., Sandoz, Merck, Purdue)
- Original research purpose or motivation
- Patent information and dates
- Accidental discovery stories (e.g., "Bicycle Day")

### Medical & Therapeutic History
- Initial medical applications
- Clinical research programs and trials
- Psychotherapy use (e.g., "psycholytic therapy", "psychedelic therapy")
- FDA approval/rejection history
- Medical marketing (e.g., "Delysid" for LSD)
- Number of patients treated in clinical settings
- Research paper counts or publication history

### Recreational & Cultural Emergence
- When recreational use first emerged
- How it spread to mainstream society
- Street name origins and etymology
- Slang terms and their history
- Association with music scenes (rave, counterculture, etc.)
- Connection to artistic movements

### Counterculture & Social Movements
- 1960s counterculture significance
- Key advocates and figures (Timothy Leary, Aldous Huxley, Ken Kesey, etc.)
- "Acid Tests" and similar events
- Influence on literature, music, and art
- Social movements associated with the substance

### Government Programs & Controversies
- MK-ULTRA and CIA research
- Military research programs
- Notable deaths or incidents
- Media coverage milestones
- Public health scares
- Moral panics

### Traditional & Indigenous Use
- Traditional preparations and methods
- Indigenous ceremonies and rituals
- Shamanic practices
- Ethnobotanical history
- Pre-modern use records
- Cultural significance in native populations

### Modern Revival
- "Psychedelic renaissance" research
- Current clinical trials
- Therapeutic applications being studied
- Changes in scientific/medical attitudes

**Remember: Historical facts are important for context. Missing information could leave gaps in understanding. Read everything.**

### Reading source files

**MANDATORY APPROACH:**
1. Fetch the full document with \`npx convex run articleSources:getBySlug '{"slug":"{slug}"}'\` and read the JSON output completely
2. Read the entire file from start to finish
3. For each source in the \`sources\` array, locate its corresponding entry in the \`contents\` object
4. Read the complete markdown string for that source (from opening backtick to closing backtick)
5. Do NOT skip any sections. Do NOT assume certain sources won't have history content.
6. Read every word carefully, looking for history-related information

**DO NOT:**
- Use grep/rg to search for "History" sections
- Skip sources you think won't have history content
- Read only parts of files
- Use sed or other tools to extract specific sections
- Make assumptions about where history content might be
- extract legaility sections

**Helper scripts are NOT recommended** for this task as they may encourage skipping full file reads. Read the complete source file using \`read_file\` tool.

### What to extract
Look for any text related to the history/culture categories listed above.

### How to extract
- Extract complete sections or full paragraphs; keep headers and formatting.
- If a history sentence is mid-paragraph, include the whole paragraph.
- Err on the side of including more context.
- Preserve any tables, lists, or structured data.

## Step 3: Compile results
Create a single markdown file with one section per source that has content.

Output format:

\`\`\`
# {Substance Name} - History & Culture Quotes

> Verbatim extractions from source articles. Generated YYYY-MM-DD.

---

## Source: PsychonautWiki

[verbatim extracted text]

---

## Source: Wikipedia

[verbatim extracted text]
\`\`\`

Rules:
- Skip sources with no history/culture content.
- Preserve markdown formatting.
- Do not paraphrase.

## Step 4: Write output file
Write to:
\`history-culture-quotes/{slug}-history-culture.md\`

Create the directory if needed:
\`mkdir -p history-culture-quotes\`

## Source key reference
| Source | Key in \`contents\` object |
|--------|--------------------------|
| TripSit Factsheets | \`tripsit-factsheets\` |
| TripSit Wiki | \`tripsit-wiki\` |
| PsychonautWiki | \`psychonautwiki\` |
| Erowid | \`erowid\` |
| DrugBank | \`drugbank\` |
| DEIS | \`disregardeverythingisay\` |
| The Drug Classroom | \`thedrugclassroom\` |
| Drug Users Bible | \`drugusersbible\` |
| SaferParty | \`saferparty\` |
| Wikipedia | \`wikipedia\` |
| Isomer Design | \`isomerdesign\` |

## Source priority for history/culture
Wikipedia and PsychonautWiki tend to have the most detailed history information. Isomer Design has synthesis history for Shulgin compounds. Prioritize reading:

1. **Wikipedia** - Most comprehensive "History" and "Society and culture" sections
2. **PsychonautWiki** - Good "History and culture" sections with key dates
3. **Erowid** - Timeline pages, historical basics
4. **Isomer Design** - TiHKAL/PiHKAL synthesis history for phenethylamines/tryptamines
5. **Drug Users Bible** - Often includes historical context in experience sections
6. **The Drug Classroom** - Sometimes includes development history
7. **DrugBank** - Occasionally has "Background" with history
8. **TripSit** - Minimal historical content

## Content mapping
When reviewing extracted content, mentally categorize into these areas:

| Category | What to Look For |
|----------|------------------|
| Discovery | Synthesis date, discoverer name, laboratory, original purpose |
| Medical History | Clinical trials, therapeutic use, FDA status, marketing names |
| Cultural History | Counterculture, famous advocates, music/art connections |
| Legal History | Scheduling dates, prohibition, legal changes |
| Traditional Use | Indigenous ceremonies, shamanic practices, ethnobotany |
| Controversies | MK-ULTRA, notable incidents, media coverage |

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
  EXTRACT["Verbatim excerpt extraction<br/>4 topics via Gemini Flash;<br/>pharmacology and history via agent workflow"]:::auto
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
  "theme-text-secondary mt-3 max-h-[480px] overflow-auto rounded-xl border border-dose-divider bg-dose-surface-muted p-4 font-mono text-[12px] leading-6 whitespace-pre-wrap break-words shadow-inner";
const PULL_CLASS =
  "theme-public-card-subtle theme-accent-heading theme-accent-emphasis my-6 max-w-[68ch] rounded-2xl border p-5 text-lg font-medium leading-8 shadow-sm";

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
            Last updated July 2, 2026
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
            before any writing happens, an AI pass goes through every source article and{" "}
            <strong>copies out the passages relevant to each topic, word for word</strong>. The
            extraction prompts forbid paraphrasing: the output must be verbatim quotations, complete
            paragraphs, with formatting preserved, organized under a heading for each source. The result
            is one <strong>excerpt document</strong> per substance per topic, one for each of the
            AI-written sections:
          </p>

          <ContentCard padding="none" className={`mt-6 ${DIVIDED_LIST_CLASS}`}>
            <div className={DIVIDED_ITEM_CLASS}>
              <div className={CARD_LABEL_CLASS}>The excerpt topics</div>
              <ul className={`${LIST_CLASS} list-disc pl-5`}>
                <li>Intro text (feeds the summary)</li>
                <li>Pharmacology</li>
                <li>Tolerance</li>
                <li>Harm potential</li>
                <li>History &amp; culture</li>
                <li>Legality</li>
              </ul>
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
            All six extraction prompts are shown below, unedited. The first four are single prompts run
            through Gemini Flash. Pharmacology and history &amp; culture used a different mechanism with
            the same verbatim-only rules: an AI agent follows the longer workflow instructions shown, and
            is required to read every source in full before compiling the excerpt document.
          </p>

          <details className={`${DETAILS_CLASS} mt-3`}>
            <DetailsSummary>Extraction prompt — intro text</DetailsSummary>
            <pre className={PROMPT_BODY_CLASS}>{EX_INTRO}</pre>
          </details>
          <details className={`${DETAILS_CLASS} mt-3`}>
            <DetailsSummary>Extraction prompt — legality</DetailsSummary>
            <pre className={PROMPT_BODY_CLASS}>{EX_LEGALITY}</pre>
          </details>
          <details className={`${DETAILS_CLASS} mt-3`}>
            <DetailsSummary>Extraction prompt — tolerance</DetailsSummary>
            <pre className={PROMPT_BODY_CLASS}>{EX_TOLERANCE}</pre>
          </details>
          <details className={`${DETAILS_CLASS} mt-3`}>
            <DetailsSummary>Extraction prompt — harm potential</DetailsSummary>
            <div className="mt-3">
              <p className={PROMPT_META_CLASS}>
                This prompt lives inline in the harm-quote extraction script (
                <code>scripts/batch/batch-extract-harm-quotes.mjs</code>) rather than as a standalone
                file.
              </p>
              <pre className={PROMPT_BODY_CLASS}>{EX_HARM}</pre>
            </div>
          </details>
          <details className={`${DETAILS_CLASS} mt-3`}>
            <DetailsSummary>
              Extraction prompt — pharmacology (agent workflow)
            </DetailsSummary>
            <div className="mt-3">
              <p className={PROMPT_META_CLASS}>
                Pharmacology excerpts were compiled by an AI agent following this workflow (
                <code>.cursor/commands/pharmacology.md</code>), reading each source file in full rather
                than answering a single prompt.
              </p>
              <pre className={PROMPT_BODY_CLASS}>{EX_PHARMACOLOGY}</pre>
            </div>
          </details>
          <details className={`${DETAILS_CLASS} mt-3`}>
            <DetailsSummary>
              Extraction prompt — history &amp; culture (agent workflow)
            </DetailsSummary>
            <div className="mt-3">
              <p className={PROMPT_META_CLASS}>
                History &amp; culture excerpts were compiled the same way, under this workflow (
                <code>.cursor/commands/history-culture.md</code>).
              </p>
              <pre className={PROMPT_BODY_CLASS}>{EX_HISTORY}</pre>
            </div>
          </details>
        </section>

        <section id="s7" className="scroll-mt-24">
          <h2 className={SECTION_HEADING_CLASS}>
            <span className={SECTION_NUM_CLASS}>07</span>{" "}Stage three — AI synthesis, and every prompt we use
          </h2>

          <p className={`${PROSE_CLASS} mt-4`}>
            Six sections of the finished article are AI-written:{" "}
            <strong>
              summary, pharmacology, tolerance, harm potential, history &amp; culture, and legality
            </strong>
            . Each is produced by Claude Opus 4.5 from exactly two inputs: the excerpt document for that
            topic, and a <strong>section-specific prompt</strong>. The prompts all share the same
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
            Below are the prompts for all six AI-written sections, unedited, largest to smallest. These
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
          className="fixed bottom-5 right-5 z-30 shadow-lg backdrop-blur min-[1200px]:hidden"
        >
          <a href="#main-content">
            <Icon icon="lucide:arrow-up" size={18} />
          </a>
        </Button>
      </StickyTocLayout>
    </main>
  );
}
