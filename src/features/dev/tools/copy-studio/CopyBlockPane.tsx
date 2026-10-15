"use client";

import { useId, useState, type ReactNode, type RefObject } from "react";

import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { PublicMarkdownBody } from "@/components/pages/PublicMarkdownBody";
import { Button } from "@/components/ui/button";
import { TOUCH_HALO, TOUCH_ICON } from "@/components/ui/touchTargets";
import {
  EditorPanel,
  EditorStatusPill,
  LoadErrorState,
  Notice,
  SaveLine,
  type NoticeMessage,
  type SaveLineCopy,
} from "@/features/dev/components";
import { DiffPreview } from "@/features/dev/components/DiffPreview";
import { cn } from "@/lib/utils";

import { RelativeDay } from "../home/homeParts";
import { CopyBlockFields } from "./CopyBlockFields";
import {
  COPY_PREVIEW_PLACEHOLDER_VALUES,
  copyBlockFlavorLabel,
  describeCopySource,
  draftToText,
  resolveCopyPlaceholders,
  type CopyStudioBlock,
  type CopyStudioDraft,
  type PlaceholderCount,
} from "./copyStudioUtils";

export const COPY_PUBLISH_SAVE_COPY: SaveLineCopy = {
  label: "Publish goes live at once.",
  detail: "There is no draft step here: publishing writes this block to every public page that reads its key.",
  icon: "lucide:zap",
  tone: "warning",
};

export type CopyBlockPaneProps = {
  block: CopyStudioBlock;
  place: string;
  draft: CopyStudioDraft;
  onChange: (draft: CopyStudioDraft) => void;
  dirty: boolean;
  canApprove: boolean;
  pending: boolean;
  proposal: { href: string; number: string; mine: boolean; by: string } | null;
  storedBy: string | null;
  lengthGuide?: { target: number; where: string };
  saving: boolean;
  uncertain: boolean;
  loading: boolean;
  loadError: string | null;
  onRetryLoad: () => void;
  locked: boolean;
  notice: NoticeMessage | null;
  onDismissNotice: () => void;
  onPublish: () => void;
  onDiscard: () => void;
  canReset: boolean;
  onLoadDefault: () => void;
  onRemove: () => void;
  twin: CopyStudioBlock | null;
  onOpenTwin: (key: string) => void;
  onClose: () => void;
  onBackToList: () => void;
  titleRef: RefObject<HTMLHeadingElement | null>;
  placeholders: readonly PlaceholderCount[];
  placeholderDelta: { removed: string[]; added: string[] };
  previewText: string;
  diffText: string;
  saveKeyLabel: string;
};

