# Harm Potential Section Generation

Generate only the `harm_potential` section of a dose.wiki substance article from the provided source excerpts. Work through evidence selection, field population, and completion checks in order. All instructions needed for this task are below.

## 1. Select eligible evidence

Use only information explicitly supported by specific text in the provided excerpts. Apply this requirement to every fact, value, mechanism, classification, and description. Populate every supported field; use the empty values defined in step 3 for unsupported content. General knowledge, training data, assumptions, and inferred safety or danger cannot fill evidence gaps.

Select substance-specific findings or explicitly attested uncertainty. Generic disclaimers and reusable adverse-effect warnings are not substance-specific evidence, even when quoted from this substance's article. Exclude that boilerplate rather than deriving addiction potential, dose-risk relationships, injury, or fatal outcomes from it.

Preserve the scope of safety claims. Omit undated statements that no deaths or adverse effects have been reported: they do not establish present-day absence. Anecdotal impressions and absent reports cannot establish that common doses are safe or not acutely dangerous. Retain explicitly attested uncertainty about toxic thresholds without adding reassurance or invented risks.

When severity assessments conflict, prefer the more authoritative assessment, prioritizing primary medical/toxicological evidence over community or anecdotal evidence. If assessments genuinely disagree and neither is clearly stronger, use the lower supported level and describe the uncertainty in the risk assessment directly. Match the evidence's actual risk rather than inflating rare outcomes or discounting documented ones.

### Scope

Keep addiction, physical dependence, lethal dosage, organ toxicity, carcinogenicity, antimicrobial activity, psychosis, and seizure findings here. Route-specific toxicity and the molecular mechanism of tissue damage belong here when supported.

Keep the following material in its separate article section:

| Material | Section |
|----------|---------|
| Receptor binding and primary or therapeutic mechanism of action | `pharmacology` |
| Drug interactions and combinations, including combination-related fatalities | `interactions` |
| Tolerance development timeline | `tolerance` |
| Subjective effect descriptions | `subjective_effects` |
| General dosing information | `dosage` |
| Effect duration and timeline | `duration` |
| Legal status | `legality` |

**Selection complete when:** every candidate finding has specific supporting excerpt text, belongs to an owned field, and passes the evidence and scope rules above. Apply the additional lethal-dose source restriction when populating that field.

## 2. Populate fields with direct findings

Write original, information-dense prose that is clinically precise, accessible, neutral, and harm-reduction focused. Synthesize and restructure the excerpts; standard medical and toxicological terminology may remain unchanged, but do not copy sentences or lengthy phrases.

Make each description about the substance, outcome, or biological process itself. State the actual supported finding directly, preserving species, route, exposure conditions, causal uncertainty, frequency, reversibility, and other qualifiers that limit its meaning. Report tested negative findings within their tested scope. Historical or descriptive labels attached to a claim and statements that testing was absent do not add findings to the prose; retain any actual supported result or risk uncertainty instead. Evidence-availability classifications may still be encoded where the schema explicitly supports them.

Use empty fields for missing information, not commentary about excerpts, documentation, sources, or data availability. This distinction preserves substantive uncertainty about a finding while keeping the writing focused on the substance. If equally authoritative severity assessments conflict, express the disagreement as uncertainty about the risk itself.

Keep descriptive string fields to 1-3 concise sentences, with the narrower psychological-addiction limit below. Use short labels for species, routes, units, anatomical systems, and assay names.

### Addiction, physical dependence, psychosis, and seizure

Map the source's own risk language about this substance onto the following enum. This mapping is expected; asserting an unsupported risk is not. Apply the full definition, including frequency and exposure pattern, rather than treating the seriousness of one outcome as evidence of how commonly it occurs.

| Level | Definition |
|-------|------------|
| `extremely_low` | Minimal risk even with regular use; virtually no documented cases |
| `low` | Rare occurrences; typically requires predisposing factors or heavy use |
| `moderate` | Documented risk at typical doses; occurs in a notable minority of users |
| `high` | Common occurrence; expected with regular use |
| `extremely_high` | Near-certain with regular use; potentially life-threatening |

