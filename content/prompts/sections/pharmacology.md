# Generate the pharmacology section

Generate only `pharmacology` for a dose.wiki substance article. Use supplied substance names and class labels for orientation when present; the provided source excerpts are the evidence. The rest of the article is unavailable.

Follow the sequence below. Keep all working decisions internal and return the YAML specified in step 6.

## 1. Select evidence and establish scope

Use only information explicitly stated or clearly implied in the excerpts. Leave unsupported fields empty rather than adding knowledge from memory. Numerical binding values require explicit numerical evidence, as specified in step 3.

When findings conflict, prefer primary pharmacological sources (DrugBank, Wikipedia citing studies) over community sources. Use study-based findings over conflicting general community classifications and omit the lower-priority inventory. Present the selected pharmacology directly, without source commentary or narration of the selection process. Omit missing functional data without commenting on its absence.

For conflicts that remain after source priority, describe the findings neutrally at the sources' level of certainty. Preserve genuine experimental uncertainty and source-stated qualifiers, including animal species or model qualifiers. Explain a discrepancy by assay, methodology, species, dose, route, or another factor only when the excerpts explicitly provide that explanation. Describe current scientific understanding rather than historical theories, debates, or changes in consensus.

Keep uncertain mechanisms hedged: a mechanism framed as inferred, presumed, likely, or based on structural similarity may appear only in `pharmacodynamics`, with its uncertainty preserved. It must not become a `binding_sites` entry or acquire an affinity or efficacy value. When structural speculation is the only mechanism evidence, use a short hedged pharmacodynamics sentence and an empty `binding_sites` array.

Keep content within these boundaries:

| Content | Destination |
| --- | --- |
| Receptor/transporter action and functional mechanism | `pharmacodynamics` and supported `binding_sites` entries |
| Absorption, distribution, metabolism, first-pass effects, enzymes, bioavailability, elimination, half-life, and metabolite production | `pharmacokinetics` and applicable structured route fields |
| Specific metabolite names | `metabolites` |
| Addiction, dependence, toxicity, LD50, organ damage, and other risks | Outside this section: `harm_potential` |
| Drug combinations and interactions | Outside this section: `interactions` |
| Tolerance and cross-tolerance | Outside this section: `tolerance` |
| Phenomenological effect descriptions | Outside this section: `subjective_effects` |
| Doses and therapeutic dosing recommendations | Outside this section: `dosage` |
| Subjective effect duration and timelines | Outside this section: `duration` |
| Legal status | Outside this section: `legality` |
| Chemical identity, classification, article summary, drug comparisons, reagent results, and citation lists | Outside this section; emit no corresponding article fields |

Completion: every usable finding has an owned destination and retains its evidence limits; unsupported and out-of-scope material is excluded.

## 2. Write `pharmacodynamics`

Write original, neutral, clinical but approachable prose. Synthesize and restructure the excerpts instead of copying sentences or lengthy phrases; standard technical terminology may remain unchanged. Apply this prose style to `pharmacokinetics` as well. Use commas, parentheses, or separate sentences instead of em dashes.

`pharmacodynamics` is a string, usually one concise paragraph of roughly 3-5 sentences. Use a second paragraph or additional sentences only when genuine pharmacodynamic nuance requires it, such as conflicting assay interpretations or an especially important secondary mechanism.

Lead with the main mechanism and give it the most space. Select the most relevant secondary targets, compressing them into one sentence where possible. Explain their significance rather than reproducing the target inventory in `binding_sites`; prioritize a human-curated overview over an exhaustive source digest.

Every sentence should primarily answer what this substance itself is doing pharmacologically. Mention enantiomers, other chemical classes, or general receptor/transporter/neurotransmitter biology only when supported and directly clarifying its own action. Any experiential reference must be brief and mechanistic rather than phenomenological. Keep route-specific details and all pharmacokinetic content in their destinations from step 1.

Completion: each sentence advances the substance's mechanism, the main action leads, secondary findings remain selective, and the evidence and scope rules from step 1 hold.

## 3. Build `binding_sites`

Extract all relevant supported target interactions, including secondary ones, in order of pharmacological importance. Each array entry has the following fields; omit optional fields when unsupported.

| Field | Type | Rule |
| --- | --- | --- |
| `target` | Required string | Use a short canonical identifier consistently, such as `5-HT2A`, `D2`, `NMDA`, `DAT`, or `SERT`. |
| `tag` | Optional string | Use a mechanism tag only for an interaction that qualifies as a mechanism of action. Omit it for binding that is not considered a primary mechanism. Apply the vocabulary and evidence rules below. |
| `affinity` | Optional string | Extract explicitly stated Ki, EC50, IC50, Kd, or other binding values with units. Preserve stated ranges and bounds. If only qualitative affinity is supplied, retain that qualitative description. Never estimate, extrapolate, derive, or infer a numerical affinity from it. |
| `efficacy` | Optional string | Include supported Emax, intrinsic activity, or functional efficacy, such as partial agonism. Keep wording concise and parallel across entries. |

### Target grouping and shared numerical bounds

