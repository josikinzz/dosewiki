"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import { roleMeetsFloor, type AppRole } from "@/lib/auth/roles";
import { DEV_TAB_REGISTRY, type DevTabDescriptor } from "./devTabRegistry";

/** A badge a descriptor can declare; the rail renders it beside the tab. */
type DescriptorBadge = NonNullable<DevTabDescriptor["badge"]>;

/**
 * The badge the Inbox declares. It has no endpoint of its own: its count is
 * the sum of every count source below that the role may read, so the Inbox
 * number and the queues it lists cannot disagree.
 */
const INBOX_BADGE = "inbox" satisfies DescriptorBadge;

/**
 * A count source with its own endpoint. Review recommendations wait on an
 * admin but have no tab of their own (they sit inside Change Review), so they
 * only reach the rail through the Inbox count.
 */
export type DevRailBadge = Exclude<DescriptorBadge, typeof INBOX_BADGE> | "review-recommendations";

/** Counts the rail shows right now, keyed by badge name; absent while unknown or zero. */
export type DevRailBadgeCounts = Readonly<Partial<Record<DescriptorBadge, number>>>;

/**
 * What one count endpoint answered: the badge total, plus the per-source split
 * when the endpoint returns one (feedback answers `{ article, site, total }`).
 */
type BadgeReading = { count: number; parts?: Readonly<Record<string, number>> };

type BadgeSource = { url: string; read: (payload: Record<string, unknown>) => BadgeReading | null };

function numberField(name: string): BadgeSource["read"] {
  return (payload) => {
    const count = payload[name];
    return typeof count === "number" ? { count } : null;
  };
}

/** Where each badge's count comes from, and how to read its JSON answer. */
const BADGE_SOURCES: Record<DevRailBadge, BadgeSource> = {
  "trip-reports": { url: "/api/dev/trip-reports/needs-review-count", read: numberField("count") },
  feedback: {
    url: "/api/feedback/pending-count",
    read: ({ article, site, total }) =>
      typeof total === "number" && typeof article === "number" && typeof site === "number"
        ? { count: total, parts: { article, site } }
        : null,
  },
  proposals: { url: "/api/dev/proposals/count", read: numberField("submitted") },
  citations: { url: "/api/citation-evidence/open-count", read: numberField("count") },
  "glossary-feedback": { url: "/api/glossary-feedback/pending-count", read: numberField("total") },
  "review-recommendations": {
    url: "/api/dev/review-recommendations",
    read: ({ recommendations }) => (Array.isArray(recommendations) ? { count: recommendations.length } : null),
  },
};

const BADGES = Object.keys(BADGE_SOURCES) as DevRailBadge[];

/**
 * The badged tab's role floor: a member below it never asks for that count.
 * Review recommendations have no tab; approving them is admin work.
 */
const BADGE_FLOORS = {
  "review-recommendations": "admin",
  ...Object.fromEntries(
    DEV_TAB_REGISTRY.flatMap((tab) => (tab.badge && tab.badge !== INBOX_BADGE ? [[tab.badge, tab.role]] : [])),
  ),
} as Record<DevRailBadge, DevTabDescriptor["role"]>;

/** The Inbox's own floor: below it the Inbox count is never assembled. */
const INBOX_FLOOR = DEV_TAB_REGISTRY.find((tab) => tab.badge === INBOX_BADGE)?.role ?? "admin";

/** Every count the Inbox lists, in the order it names them. */
export const INBOX_BADGE_PARTS: readonly DevRailBadge[] = BADGES;

type BadgeEntry = {
  /** Last count the rail saw; null until the endpoint has answered once. */
  count: number | null;
  /** The per-source split behind `count`, when the endpoint reports one. */
  parts: Readonly<Record<string, number>> | null;
  /** When `count` last arrived (epoch ms); null until it has. */
  updatedAt: number | null;
  /**
   * Set when the latest request failed and cleared by the next success. A
   * failure never touches `count`: the last known count stays, marked stale.
   */
  failed: boolean;
  /** Bumped by every invalidation; a mounted rail refetches when it changes. */
  generation: number;
};

type BadgeSnapshot = Readonly<Record<DevRailBadge, BadgeEntry>>;

const INITIAL_SNAPSHOT = Object.fromEntries(
  BADGES.map((badge) => [badge, { count: null, parts: null, updatedAt: null, failed: false, generation: 0 }]),
) as BadgeSnapshot;

/**
 * Plain module store, read through `useSyncExternalStore`. Lives outside React
 * so moving between dev tools does not make a badge blink away and back, and
 * so a tool can tell the rail that a count it painted is stale.
 */
let snapshot: BadgeSnapshot = INITIAL_SNAPSHOT;
let activeOwner: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Mark one painted count stale. Every tool transition that can move a row in
 * or out of the counted bucket calls this; any mounted rail refetches that
 * badge and only that badge.
 */
