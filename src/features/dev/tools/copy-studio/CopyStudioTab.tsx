"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PublicMarkdownBody } from "@/components/pages/PublicMarkdownBody";
import {
  DiffPreview,
} from "@/features/dev/components/DiffPreview";
import {
  EditorActionStatus,
  EditorField,
  EditorListItem,
  EditorNavTabs,
  EditorNotice,
  EditorSection,
  EditorStatusPill,
  EditorToolbar,
  type EditorActionStatusState,
  type EditorNoticeMessage,
  useScrollToDetail,
} from "@/features/dev/components";
import { buildTextChangelog } from "@/utils/data/changelog";
import { api } from "../../../../../convex/_generated/api";
import { stripDiffHeading } from "../about/aboutEditorUtils";
import { buildFieldDiff, proposalSubmittedNotice, submitToolProposal } from "../proposalSubmission";
import {
  blockCurrentText,
  buildCopyStudioBlocks,
  canResetToDefault,
  copyBlockFlavorLabel,
  countPlaceholders,
  COPY_PREVIEW_PLACEHOLDER_VALUES,
  draftFromBlock,
  draftToText,
  filterCopyStudioBlocks,
  groupCopyStudioBlocks,
  isDraftDirty,
  resolveCopyPlaceholders,
  type CopyBlockRow,
  type CopyStudioBlock,
  type CopyStudioDraft,
} from "./copyStudioUtils";

type SaveState = EditorActionStatusState | "idle";

type CopyStudioTabProps = {
  /** `/dev/copy-studio/<block key>`: the block to open on, wherever its group is. */
  initialKey?: string;
  /** Admin: Save writes the block; without it the same draft is submitted as a proposal. */
  canApprove: boolean;
};

/**
 * Copy Studio edits site copy that used to be hardcoded in page components.
 *
 * It reads only `copyBlocks` and combines the query result with 428 checked-in
 * defaults, never the substance corpus, so it renders as soon as its own query
 * resolves. Blocks without a stored row are still listed from those defaults.
 * An admin's save creates the row and reverting deletes it so the public read
 * falls back to the default again; an editor's save is submitted as a change
 * proposal for the Queue instead, and only an approval writes the row.
 *
 * The rail lists one group at a time; a search query replaces it with every
 * block whose key or label matches, across all groups.
 */
