import { Slot } from "@radix-ui/react-slot";
import {
  forwardRef,
  memo,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import {
  ExternalSourcePill,
  type ExternalSourcePillProps,
} from "@/components/common/ExternalSourcePill";
import { Icon, type IconName } from "@/components/common/Icon";
import { SectionHeader } from "@/components/common/SectionHeader";
import { msg } from "@/i18n/messages";
import { cn } from "@/lib/utils";
import { articleSectionAdornmentClassName } from "./articleSectionLayout";

type ArticleSectionSpacing = "article" | "effect" | "none";

// The two page-level spacings also defer offscreen rendering
// (`.theme-offscreen-defer`, utilities-theme.css): a long article restyles in
// a fraction of the time when sections outside the viewport skip style,
// layout, and paint. "none" wraps inline groups that may sit inside other
// containment scopes, so it stays undeferred.
//
// "article" carries no top padding: ArticleLayout's movement containers own
// inter-section spacing, and a section-level `pt` there stacked on top of the
// flex gap, producing a dead band before every heading. `scroll-mt` absorbs
// the sticky header (and the mobile TOC strip) for anchor navigation, so it
// stays generous even though the padding is gone.
const articleSectionSpacingClasses = {
  // "article" uses the reader-spacing flow class (utilities-typography.css) in place of
  // a fixed `space-y-6`: same 1.5rem gap by default, and the paragraph-spacing axis can
  // re-space the reading surface without touching this file.
  article: "theme-article-flow scroll-mt-20 theme-offscreen-defer",
  effect: "space-y-6 pt-6 scroll-mt-24 theme-offscreen-defer",
  none: "",
} satisfies Record<ArticleSectionSpacing, string>;

export type ArticleSectionProps = Omit<
  ComponentPropsWithoutRef<"section">,
  "children" | "title"
> & {
  id: string;
  icon: IconName;
  heading: string;
  children?: ReactNode;
  headerClassName?: string;
  spacing?: ArticleSectionSpacing;
};

const ArticleSectionRoot = memo(function ArticleSection({
  id,
  icon,
  heading,
  children,
  className,
  headerClassName,
  spacing = "article",
  ...props
}: ArticleSectionProps) {
  return (
    <section
      id={id}
      className={cn(articleSectionSpacingClasses[spacing], className)}
      {...props}
    >
      <SectionHeader icon={icon} title={heading} className={headerClassName} />
      {children}
    </section>
  );
});

export type ArticleSubsectionCardVariant =
  | "subtle"
  | "nested"
  | "interactive";

export type ArticleSubsectionCardProps =
  ComponentPropsWithoutRef<"div"> & {
    asChild?: boolean;
    padding?: "none" | "xs" | "sm" | "md";
    variant?: ArticleSubsectionCardVariant;
  };

const subsectionPadding = {
  none: "p-0",
  xs: "p-3",
  sm: "p-4",
  md: "p-5",
} satisfies Record<NonNullable<ArticleSubsectionCardProps["padding"]>, string>;

const subsectionVariantClasses = {
  subtle: "theme-article-subsection-card",
  nested: "theme-article-subsection-card-nested",
  interactive:
    "theme-article-subsection-card-interactive theme-focus-ring",
} satisfies Record<ArticleSubsectionCardVariant, string>;

export const ArticleSubsectionCard = forwardRef<
  HTMLDivElement,
  ArticleSubsectionCardProps
>(function ArticleSubsectionCard(
  {
    asChild = false,
    padding = "md",
    variant = "subtle",
    className,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : "div";

  return (
    <Comp
      ref={ref}
      className={cn(
        "rounded-xl border",
        subsectionVariantClasses[variant],
        subsectionPadding[padding],
        className,
      )}
      {...props}
    />
  );
});

export type ArticleSubsectionHeaderProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children" | "title"
> & {
  heading: ReactNode;
  icon?: IconName;
  headingLevel?: "h3" | "h4";
  iconClassName?: string;
  headingClassName?: string;
  children?: ReactNode;
};

export const ArticleSubsectionHeader = memo(function ArticleSubsectionHeader({
  heading,
  icon,
  headingLevel = "h3",
  iconClassName,
  headingClassName,
  children,
  className,
  ...props
}: ArticleSubsectionHeaderProps) {
  const Heading = headingLevel;

  return (
    <div
      className={cn(
        "flex items-center gap-2",
        children && "justify-between",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 items-center gap-2">
        {icon ? (
          <Icon
            icon={icon}
            size={headingLevel === "h3" ? 20 : 18}
            className={cn("theme-icon-accent", iconClassName)}
          />
        ) : null}
        <Heading className={cn("theme-article-subsection-heading theme-text-primary font-semibold", headingClassName)}>
          {heading}
        </Heading>
      </div>
      {children}
    </div>
  );
});

type ArticleSectionGroupSpacing = "compact" | "default" | "loose";

const articleSectionGroupSpacingClasses = {
  compact: "space-y-2.5",
  default: "space-y-4",
  loose: "space-y-6",
} satisfies Record<ArticleSectionGroupSpacing, string>;

export type ArticleSectionGroupProps = Omit<
  ComponentPropsWithoutRef<"section">,
  "children" | "title"
> & {
  children?: ReactNode;
  heading?: ReactNode;
  headingLevel?: "h3" | "h4";
  headerClassName?: string;
  headingClassName?: string;
  icon?: IconName;
  iconClassName?: string;
  spacing?: ArticleSectionGroupSpacing;
};

export const ArticleSectionGroup = memo(function ArticleSectionGroup({
  children,
  className,
  heading,
  headingLevel = "h3",
  headerClassName,
  headingClassName,
  icon,
  iconClassName,
  spacing = "default",
  ...props
}: ArticleSectionGroupProps) {
  return (
    <section
      className={cn(articleSectionGroupSpacingClasses[spacing], className)}
      {...props}
    >
      {heading ? (
        <ArticleSubsectionHeader
          heading={heading}
          headingLevel={headingLevel}
          icon={icon}
          iconClassName={iconClassName}
          headingClassName={headingClassName}
          className={headerClassName}
        />
      ) : null}
      {children}
    </section>
  );
});

type ArticleInfoCardTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger";

const articleInfoCardToneClasses = {
  neutral: {
    card: "",
    icon: "theme-icon-muted",
    title: "theme-text-primary",
  },
  accent: {
    card: "ring-1 ring-[rgb(var(--c-brand)/0.10)]",
    icon: "theme-icon-accent",
    title: "theme-text-primary",
  },
  success: {
    card: "ring-1 ring-emerald-400/10",
    icon: "text-[color:var(--theme-semantic-success-badge-text)]",
    title: "text-[color:var(--theme-semantic-success-badge-text)]",
  },
  warning: {
    card: "ring-1 ring-amber-400/15",
    icon: "text-[color:var(--theme-semantic-caution-badge-text)]",
    title: "text-[color:var(--theme-semantic-caution-badge-text)]",
  },
  danger: {
    card: "ring-1 ring-rose-400/15",
    icon: "text-[color:var(--theme-semantic-danger-badge-text)]",
    title: "text-[color:var(--theme-semantic-danger-badge-text)]",
  },
} satisfies Record<
  ArticleInfoCardTone,
  { card: string; icon: string; title: string }
>;

export type ArticleInfoCardProps = Omit<
  ArticleSubsectionCardProps,
  "title"
> & {
  accessory?: ReactNode;
  children?: ReactNode;
  contentClassName?: string;
  icon?: IconName;
  iconClassName?: string;
  title: ReactNode;
  /**
   * Sits immediately after the title and outside its truncation, for marks that
   * qualify the whole card — a citation cluster covering every row, say — and so
   * must survive a narrow viewport clipping a long title.
   */
  titleAdornment?: ReactNode;
  titleClassName?: string;
  tone?: ArticleInfoCardTone;
};

export const ArticleInfoCard = forwardRef<HTMLDivElement, ArticleInfoCardProps>(
  function ArticleInfoCard(
    {
      accessory,
      children,
      className,
      contentClassName,
      icon,
      iconClassName,
      title,
      titleAdornment,
      titleClassName,
      tone = "neutral",
      variant = "interactive",
      ...props
    },
    ref,
  ) {
    const toneClasses = articleInfoCardToneClasses[tone];

    return (
      <ArticleSubsectionCard
        ref={ref}
        className={cn("flex flex-col gap-2.5", toneClasses.card, className)}
        data-tone={tone}
        variant={variant}
        {...props}
      >
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span
            className={cn(
              "flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide",
              toneClasses.title,
              titleClassName,
            )}
          >
            {icon ? (
              <Icon
                icon={icon}
                size={16}
                className={cn("shrink-0", toneClasses.icon, iconClassName)}
              />
            ) : null}
            <span className="min-w-0 truncate">{title}</span>
            {titleAdornment ? (
              <span className="shrink-0 normal-case tracking-normal">{titleAdornment}</span>
            ) : null}
          </span>
          {accessory ? <div className="shrink-0">{accessory}</div> : null}
        </div>
        {children ? (
          <div className={cn("theme-text-primary text-sm leading-relaxed", contentClassName)}>
            {children}
          </div>
        ) : null}
      </ArticleSubsectionCard>
    );
  },
);

export type ArticleKeyValueRow = {
  className?: string;
  href?: string;
  icon?: IconName;
  key?: string;
  label: ReactNode;
  value?: ReactNode;
  valueClassName?: string;
};

export type ArticleKeyValueRowsProps = Omit<
  ComponentPropsWithoutRef<"dl">,
  "children"
> & {
  density?: "compact" | "comfortable";
  emptyState?: ReactNode;
  rows: ArticleKeyValueRow[];
};

const articleKeyValueDensityClasses = {
  compact: {
    list: "divide-y divide-dose-divider",
    row: "gap-3 py-2 text-xs sm:grid-cols-[minmax(7rem,0.7fr)_minmax(0,1.3fr)]",
    label: "theme-text-faint",
    value: "theme-text-secondary",
  },
  comfortable: {
    list: "divide-y divide-dose-divider",
    row: "gap-4 py-3 text-sm sm:grid-cols-[minmax(9rem,0.8fr)_minmax(0,1.2fr)]",
    label: "theme-text-muted",
    value: "theme-text-primary",
  },
} satisfies Record<
  NonNullable<ArticleKeyValueRowsProps["density"]>,
  { label: string; list: string; row: string; value: string }
>;

export function ArticleKeyValueRows({
  className,
  density = "compact",
  emptyState = null,
  rows,
  ...props
}: ArticleKeyValueRowsProps) {
  const visibleRows = rows.filter(
    (row) => row.value !== null && row.value !== undefined && row.value !== "",
  );
  const densityClasses = articleKeyValueDensityClasses[density];

  if (visibleRows.length === 0) {
    return emptyState ? (
      <div className="theme-text-muted text-sm">{emptyState}</div>
    ) : null;
  }

  return (
    <dl className={cn(densityClasses.list, className)} {...props}>
      {visibleRows.map((row, index) => (
        <div
          key={row.key ?? index}
          className={cn("grid sm:items-baseline", densityClasses.row, row.className)}
        >
          <dt
            className={cn(
              "flex min-w-0 items-center gap-1.5 font-medium",
              densityClasses.label,
            )}
          >
            {row.icon ? (
              <Icon icon={row.icon} size={14} className="theme-icon-accent shrink-0" />
            ) : null}
            <span className="min-w-0">{row.label}</span>
          </dt>
          <dd className={cn("min-w-0", densityClasses.value, row.valueClassName)}>
            {row.href ? (
              <a
                href={row.href}
                target="_blank"
                rel="noopener noreferrer"
                className="theme-accent-heading theme-focus-ring break-words transition-opacity hover:opacity-90"
              >
                {row.value}
              </a>
            ) : (
              row.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

type ArticleSectionStateKind = "loading" | "empty" | "error";

export type ArticleSectionStateProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children" | "title"
> & {
  actions?: ReactNode;
  description?: ReactNode;
  icon?: IconName;
  kind?: ArticleSectionStateKind;
  title?: ReactNode;
};

// The consumer renders these through its own `t`: this module has no client
// boundary of its own, so the copy stays a catalog key here and the render
// site passes the translated `title`/`description` (see ReagentSection).
const articleSectionStateDefaults = {
  loading: {
    icon: "lucide:loader-circle",
    title: msg("Loading section"),
    description: msg("Content is being prepared."),
  },
  empty: {
    icon: "lucide:file-search",
    title: msg("No section data"),
    description: msg("This section does not have public content yet."),
  },
  error: {
    icon: "lucide:triangle-alert",
    title: msg("Section unavailable"),
    description: msg("This section could not be displayed."),
  },
} satisfies Record<
  ArticleSectionStateKind,
  { description: string; icon: IconName; title: string }
>;

export function ArticleSectionState({
  actions,
  className,
  description,
  icon,
  kind = "empty",
  title,
  ...props
}: ArticleSectionStateProps) {
  const defaults = articleSectionStateDefaults[kind];

  return (
    <ArticleSubsectionCard
      className={cn(
        "flex items-start gap-3 p-4",
        kind === "error" && "ring-1 ring-rose-400/15",
        className,
      )}
      data-state-kind={kind}
      role={kind === "error" ? "alert" : "status"}
      aria-busy={kind === "loading" || undefined}
      {...props}
    >
      <Icon
        icon={icon ?? defaults.icon}
        size={18}
        className={cn(
          "mt-0.5 shrink-0",
          kind === "loading" && "theme-icon-accent animate-spin",
          kind === "empty" && "theme-icon-muted",
          kind === "error" && "text-[color:var(--theme-semantic-danger-badge-text)]",
        )}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="theme-text-primary text-sm font-semibold">
          {title ?? defaults.title}
        </p>
        {description ?? defaults.description ? (
          <div className="theme-text-secondary text-sm leading-relaxed">
            {description ?? defaults.description}
          </div>
        ) : null}
        {actions ? <div className="pt-2">{actions}</div> : null}
      </div>
    </ArticleSubsectionCard>
  );
}

export type ArticleSourceFooterProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children"
> & {
  align?: "start" | "center" | "end";
  children?: ReactNode;
  source?: ExternalSourcePillProps;
};

const articleSourceFooterAlignClasses = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
} satisfies Record<NonNullable<ArticleSourceFooterProps["align"]>, string>;

export function ArticleSourceFooter({
  align = "end",
  children,
  className,
  source,
  ...props
}: ArticleSourceFooterProps) {
  return (
    <div
      className={cn(
        articleSectionAdornmentClassName,
        "flex",
        articleSourceFooterAlignClasses[align],
        className,
      )}
      {...props}
    >
      {source ? <ExternalSourcePill {...source} /> : children}
    </div>
  );
}

export const ArticleSection = Object.assign(ArticleSectionRoot, {
  Group: ArticleSectionGroup,
  InfoCard: ArticleInfoCard,
  KeyValueRows: ArticleKeyValueRows,
  SourceFooter: ArticleSourceFooter,
  State: ArticleSectionState,
  SubsectionCard: ArticleSubsectionCard,
  SubsectionHeader: ArticleSubsectionHeader,
});
