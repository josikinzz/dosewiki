# Effects Synonym Grouping Verification Report

## Processing Summary
- **Date**: 2025-09-22
- **Input file**: `all-effects.md`
- **Output file**: `effects-synonym-groups.md`
- **Processing method**: Python script with ultra-conservative grouping rules

## Statistics
- **Total input effects**: 2247
- **Total output groups**: 2004
- **Total effects in groups**: 2247
- **Groups with multiple variants**: 190
- **Single-effect groups (ungrouped)**: 1814

## Verification Checks

### ✓ Count Verification
- Input count: 2247 effects
- Output count: 2247 effects
- **Status**: PASSED - No effects lost in processing

### ✓ Group Structure
- All groups have canonical terms
- All groups have variants listed
- No empty groups detected
- **Status**: PASSED

### ✓ Standardization Applied
- Intensity qualifiers moved to parentheses
- Dose contexts moved to parentheses
- Timing contexts moved to parentheses
- Medical terminology mapped to common terms
- **Status**: PASSED

## Key Grouping Results

### Successfully Grouped Synonyms (Sample)
1. **Mydriasis/Dilated pupils**: Medical and common terms grouped
2. **Miosis/Constricted pupils**: Medical and common terms grouped
3. **Bruxism/Teeth grinding**: Medical and common terms grouped
4. **Analgesia/Pain relief**: Medical and common terms grouped
5. **Anxiolysis/Reduced anxiety**: Medical and common terms grouped
6. **Tachycardia/Increased heart rate**: Medical and common terms grouped
7. **Bradycardia/Decreased heart rate**: Medical and common terms grouped
8. **Diaphoresis/Sweating**: Medical and common terms grouped
9. **Pruritus/Itching**: Medical and common terms grouped
10. **Somnolence/Drowsiness**: Medical and common terms grouped

### Properly Separated Effects (Ultra-Conservative)
- "euphoria" ≠ "euphoria (mild)" ≠ "euphoria (intense)" - Different intensity groups
- "anxiety (at high doses)" ≠ "anxiety (at higher doses)" - Different dose contexts
- "anxiety (on comedown)" ≠ "anxiety (during peak)" - Different timing contexts
- "hallucinations" ≠ "visual hallucinations" ≠ "auditory hallucinations" - Different modalities
- "anxiety" ≠ "anxiety / panic" ≠ "anxiety & paranoia" - Different compound effects

## Group Size Distribution
- **1 variant** (ungrouped): 1814 groups (90.5%)
- **2 variants**: ~150 groups (7.5%)
- **3+ variants**: ~40 groups (2%)

## Notable Findings

### Most Common Base Effects (after standardization)
1. Euphoria (multiple intensity/dose variations)
2. Anxiety (multiple context variations)
3. Nausea (multiple severity/timing variations)
4. Sedation (multiple intensity variations)
5. Stimulation (multiple types/intensities)

### Compound Effects Preserved
- Effects with "/" (alternatives): Kept as unique groups
- Effects with "&" (combined): Kept as unique groups
- Effects with "→" (sequential): Kept as unique groups
- Effects with "," (lists): Kept as unique groups

## Data Integrity Confirmation

### Cross-Check Results
- ✓ All 2247 original effects mapped to groups
- ✓ No duplicate effects within groups
- ✓ Qualifiers preserved in standardized format
- ✓ Medical synonyms correctly identified
- ✓ Compound effects not incorrectly split

## Conclusion

The synonym grouping process has been completed successfully following ultra-conservative rules. The resulting 2004 groups preserve all nuance and context from the original 2247 effects while identifying true synonyms (primarily case variations and medical/common terminology equivalents).

The high number of groups (2004 from 2247 effects) reflects the conservative approach that:
1. Preserves all intensity differences
2. Maintains all dose context variations
3. Keeps all timing contexts separate
4. Does not split compound effects
5. Respects all user population differences

This approach ensures maximum data fidelity while still achieving meaningful synonym consolidation where appropriate.