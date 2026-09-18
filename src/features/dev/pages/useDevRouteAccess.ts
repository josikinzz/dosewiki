import { getSession, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { deriveProfileKeyFromEmail } from "@/data/userProfiles";
import {
  canApprove,
  canDraft,
  getRoleFloorLockReason,
  resolveSessionRole,
} from "@/lib/auth/roles";
import { resolvePrimaryTab, type DevModePrimaryTab } from "./devModePageUtils";
import { findDevTab, type DevModeTab } from "./devTabRegistry";

const devModePrimaryDefaults: Record<DevModePrimaryTab, DevModeTab> = {
  tools: "articles",
  "change-log": "change-log",
};

type UseDevRouteAccessArgs = {
  activeTab: DevModeTab;
  initialProfileKey?: string;
  onTabChange: (tab: DevModeTab) => void;
  onClearNoticesForTab: (tab: DevModeTab) => void;
};

export function useDevRouteAccess({
  activeTab,
  initialProfileKey,
  onTabChange,
  onClearNoticesForTab,
}: UseDevRouteAccessArgs) {
  const nextSession = useSession();
  const isSignedIn = nextSession.status === "authenticated";
  const role = isSignedIn ? resolveSessionRole({ role: nextSession.data?.user?.role }) : null;

  const defaultSessionProfileKey = useMemo(() => {
    const email = nextSession.data?.user?.email?.trim() ?? "";
    if (email) {
      return deriveProfileKeyFromEmail(email);
    }

    const name = nextSession.data?.user?.name?.trim() ?? "";
    return name ? name.replace(/[^a-z0-9-]/gi, "").toUpperCase() : "";
  }, [nextSession.data?.user?.email, nextSession.data?.user?.name]);

  const sessionProfileKey = useMemo(
    () => initialProfileKey?.trim().toUpperCase() || defaultSessionProfileKey,
    [defaultSessionProfileKey, initialProfileKey],
  );

  const activePrimaryTab = useMemo(() => resolvePrimaryTab(activeTab), [activeTab]);

  const handleTabChange = useCallback(
    (tab: DevModeTab) => {
      onClearNoticesForTab(tab);
      if (tab !== activeTab) {
        onTabChange(tab);
      }
    },
    [activeTab, onClearNoticesForTab, onTabChange],
  );

  const handlePrimaryTabChange = useCallback(
    (primaryTab: DevModePrimaryTab) => {
      handleTabChange(devModePrimaryDefaults[primaryTab]);
    },
    [handleTabChange],
  );

  const sessionStatus = nextSession.status;

  /**
   * Whether an unauthenticated reading is trustworthy enough to route on.
   *
   * "loading" is the cold-load case: redirecting there bounces editors off
   * their deep-linked tab before the session has ever resolved.
   *
   * A session that *disappears* after having resolved is the harder case.
   * next-auth's SessionProvider defaults `refetchOnWindowFocus` to true, and
   * its client turns a failed /api/auth/session request into `null` rather than
   * an error (`fetchData` in next-auth/client/_utils returns null on any fetch,
   * parse, or non-ok response). It also never flips back to "loading" for that
   * refetch. So one network blip on tab refocus is indistinguishable from a
   * clean sign-out, and on the review workbench that costs a reviewer their
   * place mid-pass. Confirm a vanished session with one forced re-check before
   * acting on it; only a second unauthenticated answer routes.
   *
   * This is presentation only. Access itself is decided server-side by
   * `getDevRouteDecision` in the /dev and /review route handlers, and every
   * write path keeps its own session and role checks. The settled reading
   * decides whether the open tool is swapped for its locked panel, so a blip
   * never unmounts a tool mid-edit.
   */
  const sawAuthenticatedSessionRef = useRef(false);
  const recheckInFlightRef = useRef(false);
  const [sessionLossConfirmed, setSessionLossConfirmed] = useState(false);

  useEffect(() => {
    if (sessionStatus === "loading") {
      return;
    }

    if (isSignedIn) {
      sawAuthenticatedSessionRef.current = true;
      recheckInFlightRef.current = false;
      setSessionLossConfirmed(false);
      return;
    }

    if (!sawAuthenticatedSessionRef.current) {
      // Nothing was lost — this mount never saw a session, so the signed-out
      // reading is the first settled answer and can be acted on immediately.
      setSessionLossConfirmed(true);
      return;
    }

    if (recheckInFlightRef.current) {
      return;
    }

    recheckInFlightRef.current = true;
    let cancelled = false;
    // `getSession()` broadcasts by default, so a session that comes back is
    // adopted by the provider and re-runs this effect through `sessionStatus`.
    void getSession()
      .catch(() => null)
      .then((session) => {
        if (cancelled) {
          return;
        }

        if (session) {
          recheckInFlightRef.current = false;
          return;
        }

        setSessionLossConfirmed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, sessionStatus]);

  const isSessionSettled =
    sessionStatus !== "loading" && (isSignedIn || sessionLossConfirmed);

  // The rail disables every tab above the role, so this covers deep links and
  // sessions that change underneath an open tab (role downgrade, sign-out
  // confirmed above). Null while the reading is unsettled: the tool stays up.
  const activeTabLockReason = isSessionSettled
    ? getRoleFloorLockReason(role, findDevTab(activeTab).role)
    : null;

  return {
    activePrimaryTab,
    activeTabLockReason,
    isSignedIn,
    role,
    canDraft: canDraft(role),
    canApprove: canApprove(role),
    sessionProfileKey,
    sessionStatus: nextSession.status,
    userEmail: nextSession.data?.user?.email,
    userImage: nextSession.data?.user?.image,
    userName: nextSession.data?.user?.name,
    onPrimaryTabChange: handlePrimaryTabChange,
    onTabChange: handleTabChange,
  };
}
