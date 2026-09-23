/** The shared glossary term matcher (whole word, case insensitive, English inflections per word); see term-match.mjs. */
export function termMatcher(term: string): RegExp;

/** Whether `text` mentions `term`, inflected forms included. */
export function mentionsTerm(text: string, term: string): boolean;

/** Literal fragments every match of `term` contains, in order, case insensitively; for a substring prefilter. */
export function termFragments(term: string): string[];
