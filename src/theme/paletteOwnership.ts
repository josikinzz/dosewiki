export type PaletteRole = "surface" | "accent" | "semantic";

const SEMANTIC = /(?:^--c-(?:emerald|amber|orange|rose|blue)|^--h-(?:success|caution|unsafe|danger|info)|^--theme-(?:success|warning|danger|evidence|semantic-|interaction-(?:danger|unsafe|caution)|dose-tier|plateau-tier|report-phase))/;
const ACCENT = /(?:^--c-(?:brand|accent|violet)|^--h-brand|^--ei-(?:accent|selection|ring-soft|highlight|on-accent)|^--theme-(?:accent|section-heading|logo|ring-soft|selection|search-highlight|scrollbar|index-card-bullet|header-nav-active|selected-control|inline-reference)|^--site-logo-stop)/;

export function paletteTokenRole(token: string): PaletteRole {
  if (SEMANTIC.test(token)) return "semantic";
  if (ACCENT.test(token)) return "accent";
  return "surface";
}

export function selectPaletteRole(values: Readonly<Record<string, string>>, role: PaletteRole) {
  return Object.fromEntries(Object.entries(values).filter(([token]) => paletteTokenRole(token) === role));
}
