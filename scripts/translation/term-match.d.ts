/** The shared glossary term matcher (whole word, case insensitive, English inflections per word); see term-match.mjs. */
export function termMatcher(term: string): RegExp;

/** Whether `text` mentions `term`, inflected forms included. */
export function mentionsTerm(text: string, term: string): boolean;

/** Literal fragments every match of `term` contains, in order, case insensitively; for a substring prefilter. */
export function termFragments(term: string): string[];

/** Which of many terms a text mentions, in the order given; the same answer as filtering with `mentionsTerm`, indexed. */
export function termFinder(terms: readonly string[]): (text: string) => string[];
export function termFinder<T>(items: readonly T[], termOf: (item: T) => string): (text: string) => T[];
