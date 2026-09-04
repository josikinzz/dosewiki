import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface DirtyGuardCopy {
  title?: string;
  description?: string;
}

const DEFAULT_TITLE = "Discard unsaved changes?";
const DEFAULT_DESCRIPTION =
  "This draft has changes that are not saved. Continue only if you want to discard them.";

/**
 * Stops a draft from being dropped silently. `guard(proceed)` runs `proceed`
 * at once when the editor is clean; when dirty it opens a "Keep editing" /
 * "Discard changes" dialog and only runs `proceed` after the discard button.
 * While dirty, closing or reloading the browser tab also prompts.
 *
 * Wrap every rail row click, group tab, filter, kind toggle and Close that
 * would replace the current draft. Render `dialog` once in the tab.
 */
export function useDirtyGuard(
  isDirty: boolean,
  copy?: DirtyGuardCopy,
): { guard: (proceed: () => void) => void; dialog: ReactNode } {
  const [pending, setPending] = useState<(() => void) | null>(null);
  // Read through a ref so `guard` stays referentially stable for callers that
  // memoise row handlers.
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const guard = useCallback((proceed: () => void) => {
    if (dirtyRef.current) {
      setPending(() => proceed);
    } else {
      proceed();
    }
  }, []);

  const discard = () => {
    const proceed = pending;
    setPending(null);
    proceed?.();
  };

  const dialog = (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) setPending(null);
      }}
    >
      <DialogContent className="max-w-md" showClose={false}>
        <DialogHeader>
          <DialogTitle>{copy?.title ?? DEFAULT_TITLE}</DialogTitle>
          <DialogDescription className="theme-text-muted">
            {copy?.description ?? DEFAULT_DESCRIPTION}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => setPending(null)}>
            Keep editing
          </Button>
          <Button type="button" variant="destructive" onClick={discard}>
            Discard changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { guard, dialog };
}
