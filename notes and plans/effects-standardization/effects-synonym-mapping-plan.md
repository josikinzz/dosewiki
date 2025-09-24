# Effect Synonym Mapping Plan

## Overview
This document outlines a comprehensive plan for mapping and grouping synonymous effects from the extracted list of 2247 unique effects. The goal is to identify genuinely identical effects that are worded differently while preserving all original data.

## Current State
- **Total unique effects**: 2247
- **Source**: `notes and plans/all-effects.md`
- **Format**: Alphabetically sorted list with various formatting styles, qualifiers, and terminology

## Objectives
1. Identify and group true synonyms (same meaning, different wording)
2. Preserve all 2247 original effects - no data loss
3. Create a mapping system that maintains both canonical terms and all variations
4. Let the final count emerge naturally from actual synonym relationships
5. Build a verification system to ensure data integrity
6. **Output as markdown file only - no changes to articles.json or any source data**

## Implementation Method
**LLM-Based Manual Grouping**: Rather than creating scripts, Claude will read through all 2247 effects and use natural language understanding to identify and group synonyms. This approach is necessary because:
- Many synonyms require semantic understanding (mydriasis = dilated pupils)
- Context and qualifiers need human-like interpretation
- Medical vs common terminology requires domain knowledge
- Compound effects need understanding of relationships

## Implementation Phases

### Phase 1: Initial Reading and Pattern Recognition
**Method**: LLM reads through all effects to identify patterns

**Tasks**:
1. Identify obvious formatting variations:
   - Case differences (euphoria vs Euphoria)
   - Punctuation differences (mood-lift vs mood lift)
   - Spacing variations (after-glow vs afterglow)
2. Note medical/common term pairs
3. Identify compound effects with separators (/, &, or, →, commas)
4. Recognize contextual qualifiers that should be preserved

### Phase 2: Systematic Grouping
**Method**: LLM groups effects by semantic similarity

**Synonym Categories**:

#### Category 1: Exact Duplicates
- Same term, different capitalization
- Same term, different punctuation
- Same term, different spacing

#### Category 2: Medical/Common Pairs
Examples:
- mydriasis = pupil dilation = dilated pupils
- miosis = pupil constriction = pinpoint pupils
- bruxism = teeth grinding = jaw clenching
- anxiolysis = anxiety reduction = reduced anxiety
- tachycardia = increased heart rate = elevated heart rate
- bradycardia = decreased heart rate = slowed heart rate
- diaphoresis = sweating = perspiration
- pruritus = itching = itchiness
- somnolence = drowsiness = sleepiness
- analgesia = pain relief = pain reduction

#### Category 3: Formatting Variants
- Compound with slash: anxiety/panic
- Compound with "or": anxiety or panic
- Compound with "&": anxiety & panic
- List form vs single: "sweating, chills" vs separate entries

**Output**: `notes and plans/potential-synonyms.md` (intermediate working file, not JSON)

### Phase 3: Compound Effect Processing
**Method**: LLM identifies and categorizes compound effects

**Compound Effect Detection**:
1. Identify effects containing multiple components:
   - Slash separators: `/` (alternative or related)
   - Ampersand/and: `&`, `and` (combined occurrence)
   - Comma lists: `,` (multiple concurrent)
   - Or connector: `or` (alternatives)
   - Arrow: `→` (sequential/progression)

2. Categorize relationship types:
   - **ALTERNATIVE**: "anxiety / panic" - either may occur
   - **COMBINED**: "anxiety & paranoia" - both occur together
   - **SEQUENTIAL**: "euphoria → dysphoria" - temporal progression
   - **LIST**: "sweating, chills, nausea" - multiple concurrent effects

3. Processing strategy:
   - **Phase 3a**: Group compounds as-is (preserve relationships)
   - **Phase 3b**: Extract and tag individual components
   - **Phase 3c**: Create cross-references between compounds and components

**Output Structure for Compounds**:
```markdown
### Compound: Anxiety / panic
**Type**: Alternative
**Components**: [Anxiety, Panic]
**Variations found**: 5
- anxiety / panic
- Anxiety / panic
- anxiety/panic
- Anxiety or panic
- anxiety or panic (at high doses)
```

### Phase 4: Grouping Process
**Method**: LLM applies grouping rules systematically

