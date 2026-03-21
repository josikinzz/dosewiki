import Link from "next/link";
import { PropsWithChildren, useCallback } from "react";
import type { NavigateHandler } from "../types";
import { isPlainLeftClick, scrollIntoViewRespectingMotion } from "@/utils/navigation";

interface IntLinkProps {
  to?: string;
  onNavigate?: NavigateHandler;
}

function normalizeInternalPath(to?: string) {
  if (!to) {
    return "#";
  }

  if (to.startsWith("#")) {
    return to;
  }

  let path = to;

  if (path.startsWith("/substances/")) {
    path = path.replace("/substances/", "/");
  } else if (path.startsWith("/summaries/")) {
    path = path.replace("/summaries/", "/psychoactive/");
  } else if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  return path.replace(/\/$/, "");
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
  const href = normalizeInternalPath(to);

  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!to) return;

    // Handle anchor links (same-page navigation)
    if (href.startsWith("#")) {
      if (!isPlainLeftClick(e)) {
        return;
      }

      e.preventDefault();
      const anchorId = href.slice(1);
      const element = document.getElementById(anchorId);
      if (element) {
        scrollIntoViewRespectingMotion(element);
      }
      if (window.location.hash !== href) {
        window.location.hash = href;
      }
      return;
    }

    if (onNavigate && isPlainLeftClick(e)) {
      e.preventDefault();
      onNavigate(href);
    }
  }, [href, onNavigate, to]);

  return (
    <Link
      href={href}
      onClick={handleClick}
      className="cursor-pointer text-fuchsia-200 underline decoration-fuchsia-300/35 underline-offset-[0.18em] transition-colors hover:text-fuchsia-100 hover:decoration-fuchsia-200/55"
    >
      {children}
    </Link>
  );
}
