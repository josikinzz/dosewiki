"use client";

import { Button } from "@/components/ui/button";

import { useDevRailBadgeStatus, type DevRailBadge } from "./useDevRailBadges";

export function DevRailBadgeFreshness({
  badge,
  noun,
  className,
}: {
  badge: DevRailBadge;
  noun: string;
  className?: string;
}) {
  const { count, updatedAt, failed, retry } = useDevRailBadgeStatus(badge);
  if (!failed) {
    return null;
  }

  return (
    <p role="status" className={`theme-text-muted flex flex-wrap items-center gap-x-2 text-xs ${className ?? ""}`}>
      <span>
        {count === null || updatedAt === null ? (
          `The count of waiting ${noun} could not load.`
        ) : (
          <>
            The count of waiting {noun} could not refresh. {count} {noun} is the last known count, as of{" "}
            <time dateTime={new Date(updatedAt).toISOString()}>
              {new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </time>
            .
          </>
        )}
      </span>
      <Button type="button" variant="link" size="auto" className="text-xs" onClick={retry}>
        Retry
      </Button>
    </p>
  );
}
