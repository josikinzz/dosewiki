"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { useT, useUiLocale } from "@/i18n/client";
import { publicHref } from "@/utils/publicHref";
import { buildReplicationViewerUrl, closeReplicationViewerUrl, parseReplicationViewerSlug } from "@/features/replications/galleryUrlState";
import { dismissViewerDeepLinkCover } from "@/features/replications/ViewerDeepLinkCover";
import { viewerItemFromShowcaseWork } from "@/features/replications/viewer/viewerModel";
import type { ReplicationViewerCollection } from "@/features/replications/viewer/viewerModel";
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

export function useShowcaseViewerController({ works, collectionWorks, collectionSource, substanceSlug, effectSlug, collectionLabel, controller }: UseShowcaseViewerControllerOptions) {
  const t = useT();
  const uiLocale = useUiLocale();
  const [viewerSlug, setViewerSlug] = useState<string | null>(null);
  const [unavailableViewerSlug, setUnavailableViewerSlug] = useState<string | null>(null);
  const requestRef = useRef<{ url: string; promise: Promise<ShowcaseWork[]> } | null>(null);
  const sourceKind = collectionSource?.kind;
  const sourceSlug = collectionSource?.slug;
  const viewerCollection = useMemo<ReplicationViewerCollection>(() => {
    const label = collectionLabel ?? (substanceSlug ? t("Substance replications") : effectSlug
      ? t("{{name}} replications", { name: works[0]?.effectName ?? t("Effect") }) : t("Replications"));
    return {
      label,
      sourcePath: controller?.sourcePath ?? (substanceSlug ? publicHref.substance(substanceSlug) : effectSlug ? publicHref.effect(effectSlug) : publicHref.replications()),
      kind: substanceSlug ? "substance" : effectSlug ? "effect" : "gallery",
      grouping: "none",
      editorTarget: substanceSlug ? { kind: "substance", key: substanceSlug, label } : effectSlug ? { kind: "effect", key: effectSlug, label } : undefined,
      groups: [{ key: substanceSlug ?? effectSlug ?? "replications", label, items: collectionWorks.map(viewerItemFromShowcaseWork) }],
    };
  }, [collectionLabel, collectionWorks, controller?.sourcePath, effectSlug, substanceSlug, t, works]);

  const resolveViewerCollection = useCallback(async () => {
    if (!sourceKind || !sourceSlug) return viewerCollection;
    const params = new URLSearchParams({ [sourceKind]: sourceSlug, locale: uiLocale });
    const url = `/api/replications/showcase?${params}`;
    if (requestRef.current?.url !== url) {
      const promise = fetch(url, { headers: { Accept: "application/json" } }).then(async (response) => {
        if (!response.ok) throw new Error(`Showcase collection read failed: ${response.status}`);
        const payload = await response.json() as { works?: ShowcaseWork[] };
        if (!Array.isArray(payload.works)) throw new Error("Malformed showcase collection payload.");
        return payload.works;
      });
      const entry = { url, promise };
      requestRef.current = entry;
      void promise.catch(() => { if (requestRef.current === entry) requestRef.current = null; });
    }
    const resolved = await requestRef.current.promise;
    return { ...viewerCollection, groups: viewerCollection.groups.map((group) => ({ ...group, items: resolved.map(viewerItemFromShowcaseWork) })) };
  }, [sourceKind, sourceSlug, uiLocale, viewerCollection]);

  useEffect(() => {
    if (controller) return;
    const params = new URLSearchParams(window.location.search);
    const slug = parseReplicationViewerSlug(params);
    const belongs = Boolean(slug && (sourceKind || collectionWorks.some((work) => work.slug === slug)));
    setUnavailableViewerSlug(slug && !belongs ? slug : null);
    setViewerSlug(belongs ? slug : null);
    if (params.has("viewer") && !belongs) {
      const source = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", closeReplicationViewerUrl(source));
    }
    if (!belongs) dismissViewerDeepLinkCover();
  }, [controller, sourceKind, collectionWorks]);

  const launchViewer = useCallback((slug: string) => {
    if (controller) { controller.onOpenWork(slug); return; }
    const source = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    setUnavailableViewerSlug(null);
    window.history.pushState({ ...window.history.state, replicationViewer: true }, "", buildReplicationViewerUrl(source, slug));
    setViewerSlug(slug);
  }, [controller]);
  const handleViewerLinkClick = useCallback((slug: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    launchViewer(slug);
  }, [launchViewer]);
  const closeViewer = useCallback(() => {
    setViewerSlug(null);
    const source = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", closeReplicationViewerUrl(source));
  }, []);
  return { viewerSlug, unavailableViewerSlug, viewerCollection,
    resolveViewerCollection: sourceKind ? resolveViewerCollection : undefined,
    launchViewer, handleViewerLinkClick, closeViewer };
}