**Grouping Rules**:

1. **Ultra-Conservative Matching**:
   - Only group if EXACTLY semantically identical
   - When in doubt, keep separate
   - Every qualifier creates a new group
   - Every context creates a new group

2. **Strict Preservation Rules**:
   - Different intensities are ALWAYS separate groups (mild vs moderate vs intense vs profound)
   - Different dose contexts are ALWAYS separate groups (at high doses vs at low doses vs at higher doses)
   - Different timing contexts are ALWAYS separate groups (on comedown vs during peak vs after use)
   - Different modalities are ALWAYS separate groups (visual hallucinations vs auditory hallucinations vs hallucinations)
   - Related but distinct effects are ALWAYS separate (anxiety vs panic vs paranoia)
   - Different certainties are ALWAYS separate (rare vs occasional vs sometimes vs often)
   - Different user populations are ALWAYS separate (in some users vs in depressed individuals)
   - Compound effects containing different components are ALWAYS separate

3. **Parenthetical Standardization**:
   - ALL qualifiers/context MUST be moved to the end in parentheses
   - Order: Base effect → All qualifiers in parentheses at the end
   - Multiple qualifiers are combined in a single parenthesis, separated by semicolons
   - Examples of standardization:
     - "mild euphoria" → "euphoria (mild)"
     - "intense euphoria at high doses" → "euphoria (intense; at high doses)"
     - "Mild euphoria (rare)" → "euphoria (mild; rare)"
     - "euphoria at high doses" → "euphoria (at high doses)"
     - "Anxiety, especially at high doses" → "Anxiety (especially at high doses)"
     - "Compulsive redosing above 20 mg" → "Compulsive redosing (above 20 mg)"
     - "mild to moderate euphoria" → "euphoria (mild to moderate)"
     - "profound analgesia" → "analgesia (profound)"
     - "Heavy sedation / nodding" → "sedation / nodding (heavy)"
     - "Mild closed-eye visuals at higher doses" → "closed-eye visuals (mild; at higher doses)"
   - Intensity qualifiers (mild, moderate, intense, profound, slight, strong, etc.) always go in parentheses
   - Dose qualifiers (at high doses, at low doses, above X mg, etc.) always go in parentheses
   - Timing qualifiers (on comedown, during peak, after use, etc.) always go in parentheses
   - Frequency qualifiers (rare, occasional, sometimes, common, etc.) always go in parentheses
   - User qualifiers (in some users, in depressed individuals, etc.) always go in parentheses

3. **Canonical Selection**:
   - Choose the term that best represents the average of all synonyms
   - Consider frequency of use across the dataset
   - Select the most neutral/middle-ground term (not too medical, not too casual)
   - Maintain consistency across groups

**Output Format** (`effects-synonym-groups.md`):
```markdown
# Effects Synonym Groups

## Summary
- Total original effects: 2247
- Total synonym groups: [auto-calculated]
- Effects successfully grouped: [auto-calculated]
- Ungrouped unique effects: [auto-calculated]

## Standardization Rules Applied
- All intensity qualifiers moved to end in parentheses
- All dose contexts moved to end in parentheses
- All timing contexts moved to end in parentheses
- Multiple qualifiers combined with semicolons
- Medical terms mapped to common equivalents where applicable

## Synonym Groups

### Group 1: euphoria
**Canonical term**: euphoria
**Variants** (2):
- euphoria
- Euphoria

### Group 2: euphoria (mild)
**Canonical term**: euphoria (mild)
**Variants** (2):
- euphoria (mild)  [from: "mild euphoria"]
- euphoria (mild)  [from: "Mild euphoria"]

### Group 3: euphoria (at high doses)
**Canonical term**: euphoria (at high doses)
**Variants** (2):
- euphoria (at high doses)  [from: "euphoria at high doses"]
- euphoria (at high doses)  [from: "Euphoria (at high doses)"]

### Group 4: euphoria (mild; at high doses)
**Canonical term**: euphoria (mild; at high doses)
**Variants** (3):
- euphoria (mild; at high doses)  [from: "mild euphoria at high doses"]
- euphoria (mild; at high doses)  [from: "Mild euphoria (at high doses)"]
- euphoria (mild; at high doses)  [from: "Mild euphoria at high doses"]

### Group 5: dilated pupils
**Canonical term**: dilated pupils
**Variants** (6):
- dilated pupils
- dilated pupils  [from: "Dilated pupils"]
- dilated pupils  [from: "mydriasis"]
- dilated pupils  [from: "Mydriasis"]
- pupil dilation
- pupil dilation  [from: "Pupil dilation"]

### Group 6: dilated pupils (for ≥24 h)
**Canonical term**: dilated pupils (for ≥24 h)
**Variants** (1):
- dilated pupils (for ≥24 h)

[... continue for all ~1500-1800 groups ...]

## Ungrouped Effects
[Effects that appear to be unique with no synonyms]
- 'Brain-zaps'
- cataleptic episodes ('White-out'; at high doses)  [from: "'White-out' or cataleptic episodes at high doses"]
- Abdominal pain
[... etc ...]
```

