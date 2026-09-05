"use client";

import { Fragment, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { SessionProvider, useSession } from "next-auth/react";
import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { canAccessDev } from "@/lib/auth/roles";
import { getEditorLauncherActions } from "./actions";
import type { EditorTarget } from "./context";

type Props = {
  pathname: string;
  target: EditorTarget | undefined;
  outlet: HTMLDivElement | null;
  onEligibilityChange: (eligible: boolean) => void;
};

function Launcher({ pathname, target, outlet, onEligibilityChange }: Props) {
  const session = useSession();
  const role = session.status === "authenticated" ? session.data.user?.role : null;
  const eligible = canAccessDev(role);

  // Synchronize the homepage corner before paint, including logout and gate unmount.
  useLayoutEffect(() => {
    onEligibilityChange(eligible);
    return () => onEligibilityChange(false);
  }, [eligible, onEligibilityChange]);

  if (!eligible) return null;
  const actions = getEditorLauncherActions(target, role);
  const menu = (
    <div
      className="fixed right-[max(1rem,env(safe-area-inset-right))] z-30 sm:right-[max(1.5rem,env(safe-area-inset-right))]"
      style={{ bottom: outlet
        ? "calc(var(--viewer-rail-height, 96px) + 4.5rem + env(safe-area-inset-bottom, 0px))"
        : "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <DropdownMenu key={`${pathname}:${target?.kind}:${target && "slug" in target ? target.slug : ""}`}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary" size="icon" aria-label="Open dev tools" title="Dev tools"
            onKeyDown={(event) => event.stopPropagation()}
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
          {target?.name ? <DropdownMenuLabel className="break-words text-dose-text-primary">{target.name}</DropdownMenuLabel> : null}
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
    </div>
  );
  return outlet ? createPortal(menu, outlet) : menu;
}

/** Loaded only after the editor-host and publication gates, never by a public reader. */
export default function EditorLauncherSession(props: Props) {
  return <SessionProvider><Launcher {...props} /></SessionProvider>;
}
