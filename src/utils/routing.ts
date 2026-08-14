import { AppView, DevTab } from "../types/navigation";
import { publicHref } from "./publicHref";

export function viewToPath(view: AppView): string {
  switch (view.type) {
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

    switch (root) {
      case "substances":
        return { type: "substances" };
      case "mantras":
        return { type: "mantras" };
      // The landing page, the audio page and the tutorials page all belong to one
      // navigation group, so every /replications/* path collapses to the section view.
      // Without this case the `default:` arm below would read them as substance slugs.
      case "replications":
        return { type: "replications" };
      case "reports":
        if (slug === "submit") {
          return { type: "report-submit" };
        }
        if (slug) {
          return { type: "report", slug };
        }
        return { type: "reports" };
      case "interactions":
        // Legacy route - redirect to substances
        return { type: "substances" };
      case "about":
      case "data":
        // /data redirects to /about (download section is now on about page)
        return { type: "about" };
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
          // Folded into the Writing tab's pinned About entry; the old deep link
          // keeps resolving.
          return { type: "dev", tab: "writing", slug: "about" };
        } else if (candidate === "writing") {
          tab = "writing";
        } else if (candidate === "blog") {
          tab = "blog";
        } else if (candidate === "copy-studio" || candidate === "copy") {
          tab = "copy-studio";
        } else if (candidate === "contributors" || candidate === "contributor") {
          tab = "contributors";
        } else if (candidate === "citation-review" || candidate === "citations") {
          tab = "citation-review";
        } else if (candidate === "trip-report-submissions" || candidate === "trip-reports") {
          tab = "trip-report-submissions";
        } else if (candidate === "article-feedback" || candidate === "feedback") {
          tab = "article-feedback";
        } else if (candidate === "site-feedback") {
          tab = "site-feedback";
        } else if (candidate === "molecule-editor" || candidate === "molecules") {
          tab = "molecule-editor";
        } else if (candidate === "replications" || candidate === "replication-studio") {
          tab = "replications";
        } else if (candidate === "review") {
          tab = "review";
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
