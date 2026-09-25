"use client";

import { Button } from "@/components/ui/button";

import { useDevRailBadgeStatus, type DevRailBadge } from "./useDevRailBadges";

/**
 * A quiet line inside the opened queue when its rail count is stale or
 * unknown. The rail badge keeps the last known count and never turns into an
 * alert; this line is where the editor learns that number may be old, and
 * where they ask for it again. A healthy count renders nothing.
 */
export function DevRailBadgeFreshness({
  badge,
  noun,
  className,
}: {
  badge: DevRailBadge;
  /** Plural name of what the badge counts, e.g. "reports". */
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