### Phase 5: Output Generation
**Method**: LLM creates final markdown output

**Output File Structure** (`notes and plans/effects-synonym-groups.md`):

```markdown
# Effects Synonym Grouping Review

## Statistics
- Original effects: 2247
- Grouped effects: X
- Unique groups: Y
- Ungrouped effects: Z

## High Confidence Groups
[Groups where algorithm is certain of synonym relationship]

## Medium Confidence Groups
[Groups that may need human verification]

## Low Confidence Groups
[Potential synonyms that need careful review]

## Ungrouped Effects
[Effects that appear to be unique]
```

### Phase 6: Verification
**Method**: LLM verifies completeness and accuracy

**Verification Checks**:
1. **Count Verification**:
   - Total effects in = 2247
   - Total effects out = 2247
   - No effects lost or duplicated

2. **Structure Validation**:
   - Valid JSON structure
   - All required fields present
   - No empty groups

3. **Semantic Validation**:
   - No obvious non-synonyms grouped
   - Medical terms properly mapped
   - Qualifiers properly preserved

**Output**: `notes and plans/grouping-verification-report.md`

## File Structure
```
dose.wiki/
├── notes and plans/
│   ├── all-effects.md (source - 2247 effects - READ ONLY)
│   ├── effects-synonym-mapping-plan.md (this file)
│   ├── effects-synonym-groups.md (FINAL OUTPUT - machine readable markdown)
│   └── grouping-verification-report.md (verification log)
└── src/data/
    └── articles.json (NEVER MODIFIED - source of truth)
```

## Important: Data Integrity
- **articles.json**: Never touched or modified
- **all-effects.md**: Read-only source file
- **Final output**: Machine-readable markdown file with grouped synonyms created by LLM
- No scripts created - all grouping done through LLM understanding

## Known Synonym Patterns to Detect

### STRICT GROUPING EXAMPLES

#### What CAN be grouped (exact semantic matches only):
- "euphoria" + "Euphoria" → Same group (case difference only)
- "mood-lift" + "mood lift" → Same group (punctuation difference only)
- "after-glow" + "afterglow" → Same group (spacing difference only)
- "mydriasis" + "dilated pupils" + "pupil dilation" → Same group (medical/common terminology for EXACT same effect)

#### What CANNOT be grouped (different contexts/qualifiers):
- "euphoria" ≠ "euphoria (at high doses)" → Different groups
- "euphoria (at high doses)" ≠ "euphoria (at higher doses)" → Different groups
- "mild euphoria" ≠ "moderate euphoria" ≠ "intense euphoria" → Different groups
- "euphoria (rare)" ≠ "euphoria (occasional)" ≠ "euphoria (common)" → Different groups
- "euphoria" ≠ "cognitive euphoria" ≠ "physical euphoria" → Different groups
- "hallucinations" ≠ "visual hallucinations" ≠ "auditory hallucinations" → Different groups
- "anxiety" ≠ "anxiety / panic" ≠ "anxiety & paranoia" → Different groups
- "sedation" ≠ "sedation / nodding" ≠ "heavy sedation" → Different groups
- "nausea" ≠ "nausea / vomiting" → Different groups
- "anxiety on comedown" ≠ "anxiety at high doses" → Different groups

