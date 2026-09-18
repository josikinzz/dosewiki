/**
 * The FreeODwiki target shape: which of their trees each page kind lands in,
 * the reuse terms each corpus travels under, and the fixed labels for the
 * closed sets (dose tiers, duration stages, routes, statuses, effect groups)
 * that never went through the translator because they are structure. Every
 * label exists in both locales the exporter emits, so the English tree is a
 * true line-for-line counterpart of the Chinese one. Pure data; the renderer
 * and the page builders read it through `labelsFor(locale)`.
 */

export const SITE = "https://dose.wiki";

/** Their content trees, keyed by the kind of page that lives in each. */
const ZH_TREE = Object.freeze({
  substance: "药物",
  effect: "药效",
  report: "报告",
  article: "文档",
});

/**
 * Directories their drug pages already link into that do not exist in their
 * repository: `报告/` holds only `erowid/`, `overspeedwiki/`, `reddit/` and
 * `杂项/`. A link resolving here is dropped rather than published dangling.
 */
const ZH_DANGLING_TARGET_PREFIXES = Object.freeze(["/报告/psychounautwiki/"]);

/**
 * What each page says about its source terms. Nothing is withheld on licence
 * grounds: the site owner sends the whole corpus, and each page states the
 * terms its record actually carries so the receiving wiki can decide.
 */
const ZH_LICENCE = Object.freeze({
  substances: { statement: "CC0 1.0（公有领域贡献）" },
  effects: { statement: "CC0 1.0（公有领域贡献）" },
  articles: { statement: "CC0 1.0（公有领域贡献）" },
  summaries: { statement: "CC0 1.0（公有领域贡献）" },
  effectCategories: { statement: "CC0 1.0（公有领域贡献）" },
  reports: {
    statement: "CC0 1.0（投稿人的公有领域贡献）",
    /**
     * Legacy reports are contributor-authored and author-retained by default;
     * a report carrying its own `public-domain` marker is CC0. Mirrors
     * `resolveTripReportLicense` in src/types/tripReport.ts.
     */
    perRecord: (item) => (item.license === "public-domain"
      ? { license: "public-domain", statement: "CC0 1.0（投稿人的公有领域贡献）", translation: "译文按 FreeODwiki 的 CC BY-SA 4.0 发布。" }
      : { license: "author-retained", statement: "作者保留全部权利（author-retained）", translation: "译文沿用原作者的保留条款，随 dose.wiki 的公开发表一并提供，不构成重新授权。" }),
  },
});

/** Interaction tiers in the site's severity order, with their page headings. */
const ZH_INTERACTION_TIERS = Object.freeze([
  ["dangerous", "危险"],
  ["unsafe", "不安全"],
  ["caution", "谨慎"],
]);

/** Fixed row orders. A reader compares tiers across pages, so they never move. */
const ZH_DOSE_TIERS = Object.freeze([
  ["threshold", "阈值"],
  ["light", "轻微"],
  ["moderate", "中等"],
  ["strong", "强烈"],
  ["heavy", "严重"],
]);

const ZH_DURATION_STAGES = Object.freeze([
  ["onset", "药效发作"],
  ["come_up", "药效上升"],
  ["peak", "药效达峰"],
  ["offset", "药效褪去"],
  ["after_effects", "药效残余"],
  ["total_duration", "总时长"],
]);

const ZH_ROUTE_LABELS = Object.freeze({
  oral: "口服",
  sublingual: "舌下",
  buccal: "含服",
  insufflated: "鼻腔吸入",
  intranasal: "鼻腔吸入",
  smoked: "吸食",
  vaporized: "汽化吸入",
  inhaled: "吸入",
  intravenous: "静脉注射",
  intramuscular: "肌肉注射",
  subcutaneous: "皮下注射",
  rectal: "直肠给药",
  transdermal: "透皮",
});

const ZH_UNIT_LABELS = Object.freeze({
  seconds: "秒",
  minutes: "分钟",
  hours: "小时",
  days: "天",
});

