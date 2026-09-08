import { SmartLink } from "@/components/common/SmartLink";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { AppImage } from "@/components/common/AppImage";
import { HighlightedText } from "@/components/common/HighlightedText";
import { Icon, type IconName } from "@/components/common/Icon";
import { IconBadge } from "@/components/common/IconBadge";
import { PublicOverline, PublicPill } from "@/components/common/PublicTokens";
import { SectionCard } from "@/components/common/SectionCard";
import { Button } from "@/components/ui/button";
import { interactiveSurfaceVariants } from "@/components/ui/surface";
import { toInitials } from "@/lib/text";
import { cn } from "@/lib/utils";

type PublicContentShellElement = "main" | "div" | "section";
type PublicContentShellWidth = "narrow" | "standard" | "wide";

type PublicContentShellProps<
  TElement extends PublicContentShellElement = "main",
> = {
  as?: TElement;
  width?: PublicContentShellWidth;
  focusTarget?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<TElement>, "as" | "className" | "children">;

const shellWidthClasses: Record<PublicContentShellWidth, string> = {
  narrow: "max-w-3xl",
  standard: "max-w-4xl",
  wide: "max-w-6xl",
};

export function PublicContentShell<
  TElement extends PublicContentShellElement = "main",
>({
  as,
  width = "standard",
  focusTarget = false,
  className,
  children,
  id,
  tabIndex,
  ...props
}: PublicContentShellProps<TElement>) {
  const Component = as ?? "main";

  return (
    <Component
      id={focusTarget ? (id ?? "main-content") : id}
      tabIndex={focusTarget ? (tabIndex ?? -1) : tabIndex}
      className={cn(
        "mx-auto min-h-screen w-full px-4 pb-20 pt-12 focus:outline-none md:px-8",
        shellWidthClasses[width],
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

type PublicSectionHeadingVariant = "rule" | "card" | "action";
type PublicSectionHeadingTitleElement = "h2" | "h3" | "h4" | "span";

interface PublicSectionHeadingProps {
  icon?: IconName;
  iconLabel?: string;
  title: ReactNode;
  actions?: ReactNode;
  variant?: PublicSectionHeadingVariant;
  titleElement?: PublicSectionHeadingTitleElement;
  className?: string;
  titleClassName?: string;
}

export function PublicSectionHeading({
  icon,
  iconLabel,
  title,
  actions,
  variant = "rule",
  titleElement,
  className,
  titleClassName,
}: PublicSectionHeadingProps) {
  const Heading = titleElement ?? (variant === "card" ? "h3" : "h2");
  const accessibleIconLabel =
    iconLabel ?? (typeof title === "string" ? title : undefined);

  if (variant === "rule") {
    return (
      <div className={cn("flex flex-wrap items-center gap-4", className)}>
        <div className="relative min-w-0">
          <Heading
            className={cn(
              "theme-accent-heading relative flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-2xl font-bold tracking-tight",
              titleClassName,
            )}
          >
            {icon ? <Icon icon={icon} className="h-8 w-8 shrink-0" /> : null}
            <span className="min-w-0 break-words">{title}</span>
          </Heading>
        </div>
        {actions ? (
          <div className="flex items-center gap-2">{actions}</div>
        ) : null}
        <div className="h-px min-w-12 flex-1 bg-[image:var(--theme-horizontal-divider-image)]" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-3",
        variant === "action" ? "justify-between" : undefined,
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {icon ? <IconBadge icon={icon} label={accessibleIconLabel} /> : null}
        <Heading
          className={cn(
            "min-w-0 break-words font-semibold",
            variant === "action"
              ? "theme-text-primary text-xl font-bold transition"
              : "theme-accent-heading text-lg",
            titleClassName,
          )}
        >
          {title}
        </Heading>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

type ContributorAvatarSize = "xs" | "sm" | "md" | "lg";

interface ContributorAvatarProps {
  imageUrl?: string | null;
  name: string;
  size?: ContributorAvatarSize;
  /** Adds the neutral depth cast under the frame. */
  lifted?: boolean;
  className?: string;
}

const contributorAvatarSizes: Record<
  ContributorAvatarSize,
  { frame: string; imageSize: number; text: string }
> = {
  xs: {
    frame: "h-10 w-10 border text-sm",
    imageSize: 40,
    text: "text-sm",
  },
  sm: {
    frame: "h-14 w-14 border text-lg",
    imageSize: 56,
    text: "text-lg",
  },
  md: {
    frame: "h-20 w-20 border-2 text-2xl sm:h-24 sm:w-24",
    imageSize: 96,
    text: "text-2xl",
  },
  lg: {
    frame: "h-32 w-32 border-2 text-4xl",
    imageSize: 128,
    text: "text-4xl",
  },
};

export function ContributorAvatar({
  imageUrl,
  name,
  size = "sm",
  lifted = false,
  className,
}: ContributorAvatarProps) {
  const sizeConfig = contributorAvatarSizes[size];
  const initials = toInitials(name);

  return (
    <div className={cn("relative shrink-0", className)}>
      <div
        className={cn(
          "theme-public-card-subtle theme-contributor-avatar relative overflow-hidden rounded-full border bg-gradient-to-br from-[var(--theme-avatar-gradient-from)] to-[var(--theme-avatar-gradient-to)] text-center font-semibold shadow-[var(--theme-elevation-avatar-inner)] transition duration-300",
          lifted ? "shadow-[var(--theme-elevation-avatar-glow)]" : undefined,
          sizeConfig.frame,
        )}
      >
        {imageUrl ? (
          <AppImage
            src={imageUrl}
            alt={`${name} avatar`}
            width={sizeConfig.imageSize}
            height={sizeConfig.imageSize}
            className="h-full w-full object-cover transition duration-[360ms] ease-[cubic-bezier(0.25,1,0.5,1)] group-hover:scale-[1.035] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            draggable={false}
          />
        ) : (
          <span
            className={cn(
              "flex h-full w-full items-center justify-center transition duration-[360ms] ease-[cubic-bezier(0.25,1,0.5,1)] group-hover:scale-[1.035] motion-reduce:transition-none motion-reduce:group-hover:scale-100",
              sizeConfig.text,
            )}
          >
            {initials}
          </span>
        )}
      </div>
    </div>
  );
}

export interface ContributorCardContributor {
  key: string;
  displayName: string;
  avatarUrl?: string | null;
  subtitle?: ReactNode;
}

interface ContributorCardProps {
  contributor: ContributorCardContributor;
  href: string;
  className?: string;
}

export function ContributorCard({
  contributor,
  href,
  className,
}: ContributorCardProps) {
  const subtitle = contributor.subtitle ?? `@${contributor.key.toLowerCase()}`;

  return (
    <SmartLink
      href={href}
      className={cn(
        "theme-public-card theme-public-card-interactive group relative flex items-center gap-4 overflow-hidden rounded-2xl border p-4 theme-focus-ring",
        className,
      )}
    >
      <ContributorAvatar
        imageUrl={contributor.avatarUrl}
        name={contributor.displayName || contributor.key}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="theme-text-primary truncate text-base font-semibold transition">
          {contributor.displayName}
        </p>
        <p className="theme-accent-heading mt-0.5 truncate text-xs font-bold uppercase tracking-[0.15em] transition">
          {subtitle}
        </p>
      </div>
      <Icon
        icon="lucide:arrow-right"
        className="theme-text-faint h-5 w-5 -translate-x-1 opacity-0 transition-[opacity,translate,color] duration-300 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
      />
    </SmartLink>
  );
}

interface IconPillLinkProps {
  icon: IconName;
  label: ReactNode;
  href: string;
  external?: boolean;
  className?: string;
}

export function IconPillLink({
  icon,
  label,
  href,
  external,
  className,
}: IconPillLinkProps) {
  const isExternal = external ?? /^https?:\/\//i.test(href);

  return (
    <PublicPill
      as="a"
      href={href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      icon={icon}
      tone="neutral"
      className={cn(
        "group hover:opacity-90 theme-focus-ring",
        className,
      )}
    >
      <span>{label}</span>
      {isExternal ? (
        <Icon
          icon="lucide:external-link"
          size={14}
          className="theme-text-faint transition-opacity group-hover:opacity-80"
        />
      ) : null}
    </PublicPill>
  );
}

export interface TaxonomyGroupItem {
  id: string;
  label: ReactNode;
  href: string;
  meta?: ReactNode;
}

export interface TaxonomyGroup {
  id: string;
  title: ReactNode;
  items: TaxonomyGroupItem[];
}

interface TaxonomyGroupSectionProps {
  icon: IconName;
  label: string;
  groups: TaxonomyGroup[];
  displayMode?: "list" | "grid";
  emptyText?: ReactNode;
  delayStart?: number;
  delayStep?: number;
  className?: string;
}

export function TaxonomyGroupSection({
  icon,
  label,
  groups,
  displayMode = "list",
  emptyText = "No public substances currently map to this tag.",
  delayStart = 0.05,
  delayStep = 0,
  className,
}: TaxonomyGroupSectionProps) {
  const renderedGroups =
    groups.length > 0
      ? groups
      : [
          {
            id: "empty",
            title: label,
            items: [] satisfies TaxonomyGroupItem[],
          },
        ];

  return (
    <div className={cn("space-y-6", className)}>
      {renderedGroups.map((group, index) => (
        <SectionCard key={group.id} delay={delayStart + index * delayStep}>
          <PublicSectionHeading
            variant="card"
            icon={icon}
            iconLabel={label}
            title={group.title}
          />
          {group.items.length > 0 ? (
            <ul
              className={cn(
                "theme-text-secondary mt-4 text-sm",
                displayMode === "grid"
                  ? "grid gap-2 sm:grid-cols-2"
                  : "space-y-2",
              )}
            >
              {group.items.map((item) => (
                <li key={item.id}>
                  <Button variant="listItem" size="listItem" asChild>
                    <SmartLink href={item.href} className="min-w-0">
                      <span className="theme-taxonomy-link-label min-w-0 break-words">
                        {item.label}
                      </span>
                      {item.meta ? (
                        <span className="theme-taxonomy-link-meta ml-auto shrink-0">
                          {item.meta}
                        </span>
                      ) : null}
                    </SmartLink>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="theme-text-muted mt-4 text-sm">{emptyText}</p>
          )}
        </SectionCard>
      ))}
    </div>
  );
}

export interface SearchMetaChipItem {
  id: string;
  label: string;
}

interface SearchMetaChipsProps {
  items: SearchMetaChipItem[];
  highlightedQuery?: string;
  className?: string;
}

export function SearchMetaChips({
  items,
  highlightedQuery = "",
  className,
}: SearchMetaChipsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <span
      className={cn("mt-1.5 flex max-w-full flex-wrap gap-1.5", className)}
      aria-label="Search metadata"
    >
      {items.map((item) => (
        <PublicPill
          key={item.id}
          tone="neutral"
          size="sm"
          className="max-w-full whitespace-normal break-words text-left leading-snug transition-opacity group-hover:opacity-90"
        >
          <HighlightedText
            text={item.label}
            query={highlightedQuery}
            className="min-w-0 break-words"
          />
        </PublicPill>
      ))}
    </span>
  );
}

export interface SearchResultCardModel {
  id: string;
  href: string;
  typeLabel: string;
  label: string;
  secondary?: string;
  icon?: IconName;
  metaChips?: SearchMetaChipItem[];
  isBestMatch?: boolean;
}

interface SearchResultCardProps {
  result: SearchResultCardModel;
  highlightedQuery: string;
  className?: string;
}

export function SearchResultCard({
  result,
  highlightedQuery,
  className,
}: SearchResultCardProps) {
  return (
    <Button
      variant="card"
      size="card"
      asChild
      className={cn(
        interactiveSurfaceVariants({ variant: "result" }),
        "min-w-0 max-w-full overflow-hidden",
        className,
      )}
    >
      <SmartLink href={result.href} className="min-w-0 max-w-full overflow-hidden">
        <div className="flex min-w-0 max-w-full flex-col gap-2 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2">
            <PublicOverline>{result.typeLabel}</PublicOverline>
            {result.isBestMatch ? (
              <PublicPill tone="accent" size="sm">
                Best match
              </PublicPill>
            ) : null}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            {result.icon ? (
              <Icon
                icon={result.icon}
                size={18}
                className="theme-icon-accent shrink-0 opacity-80"
              />
            ) : null}
            <HighlightedText
              text={result.label}
              query={highlightedQuery}
              className="theme-accent-heading min-w-0 break-words text-xl font-semibold"
            />
          </div>
          {result.secondary ? (
            <HighlightedText
              text={result.secondary}
              query={highlightedQuery}
              className="theme-text-muted min-w-0 max-w-full break-words text-sm leading-6"
            />
          ) : null}
          <SearchMetaChips
            items={result.metaChips ?? []}
            highlightedQuery={highlightedQuery}
          />
        </div>
        <span className="theme-text-muted mt-1 hidden shrink-0 text-sm font-semibold uppercase tracking-wide transition-transform duration-200 group-hover:translate-x-0.5 sm:inline-flex">
          View
        </span>
      </SmartLink>
    </Button>
  );
}
