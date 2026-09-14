"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { useT, useUiLocale } from "@/i18n/client";
import { publicHref } from "@/utils/publicHref";
import {
  buildReplicationViewerUrl,
  closeReplicationViewerUrl,
  parseReplicationViewerSlug,
} from "@/features/replications/galleryUrlState";
import { dismissViewerDeepLinkCover } from "@/features/replications/ViewerDeepLinkCover";
import {
  viewerItemFromShowcaseWork,
  type ReplicationViewerCollection,
} from "@/features/replications/viewer/viewerModel";
import type { ShowcaseWork } from "./showcaseWork";

export interface ReplicationShowcaseController {
  sourcePath: string;
  onOpenWork: (slug: string) => void;
  viewerOpen?: boolean;
}

interface UseShowcaseViewerControllerOptions {
  works: readonly ShowcaseWork[];
  collectionWorks: readonly ShowcaseWork[];
  collectionSource?: { kind: "substance" | "effect"; slug: string };
  substanceSlug?: string;
  effectSlug?: string;
  collectionLabel?: string;
  controller?: ReplicationShowcaseController;
}

export function useShowcaseViewerController({
  works,
  collectionWorks,
  collectionSource,
  substanceSlug,
  effectSlug,
  collectionLabel,
  controller,
}: UseShowcaseViewerControllerOptions) {
  const t = useT();
  const uiLocale = useUiLocale();
  const [viewerSlug, setViewerSlug] = useState<string | null>(null);
  const [unavailableViewerSlug, setUnavailableViewerSlug] = useState<
    string | null
  >(null);
  const [remoteCollection, setRemoteCollection] = useState<
    ShowcaseWork[] | null
  >(null);
  const [remoteCollectionFailed, setRemoteCollectionFailed] = useState(false);
  const remoteCollectionRequestedRef = useRef(false);
  const collectionSourceKind = collectionSource?.kind;
  const collectionSourceSlug = collectionSource?.slug;

  const fetchRemoteCollection = useCallback(() => {
    if (
      !collectionSourceKind ||
      !collectionSourceSlug ||
      remoteCollectionRequestedRef.current
    ) {
      return;
    }
    remoteCollectionRequestedRef.current = true;
    void fetch(
      `/api/replications/showcase?${collectionSourceKind}=${encodeURIComponent(collectionSourceSlug)}${
        uiLocale === "en" ? "" : `&locale=${uiLocale}`
      }`,
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Showcase collection read failed: ${response.status}`,
          );
        }
        const payload = (await response.json()) as { works?: unknown };
        if (!Array.isArray(payload.works)) {
          throw new Error("Malformed showcase collection payload.");
        }
        setRemoteCollection(payload.works as ShowcaseWork[]);
      })
      .catch(() => {
        setRemoteCollectionFailed(true);
      });
  }, [collectionSourceKind, collectionSourceSlug, uiLocale]);

  const effectiveCollection = remoteCollection ?? collectionWorks;
  const viewerCollection = useMemo<ReplicationViewerCollection>(() => {
    const label =
      collectionLabel ??
      (substanceSlug
        ? t("Substance replications")
        : effectSlug
          ? t("{{name}} replications", {
              name: works[0]?.effectName ?? t("Effect"),
            })
          : t("Replications"));
    return {
      label,
      sourcePath:
        controller?.sourcePath ??
        (substanceSlug
          ? publicHref.substance(substanceSlug)
          : effectSlug
            ? publicHref.effect(effectSlug)
            : publicHref.replications()),
      kind: substanceSlug ? "substance" : effectSlug ? "effect" : "gallery",
      grouping: "none",
      editorTarget: substanceSlug
        ? { kind: "substance", key: substanceSlug, label }
        : effectSlug
          ? { kind: "effect", key: effectSlug, label }
          : undefined,
      groups: [
        {
          key: substanceSlug ?? effectSlug ?? "replications",
          label,
          items: effectiveCollection.map(viewerItemFromShowcaseWork),
        },
      ],
    };
  }, [
    collectionLabel,
    effectiveCollection,
    controller?.sourcePath,
    effectSlug,
    substanceSlug,
    t,
  ]);

  useEffect(() => {
    if (controller) return;
    const params = new URLSearchParams(window.location.search);
    const slug = parseReplicationViewerSlug(params);
    if (
      slug &&
      collectionSourceKind &&
      remoteCollection === null &&
      !remoteCollectionFailed
    ) {
      fetchRemoteCollection();
      return;
    }
    const belongsToCollection =
      slug && effectiveCollection.some((work) => work.slug === slug);
    setUnavailableViewerSlug(slug && !belongsToCollection ? slug : null);
    setViewerSlug(belongsToCollection ? slug : null);
    if (params.has("viewer") && !belongsToCollection) {
      const source = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.history.replaceState(
        window.history.state,
        "",
        closeReplicationViewerUrl(source),
      );
    }
    if (!belongsToCollection) dismissViewerDeepLinkCover();
  }, [
    controller,
    collectionSourceKind,
    effectiveCollection,
    fetchRemoteCollection,
    remoteCollection,
    remoteCollectionFailed,
  ]);

  const launchViewer = useCallback(
    (slug: string) => {
      if (controller) {
        controller.onOpenWork(slug);
        return;
      }
      fetchRemoteCollection();
      const source = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      setUnavailableViewerSlug(null);
      window.history.pushState(
        { ...window.history.state, replicationViewer: true },
        "",
        buildReplicationViewerUrl(source, slug),
      );
      setViewerSlug(slug);
    },
    [controller, fetchRemoteCollection],
  );

  const handleViewerLinkClick = useCallback(
    (slug: string) => (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      launchViewer(slug);
    },
    [launchViewer],
  );

  return {
    viewerSlug,
    unavailableViewerSlug,
    viewerCollection,
    launchViewer,
    handleViewerLinkClick,
    closeViewer: () => setViewerSlug(null),
  };
}
