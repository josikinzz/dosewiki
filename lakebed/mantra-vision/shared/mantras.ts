export type MantraSource = {
  title: string;
  organization: string;
  url: string;
  supports: string;
};

export type MantraEntry = {
  id: "waterfall" | "namgyalma" | "phagpa" | "hung";
  title: string;
  shortTitle: string;
  lineageNote: string;
  mantra: string;
  tibetan: string;
  seedSyllables: string[];
  seedSyllablesTibetan: string[];
  traditionalClaim: string;
  gazeNote: string;
  viewingNote: string;
  respectNote: string;
  colors: {
    primary: string;
    secondary: string;
    halo: string;
  };
  sources: MantraSource[];
};

export type MantraVisualStrand = {
  id: string;
  title: string;
  shortTitle: string;
  tibetan: string;
  seedSyllablesTibetan: string[];
  traditionalClaim: string;
  colors: {
    primary: string;
    secondary: string;
    halo: string;
  };
  sources: MantraSource[];
};

export const MANTRA_ENTRIES: MantraEntry[] = [
  {
    id: "waterfall",
    title: "Liberation Upon Sight Mantra",
    shortTitle: "Waterfall",
    lineageNote: "Connected in Garchen materials with the Waterfall Sutra.",
    mantra: "OM HANU PHASHA BHARA HE YE SVAHA",
    tibetan: "ཨོཾ་ཧ་ནུ་པྷ་ཤ་བྷ་ར་ཧེ་ཡེ་སྭཱ་ཧཱ།",
    seedSyllables: ["OM", "HUM", "AH", "SVAHA"],
    seedSyllablesTibetan: ["ཨོཾ", "ཧཱུྃ", "ཨཱཿ", "སྭཱ་ཧཱ"],
    traditionalClaim:
      "Garchen Rinpoche's teaching presents this as a seeing-liberation mantra whose benefit is described in the Waterfall Sutra tradition.",
    gazeNote:
      "A slow peripheral orbit keeps the eye moving from center to edge, echoing a mantra placed where sight, wind, or movement can meet it.",
    viewingNote:
      "The outer ring repeats slowly so the eye can move between center and periphery without treating the timer as a measured efficacy dose.",
    respectNote:
      "Official Garchen images are sacred practice materials; this hosted capsule uses a self-authored schematic SVG and links to the sources.",
    colors: {
      primary: "#f0c76f",
      secondary: "#ef76b9",
      halo: "rgba(240, 199, 111, 0.24)",
    },
    sources: [
      {
        title: "HUNG Symbol & Liberation Upon Sight",
        organization: "Garchen Buddhist Institute",
        url: "https://garchen.net/wp-content/uploads/2020/07/HUNG-Symbol-Liberation-Upon-Sight-Eng-Text-20200113.pdf",
        supports: "Waterfall Sutra attribution and Garchen Rinpoche's benefit-language explanation.",
      },
      {
        title: "Mantras - Designed by Garchen Rinpoche",
        organization: "Taiwan Garchen Dharma Institute",
        url: "https://garchen.tw/English/Designed_by_Rinpoche/Mantras",
        supports: "Official Garchen-designed mantra listing and free download/print/use note.",
      },
    ],
  },
  {
    id: "namgyalma",
    title: "Namgyalma / Ushnisha Vijaya Dharani",
    shortTitle: "Namgyalma",
    lineageNote: "A long-life and purification practice emphasized in FPMT materials.",
    mantra: "OM BHRUM SVAHA / OM AMRITA AYUR DA DAI SVAHA",
    tibetan: "ཨོཾ་བྷྲཱུྃ་སྭཱ་ཧཱ། ཨོཾ་ཨ་མྲྀ་ཏ་ཨཱ་ཡུར་ད་དེ་སྭཱ་ཧཱ།",
    seedSyllables: ["OM", "BHRUM", "AMRITA", "AYUR"],
    seedSyllablesTibetan: ["ཨོཾ", "བྷྲཱུྃ", "ཨ་མྲྀ་ཏ", "ཨཱ་ཡུར"],
    traditionalClaim:
      "FPMT presents the Namgyalma mantra as a purification practice associated with lower-realm liberation, long life, and aid for the dying.",
    gazeNote:
      "The spiral arrangement uses repeated rings and a center point so attention can settle into a steady inward-outward rhythm.",
    viewingNote:
      "The spiral rings are an attention design, not a scientific model of karma, rebirth, health, or spiritual result.",
    respectNote:
      "The app avoids reproducing paid store artwork and uses transliteration plus abstract geometry.",
    colors: {
      primary: "#ff9d70",
      secondary: "#f2cf65",
      halo: "rgba(255, 157, 112, 0.23)",
    },
    sources: [
      {
        title: "Take a Look! Printed Colorful Namgyalma Mantra Card",
        organization: "FPMT",
        url: "https://fpmt.org/edu-news/take-a-look-printed-colorful-namgyalma-mantra-card/",
        supports: "FPMT's summary of Namgyalma mantra benefits and public practice context.",
      },
      {
        title: "The Benefits of Namgyalma Mantra",
        organization: "FPMT / Lama Zopa Rinpoche",
        url: "https://fpmt.org/wp-content/uploads/sites/2/2008/08/benefits_of_namgyalma.pdf",
        supports: "Tradition-attributed claims around hearing, banners, shadows, stupas, wind, and purification.",
      },
      {
        title: "Appendix 2: The 10 Powerful Mantras",
        organization: "Lama Yeshe Wisdom Archive",
        url: "https://www.lamayeshe.com/article/chapter/appendix-2-10-powerful-mantras",
        supports: "Published short Namgyalma mantra transliteration.",
      },
    ],
  },
  {
    id: "phagpa",
    title: "Phagpa Chulung Rolpai Do & Six Syllables of Clairvoyance",
    shortTitle: "Phagpa",
    lineageNote: "A pair of Lama Zopa Rinpoche calligraphy cards circulated by FPMT.",
    mantra: "OM HANU PHASHA BHARA HE YE SVAHA / A A SHA SA MA HA",
    tibetan: "ཨོཾ་ཧ་ནུ་པྷ་ཤ་བྷ་ར་ཧེ་ཡེ་སྭཱ་ཧཱ། ཨ་ཨ་ཤ་ས་མ་ཧ།",
    seedSyllables: ["OM", "A", "SHA", "SA", "MA", "HA"],
    seedSyllablesTibetan: ["ཨོཾ", "ཨ", "ཤ", "ས", "མ", "ཧ"],
    traditionalClaim:
      "FPMT describes this pair as mantras whose seeing is traditionally linked with purification.",
    gazeNote:
      "A horizontal talisman layout makes the two phrases scan like a public display card, with the eye crossing under and across the line.",
    viewingNote:
      "The horizontal form echoes a public display card while keeping the rendering separate from copyrighted calligraphy.",
    respectNote:
      "Original FPMT cards should be treated as lineage materials; this capsule uses a separate abstract talisman layout.",
    colors: {
      primary: "#f3bc59",
      secondary: "#f07d58",
      halo: "rgba(243, 188, 89, 0.24)",
    },
    sources: [
      {
        title: "Just by Seeing Mantras",
        organization: "FPMT",
        url: "https://fpmt.org/edu-news/just-by-seeing-mantras/",
        supports: "Names the two mantra cards, seeing benefits, and public display recommendation.",
      },
    ],
  },
  {
    id: "hung",
    title: "HUNG Symbol & The Three Supremes",
    shortTitle: "HUNG",
    lineageNote: "A Garchen Rinpoche explanation of HUNG and the Three Supremes logo.",
    mantra: "HUM / Three Jewels / Three Roots / Three Kayas",
    tibetan: "ཧཱུྃ། དཀོན་མཆོག་གསུམ། རྩ་བ་གསུམ། སྐུ་གསུམ།",
    seedSyllables: ["HUM", "JEWELS", "ROOTS", "KAYA"],
    seedSyllablesTibetan: ["ཧཱུྃ", "དཀོན", "རྩ་བ", "སྐུ"],
    traditionalClaim:
      "Garchen Rinpoche explains the HUNG symbol as containing the ground, path, and fruition through the Three Jewels, Three Roots, and Three Kayas.",
    gazeNote:
      "The central seed, triad labels, and outer ring are staged as an interdependence diagram rather than a decorative emblem.",
    viewingNote:
      "The central seed, triad labels, and outer ring are staged as a symbolic diagram rather than a decorative logo copy.",
    respectNote:
      "The official Garchen page lists Sanskrit and Tibetan logo files; this app links to them and uses a self-authored schematic.",
    colors: {
      primary: "#eadc8a",
      secondary: "#b993ff",
      halo: "rgba(185, 147, 255, 0.24)",
    },
    sources: [
      {
        title: "HUNG Symbol & Liberation Upon Sight",
        organization: "Garchen Buddhist Institute",
        url: "https://garchen.net/wp-content/uploads/2020/07/HUNG-Symbol-Liberation-Upon-Sight-Eng-Text-20200113.pdf",
        supports: "HUNG origin, Three Jewels/Roots/Kayas interpretation, and relation to the liberation-upon-sight mantra.",
      },
      {
        title: "Mantras - Designed by Garchen Rinpoche",
        organization: "Taiwan Garchen Dharma Institute",
        url: "https://garchen.tw/English/Designed_by_Rinpoche/Mantras",
        supports: "Official listing of Sanskrit and Tibetan Three Supremes liberation-upon-seeing logo files.",
      },
    ],
  },
];