const ZH_STATUS_LABELS = Object.freeze({
  prohibited: "禁止",
  legal: "合法",
  decriminalized: "非刑事化",
  regulated: "受管制",
  prescription: "处方药",
  unscheduled: "未列管",
  restricted: "受限",
  unknown: "不明",
});

/**
 * `subjective_effects` groups its entries under freeform keys that never
 * travelled to the translator: they are structure, not prose. `general` and
 * `effects` mean "no grouping", so their heading is dropped rather than
 * printed as an English word on a Chinese page. An unlisted key survives
 * as-authored rather than being guessed at.
 */
const ZH_GROUP_LABELS = Object.freeze({
  general: null,
  effects: null,
  auditory: "听觉",
  visual: "视觉",
  tactile: "触觉",
  gustatory: "味觉",
  olfactory: "嗅觉",
  multisensory: "多感官",
  crossmodal: "跨感官",
  emotional: "情绪",
  uncomfortable: "不适",
  comfortable: "舒适",
  comfort: "舒适",
  sedation: "镇静",
  sedating: "镇静",
  stimulation: "兴奋",
  stimulating: "兴奋",
  suppression: "抑制",
  suppressions: "抑制",
  enhancement: "增强",
  enhancements: "增强",
  impairment: "功能损害",
  impairing: "功能损害",
  cardiovascular: "心血管",
  autonomic: "自主神经",
  social: "社交",
  coordination: "协调性",
  motor: "运动",
  transpersonal: "超个人",
  bodily: "躯体",
  disconnective: "断连",
  dissociative: "解离",
  dissociating: "解离",
  perception: "知觉",
  analytical: "分析",
  distortion: "扭曲",
  distortions: "扭曲",
  geometry: "几何",
  hallucinatory: "幻觉",
  hallucinations: "幻觉",
  "hallucinatory states": "幻觉状态",
  respiratory: "呼吸",
  respiratory_depression: "呼吸抑制",
  novel: "新奇",
  disorienting: "定向障碍",
  disinhibitory: "去抑制",
  disruptive: "干扰",
  disturbances: "紊乱",
  psychological: "心理",
  psychosis: "精神病性",
  delusional: "妄想",
  depressant: "抑制性",
  analgesia: "镇痛",
  sexual: "性相关",
  libido: "性欲",
  libidinal: "性欲",
  neurological: "神经系统",
  temporal: "时间",
  temperature: "体温",
  adverse: "不良",
  dangerous: "危险",
  paradoxical: "反常",
  euphoria: "欣快",
  "high dose": "高剂量",
  anticholinergic: "抗胆碱",
  relaxation: "放松",
  after_effects: "药效残余",
  compulsion: "强迫",
  compulsive: "强迫",
  hypervigilance: "过度警觉",
  motivational: "动机",
  behavioral: "行为",
  sleep: "睡眠",
  other: "其他",
});

function zhGroupLabel(key) {
  const normalised = String(key ?? "").trim().toLowerCase();
  if (normalised.length === 0) return null;
  return Object.hasOwn(ZH_GROUP_LABELS, normalised) ? ZH_GROUP_LABELS[normalised] : String(key).trim();
}

