"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import type { NormalizedUserProfile } from "@/data/userProfiles";
import type {
  EditorActionStatusState,
  EditorNoticeMessage,
} from "@/features/dev/components";
import {
  browserAvatarFileAdapter,
  createAvatarPreviewSession,
  createAvatarUploadPayload,
  validateAvatarFile,
} from "@/features/dev/profile/avatarUploadModel";

import type { OrderablePanelItem } from "./OrderingPanel";
import {
  buildContributorPatch,
  filterContributors,
  isContributorFormDirty,
  sortReports,
  sortWorks,
  toContributorForm,
  type ContributorFormState,
  type ContributorReport,
  type ContributorWork,
  type EditorContributorProfile,
} from "./contributorsModel";

export type ContributorSaveState = EditorActionStatusState | "idle";

type ContributorDetail = {
  profile: EditorContributorProfile;
  works: ContributorWork[];
  reports: ContributorReport[];
};

function workMeta(work: ContributorWork): string {
  return [work.role, work.type, work.effectSlug ?? "", work.createdAt?.slice(0, 10) ?? ""]
    .filter(Boolean)
    .join(" · ");
}

function reportMeta(report: ContributorReport): string {
  return [report.authorName, report.tripDate ?? "", report.featured ? "featured" : ""]
    .filter(Boolean)
    .join(" · ");
}

