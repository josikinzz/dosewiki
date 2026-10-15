"use client";

import { DevToolSection } from "@/features/dev/pages/DevToolSection";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HighlightedText } from "@/components/common/HighlightedText";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOUCH_HALO_Y } from "@/components/ui/touchTargets";
import { DiffPreview } from "@/features/dev/components/DiffPreview";
import {
  EditorListRow,
  EditorList,
  EditorPanel,
  EditorSelect,
  EditorStatusPill,
  LoadErrorState,
  SaveLine,
  useConfirm,
  useDevShortcuts,
  useDirtyGuard,
  useScrollToDetail,
  useUnsavedWork,
  type NoticeMessage,
} from "@/features/dev/components";
import { useWriteFreeze } from "@/features/dev/components/writeFreeze";
import { buildTextChangelog } from "@/utils/data/changelog";
import { viewToPath } from "@/utils/routing";
import { useEditorReadState, useInvalidateEditorReads } from "@/hooks/useEditorRead";
import { cn } from "@/lib/utils";
import { devHref } from "@/utils/devHref";

import { useModifierKeyLabel } from "../../pages/DevCommandPalette";
import { stripDiffHeading } from "../about/aboutEditorUtils";
import { proposalSubmittedNotice, submitToolProposal } from "../proposalSubmission";
import { CopyIndexRefusal, useCopyIndexOperation } from "../useCopyIndexOperation";
import { useCopyIndexSource } from "../useCopyIndexSource";
import { COPY_PUBLISH_SAVE_COPY, CopyBlockPane } from "./CopyBlockPane";
import {
  blockCurrentText,
  buildCopyStudioBlocks,
  canResetToDefault,
  copyBlockFlavorLabel,
  copyBlockTwin,
  copyLengthGuide,
  copySearchMatch,
  countPlaceholders,
  countSectionBlocks,
  COPY_PREVIEW_PLACEHOLDER_VALUES,
  draftFromBlock,
  draftToText,
  filterCopyStudioBlocks,
  groupCopyStudioBlocks,
  isDraftDirty,
  openCopyProposals,
  placeholderChanges,
  resolveCopyPlaceholders,
  sectionCopyStudioGroups,
  type CopyBlockRow,
  type CopyProposalRow,
  type OpenCopyProposal,
  type CopyStudioBlock,
  type CopyStudioDraft,
} from "./copyStudioUtils";

const NO_BLOCKS: readonly CopyStudioBlock[] = [];
const NO_ROWS: CopyBlockRow[] = [];

/** From `lg` the list and the pane sit side by side; below it they stack and nothing opens until a pick. */
const SIDE_BY_SIDE_QUERY = "(min-width: 1024px)";

type SaveState = "idle" | "saving";

const PANE_SHORTCUTS = [
  { keys: "Cmd+S", label: "Publish or submit the open block" },
  { keys: "/", label: "Search copy blocks" },
] as const;
const LIST_SHORTCUTS = [{ keys: "/", label: "Search copy blocks" }] as const;

const FREEZE_PUBLISH = "Writes are paused, so your changes were not published. They are still here; publish again once writes resume.";
const FREEZE_REMOVE = "Writes are paused, so the stored copy was not removed.";

type CopyStudioTabProps = {
  /** `/dev/copy-studio/<block key>`: the block to open on, wherever its group is. */
  initialKey?: string;
  /** Admin: Publish writes the block; without it the same draft is submitted as a proposal. */
  canApprove: boolean;
};

/**
 * Copy (`/dev/copy-studio`) edits site copy that used to be hardcoded in page
 * components: page intros, footers, empty states, SEO text.
 *
 * It reads only `copyBlocks` and layers the compact catalogue over 452
 * checked-in defaults, never the substance corpus, so the list is there before
 * its own query answers (and stays usable when that read fails). Each block's
 * stored copy and revision load by key when it opens. An admin's Publish
 * writes the row (and Remove stored copy deletes it, so the public read falls
 * back to the default); an editor's Submit for review sends the same draft as
 * a change proposal instead, and only an approval writes the row.
 *
 * Layout is the editor workspace: sections, a group picker, search and the
 * block list on the left (sticky on desktop), the open block in a docked pane
 * on the right with its save dock at the bottom. A search, or "Edited only",
 * lists matches from every group while the pane stays on the open block. On a
 * phone the pane stacks under the list, nothing opens until a pick, opening
 * scrolls the pane in, and the pane carries Back to list.
 *
 * An editor's submission resets the draft to the published copy and marks the
 * block "Proposal pending" for the rest of the session, so the draft is clean
 * again and a second submission needs a new edit.
 */
