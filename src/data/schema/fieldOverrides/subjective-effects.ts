import { arrayTransformer } from "../transformers";

import { defineFieldOverrides } from "./shared";

export const subjectiveEffectsFieldOverrides = defineFieldOverrides({
  "subjective_effects.notes.overview": {
    label: "Effects Overview",
    type: "textarea",
    required: false,
    section: "subjective_effects",
  },
  "subjective_effects.notes.sensory": {
    label: "Sensory Notes",
    type: "textarea",
    required: false,
    section: "subjective_effects",
  },
  "subjective_effects.notes.cognitive": {
    label: "Cognitive Notes",
    type: "textarea",
    required: false,
    section: "subjective_effects",
  },
  "subjective_effects.notes.physical": {
    label: "Physical Notes",
    type: "textarea",
    required: false,
    section: "subjective_effects",
  },
  "subjective_effects.sensory.visual": {
    label: "Visual Effects",
    type: "tagArray",
    required: false,
    section: "subjective_effects",
    transformer: arrayTransformer,
  },
  "subjective_effects.sensory.auditory": {
    label: "Auditory Effects",
    type: "tagArray",
    required: false,
    section: "subjective_effects",
    transformer: arrayTransformer,
  },
  "subjective_effects.sensory.tactile": {
    label: "Tactile Effects",
    type: "tagArray",
    required: false,
    section: "subjective_effects",
    transformer: arrayTransformer,
  },
  "subjective_effects.sensory.olfactory": {
    label: "Olfactory Effects",
    type: "tagArray",
    required: false,
    section: "subjective_effects",
    transformer: arrayTransformer,
  },
  "subjective_effects.sensory.gustatory": {
    label: "Gustatory Effects",
    type: "tagArray",
    required: false,
    section: "subjective_effects",
    transformer: arrayTransformer,
  },
  "subjective_effects.sensory.multisensory": {
    label: "Multisensory Effects",
    type: "tagArray",
    required: false,
    section: "subjective_effects",
    transformer: arrayTransformer,
  },
  "subjective_effects.cognitive": {
    label: "Cognitive Effects",
    type: "tagArray",
    required: false,
    section: "subjective_effects",
    transformer: arrayTransformer,
  },
  "subjective_effects.physical": {
    label: "Physical Effects",
    type: "tagArray",
    required: false,
    section: "subjective_effects",
    transformer: arrayTransformer,
  },
  comparisons: {
    label: "Comparisons",
    type: "object",
    required: false,
    section: "subjective_effects",
    description: "Comparisons to other substances",
  },
});
