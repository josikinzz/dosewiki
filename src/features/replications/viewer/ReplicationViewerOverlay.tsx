"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { focusRingClassName } from "@/components/ui/surface";
import { EditorLauncherOutlet } from "@/features/editor-launcher/EditorLauncherOutlet";
import { EditorLauncherTarget } from "@/features/editor-launcher/EditorLauncherTarget";
import {
  buildReplicationViewerUrl,
  closeReplicationViewerUrl,
  parseReplicationViewerSlug,
} from "@/features/replications/galleryUrlState";
import { cn } from "@/lib/utils";
import { msg, useT } from "@/i18n/client";
import { ARTIST_LABEL, ARTISTS_LABEL } from "../replicationVocabulary";
import { formatArchiveDate } from "@/utils/archiveDate";
import { publicHref } from "@/utils/publicHref";
import {
  ViewerTransport,
  type ViewerTransportHandle,
} from "./ViewerTransport";
import {
  ViewerMediaTrack,
  type ViewerTrackHandle,
} from "./ViewerMediaTrack";
import { ViewerThumbnailRail } from "./ViewerThumbnailRail";
import { useStageFit } from "./useStageFit";
import { slideMotionSource } from "./qualityLadder";
import { RotatingIcon } from "./RotatingIcon";
import { hasKnownCreator } from "@/features/effects/components/replicationCredit";
import ReplicationViewerEditorGate from "./editor/ReplicationViewerEditorGate.editor";
import {
  findViewerPosition,
  moveViewerGroup,
  moveViewerWork,
  type ReplicationViewerCollection,
  type ReplicationViewerPosition,
} from "./viewerModel";
import {
  GESTURE_HINT_STORAGE_KEY,
  VIEWER_ROTATE_STORAGE_KEY,
  VIEWER_SOUND_STORAGE_KEY,
  resolveViewerMuted,
  resolveViewerRotateMode,
  shouldShowGestureHint,
} from "./viewerPreferences";
import {
  createViewerSession,
  type EntryMotion,
  type ViewerHistoryAdapter,
  type ViewerSession,
} from "./viewerSession";

/**
 * The viewer's full-screen dialog surface. The `!` trio is load-bearing:
 * light mode paints `.theme-overlay-surface` with a frosted 1px border,
 * background, and inset-highlight shadow (`!important`, higher specificity),
 * and unlayered theme CSS beats layered utilities — only layered important
 * utilities keep this surface borderless, shadowless, pure black in every
 * theme. `--theme-elevation-none` is the audited flat-shadow token.
 * Full-viewport surfaces must not inherit the centered dialog's slide/zoom:
 * those keyframes displace and shrink the entire viewer during startup.
 */
const VIEWER_DIALOG_CLASS =
  "theme-media-tile-title fixed inset-0 z-[70] h-dvh w-full max-h-none max-w-none translate-x-0 translate-y-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-0 overflow-hidden !border-0 !bg-black p-0 !shadow-[var(--theme-elevation-none)] !animate-none sm:rounded-none";
/**
 * The side the incoming work enters from after a non-swipe navigation
 * (group jumps, rail taps, editor activation). Horizontal work changes ride
 * the track's own slide animation instead.
 */

const ENTRY_MOTION_CLASS: Record<EntryMotion, string> = {
  fade: "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200",
};

/**
 * Every entry-motion utility class, for clearing before a replay.
 * Duplicates across entries are harmless: classList.remove ignores them.
 */
const ENTRY_MOTION_ALL_CLASSES = Object.values(ENTRY_MOTION_CLASS).flatMap(
  (value) => value.split(" "),
);
/**
 * Whole sentences per grouping unit: the mirror cannot derive "artists" or
 * "Previous artist" from a translated "Artist" by lowercasing or suffixing.
 */
const GROUP_UNIT_COPY = {
  artist: {
    label: ARTIST_LABEL,
    plural: ARTISTS_LABEL,
    counter: msg("Artist {{position}}/{{total}}"),
    previous: msg("Previous artist: {{label}}"),
    first: msg("First artist"),
    next: msg("Next artist: {{label}}"),
    final: msg("Final artist"),
    switchHint: msg("Switch artists"),
  },
  effect: {
    label: msg("Effect"),
    plural: msg("Effects"),
    counter: msg("Effect {{position}}/{{total}}"),
    previous: msg("Previous effect: {{label}}"),
    first: msg("First effect"),
    next: msg("Next effect: {{label}}"),
    final: msg("Final effect"),
    switchHint: msg("Switch effects"),
  },
  group: {
    label: msg("Group"),
    plural: msg("Groups"),
    counter: msg("Group {{position}}/{{total}}"),
    previous: msg("Previous group: {{label}}"),
    first: msg("First group"),
    next: msg("Next group: {{label}}"),
    final: msg("Final group"),
    switchHint: msg("Switch groups"),
  },
} as const;


interface PublicReplicationDetails {
  slug: string;
  format: string;
  created_at?: string;
  date_info?: {
    value?: string;
    kind: string;
    event_type?: string;
    confidence: string;
  };
  duration?: number;
  width?: number;
  height?: number;
  rights?: {
    status?: string;
    license_name?: string;
    license_url?: string;
    credit_line?: string;
    source_url?: string;
    rightsholder?: string;
  };
}

export interface ReplicationViewerOverlayProps {
  collection: ReplicationViewerCollection;
  initialSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The host is still resolving authoritative collection membership. */
  collectionPending?: boolean;
  /** A host-owned history boundary, such as an exact-origin embedded viewer. */
  historyAdapter?: ViewerHistoryAdapter;
  /** Re-apply a host selection even when its slug equals the original launch. */
  selectionRevision?: number;
  /** Public embedded documents never mount editorial launchers or gates. */
  editorEnabled?: boolean;
  /**
   * Regroup the walked collection around the work the reader is looking at.
   * Provided only by hosts whose collection supports both groupings (the
   * Gallery); named collections have exactly one order and no menu.
   */
  onRegroup?: (grouping: "artist" | "effect", currentSlug: string) => void;
}

