"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import type { ReviewQueueEntry } from "./reviewQueue";
import {
  loadReviewSettings,
  REVIEW_SETTINGS_DEFAULTS,
  saveReviewSettings,
  type ReviewSettings,
  type ReviewViewMode,
} from "./reviewSettings";
import {
  buildReviewHistoryState,
  buildReviewUrl,
  parseReviewLocation,
  resolveInitialView,
  resolveSeedLocation,
  resolveTraversedLocation,
} from "./reviewUrl";

export interface ReviewSettingsState {
  settings: ReviewSettings;
  setSettings: Dispatch<SetStateAction<ReviewSettings>>;
  settingsRestored: boolean;
  updateSettings: (patch: Partial<ReviewSettings>) => void;
  effectiveFlagLabels: string[];
  effectiveFlagSeverity: ReviewSettings["flagSeverity"];
  effectiveFlagGroupBy: ReviewSettings["flagGroupBy"];
  currentSlug: string | null;
  setCurrentSlug: Dispatch<SetStateAction<string | null>>;
  currentSlugRef: MutableRefObject<string | null>;
  viewModeRef: MutableRefObject<ReviewViewMode>;
  entryIndexRef: MutableRefObject<number>;
  pushLocation: (
    slug: string,
    view: ReviewViewMode,
    options?: { replace?: boolean },
  ) => void;
  changeViewMode: (view: ReviewViewMode) => void;
}

export function useReviewSettings({
  initialSlug,
}: {
  initialSlug?: string;
}): ReviewSettingsState {
  const [settings, setSettings] = useState(REVIEW_SETTINGS_DEFAULTS);
  const [settingsRestored, setSettingsRestored] = useState(false);
  const [currentSlug, setCurrentSlug] = useState<string | null>(
    initialSlug ?? null,
  );
  const { viewMode, flagLabels, flagSeverity, flagGroupBy } = settings;
  const effectiveFlagLabels = flagLabels;
  const effectiveFlagSeverity = flagSeverity;
  const effectiveFlagGroupBy = flagGroupBy;
  useEffect(() => {
    const stored = loadReviewSettings();
    const fromUrl = parseReviewLocation(window.location.href);
    setSettings({
      ...stored,
      viewMode: resolveInitialView(fromUrl.view, stored.viewMode),
      flagLabels: fromUrl.flagLabels ?? stored.flagLabels,
      flagSeverity: fromUrl.flagSeverity ?? stored.flagSeverity,
      flagGroupBy: fromUrl.flagGroupBy ?? stored.flagGroupBy,
      changedSinceReview: fromUrl.changedSinceReview ?? stored.changedSinceReview,
    });
    if (fromUrl.slug) setCurrentSlug(fromUrl.slug);
    setSettingsRestored(true);
  }, []);
  const updateSettings = useCallback(
    (patch: Partial<typeof REVIEW_SETTINGS_DEFAULTS>) => {
      setSettings((previous) => {
        const next = { ...previous, ...patch };
        saveReviewSettings(next);
        const location = parseReviewLocation(window.location.href);
        window.history.replaceState(window.history.state, "", buildReviewUrl({ slug: location.slug, view: location.view ?? next.viewMode, flagLabels: next.flagLabels, flagSeverity: next.flagSeverity, flagGroupBy: next.flagGroupBy }));
        return next;
      });
    },
    [],
  );

  const currentSlugRef = useRef<string | null>(currentSlug);
  currentSlugRef.current = currentSlug;
  const viewModeRef = useRef<ReviewViewMode>(viewMode);
  viewModeRef.current = viewMode;
  const entryIndexRef = useRef(0);
  const historySeededRef = useRef(false);

  useEffect(() => {
    if (historySeededRef.current || !settingsRestored || !currentSlug) return;
    historySeededRef.current = true;
    const seed = resolveSeedLocation(window.history.state, window.location.href, {
      slug: currentSlug,
      view: viewMode,
    });
    entryIndexRef.current = seed.index;
    if (seed.adopted) {
      if (seed.slug !== currentSlugRef.current) setCurrentSlug(seed.slug);
      setSettings((previous) =>
        previous.viewMode === seed.view
          ? previous
          : { ...previous, viewMode: seed.view },
      );
      return;
    }
    window.history.replaceState(
      buildReviewHistoryState({ slug: seed.slug, view: seed.view, index: 0 }),
      "",
      buildReviewUrl({ slug: seed.slug, view: seed.view, flagLabels: effectiveFlagLabels, flagSeverity: effectiveFlagSeverity, flagGroupBy: effectiveFlagGroupBy }),
    );
  }, [currentSlug, settingsRestored, viewMode, effectiveFlagLabels, effectiveFlagSeverity, effectiveFlagGroupBy]);

  const pushLocation = useCallback(
    (slug: string, view: ReviewViewMode, options?: { replace?: boolean }) => {
      const replace = options?.replace === true;
      const index = replace
        ? entryIndexRef.current
        : historySeededRef.current
          ? entryIndexRef.current + 1
          : 0;
      historySeededRef.current = true;
      if (!replace) {
        entryIndexRef.current = index;
      }
      const state = buildReviewHistoryState({ slug, view, index });
      const url = buildReviewUrl({ slug, view, flagLabels: effectiveFlagLabels, flagSeverity: effectiveFlagSeverity, flagGroupBy: effectiveFlagGroupBy });
      if (replace || index === 0) {
        window.history.replaceState(state, "", url);
      } else {
        window.history.pushState(state, "", url);
      }
    },
    [effectiveFlagGroupBy, effectiveFlagLabels, effectiveFlagSeverity],
  );

  const changeViewMode = useCallback(
    (view: ReviewViewMode) => {
      if (view === viewModeRef.current) return;
      updateSettings({ viewMode: view });
      const slug = currentSlugRef.current;
      if (slug) pushLocation(slug, view);
    },
    [pushLocation, updateSettings],
  );

  return {
    settings,
    setSettings,
    settingsRestored,
    updateSettings,
    effectiveFlagLabels,
    effectiveFlagSeverity,
    effectiveFlagGroupBy,
    currentSlug,
    setCurrentSlug,
    currentSlugRef,
    viewModeRef,
    entryIndexRef,
    pushLocation,
    changeViewMode,
  };
}

