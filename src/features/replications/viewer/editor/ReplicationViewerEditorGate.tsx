"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { SITE_FLAVOR } from "@/config/siteFlavor";
import { readEditorHint } from "@/lib/auth/editorHint";
import { cn } from "@/lib/utils";
import { isEditorHost } from "@server/next/publicConstructionPolicy";
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
export function ReplicationViewerEditorGate(
  props: ReplicationViewerEditorGateProps,
) {
  const [eligible, setEligible] = useState(false);
  const [activated, setActivated] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(min-width: 900px) and (pointer: fine)")
        : null;
    const resolve = () => {
      const hint = readEditorHint();
      const approvedHost =
        isEditorHost(window.location.hostname) ||
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
      setEligible(
        Boolean(
          SITE_FLAVOR === "dosewiki" &&
            approvedHost &&
            media?.matches === true &&
            hint,
        ),
      );
    };
    resolve();
    media?.addEventListener("change", resolve);
    window.addEventListener("storage", resolve);
    return () => {
      media?.removeEventListener("change", resolve);
      window.removeEventListener("storage", resolve);
    };
  }, []);

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

  if (!eligible || !props.collection.editorTarget) return null;

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon"
        title="Edit carousel"
        aria-label="Edit carousel"
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
