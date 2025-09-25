export type AppView =
  | { type: "substances" }
  | { type: "substance"; slug: string }
  | { type: "category"; categoryKey: string }
  | { type: "effects" }
  | { type: "effect"; effectSlug: string }
  | { type: "mechanism"; mechanismSlug: string }
  | { type: "interactions" }
  | { type: "about" }
  | { type: "search"; query: string };
