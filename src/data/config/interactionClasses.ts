/**
 * Describes canonical interaction class keywords used when normalizing interaction targets.
 * Each entry provides a unique key, a display label, and a set of matcher strings that will be
 * slugified before comparison against interaction entries.
 */
export interface InteractionClassDefinition {
  key: string;
  label: string;
  matchers: string[];
}

export const INTERACTION_CLASSES: InteractionClassDefinition[] = [
  {
    key: "maoi",
    label: "MAOI",
    matchers: [
      "maoi",
      "maois",
      "monoamine oxidase inhibitor",
      "monoamine oxidase inhibitors",
      "maoi medication",
    ],
  },
  {
    key: "ssri",
    label: "SSRI",
    matchers: ["ssri", "ssris", "selective serotonin reuptake inhibitor"],
  },
  {
    key: "snri",
    label: "SNRI",
    matchers: ["snri", "snris", "serotonin norepinephrine reuptake inhibitor"],
  },
  {
    key: "benzodiazepine",
    label: "Benzodiazepine",
    matchers: ["benzodiazepine", "benzodiazepines", "benzo"],
  },
  {
    key: "opioid",
    label: "Opioid",
    matchers: ["opioid", "opioids", "opiates", "opiate"],
  },
  {
    key: "stimulant",
    label: "Stimulant",
    matchers: ["stimulant", "stimulants", "uppers"],
  },
  {
    key: "depressant",
    label: "CNS Depressant",
    matchers: [
      "cns depressant",
      "cns depressants",
      "depressant",
      "depressants",
      "downers",
    ],
  },
  {
    key: "antipsychotic",
    label: "Antipsychotic",
    matchers: ["antipsychotic", "antipsychotics"],
  },
  {
    key: "antidepressant",
    label: "Antidepressant",
    matchers: ["antidepressant", "antidepressants"],
  },
  {
    key: "alcohol",
    label: "Alcohol",
    matchers: ["alcohol", "ethanol"],
  },
  {
    key: "cannabis",
    label: "Cannabis",
    matchers: ["cannabis", "weed", "marijuana", "thc"],
  },
  {
    key: "dissociative",
    label: "Dissociative",
    matchers: ["dissociative", "dissociatives"],
  },
  {
    key: "psychedelic",
    label: "Psychedelic",
    matchers: ["psychedelic", "psychedelics"],
  },
  {
    key: "serotonergic",
    label: "Serotonergic Agent",
    matchers: ["serotonergic", "serotonergic agent", "serotonergic drugs"],
  },
  {
    key: "antihistamine",
    label: "Antihistamine",
    matchers: [
      "antihistamine",
      "antihistamines",
      "h1 antihistamine",
      "h1 blockers",
      "first-generation antihistamines",
    ],
  },
  {
    key: "antihypertensive",
    label: "Antihypertensive",
    matchers: [
      "antihypertensive",
      "antihypertensives",
      "ace inhibitor",
      "ace inhibitors",
      "arb",
      "arbs",
      "angiotensin receptor blocker",
      "angiotensin receptor blockers",
    ],
  },
  {
    key: "anticonvulsant",
    label: "Anticonvulsant",
    matchers: ["anticonvulsant", "anticonvulsants", "antiepileptic", "antiepileptics"],
  },
  {
    key: "anticoagulant",
    label: "Anticoagulant",
    matchers: ["anticoagulant", "anticoagulants", "blood thinner", "blood thinners"],
  },
  {
    key: "muscle-relaxant",
    label: "Muscle Relaxant",
    matchers: ["muscle relaxant", "muscle relaxants", "skeletal muscle relaxant"],
  },
  {
    key: "caffeine",
    label: "Caffeine",
    matchers: ["caffeine", "coffee", "energy drink"],
  },
  {
    key: "nicotine",
    label: "Nicotine",
    matchers: ["nicotine", "tobacco", "cigarettes", "vaping"],
  },
  {
    key: "amphetamine",
    label: "Amphetamine",
    matchers: ["amphetamine", "amphetamines", "adderall", "vyvanse"],
  },
];
