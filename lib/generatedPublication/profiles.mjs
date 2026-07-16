export const GENERATED_PUBLICATION_PROFILE_FIELDS = Object.freeze({
  summary: Object.freeze(["summary"]),
  dosage_duration: Object.freeze(["dosage", "duration"]),
  subjective_effects: Object.freeze(["subjective_effects", "comparisons"]),
  pharmacology: Object.freeze(["pharmacology", "dosage", "duration"]),
  interactions: Object.freeze(["interactions"]),
  tolerance: Object.freeze(["tolerance"]),
  harm_potential: Object.freeze(["harm_potential"]),
  history_culture: Object.freeze(["history_culture"]),
  legality: Object.freeze(["legality"]),
});

export function publicationFieldsForProfile(profile) {
  const fields = GENERATED_PUBLICATION_PROFILE_FIELDS[profile];
  if (!fields) {
    throw new Error(`Unknown generated publication profile: ${profile}`);
  }
  return fields;
}
