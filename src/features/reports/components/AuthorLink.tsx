import { SmartLink } from "@/components/common/SmartLink";
import { memo } from "react";
import { publicHref } from "@/utils/publicHref";

interface AuthorLinkProps {
  /** The author's name to display and link */
  authorName: string;
  /** Contributor profile key when a public profile exists */
  profileKey?: string;
  /** Additional CSS classes */
  className?: string;
  /** Render as plain text even if a profile exists */
  disableLink?: boolean;
}

/**
 * Renders an author name as a clickable link to their profile page.
 * If no profile exists for the author, renders as plain text.
 */
export const AuthorLink = memo(function AuthorLink({
  authorName,
  profileKey,
  className = "",
  disableLink = false,
}: AuthorLinkProps) {
  if (!profileKey || disableLink) {
    // No profile found - render as plain text
    return <span className={className}>{authorName}</span>;
  }

  const profileUrl = publicHref.contributor(profileKey);

  return (
    <SmartLink
      href={profileUrl}
      className={`theme-accent-heading transition-colors hover:opacity-90 hover:underline ${className}`}
    >
      {authorName}
    </SmartLink>
  );
});
