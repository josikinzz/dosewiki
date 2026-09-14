type MantraSource = {
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
  usageNotes: string[];
  color: {
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
  color: {
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
    mantra: "OṂ HANU PHASHA BHARA HE YE SVĀHĀ",
    tibetan: "ཨོཾ་ཧ་ནུ་པྷ་ཤ་བྷ་ར་ཧེ་ཡེ་སྭཱ་ཧཱ།",
    seedSyllables: ["OṂ", "HŪṂ", "ĀḤ", "SVĀHĀ"],
    seedSyllablesTibetan: ["ཨོཾ", "ཧཱུྃ", "ཨཱཿ", "སྭཱ་ཧཱ"],
    traditionalClaim:
      "Garchen Rinpoche's teaching presents this as a seeing-liberation mantra whose benefit is described in the Waterfall Sutra tradition.",
    gazeNote:
      "A slow peripheral orbit keeps the eye moving from center to edge, echoing the idea of a mantra placed where sight, wind, or movement can meet it.",
    usageNotes: [
      "Shown here as a contemplative visualization, not as a guarantee of spiritual outcome.",
      "Official Garchen images should be treated as sacred practice material.",
    ],
    color: {
      primary: "oklch(82% 0.12 83)",
      secondary: "oklch(72% 0.16 326)",
      halo: "oklch(65% 0.18 35 / 0.26)",
    },
    sources: [
      {
        title: "HUNG Symbol & Liberation Upon Sight",
        organization: "Garchen Buddhist Institute",
        url: "https://garchen.net/wp-content/uploads/2020/07/HUNG-Symbol-Liberation-Upon-Sight-Eng-Text-20200113.pdf",
        supports:
          "Garchen Rinpoche's explanation of the liberation-upon-sight mantra, its Waterfall Sutra attribution, and benefit language.",
      },
      {
        title: "Mantras - Designed by Garchen Rinpoche",
        organization: "Taiwan Garchen Dharma Institute",
        url: "https://garchen.tw/English/Designed_by_Rinpoche/Mantras",
        supports:
          "Official Garchen-designed mantra downloads and the note that the images may be downloaded, printed, and used freely.",
      },
    ],
  },
  {
    id: "namgyalma",
    title: "Namgyalma / Ushnisha Vijaya Dharani",
    shortTitle: "Namgyalma",
    lineageNote: "A long-life and purification practice emphasized in FPMT materials.",
    mantra: "OṂ BHRŪṂ SVĀHĀ / OṂ AMṚTA ĀYUR DA DAI SVĀHĀ",
    tibetan: "ཨོཾ་བྷྲཱུྃ་སྭཱ་ཧཱ། ཨོཾ་ཨ་མྲྀ་ཏ་ཨཱ་ཡུར་ད་དེ་སྭཱ་ཧཱ།",
    seedSyllables: ["OṂ", "BHRŪṂ", "AMṚTA", "ĀYUR"],
    seedSyllablesTibetan: ["ཨོཾ", "བྷྲཱུྃ", "ཨ་མྲྀ་ཏ", "ཨཱ་ཡུར"],
    traditionalClaim:
      "FPMT presents the Namgyalma mantra as a powerful purification practice associated with lower-realm liberation, long life, and aid for the dying.",
    gazeNote:
      "The spiral arrangement uses repeated rings and a center point so attention can settle into a steady inward-outward rhythm.",
    usageNotes: [
      "The shadow, wind, stupa, banner, and hearing/touching claims are tradition-attributed teachings.",
      "The app uses transliteration and abstract geometry rather than reproducing paid store artwork.",
    ],
    color: {
      primary: "oklch(76% 0.16 28)",
      secondary: "oklch(79% 0.13 91)",
      halo: "oklch(62% 0.18 18 / 0.24)",
    },
    sources: [
      {
        title: "Take a Look! Printed Colorful Namgyalma Mantra Card",
        organization: "FPMT",
        url: "https://fpmt.org/edu-news/take-a-look-printed-colorful-namgyalma-mantra-card/",
        supports:
          "FPMT's summary of Namgyalma mantra benefits and public practice context.",
      },
      {
        title: "The Benefits of Namgyalma Mantra",
        organization: "FPMT / Lama Zopa Rinpoche",
        url: "https://fpmt.org/wp-content/uploads/sites/2/2008/08/benefits_of_namgyalma.pdf",
        supports:
          "Detailed tradition-attributed claims around hearing, banners, shadows, stupas, wind, and purification.",
      },
      {
        title: "Appendix 2: The 10 Powerful Mantras",
        organization: "Lama Yeshe Wisdom Archive",
        url: "https://www.lamayeshe.com/article/chapter/appendix-2-10-powerful-mantras",
        supports:
          "A published short Namgyalma mantra transliteration used for the visualization text.",
      },
    ],
  },
  {
    id: "phagpa",
    title: "Phagpa Chulung Rolpai Do & Six Syllables of Clairvoyance",
    shortTitle: "Phagpa",
    lineageNote: "A pair of Lama Zopa Rinpoche calligraphy cards circulated by FPMT.",
    mantra: "OṂ HANU PHASHA BHARA HE YE SVĀHĀ / A A SHA SA MA HA",
    tibetan: "ཨོཾ་ཧ་ནུ་པྷ་ཤ་བྷ་ར་ཧེ་ཡེ་སྭཱ་ཧཱ། ཨ་ཨ་ཤ་ས་མ་ཧ།",
    seedSyllables: ["OṂ", "A", "SHA", "SA", "MA", "HA"],
    seedSyllablesTibetan: ["ཨོཾ", "ཨ", "ཤ", "ས", "མ", "ཧ"],
    traditionalClaim:
      "FPMT describes the Phagpa Chulung Rolpai Do mantra and the Six Syllables of Clairvoyance as mantras whose seeing is traditionally linked with purification.",
    gazeNote:
      "A horizontal talisman layout makes the two phrases scan like a public display card, with the eye crossing under and across the line.",
    usageNotes: [
      "The claims are presented as FPMT/Lama Zopa tradition statements.",
      "The original cards feature Lama Zopa Rinpoche's calligraphy; this app uses a separate abstract SVG rendering.",
    ],
    color: {
      primary: "oklch(79% 0.18 69)",
      secondary: "oklch(64% 0.16 35)",
      halo: "oklch(69% 0.16 70 / 0.25)",
    },
    sources: [
      {
        title: "Just by Seeing Mantras",
        organization: "FPMT",
        url: "https://fpmt.org/edu-news/just-by-seeing-mantras/",
        supports:
          "Names the two mantra cards, describes their tradition-attributed seeing benefits, and recommends public display.",
      },
    ],
  },
  {
    id: "hung",
    title: "HUNG Symbol & The Three Supremes",
    shortTitle: "HUNG",
    lineageNote: "A Garchen Rinpoche explanation of HUNG and the Three Supremes logo.",
    mantra: "HŪṂ • Three Jewels • Three Roots • Three Kayas",
    tibetan: "ཧཱུྃ། དཀོན་མཆོག་གསུམ། རྩ་བ་གསུམ། སྐུ་གསུམ།",
    seedSyllables: ["HŪṂ", "JEWELS", "ROOTS", "KĀYA"],
    seedSyllablesTibetan: ["ཧཱུྃ", "དཀོན", "རྩ་བ", "སྐུ"],
    traditionalClaim:
      "Garchen Rinpoche explains the HUNG symbol as containing the ground, path, and fruition through the Three Jewels, Three Roots, and Three Kayas.",
    gazeNote:
      "The central seed, triad labels, and outer ring are staged as an interdependence diagram rather than a decorative emblem.",
    usageNotes: [
      "The official Garchen source also discusses the outer liberation-upon-sight mantra.",
      "The visualization is self-authored and intentionally schematic.",
    ],
    color: {
      primary: "oklch(78% 0.1 94)",
      secondary: "oklch(72% 0.16 293)",
      halo: "oklch(61% 0.17 295 / 0.25)",
    },
    sources: [
      {
        title: "HUNG Symbol & Liberation Upon Sight",
        organization: "Garchen Buddhist Institute",
        url: "https://garchen.net/wp-content/uploads/2020/07/HUNG-Symbol-Liberation-Upon-Sight-Eng-Text-20200113.pdf",
        supports:
          "HUNG symbol origin, Three Jewels/Roots/Kayas interpretation, and relationship to the liberation-upon-sight mantra.",
      },
      {
        title: "Mantras - Designed by Garchen Rinpoche",
        organization: "Taiwan Garchen Dharma Institute",
        url: "https://garchen.tw/English/Designed_by_Rinpoche/Mantras",
        supports:
          "Official listing of Sanskrit and Tibetan Three Supremes liberation-upon-seeing logo files.",
      },
    ],
  },
];

const ADDITIONAL_VISUAL_MANTRAS: MantraVisualStrand[] = [
  {
    id: "clairvoyance",
    title: "Six Syllables of Clairvoyance",
    shortTitle: "Six Syllables",
    tibetan: "ཨ་ཨ་ཤ་ས་མ་ཧ།",
    seedSyllablesTibetan: ["ཨ", "ཨ", "ཤ", "ས", "མ", "ཧ"],
    traditionalClaim:
      "FPMT and Lama Zopa Rinpoche materials describe the Six Syllables of Clairvoyance as a public-display mantra whose seeing is linked with purification.",
    color: {
      primary: "oklch(80% 0.16 52)",
      secondary: "oklch(74% 0.13 24)",
      halo: "oklch(66% 0.15 45 / 0.2)",
    },
    sources: [
      {
        title: "Six Syllables of Profound Meaning",
        organization: "FPMT / Lama Zopa Rinpoche",
        url: "https://fpmt.org/lama-zopa-rinpoche-news-and-advice/lama-zopa-rinpoche-news/six-syllables-of-profound-meaning/",
        supports:
          "Lama Zopa Rinpoche's public-display advice and tradition-attributed seeing benefits for the Six Syllables of Clairvoyance.",
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
    color: {
      primary: "oklch(82% 0.11 126)",
      secondary: "oklch(76% 0.12 185)",
      halo: "oklch(65% 0.11 156 / 0.18)",
    },
    sources: [
      {
        title: "Mental Illness and the Chenrezig Mantra",
        organization: "FPMT / Lama Zopa Rinpoche",
        url: "https://fpmt.org/lama-zopa-rinpoche-news-and-advice/advice-from-lama-zopa-rinpoche/mental-illness-and-the-chenrezig-mantra/",
        supports:
          "Lama Zopa Rinpoche's advice that seeing the syllables OM MANI PADME HUM is traditionally associated with purification.",
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
    color: entry.color,
    sources: entry.sources,
  })),
  ...ADDITIONAL_VISUAL_MANTRAS,
];

export const SOURCE_LEDGER = MANTRA_VISUAL_STRANDS.flatMap((entry) =>
  entry.sources.map((source) => ({
    ...source,
    mantraTitle: entry.shortTitle,
  })),
);
