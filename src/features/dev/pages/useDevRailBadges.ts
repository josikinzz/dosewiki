"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import { roleMeetsFloor, type AppRole } from "@/lib/auth/roles";
import { DEV_TAB_REGISTRY, INBOX_ROLLUP_BADGE, type DevTabDescriptor } from "./devTabRegistry";

type DescriptorBadge = NonNullable<DevTabDescriptor["badge"]>;

const INBOX_BADGE = INBOX_ROLLUP_BADGE;
const OUTSIDE_INBOX_TOTAL: ReadonlySet<DevRailBadge> = new Set(["citations"]);

export type DevRailBadge = Exclude<DescriptorBadge, typeof INBOX_BADGE> | "review-recommendations";

export type DevRailBadgeCounts = Readonly<Partial<Record<DescriptorBadge, number>>>;

type BadgeReading = { count: number; parts?: Readonly<Record<string, number>> };

type BadgeSource = { url: string; read: (payload: Record<string, unknown>) => BadgeReading | null };

function numberField(name: string): BadgeSource["read"] {
  return (payload) => {
    const count = payload[name];
    return typeof count === "number" ? { count } : null;
  };
}

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

const BADGE_FLOORS = {
  "review-recommendations": "admin",
  ...Object.fromEntries(
    DEV_TAB_REGISTRY.flatMap((tab) => (tab.badge && tab.badge !== INBOX_BADGE ? [[tab.badge, tab.role]] : [])),
  ),
} as Record<DevRailBadge, DevTabDescriptor["role"]>;

const INBOX_FLOOR = DEV_TAB_REGISTRY.find((tab) => tab.badge === INBOX_BADGE)?.role ?? "admin";

export const INBOX_BADGE_PARTS: readonly DevRailBadge[] = BADGES;

type BadgeEntry = {
  count: number | null;
  parts: Readonly<Record<string, number>> | null;
  updatedAt: number | null;
  failed: boolean;
  generation: number;
};

type BadgeSnapshot = Readonly<Record<DevRailBadge, BadgeEntry>>;

const INITIAL_SNAPSHOT = Object.fromEntries(
  BADGES.map((badge) => [badge, { count: null, parts: null, updatedAt: null, failed: false, generation: 0 }]),
) as BadgeSnapshot;

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

export function invalidateDevRailBadge(badge: DevRailBadge) {
  const entry = snapshot[badge];
  snapshot = { ...snapshot, [badge]: { ...entry, generation: entry.generation + 1 } };
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
  if (activeOwner !== owner || snapshot[badge].generation !== generation) {
    return;
  }

  const entry = snapshot[badge];
  snapshot = {
    ...snapshot,
    [badge]: reading
      ? { count: reading.count, parts: reading.parts ?? null, updatedAt: Date.now(), failed: false, generation }
      : { ...entry, failed: true },
  };
  emit();
}

export function useDevRailBadges(role: AppRole | null, actorEmail?: string | null): DevRailBadgeCounts {
  const current = useSyncExternalStore(subscribe, () => snapshot, () => INITIAL_SNAPSHOT);
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
      if (!OUTSIDE_INBOX_TOTAL.has(badge)) inboxTotal += count;
      if (badge !== "review-recommendations") counts[badge] = count;
    }
  }
  if (inboxTotal > 0 && roleMeetsFloor(role, INBOX_FLOOR)) {
    counts[INBOX_BADGE] = inboxTotal;
  }
  return counts;
}

export function useDevRailBadgeParts(badge: DevRailBadge): Readonly<Record<string, number>> | null {
  const current = useSyncExternalStore(subscribe, () => snapshot, () => INITIAL_SNAPSHOT);
  return current[badge].parts;
}

export type DevRailBadgeReading = Pick<BadgeEntry, "count" | "parts" | "updatedAt" | "failed">;

export function useDevRailBadgeReadings(): Readonly<Record<DevRailBadge, DevRailBadgeReading>> {
  return useSyncExternalStore(subscribe, () => snapshot, () => INITIAL_SNAPSHOT);
}

export type DevRailBadgeStatus = {
  count: number | null;
  updatedAt: number | null;
  failed: boolean;
  retry: () => void;
};

export function useDevRailBadgeStatus(badge: DevRailBadge): DevRailBadgeStatus {
  const current = useSyncExternalStore(subscribe, () => snapshot, () => INITIAL_SNAPSHOT);
  const { count, updatedAt, failed } = current[badge];
  return { count, updatedAt, failed, retry: () => invalidateDevRailBadge(badge) };
}
