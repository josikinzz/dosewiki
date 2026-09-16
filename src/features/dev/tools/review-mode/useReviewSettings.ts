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

import { REVIEW_FLAGS_UI, type ReviewQueueEntry } from "./reviewQueue";
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

/** Stable empty list so the flag-off path never churns memo dependencies. */
const NO_FLAG_LABELS: string[] = [];

export interface ReviewSettingsState {
  settings: ReviewSettings;
  /**
   * Session-only writes (a traverse, an adopted history entry). Anything the
   * reviewer chooses goes through `updateSettings`, which also persists.
   */
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

/**
 * The reviewer's persisted settings plus the workbench's half of the History
 * API: the address it lands on, the entry it seeds, and every entry it writes
 * after that. `currentSlug` lives here because the address is the one thing
 * that always names the right article (see the restore effect).
 */
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
  // With the flag surface off, stored or URL-carried flag settings become
  // inert here — one choke point, so no consumer can filter, group, or badge
  // by flags while the reviewer can't see the controls that would explain it.
  const effectiveFlagLabels = REVIEW_FLAGS_UI ? flagLabels : NO_FLAG_LABELS;
  const effectiveFlagSeverity = REVIEW_FLAGS_UI ? flagSeverity : null;
  const effectiveFlagGroupBy = REVIEW_FLAGS_UI ? flagGroupBy : "none";
  // Restore after mount so the server render matches first client paint. The
  // address is consulted here too: a `?view=` in a shared or bookmarked link is
  // a statement about which view to open, and it outranks the stored default.
  // Since the workbench writes the view into every address it produces, the
  // stored preference now decides only a bare landing — `/review`, or a link
  // typed without one. The history payload, if this entry has one, outranks
  // both; the seed effect below adopts it.
  //
  // The slug is re-read from the address for the same reason it is read at all,
  // plus one the History API creates: `initialSlug` comes from the server
  // render of this entry, and a traverse back *into* the workbench restores a
  // cached render whose params belong to whichever article the session started
  // on. The address is the only thing that always names the right one.
  useEffect(() => {
    const stored = loadReviewSettings();
    const fromUrl = parseReviewLocation(window.location.href);
    setSettings({
      ...stored,
      viewMode: resolveInitialView(fromUrl.view, stored.viewMode),
      flagLabels: fromUrl.flagLabels ?? stored.flagLabels,
      flagSeverity: fromUrl.flagSeverity ?? stored.flagSeverity,
      flagGroupBy: fromUrl.flagGroupBy ?? stored.flagGroupBy,
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
        window.history.replaceState(window.history.state, "", buildReviewUrl({ slug: location.slug, view: location.view ?? next.viewMode, flagLabels: REVIEW_FLAGS_UI ? next.flagLabels : [], flagSeverity: REVIEW_FLAGS_UI ? next.flagSeverity : null, flagGroupBy: REVIEW_FLAGS_UI ? next.flagGroupBy : "none" }));
        return next;
      });
    },
    [],
  );

  const currentSlugRef = useRef<string | null>(currentSlug);
  currentSlugRef.current = currentSlug;
  const viewModeRef = useRef<ReviewViewMode>(viewMode);
  viewModeRef.current = viewMode;
  /**
   * Where the entry on screen sits in this session's own run of workbench
   * entries, counted from the one seeded on mount.
   *
   * A ref because every history write reads it and rewrites it inside the same
   * callback, and because nothing renders from it: the in-app arrows move by
   * queue position, and the browser owns its stack outright. The index is
   * carried in each entry's payload so a reload or a traverse back into the
   * workbench can resume the counting rather than restart it — see
   * `resolveSeedLocation`.
   */
  const entryIndexRef = useRef(0);
  const historySeededRef = useRef(false);

  /**
   * Take up the position the entry we mounted on already describes, or seed one
   * if it describes none.
   *
   * A first arrival gets the resolved position written in place, so `/review`
   * becomes `/review/<slug>` without spending an entry the reviewer would then
   * have to press back through, and the session starts at index 0.
   *
   * A mount that is *not* a first arrival — a reload, a discarded tab, a
   * traverse back into the workbench — lands on an entry the workbench stamped
   * itself. That payload outranks anything resolved here: it names the article
   * and view this entry stands for, and its index says how many workbench
   * entries sit behind it. Overwriting it reset the depth to 0 while the
   * browser still held those entries, which is what made back and forward look
   * dead after a reload. So it is adopted verbatim and left unwritten.
   */
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
      // Session state only, never `updateSettings` — same rule as a traverse:
      // restoring what an entry showed is not the reviewer choosing a default.
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

