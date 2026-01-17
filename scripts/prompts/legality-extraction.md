# Legality Extraction Prompt

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

```
## Source: {Source Name}

{verbatim extracted text}

---
```

If a source has NO legal content, output:

```
## Source: {Source Name}

*No legality content found.*

---
```

## Important
Legal information is CRITICAL for user safety. Be thorough and extract everything even tangentially related to legal status, penalties, or scheduling.
