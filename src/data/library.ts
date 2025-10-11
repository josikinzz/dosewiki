import { Cog, Hexagon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import articles from "./articles.json";
import { buildSubstanceRecord, type SubstanceRecord } from "./contentBuilder";
import { slugify } from "../utils/slug";
import { getCategoryIcon } from "./categoryIcons";

export interface DrugListEntry {
  name: string;
  slug: string;
  alias?: string;
}

export interface CategoryDefinition {
  key: string;
  name: string;
  icon: LucideIcon;
  aliases?: string[];
  match: (tags: Set<string>) => boolean;
  fallback?: boolean;
}

export interface DosageCategoryGroup {
  key: string;
  name: string;
  icon: LucideIcon;
  total: number;
  drugs: DrugListEntry[];
  sections?: CategoryDetailGroup[];
}

export interface CategoryDetailGroup {
  name: string;
  drugs: DrugListEntry[];
}

export interface CategoryDetail {
  definition: CategoryDefinition;
  total: number;
  groups: CategoryDetailGroup[];
}

export interface EffectSummary {
  name: string;
  slug: string;
  total: number;
}

export interface EffectDetail {
  definition: EffectSummary;
  groups: DosageCategoryGroup[];
}

export interface MechanismSummary {
  name: string;
  slug: string;
  total: number;
}

export interface MechanismDetail {
  definition: MechanismSummary;
  qualifiers: MechanismQualifierDetail[];
  defaultQualifierKey: string;
}

export interface MechanismQualifierDetail {
  key: string;
  label: string;
  qualifier?: string;
  total: number;
  groups: DosageCategoryGroup[];
}

export const UNQUALIFIED_MECHANISM_QUALIFIER_KEY = "unqualified";

export const substanceRecords: SubstanceRecord[] = articles
  .map((article) => buildSubstanceRecord(article))
  .filter((record): record is SubstanceRecord => record !== null);

export const substanceBySlug = new Map<string, SubstanceRecord>(
  substanceRecords.map((record) => [record.slug, record]),
);

const normalizeKey = (value: string): string => slugify(value);

const hasTag = (tags: Set<string>, ...candidates: string[]) =>
  candidates.some((candidate) => tags.has(normalizeKey(candidate)));

const formatAlias = (record: SubstanceRecord): string | undefined => {
  const aliases = record.aliases ?? [];
  if (aliases.length === 0) {
    return undefined;
  }

  return aliases.join(" · ");
};

const createDrugEntry = (record: SubstanceRecord): DrugListEntry => ({
  name: record.name,
  slug: record.slug,
  alias: formatAlias(record),
});

const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  {
    key: "psychedelic",
    name: "Psychedelic",
    icon: getCategoryIcon("psychedelic"),
    aliases: ["psychedelics"],
    match: (tags) => hasTag(tags, "psychedelic"),
  },
  {
    key: "dissociative",
    name: "Dissociative",
    icon: getCategoryIcon("dissociative"),
    aliases: ["dissociatives"],
    match: (tags) => hasTag(tags, "dissociative"),
  },
  {
    key: "deliriant",
    name: "Deliriant",
    icon: getCategoryIcon("deliriant"),
    aliases: ["deliriants"],
    match: (tags) => hasTag(tags, "deliriant"),
  },
  {
    key: "hallucinogen",
    name: "A-typical Hallucinogen",
    icon: getCategoryIcon("hallucinogen"),
    aliases: [
      "hallucinogens",
      "a-typical hallucinogen",
      "a-typical hallucinogens",
      "atypical hallucinogen",
      "atypical hallucinogens",
    ],
    match: (tags) => hasTag(tags, "a-typical hallucinogen"),
  },
  {
    key: "stimulant",
    name: "Stimulant",
    icon: getCategoryIcon("stimulant"),
    aliases: ["stimulants"],
    match: (tags) => hasTag(tags, "stimulant", "anorectic"),
  },
  {
    key: "entactogen",
    name: "Entactogen",
    icon: getCategoryIcon("entactogen"),
    aliases: ["entactogens", "empathogen", "empathogens"],
    match: (tags) => hasTag(tags, "entactogen", "empathogen"),
  },
  {
    key: "opioid",
    name: "Opioid",
    icon: getCategoryIcon("opioid"),
    aliases: ["opioids"],
    match: (tags) => hasTag(tags, "opioid"),
  },
  {
    key: "gabaergic",
    name: "GABAergic",
    icon: getCategoryIcon("gabaergic"),
    aliases: ["gabaergics"],
    match: (tags) => hasTag(tags, "gabaergic"),
  },
  {
    key: "cannabinoid",
    name: "Cannabinoid",
    icon: getCategoryIcon("cannabinoid"),
    aliases: ["cannabinoids"],
    match: (tags) => hasTag(tags, "cannabinoid"),
  },
  {
    key: "nootropic",
    name: "Nootropic",
    icon: getCategoryIcon("nootropic"),
    aliases: ["nootropics"],
    match: (tags) => hasTag(tags, "nootropic"),
  },
  {
    key: "antidepressant",
    name: "Antidepressant",
    icon: getCategoryIcon("antidepressant"),
    aliases: ["antidepressants"],
    match: (tags) => hasTag(tags, "antidepressant"),
  },
  {
    key: "antipsychotic",
    name: "Antipsychotic",
    icon: getCategoryIcon("antipsychotic"),
    aliases: ["antipsychotics"],
    match: (tags) => hasTag(tags, "antipsychotic"),
  },
  {
    key: "miscellaneous",
    name: "Miscellaneous",
    icon: getCategoryIcon("miscellaneous"),
    aliases: ["misc"],
    match: () => false,
    fallback: true,
  },
  {
    key: "anabolic-steroid",
    name: "Anabolic Steroid",
    icon: getCategoryIcon("anabolic-steroid"),
    aliases: ["anabolic steroids"],
    match: (tags) => hasTag(tags, "anabolic steroid"),
  },
  {
    key: "supplement",
    name: "Supplement",
    icon: getCategoryIcon("supplement"),
    aliases: ["supplements"],
    match: (tags) => hasTag(tags, "supplement"),
  },
];

const CATEGORY_LOOKUP = new Map<string, CategoryDefinition>();
CATEGORY_DEFINITIONS.forEach((definition) => {
  CATEGORY_LOOKUP.set(definition.key, definition);
  CATEGORY_LOOKUP.set(normalizeKey(definition.name), definition);
  definition.aliases?.forEach((alias) => CATEGORY_LOOKUP.set(normalizeKey(alias), definition));
});

const CATEGORY_INDEX_EXCLUDED_KEYS = new Set([
  "anabolic-steroid",
  "supplement",
]);

const FALLBACK_CATEGORY = CATEGORY_DEFINITIONS.find((definition) => definition.fallback) ?? CATEGORY_DEFINITIONS[CATEGORY_DEFINITIONS.length - 1];

export function normalizeCategoryKey(value: string): string {
  return normalizeKey(value);
}

export function findCategoryByKey(input: string): CategoryDefinition | undefined {
  return CATEGORY_LOOKUP.get(normalizeKey(input));
}

function resolveCategories(record: SubstanceRecord): CategoryDefinition[] {
  const tagSource = new Set<string>();
  (record.categories ?? []).forEach((category) => {
    const normalized = normalizeKey(category);
    if (normalized) {
      tagSource.add(normalized);
    }
  });

  const matches = CATEGORY_DEFINITIONS.filter((definition) => !definition.fallback && definition.match(tagSource));

  if (matches.length > 0) {
    return matches;
  }

  return [FALLBACK_CATEGORY];
}

function buildCategoryBuckets(records: SubstanceRecord[]) {
  const buckets = new Map<string, { definition: CategoryDefinition; records: SubstanceRecord[]; drugs: DrugListEntry[] }>();
  CATEGORY_DEFINITIONS.forEach((definition) => {
    buckets.set(definition.key, { definition, records: [], drugs: [] });
  });

  records.forEach((record) => {
    const categories = resolveCategories(record);
    const uniqueKeys = new Set<string>();

    categories.forEach((category) => {
      if (uniqueKeys.has(category.key)) {
        return;
      }

      const bucket = buckets.get(category.key);
      if (!bucket) {
        return;
      }

      bucket.drugs.push(createDrugEntry(record));
      bucket.records.push(record);
      uniqueKeys.add(category.key);
    });
  });

  return buckets;
}

