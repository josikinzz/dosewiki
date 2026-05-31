import { memo, useEffect, useMemo, useRef, type ChangeEvent } from "react";

import logoDataUri from "../../../../assets/dosewiki-logo.svg?inline";

import { DiffPreview } from "@/features/dev/components/DiffPreview";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import { normalizeWhitespace } from "@/lib/text";
import { resolveAboutPlaceholders, resizeTextareaToContent } from "./aboutEditorUtils";
import { SectionCard } from "@/components/common/SectionCard";
import { AboutCopyEditors } from "./AboutCopyEditors";
import { AboutPreviewSection } from "./AboutPreviewSection";
import { AboutFounderSelectionSection } from "./AboutFounderSelectionSection";

const AUTO_RESIZE_MIN_HEIGHT = 240;
const SUBTITLE_MIN_HEIGHT = 160;

interface AboutEditorTabProps {
  aboutMarkdown: string;
  originalAboutMarkdown: string;
  onMarkdownChange: (value: string) => void;
  onResetMarkdown: () => void;
  aboutSubtitle: string;
  originalAboutSubtitle: string;
  onSubtitleChange: (value: string) => void;
  onResetSubtitle: () => void;
  aboutFounderKeys: string[];
  originalFounderKeys: string[];
  onToggleFounderKey: (key: string) => void;
  onResetFounderKeys: () => void;
  availableProfiles: NormalizedUserProfile[];
  markdownDiff: string;
  subtitleDiff: string;
  subtitleHasChanges: boolean;
  onCopyMarkdown: () => void;
  onCopySubtitle: () => void;
  commitPanel?: React.ReactNode;
  placeholderValues: Record<string, string>;
}

export const AboutEditorTab = memo(function AboutEditorTab({
  aboutMarkdown,
  originalAboutMarkdown,
  onMarkdownChange,
  onResetMarkdown,
  aboutSubtitle,
  originalAboutSubtitle,
  onSubtitleChange,
  onResetSubtitle,
  aboutFounderKeys,
  originalFounderKeys,
  onToggleFounderKey,
  onResetFounderKeys,
  availableProfiles,
  markdownDiff,
  subtitleDiff,
  subtitleHasChanges,
  onCopyMarkdown,
  onCopySubtitle,
  commitPanel,
  placeholderValues,
}: AboutEditorTabProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const subtitleTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const normalizedDraft = normalizeWhitespace(aboutMarkdown);
  const normalizedOriginal = normalizeWhitespace(originalAboutMarkdown);
  const isMarkdownDirty = normalizedDraft !== normalizedOriginal;
  const normalizedSubtitleDraft = normalizeWhitespace(aboutSubtitle);
  const normalizedSubtitleOriginal = normalizeWhitespace(originalAboutSubtitle);
  const isSubtitleDirty = normalizedSubtitleDraft !== normalizedSubtitleOriginal;
  const subtitleLength = normalizedSubtitleDraft.length;
  const isSafari =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("is-safari");
  const logoSrc = isSafari ? "/dosewiki-logo.png" : logoDataUri;

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

  const sortedProfiles = useMemo(
    () =>
      [...availableProfiles].sort((a, b) => {
        if (currentFounderSet.has(a.key) && !currentFounderSet.has(b.key)) {
          return -1;
        }
        if (!currentFounderSet.has(a.key) && currentFounderSet.has(b.key)) {
          return 1;
        }
        return a.displayName.localeCompare(b.displayName);
      }),
    [availableProfiles, currentFounderSet],
  );

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

  const resolvedSubtitle = useMemo(() => {
    return resolveAboutPlaceholders(aboutSubtitle, placeholderValues);
  }, [aboutSubtitle, placeholderValues]);

  const selectedFounders = useMemo(() => {
    return availableProfiles
      .filter((profile) => currentFounderSet.has(profile.key))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [availableProfiles, currentFounderSet]);

  useEffect(() => {
    resizeTextareaToContent(textareaRef.current, AUTO_RESIZE_MIN_HEIGHT);
  }, [aboutMarkdown]);

  useEffect(() => {
    resizeTextareaToContent(subtitleTextareaRef.current, SUBTITLE_MIN_HEIGHT);
  }, [aboutSubtitle]);

  const handleTextareaChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const element = event.currentTarget;
    resizeTextareaToContent(element, AUTO_RESIZE_MIN_HEIGHT);
    onMarkdownChange(element.value);
  };

  const handleSubtitleTextareaChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const element = event.currentTarget;
    resizeTextareaToContent(element, SUBTITLE_MIN_HEIGHT);
    onSubtitleChange(element.value);
  };

  return (
    <div className="mt-6 space-y-6 md:mt-8">
      <AboutCopyEditors
        aboutMarkdown={aboutMarkdown}
        onMarkdownChange={handleTextareaChange}
        onResetMarkdown={onResetMarkdown}
        onCopyMarkdown={onCopyMarkdown}
        isMarkdownDirty={isMarkdownDirty}
        textareaRef={textareaRef}
        aboutSubtitle={aboutSubtitle}
        onSubtitleChange={handleSubtitleTextareaChange}
        onResetSubtitle={onResetSubtitle}
        onCopySubtitle={onCopySubtitle}
        isSubtitleDirty={isSubtitleDirty}
        subtitleLength={subtitleLength}
        subtitleTextareaRef={subtitleTextareaRef}
      />

      <AboutPreviewSection
        logoSrc={logoSrc}
        resolvedSubtitle={resolvedSubtitle}
        resolvedPreviewMarkdown={resolvedPreviewMarkdown}
        selectedFounders={selectedFounders}
      />

      <AboutFounderSelectionSection
        sortedProfiles={sortedProfiles}
        currentFounderSet={currentFounderSet}
        initialsByKey={initialsByKey}
        onToggleFounderKey={onToggleFounderKey}
        onResetFounderKeys={onResetFounderKeys}
        isFounderSelectionDirty={isFounderSelectionDirty}
        addedFounders={addedFounders}
        removedFounders={removedFounders}
        formatFounderList={formatFounderList}
      />

      <SectionCard className="space-y-4">
        <h2 className="text-lg font-semibold text-fuchsia-200">Markdown diff</h2>
        <DiffPreview diffText={markdownDiff} className="max-h-64" />
        {subtitleHasChanges && (
          <div className="space-y-2 border-t border-white/10 pt-4">
            <h3 className="text-sm font-semibold text-white/75">Subtitle diff</h3>
            <DiffPreview diffText={subtitleDiff} className="max-h-40" />
          </div>
        )}
      </SectionCard>

      {commitPanel}
    </div>
  );
});
