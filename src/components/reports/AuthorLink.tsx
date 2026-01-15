import { memo } from "react";
import { findProfileByAuthorName } from "../../data/userProfiles";

interface AuthorLinkProps {
  /** The author's name to display and link */
  authorName: string;
  /** Additional CSS classes */
  className?: string;
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
  onNavigate,
}: AuthorLinkProps) {
  const profile = findProfileByAuthorName(authorName);

  if (!profile) {
    // No profile found - render as plain text
    return <span className={className}>{authorName}</span>;
  }

  const profileUrl = `/contributors/${profile.key.toLowerCase()}`;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onNavigate) {
      onNavigate(profile.key);
    } else {
      // Fallback to standard navigation
      window.history.pushState({}, "", profileUrl);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  return (
    <a
      href={profileUrl}
      onClick={handleClick}
      className={`text-fuchsia-200 transition-colors hover:text-fuchsia-100 hover:underline ${className}`}
    >
      {authorName}
    </a>
  );
});
