import { AppView, DevTab } from "../types/navigation";

export function viewToHash(view: AppView): string {
  switch (view.type) {
    case "substances":
      return "#/substances";
    case "effects":
      return "#/effects";
    case "interactions": {
      const primary = view.primarySlug?.trim();
      const secondary = view.secondarySlug?.trim();
      if (primary && secondary) {
        return `#/interactions/${primary}/${secondary}`;
      }
      if (primary) {
        return `#/interactions/${primary}`;
      }
      return "#/interactions";
    }
    case "about":
      return "#/about";
    case "generator":
      return "#/generator";
    case "category":
      return `#/category/${view.categoryKey}`;
    case "effect":
      return `#/effect/${view.effectSlug}`;
    case "mechanism":
      return view.qualifierSlug
        ? `#/mechanism/${view.mechanismSlug}/${view.qualifierSlug}`
        : `#/mechanism/${view.mechanismSlug}`;
    case "classification": {
      const base = view.classification === "chemical" ? "chemical" : "psychoactive";
      const slug = view.slug.trim();
      return slug.length > 0 ? `#/${base}/${slug}` : `#/${base}`;
    }
    case "search": {
      const query = view.query.trim();
      return query.length > 0 ? `#/search/${encodeURIComponent(query)}` : "#/search";
    }
    case "substance": {
      const slug = view.slug.trim();
      return slug.length > 0 ? `#/substance/${slug}` : "#/substance";
    }
    case "contributor": {
      const key = view.profileKey.trim();
      return key.length > 0 ? `#/contributors/${encodeURIComponent(key)}` : "#/contributors";
    }
    case "dev": {
      const tab = view.tab;
      const slug = view.slug?.trim();
      if (slug) {
        return `#/dev/${tab}/${slug}`;
      }
      return `#/dev/${tab}`;
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
  const resolveDefault = () => defaultView;
  try {
    const source = typeof hashValue === "string" ? hashValue : typeof window !== "undefined" ? window.location.hash : "";
    const raw = source.replace(/^#/, "");

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
      case "interactions": {
        const primarySlug = slug;
        const secondarySlug = segments[2];
        if (primarySlug && secondarySlug) {
          return { type: "interactions", primarySlug, secondarySlug };
        }
        if (primarySlug) {
          return { type: "interactions", primarySlug };
        }
        return { type: "interactions" };
      }
      case "about":
        return { type: "about" };
      case "generator":
        return { type: "generator" };
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
      case "mechanism":
        if (slug) {
          const qualifierSlug = segments[2];
          if (qualifierSlug) {
            return { type: "mechanism", mechanismSlug: slug, qualifierSlug };
          }
          return { type: "mechanism", mechanismSlug: slug };
        }
        return { type: "substances" };
      case "chemical":
        if (slug) {
          return { type: "classification", classification: "chemical", slug };
        }
        return resolveDefault();
      case "psychoactive":
        if (slug) {
          return { type: "classification", classification: "psychoactive", slug };
        }
        return resolveDefault();
      case "search": {
        const querySegment = segments.slice(1).join("/");
        let query = "";
        if (querySegment) {
          try {
            query = decodeURIComponent(querySegment);
          } catch (error) {
            console.warn("Failed to decode search query from hash", error);
            query = querySegment;
          }
        }
        return { type: "search", query };
      }
      case "substance":
        if (slug) {
          return { type: "substance", slug };
        }
        return { type: "substance", slug: defaultSlug };
      case "contributors": {
        if (slug) {
          try {
            return { type: "contributor", profileKey: decodeURIComponent(slug) };
          } catch (error) {
            console.warn("Failed to decode contributor key from hash", error);
            return { type: "contributor", profileKey: slug };
          }
        }
        return resolveDefault();
      }
      case "dev": {
        const candidate = slug ?? "edit";
        const slugSegment = segments[2];
        let tab: DevTab = "edit";
        if (candidate === "create") {
          tab = "create";
        } else if (candidate === "change-log" || candidate === "changelog") {
          tab = "change-log";
        } else if (candidate === "tag-editor" || candidate === "tag") {
          tab = "tag-editor";
        } else if (candidate === "profile" || candidate === "profiles") {
          tab = "profile";
        } else if (candidate === "index-layout" || candidate === "index") {
          tab = "index-layout";
        } else if (candidate === "about") {
          tab = "about";
        } else if (candidate === "layout-lab" || candidate === "layout") {
          tab = "layout-lab";
        } else {
          tab = "edit";
        }

        if (slugSegment) {
          return { type: "dev", tab, slug: slugSegment };
        }

        return { type: "dev", tab };
      }
      default:
        return resolveDefault();
    }
  } catch (error) {
    console.warn("Failed to parse hash", hashValue, error);
    return resolveDefault();
  }
}
