"use client";

import type { ReactNode } from "react";
import { Badge, Button, Input, Textarea } from "@/components/ui";
import { TOUCH_ICON, TOUCH_PILL } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/common/Icon";
import styles from "./ThemeLab.module.css";

/**
 * The Theme Lab's controls, sourced from the shared UI Kit.
 *
 * The panel used to hand-roll its own buttons, inputs, textareas, badges and
 * tabs in its private stylesheet, at sizes tuned by hand for a 23.5rem sidebar.
 * That is where its historical touch-target and micro-text drift came from: the
 * kit's catalog gate keeps shared primitives *documented*, not *used*.
 *
 * Everything here is a thin density wrapper over a kit primitive — the kit owns
 * the look, the focus ring, the disabled treatment and the transition; these
 * wrappers only carry the panel's density (a dense sidebar) and, on coarse
 * pointers, the 44px touch floor. Nothing here re-styles a control.
 *
 * They live beside the panel rather than in the shared kit because they are one
 * feature's density recipes, not primitives with multiple consumers (see the
 * promotion criteria in docs/design/ui-kit.md).
 */

/**
 * The site's canonical "this view is selected" pill
 * (`theme-selected-control`), shared with public segmented tabs and keyed off
 * `data-state`. Reuse lets panel tabs and chips drop bespoke active styling.
 */
const ROUTE_TAB = "theme-selected-control border border-transparent";

/**
 * Icon sizes, restated at the button.
 *
 * The kit's `Button` base carries `[&_svg]:size-4`. That is a *declaration* on
 * a descendant selector, so it outranks the `width`/`height` presentation
 * attributes `Icon` writes onto its `<svg>`: any icon dropped into a kit Button
 * is silently forced to 16px. The kit itself works around this — its `quiet`
 * size ships `[&_svg]:size-[15px]` — and so must every wrapper here, or the
 * panel's 10–15px glyphs all inflate (the worst being the changed mark, a 10px
 * pencil inside an 18px ring, which at 16px fills the ring edge to edge).
 *
 * Each wrapper below declares the size its own call sites author. A call site
 * that authors a different one passes its entry from this map; `cn` merges it
 * over the wrapper's default. Keep these literal — Tailwind only extracts class
 * names it can see in the source.
 */
export const PANEL_ICON = {
  10: "[&_svg]:size-[10px]",
  13: "[&_svg]:size-[13px]",
  14: "[&_svg]:size-[14px]",
  15: "[&_svg]:size-[15px]",
  16: "[&_svg]:size-[16px]",
} as const;

interface ToggleProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
  title?: string;
}

/**
 * A one-of-N selector rendered as a pressable button rather than a Radix tab:
 * the panel's views are a toolbar of toggles (each announces `aria-pressed`),
 * not a tablist that owns roving focus over panels.
 */
export function PanelTab({ active, onClick, children, className, ...rest }: ToggleProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="auto"
      data-state={active ? "active" : "inactive"}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        ROUTE_TAB,
        TOUCH_PILL,
        "min-h-8 flex-1 whitespace-nowrap rounded-lg px-1.5 py-1.5 text-xs font-semibold",
        className,
      )}
      {...rest}
    >
      {children}
    </Button>
  );
}

/** The flatness axes' step chips: the same selected-pill recipe, pill-shaped. */
export function PanelChip({ active, onClick, children, className, ...rest }: ToggleProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="auto"
      data-state={active ? "active" : "inactive"}
      aria-pressed={active}
      onClick={onClick}
      className={cn(ROUTE_TAB, TOUCH_PILL, PANEL_ICON[15], "min-h-8 rounded-full px-3.5 py-1.5", className)}
      {...rest}
    >
      {children}
    </Button>
  );
}

interface IconButtonProps {
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  className?: string;
  "aria-label": string;
  "aria-pressed"?: boolean;
  title?: string;
}

