import { mentionsTerm } from "./term-match.mjs";

export const STYLE_EXAMPLE_LIMIT = 5;
export const STYLE_EXAMPLE_CHAR_CAP = 2400;

const STOPWORDS = new Set([
  "about", "after", "also", "been", "before", "being", "between", "both", "could", "does", "each", "even", "from", "have",
  "into", "itself", "just", "many", "more", "most", "much", "only", "other", "over", "same", "some", "such", "than",
  "that", "their", "them", "then", "there", "these", "they", "this", "those", "through", "under", "very", "were",
  "what", "when", "where", "which", "while", "will", "with", "within", "without", "would", "your",
]);

export function styleExampleTerms(english) {
  const words = String(english ?? "").match(/[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*/g) ?? [];
  return [...new Set(words.map((word) => word.toLowerCase()).filter((word) => word.length >= 4 && !STOPWORDS.has(word)))];
}

function mentionsWord(text, word) {
  if (mentionsTerm(text, word)) return true;
  if (word.endsWith("ies")) return mentionsTerm(text, `${word.slice(0, -3)}y`);
  return word.endsWith("s") && !word.endsWith("ss") && mentionsTerm(text, word.slice(0, -1));
}

export function styleExampleOverlap(example, text) {
  return styleExampleTerms(example.source).filter((term) => mentionsWord(text, term)).length;
}

function exampleSize(example) {
  return (example.source ?? "").length + example.before.length + example.after.length + example.why.length;
}

export function selectStyleExamples(examples, text, { limit = STYLE_EXAMPLE_LIMIT, charCap = STYLE_EXAMPLE_CHAR_CAP } = {}) {
  const ranked = (examples ?? [])
    .map((example) => ({ example, overlap: styleExampleOverlap(example, text) }))
    .sort((a, b) => b.overlap - a.overlap || (b.example.addedAt ?? 0) - (a.example.addedAt ?? 0) || String(a.example.id).localeCompare(String(b.example.id)));
  const chosen = [];
  let used = 0;
  for (const { example } of ranked) {
    if (chosen.length >= limit) break;
    const size = exampleSize(example);
    if (used + size > charCap) continue;
    chosen.push(example);
    used += size;
  }
  return chosen;
}

export function styleGuidePromptLines(locale, styleGuide, text) {
  if (!styleGuide) return [];
  const rules = (styleGuide.rules ?? []).map((rule) => rule.trim()).filter(Boolean);
  const examples = selectStyleExamples(styleGuide.examples ?? [], text);
  const lines = [];
  if (rules.length > 0) {
    lines.push("", `Style rules for ${locale.label}, written by its reviewers:`, ...rules.map((rule) => `- ${rule}`));
  }
  if (examples.length > 0) {
    lines.push("", "Reviewers corrected earlier machine wording like this. Learn the lesson; do not copy these sentences into unrelated segments:");
    for (const example of examples) {
      if (example.source) lines.push(`English: ${example.source}`);
      lines.push(`Before: ${example.before}`, `After: ${example.after}`, `Why: ${example.why}`, "");
    }
    lines.pop();
  }
  return lines;
}
