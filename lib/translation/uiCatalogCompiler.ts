import { getUiMessageDefinition, UI_MESSAGE_ALIASES, UI_MESSAGE_DEFINITIONS } from "../../src/i18n/uiMessageDefinitions";
import { UI_MESSAGE_SEEDS } from "../../src/i18n/uiMessageSeeds";
import { termMatcher } from "../../scripts/translation/term-match.mjs";

export type UiCatalogGlossaryMiss = { catalogKey: string; term: string; expectedTarget: string; humanApproved: boolean };
export type UiCatalogPendingRefresh = { catalogKey: string; term: string; expectedTarget: string };

export function expandUiGlossaryAliases(glossary: ReadonlyMap<string, string>): Map<string, string> {
  const expanded = new Map(glossary);
  const folded = new Map([...glossary].map(([term, target]) => [term.toLowerCase(), target]));
  for (const definition of Object.values(UI_MESSAGE_DEFINITIONS)) {
    const target = (definition.glossaryTerms as readonly string[]).map((term) => folded.get(term.toLowerCase())).find(Boolean);
    if (!target) continue;
    for (const term of definition.glossaryTerms) {
      if (!folded.has(term.toLowerCase())) expanded.set(term, target);
    }
  }
  return expanded;
}

export function getUiCatalogGlossaryMisses(
  catalog: Readonly<Record<string, string>>,
  glossary: ReadonlyMap<string, string>,
  approvedOverrides: Readonly<Record<string, string>> = {},
): UiCatalogGlossaryMiss[] {
  const patterns = [...expandUiGlossaryAliases(glossary)].filter(([, target]) => target.trim()).map(([term, target]) => ({ term, target, pattern: termMatcher(term) }));
  const misses: UiCatalogGlossaryMiss[] = [];
  for (const [key, target] of Object.entries(catalog)) {
    if (getUiMessageDefinition(key) || UI_MESSAGE_ALIASES[key]) continue;
    const reported = new Set<string>();
    for (const entry of patterns) {
      if (entry.pattern.test(key) && !target.includes(entry.target) && !reported.has(entry.target)) {
        reported.add(entry.target);
        misses.push({ catalogKey: key, term: entry.term, expectedTarget: entry.target, humanApproved: Boolean(approvedOverrides[key]) });
      }
    }
  }
  return misses;
}

export function compileUiCatalog(input: {
  locale: string;
  keys: Iterable<string>;
  existing: Readonly<Record<string, string>>;
  glossary: ReadonlyMap<string, string>;
  auditGlossary?: ReadonlyMap<string, string>;
  approvedOverrides: Readonly<Record<string, string>>;
  seed?: ReadonlyMap<string, string>;
}): { catalog: Record<string, string>; pending: string[]; pendingRefresh: UiCatalogPendingRefresh[]; glossaryMisses: UiCatalogGlossaryMiss[] } {
  const catalog: Record<string, string> = {};
  const pending: string[] = [];
  const glossaryResolvedKeys = new Set<string>();
  const foldedGlossary = new Map([...input.glossary].map(([term, target]) => [term.toLocaleLowerCase("en-US"), target]));
  const keys = new Set([...input.keys, ...Object.keys(UI_MESSAGE_DEFINITIONS)]);
  for (const key of keys) {
    const definition = getUiMessageDefinition(key);
    const terms = definition?.glossaryTerms ?? [key];
    const glossaryTarget = terms.map((term) => input.glossary.get(term) ?? foldedGlossary.get(term.toLocaleLowerCase("en-US"))).find(Boolean);
    if (glossaryTarget) glossaryResolvedKeys.add(key);
    const target = input.approvedOverrides[key] || glossaryTarget || input.existing[key]
      || UI_MESSAGE_SEEDS[input.locale]?.[key] || input.seed?.get(key);
    if (target) catalog[key] = target;
    else pending.push(key);
  }
  for (const [literal, id] of Object.entries(UI_MESSAGE_ALIASES)) {
    if (catalog[id]) catalog[literal] = catalog[id];
  }
  const glossaryMisses = getUiCatalogGlossaryMisses(catalog, input.auditGlossary ?? input.glossary, input.approvedOverrides);
  const refreshByKey = new Map<string, UiCatalogPendingRefresh>();
  for (const miss of glossaryMisses) {
    if (miss.humanApproved || glossaryResolvedKeys.has(miss.catalogKey) || refreshByKey.has(miss.catalogKey)) continue;
    refreshByKey.set(miss.catalogKey, { catalogKey: miss.catalogKey, term: miss.term, expectedTarget: miss.expectedTarget });
  }
  const pendingRefresh = [...refreshByKey.values()];
  return { catalog, pending: [...pending.filter((key) => !catalog[key]), ...refreshByKey.keys()], pendingRefresh, glossaryMisses };
}
