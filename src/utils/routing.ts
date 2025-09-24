import { AppView } from "../types/navigation";

export function viewToHash(view: AppView): string {
  switch (view.type) {
    case "substances":
      return "#/substances";
    case "effects":
      return "#/effects";
    case "interactions":
      return "#/interactions";
    case "about":
      return "#/about";
    case "category":
      return `#/category/${view.categoryKey}`;
    case "effect":
      return `#/effect/${view.effectSlug}`;
    case "search": {
      const query = view.query.trim();
      return query.length > 0 ? `#/search/${encodeURIComponent(query)}` : "#/search";
    }
    case "substance": {
      const slug = view.slug.trim();
      return slug.length > 0 ? `#/substance/${slug}` : "#/substance";
    }
    default:
      return "#/substances";
  }
}

export function parseHash(
  hashValue: string | undefined,
  defaultSlug: string,
  defaultView: AppView = { type: "substances" },
): AppView {
  const source = typeof hashValue === "string" ? hashValue : typeof window !== "undefined" ? window.location.hash : "";
  const raw = source.replace(/^#/, "");

  const resolveDefault = () => defaultView;

  if (!raw) {
    return resolveDefault();
  }

  const segments = raw.split("/").filter(Boolean);
  if (segments.length === 0) {
    return resolveDefault();
  }

  const [root, slug] = segments;

  switch (root) {
    case "substances":
      return { type: "substances" };
    case "effects":
      return { type: "effects" };
    case "interactions":
      return { type: "interactions" };
    case "about":
      return { type: "about" };
    case "category":
      if (slug) {
        return { type: "category", categoryKey: slug };
      }
      return { type: "substances" };
    case "effect":
      if (slug) {
        return { type: "effect", effectSlug: slug };
      }
      return { type: "effects" };
    case "search": {
      const querySegment = segments.slice(1).join("/");
      const query = querySegment ? decodeURIComponent(querySegment) : "";
      return { type: "search", query };
    }
    case "substance":
      if (slug) {
        return { type: "substance", slug };
      }
      return { type: "substance", slug: defaultSlug };
    default:
      return resolveDefault();
  }
}