Create one entry per interaction distinguished in the excerpts. Use a family-level entry only when the sources report the interaction solely at that level and name no subtypes. When subtype data exists for a family, use subtype entries throughout that family. Combine targets in a slash- or comma-joined label only when the sources report them solely jointly.

When an excerpt names receptor subtypes and explicitly assigns one shared numerical value or bound to them, give every named subtype its own entry with that same stated value or bound. A family-only row is insufficient. Preserve ranges as ranges; neither invent unmentioned subtypes nor divide a shared range into unsupported individual values.

Keep sibling entries internally parallel: short target identifiers, consistent supported tags for the same interaction type, and concise affinity/efficacy phrasing. Express source-supported differences in confidence or specificity in `affinity` or `efficacy`. Parallel formatting never justifies an unsupported tag or qualifier.

### Mechanism tag vocabulary

Use the following tags exactly when they match the evidence. Every qualifier requires support, including selectivity, full/partial activity, and competitive mechanism. Match partial versus full agonism to the source. When no listed tag fits without adding a claim, omit `tag` and retain the supported target and assay data. A new tag is permitted only for a genuinely uncovered mechanism, with any qualifier at the end in parentheses; it must not add unsupported specificity or merely vary or abbreviate a listed tag.

#### Serotonin receptors
- `5-HT1A receptor agonist (full)`
- `5-HT1A receptor agonist (partial)`
- `5-HT1A receptor antagonist`
- `5-HT2A receptor agonist (full)`
- `5-HT2A receptor agonist (partial)`
- `5-HT2A receptor antagonist`
- `5-HT2B receptor agonist`
- `5-HT2C receptor agonist (partial)`
- `5-HT2C receptor antagonist`

#### Dopamine system
- `Dopamine releasing agent`
- `Dopamine reuptake inhibitor`
- `Dopamine D1 receptor agonist`
- `Dopamine D2 receptor agonist`
- `Dopamine D2 receptor agonist (partial)`
- `Dopamine D2 receptor antagonist`
- `Dopamine D3 receptor agonist`
- `Dopamine D4 receptor agonist`

#### Norepinephrine system
- `Norepinephrine releasing agent`
- `Norepinephrine reuptake inhibitor`
- `Alpha-1 adrenergic receptor agonist`
- `Alpha-2 adrenergic receptor agonist`
- `Alpha-2 adrenergic receptor antagonist`
- `Beta adrenergic receptor antagonist`

#### Combined releasing agents
- `Serotonin releasing agent`
- `Serotonin-norepinephrine releasing agent (SNRA)`
- `Serotonin-dopamine releasing agent (SDRA)`
- `Serotonin-dopamine-norepinephrine releasing agent (SNDRA)`

#### Reuptake inhibitors
- `Serotonin reuptake inhibitor (selective, SSRI)`
- `Serotonin-norepinephrine reuptake inhibitor (SNRI)`
- `Norepinephrine-dopamine reuptake inhibitor (NDRI)`
- `Triple reuptake inhibitor (SNDRI)`

#### GABA system
- `GABA-A receptor positive allosteric modulator (benzodiazepine site)`
- `GABA-A receptor positive allosteric modulator (barbiturate site)`
- `GABA-A receptor agonist`
- `GABA-B receptor agonist`
- `GABA reuptake inhibitor`

#### Glutamate system
- `NMDA receptor antagonist (uncompetitive)`
- `NMDA receptor antagonist (competitive)`
- `AMPA receptor positive allosteric modulator`
- `mGluR2 receptor agonist`
- `mGluR5 receptor antagonist`

#### Opioid receptors
- `μ-opioid receptor agonist (full)`
- `μ-opioid receptor agonist (partial)`
- `μ-opioid receptor antagonist`
- `κ-opioid receptor agonist`
- `κ-opioid receptor antagonist`
- `δ-opioid receptor agonist`

#### Cannabinoid receptors
- `CB1 receptor agonist (full)`
- `CB1 receptor agonist (partial)`
- `CB1 receptor antagonist`
- `CB2 receptor agonist`

#### Cholinergic system
- `Muscarinic acetylcholine receptor antagonist`
- `Nicotinic acetylcholine receptor agonist`
- `Nicotinic acetylcholine receptor antagonist`
- `Acetylcholinesterase inhibitor`

#### Other targets
- `Sigma-1 receptor agonist`
- `Sigma-2 receptor agonist`
- `TAAR1 agonist (trace amine-associated receptor)`
- `Histamine H1 receptor antagonist`
- `Histamine H3 receptor antagonist`
- `Adenosine receptor antagonist`
- `Voltage-gated sodium channel blocker`
- `Voltage-gated calcium channel blocker`
- `HCN channel blocker`
- `Monoamine oxidase inhibitor (MAO-A)`
- `Monoamine oxidase inhibitor (MAO-B)`
- `Monoamine oxidase inhibitor (non-selective)`

Completion: every supported target interaction is represented at the source's grouping level, every shared subtype value or bound is retained, and every optional field passes its evidence rule.

## 4. Write `pharmacokinetics` and `metabolites`

