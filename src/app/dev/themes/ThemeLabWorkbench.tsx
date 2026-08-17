"use client";

import { useEffect, useRef } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui";
import { Surface } from "@/components/ui/surface";
import { useTheme } from "@/context/ThemeContext";
import { PaletteLabLazy } from "@/features/theme-lab/PaletteLabLazy";
import { setPaletteLabOpen, usePaletteLabOpen } from "@/features/theme-lab/paletteLabStore";
import type { VisualStyle } from "@/theme";

/**
 * The Palette Lab's only entry point.
 *
 * The editor used to be a global mount with triggers in the footer and on the
 * homepage; it now belongs to this protected route alone, which is why the open
 * state is owned here rather than by the mount. Entering the route opens the
 * editor, closing it leaves the route-local action below, and leaving the route
 * releases both the open state and the runtime that paints the saved palette.
 *
 * The route also holds the page in the Fun style while it is mounted. Pro's
 * presentation selectors out-specify the palette layer the lab writes, so an
 * edit made under Pro would look like it did nothing at all. The style the
 * reader arrived with is handed back on the way out.
 */
export function ThemeLabWorkbench() {
  const open = usePaletteLabOpen();
  const { visualStyle, setVisualStyle } = useTheme();
  const reopenRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  // Captured before the effect below forces Fun, so leaving the route restores
  // the reader's own preference rather than pinning them to the lab's.
  const styleOnEntry = useRef<VisualStyle | null>(null);
  styleOnEntry.current ??= visualStyle;

  useEffect(() => {
    setPaletteLabOpen(true);
  }, []);

  useEffect(() => {
    if (visualStyle !== "fun") setVisualStyle("fun");
  }, [setVisualStyle, visualStyle]);

  useEffect(
    () => () => {
      const previous = styleOnEntry.current;
      if (previous && previous !== "fun") setVisualStyle(previous);
    },
    [setVisualStyle],
  );

  // Closing the panel must not drop focus on the body: the action that reopens
  // it renders in the same commit, so it is the natural place to land.
  useEffect(() => {
    if (wasOpen.current && !open) reopenRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  return (
    <div className="min-h-screen bg-dose-body text-dose-text">
      <div className="mx-auto flex w-full max-w-[68ch] flex-col gap-8 px-4 py-10 sm:px-8">
        <header className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold text-dose-text">Palette Lab</h1>
          <p className="text-sm text-dose-text-secondary">
            Recolor the Fun palette live and save it to this browser.
          </p>
        </header>

        <Surface variant="subtle" padding="md" radius="lg" className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-dose-text-muted">
            Scope
          </h2>
          <p className="text-sm text-dose-text-secondary">
            The lab edits the <strong className="font-semibold text-dose-text">Fun</strong> palette
            only. <strong className="font-semibold text-dose-text">Pro</strong> is the official,
            separate visual style; it is authored in{" "}
            <code className="text-dose-accent-strong">src/styles/pro-theme.css</code> and its
            selectors out-specify anything saved here.
          </p>
          <p className="text-sm text-dose-text-secondary">
            This route holds the page in Fun while you work and restores your style when you leave.
            Day and night stay switchable — the lab edits whichever scheme you are viewing.
          </p>
          <p className="text-sm text-dose-text-secondary">
            A saved palette lives in this browser and paints here, not on the public site.
          </p>
        </Surface>

        {open ? (
          <p className="text-sm text-dose-text-muted">
            The editor is docked to the right of this page, and to the bottom on a narrow screen.
          </p>
        ) : (
          <div>
            <Button
              ref={reopenRef}
              type="button"
              variant="accent"
              size="lg"
              aria-haspopup="dialog"
              aria-controls="palette-lab-panel"
              onClick={() => setPaletteLabOpen(true, reopenRef.current)}
            >
              <Icon icon="lucide:palette" size={16} />
              Open Theme Lab
            </Button>
          </div>
        )}
      </div>

      <PaletteLabLazy />
    </div>
  );
}
