import { memo, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from "react";

import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TOUCH_HALO } from "@/components/ui/touchTargets";
import { DiffPreview } from "@/features/dev/components/DiffPreview";
import {
  EditorField,
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
import { useWriteFreeze } from "@/features/dev/components/writeFreeze";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import { normalizeWhitespace } from "@/lib/text";
import { cn } from "@/lib/utils";
import { viewToPath } from "@/utils/routing";
import { useModifierKeyLabel } from "../../pages/DevCommandPalette";
import { LINK_LIST_CLASS, RelativeDay } from "../home/homeParts";
import { joinWords } from "../writing/writingEditorModel";
import {
  ABOUT_COPY_BLOCKS,
  resizeTextareaToContent,
  resolveAboutPlaceholders,
  stripDiffHeading,
  textareaViewportCap,
} from "./aboutEditorUtils";
import { AboutPaneSection, ChangedMark } from "./AboutPaneSection";
import { AboutPreviewSection } from "./AboutPreviewSection";
import { AboutFounderSelectionSection } from "./AboutFounderSelectionSection";
import { AboutTranslationCreditsSection } from "./AboutTranslationCreditsSection";
import { useAboutEditorController } from "./useAboutEditorController";

const AUTO_RESIZE_MIN_HEIGHT = 240;
const SUBTITLE_MIN_HEIGHT = 80;
const SEARCH_DESCRIPTION_GUIDE = 160;

const PLACEHOLDER_TOKENS: Array<{ key: string; label: string }> = [
  { key: "compoundCount", label: "published substances" },
  { key: "effectCount", label: "tracked subjective effects" },
  { key: "reportCount", label: "published trip reports" },
  { key: "replicationCount", label: "replication gallery entries" },
  { key: "psychoactiveClassCount", label: "psychoactive classes" },
  { key: "categoryCount", label: "psychoactive classes (older name)" },
  { key: "chemicalClassCount", label: "chemical classes" },
  { key: "mechanismClassCount", label: "mechanism-of-action classes" },
  { key: "mechanismOfActionClassCount", label: "mechanism-of-action classes (older name)" },
];

export const ABOUT_PUBLISH_SAVE_COPY: SaveLineCopy = {
  label: "Publish goes live at once.",
  detail: "There is no draft step here: publishing writes the About page, its search description and the language pages that show the credits.",
  icon: "lucide:zap",
  tone: "warning",
};

const FREEZE_REFUSAL = "Writes are paused, so your changes were not published.";
const SAVE_SHORTCUTS = [{ keys: "Cmd+S", label: "Publish or submit the About page (asks first)" }] as const;

type AboutView = "write" | "preview" | "both";

function wideScreen(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(min-width: 1280px)").matches;
}

interface AboutEditorTabProps {
  availableProfiles: NormalizedUserProfile[];
  profilesLoading?: boolean;
  canApprove: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onCanDiscardChange?: (canDiscard: boolean) => void;
  titleRef?: RefObject<HTMLHeadingElement | null>;
  onBackToList?: () => void;
}

export const AboutEditorTab = memo(function AboutEditorTab({
  availableProfiles,
  profilesLoading,
  canApprove,
  onDirtyChange,
  onCanDiscardChange,
  titleRef,
  onBackToList,
}: AboutEditorTabProps) {
  const { confirm, dialog } = useConfirm();
  const controller = useAboutEditorController({ canApprove });
  const {
    isLoaded,
    draft,
    original,
    isDirty,
    saveState,
    publicationUncertain,
    copyNotice,
    dismissCopyNotice,
    markdownDiff,
    subtitleDiff,
    subtitleHasChanges,
    placeholderValues,
    replaceMarkdown,
    replaceSubtitle,
    resetMarkdown,
    resetSubtitle,
    resetFounderKeys,
    toggleFounderKey,
    addTranslationCredit,
    removeTranslationCredit,
    setTranslationCreditContribution,
    resetTranslationCredits,
    copyMarkdown,
    copySubtitle,
    save,
  } = controller;
  const headingId = useId();
  const saveKeyLabel = useModifierKeyLabel("S");
  const frozen = useWriteFreeze().frozen;
  const [view, setView] = useState<AboutView>(() => (wideScreen() ? "both" : "write"));

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => { onCanDiscardChange?.(!publicationUncertain && saveState !== "saving"); }, [onCanDiscardChange, publicationUncertain, saveState]);
  useEffect(() => () => onCanDiscardChange?.(true), [onCanDiscardChange]);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const subtitleTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isMarkdownDirty = normalizeWhitespace(draft.markdown) !== normalizeWhitespace(original.markdown);
  const isSubtitleDirty = normalizeWhitespace(draft.subtitle) !== normalizeWhitespace(original.subtitle);
  const subtitleLength = normalizeWhitespace(draft.subtitle).length;

  const currentFounderSet = useMemo(() => new Set(draft.founderKeys), [draft.founderKeys]);
  const originalFounderSet = useMemo(() => new Set(original.founderKeys), [original.founderKeys]);
  const addedFounders = useMemo(() => draft.founderKeys.filter((key) => !originalFounderSet.has(key)), [draft.founderKeys, originalFounderSet]);
  const removedFounders = useMemo(() => original.founderKeys.filter((key) => !currentFounderSet.has(key)), [currentFounderSet, original.founderKeys]);
  const isFounderSelectionDirty = addedFounders.length > 0 || removedFounders.length > 0;
  const isTranslationCreditsDirty = useMemo(
    () => JSON.stringify(draft.translationCredits) !== JSON.stringify(original.translationCredits),
    [draft.translationCredits, original.translationCredits],
  );
  const changedParts = [
    isMarkdownDirty ? "the page text" : null,
    isSubtitleDirty ? "the subtitle" : null,
    isFounderSelectionDirty ? "the founders" : null,
    isTranslationCreditsDirty ? "the translation credits" : null,
  ].filter((part): part is string => part !== null);

  const profileLabelByKey = useMemo(() => new Map(availableProfiles.map((profile) => [profile.key, profile.displayName])), [availableProfiles]);
  const formatFounderList = useMemo(() => (keys: string[]) => keys.map((key) => profileLabelByKey.get(key) ?? key).join(", "), [profileLabelByKey]);
  const resolvedPreviewMarkdown = useMemo(() => resolveAboutPlaceholders(draft.markdown, placeholderValues), [draft.markdown, placeholderValues]);
  const resolvedSubtitle = useMemo(() => resolveAboutPlaceholders(draft.subtitle, placeholderValues), [draft.subtitle, placeholderValues]);
  const selectedFounders = useMemo(
    () => availableProfiles.filter((profile) => currentFounderSet.has(profile.key)).sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [availableProfiles, currentFounderSet],
  );

  useEffect(() => {
    resizeTextareaToContent(textareaRef.current, AUTO_RESIZE_MIN_HEIGHT, textareaViewportCap());
  }, [draft.markdown, view, isLoaded]);
  useEffect(() => {
    resizeTextareaToContent(subtitleTextareaRef.current, SUBTITLE_MIN_HEIGHT, textareaViewportCap());
  }, [draft.subtitle, view, isLoaded]);

  const handleTextareaChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    resizeTextareaToContent(event.currentTarget, AUTO_RESIZE_MIN_HEIGHT, textareaViewportCap());
    replaceMarkdown(event.currentTarget.value);
  };
  const handleSubtitleTextareaChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    resizeTextareaToContent(event.currentTarget, SUBTITLE_MIN_HEIGHT, textareaViewportCap());
    replaceSubtitle(event.currentTarget.value);
  };

  const insertToken = (key: string) => {
    const element = textareaRef.current;
    const token = `{{${key}}}`;
    const value = draft.markdown;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    replaceMarkdown(`${value.slice(0, start)}${token}${value.slice(end)}`);
    requestAnimationFrame(() => {
      if (!element) return;
      element.focus();
      element.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const saving = saveState === "saving";
  const canPress = isLoaded && (isDirty || publicationUncertain) && !saving && !controller.loadingLatest;
  const primaryLabel = canApprove ? "Publish About page" : "Submit for review";
  const changes = joinWords(changedParts);

  const askSave = () => {
    if (!canPress) return;
    if (!canApprove) {
      void save();
      return;
    }
    confirm({
      title: publicationUncertain ? "Retry the About publication?" : "Publish the About page?",
      description: publicationUncertain
        ? "The last publication was not confirmed. Retrying sends exactly the same publication; if it already went through, nothing publishes twice."
        : `${changes ? `You changed ${changes}. ` : ""}It goes live on /about, in its search description and on the language pages that show the credits, as soon as it saves.`,
      body: publicationUncertain ? undefined : (
        <ChangesBody
          markdownDiff={isMarkdownDirty ? stripDiffHeading(markdownDiff) : null}
          subtitleDiff={subtitleHasChanges ? stripDiffHeading(subtitleDiff) : null}
          founders={isFounderSelectionDirty ? { added: formatFounderList(addedFounders), removed: formatFounderList(removedFounders) } : null}
          credits={isTranslationCreditsDirty}
        />
      ),
      wide: true,
      confirmLabel: publicationUncertain ? "Retry publication" : primaryLabel,
      onConfirm: () => {
        void save();
      },
    });
  };
  const askDiscard = () => {
    if (!isDirty || saving || publicationUncertain) return;
    confirm({
      title: "Discard your edits to the About page?",
      description: `You changed ${changes}. Discarding returns every part to the published version. The live page does not change.`,
      confirmLabel: "Discard edits",
      cancelLabel: "Keep editing",
      destructive: true,
      onConfirm: () => controller.discard(),
    });
  };
  const askLoadLatest = () => {
    confirm({
      title: "Load the latest version of the About page?",
      description: "Your edits here are dropped and the editor shows the page as it is live now. Copy anything you want to keep first.",
      confirmLabel: "Load latest",
      destructive: true,
      onConfirm: () => controller.loadLatest(),
    });
  };

  const askSaveRef = useRef(askSave);
  askSaveRef.current = askSave;
  useDevShortcuts(SAVE_SHORTCUTS, isLoaded);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (!document.querySelector('[role="dialog"], [role="alertdialog"]')) askSaveRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const locked = publicationUncertain || controller.loadingLatest;
  const textLocked = locked && !saving;

  return (
    <EditorPanel className="overflow-visible" data-testid="about-pane" aria-labelledby={headingId} role="region">
      <header className="theme-portal-rule relative space-y-2 border-b px-4 py-3.5 sm:px-5">
        {onBackToList ? (
          <div className="lg:hidden">
            <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBackToList}>
              <Icon icon="lucide:arrow-left" size={14} />
              Back to list
            </Button>
          </div>
        ) : null}
        <h3 id={headingId} ref={titleRef} tabIndex={-1} className="theme-accent-heading min-w-0 break-words text-xl font-semibold leading-tight outline-none">
          <span className="sr-only">Editing </span>
          About page
        </h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
          <EditorStatusPill tone="success">Site page, live</EditorStatusPill>
          <a
            href="/about"
            target="_blank"
            rel="noreferrer"
            className="theme-focus-ring theme-accent-underline inline-flex min-h-11 items-center gap-1.5 rounded-control font-medium text-dose-accent-strong underline-offset-4 hover:underline sm:min-h-0"
          >
            View live
            <span className="sr-only">: /about, opens in a new tab</span>
            <Icon icon="lucide:arrow-up-right" size={14} />
          </a>
          <span aria-hidden className="theme-text-faint font-mono text-xs">/about</span>
        </div>
        {controller.lastWrite.at ? (
          <p className="theme-text-faint text-xs">
            <RelativeDay iso={controller.lastWrite.at} prefix="Last published" />
            {canApprove && controller.lastWrite.by ? ` by ${controller.lastWrite.by}` : null}
          </p>
        ) : null}
      </header>

      <div className="space-y-8 px-4 py-5 sm:px-5 [&_:is(input,button,textarea)]:scroll-mb-40 [&_:is(input,button,textarea)]:scroll-mt-28">
        {!isLoaded ? (
          controller.loadError ? (
            <div role="alert">
              <LoadErrorState what="the About page" message={controller.loadError} onRetry={controller.reloadSource} />
            </div>
          ) : (
            <Notice tone="loading" message="Loading the About page. Editing unlocks when it arrives." />
          )
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <EditorSegmentedControl
                label="View"
                value={view}
                onChange={(value) => setView(value as AboutView)}
                options={[
                  { value: "write", label: "Write", icon: "lucide:pencil-line" },
                  { value: "preview", label: "Preview", icon: "lucide:eye" },
                  { value: "both", label: "Both", icon: "lucide:columns-2" },
                ]}
              />
              <p className="theme-text-faint min-w-0 flex-1 basis-56 text-xs">
                {view === "write" ? "The preview is hidden. Switch to Preview or Both to see the page as readers will." : "The preview follows as you type, with live counts filled in."}
              </p>
            </div>

            <div className={cn(view === "both" && "grid gap-8 xl:grid-cols-2 xl:items-start")}>
              {view !== "preview" ? (
                <fieldset disabled={textLocked} className="min-w-0 space-y-8">
                  <AboutPaneSection
                    title="Page text"
                    note="One Markdown document. Text before the first heading is the Introduction; ## Sources and review starts the sources section, and ## Project history the history above the contributor cards."
                    aside={
                      <>
                        <ChangedMark changed={isMarkdownDirty} />
                        {isMarkdownDirty ? (
                          <Button type="button" variant="ghost" size="sm" onClick={resetMarkdown}>
                            <Icon icon="lucide:rotate-ccw" size={14} />
                            Reset text
                          </Button>
                        ) : null}
                      </>
                    }
                  >
                    <EditorField label="Markdown source" htmlFor="about-markdown-editor">
                      {(control) => (
                        <Textarea
                          {...control}
                          ref={textareaRef}
                          className="min-h-[240px] resize-none whitespace-pre-wrap font-mono leading-6"
                          value={draft.markdown}
                          onChange={handleTextareaChange}
                        />
                      )}
                    </EditorField>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={copyMarkdown}>
                        <Icon icon="lucide:copy" size={14} />
                        Copy Markdown
                      </Button>
                      <CopyResult notice={copyNotice} target="markdown" onDismiss={dismissCopyNotice} />
                    </div>
                    <LiveCounts values={placeholderValues} onInsert={insertToken} disabled={textLocked} />
                  </AboutPaneSection>

                  <AboutPaneSection
                    title="Subtitle"
                    note="Shown under the About heading and as the page's description in search results. Live counts work here too."
                    aside={
                      <>
                        <ChangedMark changed={isSubtitleDirty} />
                        {isSubtitleDirty ? (
                          <Button type="button" variant="ghost" size="sm" onClick={resetSubtitle}>
                            <Icon icon="lucide:rotate-ccw" size={14} />
                            Reset subtitle
                          </Button>
                        ) : null}
                      </>
                    }
                  >
                    <EditorField
                      label="Subtitle and search description"
                      htmlFor="about-subtitle-editor"
                      counter={
                        <span className={cn("tabular-nums", resolvedSubtitle.length > SEARCH_DESCRIPTION_GUIDE && "theme-warning-text")}>
                          {`${subtitleLength.toLocaleString()} characters, ${resolvedSubtitle.length.toLocaleString()} with counts filled in`}
                        </span>
                      }
                      description={`Search results show about ${SEARCH_DESCRIPTION_GUIDE} characters before cutting it short.`}
                    >
                      {(control) => (
                        <Textarea
                          {...control}
                          ref={subtitleTextareaRef}
                          className="min-h-[80px] resize-none whitespace-pre-wrap leading-6"
                          value={draft.subtitle}
                          onChange={handleSubtitleTextareaChange}
                        />
                      )}
                    </EditorField>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={copySubtitle}>
                        <Icon icon="lucide:copy" size={14} />
                        Copy subtitle
                      </Button>
                      <CopyResult notice={copyNotice} target="subtitle" onDismiss={dismissCopyNotice} />
                    </div>
                  </AboutPaneSection>
                </fieldset>
              ) : null}

              {view !== "write" ? (
                <div className={cn("min-w-0", view === "both" && "xl:sticky xl:top-24 xl:max-h-[calc(100dvh-9rem)] xl:overflow-y-auto")}>
                  <AboutPreviewSection
                    resolvedPreviewMarkdown={resolvedPreviewMarkdown}
                    resolvedSubtitle={resolvedSubtitle}
                    selectedFounders={selectedFounders}
                  />
                </div>
              ) : null}
            </div>

            <fieldset disabled={locked} className="theme-portal-rule min-w-0 border-t pt-6">
              <AboutFounderSelectionSection
                availableProfiles={availableProfiles}
                selectedFounders={selectedFounders}
                onToggleFounderKey={toggleFounderKey}
                onResetFounderKeys={resetFounderKeys}
                isFounderSelectionDirty={isFounderSelectionDirty}
                addedFounders={addedFounders}
                removedFounders={removedFounders}
                formatFounderList={formatFounderList}
                isLoadingProfiles={profilesLoading}
              />
            </fieldset>

            {canApprove ? (
              <fieldset disabled={locked} className="theme-portal-rule min-w-0 border-t pt-6">
                <AboutTranslationCreditsSection
                  availableProfiles={availableProfiles}
                  credits={draft.translationCredits}
                  isDirty={isTranslationCreditsDirty}
                  onAdd={addTranslationCredit}
                  onRemove={removeTranslationCredit}
                  onContributionChange={setTranslationCreditContribution}
                  onReset={resetTranslationCredits}
                />
              </fieldset>
            ) : null}

            <AboutPaneSection
              className="theme-portal-rule border-t pt-6"
              title="Changes"
              note={isDirty ? "Against what is live now. Removed lines start with −, added lines with +." : undefined}
            >
              {isDirty ? (
                <ChangesBody
                  markdownDiff={isMarkdownDirty ? stripDiffHeading(markdownDiff) : null}
                  subtitleDiff={subtitleHasChanges ? stripDiffHeading(subtitleDiff) : null}
                  founders={isFounderSelectionDirty ? { added: formatFounderList(addedFounders), removed: formatFounderList(removedFounders) } : null}
                  credits={isTranslationCreditsDirty}
                />
              ) : (
                <p className="theme-text-faint text-sm">No changes yet. Edit any part above and the difference shows here.</p>
              )}
            </AboutPaneSection>

            <AboutPaneSection
              className="theme-portal-rule border-t pt-6"
              title="More About wording, in Copy"
              note="These parts of the public About page are Copy blocks, not part of this document. Each opens in Copy."
            >
              <ul aria-label="About copy blocks" className={LINK_LIST_CLASS}>
                {ABOUT_COPY_BLOCKS.map((block) => (
                  <li key={block.key}>
                    <a
                      href={viewToPath({ type: "dev", tab: "copy-studio", slug: block.key })}
                      className="theme-dev-link-row group flex min-h-11 items-center gap-3 rounded-control px-2.5 py-2 text-sm"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="theme-text-primary block font-medium">{block.label}</span>
                        <span className="sr-only">, </span>
                        <span className="theme-text-faint block truncate font-mono text-xs">{block.key}</span>
                      </span>
                      <Icon icon="lucide:chevron-right" size={16} className="theme-dev-link-row-chevron shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            </AboutPaneSection>
          </>
        )}
      </div>

      <footer
        aria-label="Save"
        className="theme-portal-rule sticky bottom-0 z-10 space-y-2.5 rounded-b-[inherit] border-t bg-[var(--editor-panel-bg)]/95 px-4 py-3 backdrop-blur sm:px-5"
      >
        <AboutDockNotice notice={controller.notice} failure={controller.saveFailure} frozen={frozen} onDismiss={controller.dismissNotice} onLoadLatest={askLoadLatest} />
        {publicationUncertain ? (
          <p role="alert" className="theme-warning-text flex items-start gap-2 text-xs">
            <Icon icon="lucide:triangle-alert" size={13} className="mt-0.5 shrink-0" />
            <span>
              <strong className="font-semibold">Publication unconfirmed.</strong> The site did not confirm your last publication. Press {primaryLabel} again to retry the same one before you leave; newer edits to the text are kept, and the other parts hold still until it answers.
            </span>
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            type="button"
            variant="accent"
            size="sm"
            disabled={!canPress}
            aria-busy={saving || undefined}
            aria-keyshortcuts="Meta+S Control+S"
            onClick={askSave}
          >
            <Icon icon={canApprove ? "lucide:upload" : "lucide:send"} size={15} />
            {primaryLabel}
            <span aria-hidden className="[@media(pointer:coarse)]:hidden">
              <kbd className="theme-dev-kbd !text-current opacity-70">{saveKeyLabel}</kbd>
            </span>
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={!isDirty || saving || publicationUncertain} onClick={askDiscard}>
            Discard edits
          </Button>
          <p role="status" className={cn("flex min-w-0 items-center gap-2 text-xs", isDirty ? "theme-text-secondary" : "theme-text-faint")}>
            {saving ? (
              canApprove ? "Publishing" : "Submitting"
            ) : isDirty ? (
              <>
                <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 shrink-0 rounded-full" />
                {`${canApprove ? "Unpublished changes" : "Changes to propose"}: ${changes}`}
              </>
            ) : (
              "No changes yet"
            )}
          </p>
          <span className="min-w-0 sm:ml-auto">
            <SaveLine model="record" destination={canApprove ? "live" : "proposal"} copy={canApprove ? ABOUT_PUBLISH_SAVE_COPY : undefined} />
          </span>
        </div>
      </footer>
      {dialog}
    </EditorPanel>
  );
});

function LiveCounts({ values, onInsert, disabled }: { values: Record<string, string>; onInsert: (key: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className={cn("theme-focus-ring theme-text-muted hover:theme-text-primary inline-flex items-center gap-1.5 rounded-control text-sm", TOUCH_HALO)}
      >
        {`Live counts you can type (${PLACEHOLDER_TOKENS.length})`}
        <ExpandIndicator isExpanded={open} />
      </button>
      <div id={id} hidden={!open}>
        <p className="theme-text-faint mb-2 text-xs">Pick one to put it in the text where the caret is. The page fills in the current number.</p>
        <ul className={LINK_LIST_CLASS} aria-label="Live counts">
          {PLACEHOLDER_TOKENS.map((token) => (
            <li key={token.key}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onInsert(token.key)}
                className="theme-dev-link-row flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-0.5 rounded-control px-2.5 py-1.5 text-left text-xs disabled:opacity-60"
              >
                <span className="theme-text-secondary min-w-0 break-all font-mono">{`{{${token.key}}}`}</span>
                <span className="sr-only">, </span>
                <span className="theme-text-muted min-w-0 flex-1">{token.label}</span>
                <span className="sr-only">, </span>
                <span className="theme-text-faint tabular-nums">{values[token.key] ? `now ${values[token.key]}` : "filled in on the page"}</span>
                <span className="sr-only">. Insert</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CopyResult({ notice, target, onDismiss }: { notice: { target: string; ok: boolean } | null; target: "markdown" | "subtitle"; onDismiss: () => void }) {
  if (!notice || notice.target !== target) return null;
  return (
    <Notice placement="inline" tone={notice.ok ? "success" : "danger"} dismiss={onDismiss}>
      {notice.ok ? "Copied to the clipboard" : "Copy failed. Check the browser's clipboard permission."}
    </Notice>
  );
}

function ChangesBody({
  markdownDiff,
  subtitleDiff,
  founders,
  credits,
}: {
  markdownDiff: string | null;
  subtitleDiff: string | null;
  founders: { added: string; removed: string } | null;
  credits: boolean;
}) {
  const part = (title: string, content: ReactNode) => (
    <div className="min-w-0 space-y-1.5">
      <p className="type-meta-label theme-text-muted">{title}</p>
      {content}
    </div>
  );
  return (
    <div className="max-h-[60vh] space-y-4 overflow-y-auto">
      {markdownDiff ? part("Page text", <DiffPreview diffText={markdownDiff} maxHeight={256} />) : null}
      {subtitleDiff ? part("Subtitle and search description", <DiffPreview diffText={subtitleDiff} maxHeight={160} />) : null}
      {founders
        ? part(
            "Founders",
            <p className="theme-text-secondary text-sm">
              {[founders.added ? `Added ${founders.added}` : null, founders.removed ? `Removed ${founders.removed}` : null].filter(Boolean).join(". ")}.
            </p>,
          )
        : null}
      {credits ? part("Translation credits", <p className="theme-text-secondary text-sm">Changed. The credits part above shows them as they will be.</p>) : null}
    </div>
  );
}

function AboutDockNotice({
  notice,
  failure,
  frozen,
  onDismiss,
  onLoadLatest,
}: {
  notice: NoticeMessage | null;
  failure: "conflict" | "frozen" | "other" | null;
  frozen: boolean;
  onDismiss: () => void;
  onLoadLatest: () => void;
}) {
  if (!notice) return null;
  let shown: NoticeMessage = notice;
  if (failure === "conflict") {
    shown = {
      tone: "danger",
      title: "Someone published the About page after you opened it.",
      message: "Your edits are still here. Copy anything you want to keep, then load the latest version and apply them again.",
      actions: (
        <Button type="button" variant="outline" size="sm" onClick={onLoadLatest}>
          Load the latest version
        </Button>
      ),
    };
  } else if (failure && (failure === "frozen" || frozen)) {
    shown = { tone: "danger", title: FREEZE_REFUSAL, message: "Your edits are still here. Publish again once writes resume." };
  }
  return <Notice {...shown} dismiss={onDismiss} className="text-sm" />;
}
