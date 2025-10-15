export type AppView =
  | { type: "substances" }
  | { type: "substance"; slug: string }
  | { type: "category"; categoryKey: string }
  | { type: "effects" }
  | { type: "effect"; effectSlug: string }
  | { type: "mechanism"; mechanismSlug: string; qualifierSlug?: string }
  | { type: "interactions"; primarySlug?: string; secondarySlug?: string }
  | { type: "about" }
  | { type: "search"; query: string }
  | { type: "dev"; tab: "edit" | "create" | "change-log" | "tag-editor" | "profile" }
  | { type: "contributor"; profileKey: string };
