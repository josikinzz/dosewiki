"use client";
import { forwardRef, type ReactNode } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOUCH_HALO_Y } from "@/components/ui/touchTargets";
import { Notice, type NoticeMessage } from "@/features/dev/components";
import { cn } from "@/lib/utils";
import { formatSaveMoment, formatSaveTime } from "@/features/dev/pages/changeLogModel";
import { describeDay } from "@/features/dev/tools/home/homeModel";

type SearchFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  description?: string;
  className?: string;
};

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField({ label, value, onChange, placeholder, description, className }, ref) {
  return (
    <div className={cn("relative", className)}>
      <Icon icon="lucide:search" size={15} className="theme-text-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
      <Input
        ref={ref}
        type="search"
        inputSize="sm"
        aria-label={label}
        aria-description={description}
        aria-keyshortcuts="/"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            onChange("");
          }
        }}
        placeholder={placeholder}
        className="pl-9 pr-9"
      />
      {value ? null : (
        <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 [@media(pointer:coarse)]:hidden">
          <kbd className="theme-dev-kbd">/</kbd>
        </span>
      )}
    </div>
  );
});

export type Choice<T extends string> = { value: T; label: string; short?: string; count?: number | null };

export function ChoiceGrid<T extends string>({ label, choices, value, onChange, columns = 2, disabled = false }: {
  label: string;
  choices: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  columns?: 2 | 3 | 4;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "grid gap-1 rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-1",
        columns === 2 ? "grid-cols-2" : columns === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4",
      )}
    >
      {choices.map((choice) => {
        const selected = choice.value === value;
        return (
          <Button
            key={choice.value}
            type="button"
            variant={selected ? "pillActive" : "ghostPill"}
            size="pill"
            aria-pressed={selected}
            aria-label={choice.short ? `${choice.label}${typeof choice.count === "number" ? `, ${choice.count}` : choice.count === null ? ", not loaded" : ""}` : undefined}
            disabled={disabled}
            onClick={() => onChange(choice.value)}
            className={cn("h-auto min-h-9 w-full flex-col gap-0 rounded-control px-1.5 py-1 leading-tight [@media(pointer:coarse)]:min-h-11", TOUCH_HALO_Y)}
          >
            {choice.short ? (
              <span aria-hidden className="text-xs font-medium"><span className="sm:hidden">{choice.short}</span><span className="max-sm:hidden">{choice.label}</span></span>
            ) : <span className="text-xs font-medium">{choice.label}</span>}
            {choice.count === undefined ? null : choice.count === null ? (
              <span className="sr-only">, not loaded</span>
            ) : (
              <span className={cn("text-xs tabular-nums", selected ? "opacity-80" : "theme-text-faint")}>
                <span className="sr-only">,</span> {choice.count}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}

export function KeyCap({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="[@media(pointer:coarse)]:hidden">
      <kbd className="theme-dev-kbd !text-current opacity-70">{children}</kbd>
    </span>
  );
}

export function BackToList({ onBack, children }: { onBack: () => void; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 lg:hidden">
      <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
        <Icon icon="lucide:arrow-left" size={14} />
        Back to list
      </Button>
      {children}
    </div>
  );
}

export function PaneDock({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <footer
      aria-label={label}
      className={cn("theme-portal-rule sticky bottom-0 z-10 space-y-2.5 rounded-b-[inherit] border-t bg-[var(--editor-panel-bg)]/95 px-4 py-3 backdrop-blur sm:px-5", className)}
    >
      {children}
    </footer>
  );
}

export function ResultNotice({ notice, onDismiss }: { notice: NoticeMessage | null; onDismiss: () => void }) {
  return notice ? <Notice {...notice} placement="inline" dismiss={onDismiss} /> : null;
}

export function RowSkeletons({ rows = 5, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-busy="true" className="space-y-2">
      <span className="sr-only">Loading {label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} aria-hidden className="space-y-2 rounded-control px-2.5 py-3">
          <div className="h-3.5 w-2/5 rounded-full theme-progress-track motion-safe:animate-pulse" />
          <div className="h-3 w-3/4 rounded-full theme-progress-track opacity-70 motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function When({ at, withTime = false }: { at: number | string; withTime?: boolean }) {
  const iso = typeof at === "number" ? new Date(at).toISOString() : at;
  const day = describeDay(iso);
  if (!day) return <span>{String(at)}</span>;
  const time = withTime ? formatSaveTime(iso) : "";
  return <time dateTime={iso} title={formatSaveMoment(iso)}>{day.relative}{time ? `, ${time}` : ""}</time>;
}
