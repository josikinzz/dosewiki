import Link from "next/link";
import type { ReactNode } from "react";

import { AppImage } from "@/components/common/AppImage";
import { Icon, type IconName } from "@/components/common/Icon";
import { StatusOrb } from "@/components/common/StatusOrb";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PublicAttributionSection } from "./PublicContentPrimitives";

export type PublicSkeletonBlock = {
  width: string;
  height: string;
  tone?: "strong" | "soft";
};

export type PublicSkeletonSectionModel = {
  key: string;
  variant: "card" | "list" | "article" | "section";
  columns?: 1 | 2;
  blocks: PublicSkeletonBlock[];
};

export type PublicSkeletonSurfaceModel = {
  density: "compact" | "normal" | "spacious";
  headingBlocks: PublicSkeletonBlock[];
  label: string;
  pendingLabel: string;
  sections: PublicSkeletonSectionModel[];
  stalledLabel: string;
};

export interface SkeletonPulseProps {
  block?: PublicSkeletonBlock;
  className?: string;
  height?: string;
  tone?: PublicSkeletonBlock["tone"];
  width?: string;
}

export function SkeletonPulse({
  block,
  className,
  height,
  tone,
  width,
}: SkeletonPulseProps) {
  const resolvedTone = tone ?? block?.tone ?? "soft";

  return (
    <div
      className={cn(
        "animate-pulse rounded-full motion-reduce:animate-none",
        height ?? block?.height ?? "h-4",
        width ?? block?.width ?? "w-full",
        resolvedTone === "strong"
          ? "theme-badge-surface opacity-50"
          : "theme-public-card-subtle opacity-70",
        className,
      )}
    />
  );
}

export function SkeletonSection({
  className,
  section,
}: {
  className?: string;
  section: PublicSkeletonSectionModel;
}) {
  return (
    <div
      className={cn(
        "theme-public-card-subtle space-y-3 rounded-2xl border p-5",
        section.variant === "list" ? "rounded-xl" : undefined,
        className,
      )}
      data-loading-section={section.key}
      data-loading-variant={section.variant}
    >
      {section.blocks.map((block, index) => (
        <SkeletonPulse key={`${section.key}-${index}`} block={block} />
      ))}
    </div>
  );
}

export function PublicSkeletonSurface({
  className,
  model,
}: {
  className?: string;
  model: PublicSkeletonSurfaceModel;
}) {
  return (
    <div
      className={cn(
        "mx-auto max-w-4xl",
        model.density === "compact" ? "space-y-4" : "space-y-6",
        className,
      )}
    >
      <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.24em]">
        {model.label}
      </p>
      <div className="theme-loading-state-copy" role="status" aria-live="polite">
        <p className="theme-text-secondary text-sm font-medium">
          {model.pendingLabel}
        </p>
        <p className="theme-loading-stalled-label theme-text-faint text-xs">
          {model.stalledLabel}
        </p>
      </div>

      {model.headingBlocks.length > 0 ? (
        <div className="space-y-3">
          {model.headingBlocks.map((block, index) => (
            <SkeletonPulse key={`heading-${index}`} block={block} />
          ))}
        </div>
      ) : null}

      <div
        className={cn(
          "grid gap-4",
          model.sections.some((section) => section.columns === 2)
            ? "md:grid-cols-2"
            : undefined,
        )}
      >
        {model.sections.map((section) => (
          <SkeletonSection key={section.key} section={section} />
        ))}
      </div>
    </div>
  );
}

export interface StatusHeaderProps {
  badge: string;
  badgeVariant?: BadgeProps["variant"];
  description: ReactNode;
  statusIcon?: IconName;
  statusLoading?: boolean;
  statusTone?: "accent" | "success" | "warning" | "danger" | "neutral";
  title: string;
}

export function StatusHeader({
  badge,
  badgeVariant = "default",
  description,
  statusIcon,
  statusLoading = false,
  statusTone = "accent",
  title,
}: StatusHeaderProps) {
  return (
    <CardHeader className="space-y-4 p-0">
      <Badge variant={badgeVariant} className="w-fit">
        {badge}
      </Badge>

      <div className="space-y-4">
        {statusIcon ? (
          <StatusOrb
            icon={statusIcon}
            tone={statusTone}
            loading={statusLoading}
            size="md"
          />
        ) : null}
        <CardTitle className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {title}
        </CardTitle>
        <CardDescription className="theme-text-secondary max-w-2xl text-base leading-7">
          {description}
        </CardDescription>
      </div>
    </CardHeader>
  );
}

