/**
 * The shared glossary term matcher: does this English text mention this term?
 *
 * Whole words, case insensitive, and English inflections of every word in the
 * term: plurals and the -ing, -ed, and -ion forms. "phenidates" mentions
 * Phenidate and "replicating" mentions Replication; "lightheaded" does not
 * mention Light, and a synonym ("recreations") never mentions anything.
 * Punctuation, digits, and short words stay literal, so "2C-B" and "5-HT2A"
 * match only as written.
 *
 * One matcher serves every place that asks the question: the prompt builder,
 * the validator's GLOSSARY_MISS check, the QA packet, the coverage lens, the
 * UI catalog compiler, and the scoped stale replay. What gets injected is what
 * gets checked and what gets retranslated. Plain ESM so the pipeline scripts
 * and `lib/translation` (through `term-match.d.ts`) import the same code.
 */

const VOWEL = /[aeiou]/;

/** Stem and suffix alternatives for one word; every form is `stem + suffix`. */
function inflections(word) {
  const lower = word.toLowerCase();
  if (/[ts]ion$/.test(lower)) {
    // replication, replications, replicate, replicates, replicated, replicating
    return { stem: lower.slice(0, -3), suffixes: ["ion", "ions", "e", "es", "ed", "ing"] };
  }
  if (lower.endsWith("ee")) {
    return { stem: lower, suffixes: ["", "s", "d", "ing"] };
  }
  if (lower.endsWith("e")) {
    // phenidate, phenidates, dosed, dosing, sedation
    return { stem: lower.slice(0, -1), suffixes: ["e", "es", "ed", "ing", "ion", "ions"] };
  }
  if (/[^aeiou]y$/.test(lower)) {
    return { stem: lower.slice(0, -1), suffixes: ["y", "ies", "ied", "ying"] };
  }
  const suffixes = ["", "s", "es", "ing", "ed", "ion", "ions"];
  const [c1, v, c2] = lower.slice(-3);
  if (lower.length >= 3 && !VOWEL.test(c1) && VOWEL.test(v) && !VOWEL.test(c2) && !"wxy".includes(c2)) {
    // trip, tripping, tripped
    suffixes.push(`${c2}ing`, `${c2}ed`);
  }
  return { stem: lower, suffixes };
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The term split into literal pieces and inflectable words, in order. A word
 * inflects when it is all letters and at least three long; the last word also
 * inflects at two letters, so "come-up" matches "come-ups" while "of" inside
 * a phrase stays literal.
 */
function tokens(term) {
  const parts = term.match(/[A-Za-z0-9]+|[^A-Za-z0-9]+/g) ?? [];
  return parts.map((text, index) => {
    const minimum = index === parts.length - 1 ? 2 : 3;
    return /^[A-Za-z]+$/.test(text) && text.length >= minimum ? { text, ...inflections(text) } : { text, literal: true };
  });
}

const cache = new Map();

/**
 * The matcher for one term: a case-insensitive, non-global RegExp, so
 * `.test()` carries no state between calls. Cached per term.
 */
export function termMatcher(term) {
  let pattern = cache.get(term);
  if (!pattern) {
    const body = tokens(term)
      .map((token) => {
        if (token.literal) return escape(token.text);
        const alternatives = token.suffixes.filter(Boolean).sort((a, b) => b.length - a.length);
        return `${escape(token.stem)}(?:${alternatives.join("|")})${token.suffixes.includes("") ? "?" : ""}`;
      })
      .join("");
    pattern = new RegExp(`\\b${body}\\b`, "i");
    cache.set(term, pattern);
  }
  return pattern;
}

/** Whether `text` mentions `term`, inflected forms included. */
export function mentionsTerm(text, term) {
  return termMatcher(term).test(text);
}

/**
 * Literal fragments every match of `term` contains, in order (compared case
 * insensitively). A substring prefilter such as SQL `ILIKE '%a%b%'` built from
 * them never drops a text the matcher would accept; the matcher still decides.
 */
export function termFragments(term) {
  const fragments = [];
  let current = "";
  for (const token of tokens(term)) {
    if (token.literal) {
      current += token.text;
      continue;
    }
    current += token.stem;
    fragments.push(current);
    current = "";
  }
  if (current) fragments.push(current);
  return fragments;
}

const ALNUM_RUN = /[A-Za-z0-9]+/g;
/** Letters of a run's start that index a term; a run is looked up by each of its first ones. */
const KEY_LENGTH = 3;

/**
 * Which of many terms a text mentions, in the order given: the same answer
 * as filtering them with `mentionsTerm`, without running every matcher on
 * every text. A match of a term's first word or identifier is always a whole
 * run of ASCII letters and digits in the text (the matcher's `\b` and the
 * term's own separators bound it, and its case folding never reaches outside
 * ASCII), and that run starts with the word's stem. So the text's runs, keyed
 * by their first letters, name every candidate, and the matcher still decides.
 * Pass `termOf` to get back the caller's own items.
 */
export function termFinder(items, termOf = (item) => item) {
  const byKey = new Map();
  const always = [];
  items.forEach((item, index) => {
    const anchor = tokens(termOf(item)).find((token) => /[A-Za-z0-9]/.test(token.text));
    const key = anchor ? (anchor.literal ? anchor.text : anchor.stem).toLowerCase().slice(0, KEY_LENGTH) : "";
    if (!key) {
      always.push(index);
      return;
    }
    const list = byKey.get(key);
    if (list) list.push(index);
    else byKey.set(key, [index]);
  });
  return (text) => {
    const candidates = new Set(always);
    for (const [run] of text.matchAll(ALNUM_RUN)) {
      const lower = run.toLowerCase();
      for (let length = 1; length <= Math.min(KEY_LENGTH, lower.length); length += 1) {
        for (const index of byKey.get(lower.slice(0, length)) ?? []) candidates.add(index);
      }
    }
    return [...candidates].sort((a, b) => a - b).filter((index) => mentionsTerm(text, termOf(items[index]))).map((index) => items[index]);
  };
}
