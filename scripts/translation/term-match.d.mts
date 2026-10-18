export function termMatcher(term: string): RegExp;

export function mentionsTerm(text: string, term: string): boolean;

export function termFragments(term: string): string[];

export function termFinder(terms: readonly string[]): (text: string) => string[];
export function termFinder<T>(items: readonly T[], termOf: (item: T) => string): (text: string) => T[];
