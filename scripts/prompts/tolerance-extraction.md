# Tolerance Extraction Prompt

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

```
## Source: {Source Name}

{verbatim extracted text}

---
```

If a source has NO tolerance content, output:

```
## Source: {Source Name}

*No tolerance content found.*

---
```

## Schema Field Mapping
When extracting, look for content that maps to these fields:
- `full_tolerance` - Time for full tolerance to develop
- `half_tolerance` - Time for tolerance to reduce by 50%
- `baseline_tolerance` - Time for complete tolerance reset
- `cross_tolerance` - Array of substances with cross-tolerance

## Important
Tolerance information helps users understand safe dosing intervals. Be thorough in extracting all timing and mechanism information.
