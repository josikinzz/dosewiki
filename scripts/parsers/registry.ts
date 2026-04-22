/**
 * Unified parser registry.
 * Keeps source-to-parser mapping separate from aggregation logic.
 */

import type { ParserResult } from "./types";
import type { SourceParserRegistry } from "./contracts";

import { tripsitFactsheetsParser, tripsitWikiParser } from "./tripsit";
import { psychonautWikiParser } from "./psychonautwiki";
import { drugBankParser } from "./drugbank";
import { erowidParser } from "./erowid";
import {
  isomerDesignParser,
  saferPartyParser,
  deiaParser,
  drugUsersBibleParser,
  drugClassroomParser,
  wikipediaParser,
} from "./others";
import { normalizeParserSourceId } from "./contracts";

export const parsers: SourceParserRegistry = {
  "tripsit-factsheets": tripsitFactsheetsParser,
  "tripsit-wiki": tripsitWikiParser,
  psychonautwiki: psychonautWikiParser,
  drugbank: drugBankParser,
  erowid: erowidParser,
  isomerdesign: isomerDesignParser,
  saferparty: saferPartyParser,
  disregardeverythingisay: deiaParser,
  drugusersbible: drugUsersBibleParser,
  thedrugclassroom: drugClassroomParser,
  wikipedia: wikipediaParser,
};

export function getParser(sourceId: string) {
  return parsers[normalizeParserSourceId(sourceId)];
}

export function parseSource(
  sourceId: string,
  content: string,
  substanceName: string,
): ParserResult | undefined {
  const parser = getParser(sourceId);
  if (!parser) return undefined;
  return parser.parse(content, substanceName);
}