export function CopyStudioTab({ initialKey, canApprove }: CopyStudioTabProps) {
  const rows = useQuery(api.copyBlocks.getAll) as CopyBlockRow[] | undefined;

  const blocks = useMemo(() => buildCopyStudioBlocks(rows ?? []), [rows]);
  const groups = useMemo(() => groupCopyStudioBlocks(blocks), [blocks]);

  const [activeGroup, setActiveGroup] = useState<string>("");
  const [activeKey, setActiveKey] = useState<string>(initialKey ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const [draft, setDraft] = useState<CopyStudioDraft>({ body: "", items: [] });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);

  // The group tab follows the selected block until the editor picks a group
  // themselves, so a deep link lands on the block's own group.
  const resolvedGroup = groups.some((entry) => entry.group === activeGroup)
    ? activeGroup
    : groups.find((entry) => entry.blocks.some((block) => block.key === activeKey))?.group ??
      groups[0]?.group ??
      "";

  const isSearching = searchQuery.trim().length > 0;
  const visibleBlocks = useMemo(
    () =>
      isSearching
        ? filterCopyStudioBlocks(blocks, searchQuery)
        : groups.find((entry) => entry.group === resolvedGroup)?.blocks ?? [],
    [blocks, groups, isSearching, resolvedGroup, searchQuery],
  );

  const activeBlock: CopyStudioBlock | null = useMemo(() => {
    return visibleBlocks.find((block) => block.key === activeKey) ?? visibleBlocks[0] ?? null;
  }, [visibleBlocks, activeKey]);

  // The draft follows the selected block, and re-seeds whenever that block's
  // published value changes underneath it (a save landing, another editor's
  // write arriving over the live query).
  useEffect(() => {
    if (!activeBlock) {
      return;
    }
    setDraft(draftFromBlock(activeBlock));
    setSaveState("idle");
  }, [activeBlock?.key, activeBlock?.current.body, activeBlock?.current.items.join("\u0000")]);

  const selectBlock = useCallback((key: string) => {
    setActiveKey(key);
    setNotice(null);
  }, []);

  // Below the lg split the block list stacks above the editor. Keyed on the
  // tapped block, not `activeBlock`, so the first-block fallback on load and
  // on a group change does not move the page.
  const detailRef = useRef<HTMLDivElement | null>(null);
  useScrollToDetail(detailRef, activeKey || null);

  const isDirty = activeBlock ? isDraftDirty(activeBlock, draft) : false;
  const canReset = activeBlock ? canResetToDefault(activeBlock, draft) : false;

  const draftText = activeBlock ? draftToText(activeBlock.kind, draft) : "";
  const currentText = activeBlock ? blockCurrentText(activeBlock) : "";
  const placeholders = useMemo(() => countPlaceholders(draftText), [draftText]);
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

  const handleSave = useCallback(async () => {
    if (!activeBlock) {
      return;
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
          diff: buildFieldDiff([{ label: activeBlock.label, before: currentText, after: draftText }]),
        });
        setSaveState("saved");
        setNotice(proposalSubmittedNotice(`“${activeBlock.label}”`, proposalId));
        return;
      }

      const response = await fetch("/api/dev/copy-block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(block),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "The copy block could not be saved.");
      }

      setSaveState("saved");
      setNotice({
        tone: "success",
        message: `Saved “${activeBlock.label}”. The public pages reading this key are live with it now.`,
      });
    } catch (error) {
      setSaveState("error");
      setNotice({
        tone: "danger",
        title: canApprove ? "Save failed" : "Submission failed",
        message:
          error instanceof Error
            ? error.message
            : canApprove
              ? "The copy block could not be saved."
              : "The proposal could not be submitted.",
      });
    }
  }, [activeBlock, canApprove, currentText, draft, draftText]);

  /** Reset drops the draft back to the checked-in default without saving. */
  const handleResetDraft = useCallback(() => {
    if (!activeBlock?.fallback) {
      return;
    }
    setDraft({ body: activeBlock.fallback.body, items: [...activeBlock.fallback.items] });
    setSaveState("idle");
    setNotice({
      tone: "info",
      message: "Draft reset to the checked-in default. Save to publish it.",
    });
  }, [activeBlock]);

  /** Revert deletes the stored row, so the public read serves the default. */
  const handleRevertToDefault = useCallback(async () => {
    if (!activeBlock || activeBlock.source !== "convex") {
      return;
    }

    setSaveState("saving");
    setNotice(null);

    try {
      const response = await fetch("/api/dev/copy-block", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: activeBlock.key }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "The copy block could not be reverted.");
      }

      setSaveState("saved");
      setNotice({
        tone: "success",
        message: "Stored copy removed. This key now serves its checked-in default.",
      });
    } catch (error) {
      setSaveState("error");
      setNotice({
        tone: "danger",
        title: "Revert failed",
        message: error instanceof Error ? error.message : "The copy block could not be reverted.",
      });
    }
  }, [activeBlock]);

  if (rows === undefined) {
    return (
      <div className="mx-auto mt-10 max-w-xl">
        <StateCard
          icon="lucide:type"
          tone="accent"
          loading
          align="center"
          title="Loading site copy"
          description="Pulling the editable copy blocks into the studio."
        />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-8 md:mt-8">
      <EditorSection
        icon="lucide:type"
        title="Copy Studio"
        description="Editable prose for the public pages. Every block keeps a checked-in default, so reverting one restores the original wording."
        actions={
          <EditorStatusPill tone="neutral">
            {`${blocks.length} block${blocks.length === 1 ? "" : "s"}`}
          </EditorStatusPill>
        }
      >
        <EditorNavTabs
          label="Copy groups"
          value={isSearching ? "" : resolvedGroup}
          onChange={(group) => {
            setActiveGroup(group);
            setActiveKey("");
            setSearchQuery("");
            setNotice(null);
          }}
          options={groups.map((entry) => ({
            value: entry.group,
            label: entry.group,
            badge: entry.blocks.length,
          }))}
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <div className="space-y-3">
            <EditorField
              label="Search"
              description="Matches a block key or label across every group."
              counter={isSearching ? `${visibleBlocks.length} found` : undefined}
            >
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Key or label"
                />
              )}
            </EditorField>

            <div role="group" aria-label="Copy blocks" className="space-y-2">
              {visibleBlocks.map((block) => (
                <EditorListItem
                  key={block.key}
                  active={block.key === activeBlock?.key}
                  title={block.label}
                  subtitle={isSearching ? `${block.group} / ${block.key}` : block.key}
                  badge={
                    <span className="flex flex-wrap items-center justify-end gap-1">
                      {copyBlockFlavorLabel(block.flavor) ? (
                        <EditorStatusPill tone="caution">
                          {copyBlockFlavorLabel(block.flavor)}
                        </EditorStatusPill>
                      ) : null}
                      <EditorStatusPill tone={block.source === "convex" ? "info" : "neutral"}>
                        {block.source === "convex" ? "Edited" : "Default"}
                      </EditorStatusPill>
                    </span>
                  }
                  onSelect={() => selectBlock(block.key)}
                />
              ))}
              {isSearching && visibleBlocks.length === 0 ? (
                <p className="theme-text-faint px-1 text-sm">No block key or label matches that.</p>
              ) : null}
            </div>
          </div>

          <div ref={detailRef} className="scroll-mt-6 space-y-6">
            {activeBlock ? (
              <>
                {notice ? <EditorNotice notice={notice} /> : null}

                {copyBlockFlavorLabel(activeBlock.flavor) ? (
                  <EditorNotice
                    notice={{
                      tone: "info",
                      title: `${copyBlockFlavorLabel(activeBlock.flavor)} only`,
                      message:
                        "This block renders on the Effect Index build alone. The unsuffixed key beside it holds dose.wiki's wording, and the two never fall back to each other.",
                    }}
                  />
                ) : null}

                <EditorField
                  label={activeBlock.kind === "list" ? "Items" : "Copy"}
                  description={
                    activeBlock.kind === "markdown"
                      ? "Markdown. Links, emphasis, and paragraph breaks render on the public page."
                      : activeBlock.kind === "list"
                        ? "One entry per row. Blank rows are dropped on save."
                        : "Plain text. Markdown is not rendered for this block."
                  }
                  counter={
                    activeBlock.kind === "list"
                      ? `${draft.items.filter((item) => item.trim()).length} items`
                      : `${draft.body.length} characters`
                  }
                >
                  {(fieldProps) => activeBlock.kind === "list" ? (
                    <div className="space-y-2">
                      {draft.items.map((item, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            aria-label={`Item ${index + 1}`}
                            value={item}
                            onChange={(event) => {
                              const next = [...draft.items];
                              next[index] = event.target.value;
                              setDraft({ ...draft, items: next });
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="shrink-0 [@media(pointer:coarse)]:min-w-11"
                            aria-label={`Remove item ${index + 1}`}
                            onClick={() =>
                              setDraft({
                                ...draft,
                                items: draft.items.filter((_, position) => position !== index),
                              })
                            }
                          >
                            <Icon icon="lucide:trash-2" size={15} />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setDraft({ ...draft, items: [...draft.items, ""] })}
                      >
                        <Icon icon="lucide:plus" size={15} />
                        Add item
                      </Button>
                    </div>
                  ) : (
                    <Textarea
                      {...fieldProps}
                      className="leading-6"
                      rows={activeBlock.kind === "markdown" ? 12 : 4}
                      value={draft.body}
                      onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                    />
                  )}
                </EditorField>

                <EditorToolbar variant="split">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="accent"
                      size="sm"
                      disabled={!isDirty || saveState === "saving"}
                      onClick={() => void handleSave()}
                    >
                      <Icon icon={canApprove ? "lucide:save" : "lucide:send"} size={15} />
                      {canApprove ? "Save copy" : "Submit for review"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!canReset}
                      onClick={handleResetDraft}
                    >
                      <Icon icon="lucide:rotate-ccw" size={15} />
                      Reset to default
                    </Button>
                    {canApprove ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={activeBlock.source !== "convex" || saveState === "saving"}
                        onClick={() => void handleRevertToDefault()}
                      >
                        <Icon icon="lucide:undo-2" size={15} />
                        Remove stored copy
                      </Button>
                    ) : null}
                  </div>
                  {saveState === "idle" ? (
                    <EditorStatusPill tone={isDirty ? "warning" : "neutral"}>
                      {isDirty ? (canApprove ? "Unsaved changes" : "Changes to propose") : "No changes"}
                    </EditorStatusPill>
                  ) : (
                    <EditorActionStatus status={saveState} />
                  )}
                </EditorToolbar>

                {placeholders.length > 0 ? (
                  <EditorSection
                    headingLevel="h3"
                    icon="lucide:braces"
                    title="Placeholders"
                    description="Values the page substitutes at render time. The preview below uses illustrative numbers."
                  >
                    <div className="flex flex-wrap gap-2">
                      {placeholders.map((placeholder) => (
                        <EditorStatusPill key={placeholder.name} tone="info">
                          {`{{${placeholder.name}}} × ${placeholder.count}`}
                        </EditorStatusPill>
                      ))}
                    </div>
                  </EditorSection>
                ) : null}

                <EditorSection
                  headingLevel="h3"
                  icon="lucide:eye"
                  title="Preview"
                  description="Rendered with the same Markdown components the public pages use."
                >
                  <PublicMarkdownBody content={previewText} />
                </EditorSection>

                <EditorSection
                  headingLevel="h3"
                  icon="lucide:file-diff"
                  title="Pending changes"
                  actions={
                    <EditorStatusPill tone={isDirty ? "warning" : "success"}>
                      {isDirty ? "1 block changed" : "No changes"}
                    </EditorStatusPill>
                  }
                >
                  {isDirty ? (
                    <DiffPreview diffText={diffText} maxHeight={256} />
                  ) : (
                    <p className="theme-text-faint text-sm">No pending changes.</p>
                  )}
                </EditorSection>
              </>
            ) : (
              <p className="theme-text-faint text-sm">No copy blocks in this group.</p>
            )}
          </div>
        </div>
      </EditorSection>
    </div>
  );
}