export const ADDITIONAL_VISUAL_MANTRAS: MantraVisualStrand[] = [
  {
    id: "clairvoyance",
    title: "Six Syllables of Clairvoyance",
    shortTitle: "Six Syllables",
    tibetan: "ཨ་ཨ་ཤ་ས་མ་ཧ།",
    seedSyllablesTibetan: ["ཨ", "ཨ", "ཤ", "ས", "མ", "ཧ"],
    traditionalClaim:
      "FPMT and Lama Zopa Rinpoche materials describe the Six Syllables of Clairvoyance as a public-display mantra whose seeing is linked with purification.",
    colors: {
      primary: "#f5ba63",
      secondary: "#ee896c",
      halo: "rgba(238, 137, 108, 0.2)",
    },
    sources: [
      {
        title: "Six Syllables of Profound Meaning",
        organization: "FPMT / Lama Zopa Rinpoche",
        url: "https://fpmt.org/lama-zopa-rinpoche-news-and-advice/lama-zopa-rinpoche-news/six-syllables-of-profound-meaning/",
        supports: "Public-display advice and seeing benefits for the Six Syllables of Clairvoyance.",
      },
    ],
  },
  {
    id: "mani",
    title: "OM MANI PADME HUM / Chenrezig Mantra",
    shortTitle: "Mani",
    tibetan: "ཨོཾ་མ་ཎི་པདྨེ་ཧཱུྃ།",
    seedSyllablesTibetan: ["ཨོཾ", "མ", "ཎི", "པདྨེ", "ཧཱུྃ"],
    traditionalClaim:
      "Lama Zopa Rinpoche's advice says that even seeing the syllables OM MANI PADME HUM is traditionally described as purifying heavy negative karma.",
    colors: {
      primary: "#bde78d",
      secondary: "#81d7d1",
      halo: "rgba(129, 215, 209, 0.18)",
    },
    sources: [
      {
        title: "Mental Illness and the Chenrezig Mantra",
        organization: "FPMT / Lama Zopa Rinpoche",
        url: "https://fpmt.org/lama-zopa-rinpoche-news-and-advice/advice-from-lama-zopa-rinpoche/mental-illness-and-the-chenrezig-mantra/",
        supports: "Seeing the syllables OM MANI PADME HUM as a traditional purification claim.",
      },
    ],
  },
];

export const MANTRA_VISUAL_STRANDS: MantraVisualStrand[] = [
  ...MANTRA_ENTRIES.map((entry) => ({
    id: entry.id,
    title: entry.title,
    shortTitle: entry.shortTitle,
    tibetan: entry.tibetan,
    seedSyllablesTibetan: entry.seedSyllablesTibetan,
    traditionalClaim: entry.traditionalClaim,
    colors: entry.colors,
    sources: entry.sources,
  })),
  ...ADDITIONAL_VISUAL_MANTRAS,
];

export const GAZE_SECOND_PRESETS = [9, 21, 54, 108] as const;
export const GAZE_SECONDS = GAZE_SECOND_PRESETS;
