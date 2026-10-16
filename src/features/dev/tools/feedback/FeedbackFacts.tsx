import type { ReactNode } from "react";

import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";

export type FeedbackFact = {
  label: string;
  value: ReactNode;
  href?: string;
  hint?: string;
  tone?: "warning";
  wide?: boolean;
};

export function FeedbackFacts({ facts }: { facts: readonly (FeedbackFact | null | false | undefined)[] }) {
  const shown = facts.filter((fact): fact is FeedbackFact => Boolean(fact && fact.value));
  if (shown.length === 0) return null;
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2 xl:grid-cols-3">
      {shown.map((fact) => (
        <div key={fact.label} className={cn("min-w-0", fact.wide && "sm:col-span-2 xl:col-span-3")}>
          <dt className="type-meta-label theme-text-muted">{fact.label}</dt>
          <dd className={cn("mt-1", fact.tone === "warning" ? "theme-warning-text-strong" : "theme-text-primary")}>
            {fact.href ? <FactLink href={fact.href} hint={fact.hint}>{fact.value}</FactLink> : fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function FactLink({ href, hint, children }: { href: string; hint?: string; children: ReactNode }) {
  const mail = href.startsWith("mailto:");
  return (
    <a
      href={href}
      {...(mail ? {} : { target: "_blank", rel: "noopener noreferrer" })}
      className="text-dose-accent-strong theme-accent-underline underline-offset-4 [overflow-wrap:anywhere] hover:underline"
    >
      {mail ? <Icon icon="lucide:mail" size={13} className="mr-1.5 inline-block align-[-0.125em]" /> : null}
      {children}
      {hint ? <span className="sr-only">{hint}</span> : null}
      {mail ? null : <Icon icon="lucide:arrow-up-right" size={13} className="ml-1 inline-block align-[-0.125em]" />}
    </a>
  );
}

export function readerScale(label: string): string {
  const [level, meaning] = label.split(/:\s*/, 2);
  return meaning ? `${level}, ${meaning}` : label;
}

export function formatReceived(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function readableAddress(value: string): string {
  try {
    const url = new URL(value, "https://dose.wiki");
    if (url.hostname === "dose.wiki" || url.hostname === "www.dose.wiki") return `${url.pathname}${url.search}`;
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value;
  }
}
