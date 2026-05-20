import path from "path";

export const DEFAULT_EFFECTS_PATH = "../EffectIndex-master/effectindex_dump/effects.json";
export const DEFAULT_REPLICATIONS_PATH = "../EffectIndex-master/effectindex_dump/replications.json";
export const BATCH_SIZE = 20;
export const GALLERY_ORDER_MAPPING_PATH = path.resolve(
  "notes-and-plans/exports/replications/gallery-order-mapping.json",
);
export const R2_CDN_BASE = "https://pub-879bfd45a9774f1c80a8b77aca1f0aee.r2.dev";

export const TAG_NORMALIZATION = {
  distortions: "distortion",
  amplifications: "amplification",
  suppressions: "suppression",
  alterations: "alteration",
  gabaergic: "gabaergic",
  GABAergic: "gabaergic",
  visual: "visual",
  auditory: "auditory",
  cognitive: "cognitive",
  physical: "physical",
  sensory: "sensory",
  tactile: "tactile",
  "smell and taste": "smell and taste",
  multisensory: "multisensory",
  geometric: "geometric",
  "hallucinatory state": "hallucinatory state",
  psychedelic: "psychedelic",
  dissociative: "dissociative",
  deliriant: "deliriant",
  depressant: "depressant",
  stimulant: "stimulant",
  "novel state": "novel state",
  "psychological state": "psychological state",
  "transpersonal state": "transpersonal state",
  uncomfortable: "uncomfortable",
  cardiovascular: "cardiovascular",
  neurological: "neurological",
};

export const LINK_REWRITES = {
  "/effects/": "/effects",
  "/summaries/psychedelics": "/psychoactive/psychedelic",
  "/summaries/dissociatives": "/psychoactive/dissociative",
  "/summaries/deliriants": "/psychoactive/deliriant",
  "/summaries/stimulants": "/psychoactive/stimulant",
  "/summaries/depressants": "/psychoactive/depressant",
  "/summaries/cannabinoids": "/psychoactive/cannabinoid",
  "/summaries/opioids": "/psychoactive/opioid",
  "/summaries/entactogens": "/psychoactive/entactogen",
  "/summaries/nootropics": "/psychoactive/nootropic",
  "/summaries/": "/psychoactive/",
  "/substances/": "/",
};