export function buildCategoryGroups(records: SubstanceRecord[]): DosageCategoryGroup[] {
  const buckets = buildCategoryBuckets(records);

  const precomputedFilteredRecords = new Map<string, SubstanceRecord[]>();
  CATEGORY_DEFINITIONS.forEach((definition) => {
    const bucket = buckets.get(definition.key);
    let filteredRecords = bucket?.records ?? [];

    if (definition.key === "stimulant") {
      filteredRecords = filterStimulantRecords(filteredRecords);
    }
    if (definition.key === "entactogen") {
      filteredRecords = filterEntactogenRecords(filteredRecords);
    }

    precomputedFilteredRecords.set(definition.key, filteredRecords);
  });

  const hallucinogenExclusions = new Set<string>();
  precomputedFilteredRecords.forEach((list, key) => {
    if (key !== "hallucinogen" && key !== "miscellaneous") {
      list.forEach((record) => hallucinogenExclusions.add(record.slug));
    }
  });

  if (precomputedFilteredRecords.has("hallucinogen")) {
    const hallucinogenList = precomputedFilteredRecords
      .get("hallucinogen")!
      .filter((record) => !hallucinogenExclusions.has(record.slug));
    precomputedFilteredRecords.set("hallucinogen", hallucinogenList);
  }

  return CATEGORY_DEFINITIONS.map((definition) => {
    if (CATEGORY_INDEX_EXCLUDED_KEYS.has(definition.key)) {
      return null;
    }

    const filteredRecords = precomputedFilteredRecords.get(definition.key) ?? [];
    const isMiscellaneousCategory = definition.key === "miscellaneous";

    if (filteredRecords.length === 0 && !isMiscellaneousCategory) {
      return null;
    }

    const sections =
      definition.key === "deliriant"
        ? buildDeliriantDetailGroups(filteredRecords)
        : definition.key === "dissociative"
        ? buildDissociativeDetailGroups(filteredRecords)
        : definition.key === "psychedelic"
          ? buildPsychedelicDetailGroups(filteredRecords)
          : definition.key === "entactogen"
            ? buildEntactogenDetailGroups(filteredRecords)
            : definition.key === "opioid"
              ? buildOpioidDetailGroups(filteredRecords)
              : definition.key === "stimulant"
                ? buildStimulantDetailGroups(filteredRecords)
                : definition.key === "antidepressant"
                  ? buildAntidepressantDetailGroups(filteredRecords)
                  : definition.key === "gabaergic"
                    ? buildGabaergicDetailGroups(filteredRecords)
                    : definition.key === "cannabinoid"
                      ? buildCannabinoidDetailGroups(filteredRecords)
                      : definition.key === "nootropic"
                        ? buildChemicalClassGroups(filteredRecords)
                        : undefined;

    const baseDrugs = filteredRecords.map((record) => createDrugEntry(record));

    const sortedDrugs =
      sections && sections.length > 0
        ? sections.flatMap((section) => section.drugs)
        : baseDrugs.sort((a, b) => a.name.localeCompare(b.name));

    return {
      key: definition.key,
      name: definition.name,
      icon: definition.icon,
      total: filteredRecords.length,
      drugs: sortedDrugs,
      sections,
    } as DosageCategoryGroup;
  })
    .filter((group): group is DosageCategoryGroup => group !== null)
    .filter((group) => !CATEGORY_INDEX_EXCLUDED_KEYS.has(group.key));
}

interface CategorizedRecordContext {
  record: SubstanceRecord;
  normalizedCategories: Set<string>;
  chemicalClasses: string[];
  mechanismOfAction?: string;
  normalizedMechanism?: string;
}

interface CategoryGroupConfig {
  name: string;
  order: string[];
  filter: (context: CategorizedRecordContext) => boolean;
}

const OTHER_DISSOCIATIVE_NAMES = new Set([
  "Dizocilpine (MK-801)",
  "Etoxadrol",
  "Memantine",
  "Salvinorin A",
  "Xenon",
]);

const DISSOCIATIVE_EXCLUDED_NAMES = new Set(["Ibogaine"]);

const EXCLUDED_FROM_ADAMANTANES = new Set(["Memantine"]);

const COMMON_CATEGORY_KEY = normalizeCategoryKey("common");
const OTHER_ENTACTOGENS_CATEGORY_KEY = normalizeCategoryKey("other entactogens");
const OTHER_DELIRIANTS_CATEGORY_KEY = normalizeCategoryKey("other deliriants");
const OTHER_PSYCHEDELIC_CATEGORY_KEY = normalizeCategoryKey("other psychedelics");
const OTHER_STIMULANT_CATEGORY_KEY = normalizeCategoryKey("other stimulants");
const OTHER_OPIOIDS_CATEGORY_KEY = normalizeCategoryKey("other opioids");
const OTHER_GABAERGICS_CATEGORY_KEY = normalizeCategoryKey("other gabaergics");
const ANTIHISTAMINE_CATEGORY_KEY = normalizeCategoryKey("antihistamine");
const OTHER_ANTIDEPRESSANTS_GROUP_NAME = "Other antidepressants";

const BENZODIAZEPINE_CLASS_TOKEN = normalizeKey("benzodiazepine");
const BARBITURATE_CLASS_KEY = normalizeKey("barbiturate");
const GABA_ANALOGUE_CLASS_TOKEN = normalizeKey("GABA analogue");
const HYDROXYISOXAZOLE_CLASS_KEY = normalizeKey("3-Hydroxyisoxazole");
const QUINAZOLINONE_CLASS_KEY = normalizeKey("Quinazolinone");
const Z_DRUG_CLASS_KEY = normalizeKey("Z-drug");
const CARBAMATE_CLASS_KEY = normalizeKey("Carbamate");
const TROPANE_ALKALOID_CLASS_KEY = normalizeKey("Tropane alkaloids");

const STIMULANT_EXCLUDED_CATEGORY_KEYS = new Set([
  normalizeCategoryKey("opioid"),
  normalizeCategoryKey("psychedelic"),
  normalizeCategoryKey("dissociative"),
  normalizeCategoryKey("a-typical hallucinogen"),
]);

const includesNormalizedToken = (value: string, token: string) =>
  normalizeKey(value).includes(token);

const ANTIDEPRESSANT_MECHANISM_ENTRIES = [
  {
    name: "Monoamine oxidase inhibitors",
    order: [
      "Moclobemide",
      "Phenelzine",
      "Selegiline",
      "Tranylcypromine",
    ],
  },
  {
    name: "Norepinephrine and dopamine reuptake inhibitors",
    order: ["Bupropion"],
  },
  {
    name: "Norepinephrine reuptake inhibitors",
    order: ["Viloxazine"],
  },
  {
    name: "Serotonin reuptake and receptor modulators",
    order: ["Vilazodone", "Trazodone", "Mirtazapine"],
  },
  {
    name: "Mu-opioid receptor agonists",
    order: ["Tianeptine"],
  },
  {
    name: "Sodium channel blockers",
    order: ["Lamotrigine (Lamictal)"],
  },
  {
    name: "Beta-adrenergic receptor antagonists",
    order: ["Propranolol"],
  },
] as const;

const ANTIDEPRESSANT_MECHANISM_CONFIG = ANTIDEPRESSANT_MECHANISM_ENTRIES.map(
  (entry) => ({
    ...entry,
    normalized: normalizeKey(entry.name),
  }),
);

const ANTIDEPRESSANT_MECHANISM_KEYS = new Set(
  ANTIDEPRESSANT_MECHANISM_CONFIG.map((entry) => entry.normalized),
);

