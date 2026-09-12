"use client";

import { Fragment, useEffect, useId, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { SessionProvider, useSession } from "next-auth/react";
import { Eye, Pencil, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { canAccessDev, type AppRole } from "@/lib/auth/roles";
import { getEditorLauncherActions } from "./actions";
import type { EditorTarget } from "./context";

type Props = {
  pathname: string;
  target: EditorTarget | undefined;
  outlet: HTMLDivElement | null;
  onIdentityChange: (role: AppRole | null, email: string | null) => void;
  contextualEnabled: boolean;
  mode: "view" | "edit";
  onModeChange: (mode: "view" | "edit") => void;
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable ||
    target.closest('[contenteditable]:not([contenteditable="false"])') !== null
  );
}

function Launcher({ pathname, target, outlet, onIdentityChange, contextualEnabled, mode, onModeChange }: Props) {
  const session = useSession();
  const modeHintId = useId();
  const role = session.status === "authenticated" ? session.data.user?.role : null;
  const eligible = canAccessDev(role);

  // Synchronize the homepage corner before paint, including logout and gate unmount.
  useLayoutEffect(() => {
    onIdentityChange(role, session.data?.user?.email ?? null);
    return () => onIdentityChange(null, null);
  }, [role, session.data?.user?.email, onIdentityChange]);

  useEffect(() => {
    if (!eligible || !contextualEnabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTypingTarget(event.target) ||
        (event.key !== "e" && event.key !== "E")
      ) return;
      event.preventDefault();
      onModeChange(mode === "edit" ? "view" : "edit");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [eligible, contextualEnabled, mode, onModeChange]);

  if (!eligible) return null;
  const actions = getEditorLauncherActions(target, role);
  const menu = (
    <Surface
      variant="card" padding="none" radius="lg"
      data-editor-launcher
      className="fixed right-[max(1rem,env(safe-area-inset-right))] z-30 flex items-center gap-2 p-1 sm:right-[max(1.5rem,env(safe-area-inset-right))]"
      onKeyDown={(event) => event.stopPropagation()}
      style={{ bottom: outlet
        ? "calc(var(--viewer-rail-height, 96px) + 4.5rem + env(safe-area-inset-bottom, 0px))"
        : "max(1rem, env(safe-area-inset-bottom))" }}
    >
      {contextualEnabled ? (
        <div role="group" aria-label="Page editing mode" className="flex gap-1">
          <Button size="icon" variant="ghost" className="theme-selected-control border border-transparent" data-state={mode === "view" ? "active" : "inactive"} aria-label="View" title="View without editing controls" aria-pressed={mode === "view"} onClick={() => onModeChange("view")}><Eye aria-hidden="true" /></Button>
          <Button size="icon" variant="ghost" className="theme-selected-control border border-transparent" data-state={mode === "edit" ? "active" : "inactive"} aria-label="Edit page" aria-pressed={mode === "edit"} aria-describedby={modeHintId} title="Show editing controls on this page. Press E to toggle editing. Nothing is published by switching modes." onClick={() => onModeChange("edit")}><Pencil aria-hidden="true" /></Button>
          <span id={modeHintId} className="sr-only">Show editing controls on this page. Press E to toggle editing. Nothing is published by switching modes.</span>
        </div>
      ) : null}
      <DropdownMenu key={`${pathname}:${target?.kind}:${target && "slug" in target ? target.slug : ""}`}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary" size="icon" aria-label="Open dev tools" title="Dev tools"
          >
            <Wrench aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          container={outlet ?? undefined}
          onKeyDown={(event) => event.stopPropagation()}
          align="end"
          side="top"
          sideOffset={8}
          collisionPadding={16}
          className="w-60 max-w-[calc(100vw-2rem)]"
        >
          <DropdownMenuLabel className="break-words text-dose-text-primary">
            {actions.length > 1 && target?.name ? target.name : "Dev tools"}
          </DropdownMenuLabel>
          {actions.map((action, index) => (
            <Fragment key={action.href}>
              {index > 0 && index === actions.length - 1 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem asChild className="min-h-11">
                <a href={action.href}>{action.label}</a>
              </DropdownMenuItem>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </Surface>
  );
  return outlet ? createPortal(menu, outlet) : menu;
}

/** Loaded only after the editor-host and publication gates, never by a public reader. */
export default function EditorLauncherSession(props: Props) {
  return <SessionProvider refetchInterval={60} refetchOnWindowFocus><Launcher {...props} /></SessionProvider>;
}
