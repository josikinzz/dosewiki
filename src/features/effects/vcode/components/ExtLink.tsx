import { PropsWithChildren } from "react";
import { Icon } from "@/components/common/Icon";

interface ExtLinkProps {
  to?: string;
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

  return (
    <a
      href={to}
      target="_blank"
      rel="noopener noreferrer"
      className="theme-evidence-link inline-flex cursor-pointer items-center gap-1 rounded-sm underline underline-offset-[0.18em] transition-colors"
    >
      {children}
      <Icon icon="lucide:external-link" size={12} className="opacity-60" />
    </a>
  );
}