const PHYT_CANNABINOID_CLASS_KEY = normalizeKey("Phytocannabinoids");
const SYNTHETIC_CANNABINOID_CLASS_KEY = normalizeKey("Synthetic cannabinoids");
const ENTACTOGEN_MDXX_CLASS_KEY = normalizeKey("MDXX");
const ENTACTOGEN_BENZOFURAN_CLASS_KEY = normalizeKey("Benzofurans");
const ENTACTOGEN_AMPHETAMINE_CLASS_KEY = normalizeKey("Amphetamines");
const ENTACTOGEN_CATHINONE_CLASS_KEY = normalizeKey("Cathinones");
const ENTACTOGEN_PIPERAZINE_CLASS_KEY = normalizeKey("Piperazines");
const ENTACTOGEN_AMINOINDANE_CLASS_KEY = normalizeKey("Aminoindanes");
const ENTACTOGEN_EXCLUDED_NAMES = new Set([
  "5-Cl-AMT",
  "5-MeO-AMT",
  "5-MeO-DiBF (5-Methoxy-diisopropylbenzofuranethylamine)",
  "2C-T-2",
  "2C-T-7",
  "Galantamine",
  "Fenfluramine",
]);

const ANTIDEPRESSANT_GROUP_CONFIG: CategoryGroupConfig[] = [
  ...ANTIDEPRESSANT_MECHANISM_CONFIG.map(({ name, order, normalized }) => ({
    name,
    order,
    filter: (context) => context.normalizedMechanism === normalized,
  })),
  {
    name: OTHER_ANTIDEPRESSANTS_GROUP_NAME,
    order: [],
    filter: (context) =>
      !context.normalizedMechanism ||
      !ANTIDEPRESSANT_MECHANISM_KEYS.has(context.normalizedMechanism),
  },
];

// Custom grouping that mirrors the entactogen index card layout.
const ENTACTOGEN_GROUP_CONFIG: CategoryGroupConfig[] = [
  {
    name: "Common",
    order: [
      "MDMA",
      "3,4-Methylenedioxyamphetamine (MDA)",
    ],
    filter: (context) => context.normalizedCategories.has(COMMON_CATEGORY_KEY),
  },
  {
    name: "MDXX",
    order: [
      "MDMA",
      "3,4-Methylenedioxyamphetamine (MDA)",
      "2-Bromo-4,5-MDMA",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === ENTACTOGEN_MDXX_CLASS_KEY,
      ),
  },
  {
    name: "Benzofurans",
    order: [
      "5-AEDB",
      "5-APB",
      "5-EAPB",
      "5-MAPB",
      "5-MAPDB",
      "6-APB",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === ENTACTOGEN_BENZOFURAN_CLASS_KEY,
      ),
  },
  {
    name: "Amphetamines",
    order: [
      "4-Fluoroamphetamine (4-FA, para-fluoroamphetamine, PFA)",
      "4-Fluoroethamphetamine (4-FEA)",
      "4-Fluoromethamphetamine (4-FMA)",
      "4-Methylthioamphetamine (4-MTA, MTA)",
      "3-Fluoroethamphetamine (3-FEA)",
      "4-Bromoamphetamine (PBA, 4-BA)",
      "5-APDI (5-IAP, IAP)",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === ENTACTOGEN_AMPHETAMINE_CLASS_KEY,
      ),
  },
  {
    name: "Cathinones",
    order: [
      "Butylone (βk-MBDB)",
      "Eutylone",
      "4-CMC (4-Chloromethcathinone, Clephedrone)",
      "4-EMC",
      "4-MEC (4-Methylethcathinone)",
      "Mephedrone (4-MMC)",
      "3-Methylmethcathinone",
      "2-MMC",
      "EDMC (3,4-Ethylenedioxymethcathinone, 3,4-EDMC)",
      "Flephedrone (4-Fluoromethcathinone, 4-FMC)",
      "Brephedrone",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === ENTACTOGEN_CATHINONE_CLASS_KEY,
      ),
  },
  {
    name: "Piperazines",
    order: [
      "3,4-CFPP (Kleferein)",
      "4-Fluorophenylpiperazine",
    ],
    filter: (context) =>
      !context.normalizedCategories.has(OTHER_ENTACTOGENS_CATEGORY_KEY) &&
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === ENTACTOGEN_PIPERAZINE_CLASS_KEY,
      ),
  },
  {
    name: "Aminoindanes",
    order: ["5-IAI (5-Iodo-2-amino-indan)"],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === ENTACTOGEN_AMINOINDANE_CLASS_KEY,
      ),
  },
  {
    name: "Other entactogens",
    order: [
      "4-FPP (para-Fluorophenylpiperazine, pFPP)",
      "alpha-Methyltryptamine (AMT)",
    ],
    filter: (context) =>
      context.normalizedCategories.has(OTHER_ENTACTOGENS_CATEGORY_KEY),
  },
];

// Custom grouping that mirrors the deliriant index card layout.
const DELIRIANT_GROUP_CONFIG: CategoryGroupConfig[] = [
  {
    name: "Tropane alkaloids",
    order: [
      "Scopolamine (Hyoscine)",
      "Atropine",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === TROPANE_ALKALOID_CLASS_KEY,
      ),
  },
  {
    name: "Antihistamines",
    order: [
      "Dimenhydrinate",
      "Cyproheptadine",
      "Chlorpheniramine (Chlorpheniramine Maleate)",
    ],
    filter: (context) => context.normalizedCategories.has(ANTIHISTAMINE_CATEGORY_KEY),
  },
  {
    name: "Other deliriants",
    order: [
      "3-Quinuclidinyl benzilate (BZ)",
      "EA-1367",
      "EA-3167",
      "Myristicin (Nutmeg)",
    ],
    filter: (context) => context.normalizedCategories.has(OTHER_DELIRIANTS_CATEGORY_KEY),
  },
];

// Custom grouping that mirrors the dissociative index card layout.
const DISSOCIATIVE_GROUP_CONFIG: CategoryGroupConfig[] = [
  {
    name: "Common",
    order: [
      "Ketamine",
      "PCP (Phencyclidine)",
      "Dextromethorphan (DXM)",
    ],
    filter: (context) => context.normalizedCategories.has("common"),
  },
  {
    name: "Arylcyclohexylamines",
    order: [
      "Ketamine",
      "PCP (Phencyclidine)",
      "Deschloroketamine",
      "Deoxymethoxetamine (DMXE)",
      "Hydroxetamine (HXE)",
      "Methoxetamine",
      "Methoxmetamine (MXM)",
      "MXPCP",
      "MXiPr",
      "O-PCE",
      "O-PCP (2-Keto-PCP)",
      "O-PCPr",
      "Tiletamine",
      "Bromoketamine (BDCK, 2-Bromodeschloroketamine)",
      "2-Fluorodeschloroketamine (2-FDCK)",
      "Canket (FXE, 2-F-2'-Oxo-PCE, 2F-NENDCK)",
      "Fluorexetamine (3'-Fluoro-2-oxo-PCE, 3-FXE)",
      "2-MeO-Ketamine (Methoxyketamine)",
      "3-Cl-PCP",
      "3-EtO-PCP",
      "3-F-PCP (3-Fluoro-PCP)",
      "3-HO-PCE",
      "3-HO-PCP",
      "3-Me-PCPy",
      "3-MeO-PCE",
      "3-MeO-PCMo",
      "3-MeO-PCP",
      "3-MeO-PCPr",
      "3-MeO-PCPy",
      "3,4-Methylenediox?y-phencyclidine (3,4-MD-PCP, MDPCP)",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Arylcyclohexylamines"),
      ),
  },
  {
    name: "Substituted diarylethylamines",
    order: [
      "Diphenidine",
      "Ephenidine (DPD-E, 1,2-DP-E)",
      "Fluorolintane",
      "MXP",
      "2-Chloroephenidine (2-Cl-Eph, 2-Cl-diphenidine)",
      "2-TFMXP",
      "4-MXP",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Substituted diarylethylamines"),
      ),
  },
  {
    name: "Morphinans",
    order: [
      "Dextromethorphan (DXM)",
      "Dextrorphan (DXO)",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Morphinans"),
      ),
  },
  {
    name: "Adamantanes",
    order: [
      "Memantine",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Adamantanes"),
      ) && !EXCLUDED_FROM_ADAMANTANES.has(context.record.name),
  },
  {
    name: "Other dissociatives",
    order: [
      "Dizocilpine (MK-801)",
      "Etoxadrol",
      "Memantine",
      "Salvinorin A",
      "Xenon",
    ],
    filter: (context) =>
      OTHER_DISSOCIATIVE_NAMES.has(context.record.name) ||
      context.normalizedCategories.has("other-dissociatives"),
  },
];

