export const TRANSLATION_FIXTURE_LOCALES = Object.freeze(["zh-Hans", "nl", "ar", "cs", "de", "es", "fr", "hi", "ja", "ko", "pl", "pt", "ru"]);
const LIVE = new Set(["zh-Hans"]);

const TERMS = Object.freeze([
  ["Visual drifting", "effect-name", "视觉漂移", "Visueel drijven", "Visuelles Driften", "視覚のドリフト"],
  ["Euphoria", "effect-name", "欣快感", "Euforie", "Euphorie", "多幸感"],
  ["Elation", "effect-name", "欣快感", "Euforie", "Hochstimmung", "高揚感"],
  ["Ego death", "effect-name", "自我消解", "Ego-dood", "Ich-Tod", "自我の死"],
  ["Time distortion", "effect-name", "时间扭曲", "Tijdsvervorming", "Zeitverzerrung", "時間の歪み"],
  ["Perception of bodily lightness", "effect-name", "身体轻盈感", "Waarneming van lichamelijke lichtheid", "Wahrnehmung körperlicher Leichtigkeit", "身体の軽さの知覚"],
  ["Visual effects", "effect-category", "视觉效果", "Visuele effecten", "Visuelle Effekte", "視覚効果"],
  ["Cognitive effects", "effect-category", "认知效果", "Cognitieve effecten", "Kognitive Effekte", "認知効果"],
  ["Replication", "replication", "复现", "Replicatie", "Nachbildung", "再現"],
  ["Subjective Effect Index", "site-name", "主观效应索引", "Index van subjectieve effecten", "Index subjektiver Effekte", "主観的効果インデックス"],
  ["Trip reports", "index-name", "体验报告", "Tripverslagen", "Tripberichte", "トリップレポート"],
  ["History and culture", "section-heading", "历史与文化", "Geschiedenis en cultuur", "Geschichte und Kultur", "歴史と文化"],
  ["Threshold", "enum:dose-tier", "阈值", "Drempel", "Schwelle", "閾値"],
  ["Common", "enum:dose-tier", "常规", "Gangbaar", "Üblich", "一般的"],
  ["Heavy", "enum:dose-tier", "重度", "Zwaar", "Stark", "強い"],
  ["Come up", "enum:duration-stage", "起效期", "Opkomst", "Anflutung", "効き始め"],
  ["Oral", "route", "口服", "Oraal", "Oral", "経口"],
  ["Insufflated", "route", "鼻吸", "Gesnoven", "Nasal", "鼻腔吸引"],
  ["Psychedelics", "psychoactive-class", "迷幻剂", "Psychedelica", "Psychedelika", "サイケデリックス"],
  ["Dissociatives", "psychoactive-class", "解离剂", "Dissociativa", "Dissoziativa", "解離剤"],
  ["Tryptamine", "chemical-class", "色胺", "Tryptamine", "Tryptamin", "トリプタミン"],
  ["Marquis reagent", "reagent-name", "马奎斯试剂", "Marquis-reagens", "Marquis-Reagenz", "マーキス試薬"],
  ["Tolerance", "register", "耐受性", "Tolerantie", "Toleranz", "耐性"],
  ["Set and setting", "register", "心境与环境", "Set en setting", "Set und Setting", "セットとセッティング"],
  ["Harm reduction", "register", "减害", "Schadebeperking", "Schadensminimierung", "ハームリダクション"],
]);
const COLUMN = Object.freeze({ "zh-Hans": 2, nl: 3, de: 4, ja: 5 });

const PLAN = Object.freeze({
  "zh-Hans": "AADLDDLALAHLALDDALADLAAAL",
  nl: "AADADDAAAAHAAADDAAADAAAAA",
  de: "AAAAAAAAAAAAAAAAAAAAAAAAA",
  ja: "ADDDDD",
});
const APPROVED_UNDER = Object.freeze({ "zh-Hans": "旅程报告", nl: "Ervaringsverslagen", de: "Erfahrungsberichte", ja: "旅の報告" });

const GLOSSES = Object.freeze({
  "Visual drifting": "Surfaces appear to warp, melt or flow while still recognisable.",
  Euphoria: "An intense, often overwhelming feeling of well-being and happiness.",
  "Ego death": "A complete loss of the sense of self.",
  Replication: "Artwork that recreates what an altered state looks or sounds like.",
  Threshold: "The smallest dose at which any effect can be felt.",
  Tolerance: "A reduced response to a substance after repeated use.",
  "Set and setting": "The mindset and the surroundings in which a substance is taken.",
});

const PROGRESS = Object.freeze({
  "zh-Hans": { segments: { total: 48210, current: 46890 }, jobs: { runId: "run-zh-0007", requestedAt: -30, total: 412, active: 0, completed: 404, completedWithRejections: 6, exhausted: 3 } },
  nl: { segments: { total: 18_040, current: 17_990 }, jobs: { runId: "run-nl-0002", requestedAt: -200, total: 380, active: 0, completed: 380, completedWithRejections: 0, exhausted: 0 } },
  de: { segments: { total: 21_300, current: 20_104 }, jobs: { runId: null, requestedAt: null, total: 0, active: 0, completed: 0, completedWithRejections: 0, exhausted: 0 } },
  ja: { segments: { total: 0, current: 0 }, jobs: { runId: null, requestedAt: null, total: 0, active: 0, completed: 0, completedWithRejections: 0, exhausted: 0 } },
});
const PENDING = Object.freeze({ "zh-Hans": ["Euphoria", "Tolerance", "Set and setting"], nl: ["Tolerance"], de: ["Tolerance", "Set and setting"] });

const UI_LABELS = Object.freeze([
  ["nav.substances", "Substances", "Main navigation link to the substance index", ["src/components/layout/Header.tsx"], "物质", "Substanzen"],
  ["nav.effects", "Effects", "Main navigation link to the effect index", ["src/components/layout/Header.tsx"], "效应", "Effekte"],
  ["nav.reports", "Reports", "Main navigation link to trip reports", ["src/components/layout/Header.tsx"], "报告", "Berichte"],
  ["nav.replications", "Replications", "Main navigation link to the replication gallery", ["src/components/layout/Header.tsx"], "复现", "Nachbildungen"],
  ["nav.about", "About", "Main navigation link to the About page", ["src/components/layout/Header.tsx"], "关于", "Über uns"],
  ["search.placeholder", "Search...", "Placeholder in the site search field", ["src/components/common/GlobalSearch.tsx"], "搜索…", "Suchen …"],
  ["appearance.light", "Light", "Appearance setting: the light colour scheme", ["src/components/layout/AppearanceMenu.tsx"], "浅色", "Hell"],
  ["appearance.dark", "Dark", "Appearance setting: the dark colour scheme", ["src/components/layout/AppearanceMenu.tsx"], "深色", "Dunkel"],
  ["dose.light", "Light", "Dose tier label in a dosage table", ["src/features/articles/DosageTable.tsx"], "轻度", "Leicht"],
  ["dose.strong", "Strong", "Dose tier label in a dosage table", ["src/features/articles/DosageTable.tsx"], "强烈", "Stark"],
  ["duration.onset", "Onset", "Duration stage in the timeline chart", ["src/features/articles/DurationChart.tsx"], "起效", "Wirkungseintritt"],
  ["duration.peak", "Peak", "Duration stage in the timeline chart", ["src/features/articles/DurationChart.tsx"], "峰值", "Höhepunkt"],
  ["duration.afterglow", "After effects", "Duration stage in the timeline chart", ["src/features/articles/DurationChart.tsx"], "余韵", "Nachwirkungen"],
  ["gallery.back", "Back to replications", "Link from one replication back to the gallery", ["src/features/replications/ReplicationPage.tsx"], "返回复现", "Zurück zu den Nachbildungen"],
  ["gallery.next", "Next replication", "Pager button in the replication viewer", ["src/features/replications/ReplicationPage.tsx"], "下一个复现", "Nächste Nachbildung"],
  ["footer.license", "License & reuse", "Footer link to the licence page", ["src/components/layout/Footer.tsx"], "许可与再利用", "Lizenz und Weiterverwendung"],
  ["footer.contact", "Contact us", "Footer link to the contact section", ["src/components/layout/Footer.tsx"], "联系我们", "Kontakt"],
  ["article.notice.machine", "This page was translated by a machine and may contain errors.", "Notice above every machine-translated article", ["src/features/articles/TranslationNotice.tsx"], "本页面由机器翻译，可能包含错误。", "Diese Seite wurde maschinell übersetzt und kann Fehler enthalten."],
  ["article.readEnglish", "Read in English", "Link from a translated article to its English original", ["src/features/articles/TranslationNotice.tsx"], "阅读英文原文", "Auf Englisch lesen"],
  ["article.interactions", "Interactions", "Article section heading", ["src/features/articles/sections.ts"], "相互作用", "Wechselwirkungen"],
  ["article.tolerance", "Tolerance and addiction potential", "Article section heading", ["src/features/articles/sections.ts"], "耐受性与成瘾潜力", "Toleranz und Suchtpotenzial"],
  ["article.harm", "Harm potential", "Article section heading", ["src/features/articles/sections.ts"], "危害潜力", "Schadenspotenzial"],
  ["replications.tutorials", "Tutorials and resources for replicating visual effects", "Heading on the replication gallery", ["src/features/replications/GalleryIntro.tsx"], "复现视觉效果的教程与资源", "Anleitungen und Ressourcen zum Nachbilden visueller Effekte"],
  ["reports.submit", "Submit a report", "Button on the trip report index", ["src/features/reports/ReportsIndex.tsx"], "提交报告", "Bericht einreichen"],
  ["reports.filter.substance", "Filter by substance", "Filter label on the trip report index", ["src/features/reports/ReportsIndex.tsx"], "按物质筛选", "Nach Substanz filtern"],
  ["common.showMore", "Show more", "Expands a folded list", ["src/components/common/ExpandButton.tsx", "src/features/articles/Aliases.tsx"], "显示更多", "Mehr anzeigen"],
  ["common.showLess", "Show less", "Folds a list back", ["src/components/common/ExpandButton.tsx"], "收起", "Weniger anzeigen"],
  ["common.close", "Close", "Closes a dialog", ["src/components/ui/dialog.tsx"], "关闭", "Schließen"],
  ["glossary.feedback.right", "Looks right", "Reader reaction on a glossary term", ["src/features/language-glossary/TermFeedback.tsx"], "看起来没问题", "Sieht richtig aus"],
  ["glossary.feedback.improve", "Needs improvement", "Reader reaction on a glossary term", ["src/features/language-glossary/TermFeedback.tsx"], "需要改进", "Verbesserungswürdig"],
]);
const UI_PLAN = Object.freeze({ "zh-Hans": "uuaauuaaudusuudaaaasuuuaudumuau", de: "aaaaaaaaaaaaaudaaaaaaaaaaaaaaaa" });
const UI_PENDING_REFRESH = Object.freeze({ "zh-Hans": { "gallery.back": { term: "Replication", expectedTarget: "体验再现" }, "replications.tutorials": { term: "Replication", expectedTarget: "体验再现" }, "gallery.next": { term: null, expectedTarget: null } } });

