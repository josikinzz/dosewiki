/**
 * Effect-name aliases for substance-article subjective-effect chips.
 *
 * A substance article stores each effect as `{name, description}` with no stored
 * href — the chip's URL is derived from the display name via `slugify`. Years of
 * terminology drift between PsychonautWiki's names and the Effect Index's names
 * therefore produce dead links rather than wrong data: 1,437 of 5,329 chip
 * occurrences (27%) resolved to a 404 before this table existed.
 *
 * Fixing resolution here rather than rewriting article content is deliberate:
 *  - it changes where a chip points without changing what it displays;
 *  - `saveSubstance` patches a whole-article snapshot, so a 577-article name pass
 *    would risk clobbering concurrent editor writes;
 *  - authored content and its attribution stay untouched.
 *
 * Every destination in this file was verified against the live 233-effect
 * inventory when the table was built, and `effectNameAliases.test.ts` re-asserts
 * that no alias source shadows a real effect slug. See the 2026-07-29 link audit
 * for the census and the per-name adjudication.
 */

/** Where a chip sits in a substance article's subjective-effects tree. */
export type EffectLocation = "cognitive" | "physical" | `sensory.${string}`;

/**
 * Names whose correct target depends on where the chip sits. "Euphoria" is the
 * single most common broken chip on the site (150 occurrences) and resolves to
 * cognitive or physical euphoria purely by position; the auditory entries are
 * PsychonautWiki subsection headings ingested as effect entries.
 */
const LOCATION_SCOPED_ALIASES: Record<string, Record<string, string>> = {
  cognitive: {
    euphoria: "cognitive-euphoria",
    hallucinations: "category:hallucinatory-states",
  },
  physical: {
    euphoria: "physical-euphoria",
  },
  "sensory.auditory": {
    distortion: "auditory-distortion",
    distortions: "auditory-distortion",
    enhancement: "auditory-enhancement",
    enhancements: "auditory-enhancement",
    hallucinations: "auditory-hallucination",
    suppression: "auditory-suppression",
  },
  "sensory.visual": {
    hallucinations: "category:hallucinatory-states",
  },
  "sensory.multisensory": {
    hallucinations: "category:hallucinatory-states",
  },
};

/**
 * Location-independent aliases. Keyed by `slugify(name)`.
 *
 * The first six also exist as `effectIndexLegacyRedirects` entries, which stay in
 * place for inbound links from the old site. Aliasing them here as well resolves
 * the chip in-page instead of spending an HTTP redirect on every click.
 */
