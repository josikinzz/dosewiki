import { SmartLink } from "@/components/common/SmartLink";
import { memo } from "react";
import { publicHref } from "@/utils/publicHref";

interface AuthorLinkProps {
  authorName: string;
  profileKey?: string;
  className?: string;
  disableLink?: boolean;
}

export const AuthorLink = memo(function AuthorLink({
  authorName,
  profileKey,
  className = "",
  disableLink = false,
}: AuthorLinkProps) {
  if (!profileKey || disableLink) {
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
