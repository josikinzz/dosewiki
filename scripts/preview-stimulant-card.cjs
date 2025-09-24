const fs = require("fs");
const path = require("path");

const normalizeKey = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();

const splitToList = (value) => {
  if (!value) return [];
  return value
    .split(/[;,/]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
};

const articles = JSON.parse(fs.readFileSync(path.join("src", "data", "articles.json"), "utf8"));

const records = articles
  .map((article) => {
    const info = article?.drug_info;
    if (!info?.drug_name) return null;
    const categories = Array.isArray(info.categories) ? info.categories : [];
    const normalizedCategories = new Set(categories.map((category) => normalizeKey(category)));
    if (!normalizedCategories.has("stimulant")) return null;
    const chemicalClasses = splitToList(info.chemical_class);
    return {
      name: info.drug_name,
      categories,
      normalizedCategories,
      chemicalClasses,
    };
  })
  .filter(Boolean);

const OTHER_STIMULANT_CATEGORY_KEY = normalizeKey("other stimulants");

const configs = [
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
    filter: (context) => context.normalizedCategories.has("common"),
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
      "Butylone (βk-MBDB)",
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
      "3-Methyl-4-fluoro-α-pyrrolidinovalerophenone",
      "3,4-Dimethoxy-α-PHP (DMO-PHP)",
      "4-Fluoro-alpha-PHP (4F-PHP)",
      "4-Fluoro-α-pyrrolidinopropiophenone (4F-PPP)",
      "4-MEPPP",
      "5-DBFPV",
      "alpha-D2PV (α-D2PV, a-D2PV, 2-Diphenylmethylpyrrolidin-1-ylpentan-1-one)",
      "alpha-PiHP (A-PiHP)",
      "alpha-Pyrrolidinohexiophenone (a-PHP)",
      "MD-PHP",
      "MD-PiHP",
      "MD-prolintane",
      "MDPV",
      "Prolintane",
      "Pyrovalerone",
      "α-PCYP (alpha-PyrrolidinoCyclohexanoPhenone)",
      "α-Pyrrolidinopentiophenone (α-PVP, Flakka, Gravel, A-PVP)",
      "α-Pyrrolidinopropiophenone",
    ],
    filter: (context) =>
      context.chemicalClasses.some(
        (entry) => normalizeKey(entry) === normalizeKey("Substituted pyrrolidines"),
      ),
  },
  {
    name: "Tropanes",
    order: ["Cocaine", "Cocaethylene"],
    filter: (context) =>
      context.chemicalClasses.some((entry) => normalizeKey(entry) === normalizeKey("Tropanes")),
  },
  {
    name: "Xanthines",
    order: ["Caffeine"],
    filter: (context) =>
      context.chemicalClasses.some((entry) => normalizeKey(entry) === normalizeKey("Xanthines")),
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
      context.chemicalClasses.some((entry) => normalizeKey(entry) === normalizeKey("Piperazines")),
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
    order: ["1,4-DMAA (1,4-dimethylamylamine)", "DMHA (Octodrine)"],
    filter: (context) =>
      context.chemicalClasses.some((entry) => normalizeKey(entry) === normalizeKey("Alkyl amines")),
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
    order: ["2-Aminoindane (2-AI)", "NM-2-AI"],
    filter: (context) =>
      context.chemicalClasses.some((entry) => normalizeKey(entry) === normalizeKey("Aminoindanes")),
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
      context.chemicalClasses.some((entry) => normalizeKey(entry) === normalizeKey("Aminorexes")),
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
    filter: (context) => context.normalizedCategories.has(OTHER_STIMULANT_CATEGORY_KEY),
  },
];

function buildGroups(records, configs) {
  const contexts = records.map((record) => ({
    record,
    normalizedCategories: record.normalizedCategories,
    chemicalClasses: record.chemicalClasses,
  }));

  const groups = [];
  const included = new Set();

  const addGroup = (config) => {
    const matches = contexts.filter((context) => config.filter(context));
    if (matches.length === 0) return
    const orderMap = new Map(config.order.map((name, index) => [normalizeKey(name), index]));
    const sorted = matches.slice().sort((a, b) => {
      const aKey = normalizeKey(a.record.name);
      const bKey = normalizeKey(b.record.name);
      const aIndex = orderMap.get(aKey);
      const bIndex = orderMap.get(bKey);
      if (aIndex !== undefined && bIndex !== undefined && aIndex !== bIndex) {
        return aIndex - bIndex;
      }
      if (aIndex !== undefined) return -1;
      if (bIndex !== undefined) return 1;
      return a.record.name.localeCompare(b.record.name);
    });

    if (sorted.length > 0) {
      groups.push({
        name: config.name,
        drugs: sorted.map(({ record }) => {
          included.add(record.name);
          return record.name;
        }),
      });
    }
  };

  configs.forEach(addGroup);

  const remaining = contexts.filter((context) => !included.has(context.record.name));
  if (remaining.length > 0) {
    const chemicalMap = new Map();
    remaining.forEach((context) => {
      const list = context.record.chemicalClasses.length > 0 ? context.record.chemicalClasses : ["Unspecified"];
      list.forEach((chemicalClass) => {
        const key = chemicalClass.trim();
        if (!chemicalMap.has(key)) chemicalMap.set(key, []);
        chemicalMap.get(key).push(context.record.name);
      });
    });
    Array.from(chemicalMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([name, drugs]) => {
        groups.push({
          name,
          drugs: drugs.sort((a, b) => a.localeCompare(b)),
        });
      });
  }

  return groups;
}

const stimulantGroups = buildGroups(records, configs);
console.log(JSON.stringify(stimulantGroups, null, 2));