const ARTICLES = Object.freeze({
  lsd: [
    ["summary", "LSD is a semisynthetic psychedelic of the lysergamide class.", "LSD 是一种半合成的麦角酰胺类迷幻剂。", "LSD ist ein halbsynthetisches Psychedelikum aus der Klasse der Lysergamide.", "approved"],
    ["summary", "It is known for its potency and long duration.", "它以效力强和持续时间长而闻名。", "Es ist für seine Wirkstärke und lange Dauer bekannt.", "recheck"],
    ["dosage.notes", "Doses are measured in micrograms, so volumetric dosing is the safest method.", "剂量以微克计，因此容量法给药是最安全的方法。", "Dosen werden in Mikrogramm gemessen, daher ist die volumetrische Dosierung die sicherste Methode.", "draft"],
    ["effects.summary", "Visual drifting and time distortion are common at moderate doses.", "在中等剂量下，视觉漂移和时间扭曲很常见。", "Visuelles Driften und Zeitverzerrung sind bei mittleren Dosen häufig.", "unreviewed"],
    ["effects.summary", "Some users report ego death at heavy doses.", "有些使用者在重度剂量下报告自我消解。", "Manche Konsumierende berichten bei starken Dosen vom Ich-Tod.", "stale"],
    ["tolerance", "Tolerance builds almost immediately after ingestion.", "服用后几乎立即产生耐受。", "Die Toleranz baut sich fast unmittelbar nach der Einnahme auf.", "unreviewed"],
    ["harm", "Set and setting strongly shape the experience.", "心境与环境强烈影响体验。", "Set und Setting prägen das Erlebnis stark.", "unreviewed"],
    ["history", "LSD was first synthesized by Albert Hofmann in 1938.", "LSD 由阿尔伯特·霍夫曼于1938年首次合成。", "LSD wurde 1938 erstmals von Albert Hofmann synthetisiert.", "unreviewed"],
  ],
  mdma: [
    ["summary", "MDMA is an entactogen of the amphetamine class.", "MDMA 是一种苯丙胺类的共情剂。", "MDMA ist ein Entaktogen aus der Klasse der Amphetamine.", "unreviewed"],
    ["dosage.notes", "Redosing increases the risk of neurotoxicity.", "追加剂量会增加神经毒性的风险。", "Nachdosieren erhöht das Risiko der Neurotoxizität.", "unreviewed"],
    ["harm", "Stay hydrated but avoid drinking too much water.", "保持水分，但避免饮水过量。", "Trinke genug, aber nicht zu viel Wasser.", "draft"],
  ],
});
const NOTE_SECTIONS = Object.freeze({
  lsd: [["dosage-duration", "Dosage & Duration", 2], ["subjective-effects", "Subjective effects", 4], ["tolerance", "Tolerance and addiction potential", 5], ["harm-potential", "Harm potential", 6], ["history-culture", "History and culture", 7]],
  mdma: [["dosage-duration", "Dosage & Duration", 1], ["harm-potential", "Harm potential", 2]],
});

const COVERAGE_PAGES = Object.freeze([
  ["article", "lsd", 6, 4, 1, 3, 0, 1],
  ["article", "mdma", 3, 2, 0, 1, 1, 0],
  ["article", "ketamine", 12, 0, 2, 0, 0, 2],
  ["article", "psilocybin", 0, 1, 0, 0, 0, 0],
  ["article", "caffeine", 2, 0, 0, 1, 0, 0],
  ["effect", "visual-drifting", 1, 0, 0, 1, 0, 0],
  ["replication", "fractal-bloom", 0, 2, 0, 0, 0, 0],
]);

const HEX = "0123456789abcdef";
function confirmationFor(terms) {
  let seed = 7;
  for (const char of [...terms].sort().join("|")) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  let out = "";
  for (let i = 0; i < 64; i += 1) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    out += HEX[seed % 16];
  }
  return out;
}

const REVIEW_CONFLICT = Object.freeze({ error: "This translation changed since you opened it. Reload and review the latest revision.", code: "TRANSLATION_REVIEW_CONFLICT" });

export function seedGlossaryRows(locale, epoch, empty = false) {
  if (empty) return [];
  const plan = PLAN[locale];
  const column = COLUMN[locale];
  if (!plan || !column) return [];
  return [...plan].map((state, index) => {
    const [term, kind] = TERMS[index];
    const target = TERMS[index][column];
    const updated = epoch - (index + 1) * 3_600_000;
    const human = state === "A" || state === "H";
    const reviewRevision = state === "A" ? 2 : state === "H" ? 3 : state === "D" ? 1 : 0;
    return {
      locale,
      term,
      target,
      kind,
      status: state === "D" || state === "H" ? "draft" : "approved",
      source: human ? "human" : "model",
      reviewed_at: state === "A" ? updated : null,
      reviewed_by: state === "A" ? "mira@localhost.invalid" : null,
      retranslated_at: state === "A" || state === "L" ? updated : null,
      updated_at: updated,
      revision: `${updated}:${reviewRevision}`,
      approved_target: state === "H" ? APPROVED_UNDER[locale] ?? null : state === "A" || state === "L" ? target : null,
      review_provenance: state === "L" ? "legacy_unverified" : state === "A" ? "human_review" : "unreviewed",
    };
  });
}

function uiState(locale, index) {
  const plan = UI_PLAN[locale];
  if (!plan) return "m";
  return plan[index] ?? "u";
}