const PSYCHEDELIC_GROUP_CONFIG: CategoryGroupConfig[] = [
  {
    name: "Common",
    order: [
      "LSD",
      "Mescaline",
      "DMT (Dimethyltryptamine)",
      "2C-B",
    ],
    filter: (context) => context.normalizedCategories.has(COMMON_CATEGORY_KEY),
  },
  {
    name: "Lysergamides",
    order: [
      "LSD",
      "AL-LAD",
      "LSZ",
      "1B-LSD",
      "1cP-AL-LAD",
      "1cP-LSD",
      "1cP-MiPLA",
      "1D-LSD",
      "1P-ETH-LAD",
      "1P-LSD",
      "1S-LSD",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Lysergamides"),
      ),
  },
  {
    name: "Tryptamines",
    order: [
      "DMT (Dimethyltryptamine)",
      "Ibogaine",
      "alpha-Methyltryptamine (AMT)",
      "DiPT (N,N-Diisopropyltryptamine)",
      "DPT (N,N-Dipropyltryptamine)",
      "2-Me-DMT (2-Methyl-N,N-dimethyltryptamine, 2,N,N-TMT)",
      "2-MeO-DMT",
      "4-AcO-DET",
      "4-AcO-DMT (O-Acetylpsilocin)",
      "4-AcO-DPT",
      "4-HO-McPT",
      "4-HO-MET",
      "4-HO-PiPT",
      "4-MeO-MiPT",
      "4-PrO-DMT",
      "4-PrO-MET (4-propionoxy-4-HO-MET prodrug)",
      "5-Bromo-DMT",
      "5-Cl-AMT",
      "Bufotenin",
      "5-MeO-AMT",
      "5-MeO-DALT",
      "5-MeO-DiBF (5-Methoxy-diisopropylbenzofuranethylamine)",
      "5-MeO-DMT",
      "5-MeO-DPT (5-methoxy-N,N-dipropyltryptamine)",
      "5-MeO-MiPT",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Tryptamines"),
      ),
  },
  {
    name: "2C-X",
    order: [
      "2C-B",
      "2C-B-AN",
      "2C-B-FLY",
      "2C-BZ",
      "2C-C",
      "2C-D",
      "2C-E",
      "2C-EF",
      "2C-F (2,5-dimethoxy-4-fluorophenethylamine)",
      "2C-G",
      "2C-I",
      "2C-iP",
      "2C-N",
      "2C-P",
      "2C-T-2",
      "2C-T-21",
      "2C-T-4",
      "2C-T-7",
      "2C-TFM",
    ],
    filter: (context) => {
      const categoryList = Array.isArray(context.categories) ? context.categories : [];
      const classList = Array.isArray(context.chemicalClasses) ? context.chemicalClasses : [];
      const hasCategory = categoryList.some(
        (entry) => normalizeKey(entry) === normalizeKey("2C-X"),
      );
      const hasClass = classList.some(
        (entry) => normalizeKey(entry) === normalizeKey("2C-X"),
      );
      return hasCategory || hasClass;
    },
  },
  {
    name: "Mescaline homologues",
    order: [
      "Mescaline",
      "AEM (\u03b1-Ethylmescaline, 2-Amino-1-(3,4,5-trimethoxyphenyl)butane)",
      "Methallylescaline (MAL)",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Mescaline homologues"),
      ),
  },
  {
    name: "N-benzylated phenethylamines",
    order: [
      "2C-B-FLY-NBOMe",
      "25B-NBOH",
      "25C-NB3OMe",
      "25CN-NBOH",
      "25E-NBOH",
      "25H-NBOMe",
      "25I-NBF",
      "25I-NBMD",
      "25I-NBOH",
      "25I-NBOMe",
      "25iP-NBOMe",
      "25T-2-NBOMe",
      "25T-NBOMe",
      "2C-P-NBOMe (25P-NBOMe, NBOMe-2C-P)",
      "2C-T-4-NBOMe",
      "2C-T-7-NBOMe",
      "C30-NBOMe",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) =>
          normalizeKey(entry) === normalizeKey("N-benzylated phenethylamines"),
      ),
  },
  {
    name: "Psychedelic amphetamines",
    order: [
      "2,5-Dimethoxy-4-ethoxyamphetamine (MEM)",
      "3C-E (3,5-dimethoxy-4-ethoxy-amphetamine)",
      "3C-P (4-propoxy-3,5-dimethoxyamphetamine)",
      "ALEPH",
      "ALEPH-2 (2,5-Dimethoxy-4-ethylthioamphetamine)",
      "ALEPH-6 (2,5-Dimethoxy-4-phenylthioamphetamine)",
      "ARIADNE (4C-D, Dimoxamine, 4C-DOM, BL-3912)",
      "Bromo-DragonFLY",
      "DOB (2,5-Dimethoxy-4-bromoamphetamine)",
      "DOC (2,5-Dimethoxy-4-chloroamphetamine)",
      "DOEF",
      "DOET",
      "DOM (2,5-Dimethoxy-4-methylamphetamine)",
      "TMA (3,4,5-Trimethoxyamphetamine)",
      "TMA-2 (2,4,5-Trimethoxyamphetamine)",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Psychedelic amphetamines"),
      ),
  },
  {
    name: "Other psychedelics",
    order: [
      "BOH-2C-B (BOHB)",
      "Yopo (Anadenanthera peregrina)",
    ],
    filter: (context) =>
      context.normalizedCategories.has(OTHER_PSYCHEDELIC_CATEGORY_KEY),
  },
];