### Medical Terminology (with strict context preservation)
Base terms can be grouped, but ONLY when they have identical contexts:
- "anxiolysis" = "anxiety reduction" = "reduced anxiety" → Same group ONLY if no qualifiers
- "anxiolysis (at low doses)" = "anxiety reduction (at low doses)" → Same group
- "anxiolysis (at low doses)" ≠ "anxiolysis (at high doses)" → Different groups
- "analgesia" = "pain relief" → Same group ONLY if no qualifiers
- "mild analgesia" = "mild pain relief" → Same group
- "mild analgesia" ≠ "profound analgesia" → Different groups

### Common Variations
- after-glow = afterglow
- mood lift = mood-lift = mood lifting
- body load = body-load
- closed-eye = closed eye
- open-eye = open eye

### Compound Terms
- jaw clenching = teeth grinding = bruxism
- pupil dilation = dilated pupils = mydriasis
- pupil constriction = constricted pupils = miosis

## Success Metrics
1. **Data Integrity**: All 2247 effects accounted for
2. **Accuracy**: Only EXACT synonyms grouped together (same effect, same context, same intensity)
3. **Transparency**: Clear audit trail for all grouping decisions
4. **Usability**: Both machine-readable and human-verifiable output
5. **Natural Grouping**: Final count emerges from actual synonyms, not forced reduction
6. **Context Preservation**: Every unique context/qualifier preserved as separate group

## Expected Outcomes with Strict Rules
With these ultra-conservative rules, we expect:
- **Many more groups** (likely 1500-1800 groups instead of 450-500)
- **Smaller group sizes** (most groups will have 2-5 variants instead of 10-30)
- **More ungrouped effects** (many effects will remain unique)
- **Better data fidelity** (no loss of nuance or context)

Example of expected grouping:
- Group: "Euphoria" → Contains only: euphoria, Euphoria
- Group: "Euphoria (at high doses)" → Contains only: Euphoria (at high doses), euphoria (at high doses)
- Group: "Euphoria (at higher doses)" → Contains only: Euphoria (at higher doses), euphoria (at higher doses)
- Group: "Mild euphoria" → Contains only: Mild euphoria, mild euphoria
- Group: "Intense euphoria" → Contains only: Intense euphoria, intense euphoria

## Canonical Term Selection Algorithm
The script should select the canonical term using these criteria:
1. **Frequency analysis**: Count how often each variant appears in the dataset
2. **Accessibility score**: Rate terms on a scale from highly medical (1) to highly casual (10)
3. **Length consideration**: Prefer concise but clear terms
4. **Average selection**: Choose the term that represents the middle ground

Example scoring:
- "mydriasis" - Medical score: 2, Frequency: 2, Length: 9
- "pupil dilation" - Medical score: 5, Frequency: 1, Length: 14
- "dilated pupils" - Medical score: 6, Frequency: 3, Length: 14
→ **Selected canonical: "Dilated pupils"** (most frequent, accessible middle ground)

## Processing Order
1. **Phase 1**: Read and analyze all 2247 effects for patterns
2. **Phase 2**: Group exact duplicates (case/punctuation variations)
3. **Phase 3**: Group medical/common term synonyms
4. **Phase 4**: Process compound effects and their relationships
5. **Phase 5**: Generate final markdown output with all groups
6. **Phase 6**: Verify all 2247 effects are accounted for

## Next Steps
1. LLM reads through all 2247 effects from `all-effects.md`
2. Identifies and groups obvious duplicates (case/formatting)
3. Groups medical/common terminology synonyms
4. Processes compound effects appropriately
5. Selects canonical terms for each group
6. Generates final markdown output file
7. Verifies all effects are accounted for

## Notes
- The system should be conservative - better to under-group than over-group
- All original text must be preserved exactly as it appears
- The final number of groups will depend on how many true synonyms exist
- This is not about reducing the list arbitrarily, but about identifying genuine duplicates
- All contextual information (dose, route, timing, etc.) will be standardized to parenthetical format for machine readability

## Examples of Parenthetical Standardization

### Input → Output (ALL qualifiers to end)

#### Intensity Qualifiers
- "mild euphoria" → "euphoria (mild)"
- "Mild euphoria" → "euphoria (mild)"
- "intense euphoria" → "euphoria (intense)"
- "profound analgesia" → "analgesia (profound)"
- "slight stimulation" → "stimulation (slight)"
- "strong sedation" → "sedation (strong)"
- "Heavy sedation" → "sedation (heavy)"
- "marked anxiolysis" → "anxiolysis (marked)"

