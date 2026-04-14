import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import {
  useCallback,
  useMemo,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

type VerifyCredentials = (
  options?: { username?: string; password?: string },
) => Promise<{ username: string; password: string; key: string }>;

type UseDevModeSupportTabPropsArgs = {
  profileData: NormalizedUserProfile;
  profileHistory: ChangeLogEntry[];
  availableProfiles: NormalizedUserProfile[];
  verifyDevCredentials: VerifyCredentials;
  setProfileData: Dispatch<SetStateAction<NormalizedUserProfile>>;
  setPasswordKey: Dispatch<SetStateAction<string | null>>;
  hasStoredCredentials: boolean;
  commitPanel: ReactNode;
  combinedChangelogMarkdown: string;
  hasPendingChanges: boolean;
  aboutMarkdown: string;
  originalAboutMarkdown: string;
  replaceAboutMarkdown: (value: string) => void;
  resetAboutMarkdown: () => void;
  aboutSubtitle: string;
  originalAboutSubtitle: string;
  replaceAboutSubtitle: (value: string) => void;
  resetAboutSubtitle: () => void;
  aboutFounderKeys: string[];
  originalAboutFounderKeys: string[];
  replaceAboutFounderKeys: (value: string[]) => void;
  resetAboutFounderKeys: () => void;
  markdownDiff: string;
  subtitleDiff: string;
  subtitleHasChanges: boolean;
  placeholderValues: Record<string, string>;
};

export function useDevModeSupportTabProps({
  profileData,
  profileHistory,
  availableProfiles,
  verifyDevCredentials,
  setProfileData,
  setPasswordKey,
  hasStoredCredentials,
  commitPanel,
  combinedChangelogMarkdown,
  hasPendingChanges,
  aboutMarkdown,
  originalAboutMarkdown,
  replaceAboutMarkdown,
  resetAboutMarkdown,
  aboutSubtitle,
  originalAboutSubtitle,
  replaceAboutSubtitle,
  resetAboutSubtitle,
  aboutFounderKeys,
  originalAboutFounderKeys,
  replaceAboutFounderKeys,
  resetAboutFounderKeys,
  markdownDiff,
  subtitleDiff,
  subtitleHasChanges,
  placeholderValues,
}: UseDevModeSupportTabPropsArgs) {
  const handleProfileUpdated = useCallback(
    (nextProfile: NormalizedUserProfile, canonicalKey: string) => {
      setProfileData(nextProfile);
      setPasswordKey(canonicalKey);
    },
    [setPasswordKey, setProfileData],
  );

  const copyDatasetMarkdownForTagEditor = useCallback(async () => {
    await navigator.clipboard.writeText(combinedChangelogMarkdown);
  }, [combinedChangelogMarkdown]);

  const downloadDatasetMarkdownForTagEditor = useCallback(() => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `dataset-changelog-${timestamp}.diff`;
    const blob = new Blob([combinedChangelogMarkdown], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [combinedChangelogMarkdown]);

  const handleAboutMarkdownChange = useCallback(
    (value: string) => {
      replaceAboutMarkdown(value);
    },
    [replaceAboutMarkdown],
  );

  const handleAboutMarkdownReset = useCallback(() => {
    resetAboutMarkdown();
  }, [resetAboutMarkdown]);

  const handleAboutMarkdownCopy = useCallback(() => {
    navigator.clipboard.writeText(aboutMarkdown).catch((error) => {
      console.error("Failed to copy About markdown", error);
    });
  }, [aboutMarkdown]);

  const handleAboutSubtitleChange = useCallback(
    (value: string) => {
      replaceAboutSubtitle(value);
    },
    [replaceAboutSubtitle],
  );

  const handleAboutSubtitleReset = useCallback(() => {
    resetAboutSubtitle();
  }, [resetAboutSubtitle]);

  const handleAboutSubtitleCopy = useCallback(() => {
    navigator.clipboard.writeText(aboutSubtitle).catch((error) => {
      console.error("Failed to copy About subtitle", error);
    });
  }, [aboutSubtitle]);

  const canonicalizeFounderKeyList = useCallback((keys: readonly string[]) => {
    const seen = new Set<string>();
    const next: string[] = [];

    keys.forEach((entry) => {
      if (typeof entry !== "string") {
        return;
      }

      const trimmed = entry.trim();
      if (!trimmed) {
        return;
      }

      const normalized = trimmed.toLowerCase();
      if (seen.has(normalized)) {
        return;
      }

      seen.add(normalized);
      next.push(trimmed);
    });

    return next;
  }, []);

  const handleAboutFounderToggle = useCallback(
    (rawKey: string) => {
      if (typeof rawKey !== "string") {
        return;
      }

      const trimmedKey = rawKey.trim();
      if (!trimmedKey) {
        return;
      }

      const normalizedKey = trimmedKey.toLowerCase();
      const normalizedExisting = aboutFounderKeys.map((entry) => entry.trim().toLowerCase());
      const hasKey = normalizedExisting.includes(normalizedKey);

      if (hasKey) {
        const filtered = aboutFounderKeys.filter(
          (_entry, index) => normalizedExisting[index] !== normalizedKey,
        );
        replaceAboutFounderKeys(canonicalizeFounderKeyList(filtered));
        return;
      }

      replaceAboutFounderKeys(
        canonicalizeFounderKeyList([...aboutFounderKeys, trimmedKey]),
      );
    },
    [aboutFounderKeys, canonicalizeFounderKeyList, replaceAboutFounderKeys],
  );

  const handleAboutFounderReset = useCallback(() => {
    resetAboutFounderKeys();
  }, [resetAboutFounderKeys]);

  const profileTabProps = useMemo(
    () => ({
      profile: profileData,
      profileHistory,
      verifyCredentials: verifyDevCredentials,
      onProfileUpdated: handleProfileUpdated,
      hasStoredCredentials,
    }),
    [
      handleProfileUpdated,
      hasStoredCredentials,
      profileData,
      profileHistory,
      verifyDevCredentials,
    ],
  );

  const aboutTabProps = useMemo(
    () => ({
      aboutMarkdown,
      originalAboutMarkdown,
      onMarkdownChange: handleAboutMarkdownChange,
      onResetMarkdown: handleAboutMarkdownReset,
      aboutSubtitle,
      originalAboutSubtitle,
      onSubtitleChange: handleAboutSubtitleChange,
      onResetSubtitle: handleAboutSubtitleReset,
      aboutFounderKeys,
      originalFounderKeys: originalAboutFounderKeys,
      onToggleFounderKey: handleAboutFounderToggle,
      onResetFounderKeys: handleAboutFounderReset,
      availableProfiles,
      markdownDiff,
      subtitleDiff,
      subtitleHasChanges,
      onCopyMarkdown: handleAboutMarkdownCopy,
      onCopySubtitle: handleAboutSubtitleCopy,
      commitPanel,
      placeholderValues,
    }),
    [
      aboutFounderKeys,
      aboutMarkdown,
      aboutSubtitle,
      commitPanel,
      handleAboutFounderReset,
      handleAboutFounderToggle,
      handleAboutMarkdownChange,
      handleAboutMarkdownCopy,
      handleAboutMarkdownReset,
      handleAboutSubtitleChange,
      handleAboutSubtitleCopy,
      handleAboutSubtitleReset,
      markdownDiff,
      availableProfiles,
      originalAboutFounderKeys,
      originalAboutMarkdown,
      originalAboutSubtitle,
      placeholderValues,
      subtitleDiff,
      subtitleHasChanges,
    ],
  );

  const tagEditorTabProps = useMemo(
    () => ({
      commitPanel,
      datasetMarkdown: combinedChangelogMarkdown,
      hasDatasetChanges: hasPendingChanges,
      onCopyDatasetMarkdown: copyDatasetMarkdownForTagEditor,
      onDownloadDatasetMarkdown: downloadDatasetMarkdownForTagEditor,
    }),
    [
      combinedChangelogMarkdown,
      commitPanel,
      copyDatasetMarkdownForTagEditor,
      downloadDatasetMarkdownForTagEditor,
      hasPendingChanges,
    ],
  );

  return {
    profileTabProps,
    aboutTabProps,
    tagEditorTabProps,
  };
}
