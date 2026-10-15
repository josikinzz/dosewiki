"use client";

/**
 * The open article or blog post in the Writing workspace: a docked pane with
 * one header (the saved title, kind and state, its public address, Back to
 * list below `lg`), any recovery choice, the fields beside a live preview
 * drawn the way the public page draws it, the versions this page went
 * through, and a sticky save dock holding the result of the last save beside
 * the save itself.
 */

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";

import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import type { ArticleBylineAuthor } from "@/features/articles/domain/articleByline";
import { EffectIndexArticlePage } from "@/features/articles/pages/EffectIndexArticlePage";
import { toWritingBlogPost } from "@/features/blog/domain/writingBlogModel";
import { WritingBlogPostPage } from "@/features/blog/pages/WritingBlogPostPage";
import type { NarrativeHistoryEntry } from "@/features/effects/editing/NarrativeHistory";
import {
  EditorPanel,
  EditorSegmentedControl,
  EditorStatusPill,
  LoadErrorState,
  Notice,
  SaveLine,
  useConfirm,
  useDevShortcuts,
  type NoticeMessage,
  type SaveLineCopy,
} from "@/features/dev/components";
import { DiffPreview } from "@/features/dev/components/DiffPreview";
import { useWriteFreeze } from "@/features/dev/components/writeFreeze";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { buildTextChangelog } from "@/utils/data/changelog";
import { formatCheckpointTime } from "@/features/dev/recovery/draftRecovery";

import { useModifierKeyLabel } from "../../pages/DevCommandPalette";
import { RelativeDay } from "../home/homeParts";
import type { WritingWorkbenchController } from "./useWritingWorkbenchController";
import { WritingFields } from "./WritingFields";
import {
  WRITING_FIELD_LABELS,
  changedWritingFields,
  describeWritingChanges,
  formatPublicationDate,
  writingAddress,
  writingKindNoun,
  writingSaveAction,
  writingSaveBlocker,
  type WritingDraft,
} from "./writingEditorModel";
import { WritingRecoveryPanels } from "./WritingRecoveryPanels";

/** How the pane lays out the fields and the preview. */
export type WritingView = "write" | "preview" | "both";

const VIEW_OPTIONS = [
  { value: "write", label: "Write", icon: "lucide:pencil-line" },
  { value: "preview", label: "Preview", icon: "lucide:eye" },
  { value: "both", label: "Both", icon: "lucide:columns-2" },
];

/** The dock's own sentence for an admin: a draft stays private, publishing goes live at once. */
export const WRITING_ADMIN_SAVE_COPY: SaveLineCopy = {
  label: "Drafts stay private. Publishing goes live at once.",
  detail: "Save draft keeps the page off the public site. Publish writes it to its public address as soon as it saves.",
  icon: "lucide:file-pen-line",
  tone: "info",
};

export const FREEZE_REFUSAL = "Writes are paused, so your changes were not published.";

const SAVE_SHORTCUTS = [{ keys: "Cmd+S", label: "Save the open page (asks first)" }] as const;

/** Whether this screen can hold the fields and the preview side by side. */
function wideScreen(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(min-width: 1280px)").matches;
}

