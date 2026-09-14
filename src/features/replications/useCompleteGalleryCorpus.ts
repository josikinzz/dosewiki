"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { msg } from "@/i18n/client";
import type { ContributorDirectory } from "@server/contributorDirectory";
import type { PublicGalleryReplicationPreview } from "@/types/replications";

export type GalleryPageLoadState = "idle" | "loading" | "error";

const CORPUS_LOADED_ANNOUNCEMENT = msg("Complete gallery loaded");

function shouldPrefetchCompleteCorpus(): boolean {
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;
  if (connection?.saveData) return false;
  return !window.matchMedia?.("(pointer: coarse)").matches;
}

function isContributorDirectory(
  value: unknown,
): value is ContributorDirectory {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof entry.key === "string" &&
        typeof entry.displayName === "string" &&
        Array.isArray(entry.aliases) &&
        entry.aliases.every((alias: unknown) => typeof alias === "string"),
    )
  );
}

function isGalleryReplicationPreview(
  value: unknown,
): value is PublicGalleryReplicationPreview {
  if (!value || typeof value !== "object") return false;

  return (
    "_id" in value &&
    typeof value._id === "string" &&
    "slug" in value &&
    typeof value.slug === "string" &&
    "title" in value &&
    typeof value.title === "string" &&
    "artist" in value &&
    typeof value.artist === "string" &&
    (!("artist_url" in value) || typeof value.artist_url === "string") &&
    "type" in value &&
    (value.type === "image" || value.type === "video" || value.type === "audio") &&
    "format" in value &&
    typeof value.format === "string" &&
    (!("effect_slug" in value) || typeof value.effect_slug === "string") &&
    (!("effect_tags" in value) ||
      (Array.isArray(value.effect_tags) &&
        value.effect_tags.every((item) => typeof item === "string"))) &&
    (!("viewing_mode_tags" in value) ||
      (Array.isArray(value.viewing_mode_tags) &&
        value.viewing_mode_tags.every(
          (item) => item === "open-eye" || item === "closed-eye",
        ))) &&
    (!("title_drugs" in value) ||
      (Array.isArray(value.title_drugs) &&
        value.title_drugs.every(
          (item) =>
            item !== null &&
            typeof item === "object" &&
            "slug" in item &&
            typeof item.slug === "string" &&
            "name" in item &&
            typeof item.name === "string",
        ))) &&
    (!("drug_classes" in value) ||
      (Array.isArray(value.drug_classes) &&
        value.drug_classes.every(
          (item) =>
            item === "psychedelics" ||
            item === "dissociatives" ||
            item === "deliriants" ||
            item === "other",
        ))) &&
    (!("content_family" in value) ||
      value.content_family === "experiential-replication" ||
      value.content_family === "visionary-psychedelic-art" ||
      value.content_family === "traditional-cultural-art" ||
      value.content_family === "dark-surrealism" ||
      value.content_family === "optical-perceptual-art" ||
      value.content_family === "generative-abstract-art" ||
      value.content_family === "effect-illustration" ||
      value.content_family === "explanatory-figure" ||
      value.content_family === "uncertain") &&
    (!("artist_type_tags" in value) ||
      (Array.isArray(value.artist_type_tags) &&
        value.artist_type_tags.every(
          (item) =>
            item === "replicator" || item === "traditional-psychedelic-artist",
        ))) &&
    "url" in value &&
    typeof value.url === "string" &&
    (!("thumbnail_url" in value) || typeof value.thumbnail_url === "string") &&
    (!("preview_url" in value) || typeof value.preview_url === "string") &&
    (!("motion_url" in value) || typeof value.motion_url === "string") &&
    (!("motion_poster_url" in value) ||
      typeof value.motion_poster_url === "string") &&
    (!("width" in value) || typeof value.width === "number") &&
    (!("height" in value) || typeof value.height === "number") &&
    (!("duration" in value) || typeof value.duration === "number") &&
    (!("has_audio" in value) || typeof value.has_audio === "boolean") &&
    "created_at" in value &&
    typeof value.created_at === "string" &&
    (!("date_info" in value) ||
      (value.date_info !== null &&
        typeof value.date_info === "object" &&
        "kind" in value.date_info &&
        (value.date_info.kind === "exact_date" ||
          value.date_info.kind === "year" ||
          value.date_info.kind === "range" ||
          value.date_info.kind === "upper_bound" ||
          value.date_info.kind === "inferred" ||
          value.date_info.kind === "unknown") &&
        (!("value" in value.date_info) ||
          typeof value.date_info.value === "string"))) &&
    (!("effect_order_index" in value) ||
      (value.effect_order_index !== null &&
        typeof value.effect_order_index === "object" &&
        Object.values(value.effect_order_index).every(
          (position) => typeof position === "number",
        )))
  );
}

interface UseCompleteGalleryCorpusOptions {
  replications: PublicGalleryReplicationPreview[];
  completeCorpusUrl?: string;
  initialContributorDirectory?: ContributorDirectory;
  browseStateKey: string;
  browseRequiresCompleteCorpus: boolean;
  urlStateResolved: boolean;
  viewerSlugParam: string | null;
}

