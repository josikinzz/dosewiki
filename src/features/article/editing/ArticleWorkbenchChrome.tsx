"use client";

/**
 * The Substances tool's chrome around the in-page article editor
 * (`ArticleContextBridge` with `chrome="dock"`): one strip above the article
 * that says what the preview shows (a private draft, a waiting proposal, a
 * reader-feedback correction), and a save dock under it that holds the result
 * of the last write, what is running, the one reason the actions are paused,
 * the actions themselves and where a save lands. The public page and Review
 * keep the full-width editing bar instead.
 */
import type { ReactNode } from "react";
import Link from "next/link";

import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";

/** One line of the strip over the article: a glyph, a sentence, and its actions. */
export function SessionLine({ icon, tone = "neutral", children, actions }: {
  icon: string;
  tone?: "neutral" | "accent" | "warning";
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li className="flex min-w-0 flex-wrap items-start gap-x-2.5 gap-y-1 py-2 text-sm">
      <Icon
        icon={icon}
        size={15}
        aria-hidden
        className={cn(
          "mt-0.5 shrink-0",
          tone === "accent" ? "theme-icon-accent" : tone === "warning" ? "theme-warning-text" : "theme-text-faint",
        )}
      />
      <span className="theme-text-secondary min-w-0 flex-1 basis-56">{children}</span>
      {actions ? <span className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">{actions}</span> : null}
    </li>
  );
}

/** The lines over the article. Renders nothing when there is nothing to say. */
export function SessionStrip({ children }: { children: ReactNode }) {
  const lines = (Array.isArray(children) ? children : [children]).filter(Boolean);
  if (lines.length === 0) return null;
  return (
    <ul aria-label="About this draft" className="theme-portal-rule divide-y divide-[color:var(--theme-border-subtle)] border-b px-4 sm:px-5">
      {lines}
    </ul>
  );
}

/** An accent text link in a session line or a notice. */
export function SessionLink({ href, children, external = false }: { href: string; children: ReactNode; external?: boolean }) {
  const className = "theme-accent-underline inline-flex items-center gap-1 font-medium text-dose-accent-strong underline-offset-4 hover:underline";
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
        <span className="sr-only"> (opens in a new tab)</span>
        <Icon icon="lucide:arrow-up-right" size={13} aria-hidden />
      </a>
    );
  }
  return <Link href={href} className={className}>{children}</Link>;
}

/** The unsaved dot and one phrase: where the draft stands right now. */
export function DraftStatePhrase({ text, unsaved }: { text: string; unsaved: boolean }) {
  return (
    <p aria-live="polite" className={cn("flex min-w-0 items-center gap-2 text-xs", unsaved ? "theme-text-secondary" : "theme-text-faint")}>
      {unsaved ? <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 shrink-0 rounded-full" /> : null}
      {text}
    </p>
  );
}

/** A key cap on a button, shown on fine pointers only. */
export function ButtonKeyCap({ label }: { label: string }) {
  return (
    <span aria-hidden className="[@media(pointer:coarse)]:hidden">
      <kbd className="theme-dev-kbd !text-current opacity-70">{label}</kbd>
    </span>
  );
}

/**
 * The save dock: `sticky bottom-0` inside the tool's pane, the decision dock
 * recipe. Rows in order: the result, the running write, the blocker, then the
 * actions with the state phrase and the save line.
 */
export function SaveDock({ result, pending, blocker, actions, state, saveLine }: {
  result?: ReactNode;
  pending?: string | null;
  blocker?: ReactNode;
  actions: ReactNode;
  state: ReactNode;
  saveLine?: ReactNode;
}) {
  return (
    <footer
      aria-label="Save"
      className="theme-portal-rule sticky bottom-0 z-30 space-y-2.5 rounded-b-[inherit] border-t bg-[var(--editor-panel-bg)]/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-5"
    >
      {result}
      {pending ? (
        <p aria-live="polite" className="theme-text-muted flex items-center gap-2 text-sm">
          <Icon icon="lucide:loader-circle" size={14} className="animate-spin motion-reduce:animate-none" aria-hidden />
          {pending}
        </p>
      ) : null}
      {blocker}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {actions}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        {state}
        {saveLine ? <span className="min-w-0 max-w-full [&_*]:max-w-full">{saveLine}</span> : null}
      </div>
    </footer>
  );
}

/** The blocker line: the one reason the actions are paused, with its way forward. */
export function DockBlocker({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <p role="status" className="theme-text-secondary flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
      <Icon icon="lucide:circle-pause" size={14} className="theme-warning-text shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 basis-56">{children}</span>
      {action}
    </p>
  );
}