export function WritingPane({
  controller,
  contributorProfiles,
  profilesLoading,
  canApprove,
  titleRef,
  onBackToList,
}: {
  controller: WritingWorkbenchController;
  contributorProfiles: NormalizedUserProfile[];
  profilesLoading: boolean;
  canApprove: boolean;
  titleRef: RefObject<HTMLHeadingElement | null>;
  onBackToList: () => void;
}) {
  const { kind, draft, baseline, loadedRow, selection, isDirty, saveState, uncertain } = controller;
  const headingId = useId();
  const [view, setView] = useState<WritingView>(() => (wideScreen() ? "both" : "write"));
  const { confirm, dialog } = useConfirm();
  const saveKeyLabel = useModifierKeyLabel("S");
  const frozen = useWriteFreeze().frozen;
  const isNew = selection.type === "new";
  const rowKind = loadedRow?.kind ?? kind;
  const noun = writingKindNoun(rowKind);
  const address = writingAddress(rowKind, draft.slug.trim() || loadedRow?.slug || "");
  const savedAddress = loadedRow ? writingAddress(rowKind, loadedRow.slug) : null;
  const wasPublished = baseline.status === "published" && !isNew;
  const changed = changedWritingFields(baseline, draft);
  const blocker = writingSaveBlocker({
    draft,
    slugAvailability: controller.slugAvailability,
    dateError: controller.dateError,
    coverError: controller.coverError,
    bodyError: controller.parsedBody.error,
  });
  const action = writingSaveAction({ status: draft.status, wasPublished, isNew, title: draft.title, address });
  const saving = saveState === "saving";
  // An editor's proposal never renames a saved page.
  const renameRefused = !canApprove && loadedRow !== null && draft.slug.trim() !== loadedRow.slug;
  const canPress = controller.canSave && isDirty && !uncertain && !renameRefused;
  const primaryLabel = canApprove ? action.label : "Submit for review";

  const askSave = () => {
    if (!canPress || saving) return;
    if (!canApprove) {
      void controller.submitForReview();
      return;
    }
    const command = controller.reviewedSaveCommand;
    confirm({
      title: action.confirmTitle,
      description: `${describeWritingChanges(changed)} ${action.consequence}`.trim(),
      body: <WritingChangesReview keys={changed} baseline={baseline} draft={draft} />,
      confirmLabel: action.label,
      wide: true,
      // The dialog closes at once; the result lands in the dock beside Save.
      onConfirm: () => {
        void controller.saveReviewed(command);
      },
    });
  };
  const askDiscard = () => {
    if (!isDirty || uncertain || saving) return;
    confirm({
      title: isNew ? "Discard this new draft?" : `Discard your edits to “${baseline.title || "this page"}”?`,
      description: isNew
        ? "Nothing of it has been saved. Discarding empties the form."
        : `${describeWritingChanges(changed)} Discarding returns the form to the saved version. The live page does not change.`.trim(),
      confirmLabel: "Discard edits",
      cancelLabel: "Keep editing",
      destructive: true,
      onConfirm: () => controller.discard(),
    });
  };

  // Cmd+S or Ctrl+S: the same as pressing the dock's button, confirm included.
  const askSaveRef = useRef(askSave);
  askSaveRef.current = askSave;
  useDevShortcuts(SAVE_SHORTCUTS);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (!document.querySelector('[role="dialog"], [role="alertdialog"]')) askSaveRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The row the header describes has arrived (not the one a new pick is replacing).
  const rowReady = isNew || (loadedRow !== null && selection.type === "row" && loadedRow.slug === selection.slug);
  const heading = isNew
    ? baseline.title || draft.title.trim() || `New ${noun}`
    : rowReady
      ? baseline.title || loadedRow?.slug || "Untitled"
      : selection.type === "row" ? selection.slug : "Untitled";
  const dateLabel = formatPublicationDate(baseline.publicationDate);
  const loadingRow = controller.isLoadingRow;
  const rowFailed = Boolean(controller.rowError) && !loadingRow;
  const showPreview = view !== "write";
  const showFields = view !== "preview";

  return (
    <EditorPanel className="overflow-visible" data-testid="writing-pane" aria-labelledby={headingId} role="region">
      <header className="theme-portal-rule relative space-y-2 border-b px-4 py-3.5 sm:px-5">
        <div className="lg:hidden">
          <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBackToList}>
            <Icon icon="lucide:arrow-left" size={14} />
            Back to list
          </Button>
        </div>
        <h3
          id={headingId}
          ref={titleRef}
          tabIndex={-1}
          className="theme-accent-heading min-w-0 break-words text-xl font-semibold leading-tight outline-none"
        >
          <span className="sr-only">Editing </span>
          {heading}
        </h3>
        <div hidden={!rowReady} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
          <EditorStatusPill tone={isNew ? "neutral" : wasPublished ? "success" : "warning"}>
            {isNew ? `New ${noun}, not saved yet` : `${rowKind === "blog" ? "Blog post" : "Article"}, ${wasPublished ? "live" : "draft"}`}
          </EditorStatusPill>
          {savedAddress && wasPublished ? (
            <a
              href={savedAddress}
              target="_blank"
              rel="noreferrer"
              className="theme-focus-ring theme-accent-underline inline-flex min-h-11 items-center gap-1.5 rounded-control font-medium text-dose-accent-strong underline-offset-4 hover:underline sm:min-h-0"
            >
              View live
              <span className="sr-only">{`: ${savedAddress}, opens in a new tab`}</span>
              <Icon icon="lucide:arrow-up-right" size={14} />
            </a>
          ) : null}
          {savedAddress ? (
            <span aria-hidden={wasPublished || undefined} className="theme-text-faint break-all font-mono text-xs">
              {savedAddress}
            </span>
          ) : null}
        </div>
        {!isNew && rowReady && (dateLabel || controller.savedAt) ? (
          <p className="theme-text-faint text-xs">
            {dateLabel ? `Dated ${dateLabel}` : null}
            {dateLabel && controller.savedAt ? " · " : null}
            {controller.savedAt ? <SavedAt at={controller.savedAt} /> : null}
          </p>
        ) : null}
      </header>

      <div className="space-y-7 px-4 py-5 sm:px-5 [&_:is(input,button,textarea)]:scroll-mb-40 [&_:is(input,button,textarea)]:scroll-mt-28">
        {rowFailed ? (
          <LoadErrorState what={`“${selection.type === "row" ? selection.slug : "this page"}”`} message={controller.rowError ?? ""} onRetry={controller.retryRow} />
        ) : loadingRow ? (
          <Notice tone="loading" message="Loading this page. Editing unlocks when it arrives." />
        ) : null}

        {rowFailed ? null : (
          <>
            <WritingRecoveryPanels controller={controller} fieldLabels={WRITING_FIELD_LABELS} />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <EditorSegmentedControl label="View" value={view} onChange={(value) => setView(value as WritingView)} options={VIEW_OPTIONS} />
              <p className="theme-text-faint min-w-0 flex-1 basis-56 text-xs">
                {view === "write"
                  ? "The preview is hidden. Switch to Preview or Both to see the page as readers will."
                  : "The preview follows as you type. Nothing is published until you save."}
              </p>
            </div>

            <div className={cn(view === "both" && "grid gap-8 xl:grid-cols-2 xl:items-start")}>
              {showFields ? (
                <div className="min-w-0">
                  <WritingFields
                    controller={controller}
                    contributorProfiles={contributorProfiles}
                    profilesLoading={profilesLoading}
                    canApprove={canApprove}
                    showStatus
                  />
                </div>
              ) : null}
              {showPreview ? (
                <WritingPreview controller={controller} contributorProfiles={contributorProfiles} sticky={view === "both"} />
              ) : null}
            </div>

            {loadedRow ? (
              <Versions controller={controller} history={loadedRow.history ?? []} />
            ) : null}
          </>
        )}
      </div>

      <footer
        hidden={rowFailed}
        aria-label="Save"
        className="theme-portal-rule sticky bottom-0 z-10 space-y-2.5 rounded-b-[inherit] border-t bg-[var(--editor-panel-bg)]/95 px-4 py-3 backdrop-blur sm:px-5"
      >
        <DockNotice controller={controller} frozen={frozen} />
        <DockBlocker
          uncertain={uncertain}
          canApprove={canApprove}
          saving={saving}
          onRetry={() => void controller.retrySave()}
          reason={
            isDirty && !uncertain && !loadingRow && !rowFailed && !controller.recoveryOffer && !controller.mergeReview
              ? renameRefused
                ? `A proposal cannot change the address. Put it back to ${loadedRow?.slug} to submit.`
                : blocker
              : null
          }
          choosing={Boolean(controller.recoveryOffer || controller.mergeReview)}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            type="button"
            variant="accent"
            size="sm"
            disabled={!canPress || saving}
            aria-busy={saving || undefined}
            aria-keyshortcuts="Meta+S Control+S"
            onClick={askSave}
          >
            <Icon icon={canApprove ? (draft.status === "published" ? "lucide:upload" : "lucide:save") : "lucide:send"} size={15} />
            {primaryLabel}
            <span aria-hidden className="[@media(pointer:coarse)]:hidden">
              <kbd className="theme-dev-kbd !text-current opacity-70">{saveKeyLabel}</kbd>
            </span>
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={!isDirty || saving || uncertain || controller.readOnly} onClick={askDiscard}>
            Discard edits
          </Button>
          <SaveState controller={controller} canApprove={canApprove} />
          <span className="min-w-0 sm:ml-auto">
            <SaveLine model="record" destination={canApprove ? "live" : "proposal"} copy={canApprove ? WRITING_ADMIN_SAVE_COPY : undefined} />
          </span>
        </div>
      </footer>
      {dialog}
    </EditorPanel>
  );
}

