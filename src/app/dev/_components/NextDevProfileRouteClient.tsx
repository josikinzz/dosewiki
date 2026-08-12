"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import {
  buildFallbackProfile,
  getProfileByKeyFromList,
  type NormalizedUserProfile,
} from "@/data/userProfiles";
import { useContributorProfiles } from "@/hooks/useContributorProfiles";
import { ProfileEditorTab } from "@/features/dev/profile";
import { DevModePageChrome } from "@/features/dev/pages/DevModePageChrome";
import { useDevModeSessionCredentials } from "@/features/dev/pages/useDevModeSessionCredentials";
import type { DevModePrimaryTab, DevModeTab } from "@/features/dev/pages/devModePageUtils";
import { useOwnedProfileKey } from "./useOwnedProfileKey";

type NextDevProfileRouteClientProps = {
  initialProfileKey: string;
  /** See `useOwnedProfileKey`: resolved off the critical path. */
  ownedProfileKey?: Promise<string | null>;
};

const mainClassName = "w-full px-4 py-6 text-white md:px-6 lg:px-8";
const contentWrapperClass = "mx-auto mt-6 w-full max-w-6xl";

export function NextDevProfileRouteClient({
  initialProfileKey,
  ownedProfileKey,
}: NextDevProfileRouteClientProps) {
  const session = useSession();
  const hasAuthenticatedSession = session.status === "authenticated";
  const { profiles, isLoading } = useContributorProfiles();
  const resolvedInitialProfileKey = useOwnedProfileKey(initialProfileKey, ownedProfileKey) ?? initialProfileKey;
  const [profileKey, setProfileKey] = useState(resolvedInitialProfileKey);
  const [savedProfile, setSavedProfile] = useState<NormalizedUserProfile | null>(null);
  const { verifyDevCredentials } = useDevModeSessionCredentials({
    hasAuthenticatedSession,
    sessionProfileKey: profileKey,
  });

  useEffect(() => {
    setProfileKey(resolvedInitialProfileKey);
    setSavedProfile(null);
  }, [resolvedInitialProfileKey]);

  const profile = useMemo(() => {
    if (savedProfile) {
      return savedProfile;
    }

    if (!isLoading && profiles.length > 0) {
      return getProfileByKeyFromList(profiles, profileKey);
    }

    return buildFallbackProfile(profileKey);
  }, [isLoading, profileKey, profiles, savedProfile]);

  const handleProfileUpdated = useCallback((nextProfile: NormalizedUserProfile, canonicalKey: string) => {
    setSavedProfile(nextProfile);
    setProfileKey(canonicalKey);
  }, []);

  const handleSignIn = useCallback(() => {
    const callbackUrl = typeof window !== "undefined" ? window.location.pathname : "/dev/profile";
    window.location.href = `/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }, []);

  const keepProfileTab = useCallback((_tab: DevModeTab | DevModePrimaryTab) => {
    // Profile-only access intentionally has no editor runtime to navigate into.
  }, []);

  return (
    <main id="main-content" tabIndex={-1} className={`${mainClassName} focus:outline-none`}>
      <DevModePageChrome
        activePrimaryTab="profile"
        activeTab="profile"
        hasStoredCredentials={hasAuthenticatedSession}
        hasNextEditorSession={false}
        sessionStatus={session.status}
        userEmail={session.data?.user?.email}
        userImage={session.data?.user?.image}
        userName={session.data?.user?.name}
        onPrimaryTabChange={keepProfileTab}
        onTabChange={keepProfileTab}
        onSignIn={handleSignIn}
      />

      <div className={contentWrapperClass}>
        <ProfileEditorTab
          profile={profile}
          profileHistory={[]}
          verifyCredentials={verifyDevCredentials}
          onProfileUpdated={handleProfileUpdated}
          hasStoredCredentials={hasAuthenticatedSession}
        />
      </div>
    </main>
  );
}
