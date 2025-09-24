# Drug Page Subtitle Implementation Report

## Overview
The subtitle text that appears below drug titles on individual drug pages is a combination of two data fields separated by a middle dot (·). This report traces how the subtitle is generated and displayed.

## Data Flow

### 1. Source Data (articles.json)
The subtitle originates from two fields in the `drug_info` object for each substance:
- **`chemical_class`**: The chemical classification of the substance (e.g., "Arylcyclohexylamines", "Cathinones", "Lysergamides")
- **`psychoactive_class`**: The psychoactive classification (e.g., "Psychedelic", "Stimulant", "Dissociative, Hallucinogen")

Example from articles.json:
```json
{
  "drug_info": {
    "chemical_class": "Arylcyclohexylamines",
    "psychoactive_class": "Dissociative, Hallucinogen"
  }
}
```

### 2. Data Transformation (contentBuilder.ts)
Location: `/src/data/contentBuilder.ts:127-130`

The subtitle is constructed by:
1. Extracting both `chemical_class` and `psychoactive_class` from the raw data
2. Cleaning each string using the `cleanString()` function
3. Filtering out any empty/null values
4. Joining the remaining values with " · " (space, middle dot, space)

```typescript
subtitle: [cleanString(info.chemical_class), cleanString(info.psychoactive_class)]
  .filter((segment): segment is string => Boolean(segment))
  .join(" · ")
```

### 3. Type Definition (content.ts)
The subtitle is defined as a string property in the `SubstanceContent` interface:
```typescript
export interface SubstanceContent {
  name: string;
  subtitle: string;
  // ... other properties
}
```

### 4. Component Flow
- **App.tsx:212-213**: Passes the subtitle from content to the Hero component
  ```tsx
  <Hero
    title={content.name}
    subtitle={content.subtitle}
    // ... other props
  />
  ```

- **Hero.tsx**: Receives and displays the subtitle
  ```tsx
  interface HeroProps {
    title: string;
    subtitle: string;
    // ... other props
  }

  // Display at line ~146:
  <p className="-mt-2 text-base text-white/80 md:text-lg">{subtitle}</p>
  ```

## Examples of Generated Subtitles

Based on the data in articles.json, here are some actual subtitle examples:

- **3-MeO-PCP**: "Arylcyclohexylamines · Dissociative, Hallucinogen"
- **Methcathinone**: "Cathinones · Stimulant"
- **Trazodone**: "Triazolopyridine derivative · Antidepressant (Serotonin Antagonist and Reuptake Inhibitor, SARI)"
- **LSD**: "Lysergamides · Psychedelic"
- **Lithium**: "Alkali-metal monovalent cation (Li⁺) administered as carbonate or citrate salts · Antimanic / mood-stabiliser"

## Key Observations

1. **Separator**: The middle dot (·) is hard-coded in the contentBuilder, not configurable
2. **Fallback**: If either field is missing, only the available field is shown (no separator)
3. **Empty case**: If both fields are missing, an empty string is returned
4. **Styling**: The subtitle uses reduced opacity (white/80) and appears below the main title with negative margin
5. **Data source**: All subtitle data comes directly from articles.json - there's no hard-coded content in components

## Modification Points

To modify the subtitle behavior, you would need to:

1. **Change the data**: Edit the `chemical_class` or `psychoactive_class` fields in articles.json
2. **Change the format**: Modify the join logic in contentBuilder.ts:127-130
3. **Change the separator**: Replace " · " with a different separator in contentBuilder.ts
4. **Change the display**: Modify the styling in Hero.tsx:146

## Search Integration

The subtitle is also used in the search functionality (`search.ts`), where it's stored as the `secondary` field for substance search entries, allowing users to search by chemical or psychoactive class.