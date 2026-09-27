import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon, type IconName } from "@/components/common/Icon";
import { TOUCH_HALO_Y } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";

export interface EditorNavOption {
  value: string;
  label: ReactNode;
  icon?: IconName;
  badge?: ReactNode;
  disabled?: boolean;
  controls?: string;
}

/**
 * Below `sm` a switcher is one row that scrolls sideways inside its own box,
 * never a wrapped blob and never wider than the screen. The edge that hides
 * more options fades out, and the selected option is kept in view.
 */
const STRIP_CLASS =
  "flex w-fit max-w-full flex-nowrap items-center overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-x-visible data-[fade=end]:[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] data-[fade=start]:[mask-image:linear-gradient(to_left,black_calc(100%-2rem),transparent)] data-[fade=both]:[mask-image:linear-gradient(to_right,transparent,black_2rem,black_calc(100%-2rem),transparent)]";

type StripFade = "none" | "start" | "end" | "both";

function useScrollStrip(selectedValue: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState<StripFade>("none");

  useLayoutEffect(() => {
    const strip = ref.current;
    if (!strip) return;
    const measure = () => {
      const hidden = strip.scrollWidth - strip.clientWidth;
      const start = strip.scrollLeft > 1;
      const end = hidden > 1 && strip.scrollLeft < hidden - 1;
      setFade(start && end ? "both" : start ? "start" : end ? "end" : "none");
    };
    measure();
    strip.addEventListener("scroll", measure, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(strip);
    return () => {
      strip.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, []);

  // Scroll the strip itself, not the page: scrollIntoView would also move the
  // document vertically.
  useLayoutEffect(() => {
    const strip = ref.current;
    const selected = strip?.querySelector<HTMLElement>("[data-selected]");
    if (!strip || !selected || strip.scrollWidth <= strip.clientWidth) return;
    const box = strip.getBoundingClientRect();
    const option = selected.getBoundingClientRect();
    const left = option.left - box.left + strip.scrollLeft;
    const right = left + option.width;
    if (left < strip.scrollLeft) strip.scrollLeft = left - 16;
    else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth + 16;
  }, [selectedValue]);

  return { ref, fade };
}

export interface EditorNavTabsProps {
  label: string;
  options: EditorNavOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * The WAI-ARIA tabs pattern: one tab in the Tab order (the selected one), and
 * Arrow keys, Home and End move between tabs and select as they go, the same
 * way a click would.
 */
export function EditorNavTabs({
  label,
  options,
  value,
  onChange,
  className,
}: EditorNavTabsProps) {
  const strip = useScrollStrip(value);
  const enabled = options.filter((option) => !option.disabled);
  const selectedEnabled = enabled.some((option) => option.value === value);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const current = enabled.findIndex((option) => option.value === value);
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % enabled.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = current < 0 ? enabled.length - 1 : (current - 1 + enabled.length) % enabled.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = enabled.length - 1;
    if (next === null || enabled.length === 0) return;
    event.preventDefault();
    const target = enabled[next];
    onChange(target.value);
    const tabs = strip.ref.current?.querySelectorAll<HTMLElement>("[data-tab-value]") ?? [];
    Array.from(tabs).find((tab) => tab.dataset.tabValue === target.value)?.focus();
  };

  return (
    <div
      ref={strip.ref}
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      data-fade={strip.fade}
      className={cn(
        STRIP_CLASS,
        "gap-2 rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-1",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        // Roving focus: the selected tab, or the first enabled tab when the
        // value names none, is the one stop in the Tab order.
        const tabStop = selected || (!selectedEnabled && option === enabled[0]);

        return (
          <Button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            data-selected={selected || undefined}
            data-tab-value={option.value}
            tabIndex={tabStop ? 0 : -1}
            onKeyDown={onKeyDown}
            aria-controls={option.controls}
            disabled={option.disabled}
            variant={selected ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "shrink-0 rounded-control",
              selected
                ? "theme-text-primary border-[color:var(--editor-panel-border-strong)] bg-[var(--editor-panel-bg)]"
                : "theme-text-muted",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.icon ? <Icon icon={option.icon} size={15} /> : null}
            <span>{option.label}</span>
            {option.badge ? <Badge variant="secondary">{option.badge}</Badge> : null}
          </Button>
        );
      })}
    </div>
  );
}

export interface EditorSegmentedControlProps {
  label: string;
  options: EditorNavOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function EditorSegmentedControl({
  label,
  options,
  value,
  onChange,
  className,
}: EditorSegmentedControlProps) {
  const strip = useScrollStrip(value);
  return (
    <div
      ref={strip.ref}
      role="group"
      aria-label={label}
      data-fade={strip.fade}
      className={cn(
        STRIP_CLASS,
        "gap-1 rounded-full border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-1",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Button
            key={option.value}
            type="button"
            variant={selected ? "pillActive" : "ghostPill"}
            size="pill"
            aria-pressed={selected}
            data-selected={selected || undefined}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            // A finger still gets 44px through the halo, but the capsule stays
            // one slim row instead of 44px pills inside a 52px frame.
            className={cn(
              "shrink-0 [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:min-h-0",
              TOUCH_HALO_Y,
            )}
          >
            {option.icon ? <Icon icon={option.icon} size={15} /> : null}
            <span>{option.label}</span>
            {option.badge ? <Badge variant="secondary">{option.badge}</Badge> : null}
          </Button>
        );
      })}
    </div>
  );
}