const EFFECT_NAME_ALIASES: Record<string, string> = {
  "acuity-suppression": "visual-acuity-suppression",
  "autonomous-entities": "autonomous-entity",
  "emotion-enhancement": "emotion-intensification",
  "external-hallucinations": "external-hallucination",
  "internal-hallucinations": "internal-hallucination",
  "spontaneous-bodily-sensations": "spontaneous-tactile-sensations",
  "acceleration-of-thought": "thought-acceleration",
  "acuity-enhancement": "visual-acuity-enhancement",
  analgesia: "pain-relief",
  anxiolysis: "anxiety-suppression",
  "appetite-stimulation": "appetite-enhancement",
  ataxia: "motor-control-loss",
  "auditory-distortions": "auditory-distortion",
  "auditory-enhancements": "auditory-enhancement",
  "auditory-hallucinations": "auditory-hallucination",
  "balance-disturbances": "dizziness",
  "blurred-vision": "visual-acuity-suppression",
  "body-tremors": "muscle-twitching",
  bruxism: "teeth-grinding",
  "cardiac-arrhythmia": "abnormal-heartbeat",
  "changes-in-gravity": "changes-in-felt-gravity",
  "color-enhancement": "colour-enhancement",
  "color-shifting": "colour-shifting",
  "connectivity-of-thought": "thought-connectivity",
  "consciousness-disconnection": "cognitive-disconnection",
  "current-mind-state-enhancement": "emotion-intensification",
  "d-j-vu": "deja-vu",
  "decreased-bodily-weight": "perception-of-bodily-lightness",
  "decreased-visual-acuity": "visual-acuity-suppression",
  "delineation-of-thought": "thought-organization",
  delusions: "delusion",
  "delusions-of-sobriety": "delusion",
  "direct-communication-with-the-subconscious": "autonomous-voice-communication",
  "disconnection-from-consciousness": "cognitive-disconnection",
  "disconnection-from-tactile-input": "physical-disconnection",
  dissociation: "category:disconnective-effects",
  "ego-dissolution": "ego-death",
  "ego-suppression-loss-and-death": "ego-death",
  "emotionality-suppression": "emotion-suppression",
  "empathy-enhancement": "empathy-affection-and-sociability-enhancement",
  "empathy-love-and-sociability-enhancement": "empathy-affection-and-sociability-enhancement",
  "enhanced-pattern-recognition": "increased-pareidolia",
  "enhancement-of-colour": "colour-enhancement",
  "enhancement-of-colours": "colour-enhancement",
  "enhancement-of-current-mind-state": "emotion-intensification",
  "enhancement-of-tactile-sensations": "tactile-enhancement",
  "enhancement-of-touch": "tactile-enhancement",
  "excessive-excitation": "stimulation",
  "excessive-sweating": "increased-perspiration",
  "exposure-to-inner-mechanics-of-consciousness": "visual-exposure-to-inner-mechanics-of-consciousness",
  "extreme-laughter": "laughter-fits",
  fatigue: "physical-fatigue",
  "feelings-of-fascination-importance-and-awe": "novelty-enhancement",
  "feelings-of-interdependent-opposites": "perception-of-interdependent-opposites",
  "feelings-of-predeterminism": "perception-of-predeterminism",
  "feelings-of-self-design": "perception-of-self-design",
  "gastrointestinal-disturbance": "nausea",
  "gravity-alterations": "changes-in-felt-gravity",
  headaches: "headache",
  hypersalivation: "increased-salivation",
  hypervigilance: "focus-enhancement",
  hypotension: "decreased-blood-pressure",
  "increased-bodily-control": "bodily-control-enhancement",
  "increased-bodily-weight": "perception-of-bodily-heaviness",
  "increased-empathy-love-and-sociability": "empathy-affection-and-sociability-enhancement",
  "increased-sociability": "empathy-affection-and-sociability-enhancement",
  "increased-visual-acuity": "visual-acuity-enhancement",
  "information-processing-suppression": "analysis-suppression",
  insomnia: "stimulation",
  "involuntary-bodily-movements": "spontaneous-physical-movements",
  laughter: "laughter-fits",
  "loss-of-motor-control": "motor-control-loss",
  "loss-of-temperature-regulation": "temperature-regulation-suppression",
  "mood-enhancement": "emotion-intensification",
  "mood-lift": "cognitive-euphoria",
  "muscle-cramps": "muscle-cramp",
  "muscle-pain": "muscle-cramp",
  "muscle-spasms": "muscle-twitching",
  "muscle-tremor": "muscle-twitching",
  "muscle-tremors": "muscle-twitching",
  "muscle-weakness": "muscle-relaxation",
  "nausea-la-purga": "nausea",
  nystagmus: "vibrating-vision",
  outrospection: "introspection",
  "pattern-recognition-enhancement": "increased-pareidolia",
  "pattern-recognition-suppression": "visual-agnosia",
  "perception-of-decreased-weight": "perception-of-bodily-lightness",
  "perception-of-increased-weight": "perception-of-bodily-heaviness",
  "peripheral-information-prediction": "peripheral-information-misinterpretation",
  "perspective-distortions": "perspective-distortion",
  perspiration: "increased-perspiration",
  "psychomotor-agitation": "spontaneous-physical-movements",
  relaxation: "muscle-relaxation",
  "removal-of-cultural-filter": "personal-bias-suppression",
  "restless-leg-syndrome": "restless-legs",
  restlessness: "restless-legs",
  salivation: "increased-salivation",
  "sensory-disconnection": "physical-disconnection",
  "sexual-arousal": "increased-libido",
  "sexual-dysfunction": "temporary-erectile-dysfunction",
  "simultaneous-emotions": "mixed-emotions",
  "size-distortions": "magnification",
  "sleepiness-suppression": "wakefulness",
  "sociability-enhancement": "empathy-affection-and-sociability-enhancement",
  "states-of-unity-and-interconnectedness": "unity-and-interconnectedness",
  "stomach-cramps": "stomach-cramp",
  "stomach-discomfort": "stomach-cramp",
  "subconscious-communication": "autonomous-voice-communication",
  "sublingual-numbing": "mouth-numbing",
  "sublingual-numbness": "mouth-numbing",
  "suggestibility-enhancement": "increased-suggestibility",
  "suppression-of-language": "language-suppression",
  "suppression-of-pattern-recognition": "visual-agnosia",
  "suppression-of-touch": "tactile-suppression",
  "tactile-disconnection": "physical-disconnection",
  "tactile-hallucinations": "tactile-hallucination",
  "temperature-regulation-loss": "temperature-regulation-suppression",
  "texture-repetition": "symmetrical-texture-repetition",
  tremor: "muscle-twitching",
  tremors: "muscle-twitching",
  "urinary-retention": "difficulty-urinating",
  "visual-acuity-enhancement-and-suppression": "enhancement-and-suppression-cycles",
  "visual-distortions": "category:visual-distortions",
  "visual-drifting": "drifting",
  "visual-sliding": "optical-sliding",
};

