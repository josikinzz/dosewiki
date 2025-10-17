# Substance Article JSON Guide for LLM Assistants

This guide briefs you on how to turn a PsychonautWiki profile and/or a TripSit factsheet for a single substance into the JSON structure used by `src/data/articles.json`. The model should assume **no access to the codebase** and rely only on the supplied source article/s.

## Workflow Overview
1. **Read both sources completely.** Flag conflicting numbers or terminology before drafting.
2. **Create a working note of raw facts** grouped by theme (identity, chemistry, pharmacology, dosages, timeline, interactions, risks, subjective effects, harm reduction, citations).
3. **Resolve discrepancies.** Prefer values that are shared between both sources; if only one source mentions a value, use it and capture the dissenting citation in the notes.
4. **Normalize units and language** to match this project’s conventions (ASCII text, lower-case tags, semicolon-delimited index categories).
5. **Populate the JSON fields** following the reference below; do not introduce additional keys.
6. **Run a self-check** against the validation checklist before handing the JSON back.

## Field Reference
All fields live inside a top-level object with the shape `{ "id": number | null, "title": string, "drug_info": { ... }, "index-category": string }`.

- **`id`**: Integer ID from TripSit if available; otherwise use `null` and leave ID assignment to maintainers.
- **`title`**: Primary display name (match the TripSit entry title unless PsychonautWiki provides a more canonical proper noun).

Inside `drug_info`:

- **`drug_name`**: Same as `title` unless the community name (TripSit header) differs from the formal title.
- **`chemical_name`**: IUPAC or formal chemical name (usually in PsychonautWiki intro). If multiple exist, choose the most widely used and spell it out fully.
- **`alternative_name`**: Semicolon-separated string of the most common slang or shorthand (e.g., `"Lucy; Acid"`). Include at least one alias from each source when present.
- **`chemical_class`**: Pharmacological chemical family. Use singular sentence case (`"Lysergamides"`, `"Phenethylamines"`). If multiple families are listed, join with `; `.
- **`psychoactive_class`**: High-level psychoactive grouping(s) such as `"Psychedelic"`, `"Dissociative"`, `"Stimulant"`. Combine multiple with `; ` in order of prominence.
- **`mechanism_of_action`**: Concise summary of primary receptor / transporter activity. Use semicolons to separate mechanisms, and add qualifiers in parentheses if necessary (e.g., `"5-HT2A receptor agonist; dopamine D2 partial agonist (weak)"`). If the mechanism is not described, set to an empty string.
- **`dosages`**: Object with `routes_of_administration`, an array of route blocks sorted by most common administration.
  - Each block needs `route` (as written in the source, lowercase), `units` (use ASCII values: `mg`, `ug`, `ml`, etc.), and a `dose_ranges` object with string values for `threshold`, `light`, `common`, `strong`, `heavy`.
  - Convert ranges to use hyphenated spans (`"10-20 mg"`) or `"10+ mg"` for open-ended values. Include parentheses for footnotes only if the source highlights critical conditions (e.g., `"5-10 mg (with MAOI)"`).
  - Only include routes that both sources agree on, unless one source is authoritative for that route (TripSit often lists more ROAs—use them if PsychonautWiki is silent but not contradictory).
- **`duration`**: Prefer per-route timing. Structure with `routes_of_administration`, mirroring the dosage route order. Each route block should include optional `canonical_routes` (TripSit canonical key such as `"oral"`, `"insufflated"`) and `stages` with `total_duration`, `onset`, `peak`, `offset`, and `after_effects` strings. Use ranges like `"2-4 hours"`; specify residual effects in parentheses.
  - If only a general timeline is known, set `routes_of_administration` to an array with one entry where `route` is `"general"` and leave `canonical_routes` empty.
