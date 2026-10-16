"use client";

import { useId, useState, type ReactNode } from "react";

import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon, type IconName } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { HOME_LIST_CAP, describeDay, type HomeTotal } from "./homeModel";

export const LINK_LIST_CLASS = "theme-dev-link-list -mx-2.5";

type LinkRowProps = {
  href: string;
  children: ReactNode;
  trailing?: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
  className?: string;
  stackOnPhone?: boolean;
  label?: string;
};

export function LinkRow({ href, children, trailing, meta, leading, className, stackOnPhone = false, label }: LinkRowProps) {
  return (
    <a
      href={href}
      aria-label={label}
      className={cn(
        "theme-dev-link-row group flex min-h-11 items-center gap-3 rounded-control px-2.5 py-2 text-sm transition-colors motion-reduce:transition-none",
        className,
      )}
    >
      {leading ? <span className="flex shrink-0 items-center">{leading}</span> : null}
      <span
        className={cn(
          "flex min-w-0 flex-1",
          stackOnPhone ? "flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3" : "items-center justify-between gap-3",
        )}
      >
        <span className="min-w-0">
          <span className="line-clamp-2 break-words">{children}</span>
          {meta ? (
            <span className="theme-text-faint mt-0.5 block text-xs">
              <span className="sr-only">, </span>
              {meta}
            </span>
          ) : null}
        </span>
        {trailing ? (
          <span className="flex shrink-0 items-center gap-2">
            <span className="sr-only">, </span>
            {trailing}
          </span>
        ) : null}
      </span>
      <Icon icon="lucide:chevron-right" size={16} className="theme-dev-link-row-chevron shrink-0" />
    </a>
  );
}

export function CountSkeleton({ className }: { className?: string }) {
  return (
    <>
      <span aria-hidden className={cn("theme-skeleton-pulse inline-block h-3.5 w-7 rounded-chip", className)} />
      <span className="sr-only">Loading</span>
    </>
  );
}

export function RowSkeletons({ rows = 2, label }: { rows?: number; label: string }) {
  return (
    <div aria-busy="true" className={LINK_LIST_CLASS}>
      <span className="sr-only">{`Loading ${label}`}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} aria-hidden className="flex min-h-11 items-center justify-between gap-3 px-2.5 py-2">
          <span className="theme-skeleton-pulse inline-block h-3.5 rounded-chip" style={{ width: `${56 - index * 14}%` }} />
          <span className="theme-skeleton-pulse inline-block h-3.5 w-14 rounded-chip" />
        </div>
      ))}
    </div>
  );
}

export function CountValue({ count, noun = "waiting" }: { count: HomeTotal; noun?: string }) {
  switch (count.kind) {
    case "loading":
      return <CountSkeleton />;
    case "unknown":
      return (
        <span className="theme-warning-text-strong inline-flex items-center gap-1 text-xs font-medium" title="This count did not load.">
          <Icon icon="lucide:circle-alert" size={14} />
          Unknown
          <span className="sr-only">, the count did not load</span>
        </span>
      );
    case "at-least":
      return (
        <span className="inline-flex items-baseline gap-1">
          <span className="theme-text-muted text-xs">At least</span>{" "}
          <span className="theme-text-primary font-semibold tabular-nums">{count.count}</span>
          <span className="sr-only">{` ${noun}`}</span>
        </span>
      );
    case "known":
      return (
        <span className="inline-flex items-baseline gap-1.5">
          <span
            data-zero={count.count === 0 ? "" : undefined}
            className="theme-dev-link-count theme-text-primary font-semibold tabular-nums"
          >
            {count.count}
          </span>
          {count.stale ? (
            <span className="theme-text-muted text-xs" title="The latest refresh failed; this is the last count that loaded.">
              last known
            </span>
          ) : (
            <span className="sr-only">{` ${noun}`}</span>
          )}
        </span>
      );
  }
}

export function RelativeDay({ iso, prefix }: { iso: string; prefix?: string }) {
  const day = describeDay(iso);
  if (!day) return null;
  return (
    <time dateTime={iso} title={day.full}>
      {prefix ? `${prefix} ${day.relative}` : day.relative}
    </time>
  );
}

export function CappedList<T>({
  items,
  getKey,
  renderItem,
  label,
  noun,
  cap = HOME_LIST_CAP,
}: {
  items: readonly T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  label: string;
  noun: string;
  cap?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const hidden = Math.max(0, items.length - cap);
  const visible = expanded || hidden === 0 ? items : items.slice(0, cap);
  return (
    <div className="space-y-2">
      <ul id={listId} aria-label={label} className={LINK_LIST_CLASS}>
        {visible.map((item) => (
          <li key={getKey(item)}>{renderItem(item)}</li>
        ))}
      </ul>
      {hidden > 0 ? (
        <ExpandButton
          variant="count"
          count={hidden}
          label={expanded ? "Show fewer" : "Show all"}
          isExpanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
          ariaControls={listId}
          ariaLabel={expanded ? `Show fewer ${noun}` : `Show all ${items.length} ${noun}`}
        />
      ) : null}
    </div>
  );
}

export function CountFailureLine({ failed, onRetry }: { failed: number; onRetry: () => void }) {
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
      <span className="theme-text-muted flex items-center gap-2">
        <Icon icon="lucide:circle-alert" size={16} className="theme-warning-text-strong shrink-0" />
        {failed === 1 ? "One count did not load." : `${failed} counts did not load.`}
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
        <Icon icon="lucide:refresh-cw" size={14} />
        Retry counts
      </Button>
    </div>
  );
}

export function SectionNote({ icon, tone = "muted", children }: { icon?: IconName; tone?: "muted" | "success"; children: ReactNode }) {
  return (
    <p className="theme-text-muted flex items-start gap-2 text-sm">
      {icon ? (
        <Icon
          icon={icon}
          size={16}
          className={cn("mt-0.5 shrink-0", tone === "success" ? "theme-success-text-strong" : "theme-text-faint")}
        />
      ) : null}
      <span>{children}</span>
    </p>
  );
}

export function OnwardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="theme-focus-ring theme-accent-underline inline-flex min-h-11 items-center gap-1.5 rounded-control text-sm font-medium text-dose-accent-strong underline-offset-4 hover:underline">
      {children}
      <Icon icon="lucide:arrow-right" size={14} />
    </a>
  );
}

export function HeadingCount({ children }: { children: ReactNode }) {
  return <span className="theme-text-muted text-sm tabular-nums">{children}</span>;
}
