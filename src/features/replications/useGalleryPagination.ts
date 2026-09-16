"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ContributorDirectory } from "@server/contributorDirectory";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import { galleryQueryIdentity, type GalleryFacets, type GalleryGroupSummary, type GalleryPagePayload, type GalleryPageState } from "./galleryPage";
import { parseGalleryBrowseState } from "./galleryUrlState";

export type GalleryPageLoadState = "idle" | "loading" | "error";

interface UseGalleryPaginationOptions {
  replications: PublicGalleryReplicationPreview[];
  galleryPageUrl?: string;
  initialContributorDirectory?: ContributorDirectory;
  initialPage?: GalleryPageState;
  browseQuery: string;
  focus?: { kind: "artist" | "effect"; key: string };
  urlStateResolved: boolean;
  viewerSlugParam: string | null;
}

function isPayload(value: unknown): value is GalleryPagePayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<GalleryPagePayload>;
  return Array.isArray(payload.data) && Array.isArray(payload.groups) && Boolean(payload.facets) &&
    typeof payload.total === "number" &&
    (typeof payload.nextCursor === "string" || payload.nextCursor === null);
}

export function useGalleryPagination({ replications, galleryPageUrl, initialContributorDirectory, initialPage,
  browseQuery, focus, urlStateResolved, viewerSlugParam }: UseGalleryPaginationOptions) {
  const [galleryReplications, setGalleryReplications] = useState(replications);
  const [nextCursor, setNextCursor] = useState<string | null>(initialPage ? initialPage.nextCursor : galleryPageUrl ? "" : null);
  const [total, setTotal] = useState<number | null>(initialPage?.total ?? null);
  const [groups, setGroups] = useState<GalleryGroupSummary[]>(initialPage?.groups ?? []);
  const [facets, setFacets] = useState<GalleryFacets>(initialPage?.facets ?? { drugs: [], effects: [] });
  const [pageLoadState, setPageLoadState] = useState<GalleryPageLoadState>("idle");
  const [viewerResolutionState, setViewerResolutionState] = useState<GalleryPageLoadState>("idle");
  const [contributorDirectory, setContributorDirectory] = useState(initialContributorDirectory);
  const abortRef = useRef<AbortController | null>(null);
  const viewerAbortRef = useRef<AbortController | null>(null);
  const requestRef = useRef<{ id: number; promise: Promise<boolean> } | null>(null);
  const requestIdRef = useRef(0);
  const viewerRequestIdRef = useRef(0);
  const queryRef = useRef(browseQuery);
  const resolvedViewerSlugRef = useRef<string | null>(null);
  const initialSelectionRef = useRef(true);

  const loadPage = useCallback((cursor: string | null, replace: boolean): Promise<boolean> => {
    if (!galleryPageUrl || cursor === null) return Promise.resolve(true);
    if (requestRef.current) return requestRef.current.promise;
    const id = ++requestIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setPageLoadState("loading");
    const promise = (async () => {
      try {
        const url = new URL(galleryPageUrl, window.location.origin);
        const params = new URLSearchParams(url.search);
        for (const [key, value] of new URLSearchParams(queryRef.current)) params.set(key, value);
        params.delete("viewer");
        if (focus) { params.set("focusKind", focus.kind); params.set("focusKey", focus.key); }
        if (cursor) params.set("cursor", cursor); else params.delete("cursor");
        url.search = params.toString();
        const response = await fetch(url.toString(), { signal: controller.signal, headers: { Accept: "application/json" } });
        if (response.status === 409) {
          if (requestRef.current?.id === id) setNextCursor("");
          throw new Error("Gallery membership changed; restart this selection.");
        }
        if (!response.ok) throw new Error(`Gallery request failed: ${response.status}`);
        const payload: unknown = await response.json();
        if (!isPayload(payload)) throw new Error("Gallery response was malformed");
        if (requestRef.current?.id !== id) return false;
        setGalleryReplications((current) => {
          const candidates = replace ? payload.data : [...current, ...payload.data];
          const byId = new Map(candidates.map((item) => [item._id, item]));
          return [...byId.values()];
        });
        setContributorDirectory((current) => {
          const entries = [...(replace ? [] : (current ?? [])), ...(payload.contributorDirectory ?? [])];
          const byKey = new Map(entries.map((entry) => [entry.key, entry]));
          return [...byKey.values()];
        });
        setTotal(payload.total);
        setGroups((current) => {
          if (replace) return payload.groups;
          const previous = new Map(current.map((group) => [group.key, group]));
          return payload.groups.map((group) => group.itemIds
            ? { ...group, itemIds: [...new Set([...(previous.get(group.key)?.itemIds ?? []), ...group.itemIds])] }
            : group);
        });
        setFacets(payload.facets);
        setNextCursor(payload.nextCursor); setPageLoadState("idle");
        return true;
      } catch {
        if (!controller.signal.aborted && requestRef.current?.id === id) setPageLoadState("error");
        return false;
      } finally {
        if (requestRef.current?.id === id) requestRef.current = null;
        if (abortRef.current === controller) abortRef.current = null;
      }
    })();
    requestRef.current = { id, promise };
    return promise;
  }, [focus, galleryPageUrl]);

  useEffect(() => {
    if (!urlStateResolved || !galleryPageUrl) return;
    const locale = new URL(galleryPageUrl, window.location.origin).searchParams.get("locale") ?? "en";
    const identity = galleryQueryIdentity(locale, parseGalleryBrowseState(new URLSearchParams(browseQuery)), focus);
    if (initialSelectionRef.current && initialPage?.queryIdentity === identity) {
      queryRef.current = browseQuery;
      return;
    }
    initialSelectionRef.current = false;
    requestIdRef.current += 1;
    viewerRequestIdRef.current += 1;
    abortRef.current?.abort();
    viewerAbortRef.current?.abort();
    requestRef.current = null;
    queryRef.current = browseQuery;
    resolvedViewerSlugRef.current = null;
    setNextCursor(""); setTotal(null); setPageLoadState("idle"); setViewerResolutionState("idle");
    void loadPage("", true);
  }, [browseQuery, focus, galleryPageUrl, initialPage, loadPage, urlStateResolved]);

  const loadNextPage = useCallback(() => loadPage(nextCursor, nextCursor === ""), [loadPage, nextCursor]);
  const retry = useCallback(() => loadPage(nextCursor ?? "", nextCursor === ""), [loadPage, nextCursor]);

  const resolveViewer = useCallback(async (slug: string): Promise<boolean> => {
    if (!galleryPageUrl) return false;
    const id = ++viewerRequestIdRef.current;
    viewerAbortRef.current?.abort();
    const controller = new AbortController();
    viewerAbortRef.current = controller;
    setViewerResolutionState("loading");
    try {
      const url = new URL(galleryPageUrl, window.location.origin);
      const params = new URLSearchParams(url.search);
      for (const [key, value] of new URLSearchParams(queryRef.current)) params.set(key, value);
      if (focus) { params.set("focusKind", focus.kind); params.set("focusKey", focus.key); }
      params.set("viewer", slug);
      params.delete("cursor");
      url.search = params.toString();
      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Gallery viewer request failed: ${response.status}`);
      const payload: unknown = await response.json();
      if (!isPayload(payload)) throw new Error("Gallery viewer response was malformed");
      if (viewerRequestIdRef.current !== id) return false;
      const intended = payload.data.find((item) => item.slug === slug);
      if (intended) {
        setGalleryReplications((current) =>
          current.some((item) => item._id === intended._id) ? current : [...current, intended],
        );
        setContributorDirectory((current) => {
          const entries = [...(current ?? []), ...(payload.contributorDirectory ?? [])];
          const byKey = new Map(entries.map((entry) => [entry.key, entry]));
          return [...byKey.values()];
        });
      }
      resolvedViewerSlugRef.current = slug;
      setViewerResolutionState("idle");
      return Boolean(intended);
    } catch {
      if (!controller.signal.aborted && viewerRequestIdRef.current === id) {
        setViewerResolutionState("error");
      }
      return false;
    } finally {
      if (viewerAbortRef.current === controller) viewerAbortRef.current = null;
    }
  }, [focus, galleryPageUrl]);
  useEffect(() => {
    viewerRequestIdRef.current += 1;
    viewerAbortRef.current?.abort();
    resolvedViewerSlugRef.current = null;
    setViewerResolutionState("idle");
  }, [viewerSlugParam, browseQuery, focus?.kind, focus?.key]);


  useEffect(() => {
    if (!urlStateResolved || !viewerSlugParam || !galleryPageUrl || total === null || pageLoadState === "loading" || requestRef.current) return;
    if (galleryReplications.some((item) => item.slug === viewerSlugParam)) {
      resolvedViewerSlugRef.current = viewerSlugParam;
      setViewerResolutionState("idle");
      return;
    }
    if (resolvedViewerSlugRef.current === viewerSlugParam || viewerResolutionState !== "idle") return;
    void resolveViewer(viewerSlugParam);
  }, [galleryPageUrl, galleryReplications, pageLoadState, resolveViewer, total, urlStateResolved, viewerResolutionState, viewerSlugParam]);

  useEffect(() => () => {
    requestRef.current = null;
    viewerRequestIdRef.current += 1;
    abortRef.current?.abort();
    viewerAbortRef.current?.abort();
  }, []);
  const retryViewerResolution = useCallback(
    () => viewerSlugParam ? resolveViewer(viewerSlugParam) : Promise.resolve(false),
    [resolveViewer, viewerSlugParam],
  );
  const unresolvedViewer = Boolean(galleryPageUrl && viewerSlugParam &&
    resolvedViewerSlugRef.current !== viewerSlugParam &&
    !galleryReplications.some((item) => item.slug === viewerSlugParam));
  const visibleViewerResolutionState = unresolvedViewer && viewerResolutionState === "idle"
    ? "loading" : viewerResolutionState;
  return { galleryReplications, hasMore: nextCursor !== null, pageLoadState, contributorDirectory,
    total, groups, facets, loadNextPage, retry, viewerResolutionState: visibleViewerResolutionState, retryViewerResolution };
}