export function ReplicationViewerOverlay({
  collection: sourceCollection,
  initialSlug,
  open,
  onOpenChange,
  collectionPending = false,
  onRegroup,
  historyAdapter,
  selectionRevision,
  editorEnabled = true,
}: ReplicationViewerOverlayProps) {
  const t = useT();
  const [collection, setCollection] = useState(sourceCollection);
  const [position, setPosition] = useState<ReplicationViewerPosition | null>(
    () => findViewerPosition(sourceCollection, initialSlug),
  );
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [infoOpen, setInfoOpen] = useState(false);
  const [details, setDetails] = useState<PublicReplicationDetails | null>(null);
  /**
   * Counts fullscreen refusals so a repeat press restarts the notice chip's
   * dwell instead of riding out the first timer. Zero means no chip.
   */
  const [fullscreenNotice, setFullscreenNotice] = useState(0);
  /** Spoken on work changes so non-visual readers don't navigate blind. */
  const [workAnnouncement, setWorkAnnouncement] = useState("");
  const announcedSlugRef = useRef<string | null>(null);
  /** Mirrors the stage transport so header, rail, and byline fade in step. */
  const [chromeVisible, setChromeVisible] = useState(true);
  /** Gesture-safe playback verbs registered by the transport chrome. */
  const transportHandleRef = useRef<ViewerTransportHandle | null>(null);
  /** The track's two-axis navigation verbs, shared by keys and controls. */
  const trackRef = useRef<ViewerTrackHandle>(null);
  /** The pooled element on the active pane; null while a still is up. */
  const [activeVideo, setActiveVideo] = useState<HTMLVideoElement | null>(
    null,
  );
  const [bufferHealth, setBufferHealth] = useState<{
    mediaKey: string;
    healthy: boolean;
  } | null>(null);
  const [entryMotion, setEntryMotion] = useState<EntryMotion | null>(null);
  const [gestureHint, setGestureHint] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [editorPanelHost, setEditorPanelHost] = useState<HTMLElement | null>(
    null,
  );
  const [editorRailHost, setEditorRailHost] = useState<HTMLElement | null>(
    null,
  );
  // Rotate mode is the reader's sticky choice for this session; the fit
  // hook derives whether the active work actually turns, so the overlay's
  // own iconography (settings, thumbnails) can lean with it.
  const [rotateMode, setRotateMode] = useState(false);
  /** The persistent wrapper the entry animation replays on. */
  const trackPaneRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pausedBackgroundVideosRef = useRef<HTMLVideoElement[]>([]);
  const openerRef = useRef<HTMLElement | null>(null);
  const sourceFocusTargetRef = useRef<HTMLElement | null>(null);
  const infoOpenerRef = useRef<HTMLElement | null>(null);
  const infoCloseRef = useRef<HTMLButtonElement | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const infoPanelId = useId();
  const infoHeadingId = useId();
  const sessionHolderRef = useRef<{
    collection: ReplicationViewerCollection;
    historyAdapter: ViewerHistoryAdapter | undefined;
    sourcePath: string;
    session: ViewerSession;
  } | null>(null);
  const previousSessionHolder = sessionHolderRef.current;
  if (
    !previousSessionHolder ||
    previousSessionHolder.historyAdapter !== historyAdapter ||
    previousSessionHolder.sourcePath !== sourceCollection.sourcePath
  ) {
    const previousPosition = previousSessionHolder?.session.snapshot().position;
    const sessionInitialSlug = previousPosition
      ? (previousSessionHolder.collection.groups[previousPosition.groupIndex]
          ?.items[previousPosition.itemIndex]?.replication.slug ?? initialSlug)
      : initialSlug;
    const history: ViewerHistoryAdapter = historyAdapter ?? {
      push: (url) =>
        window.history.pushState(
          { ...window.history.state, replicationViewer: true },
          "",
          url,
        ),
      replace: (url) =>
        window.history.replaceState(window.history.state, "", url),
      back: () => window.history.back(),
      viewerStateActive: () =>
        window.history.state?.replicationViewer === true,
    };
    sessionHolderRef.current = {
      collection: sourceCollection,
      historyAdapter,
      sourcePath: sourceCollection.sourcePath,
      session: createViewerSession({
        collection: sourceCollection,
        initialSlug: sessionInitialSlug,
        history,
        buildUrl: buildReplicationViewerUrl,
        closeUrl: closeReplicationViewerUrl,
        currentSource: () =>
          `${window.location.pathname}${window.location.search}${window.location.hash}`,
        onChange: (snapshot) => {
          setPosition(snapshot.position);
          setEntryMotion(snapshot.entry);
        },
      }),
    };
  }
  const session = sessionHolderRef.current.session;

  const group = position ? collection.groups[position.groupIndex] : null;
  const active = group && position ? group.items[position.itemIndex] : null;
  const activeSlug = active ? active.replication.slug : null;
  const activeSlugRef = useRef(activeSlug);
  activeSlugRef.current = activeSlug;
  const handleBufferHealthChange = useCallback(
    (mediaKey: string, healthy: boolean) => {
      if (mediaKey !== activeSlugRef.current) return;
      setBufferHealth((previous) =>
        previous?.mediaKey === mediaKey && previous.healthy === healthy
          ? previous
          : { mediaKey, healthy },
      );
    },
    [],
  );
  const allowNeighborPreload =
    active !== null &&
    (slideMotionSource(active.replication) === null ||
      (bufferHealth?.mediaKey === activeSlug && bufferHealth.healthy));

  const { canRotate, rotated, probeAspect } =
    useStageFit({
      mediaKey: activeSlug ?? "",
      type: active?.replication.type ?? "image",
      rotateMode,
      width: active?.replication.width,
      height: active?.replication.height,
    });

  // The track pool is deliberately not keyed by work: a remount would
  // destroy pooled <video> elements mid-flight — leaking their media
  // pipelines until GC (browsers cap live media players per page and then
  // silently refuse new loads) and discarding iOS Safari's per-element
  // unmuted playback blessing. Entry motion replays imperatively instead:
  // drop the animation classes, force a reflow, re-add them.
  useLayoutEffect(() => {
    const pane = trackPaneRef.current;
    if (!pane) return;
    pane.classList.remove(...ENTRY_MOTION_ALL_CLASSES);
    if (!entryMotion) return;
    // The reflow between remove and add is what restarts the animation.
    void pane.offsetWidth;
    pane.classList.add(...ENTRY_MOTION_CLASS[entryMotion].split(" "));
  }, [entryMotion, activeSlug]);

  useLayoutEffect(() => {
    const previousSlug = activeSlugRef.current;
    session.setCollection(sourceCollection);
    sessionHolderRef.current!.collection = sourceCollection;
    const nextPosition = session.snapshot().position;
    const nextSlug = nextPosition
      ? (sourceCollection.groups[nextPosition.groupIndex]?.items[
          nextPosition.itemIndex
        ]?.replication.slug ?? null)
      : null;
    setCollection(sourceCollection);
    setPosition(nextPosition);
    if (nextSlug !== previousSlug) {
      setInfoOpen(false);
      setDetails(null);
    }
  }, [session, sourceCollection]);

  useEffect(() => {
    session.syncFromUrl(initialSlug);
  }, [initialSlug, selectionRevision]);

  // Sound and rotate mode are session preferences, the way the phone feeds
  // treat them: each open starts from the stored choices instead of
  // hard-resetting to the defaults.
  useEffect(() => {
    if (!open) {
      setVolume(1);
      setInfoOpen(false);
      setSettingsOpen(false);
      setActiveVideo(null);
      setEditorOpen(false);
      setReorderMode(false);
      return;
    }
    let storedSound: string | null = null;
    let storedRotate: string | null = null;
    try {
      storedSound = window.sessionStorage.getItem(VIEWER_SOUND_STORAGE_KEY);
      storedRotate = window.sessionStorage.getItem(VIEWER_ROTATE_STORAGE_KEY);
    } catch {
      // Storage denied: fall back to the muted, upright defaults.
    }
    setMuted(resolveViewerMuted(storedSound));
    setRotateMode(resolveViewerRotateMode(storedRotate));
  }, [open]);

  const handleMutedChange = useCallback((nextMuted: boolean) => {
    setMuted(nextMuted);
    try {
      window.sessionStorage.setItem(
        VIEWER_SOUND_STORAGE_KEY,
        nextMuted ? "off" : "on",
      );
    } catch {
      // Best effort: a blocked write only means the choice lasts one open.
    }
  }, []);

  const handleRotateModeChange = useCallback((nextRotateMode: boolean) => {
    setRotateMode(nextRotateMode);
    try {
      window.sessionStorage.setItem(
        VIEWER_ROTATE_STORAGE_KEY,
        nextRotateMode ? "on" : "off",
      );
    } catch {
      // Best effort: a blocked write only means the choice lasts one open.
    }
  }, []);

  const handleTransportHandle = useCallback(
    (handle: ViewerTransportHandle | null) => {
      transportHandleRef.current = handle;
    },
    [],
  );

  useEffect(() => {
    if (!settingsOpen) return;
    const closeFromOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !settingsRef.current?.contains(event.target)
      ) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeFromOutside);
    return () => document.removeEventListener("pointerdown", closeFromOutside);
  }, [settingsOpen]);

  useEffect(() => {
    if (!open) return;

    const pauseBackgroundVideo = (video: HTMLVideoElement) => {
      const dialog = contentRef.current;
      if (!dialog || dialog.contains(video) || video.paused) return;
      if (!pausedBackgroundVideosRef.current.includes(video)) {
        pausedBackgroundVideosRef.current.push(video);
      }
      video.pause();
    };
    const stopBackgroundPlayback = (event: Event) => {
      if (event.target instanceof HTMLVideoElement) {
        pauseBackgroundVideo(event.target);
      }
    };
    document.addEventListener("play", stopBackgroundPlayback, true);

    const frame = window.requestAnimationFrame(() => {
      document.querySelectorAll("video").forEach(pauseBackgroundVideo);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("play", stopBackgroundPlayback, true);
      const videos = pausedBackgroundVideosRef.current;
      pausedBackgroundVideosRef.current = [];
      videos.forEach((video) => {
        if (video.isConnected) {
          void video.play().catch(() => undefined);
        }
      });
    };
  }, [open]);

  const navigate = useCallback(
    (
      next: ReplicationViewerPosition | null,
      entry: EntryMotion | null = null,
    ) => {
      if (!next) return;
      const slug =
        collection.groups[next.groupIndex]?.items[next.itemIndex]?.replication
          .slug;
      if (!slug) return;
      session.open(slug, entry);
      setInfoOpen(false);
      setDetails(null);
    },
    [collection, session],
  );

  // Announce arrival at a work after the reader moves (swipe, arrows, rail,
  // group jump). The initial work is skipped: the dialog title already
  // introduces it when focus lands on open.
  useEffect(() => {
    if (!open) {
      announcedSlugRef.current = null;
      setWorkAnnouncement("");
      return;
    }
    if (!active || !group || !position) return;
    const slug = active.replication.slug;
    if (announcedSlugRef.current === null) {
      announcedSlugRef.current = slug;
      return;
    }
    if (announcedSlugRef.current === slug) {
      setWorkAnnouncement(
        collectionPending ? t("Loading gallery results…") : "",
      );
      return;
    }
    announcedSlugRef.current = slug;
    if (collectionPending) {
      setWorkAnnouncement(t("Loading gallery results…"));
      return;
    }
    const values = {
      title: active.replication.title,
      position: position.itemIndex + 1,
      total: group.items.length,
    };
    setWorkAnnouncement(
      collection.groups.length > 1
        ? t("{{title}}, work {{position}} of {{total}}, {{group}}", {
            ...values,
            group: group.label,
          })
        : t("{{title}}, work {{position}} of {{total}}", values),
    );
  }, [
    open,
    active,
    group,
    position,
    collection.groups.length,
    collectionPending,
    t,
  ]);

  const activateEditorSlug = useCallback(
    (slug: string) => {
      session.open(slug, "fade");
    },
    [session],
  );

  const applyEditorOrder = useCallback(
    (slugs: readonly string[]) => {
      session.applyOrder(slugs);
    },
    [session],
  );

  const openInfo = useCallback(() => {
    const activeElement = document.activeElement;
    infoOpenerRef.current =
      activeElement instanceof HTMLElement ? activeElement : null;
    setInfoOpen(true);
  }, []);

  const closeInfo = useCallback(() => {
    setInfoOpen(false);
  }, []);

  useLayoutEffect(() => {
    if (infoOpen) {
      infoCloseRef.current?.focus({ preventScroll: true });
      return;
    }
    const opener = infoOpenerRef.current;
    infoOpenerRef.current = null;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }, [infoOpen]);

  const previousWork =
    !collectionPending && position
      ? moveViewerWork(collection, position, -1)
      : null;
  const nextWork =
    !collectionPending && position
      ? moveViewerWork(collection, position, 1)
      : null;
  // A regroup rebuilds the session before its collection reaches render state.
  // Keep previews on the rendered snapshot until that handoff, then resume
  // the session's remembered work within each neighboring group.
  const previousGroup = collectionPending
    ? null
    : collection === sourceCollection
      ? session.adjacentGroup(-1)
      : position
        ? moveViewerGroup(collection, position, -1)
        : null;
  const nextGroup = collectionPending
    ? null
    : collection === sourceCollection
      ? session.adjacentGroup(1)
      : position
        ? moveViewerGroup(collection, position, 1)
        : null;

  /**
   * One work over, with the track's slide animation when it can run it.
   * The track owns busy/endpoint decisions; there is deliberately no
   * direct-navigate fallback here — a second command during the ~200ms
   * commit window is dropped instead of double-stepping.
   */
  const slideWork = useCallback((direction: 1 | -1) => {
    trackRef.current?.slide(direction);
  }, []);

  const slideGroup = useCallback((direction: 1 | -1) => {
    trackRef.current?.slideGroup(direction);
  }, []);

  /** A completed track commit: the pool already rotated; land the position. */
  const commitWork = useCallback(
    (direction: 1 | -1) => {
      session.commitWork(direction);
      setInfoOpen(false);
      setDetails(null);
    },
    [session],
  );

  const commitGroup = useCallback(
    (direction: 1 | -1) => {
      session.commitGroup(direction);
      setInfoOpen(false);
      setDetails(null);
    },
    [session],
  );

  const surfaceTap = useCallback(() => {
    setGestureHint(false);
    transportHandleRef.current?.surfaceTap();
  }, []);

  useEffect(() => {
    if (!open || historyAdapter) return;
    const onPopState = () => {
      const slug = parseReplicationViewerSlug(
        new URLSearchParams(window.location.search),
      );
      if (!slug) {
        onOpenChange(false);
        return;
      }
      session.syncFromUrl(slug);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [historyAdapter, onOpenChange, open, session]);

  useEffect(() => {
    if (!infoOpen || !active) return;
    const controller = new AbortController();
    void fetch(`/api/v1/replications/${active.replication.slug}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (body?.data?.slug === active.replication.slug) {
          setDetails(body.data as PublicReplicationDetails);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [active, infoOpen]);

  const close = useCallback(() => {
    const finish = () => {
      const viewerStateActive =
        historyAdapter?.viewerStateActive() ?? window.history.state?.replicationViewer === true;
      session.close();
      if (!viewerStateActive) onOpenChange(false);
    };
    const beforeClose = new CustomEvent("replication-viewer-before-close", {
      cancelable: true,
      detail: { proceed: finish },
    });
    if (!document.dispatchEvent(beforeClose)) return;

    if (document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen().finally(finish);
    } else {
      finish();
    }
  }, [historyAdapter, onOpenChange, session]);

  const fullscreenSupported =
    typeof document !== "undefined" &&
    typeof document.documentElement.requestFullscreen === "function";
  const requestFullscreen = useCallback(() => {
    const content = contentRef.current;
    if (!content?.requestFullscreen) return;
    void content.requestFullscreen().catch(() => {
      setFullscreenNotice((count) => count + 1);
    });
  }, []);

  // The refusal chip clears itself: one glance's worth of explanation, then
  // the stage goes back to being all artwork.
  useEffect(() => {
    if (!fullscreenNotice) return;
    const timer = window.setTimeout(() => setFullscreenNotice(0), 2400);
    return () => window.clearTimeout(timer);
  }, [fullscreenNotice]);

  useEffect(() => {
    if (!open) return;
    if (infoOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        return;
      // Keydown targets the focused element or body — but never assume:
      // a non-element target (window in tests) simply has no guard to hit.
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && (editorPanelHost?.contains(target) || editorRailHost?.contains(target))) return;
      if (
        target?.isContentEditable ||
        (target && /^(INPUT|TEXTAREA|SELECT|VIDEO|AUDIO)$/.test(target.tagName))
      ) {
        return;
      }
      // Playback shortcuts, the video-player lingua franca: Space/K toggle
      // playback, M toggles sound, F enters fullscreen, H hides the chrome.
      // Space keeps its native meaning on focused controls; the letters act
      // from anywhere outside a text field (guarded above).
      const key = event.key.toLowerCase();
      if (
        key === " " ||
        key === "k" ||
        key === "m" ||
        key === "f" ||
        key === "h"
      ) {
        if (
          key === " " &&
          target?.closest("button, a, [role='slider'], [role='menu']")
        ) {
          return;
        }
        if (key === "f") {
          if (!fullscreenSupported) return;
          event.preventDefault();
          requestFullscreen();
          return;
        }
        const handle = transportHandleRef.current;
        if (!handle) return;
        event.preventDefault();
        if (key === "h") {
          handle.toggleChrome();
        } else if (key === "m") {
          handle.toggleMuted();
        } else {
          handle.togglePlayback();
        }
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        slideWork(event.key === "ArrowRight" ? 1 : -1);
        return;
      }
      const direction =
        event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : null;
      if (
        direction === null ||
        (direction === -1 ? !previousGroup : !nextGroup)
      ) {
        return;
      }
      event.preventDefault();
      slideGroup(direction);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    slideGroup,
    editorPanelHost,
    editorRailHost,
    fullscreenSupported,
    infoOpen,
    nextGroup,
    open,
    previousGroup,
    requestFullscreen,
    slideWork,
  ]);

  // First-open gesture onboarding: coarse-pointer readers learn the swipe
  // grammar once, then the chip never returns on this device.
  useEffect(() => {
    if (!open || typeof window.matchMedia !== "function") return;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(GESTURE_HINT_STORAGE_KEY);
    } catch {
      return; // Storage denied: skip rather than nag on every open.
    }
    if (!shouldShowGestureHint(stored, coarse)) return;
    try {
      window.localStorage.setItem(GESTURE_HINT_STORAGE_KEY, "seen");
    } catch {
      // Best effort: a blocked write only means the hint may show again.
    }
    setGestureHint(true);
    const timer = window.setTimeout(() => setGestureHint(false), 9000);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Panels pin the interface; otherwise the reader's explicit choice wins.
  const chromeHidden =
    !chromeVisible && !settingsOpen && !infoOpen && !editorOpen && !reorderMode;
  useLayoutEffect(() => {
    const dialog = contentRef.current;
    const focused = document.activeElement;
    if (
      chromeHidden &&
      dialog &&
      focused instanceof HTMLElement &&
      dialog.contains(focused) &&
      focused.closest("header, nav")
    ) {
      dialog.focus({ preventScroll: true });
    }
  }, [chromeHidden]);

  if (!active || !position || !group) return null;
  const knownArtist = hasKnownCreator(active.replication.artist)
    ? active.replication.artist.trim()
    : null;
  // viewerModel already stores the msg("Unattributed") marker for showcase
  // works with no creator; it reaches the reader through the same key.
  const artistLabel =
    knownArtist && knownArtist !== "Unattributed" ? knownArtist : t("Unattributed");
  const artistProfileHref = hasKnownCreator(active.replication.artist)
    ? active.artistProfileHref
    : null;

  const groupUnit =
    GROUP_UNIT_COPY[
      collection.grouping === "artist"
        ? "artist"
        : collection.grouping === "effect" || collection.kind === "substance"
          ? "effect"
          : "group"
    ];


  const showRail = !collectionPending && group.items.length > 1 && !reorderMode;
  const positionKey = `${group.key}|${active.replication.slug}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
    >
      {open && editorEnabled ? (
        <EditorLauncherTarget
          priority="overlay"
          target={
            sourceCollection.editorTarget?.kind === "substance"
              ? {
                  kind: "replications",
                  slug: sourceCollection.editorTarget.key,
                  name: sourceCollection.editorTarget.label,
                }
              : { kind: "generic", name: sourceCollection.label }
          }
        />
      ) : null}
      <DialogContent
        ref={contentRef}
        aria-modal="true"
        aria-busy={collectionPending || undefined}
        showClose={false}
        onOpenAutoFocus={(event) => {
          sourceFocusTargetRef.current =
            document.querySelector<HTMLElement>(
              "[data-replication-collection-heading]",
            ) ??
            document.querySelector<HTMLElement>(
              "#replications h2, #replications h3, main h1",
            );
          const activeElement = document.activeElement;
          openerRef.current =
            activeElement instanceof HTMLElement &&
            activeElement !== document.body &&
            !contentRef.current?.contains(activeElement)
              ? activeElement
              : null;
          event.preventDefault();
          contentRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (editorOpen) {
            event.preventDefault();
            setEditorOpen(false);
            setReorderMode(false);
            return;
          }
          if (settingsOpen) {
            event.preventDefault();
            setSettingsOpen(false);
            settingsButtonRef.current?.focus();
            return;
          }
          if (infoOpen) {
            event.preventDefault();
            closeInfo();
            return;
          }
          // Exit native fullscreen first without dismissing the collection.
          if (document.fullscreenElement) {
            event.preventDefault();
            void document.exitFullscreen();
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const opener = openerRef.current;
          openerRef.current = null;
          if (opener?.isConnected) {
            opener.focus({ preventScroll: true });
            return;
          }
          const rememberedTarget = sourceFocusTargetRef.current;
          sourceFocusTargetRef.current = null;
          const heading = rememberedTarget?.isConnected
            ? rememberedTarget
            : (document.querySelector<HTMLElement>(
                "[data-replication-collection-heading]",
              ) ??
              document.querySelector<HTMLElement>(
                "#replications h2, #replications h3, main h1",
              ));
          if (!heading) return;
          if (!heading.hasAttribute("tabindex")) {
            heading.setAttribute("tabindex", "-1");
          }
          heading.focus({ preventScroll: true });
        }}
        onPointerDownCapture={() => {
          // Any gesture retires the onboarding chip.
          setGestureHint(false);
        }}
        tabIndex={-1}
        className={`${VIEWER_DIALOG_CLASS}${editorOpen ? " [&_[data-editor-launcher]]:hidden" : ""}`}
      >
        {open && editorEnabled ? <EditorLauncherOutlet /> : null}
        <DialogDescription className="sr-only">
          {collectionPending
            ? t("Loading gallery results…")
            : t(
                "Viewing {{title}} by {{artist}}. {{collection}}. Work {{position}} of {{total}}.",
                {
                  title: active.replication.title,
                  artist: artistLabel,
                  collection: t(collection.label),
                  position: position.itemIndex + 1,
                  total: group.items.length,
                },
              )}
        </DialogDescription>
        <header
          inert={infoOpen || chromeHidden || undefined}
          aria-hidden={infoOpen || chromeHidden || undefined}
          className={cn(
            "theme-media-thumbnail-border absolute inset-x-0 top-0 z-10 flex min-w-0 flex-wrap items-center gap-2 bg-black/75 py-1.5 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(0.375rem,env(safe-area-inset-top))] transition-opacity duration-200 motion-reduce:transition-none sm:min-h-16 sm:gap-3 sm:px-6 sm:py-2",
            chromeHidden && "opacity-0",
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {active.avatarUrl ? (
              <RotatingIcon rotated={rotated} className="shrink-0">
                <AppImage
                  src={active.avatarUrl}
                  alt=""
                  width={36}
                  height={36}
                  unoptimized
                  className="size-8 shrink-0 rounded-full object-cover sm:size-9"
                />
              </RotatingIcon>
            ) : null}
            <div className="min-w-0 flex-1">
              <DialogTitle className="theme-media-tile-title truncate text-sm font-semibold sm:text-base">
                {artistProfileHref ? (
                  <Link
                    href={artistProfileHref}
                    className={cn(
                      "underline decoration-current/40 underline-offset-2 transition-opacity hover:opacity-80",
                      focusRingClassName,
                    )}
                  >
                    {artistLabel}
                  </Link>
                ) : artistLabel}
                <span className="sr-only">, {active.replication.title}</span>
              </DialogTitle>
              <p className="theme-media-tile-creator truncate text-xs">
                {active.replication.title}
              </p>
            <p
              aria-hidden="true"
              className="theme-media-tile-creator flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11px] tabular-nums sm:text-xs"
            >
              {collection.grouping === "effect" ? (
                <>
                  <span className="max-w-[9rem] truncate sm:max-w-[16rem]">
                    {group.label}
                  </span>
                  <span aria-hidden>·</span>
                </>
              ) : null}
              {collectionPending ? (
                <span className="shrink-0">
                  {t("Loading gallery results…")}
                </span>
              ) : (
                <>
                  <span className="shrink-0">
                    {t("Work {{position}}/{{total}}", {
                      position: position.itemIndex + 1,
                      total: group.items.length,
                    })}
                  </span>
                  {collection.groups.length > 1 ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="shrink-0">
                        {t(groupUnit.counter, {
                          position: position.groupIndex + 1,
                          total: collection.groups.length,
                        })}
                      </span>
                    </>
                  ) : null}
                </>
              )}
            </p>
            </div>
          </div>
          {collection.groups.length > 1 ? (
            <div className="sr-only flex flex-none items-center gap-1 focus-within:not-sr-only sm:not-sr-only">
              <button
                type="button"
                aria-label={
                  collectionPending
                    ? t("Loading gallery results…")
                    : previousGroup
                      ? t(groupUnit.previous, {
                          label:
                            collection.groups[previousGroup.groupIndex].label,
                        })
                      : t(groupUnit.first)
                }
                disabled={!previousGroup}
                onClick={() => slideGroup(-1)}
                className={cn(
                  "theme-media-control-raised grid size-11 place-items-center rounded-lg disabled:cursor-not-allowed disabled:opacity-30 sm:size-10 sm:rounded-md",
                  focusRingClassName,
                )}
              >
                <Icon icon="lucide:chevron-up" className="size-4" />
              </button>
              <button
                type="button"
                aria-label={
                  collectionPending
                    ? t("Loading gallery results…")
                    : nextGroup
                      ? t(groupUnit.next, {
                          label: collection.groups[nextGroup.groupIndex].label,
                        })
                      : t(groupUnit.final)
                }
                disabled={!nextGroup}
                onClick={() => slideGroup(1)}
                className={cn(
                  "theme-media-control-raised grid size-11 place-items-center rounded-lg disabled:cursor-not-allowed disabled:opacity-30 sm:size-10 sm:rounded-md",
                  focusRingClassName,
                )}
              >
                <Icon icon="lucide:chevron-down" className="size-4" />
              </button>
            </div>
          ) : null}
          {onRegroup && collection.kind === "gallery" ? (
            <div ref={settingsRef} className="relative flex-none">
              <button
                ref={settingsButtonRef}
                type="button"
                aria-label={t("Viewer settings")}
                aria-haspopup="menu"
                aria-expanded={settingsOpen}
                onClick={() => setSettingsOpen((current) => !current)}
                className={cn(
                  "theme-media-tile-title theme-media-control-raised grid size-11 place-items-center rounded-lg",
                  focusRingClassName,
                )}
              >
                <RotatingIcon rotated={rotated}>
                  <Icon icon="lucide:sliders-horizontal" className="size-5" />
                </RotatingIcon>
              </button>
              {settingsOpen ? (
                <div
                  role="menu"
                  aria-label={t("Viewer settings")}
                  className={cn(
                    "absolute right-0 top-full z-[80] mt-2 min-w-36 origin-top-right overflow-y-auto transition-transform duration-200 motion-reduce:transition-none",
                    rotated
                      ? "max-h-[calc(100vw-6rem)]"
                      : "max-h-[calc(100dvh-6rem)]",
                  )}
                  style={{
                    transform: rotated ? "rotate(90deg) translateX(100%)" : "none",
                  }}
                >
                  <div className="theme-reveal-enter theme-media-settings-menu theme-media-tile-title rounded-xl border p-1">
                  <p className="px-2 py-1.5 text-xs font-semibold">{t("Sort by")}</p>
                  {(["artist", "effect"] as const).map((grouping) => (
                    <button
                      key={grouping}
                      type="button"
                      role="menuitemradio"
                      aria-checked={collection.grouping === grouping}
                      onClick={() => {
                        setSettingsOpen(false);
                        if (grouping !== collection.grouping) {
                          session.regroup(grouping, active.replication.slug);
                          onRegroup(grouping, active.replication.slug);
                        }
                      }}
                      className={cn(
                        "theme-media-settings-item flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm focus:outline-none",
                        focusRingClassName,
                      )}
                    >
                      <span
                        aria-hidden
                        className="grid size-2 place-items-center rounded-full border border-current"
                      >
                        {collection.grouping === grouping ? (
                          <span className="size-1 rounded-full bg-current" />
                        ) : null}
                      </span>
                      {grouping === "artist" ? t("Artist") : t("Effect")}
                    </button>
                  ))}
                  <div
                    aria-hidden
                    className="theme-media-thumbnail-border mx-1 my-1 border-t"
                  />
                  <p className="px-2 py-1.5 text-xs font-semibold">
                    {t("Shortcuts")}
                  </p>
                  <dl className="theme-media-tile-creator grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 px-2 pb-2 text-xs">
                    {(
                      [
                        ["← →", t("Works")],
                        ["↑ ↓", t(groupUnit.plural)],
                        ["Space / K", t("Play")],
                        ["M", t("Mute")],
                        ["H", t("Hide interface")],
                        ...(fullscreenSupported
                          ? [["F", t("Fullscreen")] as const]
                          : []),
                      ] as const
                    ).map(([keys, action]) => (
                      <div key={action} className="contents">
                        <dt className="theme-media-control-raised justify-self-start whitespace-nowrap rounded px-1.5 py-0.5 font-semibold tabular-nums">
                          {keys}
                        </dt>
                        <dd>{action}</dd>
                      </div>
                    ))}
                  </dl>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {editorEnabled ? <ReplicationViewerEditorGate
            collection={collection}
            activeSlug={active.replication.slug}
            panelHost={editorPanelHost}
            railHost={editorRailHost}
            open={editorOpen}
            onOpenChange={setEditorOpen}
            onReorderModeChange={setReorderMode}
            onActivateSlug={activateEditorSlug}
            onOrderChange={applyEditorOrder}
          /> : null}
          <button
            type="button"
            onClick={close}
            aria-label={t("Close replication viewer")}
            className={cn(
              "theme-media-tile-title theme-media-control-raised grid size-11 flex-none place-items-center rounded-lg",
              focusRingClassName,
            )}
          >
            <Icon icon="lucide:x" className="size-5" />
          </button>
        </header>
        <p
          role={collectionPending ? "status" : undefined}
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {collectionPending ? t("Loading gallery results…") : workAnnouncement}
        </p>

        <div
          className={cn(
            "relative grid min-h-0 min-w-0 overflow-hidden transition-[grid-template-columns] duration-200 motion-reduce:transition-none",
            editorOpen
              ? "grid-cols-[minmax(0,1fr)] grid-rows-[minmax(8rem,1fr)_minmax(0,1fr)] [&:has([data-publication-review])]:grid-rows-[8rem_minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_22rem] md:grid-rows-1 md:[&:has([data-publication-review])]:grid-rows-1"
              : "grid-cols-[minmax(0,1fr)]",
          )}
        >
          <div
            inert={infoOpen || undefined}
            aria-hidden={infoOpen || undefined}
            className={cn(
              "relative min-h-0 min-w-0 h-full w-full overflow-hidden",
              showRail
                ? "[--viewer-rail-height:calc(3.375rem+max(0.375rem,env(safe-area-inset-bottom)))] sm:[--viewer-rail-height:4.5rem] [@media(max-height:500px)]:[--viewer-rail-height:0px]"
                : "[--viewer-rail-height:0px]",
            )}
          >
            <div className="relative h-full min-h-0 min-w-0 overflow-hidden bg-black [container-type:size]">
              <div ref={trackPaneRef} className="h-full w-full">
                <ViewerMediaTrack
                  ref={trackRef}
                  previousItem={
                    previousWork ? group.items[previousWork.itemIndex] : null
                  }
                  activeItem={active}
                  nextItem={nextWork ? group.items[nextWork.itemIndex] : null}
                  positionKey={positionKey}
                  previousGroupItem={
                    previousGroup
                      ? collection.groups[previousGroup.groupIndex].items[previousGroup.itemIndex]
                      : null
                  }
                  nextGroupItem={
                    nextGroup
                      ? collection.groups[nextGroup.groupIndex].items[nextGroup.itemIndex]
                      : null
                  }
                  autoplayAllowed
                  allowNeighborPreload={allowNeighborPreload}
                  rotateMode={rotateMode}
                  onActiveVideoChange={setActiveVideo}
                  onNavigateWork={commitWork}
                  onNavigateGroup={commitGroup}
                  onSurfaceTap={surfaceTap}
                  onProbeAspect={probeAspect}
                  controlsVisible={chromeVisible}
                />
              </div>
              <ViewerTransport
                item={active}
                video={activeVideo}
                muted={muted}
                volume={volume}
                onMutedChange={handleMutedChange}
                onVolumeChange={setVolume}
                onPrevious={previousWork ? () => slideWork(-1) : undefined}
                onNext={nextWork ? () => slideWork(1) : undefined}
                rotateMode={rotateMode}
                rotated={rotated}
                onBufferHealthChange={handleBufferHealthChange}
                onRotateModeChange={handleRotateModeChange}
                canRotate={canRotate}
                onTransportVisibleChange={setChromeVisible}
                onTransportHandle={handleTransportHandle}
                onInfo={openInfo}
                infoOpen={infoOpen}
                infoControls={infoPanelId}
                onFullscreen={requestFullscreen}
                fullscreenSupported={fullscreenSupported}
                previousLabel={
                  collectionPending
                    ? t("Loading gallery results…")
                    : previousWork
                      ? t("Previous: {{title}}", {
                          title:
                            group.items[previousWork.itemIndex].replication.title,
                        })
                      : t("First work")
                }
                nextLabel={
                  collectionPending
                    ? t("Loading gallery results…")
                    : nextWork
                      ? t("Next: {{title}}", {
                          title: group.items[nextWork.itemIndex].replication.title,
                        })
                      : t("Final work")
                }
              />
              {fullscreenNotice ? (
                <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex justify-center">
                  <p
                    role="status"
                    className="theme-media-tile-title flex min-h-8 items-center rounded-full bg-black/65 px-3.5 py-2 text-xs font-semibold backdrop-blur-sm animate-in fade-in-0 duration-200 motion-reduce:animate-none"
                  >
                    {t("Fullscreen is unavailable.")}
                  </p>
                </div>
              ) : null}
              {gestureHint ? (
                <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center">
                  <div className="theme-media-tile-title pointer-events-auto flex flex-col items-center gap-3 rounded-2xl bg-black/65 px-6 py-4 backdrop-blur-sm animate-in fade-in-0 zoom-in-95 duration-300 motion-reduce:animate-none">
                    <div aria-hidden className="flex items-end gap-8">
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex items-center gap-2">
                          <Icon
                            icon="lucide:chevron-left"
                            className="size-4 opacity-60"
                          />
                          <span className="theme-media-hint-track relative h-7 w-14">
                            <span className="theme-media-hint-dot">
                              <Icon icon="lucide:pointer" className="size-5" />
                            </span>
                          </span>
                          <Icon
                            icon="lucide:chevron-right"
                            className="size-4 opacity-60"
                          />
                        </div>
                        <p className="text-xs font-semibold">{t("Browse works")}</p>
                      </div>
                      {collection.groups.length > 1 ? (
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex flex-col items-center gap-1">
                            <Icon
                              icon="lucide:chevron-up"
                              className="size-4 opacity-60"
                            />
                            <span className="theme-media-hint-track-y relative h-10 w-7">
                              <span className="theme-media-hint-dot-y">
                                <Icon
                                  icon="lucide:pointer"
                                  className="size-5"
                                />
                              </span>
                            </span>
                            <Icon
                              icon="lucide:chevron-down"
                              className="size-4 opacity-60"
                            />
                          </div>
                          <p className="text-xs font-semibold">
                            {t(groupUnit.switchHint)}
                          </p>
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => setGestureHint(false)}
                      className={cn(
                        "theme-media-control-raised w-full rounded-full px-4 py-2 text-xs font-semibold",
                        focusRingClassName,
                      )}
                    >
                      {t("Got it")}
                    </button>
                  </div>
                </div>
              ) : null}
              <div ref={setEditorRailHost} />
            </div>

            {showRail ? (
              <ViewerThumbnailRail
                items={group.items}
                selectedIndex={position.itemIndex}
                groupLabel={group.label}
                rotated={rotated}
                chromeHidden={chromeHidden}
                onSelect={(itemIndex) =>
                  navigate(
                    { groupIndex: position.groupIndex, itemIndex },
                    "fade",
                  )
                }
                focusRingClassName={focusRingClassName}
              />
            ) : null}
          </div>
          {editorOpen ? (
            <aside
              ref={setEditorPanelHost}
              className="theme-media-thumbnail-border theme-text-primary min-h-0 min-w-0 overflow-y-auto border-t bg-dose-body md:mt-20 md:border-t-0 md:border-l"
              aria-label="Replication and collection editor"
            />
          ) : null}
        </div>

        {infoOpen ? (
          <aside
            id={infoPanelId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={infoHeadingId}
            className="theme-overlay-enter theme-media-tile-title theme-media-thumbnail-border theme-media-overlay-shadow absolute bottom-0 right-0 top-14 z-20 w-full max-w-md overflow-y-auto border-l bg-black/95 p-5 text-sm sm:top-20 sm:w-[26rem]"
          >
            <div className="flex items-center justify-between gap-3">
              <h2
                id={infoHeadingId}
                className="theme-media-tile-title font-display text-lg font-semibold"
              >
                {t("Information")}
              </h2>
              <button
                type="button"
                ref={infoCloseRef}
                aria-label={t("Close information")}
                onClick={closeInfo}
                className={cn(
                  "theme-media-control-soft grid size-11 place-items-center rounded-lg",
                  focusRingClassName,
                )}
              >
                <Icon icon="lucide:x" className="size-5" />
              </button>
            </div>
            <dl className="theme-media-tile-creator mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3">
              <dt>{t("Format")}</dt>
              <dd className="theme-media-tile-title">
                {details?.format ?? active.replication.format}
              </dd>
              {(details?.width ?? active.replication.width) &&
              (details?.height ?? active.replication.height) ? (
                <>
                  <dt>{t("Dimensions")}</dt>
                  <dd className="theme-media-tile-title">
                    {details?.width ?? active.replication.width} ×{" "}
                    {details?.height ?? active.replication.height}
                  </dd>
                </>
              ) : null}
              {details?.date_info?.value || details?.created_at ? (
                <>
                  <dt>{details.date_info?.value ? t("Work date") : t("Added")}</dt>
                  <dd className="theme-media-tile-title">
                    <time
                      dateTime={details.date_info?.value ?? details.created_at}
                    >
                      {details.date_info?.value ??
                        formatArchiveDate(details.created_at) ??
                        details.created_at}
                    </time>
                  </dd>
                </>
              ) : null}
              {active.effectName ? (
                <>
                  <dt>{t("Represents")}</dt>
                  <dd className="theme-media-tile-title">
                    {active.effectSlug ? (
                      <a
                        href={publicHref.effect(active.effectSlug)}
                        className="underline underline-offset-2"
                      >
                        {active.effectName}
                      </a>
                    ) : (
                      active.effectName
                    )}
                  </dd>
                </>
              ) : null}
              {details?.rights?.status ? (
                <>
                  <dt>{t("Rights status")}</dt>
                  <dd className="theme-media-tile-title capitalize">
                    {details.rights.status.replace(/[_-]/g, " ")}
                  </dd>
                </>
              ) : null}
              {details?.rights?.license_name ? (
                <>
                  <dt>{t("Licence")}</dt>
                  <dd className="theme-media-tile-title">
                    {details.rights.license_url ? (
                      <a
                        href={details.rights.license_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2"
                      >
                        {details.rights.license_name}
                      </a>
                    ) : (
                      details.rights.license_name
                    )}
                  </dd>
                </>
              ) : null}
              {details?.rights?.rightsholder ? (
                <>
                  <dt>{t("Rights holder")}</dt>
                  <dd className="theme-media-tile-title">
                    {details.rights.rightsholder}
                  </dd>
                </>
              ) : null}
              {details?.rights?.source_url ? (
                <>
                  <dt>{t("Source")}</dt>
                  <dd className="theme-media-tile-title min-w-0">
                    <a
                      href={details.rights.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate underline underline-offset-2"
                    >
                      {t("Original source")}
                    </a>
                  </dd>
                </>
              ) : null}
            </dl>
            <a
              href={publicHref.replication(active.replication.slug)}
              className={cn(
                "theme-media-action mt-6 inline-flex min-h-11 items-center rounded-full px-4 font-semibold",
                focusRingClassName,
              )}
            >
              {t("Open full details")}
            </a>
          </aside>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
