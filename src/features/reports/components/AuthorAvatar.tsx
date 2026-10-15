"use client";

import { memo } from "react";
import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";

interface AuthorAvatarProps {
  authorName: string;
  avatarUrl?: string;
  size?: 32 | 40 | 64;
  className?: string;
}

const sizeClasses = {
  32: "h-8 w-8",
  40: "h-10 w-10",
  64: "h-16 w-16",
} as const;

export const AuthorAvatar = memo(function AuthorAvatar({
  authorName,
  avatarUrl,
  size = 40,
  className = "",
}: AuthorAvatarProps) {
  const resolvedAvatarUrl = avatarUrl;
  const sizeClass = sizeClasses[size];

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
          WebkitBackfaceVisibility: "hidden",
          backfaceVisibility: "hidden",
        }}
      />
    );
  }

  return (
    <div
      className={`theme-author-avatar-placeholder theme-public-card-subtle ${sizeClass} flex items-center justify-center rounded-full border ${className}`}
      aria-label={`${authorName}'s avatar`}
    >
      <Icon icon="lucide:user-round" className="text-dose-text-ghost h-1/2 w-1/2" />
    </div>
  );
});