export function useCompleteGalleryCorpus({
  replications,
  completeCorpusUrl,
  initialContributorDirectory,
  browseStateKey,
  browseRequiresCompleteCorpus,
  urlStateResolved,
  viewerSlugParam,
}: UseCompleteGalleryCorpusOptions) {
  const [galleryReplications, setGalleryReplications] = useState(replications);
  const [hasMore, setHasMore] = useState(Boolean(completeCorpusUrl));
  const hasMoreRef = useRef(hasMore);
  const [pageLoadState, setPageLoadState] =
    useState<GalleryPageLoadState>("idle");
  const [completionAnnouncement, setCompletionAnnouncement] = useState<
    string | null
  >(null);
  const pageRequestRef = useRef<Promise<boolean> | null>(null);
  const pageAbortRef = useRef<AbortController | null>(null);
  const [fetchedContributorDirectory, setFetchedContributorDirectory] =
    useState<ContributorDirectory | null>(null);
  const contributorDirectory =
    fetchedContributorDirectory ?? initialContributorDirectory;
  const observedBrowseStateKeyRef = useRef(browseStateKey);
  const actionGenerationRef = useRef(0);
  const pendingCorpusActionRef = useRef<{
    generation: number;
    action: () => void;
  } | null>(null);

  const cancelPendingCorpusAction = useCallback(() => {
    actionGenerationRef.current += 1;
    pendingCorpusActionRef.current = null;
  }, []);

  const queueCorpusAction = useCallback((action: () => void) => {
    const generation = actionGenerationRef.current + 1;
    actionGenerationRef.current = generation;
    pendingCorpusActionRef.current = { generation, action };
    return generation;
  }, []);

  const completeCorpusAction = useCallback((generation: number) => {
    const pending = pendingCorpusActionRef.current;
    if (!pending || pending.generation !== generation) return;
    pendingCorpusActionRef.current = null;
    pending.action();
  }, []);

  const loadCompleteCorpus = useCallback((): Promise<boolean> => {
    if (!completeCorpusUrl || !hasMoreRef.current) {
      return pageRequestRef.current ?? Promise.resolve(true);
    }
    if (pageRequestRef.current) return pageRequestRef.current;

    setCompletionAnnouncement(null);
    const controller = new AbortController();
    pageAbortRef.current = controller;
    setPageLoadState("loading");

    const request = (async () => {
      try {
        const response = await fetch(completeCorpusUrl, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`Gallery request failed: ${response.status}`);
        }
        const payload: unknown = await response.json();
        if (
          !payload ||
          typeof payload !== "object" ||
          !("data" in payload) ||
          !Array.isArray(payload.data) ||
          !payload.data.every(isGalleryReplicationPreview)
        ) {
          throw new Error("Gallery response was malformed");
        }
        if (
          "contributorDirectory" in payload &&
          isContributorDirectory(payload.contributorDirectory)
        ) {
          setFetchedContributorDirectory(payload.contributorDirectory);
        }
        hasMoreRef.current = false;
        setGalleryReplications(payload.data);
        setHasMore(false);
        setPageLoadState("idle");
        setCompletionAnnouncement(CORPUS_LOADED_ANNOUNCEMENT);
        return true;
      } catch {
        if (!controller.signal.aborted) setPageLoadState("error");
        return false;
      } finally {
        if (pageAbortRef.current === controller) pageAbortRef.current = null;
        pageRequestRef.current = null;
      }
    })();

    pageRequestRef.current = request;
    return request;
  }, [completeCorpusUrl]);

  useEffect(() => () => pageAbortRef.current?.abort(), []);

  useEffect(() => {
    if (!urlStateResolved || !completeCorpusUrl || !hasMoreRef.current) return;
    if (viewerSlugParam || browseRequiresCompleteCorpus) {
      void loadCompleteCorpus();
      return;
    }
    if (!shouldPrefetchCompleteCorpus()) return;
    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout?: number },
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleId: number | undefined;
    let timeoutId: number | undefined;
    if (typeof idleWindow.requestIdleCallback === "function") {
      idleId = idleWindow.requestIdleCallback(
        () => void loadCompleteCorpus(),
        { timeout: 4000 },
      );
    } else {
      timeoutId = window.setTimeout(() => void loadCompleteCorpus(), 2000);
    }
    return () => {
      if (idleId !== undefined) idleWindow.cancelIdleCallback?.(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [
    browseStateKey,
    browseRequiresCompleteCorpus,
    completeCorpusUrl,
    loadCompleteCorpus,
    urlStateResolved,
    viewerSlugParam,
  ]);

  useEffect(() => {
    if (observedBrowseStateKeyRef.current === browseStateKey) return;
    observedBrowseStateKeyRef.current = browseStateKey;
    cancelPendingCorpusAction();
  }, [browseStateKey, cancelPendingCorpusAction]);

  const runWithCompleteCorpus = useCallback(
    (action: () => void) => {
      const generation = queueCorpusAction(action);
      if (!hasMoreRef.current) {
        completeCorpusAction(generation);
        return;
      }
      void loadCompleteCorpus().then((loaded) => {
        if (loaded) completeCorpusAction(generation);
      });
    },
    [completeCorpusAction, loadCompleteCorpus, queueCorpusAction],
  );

  const retryCompleteCorpus = useCallback(() => {
    const generation = pendingCorpusActionRef.current?.generation;
    return loadCompleteCorpus().then((loaded) => {
      if (loaded && generation !== undefined) completeCorpusAction(generation);
      return loaded;
    });
  }, [completeCorpusAction, loadCompleteCorpus]);

  return {
    galleryReplications,
    hasMore,
    hasMoreRef,
    pageLoadState,
    completionAnnouncement,
    contributorDirectory,
    cancelPendingCorpusAction,
    queueCorpusAction,
    completeCorpusAction,
    loadCompleteCorpus,
    runWithCompleteCorpus,
    retryCompleteCorpus,
  };
}
