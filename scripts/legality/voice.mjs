export const READER_FIELDS = ["notes", "designation", "instrument", "status"];

const ALTERNATIVES = [
  String.raw`\b(fetched|inspected|reopened|re-?exported|tracker|packets?|dossier|orchestrator|refuter|subagent|worker|uncited|repaired|refuted|refutation)\b`,
  String.raw`\bstage\s[ab]\b`,
  String.raw`contentHash|data\.cloud|citationNeeded|canonicalStatus`,
  String.raw`\bcanonical\b(?!\s*/?\s*(connectivity\s*/?\s*)?SMILES)`,
  String.raw`\bnormali[sz]ed\sto\b`,
  String.raw`\b(legacy|existing|prior|previous|original|old|stale|supplied|live|uncited)\s(\w+\s)?(rows?|entry|entries|claim|status|wording|notes?|label|value|text|statement|conclusion|proposal|result|classification)\b`,
  String.raw`\bthis\s(row|dossier|draft|packet|research|audit|correction|repair)\b`,
  String.raw`\bthe\s(\w+\s)?result\sis\b`,
  String.raw`\bcontradicts\sthe\s(uncited|prior|previous|original|existing|legacy)\b`,
  String.raw`\b(is|was|are|were|remains?|substantively|directionally|materially)\s(supported|corrected|refuted|upheld|verified|unverified|confirmed|retained|correct|incorrect|reliable|right|wrong)\b`,
  String.raw`\bsupported\s(correction|repair|and\s\w+)\b`,
  String.raw`\bcorrected\s(to|from|rather|in\sprecision)\b`,
  String.raw`\bin\sprecision\b`,
  String.raw`\bshould\sbe\s(re-?)?(checked|reviewed|verified|confirmed|sourced)\b`,
  String.raw`\bneeds?\s(review|sourcing|verification)\b`,
  String.raw`\bbefore\spublication\b|\bmust\sbe\ssourced\b|\bcould\snot\sbe\sverified\b|\bcitation\sneeded\b|\bverified\sagainst\b`,
  String.raw`\bno\sclaim\sis\smade\b|\bnot\s(asserted|relied\son)\b|\bclaim\s(does|is|rests|tested)\b`,
  String.raw`\bsearch(es)?\s(run|returned|found|surfaced)\b|\bqueried\sfor\b|\bcheck\sof\b`,
  String.raw`\b(was|were)\s(not\s)?(checked|examined|reviewed|located|consulted|inspected|read|relied)\b`,
  String.raw`\bthe\s(cited|fetched|inspected|official|primary|first-party)\ssources?\b|\bthe\ssources?\s(nevertheless|directly|does|itself|identifies|supports|names|states)\b`,
  String.raw`\b(legal[\s-]regulated|restricted[\s-]other)\b`,
  String.raw`\b[a-z]+_[a-z]+(_[a-z]+)*\b`,
];

const ADVISORY_ALTERNATIVES = [
  String.raw`\bsupports\b`,
  String.raw`^\s*supported\b`,
  String.raw`\bthis\s(entry|result)\b`,
  String.raw`\bexamined\b`,
  String.raw`\bthe\sclaim\b`,
  String.raw`\banalog(ue)?[\s-]covered\b`,
];

const VOICE_PATTERN = new RegExp(ALTERNATIVES.join("|"), "i");
const VOICE_AUDIT_PATTERN = new RegExp([...ALTERNATIVES, ...ADVISORY_ALTERNATIVES].join("|"), "i");

const STATUS_PATTERN = /\b[a-z]+_[a-z]+(_[a-z]+)*\b/i;

const CITE_MARKER = /\[cite:[^\]]+\]/g;

export function voiceMatch(field, value, mode = "block") {
  if (typeof value !== "string" || value.length === 0) return null;
  const text = value.replace(CITE_MARKER, "");
  const pattern = field === "status"
    ? STATUS_PATTERN
    : mode === "audit" ? VOICE_AUDIT_PATTERN : VOICE_PATTERN;
  return text.match(pattern)?.[0] ?? null;
}

export function voiceHits(entry, mode = "block") {
  const hits = [];
  if (!entry || typeof entry !== "object") return hits;
  for (const field of READER_FIELDS) {
    const match = voiceMatch(field, entry[field], mode);
    if (match) hits.push({ field, match });
  }
  return hits;
}
