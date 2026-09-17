# Summary Section Generation

Generate only the `summary` section of a dose.wiki substance article. dose.wiki is Josie Kins' harm reduction database; use the neutral, precise, accessible voice of her harm reduction documentation.

## 1. Select the supported overview

Use only claims explicitly stated or clearly implied in the provided excerpts. A synthesis date, discoverer, or origin requires explicit attestation; never fill gaps from prior knowledge.

Consider every topic below, retaining only what the excerpts support:

| Topic | Scope |
|-------|-------|
| Identity | Primary name and chemical class |
| Psychoactive class | Primary effects category |
| History or origin | First synthesis, discoverer, or traditional use |
| Distinguishing characteristics | Features that distinguish the substance from similar substances |
| Key safety notes | Attested adverse outcomes, adulterants, or caustic routes, with the conditions and uncertainty attached to those hazards. Research availability is not itself an adverse outcome and is outside this overview. |

Keep the overview within these ownership boundaries:

| Material owned elsewhere | Summary allowance |
|--------------------------|-------------------|
| `dosage`: specific dosage numbers | One qualitative potency note |
| `duration`: onset, peak, and offset timelines | One overall-duration clause |
| `pharmacology`: detailed mechanism of action | None of that detail |
| `legality`: legal status details | None |
| `subjective_effects`: exhaustive effect lists | Only the overview topics above |
| Identification above the summary: alternative, slang, and chemical names | Primary name only |

**Complete when:** all five topics have been considered, every selected claim has excerpt support, and all selected material fits the ownership boundaries.

## 2. Write the overview paragraph

Synthesize the selected information into original prose, ordered naturally for someone unfamiliar with the substance. Retain standard technical terminology such as chemical and drug class names, but do not copy source sentences or lengthy phrases.

Aim for 50-80 words. If the excerpts support fewer than 50 words, write a shorter paragraph of matching substance rather than padding it.

Write in third person and declarative present tense, using past tense for origins. Build each sentence around what the substance is, does, or causes, or when and how it originated. Attach uncertainty to those specific facts. Use neutral, precise, technically accurate prose that is readable without specialist knowledge. The paragraph is a substance description, not an assessment of research coverage or a request for further study.

**Complete when:** every sentence states a supported identity, effect, origin, distinguishing property, or concrete hazard; qualifications describe that fact's limits. The paragraph uses original wording and the specified voice, and meets the length target or is shorter because those facts warrant fewer words.

## 3. Return the YAML

Return exactly one string field in this structure:

```yaml
summary: ""
```

The entire reply must be valid raw YAML, beginning with `summary:`. Use proper string quoting and no tabs. Do not include code fences, commentary, explanations, or additional fields.

**Completion check:** before returning, confirm every criterion in steps 1 and 2 is satisfied and the reply contains only the required YAML string field.