export function useContributorsController(profiles: readonly NormalizedUserProfile[]) {
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [detail, setDetail] = useState<ContributorDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [form, setForm] = useState<ContributorFormState | null>(null);
  const [aliasDraft, setAliasDraft] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [profileSaveState, setProfileSaveState] = useState<ContributorSaveState>("idle");
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);
  const [workOrder, setWorkOrder] = useState<string[]>([]);
  const [reportOrder, setReportOrder] = useState<string[]>([]);
  const [workSaveState, setWorkSaveState] = useState<ContributorSaveState>("idle");
  const [reportSaveState, setReportSaveState] = useState<ContributorSaveState>("idle");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const directory = useMemo(
    () => [...profiles].sort((left, right) => left.displayName.localeCompare(right.displayName)),
    [profiles],
  );
  const visibleProfiles = useMemo(() => filterContributors(directory, search), [directory, search]);
  const resolvedKey = useMemo(() => {
    if (directory.some((profile) => profile.key === selectedKey)) return selectedKey;
    return visibleProfiles[0]?.key ?? "";
  }, [directory, selectedKey, visibleProfiles]);

  useEffect(() => {
    if (!resolvedKey) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setIsDetailLoading(true);
    setDetailError(null);
    void (async () => {
      try {
        const response = await fetch(
          `/api/dev/contributor-profile?key=${encodeURIComponent(resolvedKey)}`,
        );
        const payload = (await response.json()) as {
          error?: string;
          profile?: EditorContributorProfile;
          works?: ContributorWork[];
          reports?: ContributorReport[];
        };
        if (!response.ok || !payload.profile) {
          throw new Error(payload.error ?? "That contributor could not be loaded.");
        }
        if (cancelled) return;

        setDetail({
          profile: payload.profile,
          works: sortWorks(payload.works ?? []),
          reports: sortReports(payload.reports ?? []),
        });
        setForm(toContributorForm(payload.profile));
        setWorkOrder([...payload.profile.replicationOrder]);
        setReportOrder([...payload.profile.reportOrder]);
        setAvatarFile(null);
        setAliasDraft("");
        setProfileSaveState("idle");
        setWorkSaveState("idle");
        setReportSaveState("idle");
      } catch (error) {
        if (!cancelled) {
          setDetail(null);
          setForm(null);
          setDetailError(
            error instanceof Error ? error.message : "That contributor could not be loaded.",
          );
        }
      } finally {
        if (!cancelled) setIsDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken, resolvedKey]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(null);
      return;
    }
    const preview = createAvatarPreviewSession(avatarFile, browserAvatarFileAdapter);
    setAvatarPreviewUrl(preview.source);
    return preview.dispose;
  }, [avatarFile]);

  const updateForm = useCallback((patch: Partial<ContributorFormState>) => {
    setForm((previous) => (previous ? { ...previous, ...patch } : previous));
    setProfileSaveState("idle");
  }, []);

  const handleAvatarFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    const validation = validateAvatarFile(file);
    if (validation.ok === false) {
      setNotice({ tone: "danger", title: "Avatar rejected", message: validation.message });
      return;
    }
    setAvatarFile(file);
    setNotice({ tone: "info", message: "Avatar ready. Save the profile to publish it." });
  }, []);

  const saveProfile = useCallback(async () => {
    if (!detail || !form) return;
    setProfileSaveState("saving");
    setNotice(null);
    try {
      const avatarUpload = avatarFile
        ? await createAvatarUploadPayload(avatarFile, browserAvatarFileAdapter)
        : undefined;
      const response = await fetch("/api/dev/contributor-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: detail.profile.key,
          ...buildContributorPatch(form),
          ...(avatarUpload ? { avatarUpload } : {}),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The profile could not be saved.");
      setProfileSaveState("saved");
      setNotice({
        tone: "success",
        message: `Saved ${detail.profile.displayName}. The public contributor page is live with it now.`,
      });
      setReloadToken((token) => token + 1);
    } catch (error) {
      setProfileSaveState("error");
      setNotice({
        tone: "danger",
        title: "Save failed",
        message: error instanceof Error ? error.message : "The profile could not be saved.",
      });
    }
  }, [avatarFile, detail, form]);

  const saveOrdering = useCallback(
    async (which: "works" | "reports") => {
      if (!detail) return;
      const setState = which === "works" ? setWorkSaveState : setReportSaveState;
      setState("saving");
      setNotice(null);
      try {
        const response = await fetch("/api/dev/contributor-profile/ordering", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: detail.profile.key,
            ...(which === "works" ? { replicationOrder: workOrder } : { reportOrder }),
          }),
        });
        const payload = (await response.json()) as {
          error?: string;
          prunedReplicationSlugs?: string[];
          prunedReportSlugs?: string[];
        };
        if (!response.ok) throw new Error(payload.error ?? "The order could not be saved.");
        const pruned =
          which === "works" ? payload.prunedReplicationSlugs ?? [] : payload.prunedReportSlugs ?? [];
        setState("saved");
        setNotice({
          tone: pruned.length > 0 ? "warning" : "success",
          message:
            pruned.length > 0
              ? `Order saved. Dropped ${pruned.length} position(s) whose item no longer exists: ${pruned.join(", ")}.`
              : "Order saved. The contributor page renders it now.",
        });
        setReloadToken((token) => token + 1);
      } catch (error) {
        setState("error");
        setNotice({
          tone: "danger",
          title: "Order not saved",
          message: error instanceof Error ? error.message : "The order could not be saved.",
        });
      }
    },
    [detail, reportOrder, workOrder],
  );

  const workItems: OrderablePanelItem[] = useMemo(
    () =>
      (detail?.works ?? []).map((work) => ({
        slug: work.slug,
        title: work.title || work.slug,
        meta: workMeta(work),
      })),
    [detail?.works],
  );
  const reportItems: OrderablePanelItem[] = useMemo(
    () =>
      (detail?.reports ?? []).map((report) => ({
        slug: report.slug,
        title: report.title || report.slug,
        meta: reportMeta(report),
      })),
    [detail?.reports],
  );
  const knownAuthorNames = useMemo(
    () => Array.from(new Set((detail?.reports ?? []).map((report) => report.authorName).filter(Boolean))),
    [detail?.reports],
  );
  const isProfileDirty =
    detail && form ? isContributorFormDirty(detail.profile, form, avatarFile !== null) : false;

  const selectProfile = useCallback((key: string) => {
    setSelectedKey(key);
    setNotice(null);
  }, []);
  const discardProfile = useCallback(() => {
    if (!detail) return;
    setForm(toContributorForm(detail.profile));
    setAvatarFile(null);
    setProfileSaveState("idle");
  }, [detail]);
  const changeWorkOrder = useCallback((next: string[]) => {
    setWorkOrder(next);
    setWorkSaveState("idle");
  }, []);
  const changeReportOrder = useCallback((next: string[]) => {
    setReportOrder(next);
    setReportSaveState("idle");
  }, []);
  const resetWorkOrder = useCallback(() => {
    if (!detail) return;
    setWorkOrder([...detail.profile.replicationOrder]);
    setWorkSaveState("idle");
  }, [detail]);
  const resetReportOrder = useCallback(() => {
    if (!detail) return;
    setReportOrder([...detail.profile.reportOrder]);
    setReportSaveState("idle");
  }, [detail]);
  const completeDangerOperation = useCallback((message: string) => {
    setNotice({ tone: "success", message });
    setReloadToken((token) => token + 1);
  }, []);
  const removeSelectedProfile = useCallback(() => {
    setSelectedKey("");
    setDetail(null);
    setForm(null);
  }, []);

  return {
    search,
    setSearch,
    directory,
    visibleProfiles,
    resolvedKey,
    selectProfile,
    detail,
    detailError,
    isDetailLoading,
    form,
    updateForm,
    aliasDraft,
    setAliasDraft,
    avatarFile,
    setAvatarFile,
    avatarPreviewUrl,
    fileInputRef,
    handleAvatarFileChange,
    profileSaveState,
    saveProfile,
    discardProfile,
    notice,
    workOrder,
    workItems,
    workSaveState,
    changeWorkOrder,
    resetWorkOrder,
    reportOrder,
    reportItems,
    reportSaveState,
    changeReportOrder,
    resetReportOrder,
    saveOrdering,
    knownAuthorNames,
    isProfileDirty,
    completeDangerOperation,
    removeSelectedProfile,
  };
}

export type ContributorsController = ReturnType<typeof useContributorsController>;