function SavedAt({ at }: { at: number }) {
  const date = new Date(at);
  return (
    <time dateTime={date.toISOString()} title={date.toLocaleString()}>
      {`Saved at ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
    </time>
  );
}

/**
 * The page as readers will see it: the article page or the blog post, drawn
 * by the public components in their embedded form so the preview column
 * lays out on its own width rather than the viewport's.
 */
function WritingPreview({
  controller,
  contributorProfiles,
  sticky,
  bylineAuthors = [],
}: {
  controller: WritingWorkbenchController;
  contributorProfiles: NormalizedUserProfile[];
  sticky: boolean;
  bylineAuthors?: ArticleBylineAuthor[];
}) {
  const t = useT();
  const { draft, kind, loadedRow, parsedBody } = controller;
  const rowKind = loadedRow?.kind ?? kind;
  const previewAuthors = draft.authorProfileKeys.map((key) => {
    const profile = contributorProfiles.find((item) => item.key === key);
    return bylineAuthors.find((item) => item.key === key) ?? { key, name: profile?.displayName ?? key, href: `/contributors/${key.toLowerCase()}` };
  });
  const previewArticle = {
    ...loadedRow, title: draft.title, slug: draft.slug, tags: draft.tags, body_raw: draft.body, body_ast: parsedBody.ast,
    bodyFormat: draft.bodyFormat, shortDescription: draft.teaser, teaser: draft.teaser, coverImageUrl: draft.coverImageUrl,
    publicationDate: draft.publicationDate,
  };
  return (
    <section aria-label="Preview" className={cn("min-w-0 space-y-3", sticky && "xl:sticky xl:top-24")}>
      <p className="type-meta-label theme-text-muted">{`Preview, as ${rowKind === "blog" ? "a blog post" : "an article"}`}</p>
      <div className="max-h-none overflow-hidden rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] px-4 py-5 sm:px-6 xl:max-h-[calc(100dvh-9rem)] xl:overflow-y-auto">
        {parsedBody.error ? (
          <p className="theme-text-muted text-sm">Fix the body markup to see the preview.</p>
        ) : !draft.title.trim() && !draft.body.trim() ? (
          <p className="theme-text-muted text-sm">Start with a title and some words; the page appears here as you type.</p>
        ) : rowKind === "blog" ? (
          <WritingBlogPostPage post={toWritingBlogPost(previewArticle, previewAuthors)} embedded />
        ) : (
          <EffectIndexArticlePage article={previewArticle} bylineAuthors={previewAuthors} t={t} embedded />
        )}
      </div>
    </section>
  );
}

/** Loading a newer saved version, and the recorded changes to this page. */
function Versions({ controller, history }: { controller: WritingWorkbenchController; history: NarrativeHistoryEntry[] }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="theme-portal-rule space-y-3 border-t pt-6">
      <div className="space-y-0.5">
        <h4 id={id} className="theme-text-primary text-sm font-semibold">Versions</h4>
        <p className="theme-text-muted max-w-[75ch] text-xs">
          Someone may have saved this page since you opened it. Loading the latest saved version merges it with your edits; a field you both changed waits for your choice.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={controller.readOnly || controller.uncertain || controller.saveState === "saving"}
        onClick={() => void controller.reconcile()}
      >
        <Icon icon="lucide:refresh-cw" size={14} />
        Load the latest saved version
      </Button>
      <HistoryList entries={history} />
    </section>
  );
}

/** The five latest recorded changes, each opening in place (the accordion pattern). */
function HistoryList({ entries }: { entries: NarrativeHistoryEntry[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (entries.length === 0) {
    return <p className="theme-text-faint text-xs">No recorded changes yet. Changes published from the public page panel show here.</p>;
  }
  return (
    <div className="space-y-1">
      <p className="type-meta-label theme-text-muted">Recent changes</p>
      <ul className="theme-dev-link-list -mx-2.5">
        {entries.map((entry) => {
          const expanded = open === entry.revision;
          const regionId = `writing-history-${entry.revision}`;
          return (
            <li key={entry.revision}>
              <h5 className="m-0">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={regionId}
                  onClick={() => setOpen(expanded ? null : entry.revision)}
                  className={cn("theme-dev-link-row flex min-h-11 w-full items-center gap-3 rounded-control px-2.5 py-2 text-left text-sm", expanded && "theme-dev-link-lead")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="theme-text-primary block truncate">{entry.actorEmail}</span>
                    <span className="theme-text-faint block text-xs"><RelativeDay iso={entry.createdAt} /></span>
                  </span>
                  <ExpandIndicator isExpanded={expanded} />
                </button>
              </h5>
              <div id={regionId} hidden={!expanded} className="grid min-w-0 gap-3 px-2.5 pb-3 md:grid-cols-2">
                <div className="min-w-0">
                  <p className="type-meta-label theme-text-faint">Before</p>
                  <pre className="theme-text-secondary max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(entry.before, null, 2)}</pre>
                </div>
                <div className="min-w-0">
                  <p className="type-meta-label theme-text-faint">After</p>
                  <pre className="theme-text-secondary max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(entry.after, null, 2)}</pre>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** What each changed field was and is, for the publish confirm. The body shows as a diff. */
export function WritingChangesReview({ keys, baseline, draft }: { keys: readonly (keyof WritingDraft)[]; baseline: WritingDraft; draft: WritingDraft }) {
  if (keys.length === 0) return null;
  return (
    <div aria-label="Review document changes" className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
      {keys.map((key) => (
        <div key={key} className="min-w-0 space-y-1.5">
          <p className="type-meta-label theme-text-muted">{WRITING_FIELD_LABELS[key]}</p>
          {key === "body" ? (
            <DiffPreview diffText={buildTextChangelog("Body", baseline.body, draft.body).markdown.replace(/^# [^\n]*\n+/, "")} maxHeight={240} />
          ) : (
            <dl className="grid gap-1 text-sm">
              <div className="flex min-w-0 gap-2">
                <dt className="theme-text-faint w-12 shrink-0">Was</dt>
                <dd className="theme-text-muted min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{fieldText(baseline[key])}</dd>
              </div>
              <div className="flex min-w-0 gap-2">
                <dt className="theme-text-faint w-12 shrink-0">Now</dt>
                <dd className="theme-text-primary min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{fieldText(draft[key])}</dd>
              </div>
            </dl>
          )}
        </div>
      ))}
    </div>
  );
}

function fieldText(value: unknown): string {
  if (Array.isArray(value)) return value.length === 0 ? "None" : value.join(", ");
  if (value === "draft") return "Draft";
  if (value === "published") return "Published";
  return typeof value === "string" ? value || "Empty" : JSON.stringify(value);
}

/** The result of the last save, in the dock: success, conflict with its way forward, the freeze, or the route's words. */
function DockNotice({ controller, frozen }: { controller: WritingWorkbenchController; frozen: boolean }) {
  const { notice, saveFailure, isDirty } = controller;
  if (!notice) return null;
  // A success says what happened until the next edit makes it stale.
  if (isDirty && notice.tone === "success") return null;
  let shown: NoticeMessage = notice;
  if (saveFailure === "conflict") {
    shown = {
      tone: "danger",
      message: (
        <>
          <span>{notice.message}</span>{" "}
          <span>Load the latest saved version to merge their changes with yours, then save again.</span>
        </>
      ),
      actions: (
        <Button type="button" variant="outline" size="sm" onClick={() => void controller.reconcile()}>
          Load the latest saved version
        </Button>
      ),
    };
  } else if (saveFailure && (saveFailure === "frozen" || frozen)) {
    shown = {
      tone: "danger",
      title: FREEZE_REFUSAL,
      message: "Your edits are still here and kept in this browser. Save again once writes resume.",
    };
  }
  return <Notice {...shown} dismiss={controller.dismissNotice} className="text-sm" />;
}

/** The one reason the dock cannot do the obvious thing right now, when there is one. */
function DockBlocker({
  uncertain,
  canApprove,
  saving,
  onRetry,
  reason,
  choosing,
}: {
  uncertain: boolean;
  canApprove: boolean;
  saving: boolean;
  onRetry: () => void;
  reason: string | null;
  choosing: boolean;
}) {
  if (uncertain) {
    return (
      <div role="alert" className="theme-warning-text flex flex-wrap items-start gap-x-3 gap-y-2 text-xs">
        <p className="flex min-w-0 flex-1 basis-64 items-start gap-2">
          <Icon icon="lucide:triangle-alert" size={13} className="mt-0.5 shrink-0" />
          <span>
            <strong className="font-semibold">Publication has not been confirmed.</strong> Editing and discard are locked until you retry the original publication; it is sent exactly as before, never as a new save.
          </span>
        </p>
        <Button type="button" variant="outline" size="sm" disabled={saving || !canApprove} onClick={onRetry}>
          Retry publication confirmation
        </Button>
      </div>
    );
  }
  const content: ReactNode = choosing ? "Finish the recovery choice above before saving." : reason;
  if (!content) return null;
  return (
    <p className="theme-text-muted flex items-start gap-2 text-xs">
      <Icon icon="lucide:info" size={13} className="theme-text-faint mt-0.5 shrink-0" />
      <span>{content}</span>
    </p>
  );
}

/** One quiet line beside the actions: what the draft holds right now, and where it is kept. */
function SaveState({ controller, canApprove }: { controller: WritingWorkbenchController; canApprove: boolean }) {
  const { isDirty, saveState, checkpointSavedAt, baseline, selection } = controller;
  let content: ReactNode;
  if (saveState === "saving") {
    content = canApprove ? "Saving" : "Submitting";
  } else if (isDirty) {
    content = (
      <>
        <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 shrink-0 rounded-full" />
        {checkpointSavedAt !== null
          ? `Unsaved changes kept in this browser at ${formatCheckpointTime(checkpointSavedAt)}. Only you can restore them here.`
          : canApprove ? "Unsaved changes" : "Changes to propose"}
      </>
    );
  } else {
    content = selection.type === "new" ? "Nothing written yet" : baseline.status === "published" ? "No changes. Live as shown." : "No changes. A draft, off the public site.";
  }
  return (
    <p role="status" className={cn("flex min-w-0 items-center gap-2 text-xs", isDirty ? "theme-text-secondary" : "theme-text-faint")}>
      {content}
    </p>
  );
}

