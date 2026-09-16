import { memo, useEffect, useMemo, useRef, type ChangeEvent } from "react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import { DiffPreview } from "@/features/dev/components/DiffPreview";
import {
  EditorActionStatus,
  EditorNotice,
  EditorSection,
  EditorStatusPill,
  EditorToolbar,
  useConfirm,
} from "@/features/dev/components";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import { normalizeWhitespace } from "@/lib/text";
import { viewToPath } from "@/utils/routing";
import {
  ABOUT_COPY_BLOCKS,
  resizeTextareaToContent,
  resolveAboutPlaceholders,
  stripDiffHeading,
  textareaViewportCap,
} from "./aboutEditorUtils";
import { AboutCopyEditors } from "./AboutCopyEditors";
import { AboutPreviewSection } from "./AboutPreviewSection";
import { AboutFounderSelectionSection } from "./AboutFounderSelectionSection";
import { useAboutEditorController } from "./useAboutEditorController";

const AUTO_RESIZE_MIN_HEIGHT = 240;
const SUBTITLE_MIN_HEIGHT = 80;

interface AboutEditorTabProps {
  availableProfiles: NormalizedUserProfile[];
  profilesLoading?: boolean;
  /** Admin: Save writes About; without it the same draft is submitted as a proposal. */
  canApprove: boolean;
  /** Whether the About draft holds unsaved edits; the Writing rail guards leaving it. */
  onDirtyChange?: (dirty: boolean) => void;
  onCanDiscardChange?: (canDiscard: boolean) => void;
}

