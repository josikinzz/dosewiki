"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusState } from "@/components/ui/surface";
import { useT } from "@/i18n/client";
import type { ReplicationViewerOverlayProps } from "../viewer/ReplicationViewerOverlay";

type ViewerComponent = ComponentType<ReplicationViewerOverlayProps>;

export type LazyReplicationViewerOverlayProps = ReplicationViewerOverlayProps & {
  resolveCollection?: () => Promise<ReplicationViewerOverlayProps["collection"]>;
};

export function LazyReplicationViewerOverlay(
  props: LazyReplicationViewerOverlayProps,
) {
  const {
    open,
    onOpenChange,
    resolveCollection,
    collectionPending,
    ...viewerProps
  } = props;
  const t = useT();
  const openerRef = useRef<HTMLElement | null>(null);
  const [Viewer, setViewer] = useState<ViewerComponent | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [resolvedCollection, setResolvedCollection] = useState<ReplicationViewerOverlayProps["collection"] | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const activeElement = document.activeElement;
    openerRef.current =
      activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : null;

    return () => {
      const opener = openerRef.current;
      openerRef.current = null;
      if (!opener?.isConnected) return;
      window.requestAnimationFrame(() => {
        if (opener.isConnected) opener.focus({ preventScroll: true });
      });
    };
  }, [open]);

  useEffect(() => {
    if (!open || (Viewer && (!resolveCollection || resolvedCollection))) return;
    let current = true;
    setLoadError(false);
    void Promise.all([
      import("../viewer/ReplicationViewerOverlay"),
      resolveCollection ? resolveCollection() : Promise.resolve(null),
    ]).then(([module, collection]) => {
      if (!current) return;
      setResolvedCollection(collection);
      setViewer(() => module.ReplicationViewerOverlay);
    }).catch(() => {
      if (current) setLoadError(true);
    });
    return () => {
      current = false;
    };
  }, [loadAttempt, open, Viewer, resolveCollection, resolvedCollection]);

  const retry = useCallback(() => {
    setLoadError(false);
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  if (!open) return null;
  if (Viewer && (!resolveCollection || resolvedCollection)) {
    const collection = resolvedCollection ?? props.collection;
    if (collection.groups.some((group) => group.items.some((item) => item.replication.slug === props.initialSlug))) {
      return (
        <Viewer
          {...viewerProps}
          collection={collection}
          collectionPending={collectionPending}
          open={open}
          onOpenChange={onOpenChange}
        />
      );
    }
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent showClose={false}>
          <DialogHeader>
            <DialogTitle>{t("Replication viewer")}</DialogTitle>
            <DialogDescription>{t("The linked replication is no longer available in this collection.")}</DialogDescription>
          </DialogHeader>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("Close")}</Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent aria-modal="true" showClose>
        <DialogHeader>
          <DialogTitle>{t("Replication viewer")}</DialogTitle>
          <DialogDescription>
            {loadError
              ? t("The replication viewer could not be loaded.")
              : t("Loading replication viewer…")}
          </DialogDescription>
        </DialogHeader>
        <StatusState
          role={loadError ? "alert" : "status"}
          tone={loadError ? "danger" : "neutral"}
          padding="md"
          radius="lg"
        >
          {loadError
            ? t("Check your connection, then try again or close the viewer.")
            : t("Loading the selected work…")}
        </StatusState>
        {loadError ? (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("Close")}
            </Button>
            <Button type="button" onClick={retry}>
              {t("Try again")}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