export function useReviewNavigation({
  settings,
  visibleQueue,
  position,
  formDirty,
  clearTickError,
  guardNavigation,
}: {
  settings: ReviewSettingsState;
  visibleQueue: readonly ReviewQueueEntry[];
  position: number;
  formDirty: boolean;
  clearTickError: () => void;
  guardNavigation: (proceed: () => void) => void;
}) {
  const {
    currentSlugRef,
    viewModeRef,
    entryIndexRef,
    setCurrentSlug,
    setSettings,
    pushLocation,
  } = settings;


  const navigateTo = useCallback(
    (slug: string) => {
      if (slug === currentSlugRef.current) return;
      guardNavigation(() => {
        clearTickError();
        setCurrentSlug(slug);
        pushLocation(slug, viewModeRef.current);
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      });
    },
    [clearTickError, guardNavigation, currentSlugRef, pushLocation, setCurrentSlug, viewModeRef],
  );

  const goNext = useCallback(() => {
    const next = visibleQueue[position + 1];
    if (next) navigateTo(next.slug);
  }, [navigateTo, position, visibleQueue]);

  const goPrev = useCallback(() => {
    const previous = visibleQueue[position - 1];
    if (previous) navigateTo(previous.slug);
  }, [navigateTo, position, visibleQueue]);

  const canGoPrev = position > 0;
  const canGoNext = position < visibleQueue.length - 1;

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const target = resolveTraversedLocation(event.state, window.location.href);
      const targetSlug = target.slug;
      if (!targetSlug) return;
      const index = target.index ?? 0;
      if (formDirty && currentSlugRef.current) pushLocation(currentSlugRef.current, viewModeRef.current);
      guardNavigation(() => {
      if (formDirty) pushLocation(targetSlug, target.view, { replace: true });
      const changedArticle = targetSlug !== currentSlugRef.current;
      entryIndexRef.current = index;
      clearTickError();
      setCurrentSlug(targetSlug);
      setSettings((previous) =>
        previous.viewMode === target.view
          ? previous
          : { ...previous, viewMode: target.view },
      );
      if (changedArticle) {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
      });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [clearTickError, currentSlugRef, entryIndexRef, setCurrentSlug, setSettings, formDirty, pushLocation, guardNavigation, viewModeRef]);

  return { navigateTo, goNext, goPrev, canGoPrev, canGoNext };
}
