import { SmartLink } from "@/components/common/SmartLink";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import {
  ArticleSection,
  type ArticleSectionProps,
} from "@/components/common/ArticleSection";
import { AppImage } from "@/components/common/AppImage";
import { Icon, type IconName } from "@/components/common/Icon";
import { IconBadge } from "@/components/common/IconBadge";
import { PublicPill } from "@/components/common/PublicTokens";
import { SectionCard } from "@/components/common/SectionCard";
import { PublicSectionHeading } from "@/components/layout/PublicPagePrimitives";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

type PublicTagItem =
  | string
  | {
      id?: string;
      icon?: IconName;
      label: ReactNode;
    };

export type PublicMetadataListItem = {
  key: string;
  icon?: IconName;
  label: ReactNode;
  value?: ReactNode;
  meta?: ReactNode;
  href?: string;
};

type PublicMetadataListLayout = "grid" | "stack" | "inline";

export interface PublicMetadataListProps
  extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  items: PublicMetadataListItem[];
  layout?: PublicMetadataListLayout;
}

const metadataLayoutClasses = {
  grid: "grid gap-3 sm:grid-cols-2",
  stack: "space-y-3",
  inline: "flex flex-wrap items-center gap-x-4 gap-y-2",
} satisfies Record<PublicMetadataListLayout, string>;

export function PublicMetadataList({
  className,
  items,
  layout = "grid",
  ...props
}: PublicMetadataListProps) {
  const visibleItems = items.filter(
    (item) =>
      item.value !== null &&
      item.value !== undefined &&
      item.value !== "" &&
      item.value !== false,
  );

  if (visibleItems.length === 0) {
    return null;
  }

  if (layout === "inline") {
    return (
      <div
        className={cn(metadataLayoutClasses.inline, "theme-text-muted text-sm", className)}
        {...props}
      >
        {visibleItems.map((item) => (
          <span key={item.key} className="inline-flex min-w-0 items-center gap-2">
            {item.icon ? (
              <Icon icon={item.icon} className="theme-icon-accent h-4 w-4 shrink-0" />
            ) : null}
            <span className="min-w-0">
              {item.label ? <span className="sr-only">{item.label}: </span> : null}
              {item.href ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="theme-link-muted"
                >
                  {item.value}
                </a>
              ) : (
                item.value
              )}
            </span>
            {item.meta ? <span className="theme-text-faint">{item.meta}</span> : null}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className={cn(metadataLayoutClasses[layout], className)} {...props}>
      {visibleItems.map((item) => (
        <PublicFactTile
          key={item.key}
          icon={item.icon}
          label={item.label}
          value={item.value}
          meta={item.meta}
          href={item.href}
        />
      ))}
    </div>
  );
}

export interface PublicFactTileProps
  extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  icon?: IconName;
  label: ReactNode;
  value?: ReactNode;
  meta?: ReactNode;
  href?: string;
  valueClassName?: string;
}

export function PublicFactTile({
  className,
  href,
  icon,
  label,
  meta,
  value,
  valueClassName,
  ...props
}: PublicFactTileProps) {
  const body = (
    <>
      <span className="theme-text-faint flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
        {icon ? <Icon icon={icon} className="theme-icon-accent h-3.5 w-3.5 shrink-0" /> : null}
        <span className="min-w-0 truncate">{label}</span>
      </span>
      {value ? (
        <p className={cn("theme-text-primary mt-1.5 text-sm", valueClassName)}>
          {value}
        </p>
      ) : null}
      {meta ? <div className="theme-text-faint mt-1 text-xs">{meta}</div> : null}
    </>
  );

  const tileClassName = cn(
    "theme-public-card-hover-quiet block rounded-xl border p-3 transition",
    className,
  );

  if (href) {
    return (
      <Surface asChild variant="subtle" padding="none" radius="lg">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            tileClassName,
            "theme-focus-ring",
          )}
        >
          {body}
        </a>
      </Surface>
    );
  }

  return (
    <Surface
      variant="subtle"
      padding="none"
      radius="lg"
      className={tileClassName}
      {...props}
    >
      {body}
    </Surface>
  );
}

export interface PublicAttributionSectionProps
  extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  actions?: ReactNode;
  align?: "start" | "center" | "end";
  avatarAlt?: string;
  avatarHref?: string;
  avatarSrc?: string | null;
  children?: ReactNode;
  href?: string;
  hrefAriaLabel?: string;
  hrefRel?: string;
  hrefTarget?: ComponentPropsWithoutRef<"a">["target"];
  text?: ReactNode;
}

const attributionAlignClasses = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
} satisfies Record<NonNullable<PublicAttributionSectionProps["align"]>, string>;

