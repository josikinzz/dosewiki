"use client";

import { useEffect, useRef } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui";
import { Surface } from "@/components/ui/surface";
import { setThemeLabOpen, useThemeLabOpen } from "@/features/theme-lab/themeLabStore";

/**
 * The protected developer workbench for Theme Lab.
 *
 * Theme Lab itself is mounted globally and opens from every DoseWiki
 * appearance panel. This route adds implementation notes and a full-size reopen
 * action for editors; entering it opens the same global drawer.
 *
 * The workbench leaves color scheme, visual style, surface, and accent alone.
 * Changes remain the reader's own choices exactly as they do on every page.
 */
export function ThemeLabWorkbench() {
  const open = useThemeLabOpen();
  const reopenRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    // This route always intends to open Theme Lab. Start both independent
    // chunks together; ThemeLabLazy still withholds the panel until the runtime
    // has restored persisted state and reported readiness.
    void Promise.allSettled([
      import("@/features/theme-lab/ThemeLabRuntimeMount"),
      import("@/features/theme-lab/ThemeLab"),
    ]);
    setThemeLabOpen(true);
  }, []);

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
          <h1 className="text-2xl font-semibold text-dose-text">Theme Lab</h1>
          <p className="text-sm text-dose-text-secondary">
            Recolor the site live — the Fun palette or Pro’s accent seeds — and save it to this
            browser.
          </p>
        </header>

        <Surface variant="subtle" padding="md" radius="lg" className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-dose-text-muted">
            Scope
          </h2>
          <p className="text-sm text-dose-text-secondary">
            The lab edits custom properties, in whichever style you are wearing.{" "}
            <strong className="font-semibold text-dose-text">Fun</strong>’s palette and{" "}
            <strong className="font-semibold text-dose-text">Pro</strong>’s{" "}
            <code className="text-dose-accent-strong">--ei-*</code> accent seeds are both editable:
            what the lab injects out-specifies every stylesheet, the generated accent blocks
            included, so an edit lands on the page in front of you either way.
          </p>
          <p className="text-sm text-dose-text-secondary">
            Pro’s structure — its typography, geometry and selectors — stays authored in{" "}
            <code className="text-dose-accent-strong">src/styles/pro-theme.css</code>, and an
            accent’s shipped seeds in{" "}
            <code className="text-dose-accent-strong">src/theme/accents.ts</code>. The lab writes
            neither file; use Share → accent entry to copy a tuned accent back out.
          </p>
          <p className="text-sm text-dose-text-secondary">
            Day, night, Fun, Pro and the accent all stay switchable while you work — the lab edits
            whichever combination you are looking at, and leaves your choice alone when you go.
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
              aria-controls="theme-lab-panel"
              onClick={() => setThemeLabOpen(true, reopenRef.current)}
            >
              <Icon icon="ri:wrench-line" size={16} />
              Open Theme Lab
            </Button>
          </div>
        )}
      </div>

    </div>
  );
}
