"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { useContextualEditing } from "@/features/contextual-editing/context";
import { roleMeetsFloor } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import type { ReplicationViewerCollection } from "../viewerModel";

// Deliberate chunk boundary: the public viewer must never eagerly receive editor code.
const LazyEditorPanel = lazy(async () => {
  const module = await import("./ReplicationViewerEditorPanel");
  return { default: module.ReplicationViewerEditorPanel };
});

export interface ReplicationViewerEditorGateProps {
  collection: ReplicationViewerCollection;
  activeSlug: string;
  panelHost: HTMLElement | null;
  railHost: HTMLElement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReorderModeChange: (active: boolean) => void;
  onActivateSlug: (slug: string) => void;
  onOrderChange: (slugs: readonly string[]) => void;
}

function EditorPanelSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-label="Loading carousel editor" aria-busy="true">
      <div className="border-b theme-media-thumbnail-border p-5">
        <div className="h-3 w-24 animate-pulse rounded theme-media-control-raised motion-reduce:animate-none" />
        <div className="mt-3 h-5 w-48 animate-pulse rounded theme-media-control-raised motion-reduce:animate-none" />
      </div>
      <div className="space-y-7 p-5">
        {[0, 1, 2].map((item) => (
          <div key={item} className="space-y-3">
            <div className="h-3 w-28 animate-pulse rounded theme-media-control-raised motion-reduce:animate-none" />
            <div className="h-11 animate-pulse rounded-xl theme-media-control-raised motion-reduce:animate-none" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Hydration-safe eligibility gate. Editor data and code stay absent until opened. */
export default function ReplicationViewerEditorGate(
  props: ReplicationViewerEditorGateProps,
) {
  const editing = useContextualEditing();
  const eligible = editing.enabled && editing.mode === "edit" && roleMeetsFloor(editing.role, "contributor");
  const [activated, setActivated] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);


  useEffect(() => {
    if (!eligible && props.open) props.onOpenChange(false);
  }, [eligible, props.onOpenChange, props.open]);

  useEffect(() => {
    if (wasOpenRef.current && !props.open) {
      window.requestAnimationFrame(() =>
        triggerRef.current?.focus({ preventScroll: true }),
      );
    }
    wasOpenRef.current = props.open;
  }, [props.open]);

  if (!eligible) return null;

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon"
        title="Edit replication or collection"
        aria-label="Edit replication or collection"
        aria-pressed={props.open}
        onClick={() => {
          setActivated(true);
          props.onOpenChange(!props.open);
        }}
        className={cn(
          "theme-media-control-soft rounded-full theme-media-tile-creator hover:opacity-100",
          props.open && "theme-accent-emphasis theme-accent-emphasis",
        )}
      >
        <Icon icon="lucide:pencil" className="size-5" aria-hidden />
      </Button>

      {activated ? (
        <Suspense
          fallback={
            props.open && props.panelHost
              ? createPortal(<EditorPanelSkeleton />, props.panelHost)
              : null
          }
        >
          <LazyEditorPanel {...props} />
        </Suspense>
      ) : null}
    </>
  );
}
