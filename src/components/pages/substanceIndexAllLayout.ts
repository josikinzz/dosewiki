/**
 * Hand-authored column arrangement for the Substance Index "All" tab, one
 * entry per column count. Each entry lists the columns left to right; each
 * column lists category keys top to bottom.
 *
 * Editorial rules the table encodes:
 * - Top row priority: Psychedelic, Dissociative, Deliriant, Entactogen,
 *   Cannabinoid, Nootropic, then the sketchier classes.
 * - A-typical Hallucinogen never leads a column while anything else can; it
 *   sits directly under Deliriant.
 * - Below the top row, panels are placed so column heights stay close, using
 *   the rendered card heights measured on the live page (Psychedelic 4532px,
 *   Stimulant 3326, Sedative-hypnotics 3058, Opioid 1943, Entactogen 1862,
 *   Dissociative 1832, Antidepressant 612, Deliriant 583, Nootropic 480,
 *   Cannabinoid 406, A-typical Hallucinogen 338, Miscellaneous 251,
 *   Antipsychotic 148). Re-tune when a class gains or loses many entries.
 * - From five columns up, Psychedelic alone is taller than the ideal column,
 *   so the page is one Psychedelic tall whatever the arrangement.
 *
 * Column counts above the largest key reuse the largest entry; the grid drops
 * empty trailing columns. Categories missing from an entry are appended to
 * the column holding the fewest panels, so a new class still renders.
 */
export const SUBSTANCE_INDEX_ALL_COLUMN_LAYOUT: Record<number, readonly (readonly string[])[]> = {
  1: [
    [
      "psychedelic",
      "dissociative",
      "deliriant",
      "hallucinogen",
      "entactogen",
      "cannabinoid",
      "nootropic",
      "stimulant",
      "gabaergic",
      "opioid",
      "antidepressant",
      "antipsychotic",
      "miscellaneous",
    ],
  ],
  2: [
    ["psychedelic", "deliriant", "hallucinogen", "cannabinoid", "nootropic", "gabaergic", "antipsychotic"],
    ["dissociative", "entactogen", "stimulant", "opioid", "antidepressant", "miscellaneous"],
  ],
  3: [
    ["psychedelic", "cannabinoid", "nootropic", "antidepressant", "antipsychotic", "miscellaneous"],
    ["dissociative", "entactogen", "gabaergic"],
    ["deliriant", "hallucinogen", "stimulant", "opioid"],
  ],
  4: [
    ["psychedelic", "antipsychotic"],
    ["dissociative", "gabaergic"],
    ["deliriant", "hallucinogen", "stimulant", "antidepressant"],
    ["entactogen", "cannabinoid", "nootropic", "opioid", "miscellaneous"],
  ],
  5: [
    ["psychedelic"],
    ["dissociative", "opioid"],
    ["deliriant", "hallucinogen", "gabaergic"],
    ["entactogen", "nootropic", "antidepressant", "antipsychotic", "miscellaneous"],
    ["cannabinoid", "stimulant"],
  ],
  6: [
    ["psychedelic"],
    ["dissociative", "opioid"],
    ["deliriant", "hallucinogen", "antidepressant", "antipsychotic", "miscellaneous"],
    ["entactogen"],
    ["cannabinoid", "stimulant"],
    ["nootropic", "gabaergic"],
  ],
  7: [
    ["psychedelic"],
    ["dissociative"],
    ["deliriant", "hallucinogen", "antidepressant", "antipsychotic", "miscellaneous"],
    ["entactogen"],
    ["cannabinoid", "gabaergic"],
    ["nootropic", "opioid"],
    ["stimulant"],
  ],
  8: [
    ["psychedelic"],
    ["dissociative"],
    ["deliriant", "hallucinogen", "miscellaneous"],
    ["entactogen"],
    ["cannabinoid", "opioid"],
    ["nootropic", "antidepressant", "antipsychotic"],
    ["stimulant"],
    ["gabaergic"],
  ],
  9: [
    ["psychedelic"],
    ["dissociative"],
    ["deliriant", "hallucinogen"],
    ["entactogen"],
    ["cannabinoid", "antidepressant"],
    ["nootropic", "miscellaneous", "antipsychotic"],
    ["stimulant"],
    ["gabaergic"],
    ["opioid"],
  ],
  10: [
    ["psychedelic"],
    ["dissociative"],
    ["deliriant", "hallucinogen"],
    ["entactogen"],
    ["cannabinoid", "miscellaneous"],
    ["nootropic", "antipsychotic"],
    ["stimulant"],
    ["gabaergic"],
    ["opioid"],
    ["antidepressant"],
  ],
  11: [
    ["psychedelic"],
    ["dissociative"],
    ["deliriant", "hallucinogen"],
    ["entactogen"],
    ["cannabinoid"],
    ["nootropic"],
    ["stimulant"],
    ["gabaergic"],
    ["opioid"],
    ["antidepressant"],
    ["antipsychotic", "miscellaneous"],
  ],
  12: [
    ["psychedelic"],
    ["dissociative"],
    ["deliriant", "hallucinogen"],
    ["entactogen"],
    ["cannabinoid"],
    ["nootropic"],
    ["stimulant"],
    ["gabaergic"],
    ["opioid"],
    ["antidepressant"],
    ["antipsychotic"],
    ["miscellaneous"],
  ],
  13: [
    ["psychedelic"],
    ["dissociative"],
    ["deliriant"],
    ["hallucinogen"],
    ["entactogen"],
    ["cannabinoid"],
    ["nootropic"],
    ["stimulant"],
    ["gabaergic"],
    ["opioid"],
    ["antidepressant"],
    ["antipsychotic"],
    ["miscellaneous"],
  ],
};