  /**
   * Record a workbench position in the address bar.
   *
   * `pushState`, not `router.push`: this route is `force-dynamic` and
   * `ReviewRouteClient` re-downloads the whole Postgres library on mount, so
   * routing per article would remount the workbench between every flip. Next's
   * App Router patches `pushState` and copies its own internals onto the state
   * object, so the entry stays one the router will traverse rather than reload.
   *
   * `replace` rewrites the entry already on screen instead of adding one, and
   * so deliberately leaves `entryIndexRef` alone: the stack did not get deeper,
   * one of its entries just now stands for something else.
   */
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

  /**
   * Webpage / Editor is a navigation: toggling PUSHES a history entry, so the
   * browser's back/forward — including mouse side buttons — swap between the
   * two views of the article on screen. That is the reviewer's explicitly
   * requested workflow ("switch between webpage and editor using my side
   * buttons"), so this is a product decision, not an accident. It costs the
   * in-app ← nothing, because that arrow reads the queue rather than the
   * history stack.
   *
   * This was briefly a replace-in-place, on the theory that back should be
   * reserved for articles. What was actually broken about the push behaviour
   * was never the push — it was the remount clobber (`resolveSeedLocation`
   * now adopts the entry) and the scroll reset on same-article traverses
   * (now guarded in the popstate handler). Both fixes are kept.
   */
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

/**
 * Moving between articles: the in-app arrows, the picker, and the browser's
 * own back / forward. Sits after the writes hook because leaving an article
 * clears a stale tick error, and after the draft controller because leaving
 * one with unapplied form edits asks first.
 */
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

  /**
   * The in-app arrows walk the *list*: ← is the queue entry before the one on
   * screen, → the one after, both through `navigateTo`, which keeps whichever
   * view the reviewer is currently in. The browser's own back and forward —
   * chrome buttons, the gesture, mouse side buttons — keep walking the *visit
   * history* instead, restoring each entry's article and its view, which is
   * what makes the side buttons swap Webpage / Editor.
   *
   * ← used to delegate to `history.back()`. Sharing one stack with the browser
   * sounded tidy and was wrong in three ways the reviewer hit immediately: the
   * entry behind the current one is often a view flip (so ← changed the view
   * instead of the article, landing in the editor unasked), a re-visited
   * article makes the visit order loop rather than advance backwards through
   * the list, and the delegation dies at the bottom of this session's run of
   * entries even though the list still has articles behind the current one.
   */
  const goPrev = useCallback(() => {
    const previous = visibleQueue[position - 1];
    if (previous) navigateTo(previous.slug);
  }, [navigateTo, position, visibleQueue]);

  const canGoPrev = position > 0;
  const canGoNext = position < visibleQueue.length - 1;

  /**
   * Browser back / forward only — the chrome buttons, the gesture, and the
   * mouse side buttons. The in-app ← never arrives here: it moves by queue
   * position instead (see `goPrev`).
   *
   * The state payload is what makes this exact: it carries the slug, the view
   * and the entry's index, so the workbench can restore a position it may never
   * have rendered in this order and still know how deep it now sits.
   */
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const target = resolveTraversedLocation(event.state, window.location.href);
      // A traverse out of the workbench entirely — Next owns that entry and
      // will render whatever route it names. Nothing here to reconcile.
      if (!target.slug) return;
      const index = target.index ?? 0;
      if (formDirty && currentSlugRef.current) pushLocation(currentSlugRef.current, viewModeRef.current);
      guardNavigation(() => {
      if (formDirty) pushLocation(target.slug, target.view, { replace: true });
      const changedArticle = target.slug !== currentSlugRef.current;
      entryIndexRef.current = index;
      clearTickError();
      setCurrentSlug(target.slug);
      // Session state only, never `updateSettings`: a traverse restores what
      // the entry showed, it is not the reviewer choosing a new default.
      setSettings((previous) =>
        previous.viewMode === target.view
          ? previous
          : { ...previous, viewMode: target.view },
      );
      // Only a different article is a fresh read. Landing on the same one —
      // an entry whose view differs, or a re-entry into the workbench — should
      // leave the reviewer where she was in the page she was already reading.
      if (changedArticle) {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
      });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [clearTickError, currentSlugRef, entryIndexRef, setCurrentSlug, setSettings, formDirty, pushLocation, guardNavigation, viewModeRef]);

  /**
   * The only guard a traverse or a tab close can still honour. `popstate`
   * cannot be cancelled, so unapplied editor edits are defended here instead of
   * with a confirm that arrives after the fact.
   */
  useEffect(() => {
    if (!formDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy browsers key the prompt off a non-empty returnValue.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [formDirty]);

  return { navigateTo, goNext, goPrev, canGoPrev, canGoNext };
}