export function seedUiLabels(locale, epoch, empty = false) {
  if (empty) return [];
  return UI_LABELS.map(([id, source, context, locations, zh, de], index) => {
    const compiled = locale === "zh-Hans" ? zh : locale === "de" ? de : null;
    const state = compiled === null ? "m" : uiState(locale, index);
    const snap = (target) => ({ source, target, context, provenance: "human" });
    const status = { u: "unreviewed", d: "draft", a: "approved", s: "stale", m: "missing" }[state];
    const draftTarget = state === "d" ? `${compiled}${locale === "zh-Hans" ? "（修订）" : " (überarbeitet)"}` : null;
    return {
      id,
      source,
      context,
      locations: [...locations],
      glossaryTerms: /replicat/i.test(source) ? ["Replication"] : /tolerance/i.test(source) ? ["Tolerance"] : [],
      updatedAt: state === "m" ? null : epoch - (index + 2) * 5_400_000,
      compiledTarget: compiled,
      status,
      revision: state === "a" || state === "s" ? 2 : state === "d" ? 1 : 0,
      draft: draftTarget ? snap(draftTarget) : null,
      approved: state === "a" ? snap(compiled) : state === "s" ? { source: `${source} (older English)`, target: compiled, context, provenance: "human" } : null,
      pendingRefresh: UI_PENDING_REFRESH[locale]?.[id] ?? null,
      glossary: /replicat/i.test(source) && locale === "zh-Hans" ? [{ term: "Replication", target: "体验再现", approved: true, revision: "1:2" }] : [],
    };
  });
}

function seedArticle(locale, slug, epoch) {
  const paragraphs = ARTICLES[slug];
  if (!paragraphs) return null;
  const column = locale === "zh-Hans" ? 2 : locale === "de" ? 3 : null;
  return paragraphs.map(([field, source, zh, de, state], index) => {
    const target = column === 2 ? zh : column === 3 ? de : null;
    const id = `article/${slug}/${field}/${index}`;
    const snap = (text, extra = {}) => ({ source, target: text, context: field, ...extra });
    const machine = target ? { hash: `h-${slug}-${index}`, target, model: "fixture-model-2", prompt_version: "p-0042" } : null;
    const humanTarget = target ? `${target}${column === 2 ? "" : ""}` : null;
    const approved = target && (state === "approved" || state === "recheck" || state === "stale") ? snap(humanTarget, { provenance: "human" }) : null;
    const draft = target && state === "draft" ? snap(`${target}${column === 2 ? "（草稿）" : " (Entwurf)"}`) : null;
    return {
      id,
      hash: `h-${slug}-${index}`,
      field,
      source,
      context: field,
      machine,
      revision: state === "unreviewed" ? 0 : state === "draft" ? 1 : 2,
      draft,
      approved,
      overlay: state === "approved" ? "apply" : state === "recheck" ? "apply-recheck" : state === "stale" ? "stale" : null,
      status: target ? state : "unreviewed",
      usages: index === 0 ? { total: 3, pages: [{ kind: "article", slug, label: slug.toUpperCase(), href: `/substances/${slug}` }] } : null,
      glossary: /visual drifting/i.test(source) && locale === "zh-Hans" ? [{ term: "Visual drifting", target: "视觉漂移", approved: true, revision: "1:2" }] : [],
      updatedAt: epoch - index * 60_000,
    };
  });
}