const STIMULANT_GROUP_CONFIG: CategoryGroupConfig[] = [
  {
    name: "Common",
    order: [
      "Amphetamine",
      "Dextroamphetamine",
      "Methylphenidate (MPH)",
      "Cocaine",
      "Caffeine",
      "Lisdexamfetamine (Vyvanse)",
    ],
    filter: (context) => context.normalizedCategories.has(COMMON_CATEGORY_KEY),
  },
  {
    name: "Amphetamines",
    order: [
      "Amphetamine",
      "Dextroamphetamine",
      "Lisdexamfetamine (Vyvanse)",
      "Amfecloral",
      "Benzphetamine",
      "Clobenzorex",
      "Dextromethamphetamine (Desoxyn)",
      "Ephedrine",
      "Fenethylline (Captagon)",
      "Phenylephrine",
      "Methyl-K",
      "2-Fluoroamphetamine (2-FA)",
      "2-Fluoroethamphetamine (2-FEA)",
      "2-FMA (2-Fluoromethamphetamine)",
      "3-CAF (3-chloroamphetamine)",
      "2-Methylamphetamine (2-MA, Ortetamine)",
      "3-Fluoroamphetamine (3-FA, PAL-353)",
      "3-Fluoroethamphetamine (3-FEA)",
      "3-Fluoromethamphetamine (3-FMA)",
      "4-Fluoroamphetamine (4-FA, para-fluoroamphetamine, PFA)",
      "4-Bromoamphetamine (PBA, 4-BA)",
      "4-Fluoroethamphetamine (4-FEA)",
      "4-Fluoromethamphetamine (4-FMA)",
      "4-Methylephedrine",
      "4-Methylthioamphetamine (4-MTA, MTA)",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Amphetamines"),
      ),
  },
  {
    name: "Phenidates",
    order: [
      "Methylphenidate (MPH)",
      "Ethylphenidate (EPH)",
      "Isopropylphenidate (IPPH)",
      "Serdexmethylphenidate",
      "4-Methylmethylphenidate (4-Me-TMP)",
      "4F-MPH (4-Fluoromethylphenidate)",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Phenidates"),
      ),
  },
  {
    name: "Cathinones",
    order: [
      "2-Methylethcathinone",
      "2-MMC",
      "2-NMC (2'-Propionaphthone)",
      "3-CEC (3-Chloroethcathinone)",
      "3-Chloromethcathinone (3-CMC)",
      "3-Fluoromethcathinone",
      "3-Methylethcathinone",
      "3-Methylmethcathinone",
      "3,4-DMMC (3,4-dimethyl-methcathinone)",
      "3,4-Trimethylenepentedrone",
      "4-Bromomethcathinone",
      "4-CBC (4-Chlorobuphedrone)",
      "4-CEC (4-Chloroethcathinone)",
      "4-CMC (4-Chloromethcathinone, Clephedrone)",
      "4-EEC (4-Ethylethcathinone)",
      "4-EMC",
      "4-Ethylpentedrone (4-EPD)",
      "4-Fluoropentedrone",
      "4-MBC (Benzedrone)",
      "4-MEC (4-Methylethcathinone)",
      "4F-MABP (4-fluorobuphedrone)",
      "4-MPD (4-Methylpentedrone)",
      "4-Me-NEB (4-methyl NEB)",
      "5-BPDi",
      "Amfepramone (Diethylpropion)",
      "Brephedrone",
      "Bupropion",
      "Dimethylpentylone (N,N-Dimethylpentylone)",
      "Dipentylone",
      "EDMC (3,4-Ethylenedioxymethcathinone, 3,4-EDMC)",
      "Hexedrone",
      "Hexen (N-Ethylhexedrone)",
      "Flephedrone (4-Fluoromethcathinone, 4-FMC)",
      "Mephedrone (4-MMC)",
      "Methcathinone",
      "N-Ethylpentedrone",
      "Naphyrone",
      "Butylone (�k-MBDB)",
      "Cyputylone (N-Cyclohexylmethylone)",
      "Eutylone",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Cathinones"),
      ),
  },
  {
    name: "Substituted pyrrolidines",
    order: [
      "2-Me-PiHP",
      "3F-PiHP (3-Fluoro-PiHP)",
      "4-Cl-PPP",
      "3-Methyl-4-fluoro-a-pyrrolidinovalerophenone",
      "3,4-Dimethoxy-a-PHP (DMO-PHP)",
      "4-Fluoro-alpha-PHP (4F-PHP)",
      "4-Fluoro-a-pyrrolidinopropiophenone (4F-PPP)",
      "4-MEPPP",
      "5-DBFPV",
      "alpha-D2PV (a-D2PV, a-D2PV, 2-Diphenylmethylpyrrolidin-1-ylpentan-1-one)",
      "alpha-PiHP (A-PiHP)",
      "alpha-Pyrrolidinohexiophenone (a-PHP)",
      "MD-PHP",
      "MD-PiHP",
      "MD-prolintane",
      "MDPV",
      "Prolintane",
      "Pyrovalerone",
      "a-PCYP (alpha-PyrrolidinoCyclohexanoPhenone)",
      "a-Pyrrolidinopentiophenone (a-PVP, Flakka, Gravel, A-PVP)",
      "a-Pyrrolidinopropiophenone",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Substituted pyrrolidines"),
      ),
  },
  {
    name: "Tropanes",
    order: [
      "Cocaine",
      "Cocaethylene",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Tropanes"),
      ),
  },
  {
    name: "Xanthines",
    order: [
      "Caffeine",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Xanthines"),
      ),
  },
  {
    name: "Piperazines",
    order: [
      "1-(2,3,4-Trimethoxybenzyl)piperazine",
      "1-(2,5-Dimethoxybenzyl) piperazine",
      "3,4-CFPP (Kleferein)",
      "4-Benzylpiperidine",
      "4-Fluorophenylpiperazine",
      "BZP (Benzylpiperazine)",
      "DMNPC",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Piperazines"),
      ),
  },
  {
    name: "Phenmetrazines",
    order: [
      "3-Chlorophenmetrazine (3-CPM)",
      "3-Fluorophenmetrazine (3-FPM, 3-FPH, PAL-593)",
      "3,4-Methylenedioxyphenmetrazine (MDPM, 3-MDPM)",
      "Phendimetrazine",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Phenmetrazines"),
      ),
  },
  {
    name: "Alkyl amines",
    order: [
      "1,4-DMAA (1,4-dimethylamylamine)",
      "DMHA (Octodrine)",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Alkyl amines"),
      ),
  },
  {
    name: "Pipradrol homologues",
    order: [
      "Pipradrol",
      "Diphenylprolinol (D2PM)",
      "2-DPMP (Desoxypipradrol)",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Pipradrol homologues"),
      ),
  },
  {
    name: "Aminoindanes",
    order: [
      "2-Aminoindane (2-AI)",
      "NM-2-AI",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Aminoindanes"),
      ),
  },
  {
    name: "Aminorexes",
    order: [
      "Aminorex",
      "Cyclazodone",
      "3-Methylaminorex (3-MAR)",
      "4-Methylaminorex",
      "4,4'-Dimethylaminorex",
      "4'-Fluoro-4-methylaminorex",
      "4'-Chloro-4-methylaminorex (4C-MAR, 4-Cl-MAR)",
      "4B-MAR (4-Bromo Aminorex)",
      "Fluminorex",
      "Fenozolone",
      "N-Methyl-Cyclazodone (NMC)",
      "Pemoline",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Aminorexes"),
      ),
  },
  {
    name: "Other stimulants",
    order: [
      "3,3-Diphenylcyclobutanamine (3,3-DPCB)",
      "2-PA",
      "2-PTA",
      "Arecoline",
      "Bromantane",
      "Mazindol",
      "Nicotine",
      "Phenylpropylaminopentane",
      "Sibutramine",
      "Tesofensine",
      "Viloxazine",
    ],
    filter: (context) =>
      context.normalizedCategories.has(OTHER_STIMULANT_CATEGORY_KEY),
  },
];

const OPIOID_GROUP_CONFIG: CategoryGroupConfig[] = [
  {
    name: "Common",
    order: [
      "Codeine",
      "Morphine",
      "Oxycodone",
      "Heroin (Diacetylmorphine)",
      "Fentanyl",
      "Tramadol",
      "Kratom",
      "Methadone",
    ],
    filter: (context) => context.normalizedCategories.has(COMMON_CATEGORY_KEY),
  },
  {
    name: "Morphinans",
    order: [
      "Codeine",
      "Morphine",
      "Oxycodone",
      "Heroin (Diacetylmorphine)",
      "Acetorphine",
      "6-Monoacetylmorphine",
      "Buprenorphine",
      "Acetyldihydrocodeine",
      "Butorphanol",
      "Desomorphine",
      "Dihydrocodeine (DHC)",
      "Hydrocodone",
      "Hydromorphone",
      "Levomethorphan",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Morphinans"),
      ),
  },
  {
    name: "Benzimidazoles",
    order: [
      "Etonitazene",
      "Isotonitazene",
      "Isotonitazepyne (N-pyrrolidino isotonitazene, iso-pyne)",
      "Metonitazene",
      "N-Desethylprotonitazene (NDP)",
      "Pronitazene",
      "SR-14968",
      "SR-17018",
      "Bezitramide (Burgodin)",
      "Cychlorphine",
      "Spirochlorphine (R-6890, SPC)",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Benzimidazoles"),
      ),
  },
  {
    name: "Anilinopiperidines",
    order: [
      "Fentanyl",
      "Acrylfentanyl",
      "Alfentanil",
      "4-Methoxybutyrfentanyl",
      "4Cl-iBF (p-Chloro-isobutyrylfentanyl)",
      "Lofentanil",
      "Remifentanil (Ultiva)",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Anilinopiperidines"),
      ),
  },
  {
    name: "Indole alkaloids",
    order: [
      "Kratom",
      "7-Hydroxymitragynine (7-OH)",
      "MGM-15",
      "Mitragynine",
      "Mitragynine pseudoindoxyl (Pseudo)",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Indole alkaloids"),
      ),
  },
  {
    name: "Phenylpiperidines",
    order: [
      "Beta-meprodine",
      "MPPP",
      "Loperamide (Imodium)",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Phenylpiperidines"),
      ),
  },
  {
    name: "Diphenylheptanes",
    order: [
      "Methadone",
      "Dipipanone",
      "Methiodone (IC-26)",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Diphenylheptanes"),
      ),
  },
  {
    name: "Phenylpropylaminopentane",
    order: [
      "Tramadol",
      "Tapentadol",
      "O-Desmethyltramadol (O-DSMT)",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) =>
          normalizeKey(entry) === normalizeKey("Phenylpropylaminopentane"),
      ),
  },
  {
    name: "Other opioids",
    order: ["Tianeptine"],
    filter: (context) => context.normalizedCategories.has(OTHER_OPIOIDS_CATEGORY_KEY),
  },
];

