/**
 * The approved style guide in a translation prompt.
 *
 * A locale's style guide (the `style-guide` review scope, loaded by
 * `lib/translation/styleGuide.ts`) holds rules its translators wrote and
 * example corrections (before, after, why), most of them promoted from
 * Fluency corrections in the article reader. Only the approved guide reaches
 * this module; the caller passes it as `{ rules, examples, revision }`, and
 * its `revision` joins the prompt version digest (`promptVersionFor` in
 * liveTranslation.ts).
 *
 * Every approved rule is printed. Examples are chosen per batch, and the
 * choice is a pure function of the approved guide and the batch text: rank
 * by term overlap with the text (the shared matcher in term-match.mjs, so
 * inflections count), then by recency, then by id; take at most
 * `STYLE_EXAMPLE_LIMIT`, skipping any that would push the printed examples
 * past `STYLE_EXAMPLE_CHAR_CAP` characters.
 */

import { mentionsTerm } from "./term-match.mjs";

/** Examples printed per batch at most. */
export const STYLE_EXAMPLE_LIMIT = 5;
/** Characters of example text (English, before, after, why) printed per batch at most. */
export const STYLE_EXAMPLE_CHAR_CAP = 2400;

/** Words too common to say two sentences share a subject. */
const STOPWORDS = new Set([
  "about", "after", "also", "been", "before", "being", "between", "both", "could", "does", "each", "even", "from", "have",
  "into", "itself", "just", "many", "more", "most", "much", "only", "other", "over", "same", "some", "such", "than",
  "that", "their", "them", "then", "there", "these", "they", "this", "those", "through", "under", "very", "were",
  "what", "when", "where", "which", "while", "will", "with", "within", "without", "would", "your",
]);

/** The words of an example's English that can overlap with a batch: four or more letters, not a stopword, lowercased, once each. */
export function styleExampleTerms(english) {
  const words = String(english ?? "").match(/[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*/g) ?? [];
  return [...new Set(words.map((word) => word.toLowerCase()).filter((word) => word.length >= 4 && !STOPWORDS.has(word)))];
}

/**
 * Whether `text` mentions an example word. The shared matcher inflects from
 * the base form, so a plural example word ("phenidates") is also tried as
 * its singular.
 */
function mentionsWord(text, word) {
  if (mentionsTerm(text, word)) return true;
  if (word.endsWith("ies")) return mentionsTerm(text, `${word.slice(0, -3)}y`);
  return word.endsWith("s") && !word.endsWith("ss") && mentionsTerm(text, word.slice(0, -1));
}

/** How many of the example's English terms the batch text mentions. */
export function styleExampleOverlap(example, text) {
  return styleExampleTerms(example.source).filter((term) => mentionsWord(text, term)).length;
}

function exampleSize(example) {
  return (example.source ?? "").length + example.before.length + example.after.length + example.why.length;
}

/**
 * The examples one batch prints, in print order: term overlap with `text`
 * first, then the most recently added, then id; at most `limit`, and at most
 * `charCap` characters of example text in total. An example that alone would
 * exceed what is left is skipped, and a smaller one after it may still fit.
 */
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

/**
 * Prompt lines for the approved guide and one batch's English text; empty
 * when the guide has no rules and no example fits.
 */
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
