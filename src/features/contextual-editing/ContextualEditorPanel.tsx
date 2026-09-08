"use client";

import { useContext, useRef, type ReactNode, type RefObject } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ContextualEditorContainerContext } from "./context";

export function ContextualEditorPanel({
  title, description, children, open, onOpenChange, returnFocusRef,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const container = useContext(ContextualEditorContainerContext);
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        container={container ?? undefined}
        className="inset-0 flex max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden rounded-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)] sm:max-w-4xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6 [&>button]:h-9 [&>button]:w-9 [@media(pointer:coarse)]:[&_button]:min-h-11 [@media(pointer:coarse)]:[&_button]:min-w-11"
        onOpenAutoFocus={() => {
          returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current ?? returnFocus.current;
          if (target?.isConnected) {
            event.preventDefault();
            target.focus({ preventScroll: true });
          }
        }}
        onEscapeKeyDown={(event) => {
          if (event.target instanceof Element && event.target.closest('[role="combobox"][aria-expanded="true"]')) {
            event.preventDefault();
          }
        }}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <DialogHeader className="min-w-0 shrink-0 pr-12 text-left [overflow-wrap:anywhere]">
          <DialogTitle className="leading-snug">{title}</DialogTitle>
          <DialogDescription>{description ?? "Changes stay private until you explicitly publish or submit them for review."}</DialogDescription>
        </DialogHeader>
        <div className="-m-1 min-h-0 min-w-0 space-y-4 overflow-y-auto p-1">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
