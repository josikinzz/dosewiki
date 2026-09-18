# History & Culture Section Generation

Generate only the `history_culture` section of a dose.wiki substance article. dose.wiki is Josie Kins' harm reduction database; use the neutral, encyclopedic voice of her harm reduction documentation.

## 1. Select historical and cultural evidence

When current article YAML is supplied, use it only as context for identifying the substance. Derive every output claim from the provided excerpts: dates, people, institutions, facts, and framing all require excerpt support. Never fill gaps with prior knowledge.

When excerpts conflict on a fact or date, prefer the Wikipedia excerpt over community wiki excerpts. State only that better-attested account, preserving its own level of certainty and temporal precision.

Discovery basics may overlap with the separately generated `summary`. Keep other article domains in their own sections:

| Material | Owning section |
|----------|----------------|
| Receptor binding and mechanism of action | `pharmacology` |
| Drug interactions and combinations | `interactions` |
| Tolerance development timeline | `tolerance` |
| Effect descriptions | `subjective_effects` |
| Dosing information | `dosage` |
| Duration and timeline of effects | `duration` |
| Legal status and scheduling or ban dates | `legality` |
| Toxicity, LD50, and health risks | `harm_potential` |

Scheduling and ban dates belong here only when the excerpts tie them to a cultural consequence, such as a market shift to successor compounds. Identification, classification, and citations are also generated separately.

**Complete when:** every genuine historical or cultural passage has been considered, every retained claim is excerpt-supported, each conflict is resolved by the stated priority, and all retained material fits this section's ownership.

## 2. Choose the structure the evidence supports

The root has both `content` and `sections`. With supported historical or cultural content, populate exactly one: use `sections: []` with root prose, or `content: ""` with sections. When no genuine historical or cultural content is supported, return `content: ""` and `sections: []`.

| Evidence available | Structure |
|--------------------|-----------|
| Everything fits in 3 or fewer paragraphs | Root `content` only |
| Richer material requiring more space and supporting at least 3 distinct topics | `sections` only |

A sentence or two of genuine history calls for one short root paragraph of matching length. Write only the supported material and stop. Choose section headings from the topics actually covered, whether a person's work, an incident, an era, or another supported theme.

### Sections and nested subsections

Every section has `heading`, `content`, and `subsections`.

- For an ordinary prose section, populate `content` and set `subsections: []`.
- For a list of distinct entities that each warrant a heading, such as notable individuals or research programs, use nested subsections and set the parent section's `content: ""`.
- Every nested subsection has its own `heading` and `content`. Use nesting only for these list-of-entities sections.

### Optional `date_range`

A section or nested subsection may include `date_range` only when it has a clear time period. Omit the field entirely for a topic without a specific time period.

- `start` is required whenever `date_range` is present.
- Add `end` for a span; omit it for a single date.
- Use quoted years or, when needed, full dates in `YYYY-MM-DD` format.
- Express decade-scale spans with start and end years, not decade labels.
- Date ranges may overlap between sections.
- Use only excerpt-attested dates and precision.

**Complete when:** the chosen root structure matches the amount of evidence, every heading has supported material, every section and subsection has its required fields, and every optional date range meets all rules above.

## 3. Write the narrative

Synthesize the selected evidence into original prose. Historical dates, names, and specific facts may remain as given; do not copy source sentences or lengthy phrases.

Write in encyclopedic third person, using past tense for historical events. Anchor claims to the specific dates, people, and institutions the excerpts provide. Present information directly without source commentary. Maintain neutral documentation without advocacy or moralizing about drug use, culture, or prohibition.

**Complete when:** the prose covers the selected history at its supported level of detail, preserves the evidence's temporal precision, and satisfies every voice and originality rule above.

## 4. Return the YAML

The entire reply must be valid raw YAML beginning with `history_culture:` on the first line. Use 2-space indentation and no tabs, code fences, commentary, or additional root fields. Use a YAML literal block scalar (`|`) for multi-paragraph content to preserve paragraph breaks.

Root prose shape:

```yaml
history_culture:
  content: ""
  sections: []
```

Section shape:

```yaml
history_culture:
  content: ""
  sections:
    - heading: ""
      content: ""
      subsections: []
```

Nested subsection shape:

```yaml
history_culture:
  content: ""
  sections:
    - heading: ""
      content: ""
      subsections:
        - heading: ""
          content: ""
```

Populate the chosen shape according to steps 2 and 3. Add optional `date_range` mappings at the applicable section or subsection level using `start` and, for spans, `end` as defined in step 2.

**Completion check:** before returning, confirm all evidence and ownership criteria in step 1, every structure and date criterion in step 2, and every prose criterion in step 3. Confirm the reply has both root fields, exactly one populated when content is supported or both empty when it is not, all required nested fields, and only the required raw YAML.