export function CopyStudioTab({ initialKey, canApprove }: CopyStudioTabProps) {
  const catalogue = useEditorReadState("copyBlocks:getEditorCatalogue", {}, "list");
  const rows = (catalogue.data as CopyBlockRow[] | undefined) ?? NO_ROWS;
  const catalogueReady = catalogue.data !== undefined;
  const invalidateEditorReads = useInvalidateEditorReads();

  const blocks = useMemo(() => buildCopyStudioBlocks(rows), [rows]);
  const groups = useMemo(() => groupCopyStudioBlocks(blocks), [blocks]);
  const sections = useMemo(() => sectionCopyStudioGroups(groups), [groups]);
  const editedCount = useMemo(() => blocks.filter((block) => block.source === "data").length, [blocks]);

  const [activeGroup, setActiveGroup] = useState<string>("");
  const [activeKey, setActiveKey] = useState<string>(initialKey ?? "");
  /** Nothing open: the idle pane on desktop, the list alone on a phone. A deep link always opens. */
  const [closed, setClosed] = useState(!initialKey);
  const [searchQuery, setSearchQuery] = useState("");
  const [editedOnly, setEditedOnly] = useState(false);
  const [draft, setDraft] = useState<CopyStudioDraft>({ body: "", items: [] });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [loadedBlock, setLoadedBlock] = useState<CopyStudioBlock | null>(null);
  const [baselineRow, setBaselineRow] = useState<CopyBlockRow | null>(null);
  const [baselineRevision, setBaselineRevision] = useState(0);
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(() => new Set());
  const { serialize: publicationBody, acknowledge, uncertain } = useCopyIndexOperation();
  const awaitingWrite = useRef<CopyStudioBlock | null>(null);
  /** "Load the latest version": the next answer for this key replaces the draft even though it is dirty. */
  const replaceOnNext = useRef<{ key: string; stale: unknown } | null>(null);
  const freeze = useWriteFreeze();
  const proposals = useOpenCopyProposals(pendingKeys.size);
  const saveKeyLabel = useModifierKeyLabel("S");

  const listRef = useRef<HTMLElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  const paneTitleRef = useRef<HTMLHeadingElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const focusPaneOnOpen = useRef(false);

  // Wide screens open the group's first block at once, as before; a phone
  // shows the list alone until a pick, so the editor never lands under it unasked.
  useEffect(() => {
    if (initialKey) return;
    if (typeof window.matchMedia !== "function" || window.matchMedia(SIDE_BY_SIDE_QUERY).matches) setClosed(false);
    // Only the arrival decides this; later closes are the editor's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The group follows the selected block until the editor picks a group
  // themselves, so a deep link lands on the block's own group.
  const resolvedGroup = groups.some((entry) => entry.group === activeGroup)
    ? activeGroup
    : groups.find((entry) => entry.blocks.some((block) => block.key === activeKey))?.group ??
      groups[0]?.group ??
      "";
  const resolvedSection =
    sections.find((entry) => entry.groups.some((member) => member.group === resolvedGroup)) ?? null;
  const groupBlocks = groups.find((entry) => entry.group === resolvedGroup)?.blocks ?? NO_BLOCKS;

  const isSearching = searchQuery.trim().length > 0;
  const acrossGroups = isSearching || editedOnly;
  const visibleBlocks = useMemo(() => {
    const base = isSearching ? filterCopyStudioBlocks(blocks, searchQuery) : editedOnly ? blocks : groupBlocks;
    return editedOnly ? base.filter((block) => block.source === "data") : base;
  }, [blocks, groupBlocks, isSearching, searchQuery, editedOnly]);

  // The editor stays on the selected block while a search narrows the list, so
  // typing a query never swaps the draft out from under the editor.
  const activeBlock: CopyStudioBlock | null = useMemo(
    () => (closed ? null : blocks.find((block) => block.key === activeKey) ?? (activeKey && !catalogueReady ? null : groupBlocks[0] ?? null)),
    [blocks, groupBlocks, activeKey, closed, catalogueReady],
  );
  const detailSource = useCopyIndexSource<{ document: CopyBlockRow | null; revision: number }>(activeBlock ? `/api/dev/copy-block?key=${encodeURIComponent(activeBlock.key)}` : null);
  const selectedSnapshot = detailSource.data;

  // Live production updates must never replace an unsaved draft or its baseline,
  // unless the editor asked for the latest version.
  useEffect(() => {
    if (!activeBlock || selectedSnapshot === undefined) return;
    const authoritative = buildCopyStudioBlocks(
      selectedSnapshot.document ? [selectedSnapshot.document] : [],
    ).find((block) => block.key === activeBlock.key);
    if (!authoritative) return;
    const replacing = replaceOnNext.current?.key === activeBlock.key && replaceOnNext.current.stale !== selectedSnapshot;
    if (replacing) {
      replaceOnNext.current = null;
      awaitingWrite.current = null;
    } else {
      if (replaceOnNext.current?.key === activeBlock.key) return;
      if (awaitingWrite.current?.key === activeBlock.key) {
        if (blockCurrentText(awaitingWrite.current) !== blockCurrentText(authoritative)) return;
        awaitingWrite.current = null;
      }
      if (loadedBlock?.key === activeBlock.key) {
        if (isDraftDirty(loadedBlock, draft)) return;
        if (blockCurrentText(loadedBlock) === blockCurrentText(authoritative)) {
          setBaselineRevision(selectedSnapshot.revision);
          return;
        }
      }
    }
    setLoadedBlock(authoritative);
    setBaselineRow(selectedSnapshot.document);
    setBaselineRevision(selectedSnapshot.revision);
    setDraft(draftFromBlock(authoritative));
    setSaveState("idle");
  }, [activeBlock, loadedBlock, draft, selectedSnapshot]);

  // The address names the open block so a reload or a shared link lands on it.
  // Only a change writes: the address the editor arrived on is left alone.
  // Next's own history state goes back in, or the router treats it as a navigation.
  const urlKeyRef = useRef(initialKey ?? "");
  const openKey = activeBlock?.key ?? "";
  useEffect(() => {
    if (openKey === urlKeyRef.current) return;
    if (!openKey && !closed) return;
    urlKeyRef.current = openKey;
    window.history.replaceState(window.history.state, "", viewToPath({ type: "dev", tab: "copy-studio", slug: openKey || undefined }));
  }, [openKey, closed]);

  // A deep link to a key no block has: say so at the list and drop it from the address.
  const unknownDeepLink = Boolean(initialKey) && activeKey === initialKey && catalogueReady && !blocks.some((block) => block.key === initialKey);

  const isDirty = loadedBlock && activeBlock && loadedBlock.key === activeBlock.key ? isDraftDirty(loadedBlock, draft) : false;
  const canReset = activeBlock ? canResetToDefault(activeBlock, draft) : false;
  const saving = saveState === "saving";
  const ready = activeBlock !== null && selectedSnapshot !== undefined && loadedBlock?.key === activeBlock.key;

  // The guard keeps in-tool switches (another block, group, section, Close);
  // the shell owns rail clicks, Leave and unload.
  const { guard, dialog: dirtyGuardDialog } = useDirtyGuard(isDirty, {
    canDiscard: !uncertain && !saving,
    title: activeBlock ? `Discard changes to “${activeBlock.label}”?` : undefined,
    description: `This block has edits that are not ${canApprove ? "published" : "submitted"} yet. Discarding them cannot be undone; the live copy is unchanged.`,
    warnOnUnload: false,
  });
  const { confirm, dialog: confirmDialog } = useConfirm();

  const openBlock = useCallback((key: string) => {
    focusPaneOnOpen.current = true;
    setActiveKey(key);
    setClosed(false);
    setActiveGroup("");
    setNotice(null);
  }, []);

  const selectBlock = useCallback(
    (key: string) => {
      if (key === activeBlock?.key) {
        paneTitleRef.current?.focus({ preventScroll: true });
        return;
      }
      guard(() => openBlock(key));
    },
    [activeBlock?.key, guard, openBlock],
  );

  /** Picking a group clears the search and the Edited filter; picking the current one only clears them. */
  const selectGroup = useCallback(
    (group: string) => {
      if (group === resolvedGroup && !acrossGroups) {
        return;
      }
      guard(() => {
        setActiveGroup(group);
        setActiveKey("");
        setSearchQuery("");
        setEditedOnly(false);
        setNotice(null);
      });
    },
    [guard, acrossGroups, resolvedGroup],
  );

  const closePane = () =>
    guard(() => {
      setClosed(true);
      setActiveKey("");
      setNotice(null);
      requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>('[role="listbox"]')?.focus({ preventScroll: true }));
    });

  const backToList = () => {
    listRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    listRef.current?.querySelector<HTMLElement>('[role="listbox"]')?.focus({ preventScroll: true });
  };

  // Below `lg` the pane stacks under the list: a pick scrolls it in. Keyed on the
  // picked block, not `activeBlock`, so the first-block fallback does not move the page.
  useScrollToDetail(paneRef, closed ? null : activeKey || null);
  // Name the block for keyboard and screen reader users once its pane is in
  // the page; an effect, not a frame later, so a click into a field keeps its focus.
  useEffect(() => {
    if (!openKey || !focusPaneOnOpen.current) return;
    focusPaneOnOpen.current = false;
    paneTitleRef.current?.focus({ preventScroll: true });
  }, [openKey]);

  // A deep link names one block: below `lg` the pane sits under the whole
  // list, so bring it in once, and name it for keyboard and screen reader users.
  const deepLinkShown = useRef(false);
  useEffect(() => {
    if (!initialKey || deepLinkShown.current || openKey !== initialKey || !ready) return;
    deepLinkShown.current = true;
    // Focus from the effect itself, never a frame later, or a click into a field loses its focus to the heading.
    paneTitleRef.current?.focus({ preventScroll: true });
    if (typeof window.matchMedia !== "function" || window.matchMedia(SIDE_BY_SIDE_QUERY).matches) return;
    // Once the pane holds the block, so the page does not settle and scroll back under it.
    const timer = window.setTimeout(() => paneRef.current?.scrollIntoView?.({ block: "start" }), 150);
    return () => window.clearTimeout(timer);
  }, [initialKey, openKey, ready]);

  const draftText = activeBlock ? draftToText(activeBlock.kind, draft) : "";
  const currentText = loadedBlock ? blockCurrentText(loadedBlock) : "";
  const placeholders = useMemo(() => countPlaceholders(draftText), [draftText]);
  const placeholderDelta = useMemo(
    () => (isDirty ? placeholderChanges(currentText, draftText) : { removed: [], added: [] }),
    [currentText, draftText, isDirty],
  );
  const previewText = useMemo(
    () => resolveCopyPlaceholders(draftText, COPY_PREVIEW_PLACEHOLDER_VALUES),
    [draftText],
  );
  const diffText = useMemo(() => {
    if (!activeBlock || !isDirty) {
      return "";
    }
    return stripDiffHeading(
      buildTextChangelog(activeBlock.label, currentText, draftText).markdown,
    );
  }, [activeBlock, currentText, draftText, isDirty]);

  const askLoadLatest = useCallback((key: string) => {
    confirm({
      title: "Load the latest version?",
      description: "Your edits here are dropped and the editor shows the block as it is published now. Note anything you want to keep first.",
      confirmLabel: "Load latest",
      destructive: true,
      onConfirm: () => {
        replaceOnNext.current = { key, stale: selectedSnapshot };
        detailSource.reload();
        void invalidateEditorReads(["copyBlocks:getEditorCatalogue"]);
        setNotice({ tone: "info", message: "Loaded the latest version. Apply your edits again, then publish." });
      },
    });
  }, [confirm, detailSource, invalidateEditorReads, selectedSnapshot]);

  /** A refused write in the tool's words: a conflict offers the latest version, the freeze reads as the freeze. */
  const failureNotice = useCallback((error: unknown, title: string, fallback: string, frozenCopy: string, key: string): NoticeMessage => {
    if (error instanceof CopyIndexRefusal && error.conflict) {
      return {
        tone: "danger",
        title: "Someone published this block after you opened it.",
        message: "Your edits are still here. Note what you changed, then load the latest version and apply them again.",
        actions: (
          <Button type="button" variant="outline" size="sm" onClick={() => askLoadLatest(key)}>
            Load the latest version
          </Button>
        ),
      };
    }
    if ((error instanceof CopyIndexRefusal && error.frozen) || freeze.frozen) {
      return { tone: "danger", title, message: frozenCopy };
    }
    return { tone: "danger", title, message: error instanceof Error ? error.message : fallback };
  }, [askLoadLatest, freeze.frozen]);

  /** Resolves true once the block is published or submitted; false when it was not. */
  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!activeBlock || selectedSnapshot === undefined || loadedBlock?.key !== activeBlock.key) {
      return false;
    }

    setSaveState("saving");
    setNotice(null);

    const block = {
      key: activeBlock.key,
      flavor: activeBlock.flavor,
      kind: activeBlock.kind,
      label: activeBlock.label,
      group: activeBlock.group,
      ...(activeBlock.kind === "list"
        ? { items: draft.items.map((item) => item.trim()).filter(Boolean) }
        : { body: draft.body }),
    };

    try {
      if (!canApprove) {
        const { proposalId } = await submitToolProposal({
          payload: { copyBlocks: [block] },
          summary: `Update copy "${activeBlock.label}"`,
          baselines: [{ kind: "copyBlock", key: activeBlock.key, document: baselineRow }],
        });
        // The proposal holds the edit now; the draft returns to the published
        // copy so the guard is quiet and a resubmit needs a new edit.
        setPendingKeys((current) => new Set(current).add(activeBlock.key));
        setDraft(draftFromBlock(loadedBlock));
        setSaveState("idle");
        setNotice(proposalSubmittedNotice(`“${activeBlock.label}”`, proposalId));
        return true;
      }

      const response = await fetch("/api/dev/copy-block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: publicationBody({ ...block, expected: baselineRow, expectedRevision: baselineRevision }),
      });

      const payload = (await response.json()) as { error?: string };
      const receipt = acknowledge(response, payload);
      const savedBlock: CopyStudioBlock = {
        ...activeBlock,
        current: { body: "body" in block ? block.body : "", items: "items" in block ? block.items : [] },
        source: "data",
      };
      awaitingWrite.current = savedBlock;
      setLoadedBlock(savedBlock);
      setBaselineRow({ ...block, revision: receipt.revision });
      setBaselineRevision(receipt.revision);
      detailSource.reload();
      void invalidateEditorReads(["copyBlocks:getEditorCatalogue"]);

      setSaveState("idle");
      setNotice({
        tone: "success",
        message: receipt.unchanged ? "No publication was needed; this content is unchanged." : receipt.replayed ? "Your earlier publication went through. Someone may have published changes since." : `Published “${activeBlock.label}”. The public pages reading this key are live with it now.`,
      });
      return true;
    } catch (error) {
      setSaveState("idle");
      setNotice(failureNotice(
        error,
        canApprove ? "Not published" : "Submission failed",
        canApprove ? "The copy block could not be published." : "The proposal could not be submitted.",
        FREEZE_PUBLISH,
        activeBlock.key,
      ));
      return false;
    }
  }, [activeBlock, baselineRow, baselineRevision, canApprove, draft, publicationBody, acknowledge, selectedSnapshot, loadedBlock, detailSource, invalidateEditorReads, failureNotice]);

  /** Publish asks first and names the block and its readers; a submission for review goes straight out. */
  const requestPublish = useCallback(() => {
    if (!activeBlock || !isDirty || saving || !ready) return;
    if (!canApprove) {
      void handleSave();
      return;
    }
    confirm({
      title: `Publish “${activeBlock.label}”?`,
      description: `Every public page that reads ${activeBlock.key} changes at once. There is no draft step, and removing it later restores the checked-in default, not today's wording.`,
      body: <DiffPreview diffText={diffText} maxHeight={200} />,
      confirmLabel: "Publish copy",
      onConfirm: async () => {
        await handleSave();
      },
    });
  }, [activeBlock, isDirty, saving, ready, canApprove, confirm, diffText, handleSave]);

  // The shell asks before a rail click, Leave or sign-out drops the open
  // block's edits. Its Save submits for review, offered only when this tool's
  // own button would be enabled; an admin's save publishes live, so the shell
  // offers only Discard and the admin publishes from here.
  const shellCanSave = isDirty && !saving && ready;
  useUnsavedWork({
    id: "copy-studio",
    label: `Copy: ${activeBlock?.label ?? "open block"}`,
    dirty: isDirty,
    saveLabel: "Submit for review",
    ...(!canApprove && shellCanSave
      ? { kind: "submit-proposal" as const, submit: async () => {
          if (!(await handleSave())) {
            throw new Error(`“${activeBlock?.label ?? "This block"}” was not submitted. The reason is shown in Copy.`);
          }
        } }
      : { kind: "discard-only" as const, because: canApprove
          ? "This change would go live. Publish it from the tool; leaving here never publishes."
          : "Finish this proposal from Copy before leaving." }),
    discard: () => {
      if (loadedBlock && !uncertain && !saving) setDraft(draftFromBlock(loadedBlock));
    },
  });

  const discardDraft = () => {
    if (loadedBlock && !uncertain && !saving) setDraft(draftFromBlock(loadedBlock));
  };

  /** Reset drops the draft back to the checked-in default without saving. */
  const handleResetDraft = useCallback(() => {
    if (!activeBlock?.fallback) {
      return;
    }
    setDraft({ body: activeBlock.fallback.body, items: [...activeBlock.fallback.items] });
    setNotice({
      tone: "info",
      message: canApprove
        ? "Draft reset to the checked-in default. Publish it to put it live, or Discard edits to go back."
        : "Draft reset to the checked-in default. Submit it for review to propose it, or Discard edits to go back.",
    });
  }, [activeBlock, canApprove]);

  /** Revert deletes the stored row, so the public read serves the default. */
  const handleRevertToDefault = useCallback(async () => {
    if (!activeBlock || activeBlock.source !== "data" || selectedSnapshot === undefined || loadedBlock?.key !== activeBlock.key) {
      return;
    }

    setSaveState("saving");
    setNotice(null);

    try {
      const response = await fetch("/api/dev/copy-block", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: publicationBody({ key: activeBlock.key, expected: baselineRow, expectedRevision: baselineRevision }),
      });

      const payload = (await response.json()) as { error?: string };
      const receipt = acknowledge(response, payload);
      setBaselineRevision(receipt.revision);
      awaitingWrite.current = null; setBaselineRow(null); detailSource.reload();
      void invalidateEditorReads(["copyBlocks:getEditorCatalogue"]);

      setSaveState("idle");
      setNotice({
        tone: "success",
        message: receipt.unchanged ? "No stored copy needed removal." : receipt.replayed ? "Your earlier removal went through. Someone may have published changes since." : "Stored copy removed. This key now serves its checked-in default.",
      });
    } catch (error) {
      setSaveState("idle");
      setNotice(failureNotice(error, "Revert failed", "The copy block could not be reverted.", FREEZE_REMOVE, activeBlock.key));
    }
  }, [activeBlock, baselineRow, baselineRevision, publicationBody, acknowledge, selectedSnapshot, loadedBlock, detailSource, invalidateEditorReads, failureNotice]);

  const requestRemove = () => {
    if (!activeBlock) return;
    confirm({
      title: "Remove stored copy?",
      description: `${activeBlock.fallback
        ? `“${activeBlock.label}” goes back to its checked-in default on the public pages right away.`
        : `“${activeBlock.label}” has no checked-in default, so the public pages have nothing to show for it afterwards.`} The stored wording is deleted and cannot be recovered.${isDirty ? " Your unsaved edits stay in the editor." : ""}`,
      confirmLabel: "Remove stored copy",
      destructive: true,
      onConfirm: handleRevertToDefault,
    });
  };

  // Cmd+S or Ctrl+S does what the dock's button does (Publish asks first, and
  // a key press never publishes past that confirm). `/` focuses the search.
  const paneOpen = activeBlock !== null;
  useDevShortcuts(paneOpen ? PANE_SHORTCUTS : LIST_SHORTCUTS);
  const publishRef = useRef(requestPublish);
  publishRef.current = requestPublish;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const dialogOpen = Boolean(document.querySelector('[role="dialog"], [role="alertdialog"]'));
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "s") {
        if (!paneOpen) return;
        event.preventDefault();
        if (!dialogOpen) publishRef.current();
        return;
      }
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented || dialogOpen) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paneOpen]);

  const twin = activeBlock ? copyBlockTwin(activeBlock, blocks) : null;
  const proposalFor = (key: string) => {
    const open = proposals.get(key);
    return open
      ? { href: devHref({ type: "dev", tab: "queue", slug: encodeURIComponent(open.id) }), number: open.id.slice(-6), mine: open.mine, by: open.by }
      : null;
  };
  const placeOf = (block: CopyStudioBlock) => {
    const section = sections.find((entry) => entry.groups.some((member) => member.group === block.group))?.section;
    return section && section !== block.group ? `${section} / ${block.group}` : block.group;
  };
  const listHeading = isSearching
    ? `${visibleBlocks.length} ${visibleBlocks.length === 1 ? "match" : "matches"}${editedOnly ? " among edited blocks" : " in every section"}`
    : editedOnly
      ? `${visibleBlocks.length} edited ${visibleBlocks.length === 1 ? "block" : "blocks"} in every section`
      : `${groupBlocks.length} in ${resolvedGroup}`;

  return (
    <div className="space-y-8">
      <DevToolSection
        tool="copy-studio"
        description="The words on public pages that are not part of an article: page intros, footers, empty states and SEO text. Blocks keep a checked-in default to go back to."
      >
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(19rem,23rem)_minmax(0,1fr)] lg:items-start xl:gap-8">
          <section
            ref={listRef}
            aria-labelledby="copy-list-heading"
            className="scroll-mt-24 space-y-3 lg:sticky lg:top-24"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 id="copy-list-heading" className="type-meta-label theme-text-muted">
                Blocks
              </h3>
              <p className="theme-text-muted text-xs tabular-nums" aria-live="polite">
                {catalogueReady ? `${blocks.length} blocks, ${editedCount} edited` : catalogue.error ? `${blocks.length} blocks, edits unknown` : "Checking which are edited"}
              </p>
            </div>

            {catalogue.error ? (
              <LoadErrorState
                what="which blocks are edited"
                message={catalogue.error}
                onRetry={catalogue.retry}
                busy={catalogue.fetching}
                secondary={<span className="theme-text-muted text-xs">Meanwhile every block is listed with its default, and opening one still loads what is live.</span>}
              />
            ) : null}
            {unknownDeepLink ? (
              <p role="status" className="theme-warning-text flex items-start gap-2 text-sm">
                <Icon icon="lucide:triangle-alert" size={14} className="mt-0.5 shrink-0" />
                <span>{`No copy block has the key "${initialKey}". It may have been renamed, or the address may be mistyped.`}</span>
              </p>
            ) : null}

            <SectionChoices
              sections={sections.map((entry) => ({ value: entry.section, count: countSectionBlocks(entry) }))}
              value={acrossGroups ? "" : resolvedSection?.section ?? ""}
              onChange={(section) => {
                const first = sections.find((entry) => entry.section === section)?.groups[0];
                if (first) selectGroup(first.group);
              }}
            />

            {resolvedSection && resolvedSection.groups.length > 1 ? (
              <div className="flex items-center gap-2 text-sm">
                <label htmlFor="copy-group" className="theme-text-muted shrink-0">Group</label>
                <EditorSelect
                  id="copy-group"
                  selectSize="sm"
                  value={resolvedGroup}
                  onChange={(event) => selectGroup(event.target.value)}
                  className="min-w-0 flex-1"
                  options={resolvedSection.groups.map((entry) => ({
                    value: entry.group,
                    label: `${groupLabel(entry.group, resolvedSection.section)} (${entry.blocks.length})`,
                  }))}
                />
              </div>
            ) : null}

            <div className="relative">
              <Icon icon="lucide:search" size={15} className="theme-text-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                ref={searchRef}
                type="search"
                aria-label="Search"
                aria-description="Matches a block key, label or the words it shows, across every group."
                aria-keyshortcuts="/"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && searchQuery) {
                    event.preventDefault();
                    setSearchQuery("");
                  }
                }}
                placeholder="Key, label or words on the page"
                className="pl-9 pr-9 text-[16px] md:text-sm"
              />
              {searchQuery ? null : (
                <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 [@media(pointer:coarse)]:hidden">
                  <kbd className="theme-dev-kbd">/</kbd>
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="theme-text-muted text-xs tabular-nums" aria-live="polite">{listHeading}</p>
              <div className="flex items-center gap-1">
                {acrossGroups ? (
                  <Button
                    type="button"
                    variant="link"
                    size="auto"
                    className={cn("text-xs", TOUCH_HALO_Y)}
                    onClick={() => {
                      setSearchQuery("");
                      setEditedOnly(false);
                    }}
                  >
                    Back to {resolvedGroup}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant={editedOnly ? "pillActive" : "ghostPill"}
                  size="pill"
                  aria-pressed={editedOnly}
                  disabled={!catalogueReady}
                  onClick={() => setEditedOnly((on) => !on)}
                  className="h-7 px-2.5 text-xs"
                >
                  Edited only
                  {catalogueReady ? <span className="tabular-nums opacity-80"><span className="sr-only">, </span>{editedCount}</span> : null}
                </Button>
              </div>
            </div>

            <EditorList
              label="Copy blocks"
              items={visibleBlocks}
              getKey={(block) => block.key}
              selectedKey={activeBlock?.key ?? null}
              onSelect={selectBlock}
              estimateRowHeight={64}
              maxHeight="min(calc(100dvh - 26rem), 640px)"
              emptyText={
                isSearching
                  ? "No block key, label or text matches that."
                  : editedOnly
                    ? "No block is edited yet: every block shows its checked-in default."
                    : "No copy blocks in this group."
              }
              renderItem={(block, { selected }) => (
                <CopyBlockRowView
                  block={block}
                  active={selected}
                  dirty={selected && isDirty}
                  pending={pendingKeys.has(block.key) || proposals.has(block.key)}
                  query={isSearching ? searchQuery : ""}
                  place={acrossGroups ? placeOf(block) : null}
                  defaultMatch={isSearching && copySearchMatch(block, searchQuery) === "default"}
                />
              )}
            />
            {isSearching && visibleBlocks.length === 0 ? (
              <p className="theme-text-muted text-sm">
                {`Nothing answers to "${searchQuery.trim()}" by key, label or the words on the page. `}
                <Button type="button" variant="link" size="auto" className="text-sm" onClick={() => setSearchQuery("")}>
                  Clear the search
                </Button>
              </p>
            ) : null}
            {visibleBlocks.length > 0 ? (
              <p className="theme-text-faint hidden text-xs [@media(pointer:fine)]:block">
                <kbd className="theme-dev-kbd">↑</kbd> <kbd className="theme-dev-kbd">↓</kbd> move, <kbd className="theme-dev-kbd">/</kbd> search, <kbd className="theme-dev-kbd">?</kbd> every key
              </p>
            ) : null}
          </section>

          <section
            ref={paneRef}
            aria-label={activeBlock ? `Block: ${activeBlock.label}` : "Block"}
            className={cn("scroll-mt-24 min-w-0", !activeBlock && "hidden lg:block")}
          >
            {activeBlock ? (
              <CopyBlockPane
                key={activeBlock.key}
                block={activeBlock}
                place={placeOf(activeBlock)}
                draft={draft}
                onChange={setDraft}
                dirty={isDirty}
                canApprove={canApprove}
                pending={pendingKeys.has(activeBlock.key) || proposals.has(activeBlock.key)}
                proposal={proposalFor(activeBlock.key)}
                storedBy={canApprove ? activeBlock.updatedBy ?? null : null}
                lengthGuide={copyLengthGuide(activeBlock)}
                saving={saving}
                uncertain={uncertain}
                loading={!ready}
                loadError={detailSource.error}
                onRetryLoad={detailSource.reload}
                locked={uncertain || saving || !ready}
                notice={notice}
                onDismissNotice={() => setNotice(null)}
                onPublish={requestPublish}
                onDiscard={discardDraft}
                canReset={canReset}
                onLoadDefault={handleResetDraft}
                onRemove={requestRemove}
                twin={twin}
                onOpenTwin={(key) => guard(() => openBlock(key))}
                onClose={closePane}
                onBackToList={backToList}
                titleRef={paneTitleRef}
                placeholders={placeholders}
                placeholderDelta={placeholderDelta}
                previewText={previewText}
                diffText={diffText}
                saveKeyLabel={saveKeyLabel}
              />
            ) : (
              <IdlePane canApprove={canApprove} />
            )}
          </section>
        </div>
      </DevToolSection>
      {dirtyGuardDialog}
      {confirmDialog}
    </div>
  );
}

/** Six sections in two rows of three, so none hides behind a sideways scroll in the list column. */
function SectionChoices({
  sections,
  value,
  onChange,
}: {
  sections: readonly { value: string; count: number }[];
  value: string;
  onChange: (section: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Copy sections"
      className="grid grid-cols-3 gap-1 rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-1"
    >
      {sections.map((section) => {
        const selected = section.value === value;
        return (
          <Button
            key={section.value}
            type="button"
            variant={selected ? "pillActive" : "ghostPill"}
            size="pill"
            aria-pressed={selected}
            onClick={() => onChange(section.value)}
            className={cn("h-auto min-h-9 w-full flex-col gap-0 rounded-control px-1.5 py-1 leading-tight [@media(pointer:coarse)]:min-h-11", TOUCH_HALO_Y)}
          >
            <span className="text-xs font-medium">{section.value}</span>
            <span className={cn("text-xs tabular-nums", selected ? "opacity-80" : "theme-text-faint")}>
              <span className="sr-only">, </span>
              {section.count}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

/** Two lines at one pitch: the label and its marks, then the key (and where it lives, across groups). */
function CopyBlockRowView({
  block,
  active,
  dirty,
  pending,
  query,
  place,
  defaultMatch,
}: {
  block: CopyStudioBlock;
  active: boolean;
  dirty: boolean;
  pending: boolean;
  /** The search, so the row marks what matched. */
  query: string;
  place: string | null;
  defaultMatch: boolean;
}) {
  const flavor = copyBlockFlavorLabel(block.flavor);
  return (
    <EditorListRow active={active} className="h-[3.75rem] overflow-hidden py-2" data-copy-key={block.key}>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn("min-w-0 truncate text-sm font-medium", active ? "theme-accent-heading" : "theme-text-primary")}>
            {query ? <HighlightedText text={block.label} query={query} /> : block.label}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {dirty ? (
              <span className="theme-text-muted flex items-center gap-1.5 text-xs">
                <span className="sr-only">, </span>
                <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 rounded-full" />
                <span>Unsaved</span>
              </span>
            ) : null}
            {flavor ? (
              <EditorStatusPill tone="neutral" inline>
                <span className="sr-only">, </span>
                {flavor}
              </EditorStatusPill>
            ) : null}
            {block.source === "data" ? (
              <EditorStatusPill tone="info" inline>
                <span className="sr-only">, </span>
                Edited
              </EditorStatusPill>
            ) : null}
            {pending ? (
              <EditorStatusPill tone="neutral" inline>
                <span className="sr-only">, </span>
                Pending
              </EditorStatusPill>
            ) : null}
          </span>
        </span>
        <span className="theme-text-faint block truncate text-xs">
          <span className="sr-only">, </span>
          {place ? `${place} · ` : null}
          <span className="font-mono">{query ? <HighlightedText text={block.key} query={query} /> : block.key}</span>
          {defaultMatch ? " · matched its default wording" : null}
        </span>
      </span>
    </EditorListRow>
  );
}

/** What the pane says on desktop before a block is open. Hidden on phones, where the list is the whole view. */
function IdlePane({ canApprove }: { canApprove: boolean }) {
  return (
    <EditorPanel variant="subtle" className="space-y-3 px-5 py-6">
      <p className="theme-text-primary flex items-center gap-2 text-base font-semibold">
        <Icon icon="lucide:type" size={18} className="theme-icon-accent shrink-0" />
        Pick a block to edit
      </p>
      <p className="theme-text-muted max-w-[60ch] text-sm">
        Its words open here with a preview drawn the way the public page draws it, the change against what is live, and the
        way back to its checked-in default. Search finds a block by the words you saw on the page.
      </p>
      <SaveLine model="record" destination={canApprove ? "live" : "proposal"} copy={canApprove ? COPY_PUBLISH_SAVE_COPY : undefined} />
    </EditorPanel>
  );
}

/** "Docs · Code" reads "Code" under the Docs section; the section already says Docs. */
function groupLabel(group: string, section: string): string {
  const prefix = `${section} · `;
  return group.startsWith(prefix) ? group.slice(prefix.length) : group;
}

/**
 * The copy blocks with an open change proposal, read from the proposal list
 * the Change Review tab reads (an editor sees their own, an admin everyone's),
 * again after this session submits one. A failed read leaves the marks off;
 * the session's own submissions are marked regardless.
 */
function useOpenCopyProposals(submitted: number): ReadonlyMap<string, OpenCopyProposal> {
  const [open, setOpen] = useState<ReadonlyMap<string, OpenCopyProposal>>(() => new Map());
  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve()
      .then(() => fetch("/api/dev/proposals", { cache: "no-store", credentials: "same-origin", signal: controller.signal }))
      .then(async (response) => {
        if (!response?.ok) return;
        const payload = (await response.json()) as { proposals?: CopyProposalRow[] };
        if (Array.isArray(payload.proposals)) setOpen(openCopyProposals(payload.proposals));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [submitted]);
  return open;
}