export function PublicAttributionSection({
  actions,
  align = "end",
  avatarAlt = "",
  avatarHref,
  avatarSrc,
  children,
  className,
  href,
  hrefAriaLabel,
  hrefRel,
  hrefTarget,
  text,
  ...props
}: PublicAttributionSectionProps) {
  const avatar = avatarSrc ? (
    <AppImage
      src={avatarSrc}
      alt={avatarAlt}
      width={24}
      height={24}
      className="h-6 w-6 rounded-full object-cover ring-1 ring-[rgb(var(--c-brand)/0.20)] transition group-hover:ring-[rgb(var(--c-brand)/0.50)]"
    />
  ) : null;

  return (
    <div className={cn("flex", attributionAlignClasses[align], className)} {...props}>
      <div className="theme-public-card-subtle theme-public-card-hover-quiet group relative flex max-w-full flex-wrap items-center justify-end gap-2.5 overflow-hidden rounded-2xl border px-3 py-2 transition">
        {href ? (
          <a
            href={href}
            target={hrefTarget}
            rel={hrefRel}
            aria-label={hrefAriaLabel}
            className="theme-focus-ring absolute inset-0 z-10 rounded-2xl"
          />
        ) : null}
        {avatar && avatarHref ? (
          <SmartLink
            href={avatarHref}
            className="theme-focus-ring relative z-20 shrink-0 rounded-full"
          >
            {avatar}
          </SmartLink>
        ) : (
          avatar
        )}
        {children ?? text ? (
          <span className="theme-text-faint min-w-0 text-xs">{children ?? text}</span>
        ) : null}
        {actions ? <span className="relative z-20">{actions}</span> : null}
      </div>
    </div>
  );
}

export interface PublicDetailHeroProps
  extends Omit<ComponentPropsWithoutRef<"section">, "children" | "title"> {
  actions?: ReactNode;
  attribution?: ReactNode;
  badges?: ReactNode;
  icon?: IconName;
  iconLabel?: string;
  kind: "effect" | "report";
  media?: ReactNode;
  metadata?: PublicMetadataListItem[];
  summary?: ReactNode;
  tags?: PublicTagItem[];
  title: ReactNode;
  titleClassName?: string;
}

export function PublicDetailHero({
  actions,
  attribution,
  badges,
  className,
  icon,
  iconLabel,
  kind,
  media,
  metadata = [],
  summary,
  tags = [],
  title,
  titleClassName,
  ...props
}: PublicDetailHeroProps) {
  return (
    <Surface asChild variant="articleHero" padding="lg" radius="xl">
      <section className={cn("relative", className)} data-public-detail-kind={kind} {...props}>
        {badges ? <div className="absolute right-4 top-4 z-10">{badges}</div> : null}

        <div className={cn("relative flex flex-col gap-6", media ? "pr-0 md:pr-24" : undefined)}>
          <div className="flex flex-wrap items-start gap-4 sm:gap-5">
            {icon ? (
              <IconBadge
                icon={icon}
                label={iconLabel ?? (typeof title === "string" ? title : undefined)}
                size={32}
                className="h-14 w-14 shrink-0 rounded-[18px] bg-gradient-to-br from-[color-mix(in_srgb,rgb(var(--c-brand))_18%,var(--theme-surface-muted))] to-[color-mix(in_srgb,rgb(var(--c-violet))_18%,var(--theme-surface-muted))] shadow-[var(--theme-elevation-icon-tile)] ring-1 ring-[rgb(var(--c-brand)/0.22)]"
              />
            ) : null}

            <div className="min-w-0 flex-1 space-y-4">
              <div className="space-y-3">
                <h1
                  className={cn(
                    "theme-accent-heading font-display text-[2rem] font-bold tracking-tight sm:text-[2.5rem]",
                    badges ? "pr-16 md:pr-0" : undefined,
                    titleClassName,
                  )}
                >
                  {title}
                </h1>
                {attribution}
              </div>

              <PublicMetadataList items={metadata} layout="inline" />

              {summary ? (
                <div className="theme-text-secondary max-w-3xl text-sm leading-7 sm:text-[1rem]">
                  {summary}
                </div>
              ) : null}

              {tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => {
                    const item = typeof tag === "string" ? { id: tag, label: tag } : tag;

                    return (
                      <PublicPill key={item.id ?? String(item.label)} icon={item.icon} tone="neutral">
                        {item.label}
                      </PublicPill>
                    );
                  })}
                </div>
              ) : null}
              {actions}
            </div>

            {media ? (
              <div className="absolute right-0 top-0 md:static md:flex-shrink-0">
                {media}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </Surface>
  );
}

type PublicContentSectionLayout = "article" | "card" | "plain";

export interface PublicContentSectionProps
  extends Omit<ComponentPropsWithoutRef<"section">, "children" | "title"> {
  children?: ReactNode;
  delay?: number;
  heading?: ReactNode;
  headerClassName?: string;
  icon?: IconName;
  layout?: PublicContentSectionLayout;
  spacing?: ArticleSectionProps["spacing"];
}

export function PublicContentSection({
  children,
  className,
  delay = 0,
  heading,
  headerClassName,
  icon,
  id,
  layout = "plain",
  spacing,
  ...props
}: PublicContentSectionProps) {
  if (layout === "article" && id && heading && icon) {
    return (
      <ArticleSection
        id={id}
        icon={icon}
        heading={String(heading)}
        spacing={spacing}
        headerClassName={headerClassName}
        className={className}
        {...props}
      >
        {children}
      </ArticleSection>
    );
  }

  if (layout === "card") {
    return (
      <SectionCard id={id} delay={delay} className={className}>
        {heading && icon ? (
          <PublicSectionHeading
            variant="card"
            titleElement="h2"
            icon={icon}
            iconLabel={typeof heading === "string" ? heading : undefined}
            title={heading}
            className={cn("mb-4", headerClassName)}
          />
        ) : null}
        {children}
      </SectionCard>
    );
  }

  return (
    <section id={id} className={className} {...props}>
      {heading && icon ? (
        <PublicSectionHeading
          variant="rule"
          icon={icon}
          iconLabel={typeof heading === "string" ? heading : undefined}
          title={heading}
          className={headerClassName}
        />
      ) : null}
      {children}
    </section>
  );
}