/**
 * Names with no destination: effects the index never documented, effects since
 * removed (Environmental Orbism), and editor shorthand naming two effects at once
 * ("Stimulation and sedation"), where linking either half silently drops the other.
 * These render as plain chips rather than links.
 */
const UNLINKED_EFFECT_NAMES: ReadonlySet<string> = new Set([
  "3-dimensional-textures",
  "anxiety-and-anxiety-suppression",
  "anxiety-or-anxiety-suppression",
  "bodily-control-enhancement-and-motor-control-loss",
  "chest-discomfort",
  "decreased-body-temperature",
  "difficulty-urinating-and-frequent-urination",
  "environmental-orbism",
  "hiccups",
  "increased-bodily-weight-or-decreased-bodily-weight",
  "libido-alteration",
  "perception-alteration",
  "perception-of-increased-weight-or-perception-of-decreased-weight",
  "sleep-disruption",
  "slurred-speech",
  "stimulation-and-or-sedation",
  "stimulation-and-sedation",
  "thought-acceleration-or-thought-deceleration",
  "vasoconstriction-and-vasodilation",
]);

export const EFFECT_NAME_ALIAS_COUNT =
  Object.keys(EFFECT_NAME_ALIASES).length +
  Object.values(LOCATION_SCOPED_ALIASES).reduce((total, map) => total + Object.keys(map).length, 0);

export const effectNameAliasTables = {
  locationScoped: LOCATION_SCOPED_ALIASES,
  global: EFFECT_NAME_ALIASES,
  unlinked: UNLINKED_EFFECT_NAMES,
} as const;

/**
 * Resolves a chip's alias target, or null when the name is deliberately unlinked.
 * Returns undefined when the name is not in any table, meaning the caller should
 * fall back to its normal `/effects/${slug}` derivation.
 *
 * A `category:` destination is an umbrella term — "Dissociation" names a family
 * rather than one effect — and resolves to the category index. Both category
 * targets in use were checked for non-emptiness; an empty category page is a
 * worse destination than no link at all.
 */
export function resolveEffectNameAlias(
  nameSlug: string,
  location?: EffectLocation,
): string | null | undefined {
  if (UNLINKED_EFFECT_NAMES.has(nameSlug)) {
    return null;
  }

  const scoped = location ? LOCATION_SCOPED_ALIASES[location]?.[nameSlug] : undefined;
  const target = scoped ?? EFFECT_NAME_ALIASES[nameSlug];

  if (target) {
    return target.startsWith("category:")
      ? `/effects/category/${target.slice("category:".length)}`
      : `/effects/${target}`;
  }

  // A name that is location-scoped elsewhere ("Hallucinations" under a sense we
  // have not mapped) has no safe fallback: deriving `/effects/hallucinations`
  // from it produces exactly the 404 this table exists to prevent.
  return isLocationScopedName(nameSlug) ? null : undefined;
}

function isLocationScopedName(nameSlug: string) {
  return Object.values(LOCATION_SCOPED_ALIASES).some((map) => nameSlug in map);
}