const GABAERGIC_GROUP_CONFIG: CategoryGroupConfig[] = [
  {
    name: "Common",
    order: [
      "GHB (Gamma-Hydroxybutyric Acid)",
      "Alprazolam",
      "Diazepam (Valium)",
      "Lorazepam",
      "Oxazepam",
      "Temazepam",
    ],
    filter: (context) => context.normalizedCategories.has(COMMON_CATEGORY_KEY),
  },
  {
    name: "Benzodiazepines",
    order: [
      "3-Hydroxyphenazepam",
      "Adinazolam",
      "Alprazolam",
      "Avizafone",
      "Bromazepam",
      "Bromazolam",
      "Bromonordiazepam",
      "Brotizolam",
      "Chlordiazepoxide",
      "Clobazam",
      "Clobromazolam",
      "Clonazepam",
      "Deschloroetizolam",
      "Desmethylflunitrazepam",
      "Delorazepam",
      "Diazepam (Valium)",
      "Diclazepam",
      "Ethylbromazolam",
      "Etizolam",
      "Flubromazepam",
      "Flubromazolam",
      "Flubrotizolam",
      "Fluclotizolam",
      "Fluetizolam",
      "Flunitrazepam (Rohypnol)",
      "Flunitrazolam",
      "Flurazepam",
      "Flutoprazepam",
      "Fosazepam",
      "Gidazepam",
      "Halazepam",
      "Lorazepam",
      "Medazepam",
      "Midazolam",
      "Nifoxipam",
      "Nimetazepam",
      "Nitrazepam",
      "Norflurazepam (Norfludiazepam)",
      "Oxazepam",
      "Phenazepam",
      "Phenazolam",
      "Prazepam",
      "Pyrazolam",
      "Temazepam",
      "Triazolam",
    ],
    filter: (context) =>
      context.chemicalClasses.some((entry) =>
        includesNormalizedToken(entry, BENZODIAZEPINE_CLASS_TOKEN),
      ),
  },
  {
    name: "Barbiturates",
    order: ["Amobarbital", "Phenobarbital", "Thiopental"],
    filter: (context) =>
      context.chemicalClasses.some((entry) =>
        includesNormalizedToken(entry, BARBITURATE_CLASS_KEY),
      ),
  },
  {
    name: "GABA analogues",
    order: [
      "GHB (Gamma-Hydroxybutyric Acid)",
      "GABOB (γ-Amino-β-hydroxybutyric acid)",
      "1,4-BDO (1,4-Butanediol)",
      "GVL (Gamma-Valerolactone)",
      "Baclofen",
      "GBL (Gamma-Butyrolactone)",
      "Gabapentin",
      "4-Fluorophenibut (F-Phenibut, 4-F-Phenibut, Fluorophenibut)",
      "Pregabalin",
      "Phenibut",
      "Mirogabalin",
      "Aceburic acid",
    ],
    filter: (context) =>
      context.chemicalClasses.some((entry) =>
        includesNormalizedToken(entry, GABA_ANALOGUE_CLASS_TOKEN),
      ),
  },
  {
    name: "3-Hydroxyisoxazoles",
    order: ["Gaboxadol (THIP)", "Muscimol", "Ibotenic acid"],
    filter: (context) =>
      context.chemicalClasses.some((entry) =>
        includesNormalizedToken(entry, HYDROXYISOXAZOLE_CLASS_KEY),
      ),
  },
  {
    name: "Quinazolinones",
    order: ["Afloqualone", "Methaqualone", "SL-164 (Dicloqualone)"],
    filter: (context) =>
      context.chemicalClasses.some((entry) =>
        includesNormalizedToken(entry, QUINAZOLINONE_CLASS_KEY),
      ),
  },
  {
    name: "Z-drugs",
    order: ["Zaleplon", "Zolpidem (Ambien)", "Zopiclone"],
    filter: (context) =>
      context.chemicalClasses.some((entry) =>
        includesNormalizedToken(entry, Z_DRUG_CLASS_KEY),
      ),
  },
  {
    name: "Carbamates",
    order: ["Carisoprodol"],
    filter: (context) =>
      context.chemicalClasses.some((entry) =>
        includesNormalizedToken(entry, CARBAMATE_CLASS_KEY),
      ),
  },
  {
    name: "Other GABAergics",
    order: ["Kava (Piper methysticum)", "Chloral Hydrate"],
    filter: (context) =>
      context.normalizedCategories.has(OTHER_GABAERGICS_CATEGORY_KEY),
  },
];
const CANNABINOID_GROUP_CONFIG: CategoryGroupConfig[] = [
  {
    name: "Phytocannabinoids",
    order: [
      "Cannabichromene (CBC)",
      "Cannabicyclol (CBL)",
      "Cannabidiolic acid",
      "Cannabigerol (CBG)",
      "Cannabis (Tetrahydrocannabinol+Cannabidiol, THC+CBD)",
      "CBDV",
      "CBDVA",
      "CBN",
      "CBNA",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === PHYT_CANNABINOID_CLASS_KEY,
      ),
  },
  {
    name: "Synthetic cannabinoids",
    order: [
      "4F-MDMB-BINACA",
      "ADB-INACA",
      "ADB-PINACA (isomer 1)",
      "ADB-PINACA isomer 2",
      "ADBICA",
      "AKB-57",
      "AM-1248",
      "AM-2201",
      "AM-2233",
      "AM-694",
      "AMB-CHMICA",
      "AMB-FUBINACA (AMB)",
      "CB-13 (SAB-378)",
      "JWH-018 (1-pentyl-3-(1-naphthoyl)-indole)",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === SYNTHETIC_CANNABINOID_CLASS_KEY,
      ),
  },
];
function buildCannabinoidDetailGroups(records: SubstanceRecord[]): CategoryDetailGroup[] {
  return buildConfiguredDetailGroups(records, CANNABINOID_GROUP_CONFIG);
}

