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
  icon?: ReactNode;
  title: string;
  description?: string;
  count?: number;
  badge?: ReactNode;
  defaultExpanded?: boolean;
  hasError?: boolean;
  density?: "default" | "compact";
  pairedIndicator?: boolean;
  keepMounted?: boolean;
  headingLevel?: "h2" | "h3" | "h4";
  iconClassName?: string;
  className?: string;
}

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
  iconClassName,
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
                  hasError ? "theme-danger-text" : iconClassName ?? "theme-icon-accent",
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