- **`addiction_potential`**: One or two sentences summarising dependence risk and noted problematic patterns (compulsive redosing, cravings, etc.). Mention when evidence is limited.
- **`interactions`**: Object with severity buckets: `dangerous`, `unsafe`, `caution`. Populate each with arrays of succinct combo labels (e.g., `"MAOIs (hypertensive risk)"`). Use TripSit combination chart as the primary source; include PsychonautWiki warnings if TripSit is silent.
- **`notes`**: Paragraph-style harm reduction summary (2-4 sentences). Cover legal status highlights, medical contraindications, and unique preparation tips (accurate weighing, mental health screening, set/setting).
- **`subjective_effects`**: Array of Title Case bullet points covering commonly reported effects. Cross-reference `Subjective Effects` sections and TripSit descriptions; avoid duplicates and keep to 5-12 items.
- **`tolerance`**: Object with `full_tolerance`, `half_tolerance`, `zero_tolerance` as strings describing timelines. Use qualitative ranges (e.g., `"After 3-4 consecutive days"`, `"1-2 weeks"`). `cross_tolerances` is an array of strings naming related classes or drugs.
- **`half_life`**: Provide numeric range with units (e.g., `"3-5 hours"`, `"20-40 minutes (active metabolite)"`). If unknown, set to an empty string.
- **`citations`**: Array where each entry is `{ "name": string, "reference": string }`. Always include at least the TripSit factsheet URL and the PsychonautWiki page. Add any additional authoritative references you used (academic sources, Erowid, etc.). Use descriptive names like `"TripSit 2C-B Factsheet"` rather than raw URLs.
- **`categories`**: Lowercase tags describing classification, ordered from most specific to general (e.g., `"psychedelic"`, `"classic-psychedelic"`, `"research-chemical"`). Derive from the sources’ chemical or legal descriptors. Keep 2-4 tags.

Top-level `index-category`:

- Store semicolon-delimited search tags for the site index (e.g., `"psychedelic;classic"`). Include `hidden` (all lowercase) if the article should be withheld from public listings. Leave as an empty string when no index tags are required.

## Normalization Rules
- Use ASCII characters only (`ug` instead of `µg`, straight quotes, hyphen-minus).
- Trim leading/trailing whitespace on every string.
- Capitalize only proper nouns and the first word of sentences; keep arrays of effects in Title Case.
- Maintain consistent ordering: alphabetical for `citations`, logical severity (dangerous → unsafe → caution) inside `interactions`, most common route first in dosage/duration.
- If a value is genuinely unknown, set it to an empty string (`""`) or empty array `[]` rather than fabricating data.

## Validation Checklist
- [ ] Each required key is present and spelled exactly as in the template.
- [ ] Dose and duration units match TripSit guidance and use ASCII unit labels.
- [ ] Interactions include at least one entry for every risk flagged in TripSit.
- [ ] Citations link every numeric value or strong claim that is not common knowledge.
- [ ] Arrays contain no duplicate strings and are sorted logically.
- [ ] `index-category` terms are lowercase and separated by semicolons with no trailing delimiter.

## Empty JSON Template
```json
{
  "id": null,
  "title": "",
  "drug_info": {
    "drug_name": "",
    "chemical_name": "",
    "alternative_name": "",
    "chemical_class": "",
    "mechanism_of_action": "",
    "psychoactive_class": "",
    "dosages": {
      "routes_of_administration": [
        {
          "route": "",
          "units": "mg",
          "dose_ranges": {
            "threshold": "",
            "light": "",
            "common": "",
            "strong": "",
            "heavy": ""
          }
        }
      ]
    },
    "duration": {
      "routes_of_administration": [
        {
          "route": "",
          "canonical_routes": [
            ""
          ],
          "stages": {
            "total_duration": "",
            "onset": "",
            "peak": "",
            "offset": "",
            "after_effects": ""
          }
        }
      ]
    },
    "addiction_potential": "",
    "interactions": {
      "dangerous": [],
      "unsafe": [],
      "caution": []
    },
    "notes": "",
    "subjective_effects": [],
    "tolerance": {
      "full_tolerance": "",
      "half_tolerance": "",
      "zero_tolerance": "",
      "cross_tolerances": []
    },
    "half_life": "",
    "citations": [],
    "categories": []
  },
  "index-category": ""
}
```

