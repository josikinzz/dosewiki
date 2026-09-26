"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import type { NormalizedUserProfile } from "@/data/userProfiles";
import type { EditorActionStatusState, NoticeMessage } from "@/features/dev/components";
import { viewToPath } from "@/utils/routing";
import {
  findContributorProfileByKeyOrAlias,
  normalizeProfileKey,
} from "@server/contributorProfileIdentity";

import type { OrderablePanelItem } from "./OrderingPanel";
import {
  browserAvatarFileAdapter,
  createAvatarPreviewSession,
  createAvatarUploadPayload,
  formatFileSize,
  validateAvatarFile,
} from "./avatarUploadModel";
import {
  buildContributorPatch,
  buildOwnContributorPatch,
  filterContributors,
  isContributorFormDirty,
  ordersEqual,
  sortReports,
  sortWorks,
  toContributorForm,
  type ContributorFormState,
  type ContributorReport,
  type ContributorWork,
  type EditorContributorProfile,
} from "./contributorsModel";
import {
  ProfileWriteError,
  canWriteContributorProfile,
  classifyWriteFailure,
  type WriteFailureKind,
} from "./profileEditModel";

/** `all`: the whole directory. `me`: the signed-in user's own record only. */
export type ContributorScope = "all" | "me";

export type ContributorsControllerOptions = {
  /** The shared contributor directory, fetched by the dev shell. */
  profiles: readonly NormalizedUserProfile[];
  /** Editor role: the directory, the curated fields, and the danger zone. Otherwise self only. */
  canEdit: boolean;
  /** Admin role: the trust fields. Without it they are shown but not sent. */
  canApprove: boolean;
  /** The signed-in user's own key; resolved against the directory by key or alias. */
  sessionProfileKey: string;
  /**
   * The signed-in address. With it, an editor below admin sees a record they
   * may not change (another member's, or an unclaimed one that is not theirs)
   * as read only, the way the route would refuse the save.
   */
  viewerEmail?: string | null;
  /** The route's `?scope=` value, validated by the registry; anything else opens on all. */
  initialScope?: string;
  /** `/dev/contributors/<key or alias>`: the profile the tool opens on. */
  initialKey?: string;
  /** One contextual record, without fetching or navigating the directory. */
  contextualKey?: string;
  /**
   * Load only the record `selectProfile` names, never the first visible row:
   * the People view picks the profile for the person it shows, and a person
   * without one loads nothing.
   */
  explicitSelection?: boolean;
  /**
   * Open nothing until a row is picked (phones, where the list is the whole
   * view). Wide screens open the first row; either way Close empties the pane.
   */
  startClosed?: boolean;
};

export type ContributorSaveState = EditorActionStatusState | "idle";

/** A write result held with how it failed, so the pane can offer the way forward. */
export type ContributorWriteNotice = NoticeMessage & { failure?: WriteFailureKind };

type ContributorDetail = {
  profile: EditorContributorProfile;
  works: ContributorWork[];
  reports: ContributorReport[];
};

type OrderKind = "works" | "reports";