export function createTranslationRoutes({ fixture, json, toolRead, toolWrite, epoch, otherAdmin }) {
  const empty = fixture.state === "empty";
  let clock = epoch;
  const now = () => (clock += 60_000);
  const glossary = new Map(TRANSLATION_FIXTURE_LOCALES.map((locale) => [locale, seedGlossaryRows(locale, epoch, empty)]));
  const glosses = { ...GLOSSES };
  const pending = new Map(Object.entries(PENDING).map(([locale, terms]) => [locale, empty ? [] : [...terms]]));
  const progress = new Map(Object.entries(PROGRESS).map(([locale, value]) => [locale, structuredClone(value)]));
  const glossaryHistory = new Map();
  const labels = new Map(TRANSLATION_FIXTURE_LOCALES.map((locale) => [locale, seedUiLabels(locale, epoch, empty)]));
  const labelHistory = new Map();
  const articles = new Map();
  const notes = new Map();
  const styleGuides = new Map();
  const inboxDone = new Map();
  const contested = new Set();

  const actor = () => fixture.session.user.email;
  const role = () => fixture.role;
  const isAdmin = () => role() === "admin";
  const translates = () => role() === "admin" || role() === "translator" || role() === "editor_translator";
  const allowed = () => (isAdmin() ? [...TRANSLATION_FIXTURE_LOCALES] : TRANSLATION_FIXTURE_LOCALES.filter((locale) => (fixture.session.user.glossaryLocales ?? []).includes(locale)));
  const denied = (locale) => {
    if (!translates()) return json(403, { error: "Translator access required." });
    if (!TRANSLATION_FIXTURE_LOCALES.includes(locale)) return json(400, { error: `Unknown locale. Known: ${TRANSLATION_FIXTURE_LOCALES.join(", ")}.` });
    if (!allowed().includes(locale)) return json(403, { error: `You are not approved to access the ${locale} translation glossary. Ask an admin to assign this language.` });
    return null;
  };
  const contest = (key, bump) => {
    if (fixture.state !== "conflicted" || contested.has(key)) return false;
    contested.add(key);
    bump();
    return true;
  };

  const rowsOf = (locale) => glossary.get(locale) ?? [];
  const patchOf = (locale, terms) => ({ rows: structuredClone(rowsOf(locale).filter((row) => terms.includes(row.term))), pending: [...(pending.get(locale) ?? [])] });
  const reviewRevision = (row) => Number(row.revision.split(":")[1] ?? 0);
  const bumpRow = (row, extra = {}) => {
    Object.assign(row, extra);
    row.updated_at = now();
    row.revision = `${row.updated_at}:${reviewRevision(row) + 1}`;
  };
  const record = (locale, term, action, before, row, reason) => {
    const key = `${locale}\u0000${term}`;
    const list = glossaryHistory.get(key) ?? seedHistory(term, row);
    list.unshift({
      revision: reviewRevision(row),
      action,
      before,
      after: snapshotOf(row),
      actor: actor(),
      reason: reason ?? { kind: "unspecified", note: action === "approve" ? "Glossary review" : "Saved the wording as it stands." },
      glossaryExceptions: [],
      createdAt: row.updated_at,
    });
    glossaryHistory.set(key, list);
  };
  const snapshotOf = (row) => ({
    revision: reviewRevision(row),
    draft: row.status === "draft" ? { source: row.term, target: row.target, context: row.kind } : null,
    approved: row.approved_target ? { source: row.term, target: row.approved_target, context: row.kind } : null,
  });
  function seedHistory(term, row) {
    if (row.review_provenance !== "human_review" && row.status !== "draft") return [];
    const at = row.updated_at - 86_400_000;
    const draft = { revision: 1, draft: { source: term, target: row.target, context: row.kind }, approved: null };
    const list = [{ revision: 1, action: "save", before: { revision: 0, draft: null, approved: null }, after: draft, actor: "Model draft", reason: { kind: "unspecified", note: "Drafted by the model" }, glossaryExceptions: [], createdAt: at }];
    if (row.review_provenance === "human_review") {
      list.unshift({ revision: 2, action: "approve", before: draft, after: { revision: 2, draft: null, approved: { source: term, target: row.target, context: row.kind } }, actor: "mira@localhost.invalid", reason: { kind: "terminology", note: "Matches the public glossary." }, glossaryExceptions: [], createdAt: at + 3_600_000 });
    }
    return list;
  }

  function collisionsFor(locale, updates) {
    const out = [];
    for (const { term, target } of updates) {
      const row = rowsOf(locale).find((entry) => entry.term === term);
      if (!row) continue;
      const others = rowsOf(locale).filter((entry) => entry.term !== term && entry.kind === row.kind && entry.status === "approved" && (entry.approved_target ?? entry.target).trim().toLowerCase() === target.trim().toLowerCase());
      if (others.length) out.push({ kind: row.kind, target, terms: [term, ...others.map((entry) => entry.term)] });
    }
    return out;
  }
  function collisionRefusal(collisions, confirmation) {
    if (!collisions.length) return null;
    const expected = confirmationFor(collisions.flatMap((collision) => collision.terms));
    if (confirmation === expected) return null;
    return json(409, {
      error: collisions.map((c) => `${c.terms.length === 2 ? "Two" : String(c.terms.length)} terms in ${c.kind} would share the rendering ${c.target}: ${c.terms.join(", ")}`).join(" "),
      collisions,
      collisionConfirmation: expected,
    });
  }

  function listGlossary(params) {
    const permitted = allowed();
    if (!translates() || permitted.length === 0) return json(403, { error: "No glossary languages are approved for your account. Ask an admin to assign a language." });
    const locale = params.get("locale") ?? permitted[0];
    const refusal = denied(locale);
    if (refusal) return refusal;
    const stats = progress.get(locale) ?? { segments: { total: 0, current: 0 }, jobs: { runId: null, requestedAt: null, total: 0, active: 0, completed: 0, completedWithRejections: 0, exhausted: 0 } };
    const jobs = { ...stats.jobs, requestedAt: stats.jobs.requestedAt === null ? null : epoch + stats.jobs.requestedAt * 60_000 };
    const segments = empty ? { total: 0, current: 0 } : stats.segments;
    const base = { ok: true, generatedAt: now(), locale, promptVersion: `p-${locale}-0042`, segments, jobs: empty ? { ...jobs, total: 0, runId: null } : jobs };
    if (params.get("progress") === "1") return json(200, base);
    return json(200, {
      ...base,
      locales: permitted.map((code) => {
        const rows = rowsOf(code);
        return { locale: code, draft: rows.filter((row) => row.status === "draft").length, approved: rows.filter((row) => row.status === "approved").length, live: LIVE.has(code) };
      }),
      rows: structuredClone(rowsOf(locale)),
      pending: [...(pending.get(locale) ?? [])],
      glosses: { ...glosses },
      ...(params.get("includeUsage") === "1" ? { usages: {} } : {}),
    });
  }

  function glossaryWrite(action, body) {
    const locale = String(body.locale ?? "");
    const refusal = denied(locale);
    if (refusal) return refusal;
    const rows = rowsOf(locale);
    if (action === "edit") {
      const row = rows.find((entry) => entry.term === body.term);
      if (!row) return json(404, { error: `No glossary row for ${body.term}.` });
      if (contest(`glossary:${locale}:${row.term}`, () => bumpRow(row))) return json(409, REVIEW_CONFLICT);
      if (body.expectedRevision && body.expectedRevision !== row.revision) return json(409, REVIEW_CONFLICT);
      const target = String(body.target ?? "").trim();
      if (!target) return json(400, { error: "A non-empty target rendering is required." });
      const before = snapshotOf(row);
      const approvedTarget = row.status === "approved" ? row.target : row.approved_target;
      bumpRow(row, { target, status: "draft", source: "human", approved_target: approvedTarget, review_provenance: "unreviewed" });
      record(locale, row.term, "save", before, row, body.reason);
      return json(200, { ok: true, row: structuredClone(row), ...patchOf(locale, [row.term]) });
    }
    const terms = Array.isArray(body.terms) ? body.terms : [];
    if (!terms.length) return json(400, { error: "Pass 1 to 1000 terms." });
    const expected = body.expectedRevisions ?? {};
    const picked = [];
    for (const term of terms) {
      const row = rows.find((entry) => entry.term === term);
      if (!row) return json(404, { error: `No glossary row for ${term}.` });
      if (contest(`glossary:${locale}:${term}`, () => bumpRow(row))) return json(409, REVIEW_CONFLICT);
      if (expected[term] !== row.revision) return json(409, REVIEW_CONFLICT);
      if (action === "confirm" && row.review_provenance !== "legacy_unverified") return json(409, { error: `${term} is not live and never checked; approve its draft instead.`, code: "TRANSLATION_REVIEW_CONFLICT" });
      if (action === "approve" && row.status !== "draft") return json(409, { error: `${term} has no draft to approve.`, code: "TRANSLATION_REVIEW_CONFLICT" });
      picked.push(row);
    }
    const collisionAnswer = collisionRefusal(collisionsFor(locale, picked.map((row) => ({ term: row.term, target: row.target }))), body.collisionConfirmation);
    if (collisionAnswer) return collisionAnswer;
    for (const row of picked) {
      const before = snapshotOf(row);
      bumpRow(row, { status: "approved", approved_target: row.target, review_provenance: "human_review", reviewed_at: now(), reviewed_by: actor() });
      if (action === "approve") {
        const list = pending.get(locale) ?? [];
        if (!list.includes(row.term)) pending.set(locale, [...list, row.term]);
      }
      record(locale, row.term, "approve", before, row, body.reason);
    }
    const key = action === "confirm" ? "confirmed" : "approved";
    return json(200, { ok: true, locale, [key]: picked.map((row) => row.term), ...patchOf(locale, picked.map((row) => row.term)) });
  }

  function glossaryHistoryRead(params) {
    const locale = params.get("locale") ?? "";
    const refusal = denied(locale);
    if (refusal) return refusal;
    const term = params.get("term") ?? "";
    const row = rowsOf(locale).find((entry) => entry.term === term);
    if (!row) return json(404, { error: `No glossary row for ${term}.` });
    const key = `${locale}\u0000${term}`;
    if (!glossaryHistory.has(key)) glossaryHistory.set(key, seedHistory(term, row));
    return json(200, { ok: true, history: structuredClone(glossaryHistory.get(key)) });
  }
  function glossaryRestore(body) {
    const locale = String(body.locale ?? "");
    const refusal = denied(locale);
    if (refusal) return refusal;
    const row = rowsOf(locale).find((entry) => entry.term === body.term);
    if (!row) return json(404, { error: `No glossary row for ${body.term}.` });
    if (body.expectedRevision !== row.revision) return json(409, REVIEW_CONFLICT);
    const key = `${locale}\u0000${row.term}`;
    const entry = (glossaryHistory.get(key) ?? seedHistory(row.term, row)).find((item) => item.revision === body.restoreRevision);
    const snapshot = entry?.after.draft ?? entry?.after.approved;
    if (!snapshot) return json(404, { error: "That revision has no translation to restore." });
    const before = snapshotOf(row);
    bumpRow(row, { target: snapshot.target, status: "draft", source: "human", approved_target: row.status === "approved" ? row.target : row.approved_target, review_provenance: "unreviewed" });
    record(locale, row.term, "restore", before, row, { kind: "unspecified", note: `Restore revision ${body.restoreRevision} for review.` });
    return json(200, { ok: true, ...patchOf(locale, [row.term]) });
  }

  function adminOnly(answer) {
    if (!isAdmin()) return json(403, { error: "Admin access required." });
    return answer();
  }

  function importCsv(params, body) {
    const locale = params.get("locale") ?? "";
    const refusal = denied(locale);
    if (refusal) return refusal;
    const text = typeof body === "string" ? body : "";
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
    const header = (lines.shift() ?? "").split(",").map((cell) => cell.trim().toLowerCase());
    if (!header.includes("term") || !header.includes("target")) return json(400, { error: "The first line must name the columns, at least \"term\" and \"target\"." });
    let drafts = 0;
    for (const line of lines) {
      const cells = line.split(",");
      const term = cells[header.indexOf("term")]?.trim();
      const target = cells[header.indexOf("target")]?.trim();
      if (!term || !target) continue;
      const row = rowsOf(locale).find((entry) => entry.term === term);
      if (row) bumpRow(row, { target, status: "draft", source: "human", review_provenance: "unreviewed" });
      else rowsOf(locale).push({ locale, term, target, kind: header.includes("kind") ? cells[header.indexOf("kind")]?.trim() || "register" : "register", status: "draft", source: "human", reviewed_at: null, reviewed_by: null, retranslated_at: null, updated_at: now(), revision: `${clock}:1`, approved_target: null, review_provenance: "unreviewed" });
      drafts += 1;
    }
    return json(200, { ok: true, approved: 0, drafts });
  }

  const labelsOf = (locale) => labels.get(locale) ?? [];
  function labelWrite(body) {
    const locale = String(body.locale ?? "");
    const refusal = denied(locale);
    if (refusal) return refusal;
    const row = labelsOf(locale).find((entry) => entry.id === body.id);
    if (!row) return json(404, { error: "That label is not in the inventory." });
    if (contest(`label:${locale}:${row.id}`, () => { row.revision += 1; })) return json(409, REVIEW_CONFLICT);
    if (body.expectedRevision !== row.revision) return json(409, REVIEW_CONFLICT);
    const before = { revision: row.revision, draft: row.draft, approved: row.approved };
    if (body.action === "save") {
      const target = String(body.target ?? "").trim();
      if (!target) return json(400, { error: "A translation is required." });
      row.draft = { source: row.source, target, context: row.context, provenance: "human" };
      row.status = "draft";
    } else if (body.action === "approve") {
      if (!row.draft) return json(409, { error: "There is no saved draft to approve.", code: "TRANSLATION_REVIEW_CONFLICT" });
      row.approved = row.draft;
      row.draft = null;
      row.status = "approved";
      row.pendingRefresh = null;
    } else if (body.action === "restore") {
      const entry = (labelHistory.get(`${locale}:${row.id}`) ?? []).find((item) => item.revision === body.restoreRevision);
      const snapshot = entry?.after.draft ?? entry?.after.approved ?? (body.restoreRevision === 0 && row.compiledTarget ? { source: row.source, target: row.compiledTarget, context: row.context, provenance: "compiled" } : null);
      if (!snapshot) return json(404, { error: "That revision has no translation to restore." });
      row.draft = { ...snapshot, provenance: "human" };
      row.status = "draft";
    } else return json(400, { error: "Unknown action." });
    row.revision += 1;
    row.updatedAt = now();
    const history = labelHistory.get(`${locale}:${row.id}`) ?? [];
    history.unshift({ revision: row.revision, action: body.action, before, after: { revision: row.revision, draft: row.draft, approved: row.approved }, actor: actor(), reason: typeof body.reason === "object" && body.reason ? body.reason : { kind: "unspecified", note: String(body.reason ?? "") }, glossaryExceptions: body.glossaryExceptions ?? [], createdAt: row.updatedAt });
    labelHistory.set(`${locale}:${row.id}`, history);
    return json(200, { ok: true, row: structuredClone(row) });
  }
  function labelApproveMany(body) {
    const locale = String(body.locale ?? "");
    const refusal = denied(locale);
    if (refusal) return refusal;
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length > 200) return json(400, { error: "At most 200 labels per request." });
    return json(200, {
      ok: true,
      results: items.map((item) => {
        const row = labelsOf(locale).find((entry) => entry.id === item.id);
        if (!row) return { id: item.id, ok: false, code: "NOT_FOUND", error: "That label is not in the inventory." };
        if (row.revision !== item.expectedRevision) return { id: item.id, ok: false, code: "TRANSLATION_REVIEW_CONFLICT", error: REVIEW_CONFLICT.error };
        row.approved = { source: row.source, target: item.target, context: row.context, provenance: "human" };
        row.draft = null;
        row.status = "approved";
        row.revision += 2;
        row.updatedAt = now();
        return { id: item.id, ok: true, row: structuredClone(row) };
      }),
    });
  }

  function inboxItems(locale) {
    if (empty) return [];
    const at = (term) => rowsOf(locale).find((row) => row.term === term);
    const items = [];
    const href = (params) => `/dev/glossary?${new URLSearchParams({ locale, ...params })}`;
    const article = (slug, index) => ({ scope: "narrative", slug, index });
    const paragraph = ({ slug, index }) => ARTICLES[slug][index];
    const localized = (row) => (locale === "zh-Hans" ? row[2] : locale === "de" ? row[3] : null);
    const narrativeHref = (slug, index) => href({ translationReview: "article", translationLocale: locale, translationSlug: slug, translationSegment: `article/${slug}/${ARTICLES[slug][index][0]}/${index}` });
    const detail = locale === "zh-Hans" || locale === "de";
    if (detail) {
      const rejected = article("mdma", 1);
      items.push({ scope: "segment", id: `seg-${locale}-mdma-1`, reason: "segment-rejected", english: paragraph(rejected)[1], live: null, detail: "Every attempt dropped the number in the English. Readers see English.", where: "MDMA · Dosage notes", revision: "r1", href: "/substances/mdma", accept: null });
      const stale = article("lsd", 4);
      items.push({ scope: "narrative", id: `article/lsd/${paragraph(stale)[0]}/4`, reason: "narrative-source-changed", english: paragraph(stale)[1], live: localized(paragraph(stale)), previous: { english: "Some users report ego death at high doses.", target: localized(paragraph(stale)) }, where: "LSD · Subjective effects", revision: "2", href: narrativeHref("lsd", 4), accept: { kind: "narrative-approve", slug: "lsd", id: `article/lsd/${paragraph(stale)[0]}/4`, sourceVersion: "sv-lsd-3", expectedRevision: 2, target: localized(paragraph(stale)) } });
      const recheck = article("lsd", 1);
      items.push({ scope: "narrative", id: `article/lsd/${paragraph(recheck)[0]}/1`, reason: "narrative-recheck", english: paragraph(recheck)[1], live: localized(paragraph(recheck)), where: "LSD · Summary", revision: "2", href: narrativeHref("lsd", 1), accept: { kind: "narrative-approve", slug: "lsd", id: `article/lsd/${paragraph(recheck)[0]}/1`, sourceVersion: "sv-lsd-3", expectedRevision: 2, target: localized(paragraph(recheck)) } });
      const staleLabel = labelsOf(locale).find((row) => row.status === "stale") ?? labelsOf(locale)[13];
      items.push({ scope: "ui", id: staleLabel.id, reason: "ui-source-changed", english: staleLabel.source, live: staleLabel.compiledTarget, previous: { english: `${staleLabel.source} (older English)`, target: staleLabel.compiledTarget ?? "" }, where: staleLabel.context, revision: String(staleLabel.revision), href: href({ translationView: "words", translationLabel: staleLabel.id }), accept: { kind: "ui-approve", id: staleLabel.id, expectedRevision: staleLabel.revision, target: staleLabel.compiledTarget ?? "" } });
      const drift = article("lsd", 3);
      items.push({ scope: "segment", id: `seg-${locale}-lsd-3`, reason: "glossary-disagreement", english: paragraph(drift)[1], live: localized(paragraph(drift)), detail: locale === "zh-Hans" ? "Mentions Visual drifting (视觉漂移); the translation says 视觉流动." : "Mentions Visual drifting (Visuelles Driften); the translation says Visuelles Fließen.", exception: { finding: "glossary-disagreement", hash: "h-lsd-3", term: "Visual drifting", revision: "g2:d9" }, where: "LSD · Effects summary", revision: "g2:d9", href: narrativeHref("lsd", 3), accept: null });
      if (locale === "zh-Hans") items.push({ scope: "segment", id: "seg-zh-ketamine-2", reason: "leftover-latin", english: "Ketamine is used in anesthesia and for treatment-resistant depression.", live: "氯胺酮用于 anesthesia 和难治性抑郁症的治疗。", detail: "English left in: anesthesia", exception: { finding: "leftover-latin", hash: "h-ket-2", term: "anesthesia", revision: "d-ket-2" }, where: "Ketamine · Summary", revision: "d-ket-2", href: "/substances/ketamine", accept: null });
      items.push({ scope: "model", id: `sugg-${locale}-lsd-6`, reason: "model-suggestion", english: ARTICLES.lsd[6][1], live: localized(ARTICLES.lsd[6]), suggestion: locale === "zh-Hans" ? "心境与环境会深刻影响体验。" : "Set und Setting prägen das Erleben maßgeblich.", origin: { model: "fixture-model-2", runId: "fluency-0003-aaaa", promptVersion: "fp-0005" }, detail: "Reads more naturally.", where: "LSD · Harm potential", revision: "1", href: narrativeHref("lsd", 6), accept: { kind: "suggestion-accept", id: `sugg-${locale}-lsd-6`, expectedRevision: 1 } });
      items.push({ scope: "feedback", id: "fixture-gf-1", reason: "reader-suggestion", english: "Tolerance", live: at("Tolerance")?.target ?? null, suggestion: locale === "zh-Hans" ? "耐药性" : "Gewöhnung", detail: "Reads oddly in the dosage context.", where: "Harm-reduction register", revision: "v1", href: href({ translationView: "words", translationTerm: "Tolerance" }), accept: { kind: "feedback-resolve", id: "fixture-gf-1" } });
      if (locale === "zh-Hans") items.push({ scope: "note", id: "article/lsd#legality", reason: "note-orphaned", english: "Legality", live: "在中国大陆，LSD 属于第一类精神药品。", where: "LSD · Legality (section removed)", revision: "1", href: href({ translationReview: "article", translationLocale: locale, translationSlug: "lsd", translationNote: "legality" }), accept: null });
    }
    for (const row of rowsOf(locale).filter((entry) => entry.review_provenance === "legacy_unverified")) {
      items.push({ scope: "glossary", id: row.term, reason: "glossary-never-checked", english: row.term, live: row.target, where: row.kind, revision: row.revision, href: href({ translationView: "words", translationTerm: row.term }), accept: { kind: "glossary-confirm", term: row.term, expectedRevision: row.revision } });
    }
    if (locale === "ja") {
      items.push({ scope: "segment", id: "seg-ja-lsd-3", reason: "glossary-disagreement", english: ARTICLES.lsd[3][1], live: "中程度の用量では視覚の流れと時間の歪みがよく見られる。", detail: "Mentions Visual drifting (視覚のドリフト); the translation says 視覚の流れ.", exception: { finding: "glossary-disagreement", hash: "h-lsd-3", term: "Visual drifting", revision: "g1:d2" }, where: "LSD · Effects summary", revision: "g1:d2", href: "/substances/lsd", accept: null });
      items.push({ scope: "segment", id: "seg-ja-mdma-1", reason: "segment-rejected", english: ARTICLES.mdma[1][1], live: null, detail: "Every attempt dropped the number in the English. Readers see English.", where: "MDMA · Dosage notes", revision: "r1", href: "/substances/mdma", accept: null });
    }
    const done = inboxDone.get(locale) ?? new Set();
    return (locale === "de" ? items.slice(0, 7) : items).filter((item) => !done.has(`${item.scope}:${item.id}`));
  }
  const REASON_ORDER = ["segment-rejected", "narrative-source-changed", "narrative-recheck", "ui-source-changed", "glossary-disagreement", "leftover-latin", "glossary-never-checked", "note-orphaned", "reader-suggestion", "model-suggestion"];
  function readInbox(params) {
    const locale = params.get("locale") ?? "";
    const refusal = denied(locale);
    if (refusal) return refusal;
    const all = inboxItems(locale).sort((a, b) => REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason));
    const counts = {};
    for (const item of all) counts[item.reason] = (counts[item.reason] ?? 0) + 1;
    const reason = params.get("reason");
    const listed = reason ? all.filter((item) => item.reason === reason) : all;
    const offset = Math.max(0, Number(params.get("offset") ?? 0) || 0);
    return json(200, { ok: true, locale, items: structuredClone(listed.slice(offset, offset + 50)), total: listed.length, offset, pageSize: 50, checked: REASON_ORDER, counts, reason: reason ?? null });
  }
  const markDone = (locale, key) => inboxDone.set(locale, new Set([...(inboxDone.get(locale) ?? []), key]));

  const articleOf = (locale, slug) => {
    const key = `${locale}:${slug}`;
    if (!articles.has(key)) {
      const rows = empty ? null : seedArticle(locale, slug, epoch);
      if (!rows) return null;
      articles.set(key, { rows, history: new Map(), version: `sv-${slug}-3` });
    }
    return articles.get(key);
  };
  function readNarrative(params) {
    const locale = params.get("locale") ?? "";
    const refusal = denied(locale);
    if (refusal) return refusal;
    const slug = (params.get("slug") ?? "").trim().toLowerCase();
    const record = articleOf(locale, slug);
    if (!record) return json(404, { error: `No published article is stored at ${slug}.` });
    const rows = structuredClone(record.rows);
    const history = params.get("history") ? structuredClone(record.history.get(params.get("history")) ?? []) : undefined;
    return json(200, { locale, kind: "article", slug, sourceVersion: record.version, rows, tally: { humanApproved: rows.filter((row) => row.overlay === "apply").length, total: rows.length }, ...(history ? { history } : {}) });
  }
  function writeNarrative(body) {
    const locale = String(body.locale ?? "");
    const refusal = denied(locale);
    if (refusal) return refusal;
    const record = articleOf(locale, String(body.slug ?? ""));
    const row = record?.rows.find((entry) => entry.id === body.id);
    if (!record || !row) return json(409, { error: "This source segment no longer exists." });
    if (body.sourceVersion !== record.version) return json(409, { error: "Source context changed. Reload before reviewing." });
    if (contest(`narrative:${locale}:${row.id}`, () => { row.revision += 1; })) return json(409, REVIEW_CONFLICT);
    if (body.expectedRevision !== row.revision) return json(409, REVIEW_CONFLICT);
    const before = { revision: row.revision, draft: row.draft, approved: row.approved };
    if (body.action === "save") {
      row.draft = { source: row.source, target: String(body.target ?? "").trim(), context: row.context };
      row.status = "draft";
    } else if (body.action === "approve") {
      if (!row.draft) return json(409, { error: "There is no saved draft to approve.", code: "TRANSLATION_REVIEW_CONFLICT" });
      row.approved = { ...row.draft, provenance: "human" };
      row.draft = null;
      row.overlay = "apply";
      row.status = "approved";
    } else if (body.action === "restore") {
      const entry = (record.history.get(row.id) ?? []).find((item) => item.revision === body.restoreRevision);
      const snapshot = entry?.after.draft ?? entry?.after.approved;
      if (!snapshot) return json(404, { error: "That revision has no translation to restore." });
      row.draft = { ...snapshot };
      row.status = "draft";
    }
    row.revision += 1;
    const entry = { revision: row.revision, action: body.action, before, after: { revision: row.revision, draft: row.draft, approved: row.approved }, actor: actor(), reason: body.reason ?? { kind: "unspecified", note: "" }, glossaryExceptions: body.glossaryExceptions ?? [], createdAt: now() };
    record.history.set(row.id, [entry, ...(record.history.get(row.id) ?? [])]);
    return json(200, { ok: true, entry: { revision: row.revision, draft: row.draft, approved: row.approved }, publication: body.action === "approve" ? [{ target: `${locale}.dose.wiki/substances/${body.slug}`, status: "accepted", attempts: 1, detail: "Cache refreshed." }] : [] });
  }

  const notesOf = (locale, slug) => {
    const key = `${locale}:${slug}`;
    if (!notes.has(key)) {
      const sections = (NOTE_SECTIONS[slug] ?? []).map(([section, label, after], index) => {
        const approved = locale === "zh-Hans" && slug === "lsd" && section === "dosage-duration" ? "在中国大陆，LSD 通常以吸墨纸形式出现，剂量难以核实。" : null;
        const draft = locale === "zh-Hans" && slug === "lsd" && section === "harm-potential" ? "请注意：本地检测服务有限。" : null;
        return { section, label, id: `article/${slug}#${section}`, present: true, afterSegmentId: `article/${slug}/${ARTICLES[slug][after][0]}/${after}`, revision: approved ? 2 : draft ? 1 : 0, draft, approved, status: approved ? "approved" : draft ? "draft" : "empty", order: index };
      });
      if (locale === "zh-Hans" && slug === "lsd") sections.push({ section: "legality", label: "Legality", id: "article/lsd#legality", present: false, afterSegmentId: null, revision: 2, draft: null, approved: "在中国大陆，LSD 属于第一类精神药品。", status: "orphaned" });
      notes.set(key, { sections, history: new Map() });
    }
    return notes.get(key);
  };
  function readNotes(params) {
    const locale = params.get("locale") ?? "";
    const refusal = denied(locale);
    if (refusal) return refusal;
    const slug = params.get("slug") ?? "";
    const record = notesOf(locale, slug);
    if (params.get("history")) return json(200, { ok: true, history: structuredClone(record.history.get(params.get("history")) ?? []) });
    return json(200, { locale, kind: "article", slug, sections: structuredClone(record.sections.map(({ order: _order, ...row }) => row)) });
  }
  function writeNote(body) {
    const locale = String(body.locale ?? "");
    const refusal = denied(locale);
    if (refusal) return refusal;
    const record = notesOf(locale, String(body.slug ?? ""));
    const row = record.sections.find((entry) => entry.section === body.section);
    if (!row) return json(404, { error: "No such section." });
    if (row.status === "orphaned") return json(409, { error: "This section is no longer in the English article. The note is orphaned and hidden from readers." });
    if (body.expectedRevision !== row.revision) return json(409, REVIEW_CONFLICT);
    const before = { revision: row.revision, draft: row.draft ? { source: "", target: row.draft, context: row.section } : null, approved: row.approved ? { source: "", target: row.approved, context: row.section } : null };
    if (body.action === "save") { row.draft = String(body.body ?? ""); row.status = "draft"; }
    else if (body.action === "approve") { row.approved = row.draft; row.draft = null; row.status = "approved"; }
    row.revision += 1;
    record.history.set(row.section, [{ revision: row.revision, action: body.action, before, after: { revision: row.revision, draft: row.draft ? { source: "", target: row.draft, context: row.section } : null, approved: row.approved ? { source: "", target: row.approved, context: row.section } : null }, actor: actor(), reason: { kind: "unspecified", note: String(body.reason ?? "") }, glossaryExceptions: [], createdAt: now() }, ...(record.history.get(row.section) ?? [])]);
    return json(200, { ok: true, entry: { revision: row.revision, draft: row.draft ? { target: row.draft } : null }, publication: [] });
  }

  const guideOf = (locale) => {
    if (!styleGuides.has(locale)) {
      const approved = empty ? null : locale === "zh-Hans" ? {
        rules: ["Use 您 only in direct safety warnings; otherwise address the reader neutrally.", "Keep substance names in their international form (LSD, MDMA).", "Write numbers and units with half-width digits: 100 微克."],
        examples: [
          { id: "ex-1", source: "Set and setting strongly shape the experience.", before: "设定和设置强烈塑造体验。", after: "心境与环境强烈影响体验。", why: "Use the glossary rendering for set and setting.", addedAt: epoch - 9 * 86_400_000, origin: { kind: "article", slug: "lsd", segment: "article/lsd/harm/6", revision: 3 } },
          { id: "ex-2", before: "请确保你保持水合。", after: "请注意及时补充水分。", why: "Plainer, and matches how health advice reads in Chinese.", addedAt: epoch - 4 * 86_400_000 },
        ],
      } : locale === "de" ? { rules: ["Duze die Lesenden.", "Substanznamen bleiben in der internationalen Form."], examples: [] } : null;
      const draft = locale === "zh-Hans" && !empty ? { ...structuredClone(approved), rules: [...approved.rules, "Prefer 体验 over 经历 for a trip."] } : null;
      styleGuides.set(locale, { revision: approved ? (draft ? 5 : 3) : 0, draft, approved, approvedRevision: approved ? `sg-${locale}-3` : "", history: approved ? [
        ...(draft ? [{ revision: 5, action: "save", before: { revision: 4, draft: null, approved: null }, after: { revision: 5, draft: null, approved: null }, actor: "mira@localhost.invalid", reason: { kind: "fluency", note: "Trips read as experiences." }, glossaryExceptions: [], createdAt: epoch - 86_400_000 }] : []),
        { revision: 3, action: "approve", before: { revision: 2, draft: null, approved: null }, after: { revision: 3, draft: null, approved: null }, actor: otherAdmin, reason: { kind: "unspecified", note: "Approved the saved style guide." }, glossaryExceptions: [], createdAt: epoch - 5 * 86_400_000 },
      ] : [] });
    }
    return styleGuides.get(locale);
  };
  function readGuide(params) {
    const locale = params.get("locale") ?? "";
    const refusal = denied(locale);
    if (refusal) return refusal;
    const guide = guideOf(locale);
    return json(200, { locale, revision: guide.revision, draft: structuredClone(guide.draft), approved: structuredClone(guide.approved), approvedRevision: guide.approvedRevision, ...(params.get("history") ? { history: structuredClone(guide.history) } : {}) });
  }
  function writeGuide(body) {
    const locale = String(body.locale ?? "");
    const refusal = denied(locale);
    if (refusal) return refusal;
    const guide = guideOf(locale);
    if (body.action === "promote") {
      const draft = guide.draft ?? structuredClone(guide.approved ?? { rules: [], examples: [] });
      draft.examples.push({ id: `ex-${draft.examples.length + 1}`, before: "…", after: "…", why: "Promoted from a correction.", addedAt: now(), origin: body.correction });
      guide.draft = draft;
      guide.revision += 1;
      return json(200, { ok: true, packet: structuredClone(guide) });
    }
    if (body.expectedRevision !== guide.revision) return json(409, REVIEW_CONFLICT);
    if (body.action === "save") guide.draft = structuredClone(body.guide);
    else if (body.action === "approve") { guide.approved = guide.draft; guide.draft = null; guide.approvedRevision = `sg-${locale}-${guide.revision + 1}`; }
    guide.revision += 1;
    guide.history.unshift({ revision: guide.revision, action: body.action, before: { revision: guide.revision - 1, draft: null, approved: null }, after: { revision: guide.revision, draft: null, approved: null }, actor: actor(), reason: body.reason ?? { kind: "unspecified", note: "" }, glossaryExceptions: [], createdAt: now() });
    return json(200, { ok: true, packet: { locale, revision: guide.revision, draft: guide.draft, approved: guide.approved, approvedRevision: guide.approvedRevision } });
  }

  function readCoverage(params) {
    const locale = params.get("locale") ?? "";
    const refusal = denied(locale);
    if (refusal) return refusal;
    const zero = { records: 0, units: 0, current: 0, missing: 0, stale: 0, rejected: 0, glossaryMisses: 0, repeatedPunctuation: 0, leftoverLatin: 0 };
    const pages = empty ? [] : COVERAGE_PAGES.map(([kind, slug, missing, stale, rejected, glossaryMisses, repeatedPunctuation, leftoverLatin]) => ({ kind, slug, href: kind === "article" ? `/substances/${slug}` : kind === "effect" ? `/effects/${slug}` : `/replications/${slug}`, records: 1, units: 40, current: 40 - missing - stale, missing, stale, rejected, glossaryMisses, repeatedPunctuation, leftoverLatin }));
    const sum = (key) => pages.reduce((total, page) => total + page[key], 0);
    const summary = empty ? zero : { records: 1240, units: 52_300, current: 50_120, missing: 1480 + sum("missing"), stale: 700 + sum("stale"), rejected: sum("rejected"), glossaryMisses: sum("glossaryMisses"), repeatedPunctuation: sum("repeatedPunctuation"), leftoverLatin: sum("leftoverLatin") };
    return json(200, {
      ok: true,
      locale,
      generatedAt: epoch - 5 * 60_000,
      inventoryGeneratedAt: epoch - 60 * 60_000,
      scope: "public-records",
      uniqueHashes: empty ? 0 : 38_420,
      catalogDigest: "cat-0042",
      summary,
      byKind: empty ? [] : [
        { kind: "article", ...summary, records: 410, units: 41_000, current: 39_200 },
        { kind: "effect", records: 320, units: 6400, current: 6300, missing: 90, stale: 10, rejected: 0, glossaryMisses: 1, repeatedPunctuation: 0, leftoverLatin: 0 },
        { kind: "replication", records: 510, units: 4900, current: 4620, missing: 180, stale: 100, rejected: 0, glossaryMisses: 0, repeatedPunctuation: 0, leftoverLatin: 0 },
      ],
      pages,
      affectedPagesTotal: pages.length,
      pagesLimit: 100,
      queue: { queued: 4, running: 1, failed: 2, completed: 404, retrying: 1 },
      ui: empty ? undefined : { locale, total: 1840, translated: 1790, missingIds: ["nav.new"], approved: 212, approvalMismatches: ["dose.light"], glossaryMisses: [{ catalogKey: "gallery.back", term: "Replication", expectedTarget: "体验再现", humanApproved: false }], compiledAt: new Date(epoch - 2 * 86_400_000).toISOString(), approvedSnapshotCurrent: false, liveVerified: false },
      exclusions: ["Interactive controls and cached deployed pages need a browser check.", "Attribution names, identifiers and URLs are never translated."],
      publication: { status: "unverified", message: "Stored translations are not evidence that the public site shows them. Import a release check to compare rendered routes." },
    });
  }

  function readChanges(params) {
    const locale = params.get("locale") ?? "";
    const refusal = denied(locale);
    if (refusal) return refusal;
    const cursor = params.get("cursor");
    const page = cursor ? 2 : 1;
    const changes = empty ? [] : [0, 1, 2].map((index) => {
      const [field, source, zh, de] = ARTICLES.lsd[index + (page - 1) * 3];
      const target = locale === "de" ? de : zh;
      return {
        id: `chg-${locale}-${page}-${index}`,
        hash: `h-lsd-${index}`,
        before: index === 2 ? null : { source, target: `${target.slice(0, -1)}${locale === "de" ? "" : "。"}`, model: "fixture-model-1", promptVersion: "p-0041" },
        after: { source, target, model: "fixture-model-2", promptVersion: "p-0042" },
        createdAt: epoch - (index + (page - 1) * 3 + 1) * 3_600_000,
        pages: [{ label: `LSD, ${field}`, href: "/substances/lsd" }],
        pagesTotal: index === 0 ? 4 : 1,
      };
    });
    return json(200, { ok: true, locale, changes, nextCursor: page === 1 && !empty ? "cursor-2" : null });
  }

  return function route({ upper, pathname, params, body }) {
    const base = "/api/dev/translation-glossary";
    if (pathname === base && upper === "GET") return toolRead(() => listGlossary(params));
    if (pathname === `${base}/history`) {
      if (upper === "GET") return toolRead(() => glossaryHistoryRead(params));
      if (upper === "POST") return toolWrite(() => glossaryRestore(body ?? {}));
    }
    if (pathname === `${base}/export` && upper === "GET") return toolRead(() => json(200, { ok: true }));
    const action = pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1) : null;
    if (action && upper === "POST") {
      if (action === "approve" || action === "confirm" || action === "edit") return toolWrite(() => glossaryWrite(action, body ?? {}));
      if (action === "gloss") {
        return toolWrite(() => {
          if (!["admin", "editor", "editor_translator"].includes(role())) return json(403, { error: "Editor access required to write definitions." });
          const term = String(body?.term ?? "");
          const gloss = String(body?.gloss ?? "").trim();
          if (!gloss || gloss.length > 300) return json(400, { error: "A definition of 1 to 300 characters is required." });
          glosses[term] = gloss;
          return json(200, { ok: true, row: { term, gloss } });
        });
      }
      if (action === "import") return toolWrite(() => importCsv(params, body));
      if (action === "draft") return toolWrite(() => adminOnly(() => json(200, { ok: true, universe: 40, existing: 25, drafted: 12, flagged: ["Come down"], failed: [], collisions: ["Awe"] })));
      if (action === "retranslate") {
        return toolWrite(() => adminOnly(() => {
          const locale = String(body?.locale ?? "");
          pending.set(locale, []);
          return json(200, { ok: true, segments: 184, jobs: { article: 22, effect: 5 } });
        }));
      }
      if (action === "enqueue-all") {
        return toolWrite(() => adminOnly(() => {
          const locale = String(body?.locale ?? "");
          const stats = progress.get(locale);
          if (stats) stats.jobs = { runId: `run-${locale}-new`, requestedAt: 0, total: 1240, active: 1240, completed: 0, completedWithRejections: 0, exhausted: 0, inFlight: 100, retrying: 0 };
          return json(200, { ok: true, total: 1240, jobs: { article: 410, effect: 320, replication: 510 } });
        }));
      }
      if (action === "retry-exhausted") return toolWrite(() => adminOnly(() => json(200, { ok: true, requeued: progress.get(String(body?.locale ?? ""))?.jobs.exhausted ?? 0 })));
    }

    const workbench = "/api/dev/translation-workbench";
    if (pathname === workbench) {
      if (upper === "GET") {
        return toolRead(() => {
          const locale = params.get("locale") ?? "";
          const refusal = denied(locale);
          if (refusal) return refusal;
          return json(200, { ok: true, locale, locales: allowed(), rows: structuredClone(labelsOf(locale)), catalogRefreshed: locale !== "zh-Hans" });
        });
      }
      if (upper === "POST") return toolWrite(() => labelWrite(body ?? {}));
    }
    if (pathname === `${workbench}/history` && upper === "GET") {
      return toolRead(() => {
        const locale = params.get("locale") ?? "";
        const refusal = denied(locale);
        if (refusal) return refusal;
        return json(200, { ok: true, history: structuredClone(labelHistory.get(`${locale}:${params.get("id")}`) ?? []) });
      });
    }
    if (pathname === `${workbench}/approve-many` && upper === "POST") return toolWrite(() => labelApproveMany(body ?? {}));

    if (pathname === "/api/dev/translation-inbox" && upper === "GET") return toolRead(() => readInbox(params));
    if (pathname === "/api/dev/translation-inbox/exception" && upper === "POST") {
      return toolWrite(() => {
        const locale = String(body?.locale ?? "");
        const refusal = denied(locale);
        if (refusal) return refusal;
        const item = inboxItems(locale).find((entry) => entry.exception?.hash === body?.hash && entry.exception?.term === body?.term);
        if (!item) return json(409, { error: "This translation no longer disagrees with the glossary. Reload the inbox.", code: "QA_FINDING_GONE" });
        markDone(locale, `${item.scope}:${item.id}`);
        return json(200, { ok: true });
      });
    }
    if (pathname === "/api/dev/translation-inbox/suggestion" && upper === "POST") {
      return toolWrite(() => {
        const locale = String(body?.locale ?? "");
        const refusal = denied(locale);
        if (refusal) return refusal;
        markDone(locale, `model:${body?.id}`);
        return json(200, { ok: true });
      });
    }

    if (pathname === "/api/dev/translation-narrative") {
      if (upper === "GET") return toolRead(() => readNarrative(params));
      if (upper === "POST") return toolWrite(() => writeNarrative(body ?? {}));
    }
    if (pathname === "/api/dev/translation-note") {
      if (upper === "GET") return toolRead(() => readNotes(params));
      if (upper === "POST") return toolWrite(() => writeNote(body ?? {}));
    }
    if (pathname === "/api/dev/translation-style-guide") {
      if (upper === "GET") return toolRead(() => readGuide(params));
      if (upper === "POST") return toolWrite(() => writeGuide(body ?? {}));
    }
    if (pathname === "/api/dev/translation-coverage" && upper === "GET") return toolRead(() => readCoverage(params));
    if (pathname === "/api/dev/translation-changes" && upper === "GET") return toolRead(() => readChanges(params));
    if (pathname === "/api/dev/translation-fluency" && upper === "POST") {
      return toolWrite(() => adminOnly(() => json(200, { ok: true, run: { stored: 3, reviewed: 8, skipped: 0, dropped: { validator: 1, glossary: 0, numbers: 0, span: 0 }, model: "fixture-model-2", promptVersion: "fp-0005", usage: { prompt: 5200, completion: 640, requests: 2 } } })));
    }
    if (pathname === "/api/glossary-feedback/reactions" && upper === "GET") {
      return toolRead(() => json(200, { ok: true, reactions: empty ? [] : [
        { term: "Tolerance", target: rowsOf(params.get("locale") ?? "")[22]?.target ?? "Toleranz", version: "v1:5b3e0c2a9f", right: 14, improve: 5 },
        { term: "Visual drifting", target: rowsOf(params.get("locale") ?? "")[0]?.target ?? "Visuelles Driften", version: "v2:77aa01ee40", right: 31, improve: 1 },
        { term: "Ego death", target: rowsOf(params.get("locale") ?? "")[3]?.target ?? "Ich-Tod", version: "v1:0c9d2e11aa", right: 6, improve: 7 },
      ] }));
    }
    if (pathname === "/api/dev/glossary-readiness" && upper === "GET") {
      return toolRead(() => {
        const locale = params.get("locale") ?? "";
        const live = LIVE.has(locale);
        return json(200, {
          ok: true,
          readiness: { state: live ? "Released" : "Not released", stale: live, revision: `gr-${locale}-0042` },
          evidence: live ? { locale, host: "zh.dose.wiki", checkedRevision: "gr-zh-Hans-0040", checkedAt: new Date(epoch - 12 * 86_400_000).toISOString(), expiresAt: new Date(epoch + 2 * 86_400_000).toISOString(), glossaryRevision: "gr-zh-Hans-0040", contentCoverage: true, interfaceCoverage: true, routesVerified: true, deploymentUrl: "https://zh.dose.wiki", released: true } : null,
        });
      });
    }
    if (pathname === "/api/glossary-usage" && upper === "GET") {
      const term = params.get("term") ?? "";
      return json(200, { term, nodes: [
        { id: `${term}-1`, href: "/substances/lsd", title: "LSD", context: "Subjective effects", kind: "content" },
        { id: `${term}-2`, href: "/effects/visual-drifting", title: "Visual drifting", context: "Summary", kind: "content" },
        { id: `${term}-3`, href: "/effects", title: "Effects index", context: "Category heading", kind: "label" },
        { id: `${term}-4`, href: "/substances/mescaline", title: "Mescaline", context: "Subjective effects", kind: "content" },
      ], totalSourceNodes: 4, nextOffset: null, coverage: "Articles, effects and index labels." });
    }
    return null;
  };
}
