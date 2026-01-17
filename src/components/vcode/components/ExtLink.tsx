import { PropsWithChildren } from "react";
import { Icon } from "../../common/Icon";

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
      className="text-fuchsia-200 hover:text-fuchsia-100 cursor-pointer transition-colors inline-flex items-center gap-1"
    >
      {children}
      <Icon icon="lucide:external-link" size={12} className="opacity-60" />
    </a>
  );
}
