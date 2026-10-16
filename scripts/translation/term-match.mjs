const VOWEL = /[aeiou]/;

function inflections(word) {
  const lower = word.toLowerCase();
  if (/[ts]ion$/.test(lower)) {
    return { stem: lower.slice(0, -3), suffixes: ["ion", "ions", "e", "es", "ed", "ing"] };
  }
  if (lower.endsWith("ee")) {
    return { stem: lower, suffixes: ["", "s", "d", "ing"] };
  }
  if (lower.endsWith("e")) {
    return { stem: lower.slice(0, -1), suffixes: ["e", "es", "ed", "ing", "ion", "ions"] };
  }
  if (/[^aeiou]y$/.test(lower)) {
    return { stem: lower.slice(0, -1), suffixes: ["y", "ies", "ied", "ying"] };
  }
  const suffixes = ["", "s", "es", "ing", "ed", "ion", "ions"];
  const [c1, v, c2] = lower.slice(-3);
  if (lower.length >= 3 && !VOWEL.test(c1) && VOWEL.test(v) && !VOWEL.test(c2) && !"wxy".includes(c2)) {
    suffixes.push(`${c2}ing`, `${c2}ed`);
  }
  return { stem: lower, suffixes };
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function tokens(term) {
  const parts = term.match(/[A-Za-z0-9]+|[^A-Za-z0-9]+/g) ?? [];
  return parts.map((text, index) => {
    const minimum = index === parts.length - 1 ? 2 : 3;
    return /^[A-Za-z]+$/.test(text) && text.length >= minimum ? { text, ...inflections(text) } : { text, literal: true };
  });
}

const cache = new Map();

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

export function mentionsTerm(text, term) {
  return termMatcher(term).test(text);
}

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
const KEY_LENGTH = 3;

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
