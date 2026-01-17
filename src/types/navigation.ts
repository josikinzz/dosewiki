export type DevTab =
  | "change-log"
  | "tag-editor"
  | "profile"
  | "index-layout"
  | "about"
  | "articles";

export type AppView =
  | { type: "substances" }
  | { type: "substance"; slug: string }
  | { type: "category"; categoryKey: string }
  | { type: "effects" }
  | { type: "effect"; effectSlug: string }
  | { type: "effect-category"; categorySlug: string }
  | { type: "mechanism"; mechanismSlug: string; qualifierSlug?: string }
  | { type: "classification"; classification: "chemical" | "psychoactive"; slug: string }
  | { type: "interactions"; primarySlug?: string; secondarySlug?: string }
  | { type: "about" }
  | { type: "search"; query: string }
  | { type: "dev"; tab: DevTab; slug?: string }
  | { type: "contributor"; profileKey: string }
  | { type: "reports" }
  | { type: "report"; slug: string; fromSubstanceSlug?: string };