function buildChemicalClassGroups(records: SubstanceRecord[]): CategoryDetailGroup[] {
  const chemicalMap = new Map<string, DrugListEntry[]>();
  records.forEach((record) => {
    const classes = record.chemicalClasses && record.chemicalClasses.length > 0 ? record.chemicalClasses : ["Unspecified"];
    classes.forEach((chemicalClass) => {
      const key = chemicalClass.trim();
      if (!chemicalMap.has(key)) {
        chemicalMap.set(key, []);
      }
      chemicalMap.get(key)!.push(createDrugEntry(record));
    });
  });

  return Array.from(chemicalMap.entries())
    .map(([name, drugs]) => ({
      name,
      drugs: drugs.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const MECHANISM_OF_ACTION_LABEL = "Mechanism of Action";

function resolveMechanismOfAction(record: SubstanceRecord): string | undefined {
  const sections = record.content.infoSections ?? [];
  for (const section of sections) {
    const mechanismEntry = section.items.find(
      (item) => item.label === MECHANISM_OF_ACTION_LABEL && item.value,
    );
    if (mechanismEntry?.value) {
      const value = mechanismEntry.value.trim();
      if (value.length > 0) {
        return value;
      }
    }
  }
  return undefined;
}

function createCategorizedRecordContexts(records: SubstanceRecord[]): CategorizedRecordContext[] {
  return records.map((record) => {
    const normalizedCategories = new Set(
      (record.categories ?? [])
        .map((category) => normalizeCategoryKey(category))
        .filter((category) => category.length > 0),
    );
    const chemicalClasses = (record.chemicalClasses ?? [])
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    const mechanismOfAction = resolveMechanismOfAction(record);
    const normalizedMechanism = mechanismOfAction
      ? normalizeKey(mechanismOfAction)
      : undefined;

    return { record, normalizedCategories, chemicalClasses, mechanismOfAction, normalizedMechanism };
  });
}

function buildConfiguredDetailGroups(
  records: SubstanceRecord[],
  configs: CategoryGroupConfig[],
): CategoryDetailGroup[] {
  if (records.length === 0) {
    return [];
  }

  const contexts = createCategorizedRecordContexts(records);
  const groups: CategoryDetailGroup[] = [];
  const included = new Set<string>();

  const addGroup = (config: CategoryGroupConfig) => {
    const matches = contexts.filter((context) => config.filter(context));
    if (matches.length === 0) {
      return;
    }

    const orderMap = new Map(config.order.map((name, index) => [normalizeKey(name), index]));
    const sorted = matches.slice().sort((a, b) => {
      const aIndex = orderMap.get(normalizeKey(a.record.name));
      const bIndex = orderMap.get(normalizeKey(b.record.name));
      if (aIndex !== undefined && bIndex !== undefined && aIndex !== bIndex) {
        return aIndex - bIndex;
      }
      if (aIndex !== undefined) {
        return -1;
      }
      if (bIndex !== undefined) {
        return 1;
      }
      return a.record.name.localeCompare(b.record.name);
    });

    const drugs = sorted.map(({ record }) => {
      included.add(record.slug);
      return createDrugEntry(record);
    });

    if (drugs.length > 0) {
      groups.push({
        name: config.name,
        drugs,
      });
    }
  };

  configs.forEach((config) => addGroup(config));

  const remaining = contexts.filter((context) => !included.has(context.record.slug));
  if (remaining.length > 0) {
    groups.push(
      ...buildChemicalClassGroups(remaining.map((context) => context.record)),
    );
  }

  const otherPsychedelicsIndex = groups.findIndex(
    (group) => group.name === "Other psychedelics",
  );
  if (otherPsychedelicsIndex >= 0 && otherPsychedelicsIndex !== groups.length - 1) {
    const [otherGroup] = groups.splice(otherPsychedelicsIndex, 1);
    groups.push(otherGroup);
  }

  const otherEntactogensIndex = groups.findIndex(
    (group) => group.name === "Other entactogens",
  );
  if (otherEntactogensIndex >= 0 && otherEntactogensIndex !== groups.length - 1) {
    const [otherGroup] = groups.splice(otherEntactogensIndex, 1);
    groups.push(otherGroup);
  }

  const otherDeliriantsIndex = groups.findIndex(
    (group) => group.name === "Other deliriants",
  );
  if (otherDeliriantsIndex >= 0 && otherDeliriantsIndex !== groups.length - 1) {
    const [otherGroup] = groups.splice(otherDeliriantsIndex, 1);
    groups.push(otherGroup);
  }

  const otherStimulantsIndex = groups.findIndex((group) => group.name === "Other stimulants");
  if (otherStimulantsIndex >= 0 && otherStimulantsIndex !== groups.length - 1) {
    const [otherGroup] = groups.splice(otherStimulantsIndex, 1);
    groups.push(otherGroup);
  }

  const otherOpioidsIndex = groups.findIndex((group) => group.name === "Other opioids");
  if (otherOpioidsIndex >= 0 && otherOpioidsIndex !== groups.length - 1) {
    const [otherGroup] = groups.splice(otherOpioidsIndex, 1);
    groups.push(otherGroup);
  }

  const otherGabaergicsIndex = groups.findIndex(
    (group) => group.name === "Other GABAergics",
  );
  if (otherGabaergicsIndex >= 0 && otherGabaergicsIndex !== groups.length - 1) {
    const [otherGroup] = groups.splice(otherGabaergicsIndex, 1);
    groups.push(otherGroup);
  }

  const otherAntidepressantsIndex = groups.findIndex(
    (group) => group.name === OTHER_ANTIDEPRESSANTS_GROUP_NAME,
  );
  if (otherAntidepressantsIndex >= 0 && otherAntidepressantsIndex !== groups.length - 1) {
    const [otherGroup] = groups.splice(otherAntidepressantsIndex, 1);
    groups.push(otherGroup);
  }

  return groups;
}

function filterEntactogenRecords(records: SubstanceRecord[]): SubstanceRecord[] {
  return records.filter((record) => !ENTACTOGEN_EXCLUDED_NAMES.has(record.name));
}

function buildEntactogenDetailGroups(records: SubstanceRecord[]): CategoryDetailGroup[] {
  return buildConfiguredDetailGroups(
    filterEntactogenRecords(records),
    ENTACTOGEN_GROUP_CONFIG,
  );
}

function buildDeliriantDetailGroups(records: SubstanceRecord[]): CategoryDetailGroup[] {
  return buildConfiguredDetailGroups(records, DELIRIANT_GROUP_CONFIG);
}

function buildDissociativeDetailGroups(records: SubstanceRecord[]): CategoryDetailGroup[] {
  const filteredRecords = records.filter(
    (record) => !DISSOCIATIVE_EXCLUDED_NAMES.has(record.name),
  );
  return buildConfiguredDetailGroups(filteredRecords, DISSOCIATIVE_GROUP_CONFIG);
}

function buildPsychedelicDetailGroups(records: SubstanceRecord[]): CategoryDetailGroup[] {
  return buildConfiguredDetailGroups(records, PSYCHEDELIC_GROUP_CONFIG);
}

function buildOpioidDetailGroups(records: SubstanceRecord[]): CategoryDetailGroup[] {
  return buildConfiguredDetailGroups(records, OPIOID_GROUP_CONFIG);
}

function buildAntidepressantDetailGroups(records: SubstanceRecord[]): CategoryDetailGroup[] {
  return buildConfiguredDetailGroups(records, ANTIDEPRESSANT_GROUP_CONFIG);
}

function buildGabaergicDetailGroups(records: SubstanceRecord[]): CategoryDetailGroup[] {
  return buildConfiguredDetailGroups(records, GABAERGIC_GROUP_CONFIG);
}

function filterStimulantRecords(records: SubstanceRecord[]): SubstanceRecord[] {
  return records.filter((record) => {
    const normalizedCategories = new Set(
      (record.categories ?? [])
        .map((category) => normalizeCategoryKey(category))
        .filter((category) => category.length > 0),
    );

    for (const excludedKey of STIMULANT_EXCLUDED_CATEGORY_KEYS) {
      if (normalizedCategories.has(excludedKey)) {
        return false;
      }
    }

    return true;
  });
}

function buildStimulantDetailGroups(records: SubstanceRecord[]): CategoryDetailGroup[] {
  return buildConfiguredDetailGroups(records, STIMULANT_GROUP_CONFIG);
}

const DEFAULT_CHEMICAL_CLASS_ICON: LucideIcon = Hexagon;
const DEFAULT_MECHANISM_ICON: LucideIcon = Cog;

function buildChemicalClassIndexGroups(records: SubstanceRecord[]): DosageCategoryGroup[] {
  const bucketMap = new Map<
    string,
    {
      name: string;
      drugs: Map<string, DrugListEntry>;
    }
  >();

  records.forEach((record) => {
    const classes = record.chemicalClasses?.length
      ? record.chemicalClasses.map((entry) => entry.trim()).filter((entry) => entry.length > 0)
      : ["Unspecified"];

    classes.forEach((entry) => {
      const name = entry.trim();
      if (name.length === 0) {
        return;
      }

      const key = slugify(name);
      if (!bucketMap.has(key)) {
        bucketMap.set(key, {
          name,
          drugs: new Map(),
        });
      }

      const bucket = bucketMap.get(key)!;
      if (!bucket.drugs.has(record.slug)) {
        bucket.drugs.set(record.slug, createDrugEntry(record));
      }
    });
  });

  return Array.from(bucketMap.entries())
    .map(([key, bucket]) => {
      const drugs = Array.from(bucket.drugs.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );

      return {
        key,
        name: bucket.name,
        icon: DEFAULT_CHEMICAL_CLASS_ICON,
        total: drugs.length,
        drugs,
      } satisfies DosageCategoryGroup;
    })
    .filter((group) => group.total > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const dosageCategoryGroups = buildCategoryGroups(substanceRecords);
export const chemicalClassIndexGroups = buildChemicalClassIndexGroups(substanceRecords);

export function getCategoryDetail(categoryKey: string): CategoryDetail | null {
  const definition = findCategoryByKey(categoryKey);
  if (!definition) {
    return null;
  }

  if (CATEGORY_INDEX_EXCLUDED_KEYS.has(definition.key)) {
    return null;
  }

  const matchingRecords = substanceRecords.filter((record) =>
    resolveCategories(record).some((category) => category.key === definition.key),
  );

  let detailRecords = matchingRecords;
  let groups: CategoryDetailGroup[];

  if (definition.key === "deliriant") {
    groups = buildDeliriantDetailGroups(detailRecords);
  } else if (definition.key === "dissociative") {
    groups = buildDissociativeDetailGroups(detailRecords);
  } else if (definition.key === "psychedelic") {
    groups = buildPsychedelicDetailGroups(detailRecords);
  } else if (definition.key === "entactogen") {
    detailRecords = filterEntactogenRecords(detailRecords);
    groups = buildEntactogenDetailGroups(detailRecords);
  } else if (definition.key === "opioid") {
    groups = buildOpioidDetailGroups(detailRecords);
  } else if (definition.key === "stimulant") {
    detailRecords = filterStimulantRecords(detailRecords);
    groups = buildStimulantDetailGroups(detailRecords);
  } else if (definition.key === "antidepressant") {
    groups = buildAntidepressantDetailGroups(detailRecords);
  } else if (definition.key === "gabaergic") {
    groups = buildGabaergicDetailGroups(detailRecords);
  } else if (definition.key === "cannabinoid") {
    groups = buildCannabinoidDetailGroups(detailRecords);
  } else {
    groups = buildChemicalClassGroups(detailRecords);
  }

  return {
    definition,
    total: detailRecords.length,
    groups,
  };
}

const normalizeEffectSlug = (value: string): string => normalizeKey(value);

const normalizeMechanismSlug = (value: string): string => normalizeKey(value);

interface MechanismQualifierAccumulator {
  label: string;
  qualifier?: string;
  records: Set<SubstanceRecord>;
}

interface MechanismAccumulator {
  name: string;
  records: Set<SubstanceRecord>;
  qualifierMap: Map<string, MechanismQualifierAccumulator>;
}

const mechanismMap = new Map<string, MechanismAccumulator>();

function parseMechanismEntryLabel(entry: string): { base: string; qualifier?: string } {
  const trimmed = entry.trim();
  if (trimmed.length === 0) {
    return { base: trimmed };
  }

  const match = trimmed.match(/^(.*?)(?:\s*\(([^()]+)\))$/);
  if (match) {
    const base = match[1]?.trim() ?? "";
    const qualifier = match[2]?.trim();
    if (base.length > 0) {
      return {
        base,
        qualifier: qualifier && qualifier.length > 0 ? qualifier : undefined,
      };
    }
  }

  return { base: trimmed };
}

substanceRecords.forEach((record) => {
  const mechanismValue = resolveMechanismOfAction(record);
  if (!mechanismValue) {
    return;
  }

  const entries = mechanismValue
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const uniqueEntries = Array.from(new Set(entries));

  uniqueEntries.forEach((entry) => {
    const { base, qualifier } = parseMechanismEntryLabel(entry);
    const normalizedBase = base.trim();
    if (!normalizedBase) {
      return;
    }

    const slug = normalizeMechanismSlug(normalizedBase);
    if (!slug) {
      return;
    }

    if (!mechanismMap.has(slug)) {
      mechanismMap.set(slug, {
        name: normalizedBase,
        records: new Set(),
        qualifierMap: new Map(),
      });
    }

    const accumulator = mechanismMap.get(slug)!;
    accumulator.records.add(record);

    const qualifierKey = qualifier
      ? normalizeMechanismSlug(qualifier)
      : UNQUALIFIED_MECHANISM_QUALIFIER_KEY;
    if (!accumulator.qualifierMap.has(qualifierKey)) {
      accumulator.qualifierMap.set(qualifierKey, {
        label: qualifier ?? "general",
        qualifier: qualifier ?? undefined,
        records: new Set(),
      });
    }

    accumulator.qualifierMap.get(qualifierKey)!.records.add(record);
  });
});

const effectMap = new Map<string, { name: string; records: SubstanceRecord[] }>();

substanceRecords.forEach((record) => {
  const effects = record.content.subjectiveEffects ?? [];
  effects.forEach((effect) => {
    const slug = normalizeEffectSlug(effect);
    if (!slug) {
      return;
    }

    if (!effectMap.has(slug)) {
      effectMap.set(slug, { name: effect, records: [] });
    }

    effectMap.get(slug)!.records.push(record);
  });
});

export const effectSummaries: EffectSummary[] = Array.from(effectMap.entries())
  .map(([slug, entry]) => ({
    name: entry.name,
    slug,
    total: entry.records.length,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

function buildMechanismIndexGroups(): DosageCategoryGroup[] {
  return Array.from(mechanismMap.entries())
    .map(([key, entry]) => {
      const drugs = Array.from(entry.records)
        .map((record) => ({ name: record.name, slug: record.slug }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        key,
        name: entry.name,
        icon: DEFAULT_MECHANISM_ICON,
        total: drugs.length,
        drugs,
      } satisfies DosageCategoryGroup;
    })
    .filter((group) => group.total > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const mechanismSummaries: MechanismSummary[] = Array.from(mechanismMap.entries())
  .map(([slug, entry]) => ({
    name: entry.name,
    slug,
    total: entry.records.size,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const mechanismIndexGroups = buildMechanismIndexGroups();

export function getEffectDetail(effectSlug: string): EffectDetail | null {
  const slug = normalizeEffectSlug(effectSlug);
  const entry = effectMap.get(slug);
  if (!entry) {
    return null;
  }

  const groups = buildCategoryGroups(entry.records);

  return {
    definition: {
      name: entry.name,
      slug,
      total: entry.records.length,
    },
    groups,
  };
}

export function getEffectSummary(effectSlug: string): EffectSummary | undefined {
  const slug = normalizeEffectSlug(effectSlug);
  const entry = effectMap.get(slug);
  if (!entry) {
    return undefined;
  }
  return {
    name: entry.name,
    slug,
    total: entry.records.length,
  };
}

export function getMechanismDetail(mechanismSlug: string): MechanismDetail | null {
  const slug = normalizeMechanismSlug(mechanismSlug);
  const entry = mechanismMap.get(slug);
  if (!entry) {
    return null;
  }

  const qualifierDetails: MechanismQualifierDetail[] = Array.from(
    entry.qualifierMap.entries(),
  ).map(([key, qualifierEntry]) => {
    const records = Array.from(qualifierEntry.records);
    const groups = buildCategoryGroups(records);

    const isDefault = key === UNQUALIFIED_MECHANISM_QUALIFIER_KEY;
    const label = qualifierEntry.qualifier
      ? qualifierEntry.qualifier
      : "General (no qualifier)";

    return {
      key,
      label,
      qualifier: qualifierEntry.qualifier,
      total: records.length,
      groups,
    } satisfies MechanismQualifierDetail;
  });

  const sortedQualifiers = qualifierDetails.sort((a, b) => {
    if (a.key === UNQUALIFIED_MECHANISM_QUALIFIER_KEY) {
      return -1;
    }
    if (b.key === UNQUALIFIED_MECHANISM_QUALIFIER_KEY) {
      return 1;
    }
    return a.label.localeCompare(b.label);
  });

  const defaultQualifierKey = sortedQualifiers.find(
    (qualifier) => qualifier.key === UNQUALIFIED_MECHANISM_QUALIFIER_KEY,
  )
    ? UNQUALIFIED_MECHANISM_QUALIFIER_KEY
    : sortedQualifiers[0]?.key ?? UNQUALIFIED_MECHANISM_QUALIFIER_KEY;

  return {
    definition: {
      name: entry.name,
      slug,
      total: entry.records.size,
    },
    qualifiers: sortedQualifiers,
    defaultQualifierKey,
  };
}

export function getMechanismSummary(mechanismSlug: string): MechanismSummary | undefined {
  const slug = normalizeMechanismSlug(mechanismSlug);
  const entry = mechanismMap.get(slug);
  if (!entry) {
    return undefined;
  }

  return {
    name: entry.name,
    slug,
    total: entry.records.size,
  };
}

















