import Link from "next/link";
import { memo } from "react";
import { findProfileByAuthorName } from "@/data/userProfiles";
import { isPlainLeftClick } from "@/utils/navigation";

interface AuthorLinkProps {
  /** The author's name to display and link */
  authorName: string;
  /** Additional CSS classes */
  className?: string;
  /** Render as plain text even if a profile exists */
  disableLink?: boolean;
  /** Called when navigating to the profile (for SPA navigation) */
  onNavigate?: (profileKey: string) => void;
}

/**
 * Renders an author name as a clickable link to their profile page.
 * If no profile exists for the author, renders as plain text.
 */
export const AuthorLink = memo(function AuthorLink({
  authorName,
  className = "",
  disableLink = false,
  onNavigate,
}: AuthorLinkProps) {
  const profile = findProfileByAuthorName(authorName);

  if (!profile || disableLink) {
    // No profile found - render as plain text
    return <span className={className}>{authorName}</span>;
  }

  const profileUrl = `/contributors/${profile.key.toLowerCase()}`;

  const handleClick = (e: React.MouseEvent) => {
    if (onNavigate && isPlainLeftClick(e as React.MouseEvent<HTMLAnchorElement>)) {
      e.preventDefault();
      e.stopPropagation();
      onNavigate(profile.key);
    }
  };

  return (
    <Link
      href={profileUrl}
      onClick={handleClick}
      className={`text-fuchsia-200 transition-colors hover:text-fuchsia-100 hover:underline ${className}`}
    >
      {authorName}
    </Link>
  );
});