/** English group keys are already words; they only need a capital. */
function enGroupLabel(key) {
  const normalised = String(key ?? "").trim().toLowerCase();
  if (normalised.length === 0) return null;
  if (normalised === "general" || normalised === "effects") return null;
  const words = normalised.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Page chrome that is prose rather than a closed-set label. */
const ZH_UI = Object.freeze({
  back: "◀返回",
  colon: "：",
  listSeparator: "、",
  doseGuide: "💊 剂量指南",
  durationGuide: "⏱️ 药效时长",
  routeUnknown: "未标注给药途径",
  withRoute: (label, route) => `${label}（${route}）`,
  doseHeader: "| 强度 | 剂量范围 |",
  durationHeader: "| 阶段 | 时间 |",
  rangeAtLeast: (value) => `${value} 以上`,
  rangeAtMost: (value) => `${value} 以下`,
  physicalEffects: "躯体效应",
  cognitiveEffects: "认知效应",
  sensoryEffects: "感官效应",
  harm: { addiction: "成瘾潜力", toxicity: "毒性", psychosis: "精神病风险", seizure: "惊厥风险" },
  harmSub: {
    physical_dependence: "躯体依赖",
    psychological: "心理成瘾",
    lethal_dosage: "致死剂量",
    organ_toxicity: "器官毒性",
    carcinogenicity: "致癌性",
    antibiotic_function: "抗生素功能",
    other: "其他毒性",
  },
  internationalConventions: "国际公约",
  legalStatusByCountry: "各国法律地位",
  legalityHeader: "| 国家或地区 | 状态 | 分类 | 法规依据 |",
  countryNotes: "各国备注",
  pharmacology: "药理学",
  bindingHeader: "| 靶点 | 作用 | 亲和力 |",
  subjectiveEffects: "主观效应",
  tolerance: "耐受性",
  baselineTolerance: "基线耐受",
  fullTolerance: "完全耐受",
  halfTolerance: "半量恢复",
  crossTolerance: "交叉耐受",
  harmPotential: "毒性与伤害潜力",
  interactions: "相互作用",
  historyCulture: "历史与文化",
  legality: "法律地位",
  longSummary: "详细描述",
  styleVariations: "风格变体",
  analysis: "分析",
  personalCommentary: "个人评述",
  seeAlso: "另见",
  summaryEffectsIntro: "本节收录的效应：",
  categoryEffectsIntro: (count) => `本类别包含 ${count} 种效应：`,
  artworkCredit: (title, artist) => `配图：《${title}》，作者 ${artist}`,
  externalLinks: "外部链接",
  references: "参考文献",
  quotedFrom: "引自",
  reportFacts: { name: "投稿人", age: "年龄", gender: "性别", weight: "体重", height: "身高", setting: "情境", trip_date: "日期" },
  reportFactsHeader: "| 项目 | 内容 |",
  reportSubstance: "物质",
  reportSections: { introduction: "引言", onset: "药效发作", peak: "药效达峰", offset: "药效褪去", conclusion: "结语" },
  sourceHeading: "来源与授权",
  sourceLine: (title, url) => `本页由 [dose.wiki](${SITE}) 的《${title}》条目汉化而来，原文见 <${url}>。`,
  licenceLine: (licence, translation) => `原文授权：${licence}。${translation}`,
  defaultTranslationLine: "译文按 FreeODwiki 的 CC BY-SA 4.0 发布。",
  snapshotLine: (date) => `数据快照：${date || "未标注"}。`,
  patchPreamble: (tree) => `粘贴到 ${tree}/index.md 中；该页由人工维护，本文件只是待并入的片段。`,
  patches: {
    substance: { heading: "## dose.wiki 汉化药物条目", note: "本节列出本次导出的药物页面，原索引的分类表格保持不动。" },
    effect: { heading: "### dose.wiki 汉化药效条目", note: "本节列出本次导出的药效页面，原索引的分类层级保持不动。" },
    report: { heading: "## dose.wiki 汉化报告", note: "追加到「FreeODwiki报告列表」之后即可。" },
    article: { heading: "## dose.wiki 汉化长文", note: "追加到文档索引的正文末尾即可。" },
  },
});

const EN_TREE = Object.freeze({ substance: "substances", effect: "effects", report: "reports", article: "articles" });
const EN_DANGLING_TARGET_PREFIXES = Object.freeze(["/reports/psychounautwiki/"]);

const EN_LICENCE = Object.freeze({
  substances: { statement: "CC0 1.0 (public domain dedication)" },
  effects: { statement: "CC0 1.0 (public domain dedication)" },
  articles: { statement: "CC0 1.0 (public domain dedication)" },
  summaries: { statement: "CC0 1.0 (public domain dedication)" },
  effectCategories: { statement: "CC0 1.0 (public domain dedication)" },
  reports: {
    statement: "CC0 1.0 (the contributor's public domain dedication)",
    perRecord: (item) => (item.license === "public-domain"
      ? { license: "public-domain", statement: "CC0 1.0 (the contributor's public domain dedication)", translation: "This is the English source text, unchanged." }
      : { license: "author-retained", statement: "Author retains all rights (author-retained)", translation: "This is the English source text, unchanged; it is shared as published on dose.wiki and is not a relicence." }),
  },
});

const EN_INTERACTION_TIERS = Object.freeze([["dangerous", "Dangerous"], ["unsafe", "Unsafe"], ["caution", "Caution"]]);
const EN_DOSE_TIERS = Object.freeze([["threshold", "Threshold"], ["light", "Light"], ["moderate", "Common"], ["strong", "Strong"], ["heavy", "Heavy"]]);
const EN_DURATION_STAGES = Object.freeze([
  ["onset", "Onset"],
  ["come_up", "Come up"],
  ["peak", "Peak"],
  ["offset", "Offset"],
  ["after_effects", "After effects"],
  ["total_duration", "Total"],
]);
const EN_ROUTE_LABELS = Object.freeze({
  oral: "Oral",
  sublingual: "Sublingual",
  buccal: "Buccal",
  insufflated: "Insufflated",
  intranasal: "Insufflated",
  smoked: "Smoked",
  vaporized: "Vaporised",
  inhaled: "Inhaled",
  intravenous: "Intravenous",
  intramuscular: "Intramuscular",
  subcutaneous: "Subcutaneous",
  rectal: "Rectal",
  transdermal: "Transdermal",
});
const EN_UNIT_LABELS = Object.freeze({ seconds: "seconds", minutes: "minutes", hours: "hours", days: "days" });
const EN_STATUS_LABELS = Object.freeze({
  prohibited: "Prohibited",
  legal: "Legal",
  decriminalized: "Decriminalised",
  regulated: "Regulated",
  prescription: "Prescription",
  unscheduled: "Unscheduled",
  restricted: "Restricted",
  unknown: "Unknown",
});

const EN_UI = Object.freeze({
  back: "◀ Back",
  colon: ": ",
  listSeparator: ", ",
  doseGuide: "💊 Dosage",
  durationGuide: "⏱️ Duration",
  routeUnknown: "route not stated",
  withRoute: (label, route) => `${label} (${route})`,
  doseHeader: "| Strength | Dose range |",
  durationHeader: "| Stage | Time |",
  rangeAtLeast: (value) => `${value}+`,
  rangeAtMost: (value) => `up to ${value}`,
  physicalEffects: "Physical effects",
  cognitiveEffects: "Cognitive effects",
  sensoryEffects: "Sensory effects",
  harm: { addiction: "Addiction potential", toxicity: "Toxicity", psychosis: "Psychosis risk", seizure: "Seizure risk" },
  harmSub: {
    physical_dependence: "Physical dependence",
    psychological: "Psychological addiction",
    lethal_dosage: "Lethal dosage",
    organ_toxicity: "Organ toxicity",
    carcinogenicity: "Carcinogenicity",
    antibiotic_function: "Antibiotic function",
    other: "Other toxicity",
  },
  internationalConventions: "International conventions",
  legalStatusByCountry: "Legal status by country",
  legalityHeader: "| Country or region | Status | Classification | Instrument |",
  countryNotes: "Country notes",
  pharmacology: "Pharmacology",
  bindingHeader: "| Target | Action | Affinity |",
  subjectiveEffects: "Subjective effects",
  tolerance: "Tolerance",
  baselineTolerance: "Baseline tolerance",
  fullTolerance: "Full tolerance",
  halfTolerance: "Half tolerance",
  crossTolerance: "Cross-tolerance",
  harmPotential: "Toxicity and harm potential",
  interactions: "Interactions",
  historyCulture: "History and culture",
  legality: "Legality",
  longSummary: "Long summary",
  styleVariations: "Style variations",
  analysis: "Analysis",
  personalCommentary: "Personal commentary",
  seeAlso: "See also",
  summaryEffectsIntro: "Effects in this section:",
  categoryEffectsIntro: (count) => `This category holds ${count} effects:`,
  artworkCredit: (title, artist) => `Artwork: *${title}* by ${artist}`,
  externalLinks: "External links",
  references: "References",
  quotedFrom: "Quoted from",
  reportFacts: { name: "Contributor", age: "Age", gender: "Gender", weight: "Weight", height: "Height", setting: "Setting", trip_date: "Date" },
  reportFactsHeader: "| Item | Detail |",
  reportSubstance: "Substance",
  reportSections: { introduction: "Introduction", onset: "Onset", peak: "Peak", offset: "Offset", conclusion: "Conclusion" },
  sourceHeading: "Source and licence",
  sourceLine: (title, url) => `This page is the [dose.wiki](${SITE}) entry *${title}*, original at <${url}>.`,
  licenceLine: (licence, translation) => `Original licence: ${licence}. ${translation}`,
  defaultTranslationLine: "This is the English source text, unchanged.",
  snapshotLine: (date) => `Data snapshot: ${date || "not recorded"}.`,
  patchPreamble: (tree) => `Paste into ${tree}/index.md; that page is hand-maintained, and this file is only the fragment to merge.`,
  patches: {
    substance: { heading: "## dose.wiki substance entries", note: "Lists the substance pages in this export; the index's own category tables stay as they are." },
    effect: { heading: "### dose.wiki effect entries", note: "Lists the effect pages in this export; the index's own category tree stays as it is." },
    report: { heading: "## dose.wiki reports", note: "Append after the FreeODwiki report list." },
    article: { heading: "## dose.wiki long-form articles", note: "Append to the end of the documents index." },
  },
});

const LABELS = Object.freeze({
  "zh-Hans": Object.freeze({
    locale: "zh-Hans",
    TREE: ZH_TREE,
    DANGLING_TARGET_PREFIXES: ZH_DANGLING_TARGET_PREFIXES,
    LICENCE: ZH_LICENCE,
    INTERACTION_TIERS: ZH_INTERACTION_TIERS,
    DOSE_TIERS: ZH_DOSE_TIERS,
    DURATION_STAGES: ZH_DURATION_STAGES,
    ROUTE_LABELS: ZH_ROUTE_LABELS,
    UNIT_LABELS: ZH_UNIT_LABELS,
    STATUS_LABELS: ZH_STATUS_LABELS,
    groupLabel: zhGroupLabel,
    ui: ZH_UI,
  }),
  en: Object.freeze({
    locale: "en",
    TREE: EN_TREE,
    DANGLING_TARGET_PREFIXES: EN_DANGLING_TARGET_PREFIXES,
    LICENCE: EN_LICENCE,
    INTERACTION_TIERS: EN_INTERACTION_TIERS,
    DOSE_TIERS: EN_DOSE_TIERS,
    DURATION_STAGES: EN_DURATION_STAGES,
    ROUTE_LABELS: EN_ROUTE_LABELS,
    UNIT_LABELS: EN_UNIT_LABELS,
    STATUS_LABELS: EN_STATUS_LABELS,
    groupLabel: enGroupLabel,
    ui: EN_UI,
  }),
});

/** Every piece of page chrome for one emitted locale. Throws on a locale the exporter has no chrome for. */
export function labelsFor(locale) {
  const labels = LABELS[locale];
  if (!labels) throw new Error(`No FreeODwiki chrome for locale ${locale}; known: ${Object.keys(LABELS).join(", ")}`);
  return labels;
}

export const CORPUS_ORDER = Object.freeze(["substances", "effects", "effectCategories", "articles", "summaries", "reports"]);

export const DATASET_OF = Object.freeze({
  substances: "SubstanceIndex",
  effects: "EffectIndex",
  articles: "Articles",
  summaries: "PsychoactiveSummaries",
  effectCategories: "EffectCategories",
  reports: "TripReports",
  banners: "WarningBanners",
});