/** Header actions (eyedropper, close) and the drawer's revert affordance. */
export function PanelIconButton({ onClick, children, active, className, ...rest }: IconButtonProps) {
  return (
    <Button
      type="button"
      variant={active ? "pillActive" : "ghostPill"}
      size="auto"
      onClick={onClick}
      className={cn(
        "h-[1.875rem] w-[1.875rem] shrink-0 p-0",
        TOUCH_ICON,
        PANEL_ICON[15],
        // pillActive names a border colour but no width; the kit's other
        // pill pairs do the same, so the width comes from the call site.
        active && "border",
        className,
      )}
      {...rest}
    >
      {children}
    </Button>
  );
}

/**
 * A catalog row: swatch, label, value, changed mark. Ghost by default so a long
 * list stays flat, wearing the selected pill when it is the row being edited.
 */
export function PanelRow({
  active,
  inert,
  onClick,
  children,
}: {
  active: boolean;
  inert?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="auto"
      data-state={active ? "active" : "inactive"}
      onClick={onClick}
      className={cn(
        ROUTE_TAB,
        TOUCH_PILL,
        // The row's only glyph is the changed mark's 10px pencil.
        PANEL_ICON[10],
        "w-full min-h-8 justify-start gap-2 rounded-lg px-1.5 py-1 text-left",
        inert && "opacity-60 hover:opacity-100",
      )}
    >
      {children}
    </Button>
  );
}

/** Compact inline status badges (raw, ×N shared, theme scope). */
export function PanelBadge({
  variant,
  className,
  children,
  title,
}: {
  variant?: "default" | "secondary" | "outline" | "destructive" | "success";
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    // asChild: these badges sit inside button rows and labels, where a block
    // element would be invalid phrasing content.
    <Badge
      asChild
      variant={variant}
      title={title}
      className={cn(
        "shrink-0 px-1.5 py-0 text-[0.6875rem] font-semibold tracking-normal normal-case",
        className,
      )}
    >
      <span>{children}</span>
    </Badge>
  );
}

/** Text field (hex, filter). Kit sizing; `sm` is already a 40px target. */
export function PanelInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return <Input inputSize="sm" className={cn("[@media(pointer:coarse)]:text-base", className)} {...props} />;
}

/** Code-ish console fields (raw CSS value, JSON export/import). */
export function PanelTextarea({ className, ...props }: React.ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      textareaSize="sm"
      spellCheck={false}
      className={cn("resize-y font-mono text-xs leading-relaxed", className)}
      {...props}
    />
  );
}

/**
 * The foot's disclosure bars (Share, Advanced): one full-width toggle wearing a
 * label, a hint of what is behind it, and a caret that turns when its drawer is
 * open. Share and Advanced used to carry byte-identical copies of this markup;
 * one component is what keeps the two drawers reading as a single stack.
 */
export function PanelDisclosure({
  label,
  hint,
  open,
  controls,
  onToggle,
}: {
  label: string;
  hint: string;
  open: boolean;
  /** id of the drawer this bar reveals, for `aria-controls`. */
  controls: string;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="auto"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className={cn(
        TOUCH_PILL,
        PANEL_ICON[14],
        "w-full min-h-8 justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left",
      )}
    >
      <span className={styles.advancedToggleText}>
        <span className={styles.advancedToggleLabel}>{label}</span>
        <span className={styles.advancedToggleHint}>{hint}</span>
      </span>
      <Icon
        icon="lucide:chevron-right"
        size={14}
        className={cn(styles.advancedCaret, open && styles.advancedCaretOpen)}
      />
    </Button>
  );
}

/** Panel-width action buttons (copy, apply, reset, danger). */
export function PanelButton({
  variant = "default",
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant={variant}
      size="auto"
      className={cn(
        TOUCH_PILL,
        PANEL_ICON[14],
        "min-h-8 gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold",
        className,
      )}
      {...props}
    />
  );
}
