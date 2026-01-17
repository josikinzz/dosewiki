# Intro Text Extraction Prompt

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

```
## Source: {Source Name}

{verbatim extracted text}

---
```

If a source has NO intro content, output:

```
## Source: {Source Name}

*No intro content found.*

---
```

## Schema Field Mapping
When extracting, look for content that answers:
- `name` - What is the common name?
- `aliases` - What are the street names/slang?
- `drug_class` - What type of drug is this?
- `chemical_class` - What chemical family?
- `description` - 1-2 sentence summary
- `appearance` - What does it look like?
- `common_forms` - Powder, pill, blotter, etc.
- `routes` - How is it typically taken?

## Important
Keep intro extractions concise and focused. This content will be used for the opening section of articles - users want to quickly understand what a substance is before diving into details.
