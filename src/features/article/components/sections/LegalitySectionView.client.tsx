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
  anchorId,
  name,
  variant,
  flag,
  statusLabel,
  statusTitle,
  statusTone,
  details,
}: {
  anchorId?: string;
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
    if (!anchorId) return;
    const reveal = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      const target = hash ? document.getElementById(hash) : null;
      if (
        target &&
        (target.id === anchorId || detailsRef.current?.contains(target))
      )
        setIsExpanded(true);
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [anchorId]);
  useEffect(() => {
    const el = detailsRef.current;
    if (!el) return;
    if (isExpanded) el.removeAttribute("hidden");
    else el.setAttribute("hidden", "until-found");
  }, [isExpanded]);
  return (
    <div
      id={anchorId}
      className={cn(
        "min-w-0",
        anchorId && "scroll-mt-24",
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
              "theme-status-text inline-flex min-w-0 max-w-[60%] items-center gap-1.5 font-semibold uppercase",
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
          variant="inline"
          isExpanded={isExpanded}
          onToggle={() => setIsExpanded((value) => !value)}
          ariaControls={detailsId}
          ariaLabel={
            isExpanded
              ? t("Hide details for {{name}}", { name: t(name) })
              : t("Show details for {{name}}", { name: t(name) })
          }
          className={cn("theme-text-muted ml-auto shrink-0", styles.toggle)}
        />
      </div>
      <div id={detailsId} ref={detailsRef} hidden className={styles.details}>
        {details}
      </div>
    </div>
  );
}

export type LegalityMapShape = {
  key: string;
  anchorId: string;
  name: string;
  kind: "country" | "state" | "city";
  tone: LegalityTone;
  status: string;
  federalStatus?: string;
  inherited?: boolean;
  d?: string;
  dot?: [number, number];
};

const MAP_DOT_RADIUS = { country: 3.5, state: 2.2, city: 1.8 } as const;

function useMapTitle() {
  const t = useT();
  return (shape: LegalityMapShape) => {
    const name = t(shape.name);
    if (!shape.status) return name;
    const status = t(shape.status);
    if (shape.inherited)
      return t("{{name}}: {{status}} (federal law, no state entry)", {
        name,
        status,
      });
    if (shape.federalStatus)
      return t("{{name}}: {{status}} (federal: {{federal}})", {
        name,
        status,
        federal: t(shape.federalStatus),
      });
    return `${name}: ${status}`;
  };
}

export function LegalityMapView({
  width,
  height,
  shapes,
  legend,
}: {
  width: number;
  height: number;
  shapes: LegalityMapShape[];
  legend: { tone: LegalityTone; label: string }[];
}) {
  const t = useT();
  const title = useMapTitle();
  return (
    <figure className="mb-6" data-testid="legality-map">
      <div
        className="relative w-full"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        <div
          aria-hidden
          className="theme-legality-map-borders absolute inset-0"
        />
        <svg
          aria-hidden
          viewBox={`0 0 ${width} ${height}`}
          className="absolute inset-0 h-full w-full overflow-visible"
        >
          {shapes.map((shape) =>
            shape.d ? (
              <a
                key={shape.key}
                href={`#${shape.anchorId}`}
                tabIndex={-1}
                className="theme-legality-map-country"
                data-badge-tone={shape.tone}
                data-map-kind={shape.kind}
              >
                <title>{title(shape)}</title>
                <path d={shape.d} />
              </a>
            ) : null,
          )}
          {shapes.map((shape) =>
            shape.dot ? (
              <a
                key={`${shape.key}:dot`}
                href={`#${shape.anchorId}`}
                tabIndex={-1}
                className="theme-legality-map-country"
                data-badge-tone={shape.tone}
                data-map-kind={shape.kind}
              >
                <title>{title(shape)}</title>
                <circle
                  cx={shape.dot[0]}
                  cy={shape.dot[1]}
                  r={MAP_DOT_RADIUS[shape.kind]}
                />
              </a>
            ) : null,
          )}
        </svg>
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs theme-text-muted">
        {legend.map((item) => (
          <span key={item.tone} className="inline-flex items-center gap-2">
            <span
              aria-hidden
              className="theme-legality-map-swatch"
              data-badge-tone={item.tone}
            />
            {t(item.label)}
          </span>
        ))}
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="theme-legality-map-swatch" />
          {t("Nothing on file")}
        </span>
      </figcaption>
    </figure>
  );
}

export function LegalitySectionView({
  map,
  internationalContent,
  countryGroups,
}: {
  map?: ReactNode;
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
      {map}
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
