import devRouting from "./devRouting.editor";
import { AppView } from "../types/navigation";
import { publicHref } from "./publicHref";

export function viewToPath(view: AppView): string {
  switch (view.type) {
    case "glossary":
      return view.directory ? "/glossary/languages" : view.locale ? `/glossary/${encodeURIComponent(view.locale)}` : "/glossary";
    case "home":
      return "/";
    case "substances":
      return publicHref.substances();
    case "mantras":
      return publicHref.mantras();
    case "replications":
      return publicHref.replications();
    case "effects":
      return publicHref.effects();
    case "reports":
      return publicHref.reports();
    case "report-submit":
      return publicHref.reportSubmission();
    case "report": {
      const slug = view.slug.trim();
      return publicHref.report(slug, { fromSubstanceSlug: view.fromSubstanceSlug });
    }
    case "about":
      return "/about";
    case "category":
      return publicHref.category(view.categoryKey);
    case "effect":
      return publicHref.effect(view.effectSlug);
    case "effect-category":
      return publicHref.effectCategory(view.categorySlug);
    case "mechanism":
      return publicHref.mechanism(view.mechanismSlug, view.qualifierSlug);
    case "classification": {
      const base = view.classification === "chemical" ? "chemical" : "psychoactive";
      const slug = view.slug.trim();
      return slug.length > 0 ? `/${base}/${slug}` : `/${base}`;
    }
    case "search": {
      const query = view.query.trim();
      return publicHref.search(query);
    }
    case "substance": {
      const slug = view.slug.trim();
      return publicHref.substance(slug);
    }
    case "contributor": {
      const key = view.profileKey.trim();
      return publicHref.contributor(key);
    }
    case "dev":
      return devRouting.path(view);
    default:
      return "/substances";
  }
}

export function isHomePathname(pathname: string): boolean {
  return pathname === "/" || pathname === "/index";
}

export function parsePath(
  pathValue: string | undefined,
  defaultSlug: string | null,
  defaultView: AppView = { type: "substances" },
): AppView {
  const resolveDefault = () => defaultView;
  try {
    const source = typeof pathValue === "string" ? pathValue : typeof window !== "undefined" ? window.location.pathname : "";

    if (source.startsWith("#")) {
      return resolveDefault();
    }
    
    const [pathnamePart, searchPart = ""] = source.split("?");
    const searchParams = new URLSearchParams(searchPart);
    const raw = pathnamePart.replace(/^\//, "");

    if (!raw) {
      return resolveDefault();
    }

    const segments = raw.split("/").filter(Boolean);
    if (segments.length === 0) {
      return resolveDefault();
    }

    const [root, slug] = segments;

    if ((root === "index" && segments.length === 1) || root.startsWith("_")) {
      return resolveDefault();
    }

    switch (root) {
      case "glossary":
        return slug === "languages" ? { type: "glossary", directory: true } : { type: "glossary", ...(slug ? { locale: decodeURIComponent(slug) } : {}) };
      case "substances":
        return { type: "substances" };
      case "mantras":
        return { type: "mantras" };
      case "replications":
        return { type: "replications" };
      case "reports":
        if (slug === "group" && segments[2]) {
          return { type: "reports" };
        }
        if (slug === "submit") {
          return { type: "report-submit" };
        }
        if (slug) {
          return { type: "report", slug };
        }
        return { type: "reports" };
      case "interactions":
        return { type: "substances" };
      case "about":
      case "data":
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
      case "effects":
        if (slug === "group" && segments[2]) {
          return { type: "effects" };
        }
        if (slug === "category" && segments[2]) {
          return { type: "effect-category", categorySlug: segments[2] };
        }
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
        const queryParam = searchParams.get("q");
        if (queryParam) {
          query = queryParam;
        } else if (querySegment) {
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
      case "dev":
        return devRouting.parse(slug, segments[2], Object.fromEntries(searchParams), segments[3]) ?? resolveDefault();
      default:
        return { type: "substance", slug: root };
    }
  } catch (error) {
    console.warn("Failed to parse path", pathValue, error);
    return resolveDefault();
  }
}
