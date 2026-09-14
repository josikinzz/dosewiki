export type PaletteRole = "surface" | "accent" | "semantic";

const SEMANTIC = /(?:^--c-(?:emerald|amber|orange|rose|blue)|^--h-(?:success|caution|unsafe|danger|info)|^--theme-(?:success|warning|danger|evidence|semantic-|interaction-(?:danger|unsafe|caution)|dose-tier|plateau-tier|report-phase))/;
const ACCENT = /(?:^--c-(?:brand|accent|violet)|^--h-brand|^--ei-(?:accent|selection|ring-soft|highlight|on-accent)|^--theme-(?:accent|section-heading|logo|ring-soft|selection|search-(?:highlight|focus-glow|overlay-panel|best-match|suggestion)|scrollbar|index-card-(?:bullet|count)|plum-chip|state-card-sheen|article-hero-divider|molecule-shell|duration-stage-row-alt|ld50-table|dose-detail-expanded|selected-control|inline-reference)|^--site-logo-stop)/;

export function paletteTokenRole(token: string): PaletteRole {
  if (SEMANTIC.test(token)) return "semantic";
  if (ACCENT.test(token)) return "accent";
  return "surface";
}


