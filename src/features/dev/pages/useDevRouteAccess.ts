import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo } from "react";

import { deriveProfileKeyFromEmail } from "@/data/userProfiles";
import { canAccessDev } from "@/lib/auth/roles";
import {
  resolvePrimaryTab,
  type DevModePrimaryTab,
  type DevModeTab,
} from "./devModePageUtils";

const devModePrimaryDefaults: Record<DevModePrimaryTab, DevModeTab> = {
  tools: "articles",
  "change-log": "change-log",
  profile: "profile",
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
  const nextSessionRole = nextSession.data?.user?.role;
  const hasAuthenticatedSession = nextSession.status === "authenticated";
  const hasNextEditorSession = hasAuthenticatedSession && canAccessDev(nextSessionRole);
  const hasProfileSession = hasAuthenticatedSession;

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

  useEffect(() => {
    if (activeTab !== "profile" && !hasNextEditorSession) {
      handleTabChange("profile");
    }
  }, [activeTab, handleTabChange, hasNextEditorSession]);

  useEffect(() => {
    if (activeTab === "profile" && !hasProfileSession) {
      handleTabChange("articles");
    }
  }, [activeTab, handleTabChange, hasProfileSession]);

  return {
    activePrimaryTab,
    hasAuthenticatedSession,
    hasProfileSession,
    hasNextEditorSession,
    sessionProfileKey,
    sessionStatus: nextSession.status,
    userEmail: nextSession.data?.user?.email,
    userImage: nextSession.data?.user?.image,
    userName: nextSession.data?.user?.name,
    onPrimaryTabChange: handlePrimaryTabChange,
    onTabChange: handleTabChange,
  };
}