## Example JSON Entry
```json
{
  "id": null,
  "title": "Psilocybin Mushrooms",
  "drug_info": {
    "drug_name": "Psilocybin Mushrooms",
    "chemical_name": "4-Phosphoryloxy-N,N-dimethyltryptamine",
    "alternative_name": "Magic Mushrooms; Shrooms",
    "chemical_class": "Tryptamines",
    "mechanism_of_action": "5-HT2A receptor agonist; 5-HT2C receptor agonist",
    "psychoactive_class": "Psychedelic",
    "dosages": {
      "routes_of_administration": [
        {
          "route": "oral",
          "units": "g",
          "dose_ranges": {
            "threshold": "0.1-0.5 g",
            "light": "0.5-1.5 g",
            "common": "1.5-3.5 g",
            "strong": "3.5-5 g",
            "heavy": "5+ g"
          }
        },
        {
          "route": "lemon tek",
          "units": "g",
          "dose_ranges": {
            "threshold": "0.5 g",
            "light": "0.5-1.2 g",
            "common": "1.2-2.5 g",
            "strong": "2.5-4 g",
            "heavy": "4+ g"
          }
        }
      ]
    },
    "duration": {
      "routes_of_administration": [
        {
          "route": "oral",
          "canonical_routes": [
            "oral"
          ],
          "stages": {
            "total_duration": "4-7 hours",
            "onset": "20-60 minutes",
            "peak": "90-180 minutes",
            "offset": "2-4 hours",
            "after_effects": "Up to 12 hours (afterglow)"
          }
        },
        {
          "route": "lemon tek",
          "canonical_routes": [
            "oral"
          ],
          "stages": {
            "total_duration": "4-6 hours",
            "onset": "10-30 minutes",
            "peak": "60-150 minutes",
            "offset": "2-3 hours",
            "after_effects": "Up to 12 hours (afterglow)"
          }
        }
      ]
    },
    "addiction_potential": "Psilocybin mushrooms are not considered physically addictive and have a low potential for psychological dependence. Rapid tolerance discourages frequent redosing.",
    "interactions": {
      "dangerous": [
        "MAOIs (risk of hypertensive crisis)",
        "Lithium (seizure risk)"
      ],
      "unsafe": [
        "Tramadol (lowers seizure threshold)",
        "Other psychedelics (overwhelming intensity)"
      ],
      "caution": [
        "SSRIs (may blunt or prolong effects)",
        "Benzodiazepines (may dampen experience)"
      ]
    },
    "notes": "Psilocybin mushrooms vary widely in potency by species and individual specimen; weigh dried material on a precise scale. Set and setting strongly influence the experience, and individuals with personal or family histories of psychotic disorders should avoid use. Prepare for nausea during the come-up and have a trusted sober sitter for challenging sessions.",
    "subjective_effects": [
      "Visual patterning",
      "Enhanced mood",
      "Time distortion",
      "Emotional amplification",
      "Spiritual insight",
      "Nausea",
      "Anxiety",
      "Synesthesia"
    ],
    "tolerance": {
      "full_tolerance": "After 2 consecutive days of use",
      "half_tolerance": "4-7 days",
      "zero_tolerance": "2 weeks",
      "cross_tolerances": [
        "Other psychedelics (e.g., LSD, mescaline)"
      ]
    },
    "half_life": "1-3 hours (psilocin active metabolite)",
    "citations": [
      {
        "name": "PsychonautWiki: Psilocybin",
        "reference": "https://psychonautwiki.org/wiki/Psilocybin"
      },
      {
        "name": "TripSit Psilocybin Mushrooms Factsheet",
        "reference": "https://tripsit.me/factsheet/psilocybin-mushrooms"
      },
      {
        "name": "Erowid Psilocybin Mushroom Vault",
        "reference": "https://erowid.org/plants/mushrooms/"
      }
    ],
    "categories": [
      "psychedelic",
      "classic-psychedelic",
      "plant-based"
    ]
  },
  "index-category": "psychedelic;classic"
}
```

NOTE: to fill out the citations, please use your websearch tool to find available tripsit, erowid, bluelight, isomerdesign, and drugsforum links where available.