### `pharmacokinetics`

Write a concise article-facing string, preferably one short paragraph unless the evidence genuinely needs more, using the prose style from step 2. This is the second prose subsection, after pharmacodynamics.

Prioritize first-pass metabolism, oral bioavailability context, major enzymes, and the broad metabolic pathway. Include relevant absorption, distribution, elimination, half-life context, and metabolite production here rather than in pharmacodynamics. Use specific enzyme names and values or ranges when available. Identify hepatic, renal, or other metabolic routes, phase I processes such as oxidation or reduction, and phase II conjugation when described. Include enzyme inhibition or induction when relevant to the substance itself.

Keep specific metabolite names in `metabolites` rather than turning this paragraph into a catalog. Concise prose does not replace complete extraction into the route fields in step 5.

### `metabolites`

Use an array of strings with proper chemical names when available. Prioritize active metabolites and identify activity in parentheses when supported. Include inactive metabolites when clinically relevant, retaining supported activity status.

Completion: the prose covers the selected pharmacokinetic findings without a metabolite catalog, and the separate array captures active or notable metabolites with supported names and activity labels.

## 5. Extract route data and notes

Populate all applicable structured route fields even when the article prose does not emphasize those findings. Use only routes with explicitly supplied bioavailability or half-life data in the corresponding value fields. A half-life may be shared by several routes when the excerpts support those assignments; do not infer additional route assignments from a general half-life.

### Canonical route mapping

Use these exact keys in all four route objects:

| Key | Source route wording |
| --- | --- |
| `Oral` | Oral, by mouth |
| `Insufflated` | Intranasal, snorted, insufflated |
| `Sublingual` | Under the tongue, buccal |
| `Smoked` | Smoking, inhalation/smoking, inhalation of combusted material |
| `Vaporized` | Vaporization, non-combustion |
| `Intravenous` | IV, intravenous injection |
| `Intramuscular` | IM, intramuscular injection |
| `Rectal` | Rectal, plugging |

For pharmacokinetic data from a route outside this vocabulary, retain the value and exact route qualifier in `pharmacokinetics` prose. Do not discard it, substitute a different route, or invent a route key.

### Value and note fields

| Field | Value and content |
| --- | --- |
| `route_bioavailability` | String percentages or percentage ranges, retaining supplied approximations, such as `67%`, `70-80%`, or `~45%`. |
| `route_half_life` | String elimination half-life values or ranges with units, such as `3-6 hours`, `45 min`, or `2.5-3 hours`. |
| `route_half_life_notes` | Additional timing context: time to peak blood levels, factors that speed or slow elimination, time remaining in the body, dose-dependence, or differences between people. Include a note only when it adds meaningful context beyond the value. |
| `route_bioavailability_notes` | Absorption-efficiency context: loss before reaching the bloodstream, food's effect on the amount absorbed, or why a route delivers more or less to the body. |

For both note fields, write one clear fact per line in plain language accessible without a chemistry background. Explain technical concepts simply. Separate lines with `\n` line breaks only, without bullet symbols; the UI supplies bullets. Keep timing facts in `route_half_life_notes` and absorption-efficiency facts in `route_bioavailability_notes`.

Completion: every explicit route-specific value is retained in the correct canonical field or, for an unsupported route, qualified prose; notes are correctly separated by topic and add readable context.

## 6. Assemble and check the output

Return only valid YAML with this exact structure, without markdown fences or commentary:

```yaml
pharmacology:
  pharmacodynamics: ""
  binding_sites: []
  pharmacokinetics: ""
  metabolites: []
  route_bioavailability: {}
  route_half_life: {}
  route_half_life_notes: {}
  route_bioavailability_notes: {}
```

Use two-space indentation and no tabs. Populated arrays use `- ` item prefixes. Objects use key-value pairs, with quoted keys for all route objects. All eight fields remain present, including when empty: use `""` for strings, `[]` for arrays, and `{}` for objects, never `null`.

Before returning, check every item:

- Evidence and scope: every claim and value passes step 1, including source precedence, retained uncertainty and animal qualifiers, speculative-mechanism restrictions, current-understanding framing, and source-supported discrepancy explanations. Only pharmacology content is present.
- Prose: both strings satisfy step 2's synthesis, tone, and punctuation rules. Pharmacodynamics passes its substance-action, hierarchy, and concision criteria; pharmacokinetics passes step 4. Their content respects the step 1 split, with specific metabolite names confined to `metabolites`.
- Targets: every entry has `target` and only supported optional `tag`, `affinity`, and `efficacy` fields. Every interaction, grouping, shared numerical bound, ordering, identifier, qualifier, and tag passes step 3.
- Metabolites: the field is an array of strings with supported names and activity labels, meeting step 4's selection rules.
- Routes: all explicit data is accounted for under step 5, including outside-vocabulary routes in qualified prose. All four objects use exact canonical keys and appropriate string values; notes meet topic, additional-context, plain-language, and line-format rules.
- Serialization: the exact root and eight fields are present with the required types, empty forms, indentation, array syntax, and quoted route keys. The response contains YAML only.