#### Dose Context
- "Amnesia at high doses" → "amnesia (at high doses)"
- "euphoria at low doses" → "euphoria (at low doses)"
- "Compulsive redosing above 20 mg" → "compulsive redosing (above 20 mg)"
- "mild euphoria at ≤600 µg" → "euphoria (mild; at ≤600 µg)"
- "Sedation at higher serum levels" → "sedation (at higher serum levels)"

#### Multiple Qualifiers (combined with semicolons)
- "Mild euphoria (rare)" → "euphoria (mild; rare)"
- "intense euphoria at high doses" → "euphoria (intense; at high doses)"
- "Mild euphoria (rare, at high doses)" → "euphoria (mild; rare; at high doses)"
- "profound sedation in animals" → "sedation (profound; in animals)"
- "mild euphoria occasionally reported" → "euphoria (mild; occasionally reported)"

#### Timing Context
- "Anxiety, especially during comedown" → "anxiety (especially during comedown)"
- "anxiety on comedown" → "anxiety (on comedown)"
- "euphoria during peak" → "euphoria (during peak)"
- "fatigue after use" → "fatigue (after use)"
- "insomnia post-experience" → "insomnia (post-experience)"

#### Route/Method Context
- "intense euphoric rush (IV)" → "euphoric rush (intense; IV)"
- "euphoria (smoked)" → "euphoria (smoked)"
- "nausea (especially oral)" → "nausea (especially oral)"

#### Compound Effects (qualifier applies to whole compound)
- "Heavy sedation / nodding" → "sedation / nodding (heavy)"
- "Mild anxiety / paranoia" → "anxiety / paranoia (mild)"
- "intense anxiety or panic at high doses" → "anxiety or panic (intense; at high doses)"
- "mild to moderate euphoria" → "euphoria (mild to moderate)"

#### Special Cases
- "euphoria or dysphoria (dose-dependent)" → "euphoria or dysphoria (dose-dependent)"
- "anxiolysis → severe anxiety/panic (high doses)" → "anxiolysis → severe anxiety/panic (high doses)"
- "Euphoria (warm, MDMA-like)" → "euphoria (warm; MDMA-like)"
- "Euphoria (less than MDMA)" → "euphoria (less than MDMA)"

This ensures all effects with additional context can be easily parsed by:
1. Extracting base effect (text before first parenthesis)
2. Extracting all contexts (text within parentheses)
3. Grouping by base effect while preserving context

## Examples of Compound Effect Processing

### IMPORTANT: Compounds are NOT broken down
Compound effects (those with /, &, or, →, commas) are treated as unique effects and NOT split:
- "Anxiety / panic" is its own effect, separate from "Anxiety" and "Panic"
- "Nausea / vomiting" is its own effect, separate from "Nausea" and "Vomiting"
- "Tachycardia & hypertension" is its own effect, separate from individual components

### Input → Structured Output

**Alternative relationship** (A / B):
- Input: "Anxiety / panic (at high doses)"
- This remains as a single unique effect: "Anxiety / panic (at high doses)"
- It does NOT get grouped with "Anxiety / panic" (no context) or "Anxiety" or "Panic"

**Combined relationship** (A & B):
- Input: "Muscle tension & jaw clenching"
- Output:
  ```markdown
  ### Compound: Muscle tension & jaw clenching
  **Type**: Combined
  **Components**: [Muscle tension, Jaw clenching]
  ```

**List relationship** (A, B, C):
- Input: "Nausea, vomiting, diarrhea"
- Output:
  ```markdown
  ### Compound: Nausea, vomiting, diarrhea
  **Type**: List
  **Components**: [Nausea, Vomiting, Diarrhea]
  ```

**Sequential relationship** (A → B):
- Input: "Euphoria → dysphoria on comedown"
- Output:
  ```markdown
  ### Compound: Euphoria → dysphoria
  **Type**: Sequential
  **Components**: [Euphoria, Dysphoria]
  **Context**: (on comedown)
  ```

This approach preserves semantic relationships while making the data machine-parseable for further processing or splitting if needed.