export function StatusActions({
  align = "start",
  children,
  className,
}: {
  align?: "start" | "center" | "end";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3",
        align === "center" && "justify-center",
        align === "end" && "justify-end",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StatusFact({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="theme-public-card-subtle rounded-2xl border p-4">
      <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.24em]">
        {label}
      </p>
      <div className="theme-text-secondary mt-2 text-sm leading-6">{value}</div>
    </div>
  );
}

export interface MediaPlaceholderProps {
  className?: string;
  description?: ReactNode;
  icon?: IconName;
  kind?: "empty" | "loading";
  title?: ReactNode;
}

export function MediaPlaceholder({
  className,
  description,
  icon = "lucide:image",
  kind = "empty",
  title = kind === "loading" ? "Loading media" : "Media unavailable",
}: MediaPlaceholderProps) {
  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-gradient-to-br from-fuchsia-900/20 via-violet-900/20 to-sky-900/20 px-3 text-center",
        className,
      )}
      role={kind === "loading" ? "status" : undefined}
      aria-busy={kind === "loading" || undefined}
    >
      <div>
        {kind === "loading" ? (
          <SkeletonPulse width="w-10" height="h-10" className="mx-auto mb-3 rounded-full" />
        ) : (
          <Icon icon={icon} className="theme-icon-accent mx-auto mb-2 h-10 w-10 opacity-70" />
        )}
        <p className="theme-text-primary line-clamp-2 text-sm font-medium">{title}</p>
        {description ? (
          <p className="theme-text-faint mt-1 text-xs">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

export interface MediaTileProps {
  ariaLabel?: string;
  className?: string;
  creator?: ReactNode;
  height?: number | null;
  mediaType?: "image" | "video" | "audio";
  onClick?: () => void;
  resourceUrl?: string;
  thumbnailUrl?: string | null;
  title: string;
  width?: number | null;
}

export function MediaTile({
  ariaLabel,
  className,
  creator,
  height,
  mediaType = "image",
  onClick,
  resourceUrl,
  thumbnailUrl,
  title,
  width,
}: MediaTileProps) {
  const body = (
    <>
      {thumbnailUrl ? (
        <AppImage
          src={thumbnailUrl}
          alt={title}
          width={width ?? 800}
          height={height ?? 800}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02] group-hover:opacity-80"
        />
      ) : (
        <MediaPlaceholder
          icon={mediaType === "video" ? "lucide:play" : "lucide:image"}
          title={title}
          description={creator ? <>by {creator}</> : undefined}
        />
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="theme-text-primary truncate text-sm font-medium">{title}</p>
            {creator ? (
              <p className="theme-text-muted truncate text-xs">by {creator}</p>
            ) : null}
          </div>
          {mediaType === "video" ? (
            <span className="theme-overlay-surface rounded-full p-2">
              <Icon icon="lucide:play" className="h-3.5 w-3.5 fill-current" />
            </span>
          ) : null}
        </div>
      </div>
    </>
  );

  const tileClassName = cn(
    "theme-public-card-subtle theme-public-card-hover-quiet group relative block aspect-square overflow-hidden rounded-xl border text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400",
    className,
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={tileClassName}
        aria-label={ariaLabel ?? `Open media: ${title}`}
      >
        {body}
      </button>
    );
  }

  if (resourceUrl) {
    return (
      <a
        href={resourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={tileClassName}
        aria-label={ariaLabel ?? `Open media: ${title}`}
      >
        {body}
      </a>
    );
  }

  return <div className={tileClassName}>{body}</div>;
}

export interface ArticleContributorAttributionProps {
  author: string;
  authorHref: string;
  avatarSrc?: string | null;
  className?: string;
  text: string;
  url?: string;
}

export function ArticleContributorAttribution({
  author,
  authorHref,
  avatarSrc,
  className,
  text,
  url,
}: ArticleContributorAttributionProps) {
  const authorIndex = text.indexOf(author);
  const beforeAuthor = authorIndex > 0 ? text.slice(0, authorIndex) : "";
  const afterAuthor =
    authorIndex >= 0 ? text.slice(authorIndex + author.length) : text;

  return (
    <PublicAttributionSection
      className={className}
      avatarSrc={avatarSrc}
      avatarAlt={author}
      avatarHref={authorHref}
      actions={
        url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="theme-accent-heading inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
          >
            <Icon
              icon="lucide:external-link"
              size={14}
              className="theme-external-link-badge-icon theme-icon-muted"
            />
            <span>Original article</span>
          </a>
        ) : null
      }
    >
      {beforeAuthor}
      <Link
        href={authorHref}
        className="theme-accent-heading font-semibold transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
      >
        {author}
      </Link>
      {afterAuthor}
    </PublicAttributionSection>
  );
}
