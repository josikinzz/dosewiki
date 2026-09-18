/**
 * Compatibility facade for smaller source-specific parsers.
 * The parser implementations now live in `scripts/parsers/sources/*`.
 */

export { isomerDesignParser } from "./sources/isomerdesign";
export { saferPartyParser } from "./sources/saferparty";
export { deiaParser } from "./sources/deis";
export { drugUsersBibleParser } from "./sources/drugusersbible";
export { drugClassroomParser } from "./sources/drugclassroom";
export { wikipediaParser } from "./sources/wikipedia";
