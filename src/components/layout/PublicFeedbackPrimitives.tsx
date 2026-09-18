import { SmartLink } from "@/components/common/SmartLink";
import type { ReactNode } from "react";

import { AppImage } from "@/components/common/AppImage";
import { ExternalSourcePill } from "@/components/common/ExternalSourcePill";
import { Icon, type IconName } from "@/components/common/Icon";
import { articleSectionAdornmentClassName } from "@/components/common/articleSectionLayout";
import {
  stateToneIconClassName,
  type StateTone,
} from "@/components/common/StateCard";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { useT } from "@/i18n/client";
import { msg } from "@/i18n/messages";
import { cn } from "@/lib/utils";

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
        "theme-skeleton-pulse animate-pulse rounded-full motion-reduce:animate-none",
        height ?? block?.height ?? "h-4",
        width ?? block?.width ?? "w-full",
        resolvedTone === "strong"
          ? "theme-skeleton-pulse-strong"
          : "theme-skeleton-pulse-soft",
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
        "theme-loading-section-shell",
        section.variant === "article"
          ? "theme-loading-section-shell-prominent"
          : undefined,
        section.variant === "list"
          ? "theme-loading-section-shell-quiet"
          : undefined,
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
      data-nosnippet
      className={cn(
        "theme-loading-surface mx-auto max-w-4xl",
        model.density === "compact" ? "space-y-5" : "space-y-7",
        className,
      )}
    >
      <p className="sr-only">{model.label}</p>
      <div className="sr-only" role="status" aria-live="polite">
        <p>{model.pendingLabel}</p>
        <p className="theme-loading-stalled-label">{model.stalledLabel}</p>
      </div>

      {model.headingBlocks.length > 0 ? (
        <div className="theme-loading-heading space-y-4" aria-hidden="true">
          {model.headingBlocks.map((block, index) => (
            <SkeletonPulse key={`heading-${index}`} block={block} />
          ))}
        </div>
      ) : null}

      <div
        className={cn(
          "grid gap-5",
          model.sections.some((section) => section.columns === 2)
            ? "md:grid-cols-2"
            : undefined,
        )}
        aria-hidden="true"
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
  statusTone?: StateTone;
  title: string;
}

export function StatusHeader({
  badge,
  badgeVariant = "default",
  description,
  statusIcon,
  statusTone = "accent",
  title,
}: StatusHeaderProps) {
  return (
    <div className="space-y-4">
      <Badge variant={badgeVariant} className="w-fit">
        {badge}
      </Badge>

      <div className="space-y-4">
        {statusIcon ? (
          <Icon
            icon={statusIcon}
            size={28}
            className={stateToneIconClassName[statusTone]}
          />
        ) : null}
        <h1 className="theme-accent-heading font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="theme-text-secondary max-w-2xl text-base leading-7">
          {description}
        </p>
      </div>
    </div>
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

export interface StatusFactProps {
  label: string;
  value: ReactNode;
  /** Visual treatment. "boxed" (default) renders the bordered tile; "plain"
   *  drops the card chrome (no border/rounded-card/padding box) for flat side
   *  rails that list facts or recovery links without forced nested boxes. */
  tone?: "boxed" | "plain";
}

export function StatusFact({ label, value, tone = "boxed" }: StatusFactProps) {
  if (tone === "plain") {
    return (
      <div>
        <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.24em]">
          {label}
        </p>
        <div className="theme-text-secondary mt-1.5 text-sm leading-6">
          {value}
        </div>
      </div>
    );
  }

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

// The defaults stay catalog keys: this module is shared with server routes,
// so a render site that wants them translated passes `title` through its own
// `t` (the substance article's showcase always passes the work title).
export function MediaPlaceholder({
  className,
  description,
  icon = "lucide:image",
  kind = "empty",
  title = kind === "loading" ? msg("Loading media") : msg("Media unavailable"),
}: MediaPlaceholderProps) {
  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-gradient-to-br from-[color-mix(in_srgb,#701a75_20%,var(--theme-surface-muted))] to-[color-mix(in_srgb,#4c1d95_20%,var(--theme-surface-muted))] px-3 text-center",
        className,
      )}
      role={kind === "loading" ? "status" : undefined}
      aria-busy={kind === "loading" || undefined}
    >
      <div>
        {kind === "loading" ? (
          <SkeletonPulse
            width="w-10"
            height="h-10"
            className="mx-auto mb-3 rounded-full"
          />
        ) : (
          <Icon
            icon={icon}
            className="theme-icon-accent mx-auto mb-2 h-10 w-10 opacity-70"
          />
        )}
        <p className="theme-text-primary line-clamp-2 text-sm font-medium">
          {title}
        </p>
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
  /** Pre-formatted credit line, e.g. "by Alice" or "Creator unknown" — rendered verbatim. */
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
        <>
          <AppImage
            src={thumbnailUrl}
            alt={title}
            width={width ?? 800}
            height={height ?? 800}
            sizes="(max-width: 639px) 50vw, (max-width: 1024px) 33vw, 320px"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02] group-hover:opacity-80 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />

          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-3 pb-2 pt-8">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="theme-media-tile-title truncate text-sm font-medium">
                  {title}
                </p>
                {creator ? (
                  <p className="theme-media-tile-creator truncate text-xs">
                    {creator}
                  </p>
                ) : null}
              </div>
              {mediaType === "video" ? (
                <span className="theme-overlay-surface theme-feedback-icon-well rounded-full p-2">
                  <Icon
                    icon="lucide:play"
                    className="h-3.5 w-3.5 fill-current"
                  />
                </span>
              ) : null}
            </div>
          </div>
        </>
      ) : (
        // The placeholder already renders the icon, title, and credit line;
        // repeating them in the overlay would double every label on the tile.
        <MediaPlaceholder
          icon={mediaType === "video" ? "lucide:play" : "lucide:image"}
          title={title}
          description={creator ?? undefined}
        />
      )}
    </>
  );

  const tileClassName = cn(
    "theme-public-card-subtle theme-public-card-hover-quiet theme-media-tile group relative block aspect-square overflow-hidden rounded-xl border text-left transition theme-focus-ring motion-reduce:transition-none",
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
  authorHref?: string;
  avatarSrc?: string | null;
  className?: string;
  text: string;
  url?: string;
}