Use `level: null` when the excerpts provide no risk assessment or lack the frequency or exposure pattern needed to meet a definition. Retain a supported adverse outcome or warning in `description` even when its level is unclassified. Leave the description empty only when no eligible finding supports it. Preserve rarity and relevant severity, including severe or life-threatening outcomes, without converting severity alone into frequency.

| Field | Population target |
|-------|-------------------|
| `addiction.psychological` | In 1-2 sentences, describe psychological addiction, abuse potential, reinforcement, habit formation, compulsive redosing, or difficulty stopping. Include supported daily-use or binge patterns and route differences. Assign level according to how commonly psychological addiction develops. |
| `addiction.physical_dependence` | Describe physical dependence distinctly from psychological addiction, including withdrawal or discontinuation symptoms and relevant tolerance development without its timeline. Preserve supported withdrawal severity, hospitalization needs, and fatality risk. Assign level according to likelihood and severity of dependence. |
| `psychosis` | Describe supported psychosis, psychotic episodes, delusions, paranoia, or emergence delirium. Include hallucinations only as part of a supported psychiatric risk finding, not ordinary subjective effects. Distinguish acute symptoms during use from persistent symptoms after use. Assign level according to supported frequency and severity. |
| `seizure` | Describe seizures, convulsions, epileptic effects, or seizure-threshold changes, with the conditions that increase risk. Assign level according to how commonly seizures occur. |

### `toxicity.lethal_dosage`

**Source restriction:** exclude all content from "Disregard Everything I Say" from both `notes` and `ld50`. Its speculative LD50 extrapolations are unsuitable for this field. Use only formal medical/toxicological sources, including the original source categories of PsychonautWiki, Wikipedia, Erowid, and academic sources. This exclusion is limited to lethal dosage; other harm-potential fields may use eligible findings from "Disregard Everything I Say".

- `notes`: approximate human lethal-dose estimates, case reports, anecdotal findings, informal ranges, and other information unsuitable for a formal LD50 entry. Preserve supported route- and tolerance-related variability and uncertainty. The interaction exclusion also applies here.
- `ld50`: formal LD50 results from controlled human or animal studies only. Each entry has `species`, `route`, numeric `value` or `null` for descriptive-only data, and `unit`. Preserve the reported administration route and units.

Informal estimates belong only in `notes`; leave `ld50: []` when no formal structured data is available. Never turn informal estimates into formal LD50 values.

### `toxicity.organ_toxicity`

Create one entry per affected organ or body system. Include supported organ damage, biomarker elevations, mechanistic models, and route-specific toxicity differences. Populate each entry as follows:

| Field | Population target |
|-------|-------------------|
| `system` | Anatomical organ or body-system name. |
| `findings` | A complete, self-contained sentence describing the damage and its supported exposure conditions. This is the summary visible in a collapsed card, so retain essential species, route, dose/frequency, duration, risk-factor, and causal qualifiers here. State explicitly when a finding applies only to heavy, chronic, compulsive, prolonged, extreme-dose, or overdose exposure. Use only conditions the excerpt supports; an unspecified condition is not a reason to invent one or imply safety at other exposures. |
| `mechanism` | Only the biochemical or molecular pathway of damage: molecular targets, cellular processes, or biochemical pathways. Keep mechanistic models qualified as models. Use `""` when no biochemical explanation is supported. |
| `notes` | Additional clinical context: prevalence, statistics, reversibility, case counts, populations, risk factors, dosing/frequency patterns, and observations without a biochemical explanation. Keep the essential conditions needed to understand the damage in `findings`; place further detail here. |

Keep findings proportionate to the attested exposure pattern. Evidence of damage under extreme use does not establish the same risk under occasional use, and it does not establish safety under occasional use either.

### `toxicity.carcinogenicity`

Use supported cancer, carcinogenicity, mutagenicity, or classification findings. Select the level from the definitions below, not from missing excerpts.

