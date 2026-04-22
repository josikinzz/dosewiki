/**
 * Compatibility facade for smaller source-specific parsers.
 * The parser implementations now live in `scripts/parsers/sources/*`.
 */

export { IsomerDesignParser, isomerDesignParser } from "./sources/isomerdesign";
export { SaferPartyParser, saferPartyParser } from "./sources/saferparty";
export { DEISParser, deiaParser } from "./sources/deis";
export { DrugUsersBibleParser, drugUsersBibleParser } from "./sources/drugusersbible";
export { DrugClassroomParser, drugClassroomParser } from "./sources/drugclassroom";
export { WikipediaParser, wikipediaParser } from "./sources/wikipedia";
