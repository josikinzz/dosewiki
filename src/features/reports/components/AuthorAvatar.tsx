"use client";

import { memo } from "react";
import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";

interface AuthorAvatarProps {
  /** The author's name to match against known profiles */
  authorName: string;
  /** Optional custom avatar URL (overrides profile matching) */
  avatarUrl?: string;
  /** Size of the avatar in pixels */
  size?: 32 | 40 | 64;
  /** Additional CSS classes */
  className?: string;
}

const sizeClasses = {
  32: "h-8 w-8",
  40: "h-10 w-10",
  64: "h-16 w-16",
} as const;

/**
 * Avatar component for trip report authors.
 * 
 * Matching priority:
 * 1. If avatarUrl prop is provided, use it
 * 2. If authorName matches a profile with avatar, use profile avatar
 * 3. Otherwise, render default placeholder with UserRound icon
 */
export const AuthorAvatar = memo(function AuthorAvatar({
  authorName,
  avatarUrl,
  size = 40,
  className = "",
}: AuthorAvatarProps) {
  const resolvedAvatarUrl = avatarUrl;
  const sizeClass = sizeClasses[size];

  // Render actual avatar image
  if (resolvedAvatarUrl) {
    return (
      <AppImage
        src={resolvedAvatarUrl}
        alt={`${authorName}'s avatar`}
        width={size}
        height={size}
        className={`${sizeClass} rounded-full object-cover ring-1 ring-[var(--theme-ring-soft)] ${className}`}
        style={{ 
          imageRendering: "auto",
          // Force high-quality scaling for crisp avatars
          WebkitBackfaceVisibility: "hidden",
          backfaceVisibility: "hidden",
        }}
      />
    );
  }

  // Render default placeholder
  return (
    <div
      className={`theme-author-avatar-placeholder theme-public-card-subtle ${sizeClass} flex items-center justify-center rounded-full border ${className}`}
      aria-label={`${authorName}'s avatar`}
    >
      <Icon icon="lucide:user-round" className="text-dose-text-ghost h-1/2 w-1/2" />
    </div>
  );
});