| Level | Definition |
|-------|------------|
| `confirmed` | IARC Group 1 or equivalent; established human carcinogen |
| `probable` | IARC Group 2A; strong animal evidence and limited human data |
| `possible` | IARC Group 2B; some evidence, not conclusive |
| `no_evidence` | Studies exist showing no carcinogenic activity |
| `unknown` | Explicitly attested insufficient data or absence of conducted studies |

Use `null` if the excerpts do not support a classification. Write `description` as direct cancer-risk findings, including negative study results with their species and other scope qualifiers. An explicitly attested absence of testing may support `unknown` without supplying descriptive prose.

Use `evidence: null` when no detailed evidence breakdown is supported. Otherwise populate the evidence object in step 3:

- `human_epidemiological`: evidence level for human epidemiological findings.
- `animal_models`: evidence level and array of tested species.
- `in_vitro`: `type` of finding and `assay_type`; use `null` for the whole object when no in-vitro data is available. When the object is present, its inner fields are strings, using `""` for unsupported text rather than inner `null` values.
- `mechanistic`: evidence level and the supported receptor or mechanism `basis`; the whole object may be `null` when no mechanistic evidence is available.

Apply these evidence levels only when explicitly supported:

| Level | Definition |
|-------|------------|
| `none` | No studies conducted |
| `negative` | Studies show no effect or carcinogenic activity |
| `limited` | Some studies suggest activity but remain inconclusive |
| `positive` | Clear evidence of carcinogenic activity |

Use `null` for an unassigned evidence level. An absent excerpt does not establish `none`, and an absence of studies does not establish `negative` or `no_evidence`.

### `toxicity.antibiotic_function`

Describe supported antimicrobial, antibiotic, bactericidal, or bacteriostatic findings directly, retaining experimental conditions and uncertainty. Select a classification only when the excerpts support it:

| Level | Definition |
|-------|------------|
| `confirmed` | Documented antimicrobial activity at pharmacological doses |
| `probable` | Strong in-vitro evidence with an understood mechanism |
| `possible` | Some evidence of antimicrobial properties |
| `no_evidence` | Studies show no antimicrobial activity |
| `unknown` | Explicitly attested absence of study of antimicrobial properties |

Use `null` when no classification is supported. Explicitly absent testing can support `unknown`; keep the description empty unless an actual finding is supported.

**Population complete when:** every eligible finding is represented in its correct field, every level meets its definition or is `null`, and descriptions retain the qualifiers needed to interpret findings without source commentary.

## 3. Return the exact YAML contract

Return only valid YAML with the single top-level key `harm_potential`, no Markdown fences or commentary. Include every field in the empty template, replacing empty values only where supported. Use `""` for empty strings, `[]` for empty arrays, and `null` for unassigned levels or unavailable optional evidence objects. Indent with spaces, not tabs.

```yaml
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
```

When populated, array entries and the carcinogenicity evidence object use exactly these fields and types. The notation below defines types, not literal output values.

```yaml
ld50:
  - species: string
    route: string
    value: number | null
    unit: string
organ_toxicity:
  - system: string
    findings: string
    mechanism: string
    notes: string
evidence:
  human_epidemiological: "none" | "negative" | "limited" | "positive" | null
  animal_models:
    level: "none" | "negative" | "limited" | "positive" | null
    species: string[]
  in_vitro:  # object | null
    type: string
    assay_type: string
  mechanistic:  # object | null
    level: "none" | "negative" | "limited" | "positive" | null
    basis: string
```

## 4. Check completion

Before returning, check every populated field against its supporting excerpt and confirm:

- All required keys and object/array shapes match step 3; each level is an allowed enum or `null`.
- Each fact passes step 1, including boilerplate, safety-claim, interaction, and owned-section boundaries.
- Both lethal-dose fields pass their source restriction, with informal estimates kept separate from formal LD50 results.
- Organ findings stand alone with supported conditions and qualifiers; mechanisms explain molecular damage, and additional clinical context is in notes.
- Every supported finding survives even when its severity is unclassified; unsupported information uses the specified empty value.
- Prose states direct findings or substantive uncertainty, with historical/descriptive labels and absent-testing commentary omitted. Tested negative results retain their experimental scope.
- The response is valid YAML only.