function splitAttributionText(text: string, author: string) {
  const authorIndex = text.indexOf(author);

  if (authorIndex === -1) {
    return {
      prefix: text,
      suffix: undefined,
    };
  }

  return {
    prefix: text.slice(0, authorIndex),
    suffix: text.slice(authorIndex + author.length),
  };
}

function formatAttributionCreditText({
  prefix,
  suffix,
}: {
  prefix: string;
  suffix?: string;
}) {
  return {
    prefix: prefix.replace(/\s+by\s*$/i, "").trim(),
    suffix: suffix?.replace(/^,\s*/, "").trim(),
  };
}

export function ArticleContributorAttribution({
  author,
  authorHref,
  avatarSrc,
  className,
  text,
  url,
}: ArticleContributorAttributionProps) {
  // Localizes its own copy, so this export is reached through
  // ArticleContributorAttribution.client; the module itself carries no
  // directive because server routes render the skeleton surface above.
  const t = useT();
  const attributionText = splitAttributionText(text, author);
  const creditText = formatAttributionCreditText(attributionText);
  const isExternalAuthorHref =
    typeof authorHref === "string" && /^https?:\/\//.test(authorHref);
  const authorLinkClassName = "theme-focus-ring relative z-20 rounded-full";
  const authorLink = !authorHref ? (
    // No z-index: an unlinked name must not sit above the pill's own overlay
    // link, or it would punch a dead hole in an otherwise clickable card.
    <span>{author}</span>
  ) : isExternalAuthorHref ? (
    <a
      href={authorHref}
      target="_blank"
      rel="noopener noreferrer"
      className={authorLinkClassName}
    >
      {author}
    </a>
  ) : (
    <SmartLink href={authorHref} className={authorLinkClassName}>
      {author}
    </SmartLink>
  );
  // The avatar belongs to the name, not the sentence: render it between "by"
  // and the author inside one nowrap unit so the credit never breaks mid-name.
  const authorLabel = (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap align-bottom">
      <span className="theme-text-faint font-medium">{t("by")}</span>
      {avatarSrc ? (
        <AppImage
          src={avatarSrc}
          alt=""
          width={20}
          height={20}
          className="h-5 w-5 rounded"
        />
      ) : null}
      {authorLink}
    </span>
  );

  return (
    <div
      className={cn(
        articleSectionAdornmentClassName,
        "flex justify-end",
        className,
      )}
    >
      <ExternalSourcePill
        variant="credit"
        href={url}
        ariaLabel={t(
          "Open original subjective effects documentation by {{author}}",
          { author },
        )}
        prefix={creditText.prefix}
        label={authorLabel}
        suffix={creditText.suffix}
      />
    </div>
  );
}
