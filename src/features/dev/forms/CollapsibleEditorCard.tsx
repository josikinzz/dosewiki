import {
  useEffect,
  useId,
  useState,
  type ReactNode,
  type PropsWithChildren,
} from "react";
import { Icon } from "@/components/common/Icon";
import { ExpandIndicator } from "@/components/common/ExpandButton";
import { EditorStatusPill } from "@/features/dev/components";
import { cn } from "@/lib/utils";

export interface CollapsibleEditorCardProps extends PropsWithChildren {
  /** Accent-tinted leading icon (Lucide / Iconify node). */
  icon?: ReactNode;
  /** Section title, rendered in the accent heading tier. */
  title: string;
  /** Optional helper copy shown under the header once expanded. */
  description?: string;
  /** Optional count chip (e.g. number of entries) shown next to the title. */
  count?: number;
  /** Optional badge node rendered after the title (status, hint, etc.). */
  badge?: ReactNode;
  /** Start expanded. Defaults to collapsed. */
  defaultExpanded?: boolean;
  /** Mark and reveal the section when it contains resolver errors. */
  hasError?: boolean;
  /** Smaller header/body spacing for nested subsections. */
  density?: "default" | "compact";
  /** Use the reading surface's redundant disclosure cue and touch target. */
  pairedIndicator?: boolean;
  /** Preserve local input buffers while the section is collapsed. */
  keepMounted?: boolean;
  /**
   * Heading tag wrapping the disclosure trigger. Defaults to `h3` — these cards
   * sit inside an already-headed editor tab, so `h2` would duplicate that tier.
   */
  headingLevel?: "h2" | "h3" | "h4";
  className?: string;
}

/**
 * Free-floating collapsible section for the dev article forms.
 *
 * Mirrors the public `ArticleSection` / dev `EditorSection` DNA — an accent
 * header row (`.theme-accent-heading` + `theme-icon-accent`) followed by a
 * `--theme-horizontal-divider-image` hairline that fills toward a trailing
 * chevron — with the body flowing directly on the page. No card border, fill,
 * or blur: cards are the exception, and a stack of form sections should read
 * as headed page regions, not a column of identical pills.
 *
 * `density="compact"` is the nested sub-section variant (smaller heading and
 * tighter spacing) for collapsibles inside an already-headed section.
 */
export function CollapsibleEditorCard({
  icon,
  title,
  description,
  count,
  badge,
  hasError = false,
  defaultExpanded = false,
  density = "default",
  pairedIndicator = false,
  keepMounted = false,
  headingLevel: Heading = "h3",
  className,
  children,
}: CollapsibleEditorCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const panelId = `${baseId}-panel`;

  useEffect(() => {
    if (hasError) {
      setIsExpanded(true);
    }
  }, [hasError]);
  const visiblyExpanded = isExpanded || hasError;

  const isCompact = density === "compact";
  const titleSize = isCompact ? "text-sm" : "text-lg";
  const chevronSize = isCompact ? 16 : 20;

  return (
    <div className={className}>
      <Heading className="m-0">
        <button
          type="button"
          id={triggerId}
          onClick={() => setIsExpanded((value) => !value)}
          aria-expanded={visiblyExpanded}
          aria-controls={panelId}
          data-invalid={hasError || undefined}
          className={cn(
            "theme-editor-disclosure-trigger",
            "flex items-center gap-3 rounded-lg px-2 text-left",
            pairedIndicator ? "w-full" : "-mx-2 w-[calc(100%+1rem)]",
            isCompact ? "py-2" : "py-2.5",
            pairedIndicator && "min-h-11",
          )}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            {icon ? (
              <span
                className={cn(
                  "shrink-0",
                  hasError ? "theme-danger-text" : "theme-icon-accent",
                )}
              >
                {icon}
              </span>
            ) : null}
            <span
              className={cn(
                "truncate font-semibold",
                titleSize,
                hasError ? "theme-danger-text" : "theme-accent-heading",
              )}
            >
              {title}
            </span>
            {typeof count === "number" ? (
              <EditorStatusPill tone="neutral" className="shrink-0">
                {count}
              </EditorStatusPill>
            ) : null}
            {hasError ? (
              <EditorStatusPill
                tone="danger"
                icon="lucide:circle-alert"
                className="shrink-0"
              >
                Needs attention
              </EditorStatusPill>
            ) : null}
            {badge ? <span className="shrink-0">{badge}</span> : null}
          </span>
          <span
            aria-hidden
            className="h-px min-w-6 flex-1 bg-[image:var(--theme-horizontal-divider-image)]"
          />
          {pairedIndicator ? (
            <ExpandIndicator isExpanded={visiblyExpanded} className="theme-icon-muted shrink-0" />
          ) : (
            <Icon
              icon={visiblyExpanded ? "lucide:chevron-down" : "lucide:chevron-right"}
              size={chevronSize}
              className="theme-icon-muted shrink-0"
            />
          )}
        </button>
      </Heading>
      {visiblyExpanded || keepMounted ? (
        <div
          id={panelId}
          hidden={!visiblyExpanded}
          role="region"
          aria-labelledby={triggerId}
          className={cn(isCompact ? "space-y-4 pt-3" : "space-y-6 pt-4")}
        >
          {description ? (
            <p className="theme-text-muted -mt-1 text-sm leading-5">{description}</p>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
