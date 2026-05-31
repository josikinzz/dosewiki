import Link from "next/link";
import { PropsWithChildren } from "react";

interface IntLinkProps {
  to?: string;
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
  children,
}: PropsWithChildren<IntLinkProps>) {
  const href = normalizeInternalPath(to);

  return (
    <Link
      href={href}
      className="cursor-pointer text-fuchsia-200 underline decoration-fuchsia-300/35 underline-offset-[0.18em] transition-colors hover:text-fuchsia-100 hover:decoration-fuchsia-200/55"
    >
      {children}
    </Link>
  );
}
