# Tolerance Section Generation

Generate only the `tolerance` section of a dose.wiki substance article. dose.wiki is Josie Kins' harm reduction database; use the neutral, precise, accessible voice of her harm reduction documentation.

## 1. Select tolerance evidence

Use only provided passages about tolerance, cross-tolerance, or tolerance timelines. Excerpts may also contain unrelated pharmacology, trip reports, or sources marked as containing no tolerance content; select material by its relevance to these tolerance topics.

Every timeline, condition, and cross-tolerance entry must be attested in the excerpts. Preserve every uncertainty qualifier, including whether a claim is possible, suspected, or expressed with “may” or “might”. Apply that uncertainty to every output field rather than converting it into an established effect or fixed timeline.

When excerpts give different timeframes, report the supported range or explicitly describe the divergence instead of silently selecting one source. Include specific time ranges when available, with units.

**Complete when:** every relevant passage has been considered and its attested claims, conditions, uncertainty, and any conflicting timeframes are accounted for in the field decisions below.

## 2. Populate the four fields

Use the following definitions and extraction rules. Each populated prose string is 1-3 complete sentences; an unattested string field is `""`. An unattested `cross_tolerance` is `[]`. Empty fields are complete output when evidence is absent.

### `full_tolerance`: time to develop full tolerance with continuous use

Capture statements about tolerance developing, repeated use causing tolerance, or tolerance building rapidly. Preserve use conditions such as daily or consecutive use and any distinction between tolerance to specific effects.

**Complete when:** the field contains the attested development information and all applicable conditions and effect distinctions, or is empty if none is attested.

### `half_tolerance`: time for tolerance to reduce by 50%

Populate only when an excerpt explicitly states a half-tolerance timeframe. Statements about tolerance beginning to decrease are relevant only if they also establish when it reaches half. Never derive this value from baseline tolerance or general knowledge.

**Complete when:** the field states an explicitly attested half-tolerance timeframe with its qualifications, or is empty.

### `baseline_tolerance`: time to return fully to baseline

Capture the full-reset timeframe. Excerpts may express it as spacing advice to wait a stated interval between uses; extract that timeframe while preserving the conditions and uncertainty attached to it.

**Complete when:** the field contains the attested reset timeframe, including relevant spacing advice, or is empty if none is attested.

### `cross_tolerance`: array of strings naming classes with shared tolerance

Include every cross-tolerant drug class mentioned in the excerpts, using standard terminology. A short parenthetical of representative drugs is allowed only when the excerpts name them. Preserve uncertainty in the label itself, such as a “Possible cross-tolerance with” qualification. Never infer cross-tolerance from the substance's class or use an unqualified label for a qualified claim.

**Complete when:** every attested class is represented with its qualifications, every named representative drug is excerpt-supported, and no entry is inferred; use an empty array when cross-tolerance is unattested.

## 3. Synthesize the prose

Express the selected evidence in original wording while retaining standard receptor names and pharmacological terminology. Do not copy source sentences or lengthy phrases.

Use phenomenologically precise, technically accurate, information-dense prose that remains readable and clinical without being cold. Present the substance directly in a neutral, non-advocacy register, without source commentary.

**Complete when:** all populated fields use original, readable prose or concise class labels as appropriate, and retain every qualification and conflict identified in step 1.

## 4. Return the YAML

Return all four fields in this exact structure and order:

```yaml
tolerance:
  full_tolerance: ""
  half_tolerance: ""
  baseline_tolerance: ""
  cross_tolerance: []
```

The entire reply must be valid raw YAML. Its first line is exactly `tolerance:` and its last line is the final field or its final array entry. Do not include code fences, commentary, or additional fields. `full_tolerance`, `half_tolerance`, and `baseline_tolerance` are strings; `cross_tolerance` is an array of strings.

**Completion check:** before returning, confirm every field meets its step 2 criterion, every timeline has units, steps 1 and 3 are satisfied, and the reply matches the required YAML shape and output boundary.
