import { getSession, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { deriveProfileKeyFromEmail } from "@/data/userProfiles";
import {
  canApprove,
  canDraft,
  getRoleFloorLockReason,
  resolveSessionRole,
  type AppRole,
} from "@/lib/auth/roles";
import { resolvePrimaryTab, type DevModePrimaryTab } from "./devModePageUtils";
import { findDevTab, firstUsableTab, type DevModeTab } from "./devTabRegistry";

function primarySectionTab(primaryTab: DevModePrimaryTab, role: AppRole | null): DevModeTab {
  return primaryTab === "change-log" ? "change-log" : firstUsableTab(role);
}

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
      handleTabChange(primarySectionTab(primaryTab, role));
    },
    [handleTabChange, role],
  );

  const sessionStatus = nextSession.status;

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
      setSessionLossConfirmed(true);
      return;
    }

    if (recheckInFlightRef.current) {
      return;
    }

    recheckInFlightRef.current = true;
    let cancelled = false;
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
    glossaryLocales: nextSession.data?.user?.glossaryLocales,
    onPrimaryTabChange: handlePrimaryTabChange,
    onTabChange: handleTabChange,
  };
}
