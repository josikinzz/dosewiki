"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  closeReplicationViewerUrl,
  parseReplicationViewerSlug,
} from "../galleryUrlState";
import type { ReplicationViewerCollection } from "../viewer/viewerModel";
import { LazyReplicationViewerOverlay } from "./LazyReplicationViewerOverlay";

type GalleryViewerRegistration = {
  collection: ReplicationViewerCollection;
  slug: string | null;
  collectionPending: boolean;
  onClose?: () => void;
  onRegroup?: (grouping: "artist" | "effect", slug: string) => void;
};

type GalleryViewerHostValue = {
  register: (registration: GalleryViewerRegistration) => void;
};

const GalleryViewerHostContext = createContext<GalleryViewerHostValue | null>(null);

export function GalleryViewerHost({
  initialCollection,
  initialSlug,
  children,
}: {
  initialCollection: ReplicationViewerCollection | null;
  initialSlug: string | null;
  children: ReactNode;
}) {
  const [registration, setRegistration] = useState<GalleryViewerRegistration | null>(
    initialCollection && initialSlug
      ? {
          collection: initialCollection,
          slug: initialSlug,
          collectionPending: true,
        }
      : null,
  );
  const register = useCallback((next: GalleryViewerRegistration) => {
    setRegistration((current) => {
      if (next.collectionPending && current?.slug) {
        return {
          ...current,
          collectionPending: true,
          onClose: next.onClose,
          onRegroup: next.onRegroup,
        };
      }
      const urlSlug = parseReplicationViewerSlug(
        new URLSearchParams(window.location.search),
      );
      if (
        urlSlug !== next.slug &&
        (!next.collectionPending || next.slug !== null)
      ) {
        return current;
      }
      return next;
    });
  }, []);
  const value = useMemo(() => ({ register }), [register]);
  const close = useCallback(() => {
    registration?.onClose?.();
    if (!registration?.onClose) {
      const source = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", closeReplicationViewerUrl(source));
    }
    setRegistration((current) => current ? { ...current, slug: null } : current);
  }, [registration]);

  return (
    <GalleryViewerHostContext.Provider value={value}>
      {children}
      {registration?.slug ? (
        <LazyReplicationViewerOverlay
          collection={registration.collection}
          initialSlug={registration.slug}
          collectionPending={registration.collectionPending}
          open
          onOpenChange={(open) => { if (!open) close(); }}
          onRegroup={registration.onRegroup}
        />
      ) : null}
    </GalleryViewerHostContext.Provider>
  );
}
export function useGalleryViewerHost(registration: GalleryViewerRegistration) {
  const host = useContext(GalleryViewerHostContext);
  useEffect(() => {
    host?.register(registration);
  }, [host, registration]);
  return host;
}
