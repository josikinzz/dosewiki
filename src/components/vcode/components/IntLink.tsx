import { PropsWithChildren, useCallback } from "react";
import type { NavigateHandler } from "../types";

interface IntLinkProps {
  to?: string;
  onNavigate?: NavigateHandler;
}

/**
 * Internal link to other DoseWiki pages.
 * 
 * Handles navigation to effects, substances, and other internal routes.
 * Also handles anchor links for same-page navigation.
 */
export function IntLink({ 
  to, 
  onNavigate,
  children,
}: PropsWithChildren<IntLinkProps>) {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    
    if (!to) return;

    // Handle anchor links (same-page navigation)
    if (to.startsWith("#")) {
      const anchorId = to.slice(1);
      const element = document.getElementById(anchorId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
      // Update URL hash without triggering navigation
      window.history.pushState({}, "", to);
      return;
    }

    // Normalize the path
    let path = to;
    
    // Handle EffectIndex-style paths
    if (path.startsWith("/effects/")) {
      // /effects/{slug} -> /effects/{slug} (keep as-is for new effect articles)
      path = path;
    } else if (path.startsWith("/substances/")) {
      // /substances/{slug} -> /{slug}
      path = path.replace("/substances/", "/");
    } else if (path.startsWith("/summaries/")) {
      // /summaries/{class} -> /psychoactive/{class}
      path = path.replace("/summaries/", "/psychoactive/");
    } else if (!path.startsWith("/")) {
      // Handle relative paths - treat as substance slugs
      // This handles cases like "lsd" -> "/lsd"
      path = `/${path}`;
    }
    
    // Remove trailing slashes
    path = path.replace(/\/$/, "");

    if (onNavigate) {
      onNavigate(path);
    } else {
      // Fallback to browser navigation
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }, [to, onNavigate]);

  return (
    <a
      href={to || "#"}
      onClick={handleClick}
      className="text-fuchsia-200 hover:text-fuchsia-100 cursor-pointer transition-colors"
    >
      {children}
    </a>
  );
}
