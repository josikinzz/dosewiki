"use client";

import {
  useMemo,
  useId,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { articleSectionAdornmentClassName } from "./articleSectionLayout";

export type ExpandableListState<T> = {
  hiddenCount: number;
  isExpanded: boolean;
  items: readonly T[];
  toggle: () => void;
};

type ExpandableListToggleState = {
  hiddenCount: number;
  isExpanded: boolean;
};

type StatefulToggleValue<T> = T | ((state: ExpandableListToggleState) => T);

export type ExpandableListProps<T> = {
  ariaLabelBase: string;
  children?: (state: ExpandableListState<T>) => ReactNode;
  className?: string;
  collapsedCount?: number;
  collapsedToggleContent?: StatefulToggleValue<ReactNode>;
  defaultExpanded?: boolean;
  hasCollapsedItems?: boolean;
  hideToggleWhenExpanded?: boolean;
  id?: string;
  itemClassName?: string;
  items: readonly T[];
  listClassName?: string;
  listType?: "ol" | "ul";
  renderItem?: (item: T, index: number, state: ExpandableListState<T>) => ReactNode;
  toggleAdornment?: boolean;
  toggleButtonClassName?: StatefulToggleValue<string | undefined>;
  toggleClassName?: string;
  visibleItems?: readonly T[];
};

function getCollapsedItems<T>(
  items: readonly T[],
  visibleItems: readonly T[] | undefined,
  collapsedCount: number,
) {
  if (visibleItems) return visibleItems;
  if (collapsedCount <= 0) return items;
  return items.slice(0, Math.max(items.length - collapsedCount, 0));
}

export function ExpandableList<T>({
  ariaLabelBase,
  children,
  className,
  collapsedCount,
  collapsedToggleContent,
  defaultExpanded = false,
  hasCollapsedItems,
  hideToggleWhenExpanded = false,
  id,
  itemClassName,
  items,
  listClassName,
  listType = "ol",
  renderItem,
  toggleAdornment = false,
  toggleButtonClassName,
  toggleClassName,
  visibleItems,
}: ExpandableListProps<T>) {
  const t = useT();
  const generatedId = useId();
  const panelId = id ?? `expandable-list-${generatedId.replace(/:/g, "")}`;
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const toggle = () => setIsExpanded((expanded) => !expanded);
  const hiddenCount = useMemo(() => {
    if (typeof collapsedCount === "number") return Math.max(collapsedCount, 0);
    if (visibleItems) return Math.max(items.length - visibleItems.length, 0);
    return 0;
  }, [collapsedCount, items.length, visibleItems]);
  const canExpand = hasCollapsedItems ?? hiddenCount > 0;
  const shouldRenderToggle = canExpand && (!isExpanded || !hideToggleWhenExpanded);
  const collapsedItems = getCollapsedItems(items, visibleItems, hiddenCount);
  const renderedItems = isExpanded ? items : collapsedItems;
  const state = {
    hiddenCount,
    isExpanded,
    items: renderedItems,
    toggle,
  } satisfies ExpandableListState<T>;
  const toggleState = { hiddenCount, isExpanded } satisfies ExpandableListToggleState;
  const resolvedToggleButtonClassName =
    typeof toggleButtonClassName === "function"
      ? toggleButtonClassName(toggleState)
      : toggleButtonClassName;
  const resolvedCollapsedToggleContent =
    !isExpanded && collapsedToggleContent != null
      ? typeof collapsedToggleContent === "function"
        ? collapsedToggleContent(toggleState)
        : collapsedToggleContent
      : null;
  const List = listType;

  return (
    <div className={cn("space-y-3", className)} data-expanded={isExpanded}>
      <div id={panelId}>
        {children ? (
          children(state)
        ) : renderItem ? (
          <List className={cn("space-y-2", listClassName)}>
            {renderedItems.map((item, index) => (
              <li
                key={index}
                className={cn(
                  isExpanded && !defaultExpanded && !collapsedItems.includes(item) && "theme-reveal-enter",
                  itemClassName,
                )}
              >
                {renderItem(item, index, state)}
              </li>
            ))}
          </List>
        ) : null}
      </div>

      {shouldRenderToggle ? (
        <div
          className={cn(
            "flex justify-center",
            toggleAdornment ? articleSectionAdornmentClassName : "mt-3",
            toggleClassName,
          )}
        >
          <ExpandButton
            isExpanded={isExpanded}
            onToggle={toggle}
            variant="count"
            count={hiddenCount}
            className={resolvedToggleButtonClassName}
            ariaLabel={
              isExpanded
                ? t("Collapse {{base}}", { base: ariaLabelBase })
                : t("Expand {{base}}", { base: ariaLabelBase })
            }
            ariaControls={panelId}
          >
            {resolvedCollapsedToggleContent}
          </ExpandButton>
        </div>
      ) : null}
    </div>
  );
}

export type ExpandableTextProps = {
  ariaLabelBase: string;
  buttonClassName?: string;
  children: ReactNode;
  className?: string;
  collapsedClassName?: string;
  contentClassName?: string;
  defaultExpanded?: boolean;
  id?: string;
  maxLines?: number;
  toggleClassName?: string;
};

type LineClampStyle = CSSProperties & {
  WebkitBoxOrient?: "vertical";
  WebkitLineClamp?: number;
};

export function ExpandableText({
  ariaLabelBase,
  buttonClassName,
  children,
  className,
  collapsedClassName,
  contentClassName,
  defaultExpanded = false,
  id,
  maxLines = 4,
  toggleClassName,
}: ExpandableTextProps) {
  const t = useT();
  const generatedId = useId();
  const panelId = id ?? `expandable-text-${generatedId.replace(/:/g, "")}`;
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const collapsedStyle: LineClampStyle | undefined = isExpanded
    ? undefined
    : {
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: maxLines,
        display: "-webkit-box",
        overflow: "hidden",
      };

  return (
    <div className={cn("space-y-2", className)} data-expanded={isExpanded}>
      <div
        id={panelId}
        className={cn(
          "theme-text-secondary text-sm leading-relaxed",
          !isExpanded && collapsedClassName,
          contentClassName,
        )}
        data-expanded={isExpanded}
        style={collapsedStyle}
      >
        {children}
      </div>
      <div className={cn("flex justify-start", toggleClassName)}>
        <ExpandButton
          isExpanded={isExpanded}
          onToggle={() => setIsExpanded((expanded) => !expanded)}
          className={buttonClassName}
          ariaLabel={
            isExpanded
              ? t("Collapse {{base}}", { base: ariaLabelBase })
              : t("Expand {{base}}", { base: ariaLabelBase })
          }
          ariaControls={panelId}
        />
      </div>
    </div>
  );
}
