import { AppView, DevTab } from "../types/navigation";

export function viewToPath(view: AppView): string {
  switch (view.type) {
    case "substances":
      return "/substances";
    case "effects":
      return "/effects";
    case "reports":
      return "/reports";
    case "report": {
      const slug = view.slug.trim();
      return slug.length > 0 ? `/reports/${slug}` : "/reports";
    }
    case "interactions": {
      const primary = view.primarySlug?.trim();
      const secondary = view.secondarySlug?.trim();
      if (primary && secondary) {
        return `/interactions/${primary}/${secondary}`;
      }
      if (primary) {
        return `/interactions/${primary}`;
      }
      return "/interactions";
    }
    case "about":
      return "/about";
    case "data":
      return "/data";
    case "category":
      return `/category/${view.categoryKey}`;
    case "effect":
      return `/effects/${view.effectSlug}`;
    case "effect-category":
      return `/effects/category/${view.categorySlug}`;
    case "mechanism":
      return view.qualifierSlug
        ? `/mechanism/${view.mechanismSlug}/${view.qualifierSlug}`
        : `/mechanism/${view.mechanismSlug}`;
    case "classification": {
      const base = view.classification === "chemical" ? "chemical" : "psychoactive";
      const slug = view.slug.trim();
      return slug.length > 0 ? `/${base}/${slug}` : `/${base}`;
    }
    case "search": {
      const query = view.query.trim();
      return query.length > 0 ? `/search/${encodeURIComponent(query)}` : "/search";
    }
    case "substance": {
      const slug = view.slug.trim();
      return slug.length > 0 ? `/${slug}` : "/substances";
    }
    case "contributor": {
      const key = view.profileKey.trim();
      return key.length > 0 ? `/contributors/${encodeURIComponent(key)}` : "/contributors";
    }
    case "dev": {
      const tab = view.tab;
      const slug = view.slug?.trim();
      if (slug) {
        return `/dev/${tab}/${slug}`;
      }
      return `/dev/${tab}`;
    }
    default:
      return "/substances";
  }
}

export function parsePath(
  pathValue: string | undefined,
  defaultSlug: string | null,
  defaultView: AppView = { type: "substances" },
): AppView {
  const resolveDefault = () => defaultView;
  try {
    const source = typeof pathValue === "string" ? pathValue : typeof window !== "undefined" ? window.location.pathname : "";
    
    // Handle hash-only paths (same-page anchor navigation)
    // Return the default view to indicate no route change needed
    if (source.startsWith("#")) {
      return resolveDefault();
    }
    
    const raw = source.replace(/^\//, "");

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
      case "reports":
        if (slug) {
          return { type: "report", slug };
        }
        return { type: "reports" };
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
      case "data":
        return { type: "data" };
      case "category":
        if (slug) {
          return { type: "category", categoryKey: slug };
        }
        return { type: "substances" };
      case "effect":
        // Legacy /effect/{slug} route - redirect to /effects/{slug}
        if (slug) {
          return { type: "effect", effectSlug: slug };
        }
        return { type: "effects" };
      case "effects":
        if (slug === "category" && segments[2]) {
          // /effects/category/{categorySlug}
          return { type: "effect-category", categorySlug: segments[2] };
        }
        if (slug) {
          // /effects/{effectSlug}
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
            console.warn("Failed to decode search query from path", error);
            query = querySegment;
          }
        }
        return { type: "search", query };
      }
      case "substance":
        if (slug) {
          return { type: "substance", slug };
        }
        if (defaultSlug) {
          return { type: "substance", slug: defaultSlug };
        }
        return resolveDefault();
      case "contributors": {
        if (slug) {
          try {
            return { type: "contributor", profileKey: decodeURIComponent(slug) };
          } catch (error) {
            console.warn("Failed to decode contributor key from path", error);
            return { type: "contributor", profileKey: slug };
          }
        }
        return resolveDefault();
      }
      case "dev": {
        const candidate = slug ?? "articles";
        const slugSegment = segments[2];
        let tab: DevTab = "articles";
        if (candidate === "change-log" || candidate === "changelog") {
          tab = "change-log";
        } else if (candidate === "tag-editor" || candidate === "tag") {
          tab = "tag-editor";
        } else if (candidate === "profile" || candidate === "profiles") {
          tab = "profile";
        } else if (candidate === "index-layout" || candidate === "index") {
          tab = "index-layout";
        } else if (candidate === "about") {
          tab = "about";
        } else if (candidate === "articles" || candidate === "generator" || candidate === "gen") {
          tab = "articles";
        } else {
          tab = "articles";
        }

        if (slugSegment) {
          return { type: "dev", tab, slug: slugSegment };
        }

        return { type: "dev", tab };
      }
      default:
        // Treat any unrecognized path as a substance slug (e.g., /lsd -> substance lsd)
        return { type: "substance", slug: root };
    }
  } catch (error) {
    console.warn("Failed to parse path", pathValue, error);
    return resolveDefault();
  }
}