const FROZEN_PROFILE = "Writes are paused, so your changes were not published. They are still here; save again once writes resume.";
const FROZEN_ORDER = "Writes are paused, so the order was not saved. It is still here; save again once writes resume.";

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

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function useContributorsController({
  profiles,
  canEdit,
  canApprove,
  sessionProfileKey,
  viewerEmail,
  initialScope,
  initialKey,
  contextualKey,
  explicitSelection = false,
  startClosed = false,
}: ContributorsControllerOptions) {
  const routeScope: ContributorScope = initialScope === "me" ? "me" : "all";
  const [chosenScope, setChosenScope] = useState<ContributorScope>(routeScope);
  // A contributor without editor role never leaves their own record.
  const scope: ContributorScope = canEdit ? chosenScope : "me";
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState(() => (canEdit && initialKey ? normalizeProfileKey(initialKey) : ""));
  /** Close emptied the pane; picking a row or switching scope opens one again. */
  const [closed, setClosed] = useState(startClosed && !initialKey);
  const [detail, setDetail] = useState<ContributorDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [form, setForm] = useState<ContributorFormState | null>(null);
  const [aliasDraft, setAliasDraft] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [profileSaveState, setProfileSaveState] = useState<ContributorSaveState>("idle");
  /** Results about the directory: a merge or delete, a failed deep link. */
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  /** The last profile save, shown in the save dock. */
  const [profileNotice, setProfileNotice] = useState<ContributorWriteNotice | null>(null);
  /** A picked or rejected picture, shown beside the picture. */
  const [avatarNotice, setAvatarNotice] = useState<NoticeMessage | null>(null);
  /** The last save of each order, shown in its own panel. */
  const [orderNotices, setOrderNotices] = useState<Record<OrderKind, ContributorWriteNotice | null>>({ works: null, reports: null });
  /** A retarget result, shown in the identity operations. */
  const [dangerNotice, setDangerNotice] = useState<NoticeMessage | null>(null);
  const [workOrder, setWorkOrder] = useState<string[]>([]);
  const [reportOrder, setReportOrder] = useState<string[]>([]);
  const [workSaveState, setWorkSaveState] = useState<ContributorSaveState>("idle");
  const [reportSaveState, setReportSaveState] = useState<ContributorSaveState>("idle");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingPublication = useRef<string | null>(null);
  const [publicationUncertain, setPublicationUncertain] = useState(false);
  /** What to say once the next load lands (after "Load the latest version"). */
  const afterLoad = useRef<{ where: "profile" | OrderKind; message: string } | null>(null);
  /** The parts the next reload of the same record refreshes; null refreshes all of them. */
  const refreshParts = useRef<Set<"profile" | OrderKind> | null>(null);
  const loadedKey = useRef<string | null>(null);
  const reloadParts = useCallback((...parts: Array<"profile" | OrderKind>) => {
    refreshParts.current = new Set(parts);
    setReloadToken((token) => token + 1);
  }, []);

  const directory = useMemo(
    () => [...profiles].sort((left, right) => left.displayName.localeCompare(right.displayName)),
    [profiles],
  );
  // The record the session owns, matched the way the retired profile editor
  // matched it: by key, then by alias. With no directory entry the derived key
  // itself is the target; the route hands back a blank record for it, and the
  // first save creates it.
  const selfKey = useMemo(
    () =>
      findContributorProfileByKeyOrAlias(directory, sessionProfileKey)?.key ??
      normalizeProfileKey(sessionProfileKey),
    [directory, sessionProfileKey],
  );
  const visibleProfiles = useMemo(
    () =>
      scope === "me"
        ? directory.filter((profile) => profile.key === selfKey)
        : filterContributors(directory, search),
    [directory, scope, search, selfKey],
  );
  // A deep link may name a key in any case, or an alias.
  const selectedEntryKey = useMemo(
    () => (selectedKey ? findContributorProfileByKeyOrAlias(directory, selectedKey)?.key ?? "" : ""),
    [directory, selectedKey],
  );
  const resolvedKey = useMemo(() => {
    if (contextualKey) return contextualKey;
    if (scope === "me") return selfKey;
    if (selectedEntryKey) return selectedEntryKey;
    if (explicitSelection || closed) return "";
    return visibleProfiles[0]?.key ?? "";
  }, [closed, contextualKey, explicitSelection, scope, selectedEntryKey, selfKey, visibleProfiles]);

  // A deep link to a key the directory does not hold says so once the
  // directory has loaded, and drops the key from the address.
  const deepLinkChecked = useRef(!initialKey);
  useEffect(() => {
    if (deepLinkChecked.current || directory.length === 0 || !initialKey) return;
    deepLinkChecked.current = true;
    if (selectedEntryKey) return;
    setSelectedKey("");
    setNotice({
      tone: "warning",
      title: `No profile answers to "${initialKey}".`,
      message: "It may have been merged or deleted, or the address may be mistyped. Search the list instead.",
    });
  }, [directory.length, initialKey, selectedEntryKey]);

  // The address says the scope and the profile picked by hand. Only a change
  // writes: the address the user arrived on (`/dev/profile`,
  // `/dev/contributors?scope=me`) is left alone, a first-row fallback never
  // writes, and a non-editor's forced scope never rewrites anything.
  const addressedKey = scope === "all" ? selectedEntryKey : "";
  const addressRef = useRef({ scope: routeScope, key: initialKey ? normalizeProfileKey(initialKey) : "" });
  useEffect(() => {
    if (contextualKey || explicitSelection || !canEdit) return;
    if (initialKey && !deepLinkChecked.current) return;
    const current = addressRef.current;
    if (scope === current.scope && addressedKey === current.key) return;
    addressRef.current = { scope, key: addressedKey };
    // Hand Next its own history state back, or the router treats the change as a navigation.
    window.history.replaceState(
      window.history.state,
      "",
      viewToPath({
        type: "dev",
        tab: "contributors",
        slug: addressedKey || undefined,
        filter: scope === "all" ? undefined : scope,
      }),
    );
  }, [addressedKey, canEdit, contextualKey, explicitSelection, initialKey, scope]);

  useEffect(() => {
    if (!resolvedKey) {
      setDetail(null);
      setForm(null);
      setDetailError(null);
      return;
    }

    let cancelled = false;
    setIsDetailLoading(true);
    setDetailError(null);
    void (async () => {
      try {
        const response = await fetch(
          `/api/dev/contributor-profile?key=${encodeURIComponent(resolvedKey)}${contextualKey ? "&contextual=true" : ""}`,
        );
        const payload = (await readJson(response)) as {
          error?: string;
          profile?: EditorContributorProfile;
          works?: ContributorWork[];
          reports?: ContributorReport[];
        };
        if (!response.ok || !payload.profile) {
          throw new Error(payload.error ?? "That contributor could not be loaded.");
        }
        if (cancelled) return;
        // A blank self record may omit the arrays; every reader below expects them.
        const loaded: EditorContributorProfile = {
          ...payload.profile,
          aliases: payload.profile.aliases ?? [],
          links: payload.profile.links ?? [],
          replicationOrder: payload.profile.replicationOrder ?? [],
          reportOrder: payload.profile.reportOrder ?? [],
        };

        // A reload after one part's save or "load latest" refreshes that part
        // only, so saving an order never drops an unsaved profile edit (or the
        // other order). Opening a different record resets everything.
        const parts = loadedKey.current === loaded.key ? refreshParts.current : null;
        refreshParts.current = null;
        loadedKey.current = loaded.key;
        const resets = (part: "profile" | OrderKind) => parts === null || parts.has(part);

        setDetail({
          profile: loaded,
          works: sortWorks(payload.works ?? []),
          reports: sortReports(payload.reports ?? []),
        });
        if (resets("profile")) {
          setForm(toContributorForm(loaded));
          setAvatarFile(null);
          setAvatarRemoved(false);
          setAliasDraft("");
          setProfileSaveState("idle");
        }
        if (resets("works")) {
          setWorkOrder([...loaded.replicationOrder]);
          setWorkSaveState("idle");
        }
        if (resets("reports")) {
          setReportOrder([...loaded.reportOrder]);
          setReportSaveState("idle");
        }
        const next = afterLoad.current;
        afterLoad.current = null;
        if (next?.where === "profile") setProfileNotice({ tone: "info", message: next.message });
        else if (next) setOrderNotices((current) => ({ ...current, [next.where]: { tone: "info", message: next.message } }));
      } catch (error) {
        if (!cancelled) {
          afterLoad.current = null;
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
  }, [contextualKey, reloadToken, resolvedKey]);

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
    if (patch.avatarUrl) setAvatarRemoved(false);
    setProfileSaveState("idle");
  }, []);

  const handleAvatarFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    const validation = validateAvatarFile(file);
    if (validation.ok === false) {
      setAvatarNotice({
        tone: "danger",
        title: `${file.name} was not used`,
        message: validation.message,
      });
      return;
    }
    setAvatarFile(file);
    setAvatarRemoved(false);
    setProfileSaveState("idle");
    setAvatarNotice({
      tone: "info",
      message: `${file.name} (${formatFileSize(file.size)}) is ready. Save the profile to publish it.`,
    });
  }, []);

  const clearAvatarFile = useCallback(() => {
    setAvatarFile(null);
    setAvatarNotice(null);
  }, []);

  const removeAvatar = useCallback(() => {
    setAvatarFile(null);
    setAvatarRemoved(true);
    setAvatarNotice(null);
    setForm((previous) => previous ? { ...previous, avatarUrl: "" } : previous);
    setProfileSaveState("idle");
  }, []);

  const saveProfile = useCallback(async () => {
    if (!detail || !form || profileSaveState === "saving") return;
    setProfileSaveState("saving");
    setProfileNotice(null);
    try {
      const avatarUpload = avatarFile
        ? await createAvatarUploadPayload(avatarFile, browserAvatarFileAdapter)
        : undefined;
      pendingPublication.current ??= JSON.stringify({
        key: detail.profile.key,
        expectedUpdatedAt: detail.profile.updatedAt ?? null,
        operationId: crypto.randomUUID(),
        ...(canEdit && !contextualKey ? buildContributorPatch(form, { canApprove }) : buildOwnContributorPatch(form)),
        // A bio-only edit must not clear an existing uploaded avatar.
        avatarUrl: avatarUpload ? undefined : avatarRemoved ? null :
          form.avatarUrl === (detail.profile.avatarUrl ?? "") ? undefined : (form.avatarUrl.trim() || null),
        ...(avatarUpload ? { avatarUpload } : {}),
      });
      let response: Response;
      try {
        response = await fetch("/api/dev/contributor-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: pendingPublication.current,
        });
      } catch {
        throw new ProfileWriteError("The save did not get an answer.", 0);
      }
      const payload = (await readJson(response)) as { error?: string };
      if (!response.ok) {
        if (response.status < 500) {
          pendingPublication.current = null;
          setPublicationUncertain(false);
        }
        throw new ProfileWriteError(payload.error ?? "The profile could not be saved.", response.status);
      }
      pendingPublication.current = null;
      setPublicationUncertain(false);
      setProfileSaveState("saved");
      setAvatarNotice(null);
      setProfileNotice({
        tone: "success",
        message: `Saved ${form.displayName.trim() || detail.profile.displayName}. The public contributor page shows it now.`,
      });
      reloadParts("profile");
    } catch (error) {
      if (pendingPublication.current) setPublicationUncertain(true);
      setProfileSaveState("error");
      const message = error instanceof Error ? error.message : "The profile could not be saved.";
      const failure = classifyWriteFailure(error instanceof ProfileWriteError ? error.status : 0, message);
      setProfileNotice(
        failure === "conflict"
          ? {
              tone: "danger",
              failure,
              title: "Someone saved this profile after you opened it.",
              message: "Your edits are still here. Note what you changed, then load the latest version and apply them again.",
            }
          : failure === "frozen"
            ? { tone: "danger", failure, message: FROZEN_PROFILE }
            : failure === "uncertain"
              ? {
                  tone: "danger",
                  failure,
                  title: "The save may not have gone through.",
                  message: `${message} Save again to resend the same change; it cannot land twice.`,
                }
              : { tone: "danger", failure, title: "Not saved", message },
      );
    }
  }, [avatarFile, avatarRemoved, canApprove, canEdit, contextualKey, detail, form, profileSaveState, reloadParts]);

  const saveOrdering = useCallback(
    async (which: OrderKind) => {
      if (!detail) return;
      const setState = which === "works" ? setWorkSaveState : setReportSaveState;
      const setOrderNotice = (next: ContributorWriteNotice | null) =>
        setOrderNotices((current) => ({ ...current, [which]: next }));
      setState("saving");
      setOrderNotice(null);
      try {
        let response: Response;
        try {
          response = await fetch("/api/dev/contributor-profile/ordering", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: detail.profile.key,
              expectedRevision: detail.profile.orderingRevision,
              ...(which === "works" ? { replicationOrder: workOrder } : { reportOrder }),
            }),
          });
        } catch {
          throw new ProfileWriteError("The save did not get an answer. Try again.", 0);
        }
        const payload = (await readJson(response)) as {
          error?: string;
          prunedReplicationSlugs?: string[];
          prunedReportSlugs?: string[];
        };
        if (!response.ok) throw new ProfileWriteError(payload.error ?? "The order could not be saved.", response.status);
        const pruned =
          which === "works"
            ? (payload.prunedReplicationSlugs ?? [])
            : (payload.prunedReportSlugs ?? []);
        setState("saved");
        setOrderNotice({
          tone: pruned.length > 0 ? "warning" : "success",
          message:
            pruned.length > 0
              ? `Order saved. Dropped ${pruned.length} ${pruned.length === 1 ? "position whose item no longer exists" : "positions whose items no longer exist"}: ${pruned.join(", ")}.`
              : "Order saved. The contributor page shows it now.",
        });
        reloadParts(which);
      } catch (error) {
        setState("error");
        const message = error instanceof Error ? error.message : "The order could not be saved.";
        const failure = classifyWriteFailure(error instanceof ProfileWriteError ? error.status : 0, message);
        setOrderNotice(
          failure === "conflict"
            ? {
                tone: "danger",
                failure,
                title: "This list changed after you opened it.",
                message: "Your order is still here. Load the stored order, then arrange it again.",
              }
            : failure === "frozen"
              ? { tone: "danger", failure, message: FROZEN_ORDER }
              : { tone: "danger", failure, title: "Order not saved", message },
        );
      }
    },
    [detail, reloadParts, reportOrder, workOrder],
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
    () =>
      Array.from(
        new Set((detail?.reports ?? []).map((report) => report.authorName).filter(Boolean)),
      ),
    [detail?.reports],
  );
  const isProfileDirty =
    detail && form ? isContributorFormDirty(detail.profile, form, avatarFile !== null || avatarRemoved) : false;
  const isWorkOrderDirty = detail !== null && !ordersEqual(workOrder, detail.profile.replicationOrder);
  const isReportOrderDirty = detail !== null && !ordersEqual(reportOrder, detail.profile.reportOrder);
  // Anything a row change or scope flip would throw away: the profile draft
  // and either unsaved order.
  const hasUnsavedChanges = isProfileDirty || isWorkOrderDirty || isReportOrderDirty;
  /** Whether the route would take a save of this record from this viewer. */
  const canWrite = detail
    ? contextualKey !== undefined || !canEdit || canWriteContributorProfile({ canApprove, viewerEmail, profile: detail.profile })
    : true;

  const clearResults = useCallback(() => {
    setNotice(null);
    setProfileNotice(null);
    setAvatarNotice(null);
    setOrderNotices({ works: null, reports: null });
    setDangerNotice(null);
  }, []);
  const selectProfile = useCallback((key: string) => {
    setSelectedKey(key);
    setClosed(false);
    clearResults();
  }, [clearResults]);
  const closeProfile = useCallback(() => {
    setSelectedKey("");
    setClosed(true);
    clearResults();
  }, [clearResults]);
  const changeScope = useCallback((next: ContributorScope) => {
    setChosenScope(next);
    setClosed(false);
    clearResults();
  }, [clearResults]);
  const retryDetail = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);
  /** Drops the local draft of one part and reloads the stored record, saying so where the write failed. */
  const loadLatest = useCallback((where: "profile" | OrderKind) => {
    afterLoad.current = {
      where,
      message:
        where === "profile"
          ? "Loaded the latest version. Apply your edits again, then save."
          : "Loaded the stored order. Arrange it again, then save.",
    };
    if (where === "profile") {
      pendingPublication.current = null;
      setPublicationUncertain(false);
    }
    reloadParts(where);
  }, [reloadParts]);
  const discardProfile = useCallback(() => {
    if (!detail) return;
    setForm(toContributorForm(detail.profile));
    setAvatarFile(null);
    setAvatarRemoved(false);
    setAvatarNotice(null);
    setProfileSaveState("idle");
    pendingPublication.current = null;
    setPublicationUncertain(false);
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
  /**
   * An identity operation finished. A merge or a delete removes the open
   * profile, so its result lands with the list; a retarget keeps it open, so
   * its result stays in the operations block.
   */
  const completeDangerOperation = useCallback((message: string, where: "list" | "zone" = "list") => {
    // A retarget adds an alias to the stored record, so the whole record reloads.
    if (where === "zone") setDangerNotice({ tone: "success", message });
    else setNotice({ tone: "success", message });
    setReloadToken((token) => token + 1);
  }, []);
  /** The open profile was merged or deleted: open where a merge went, else close (People keeps its own pick). */
  const removeSelectedProfile = useCallback((nextKey?: string) => {
    const next = nextKey && !explicitSelection ? nextKey : "";
    setSelectedKey(next);
    setClosed(!next);
    setDetail(null);
    setForm(null);
  }, [explicitSelection]);

  return {
    canEdit,
    canApprove,
    /** False when the route would refuse this viewer's save of the open record. */
    canWrite,
    scope,
    setScope: changeScope,
    search,
    setSearch,
    directory,
    visibleProfiles,
    resolvedKey,
    /** The key the editor tapped, unlike `resolvedKey` which also falls back to the first visible row. */
    selectedKey,
    selfKey,
    selectProfile,
    closeProfile,
    detail,
    detailError,
    isDetailLoading,
    retryDetail,
    loadLatest,
    form,
    updateForm,
    aliasDraft,
    setAliasDraft,
    avatarFile,
    setAvatarFile,
    clearAvatarFile,
    avatarPreviewUrl,
    avatarRemoved,
    removeAvatar,
    fileInputRef,
    handleAvatarFileChange,
    avatarNotice,
    dismissAvatarNotice: () => setAvatarNotice(null),
    profileSaveState,
    saveProfile,
    publicationUncertain,
    discardProfile,
    /**
     * The result that belongs above the editor: a merge, a delete or a failed
     * deep link. In contextual mode, which draws no dock, every profile and
     * picture result lands here too.
     */
    notice: contextualKey ? (profileNotice ?? avatarNotice ?? notice) : notice,
    dismissNotice: () => setNotice(null),
    profileNotice,
    dismissProfileNotice: () => setProfileNotice(null),
    orderNotices,
    dismissOrderNotice: (which: OrderKind) => setOrderNotices((current) => ({ ...current, [which]: null })),
    dangerNotice,
    dismissDangerNotice: () => setDangerNotice(null),
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
    isWorkOrderDirty,
    isReportOrderDirty,
    hasUnsavedChanges,
    completeDangerOperation,
    removeSelectedProfile,
  };
}

export type ContributorsController = ReturnType<typeof useContributorsController>;