export function CopyBlockPane(props: CopyBlockPaneProps) {
  const {
    block,
    place,
    draft,
    onChange,
    dirty,
    canApprove,
    pending,
    saving,
    uncertain,
    loading,
    loadError,
    onRetryLoad,
    locked,
    notice,
    onDismissNotice,
    onPublish,
    onDiscard,
    onClose,
    onBackToList,
    titleRef,
    saveKeyLabel,
  } = props;
  const headingId = useId();
  const flavor = copyBlockFlavorLabel(block.flavor);
  const publishLabel = canApprove ? "Publish copy" : "Submit for review";

  return (
    <EditorPanel className="overflow-visible" data-testid="copy-block-pane" aria-labelledby={headingId} role="region">
      <header className="theme-portal-rule relative space-y-2 border-b px-4 py-3.5 sm:px-5">
        <Button
          type="button"
          variant="iconGhost"
          size="icon"
          className={cn("absolute right-2 top-2 sm:right-3", TOUCH_ICON)}
          onClick={onClose}
          aria-label="Close block"
          title="Close block"
        >
          <Icon icon="lucide:x" size={18} />
        </Button>
        <div className="pr-12 lg:hidden">
          <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBackToList}>
            <Icon icon="lucide:arrow-left" size={14} />
            Back to list
          </Button>
        </div>
        <h3
          id={headingId}
          ref={titleRef}
          tabIndex={-1}
          className="theme-accent-heading min-w-0 break-words text-xl font-semibold leading-tight outline-none lg:pr-12"
        >
          <span className="sr-only">Editing </span>
          {block.label}
        </h3>
        <p className="theme-text-faint flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="break-all font-mono">{block.key}</span>
          <span aria-hidden>·</span>
          <span>{place}</span>
          {block.updatedAt ? (
            <>
              <span aria-hidden>·</span>
              <span>
                <RelativeDay iso={block.updatedAt} prefix="Stored" />
                {props.storedBy ? ` by ${props.storedBy}` : null}
              </span>
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {flavor ? <EditorStatusPill tone="neutral">{`${flavor} only`}</EditorStatusPill> : null}
          <EditorStatusPill tone={block.source === "data" ? "info" : "neutral"}>
            {block.source === "data" ? (block.fallback ? "Edited" : "Stored, no default") : "Default wording"}
          </EditorStatusPill>
          {pending ? <EditorStatusPill tone="info">Proposal pending</EditorStatusPill> : null}
          <span className="sr-only">{describeCopySource(block)}</span>
        </div>
        <TwinLine block={block} twin={props.twin} onOpenTwin={props.onOpenTwin} />
        {props.proposal ? (
          <p className="theme-text-muted text-sm">
            {props.proposal.mine
              ? `Your proposal #${props.proposal.number} for this block waits in Change Review.`
              : `${props.proposal.by} proposed a change to this block (#${props.proposal.number}). ${canApprove ? "Publishing here does not settle it." : "It waits in Change Review."}`}{" "}
            <a href={props.proposal.href} className="text-dose-accent-strong theme-accent-underline underline-offset-4 hover:underline">
              Open in Change Review
            </a>
          </p>
        ) : null}
      </header>

      <div className="space-y-7 px-4 py-5 sm:px-5 [&_:is(input,button,textarea)]:scroll-mb-40 [&_:is(input,button,textarea)]:scroll-mt-28">
        {loadError ? (
          <div role="alert">
            <LoadErrorState what={`“${block.label}”`} message={loadError} onRetry={onRetryLoad} />
          </div>
        ) : loading ? (
          <Notice tone="loading" message="Loading the stored copy for this block. Editing unlocks when it arrives." />
        ) : null}

        {loadError ? null : (
        <>
        <div className="space-y-3">
          <fieldset disabled={locked} className="min-w-0">
            <CopyBlockFields kind={block.kind} draft={draft} onChange={onChange} lengthGuide={props.lengthGuide} />
          </fieldset>
          <Placeholders placeholders={props.placeholders} delta={props.placeholderDelta} />
        </div>

        <PaneSection title="Preview" note={previewNote(block.kind, props.placeholders.length > 0)}>
          <div className="rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] px-4 py-3">
            <Preview kind={block.kind} draft={draft} text={props.previewText} />
          </div>
        </PaneSection>

        <PaneSection
          title="Changes"
          note={dirty ? "Against what is live now. Removed lines start with −, added lines with +." : undefined}
        >
          {dirty ? (
            <DiffPreview diffText={props.diffText} maxHeight={256} />
          ) : (
            <p className="theme-text-faint text-sm">No changes yet. Edit the words above and the difference shows here.</p>
          )}
        </PaneSection>

        <DefaultWording {...props} />
        </>
        )}
      </div>

      <footer
        aria-label="Save"
        className="theme-portal-rule sticky bottom-0 z-10 space-y-2.5 rounded-b-[inherit] border-t bg-[var(--editor-panel-bg)]/95 px-4 py-3 backdrop-blur sm:px-5"
      >
        {notice ? <Notice {...notice} dismiss={onDismissNotice} className="text-sm" /> : null}
        <DockBlocker uncertain={uncertain} loading={loading} failed={Boolean(loadError)} pending={pending && !dirty && !props.proposal} canApprove={canApprove} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            type="button"
            variant="accent"
            size="sm"
            disabled={!dirty || saving || loading || Boolean(loadError)}
            aria-busy={saving || undefined}
            aria-keyshortcuts="Meta+S Control+S"
            onClick={onPublish}
          >
            <Icon icon={canApprove ? "lucide:upload" : "lucide:send"} size={15} />
            {publishLabel}
            <span aria-hidden className="[@media(pointer:coarse)]:hidden">
              <kbd className="theme-dev-kbd !text-current opacity-70">{saveKeyLabel}</kbd>
            </span>
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={!dirty || saving || uncertain} onClick={onDiscard}>
            Discard edits
          </Button>
          <SaveState dirty={dirty} saving={saving} canApprove={canApprove} pending={pending} />
          <span className="min-w-0 sm:ml-auto">
            <SaveLine
              model="record"
              destination={canApprove ? "live" : "proposal"}
              copy={canApprove ? COPY_PUBLISH_SAVE_COPY : undefined}
            />
          </span>
        </div>
      </footer>
    </EditorPanel>
  );
}

function previewNote(kind: CopyStudioBlock["kind"], hasPlaceholders: boolean): string {
  const how = kind === "markdown" ? "Rendered as Markdown, the way the public page renders it." : kind === "list" ? "Listed the way the public page lists it." : "Shown as plain text, the way the public page shows it.";
  return hasPlaceholders ? `${how} Placeholders use sample values.` : how;
}

function PaneSection({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-2.5">
      <div className="space-y-0.5">
        <h4 id={id} className="theme-text-primary text-sm font-semibold">{title}</h4>
        {note ? <p className="theme-text-muted max-w-[75ch] text-xs">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Preview({ kind, draft, text }: { kind: CopyStudioBlock["kind"]; draft: CopyStudioDraft; text: string }) {
  if (kind === "list") {
    const items = draft.items.map((item) => item.trim()).filter(Boolean);
    return items.length > 0 ? (
      <ul className="list-disc space-y-1 pl-5 break-words">
        {items.map((item, index) => <li key={index}>{resolveCopyPlaceholders(item, COPY_PREVIEW_PLACEHOLDER_VALUES)}</li>)}
      </ul>
    ) : (
      <p className="theme-text-muted text-sm">No items will show.</p>
    );
  }
  if (!text.trim()) return <p className="theme-text-muted text-sm">This block will be empty.</p>;
  return kind === "markdown" ? <PublicMarkdownBody content={text} /> : <p className="whitespace-pre-wrap break-words">{text}</p>;
}

function Placeholders({ placeholders, delta }: { placeholders: readonly PlaceholderCount[]; delta: { removed: string[]; added: string[] } }) {
  if (placeholders.length === 0 && delta.removed.length === 0) return null;
  return (
    <div className="space-y-1.5" role="group" aria-label="Placeholders">
      {placeholders.length > 0 ? (
        <p className="theme-text-muted flex flex-wrap items-center gap-1.5 text-xs">
          <span>The page fills in</span>
          {placeholders.map((placeholder) => (
            <code key={placeholder.name} className="theme-text-secondary rounded-chip border border-[color:var(--editor-panel-border)] px-1.5 py-0.5 font-mono text-xs">
              {`{{${placeholder.name}}}`}
              {placeholder.count > 1 ? <span className="theme-text-faint"> ×{placeholder.count}</span> : null}
            </code>
          ))}
        </p>
      ) : null}
      {delta.removed.length > 0 ? (
        <p className="flex items-start gap-1.5 text-xs theme-warning-text">
          <Icon icon="lucide:triangle-alert" size={13} className="mt-0.5 shrink-0" />
          <span>
            {`You removed ${delta.removed.map((name) => `{{${name}}}`).join(", ")}. The page will no longer fill ${delta.removed.length === 1 ? "it" : "them"} in.`}
          </span>
        </p>
      ) : null}
      {delta.added.length > 0 ? (
        <p className="flex items-start gap-1.5 text-xs theme-warning-text">
          <Icon icon="lucide:triangle-alert" size={13} className="mt-0.5 shrink-0" />
          <span>
            {`${delta.added.map((name) => `{{${name}}}`).join(", ")} ${delta.added.length === 1 ? "is" : "are"} new here. Unless the page supplies ${delta.added.length === 1 ? "it" : "them"}, readers see the braces as typed.`}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function TwinLine({ block, twin, onOpenTwin }: { block: CopyStudioBlock; twin: CopyStudioBlock | null; onOpenTwin: (key: string) => void }) {
  const flavor = copyBlockFlavorLabel(block.flavor);
  if (!flavor && !twin) return null;
  return (
    <p className="theme-text-muted text-sm">
      {flavor ? (
        <>
          Shows on the {flavor} build only. {twin ? <>dose.wiki reads <code className="font-mono text-xs">{twin.key}</code></> : "dose.wiki reads the key without the suffix"}, and neither falls back to the other.{" "}
        </>
      ) : (
        <>{copyBlockFlavorLabel(twin?.flavor) ?? "Another build"} has its own wording of this block.{" "}</>
      )}
      {twin ? (
        <Button type="button" variant="link" size="auto" className={cn("text-sm", TOUCH_HALO)} onClick={() => onOpenTwin(twin.key)}>
          {flavor ? "Open the dose.wiki wording" : `Open the ${copyBlockFlavorLabel(twin.flavor) ?? "other"} wording`}
        </Button>
      ) : null}
    </p>
  );
}

function DefaultWording({ block, canApprove, canReset, uncertain, saving, onLoadDefault, onRemove }: CopyBlockPaneProps) {
  const resetHelpId = useId();
  const removeHelpId = useId();
  const defaultId = useId();
  const removeId = useId();
  const [showDefault, setShowDefault] = useState(false);
  const [showRemove, setShowRemove] = useState(false);
  const fallbackText = block.fallback ? draftToText(block.kind, block.fallback) : "";
  const canRemove = canApprove && block.source === "data";
  return (
    <PaneSection title="Default wording" note={describeCopySource(block)}>
      {block.fallback ? (
        <div className="space-y-2">
          <button
            type="button"
            aria-expanded={showDefault}
            aria-controls={defaultId}
            onClick={() => setShowDefault((open) => !open)}
            className={cn("theme-focus-ring theme-text-muted hover:theme-text-primary inline-flex items-center gap-1.5 rounded-control text-sm", TOUCH_HALO)}
          >
            {showDefault ? "Hide the default wording" : "Show the default wording"}
            <ExpandIndicator isExpanded={showDefault} />
          </button>
          <div id={defaultId} hidden={!showDefault}>
            <pre className="theme-text-secondary max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-card border border-[color:var(--editor-panel-border)] px-3 py-2 font-mono text-xs">
              {fallbackText || "(empty)"}
            </pre>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canReset || uncertain || saving}
          onClick={onLoadDefault}
          aria-describedby={resetHelpId}
        >
          <Icon icon="lucide:rotate-ccw" size={14} />
          Load default into draft
        </Button>
        <p id={resetHelpId} className="theme-text-faint min-w-0 flex-1 basis-60 text-xs">
          {!block.fallback
            ? "Off: this block has no checked-in default."
            : canReset
              ? `Puts the checked-in wording in your draft. Nothing changes on the site until you ${canApprove ? "publish" : "submit"} it.`
              : "Off: the editor already holds the checked-in wording."}
        </p>
      </div>
      {canRemove ? (
        <div className="theme-portal-rule space-y-2 border-t pt-3">
          <h5 className="m-0">
            <button
              type="button"
              aria-expanded={showRemove}
              aria-controls={removeId}
              onClick={() => setShowRemove((open) => !open)}
              className={cn("theme-focus-ring theme-text-muted hover:theme-text-primary inline-flex items-center gap-1.5 rounded-control text-sm", TOUCH_HALO)}
            >
              {block.fallback ? "Remove the stored copy" : "Delete this block's stored copy"}
              <ExpandIndicator isExpanded={showRemove} />
            </button>
          </h5>
          <div id={removeId} hidden={!showRemove} className="space-y-2">
            <p id={removeHelpId} className="theme-text-muted max-w-[75ch] text-xs">
              {block.fallback
                ? "Remove stored copy deletes the saved wording, so the public pages show the checked-in default right away. The stored wording cannot be recovered."
                : "Remove stored copy deletes the saved wording for good. This block has no checked-in default, so the public pages have nothing to show for it afterwards."}
            </p>
            <Button
              type="button"
              variant="ghostDestructive"
              size="sm"
              className="-ml-2"
              disabled={saving || uncertain}
              aria-describedby={removeHelpId}
              onClick={onRemove}
            >
              <Icon icon="lucide:trash-2" size={14} />
              Remove stored copy
            </Button>
          </div>
        </div>
      ) : null}
    </PaneSection>
  );
}

function DockBlocker({ uncertain, loading, failed, pending, canApprove }: { uncertain: boolean; loading: boolean; failed: boolean; pending: boolean; canApprove: boolean }) {
  let content: ReactNode = null;
  if (uncertain) {
    content = (
      <>
        <strong className="font-semibold">Publication unconfirmed.</strong> The site did not confirm your last publication. Press {canApprove ? "Publish copy" : "Submit for review"} again to retry the same one before you leave this block; the words hold still until it answers.
      </>
    );
  } else if (failed) {
    content = `${canApprove ? "Publishing" : "Submitting"} waits until the block loads.`;
  } else if (loading) {
    content = "Editing unlocks when the stored copy arrives.";
  } else if (pending) {
    content = "Your proposal for this block waits in Change Review. Edit again to send another.";
  }
  if (!content) return null;
  return (
    <p role={uncertain ? "alert" : undefined} className={cn("flex items-start gap-2 text-xs", uncertain ? "theme-warning-text" : "theme-text-muted")}>
      <Icon icon={uncertain ? "lucide:triangle-alert" : "lucide:info"} size={13} className={cn("mt-0.5 shrink-0", !uncertain && "theme-text-faint")} />
      <span>{content}</span>
    </p>
  );
}

function SaveState({ dirty, saving, canApprove, pending }: { dirty: boolean; saving: boolean; canApprove: boolean; pending: boolean }) {
  let content: ReactNode;
  if (saving) {
    content = canApprove ? "Publishing" : "Submitting";
  } else if (dirty) {
    content = (
      <>
        <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 shrink-0 rounded-full" />
        {canApprove ? "Unpublished changes" : "Changes to propose"}
      </>
    );
  } else {
    content = pending ? "Proposal pending" : "No changes yet";
  }
  return (
    <p aria-live="polite" className={cn("flex min-w-0 items-center gap-2 text-xs", dirty ? "theme-text-secondary" : "theme-text-faint")}>
      {content}
    </p>
  );
}
