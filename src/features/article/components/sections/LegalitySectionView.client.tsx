"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { ArticleSection } from "@/components/common/ArticleSection";
import { ExpandButton } from "@/components/common/ExpandButton";
import { SUBSTANCE_SECTION_ICONS } from "@/schema/substance/sectionManifest";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

export type LegalityTone = "red" | "yellow" | "blue" | "green" | "gray";
export type LegalityRowVariant = "country" | "state" | "city";

const ROW_VARIANT = {
  country: {
    header:
      "flex min-w-0 items-center gap-2 rounded-lg py-2.5 transition-colors hover:bg-dose-surface-muted/40",
    name: "shrink-0 whitespace-nowrap text-sm font-medium theme-text-primary",
    status: "text-[10px] tracking-[0.09em]",
    toggle: "px-2 py-1",
    details: "min-w-0 pb-3 pl-7",
  },
  state: {
    header:
      "-mx-2 flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-dose-surface-muted/40",
    name: "shrink-0 whitespace-nowrap text-xs font-medium theme-text-primary",
    status: "text-[9px] tracking-[0.08em]",
    toggle: "px-1.5 py-0.5",
    details: "mt-2 min-w-0",
  },
  city: {
    header:
      "-mx-2 flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-dose-surface-muted/40",
    name: "shrink-0 whitespace-nowrap text-xs font-medium theme-text-primary",
    status: "text-[9px] tracking-[0.08em]",
    toggle: "px-1.5 py-0.5",
    details: "mt-2 min-w-0",
  },
} as const;

export function LegalityRowView({
  name,
  variant,
  flag,
  statusLabel,
  statusTitle,
  statusTone,
  details,
}: {
  name: string;
  variant: LegalityRowVariant;
  flag?: ReactNode;
  statusLabel?: ReactNode;
  statusTitle?: string;
  statusTone: LegalityTone;
  details: ReactNode;
}) {
  const t = useT();
  const detailsId = useId();
  const detailsRef = useRef<HTMLDivElement | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const styles = ROW_VARIANT[variant];
  useEffect(() => {
    const el = detailsRef.current;
    if (!el) return;
    const expand = () => setIsExpanded(true);
    el.addEventListener("beforematch", expand);
    return () => el.removeEventListener("beforematch", expand);
  }, []);
  useEffect(() => {
    const el = detailsRef.current;
    if (!el) return;
    if (isExpanded) el.removeAttribute("hidden");
    else el.setAttribute("hidden", "until-found");
  }, [isExpanded]);
  return (
    <div
      className={cn(
        "min-w-0",
        variant === "city" && "pl-4",
        variant === "country" &&
          "-mx-2 rounded-xl px-2 transition-colors motion-reduce:transition-none",
        variant === "country" && isExpanded && "my-1 bg-dose-surface-muted/55",
      )}
    >
      <div
        className={cn(
          styles.header,
          "cursor-pointer select-none motion-reduce:transition-none",
          variant !== "country" && isExpanded && "bg-dose-surface-muted/40",
        )}
        onClick={(event) => {
          if (!(event.target as HTMLElement).closest("a, button"))
            setIsExpanded((value) => !value);
        }}
      >
        {flag}
        <span className={styles.name}>{t(name)}</span>
        {statusLabel ? (
          <span
            className={cn(
              "theme-status-text inline-flex max-w-[60%] shrink-0 items-center gap-1.5 font-semibold uppercase",
              styles.status,
            )}
            data-badge-tone={statusTone}
            title={statusTitle ? t(statusTitle) : undefined}
          >
            <span
              aria-hidden
              className="h-1 w-1 shrink-0 rounded-full bg-current"
            />
            <span className="truncate">{statusLabel}</span>
          </span>
        ) : null}
        <ExpandButton
          variant="faint"
          isExpanded={isExpanded}
          onToggle={() => setIsExpanded((value) => !value)}
          ariaControls={detailsId}
          ariaLabel={
            isExpanded
              ? t("Hide details for {{name}}", { name: t(name) })
              : t("Show details for {{name}}", { name: t(name) })
          }
          className={cn("shrink-0", styles.toggle)}
        />
      </div>
      <div id={detailsId} ref={detailsRef} hidden className={styles.details}>
        {details}
      </div>
    </div>
  );
}

export function LegalitySectionView({
  internationalContent,
  countryGroups,
}: {
  internationalContent?: ReactNode;
  countryGroups?: ReactNode;
}) {
  const t = useT();
  return (
    <ArticleSection
      id="legality"
      icon={SUBSTANCE_SECTION_ICONS.legality}
      heading={t("Legality")}
    >
      {internationalContent ? (
        <ArticleSection.Group
          icon="lucide:globe"
          heading={t("International")}
          className="mb-4"
          headingClassName="font-semibold normal-case tracking-normal"
        >
          {internationalContent}
        </ArticleSection.Group>
      ) : null}
      {countryGroups ? (
        <ArticleSection.Group
          icon="lucide:map-pin"
          heading={t("By Country")}
          className="mt-4"
          headingClassName="font-semibold normal-case tracking-normal"
        >
          {countryGroups}
        </ArticleSection.Group>
      ) : null}
    </ArticleSection>
  );
}

export function ToneGroupHeading({
  label,
  count,
  title,
}: {
  label: string;
  count: number;
  title?: string;
}) {
  const t = useT();
  return (
    <div
      className="mb-1 flex items-center gap-2"
      title={title ? t(title) : undefined}
    >
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] theme-text-muted">
        {t(label)}
      </span>
      <span className="font-mono text-[10px] tabular-nums theme-text-faint">
        {count}
      </span>
      <div aria-hidden className="theme-horizontal-divider flex-1" />
    </div>
  );
}