export const AboutEditorTab = memo(function AboutEditorTab({
  availableProfiles,
  profilesLoading,
  canApprove,
  onDirtyChange,
  onCanDiscardChange,
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
    notice,
    copyNotice,
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
    copyMarkdown,
    copySubtitle,
    save,
  } = controller;
  const aboutMarkdown = draft.markdown;
  const aboutSubtitle = draft.subtitle;
  const aboutFounderKeys = draft.founderKeys;
  const originalFounderKeys = original.founderKeys;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => { onCanDiscardChange?.(!publicationUncertain && saveState !== "saving"); }, [onCanDiscardChange, publicationUncertain, saveState]);
  useEffect(() => () => onCanDiscardChange?.(true), [onCanDiscardChange]);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const subtitleTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const normalizedDraft = normalizeWhitespace(aboutMarkdown);
  const normalizedOriginal = normalizeWhitespace(original.markdown);
  const isMarkdownDirty = normalizedDraft !== normalizedOriginal;
  const normalizedSubtitleDraft = normalizeWhitespace(aboutSubtitle);
  const normalizedSubtitleOriginal = normalizeWhitespace(original.subtitle);
  const isSubtitleDirty = normalizedSubtitleDraft !== normalizedSubtitleOriginal;
  const subtitleLength = normalizedSubtitleDraft.length;

  const currentFounderSet = useMemo(() => new Set(aboutFounderKeys), [aboutFounderKeys]);
  const originalFounderSet = useMemo(() => new Set(originalFounderKeys), [originalFounderKeys]);

  const addedFounders = useMemo(
    () => aboutFounderKeys.filter((key) => !originalFounderSet.has(key)),
    [aboutFounderKeys, originalFounderSet],
  );

  const removedFounders = useMemo(
    () => originalFounderKeys.filter((key) => !currentFounderSet.has(key)),
    [currentFounderSet, originalFounderKeys],
  );

  const isFounderSelectionDirty = addedFounders.length > 0 || removedFounders.length > 0;
  const dirtySectionCount = Number(isMarkdownDirty) + Number(isSubtitleDirty) + Number(isFounderSelectionDirty);

  const profileLabelByKey = useMemo(() => {
    const lookup = new Map<string, string>();
    availableProfiles.forEach((profile) => {
      lookup.set(profile.key, profile.displayName);
    });
    return lookup;
  }, [availableProfiles]);

  const formatFounderList = useMemo(() => {
    return (keys: string[]) => keys.map((key) => profileLabelByKey.get(key) ?? key).join(", ");
  }, [profileLabelByKey]);

  const initialsByKey = useMemo(() => {
    const lookup = new Map<string, string>();
    availableProfiles.forEach((profile) => {
      const parts = profile.displayName
        .split(/\s+/)
        .filter((segment) => segment.length > 0)
        .slice(0, 2);
      if (parts.length === 0) {
        lookup.set(profile.key, profile.key.slice(0, 2).toUpperCase());
        return;
      }
      const initials = parts.map((segment) => segment.charAt(0).toUpperCase()).join("");
      lookup.set(profile.key, initials || profile.key.slice(0, 2).toUpperCase());
    });
    return lookup;
  }, [availableProfiles]);

  const resolvedPreviewMarkdown = useMemo(() => {
    return resolveAboutPlaceholders(aboutMarkdown, placeholderValues);
  }, [aboutMarkdown, placeholderValues]);

  const selectedFounders = useMemo(() => {
    return availableProfiles
      .filter((profile) => currentFounderSet.has(profile.key))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [availableProfiles, currentFounderSet]);

  useEffect(() => {
    resizeTextareaToContent(textareaRef.current, AUTO_RESIZE_MIN_HEIGHT, textareaViewportCap());
  }, [aboutMarkdown]);

  useEffect(() => {
    resizeTextareaToContent(subtitleTextareaRef.current, SUBTITLE_MIN_HEIGHT, textareaViewportCap());
  }, [aboutSubtitle]);

  const handleTextareaChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const element = event.currentTarget;
    resizeTextareaToContent(element, AUTO_RESIZE_MIN_HEIGHT, textareaViewportCap());
    replaceMarkdown(element.value);
  };

  const handleSubtitleTextareaChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const element = event.currentTarget;
    resizeTextareaToContent(element, SUBTITLE_MIN_HEIGHT, textareaViewportCap());
    replaceSubtitle(element.value);
  };

  if (!isLoaded) {
    return (
      controller.loadError ? <div><p role="alert">{controller.loadError}</p><Button onClick={controller.reloadSource}>Retry loading</Button></div> : <StateCard loading compact title="Loading About" />
    );
  }

  return (
    <div className="space-y-8">
      {notice ? <EditorNotice notice={notice} /> : null}

      <fieldset disabled={publicationUncertain && saveState !== "saving"}>
      <AboutCopyEditors
        aboutMarkdown={aboutMarkdown}
        onMarkdownChange={handleTextareaChange}
        onResetMarkdown={resetMarkdown}
        onCopyMarkdown={copyMarkdown}
        isMarkdownDirty={isMarkdownDirty}
        textareaRef={textareaRef}
        aboutSubtitle={aboutSubtitle}
        onSubtitleChange={handleSubtitleTextareaChange}
        onResetSubtitle={resetSubtitle}
        onCopySubtitle={copySubtitle}
        isSubtitleDirty={isSubtitleDirty}
        subtitleLength={subtitleLength}
        subtitleTextareaRef={subtitleTextareaRef}
        copyNotice={copyNotice}
      />
      </fieldset>

      <AboutPreviewSection
        resolvedPreviewMarkdown={resolvedPreviewMarkdown}
        selectedFounders={selectedFounders}
      />

      <fieldset disabled={publicationUncertain}>
      <AboutFounderSelectionSection
        availableProfiles={availableProfiles}
        selectedFounders={selectedFounders}
        initialsByKey={initialsByKey}
        onToggleFounderKey={toggleFounderKey}
        onResetFounderKeys={resetFounderKeys}
        isFounderSelectionDirty={isFounderSelectionDirty}
        addedFounders={addedFounders}
        removedFounders={removedFounders}
        formatFounderList={formatFounderList}
        isLoadingProfiles={profilesLoading}
      />
      </fieldset>

      <EditorSection
        title="Related copy"
        icon="lucide:type"
        description="Prose on the public About page that lives in Copy Studio rather than in this document."
      >
        <ul className="flex flex-wrap gap-2" aria-label="About copy blocks">
          {ABOUT_COPY_BLOCKS.map((block) => (
            <li key={block.key}>
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <a href={viewToPath({ type: "dev", tab: "copy-studio", slug: block.key })}>
                  {block.label}
                  <code className="theme-text-faint font-mono text-[0.7rem]">{block.key}</code>
                </a>
              </Button>
            </li>
          ))}
        </ul>
      </EditorSection>

      <EditorSection
        title="Pending changes"
        icon="lucide:file-diff"
        actions={(
          <EditorStatusPill tone={dirtySectionCount > 0 ? "warning" : "success"}>
            {dirtySectionCount > 0
              ? `${dirtySectionCount} section${dirtySectionCount === 1 ? "" : "s"} changed`
              : "No changes"}
          </EditorStatusPill>
        )}
      >
        {dirtySectionCount === 0 ? (
          <p className="theme-text-faint text-sm">No pending changes.</p>
        ) : (
          <div className="space-y-4">
            {isMarkdownDirty && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold theme-text-secondary">About copy</h3>
                <DiffPreview diffText={stripDiffHeading(markdownDiff)} maxHeight={256} />
              </div>
            )}
            {subtitleHasChanges && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold theme-text-secondary">Meta description</h3>
                <DiffPreview diffText={stripDiffHeading(subtitleDiff)} maxHeight={160} />
              </div>
            )}
            {isFounderSelectionDirty && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold theme-text-secondary">Founders list</h3>
                <p className="theme-text-faint text-sm">
                  {`${addedFounders.length} added, ${removedFounders.length} removed. Details in the Founders list section above.`}
                </p>
              </div>
            )}
          </div>
        )}

        <EditorToolbar variant="split" className="mt-4">
          <Button
            type="button"
            variant="accent"
            size="sm"
            disabled={!isDirty || saveState === "saving"}
            onClick={() => canApprove ? confirm({ title: "Publish About copy?", description: "Publish the displayed About copy, subtitle, and founder selection diff to dose.wiki /about and its search metadata.", confirmLabel: "Publish About copy", onConfirm: () => { void save(); } }) : void save()}
          >
            <Icon icon={canApprove ? "lucide:save" : "lucide:send"} size={15} />
            {canApprove ? "Save About page" : "Submit for review"}
          </Button>
          {saveState === "idle" ? (
            <EditorStatusPill tone={isDirty ? "warning" : "neutral"}>
              {isDirty ? (canApprove ? "Unsaved changes" : "Changes to propose") : "No changes"}
            </EditorStatusPill>
          ) : (
            <EditorActionStatus status={saveState} />
          )}
        </EditorToolbar>
      </EditorSection>
      {publicationUncertain && <p role="alert">A publication is awaiting confirmation. Retry the same publication before leaving; newer local edits are preserved.</p>}
      {dialog}
    </div>
  );
});