export function invalidateDevRailBadge(badge: DevRailBadge) {
  const entry = snapshot[badge];
  snapshot = { ...snapshot, [badge]: { ...entry, generation: entry.generation + 1 } };
  emit();
}

export function resetDevRailBadgesForTests() {
  activeOwner = null;
  snapshot = INITIAL_SNAPSHOT;
  emit();
}

async function readCount(badge: DevRailBadge): Promise<BadgeReading | null> {
  const source = BADGE_SOURCES[badge];
  try {
    const response = await fetch(source.url);
    if (!response.ok) {
      return null;
    }
    const payload: unknown = await response.json();
    return payload !== null && typeof payload === "object" ? source.read(payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function loadCount(badge: DevRailBadge, generation: number, owner: string) {
  const reading = await readCount(badge);
  // An invalidation raced this answer: the refetch it triggered wins.
  if (activeOwner !== owner || snapshot[badge].generation !== generation) {
    return;
  }

  const entry = snapshot[badge];
  snapshot = {
    ...snapshot,
    // A failed read keeps the last known count and marks it stale; the rail
    // badge still shows it, and the opened queue says how old it is.
    [badge]: reading
      ? { count: reading.count, parts: reading.parts ?? null, updatedAt: Date.now(), failed: false, generation }
      : { ...entry, failed: true },
  };
  emit();
}

/**
 * How much work is waiting inside each badged tool.
 *
 * Deliberately not part of the shell's first render path: it starts at whatever
 * a previous visit cached (or nothing), fetches in the background, and a tab
 * simply gains a badge when its answer arrives. A tool count is never worth
 * delaying the rail the editor is trying to click.
 *
 * This lives beside the shell rather than inside any tool so the rail does not
 * pull a tool's bundle into first paint.
 */
export function useDevRailBadges(role: AppRole | null, actorEmail?: string | null): DevRailBadgeCounts {
  const current = useSyncExternalStore(subscribe, () => snapshot, () => INITIAL_SNAPSHOT);
  // Generations this mount has already asked for; a remount asks again.
  const requestedRef = useRef<Partial<Record<DevRailBadge, number>>>({});
  const owner = `${role ?? "signed-out"}:${actorEmail ?? ""}`;

  useEffect(() => {
    if (activeOwner !== owner) {
      activeOwner = owner;
      snapshot = INITIAL_SNAPSHOT;
      requestedRef.current = {};
      emit();
    }
    for (const badge of BADGES) {
      if (!roleMeetsFloor(role, BADGE_FLOORS[badge])) {
        continue;
      }
      const { generation } = snapshot[badge];
      if (requestedRef.current[badge] === generation) {
        continue;
      }
      requestedRef.current[badge] = generation;
      void loadCount(badge, generation, owner);
    }
  }, [role, current, owner]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      for (const badge of BADGES) {
        if (roleMeetsFloor(role, BADGE_FLOORS[badge])) invalidateDevRailBadge(badge);
      }
    };
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [role, owner]);

  const counts: Partial<Record<DescriptorBadge, number>> = {};
  let inboxTotal = 0;
  for (const badge of BADGES) {
    if (activeOwner !== owner || !roleMeetsFloor(role, BADGE_FLOORS[badge])) continue;
    const { count } = current[badge];
    if (count !== null && count > 0) {
      inboxTotal += count;
      if (badge !== "review-recommendations") counts[badge] = count;
    }
  }
  if (inboxTotal > 0 && roleMeetsFloor(role, INBOX_FLOOR)) {
    counts[INBOX_BADGE] = inboxTotal;
  }
  return counts;
}

/**
 * The per-source split behind one badge, for a tool that shows it beside its
 * own source filter. Null until the shell's rail has loaded that count, and
 * for another account's cached answer.
 */
export function useDevRailBadgeParts(badge: DevRailBadge): Readonly<Record<string, number>> | null {
  const current = useSyncExternalStore(subscribe, () => snapshot, () => INITIAL_SNAPSHOT);
  return current[badge].parts;
}

/** What an opened queue needs to say about its rail count: how fresh it is. */
export type DevRailBadgeStatus = {
  /** Last known count; null while it has never loaded. */
  count: number | null;
  /** When `count` arrived (epoch ms); null while it has never loaded. */
  updatedAt: number | null;
  /** True when the latest request failed: `count` is the last known, not the current, value. */
  failed: boolean;
  /** Ask the mounted rail to fetch this count again. */
  retry: () => void;
};

/**
 * One badge's count with its freshness, for the queue the badge points at.
 * The rail keeps showing the last known count on failure, so this is where
 * an editor learns the number may be old.
 */
export function useDevRailBadgeStatus(badge: DevRailBadge): DevRailBadgeStatus {
  const current = useSyncExternalStore(subscribe, () => snapshot, () => INITIAL_SNAPSHOT);
  const { count, updatedAt, failed } = current[badge];
  return { count, updatedAt, failed, retry: () => invalidateDevRailBadge(badge) };
}
