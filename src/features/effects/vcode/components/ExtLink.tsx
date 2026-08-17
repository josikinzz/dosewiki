import { PropsWithChildren } from "react";
import { Icon } from "@/components/common/Icon";

interface ExtLinkProps {
  to?: string;
}

export function normalizeExternalHref(to: string): string {
  const trimmed = to.trim();
  return /^\/https?:\/\//i.test(trimmed) ? trimmed.slice(1) : trimmed;
}

/**
 * External link to other websites.
 * 
 * Opens in a new tab with security attributes.
 */
export function ExtLink({ 
  to, 
  children,
}: PropsWithChildren<ExtLinkProps>) {
  if (!to) {
    return <span>{children}</span>;
  }

  const href = normalizeExternalHref(to);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="theme-accent-emphasis inline-flex cursor-pointer items-center gap-1 underline decoration-fuchsia-300/35 underline-offset-[0.18em] transition-colors hover:text-dose-accent-soft hover:decoration-fuchsia-200/55"
    >
      {children}
      <Icon icon="lucide:external-link" size={12} className="opacity-60" />
    </a>
  );
}
