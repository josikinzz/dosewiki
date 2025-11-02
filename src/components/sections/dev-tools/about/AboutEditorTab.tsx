import { memo, useEffect, useMemo, useRef, type ChangeEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { Copy, FileText, Info, RefreshCw, UserRound } from "lucide-react";

import logoDataUri from "../../../../assets/dosewiki-logo.svg?inline";

import { SectionCard } from "../../../common/SectionCard";
import { DiffPreview } from "../../../common/DiffPreview";
import type { NormalizedUserProfile } from "../../../../data/userProfiles";

const PLACEHOLDER_TOKENS: Array<{ key: string; label: string }> = [
  { key: "compoundCount", label: "published substances" },
  { key: "effectCount", label: "tracked subjective effects" },
  { key: "psychoactiveClassCount", label: "psychoactive classes" },
  { key: "categoryCount", label: "alias of psychoactive classes" },
  { key: "chemicalClassCount", label: "chemical classes" },
  { key: "mechanismClassCount", label: "mechanism-of-action classes" },
  { key: "mechanismOfActionClassCount", label: "alias of mechanism-of-action classes" },
];

const AUTO_RESIZE_MIN_HEIGHT = 240;
const PLACEHOLDER_PATTERN = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

interface AboutEditorTabProps {
  baseInputClass: string;
  pillButtonBaseClass: string;
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

const markdownComponents = {
  p: ({ node, ...props }: { node?: unknown }) => (
    <p className="mt-3 text-[0.95rem] leading-7 text-white/85 first:mt-0" {...props} />
  ),
  strong: ({ node, ...props }: { node?: unknown }) => <strong className="text-fuchsia-200" {...props} />,
  a: ({ node, ...props }: { node?: unknown }) => (
    <a
      className="text-fuchsia-200 transition hover:text-fuchsia-100"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  ul: ({ node, ...props }: { node?: unknown }) => (
    <ul className="mt-4 list-disc space-y-2 pl-5 text-[0.95rem] leading-7 text-white/85" {...props} />
  ),
  ol: ({ node, ...props }: { node?: unknown }) => (
    <ol className="mt-4 list-decimal space-y-2 pl-5 text-[0.95rem] leading-7 text-white/85" {...props} />
  ),
  li: ({ node, ...props }: { node?: unknown }) => (
    <li className="marker:text-fuchsia-300" {...props} />
  ),
};

const normalizeWhitespace = (value: string) => value.replace(/\r\n/g, "\n");
const DEFAULT_SUBTITLE = "Structured psychoactive data for quick reference and research workflows.";

const toInitials = (value: string) => {
  const parts = value
    .split(/\s+/)
    .filter((segment) => segment.length > 0)
    .slice(0, 2);

  if (parts.length === 0) {
    return value.slice(0, 2).toUpperCase();
  }

  return parts
    .map((segment) => segment.charAt(0).toUpperCase())
    .join("");
};

export const AboutEditorTab = memo(function AboutEditorTab({
  baseInputClass,
  pillButtonBaseClass,
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
    if (!aboutMarkdown) {
      return "";
    }
    return aboutMarkdown.replace(PLACEHOLDER_PATTERN, (match, key: string) => {
      const normalizedKey = key.trim();
      return placeholderValues[normalizedKey] ?? match;
    });
  }, [aboutMarkdown, placeholderValues]);

  const resolvedSubtitle = useMemo(() => {
    if (!aboutSubtitle) {
      return "";
    }
    return aboutSubtitle.replace(PLACEHOLDER_PATTERN, (match, key: string) => {
      const normalizedKey = key.trim();
      return placeholderValues[normalizedKey] ?? match;
    });
  }, [aboutSubtitle, placeholderValues]);

  const selectedFounders = useMemo(() => {
    return availableProfiles
      .filter((profile) => currentFounderSet.has(profile.key))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [availableProfiles, currentFounderSet]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) {
      return;
    }
    element.style.height = "auto";
    const nextHeight = Math.max(element.scrollHeight, AUTO_RESIZE_MIN_HEIGHT);
    element.style.height = `${nextHeight}px`;
  }, [aboutMarkdown]);

  useEffect(() => {
    const element = subtitleTextareaRef.current;
    if (!element) {
      return;
    }
    element.style.height = "auto";
    const nextHeight = Math.max(element.scrollHeight, 160);
    element.style.height = `${nextHeight}px`;
  }, [aboutSubtitle]);

  const handleTextareaChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const element = event.currentTarget;
    element.style.height = "auto";
    const nextHeight = Math.max(element.scrollHeight, AUTO_RESIZE_MIN_HEIGHT);
    element.style.height = `${nextHeight}px`;
    onMarkdownChange(element.value);
  };

  const handleSubtitleTextareaChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const element = event.currentTarget;
    element.style.height = "auto";
    const nextHeight = Math.max(element.scrollHeight, 160);
    element.style.height = `${nextHeight}px`;
    onSubtitleChange(element.value);
  };

  return (
    <div className="mt-6 space-y-6 md:mt-8">
      <SectionCard className="space-y-6">
        <div className="flex flex-col gap-2">
          <h2 className="flex items-center gap-3 text-xl font-semibold text-fuchsia-200">
            <FileText className="h-5 w-5 text-fuchsia-300" aria-hidden="true" focusable="false" />
            About copy
          </h2>
          <p className="text-sm text-white/65">
            Edit the Markdown that powers the public About page. Formatting updates render in the preview card below.
            Use the tokens listed underneath to reference live dataset counts.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/60">
            {PLACEHOLDER_TOKENS.map((token) => (
              <span
                key={token.key}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1"
              >
                <code className="font-mono text-[0.7rem] text-white/80">{`{{${token.key}}}`}</code>
                <span className="text-white/55">{token.label}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45" htmlFor="about-markdown-editor">
            Markdown source
          </label>
          <textarea
            id="about-markdown-editor"
            ref={textareaRef}
            className={`${baseInputClass} min-h-[240px] resize-none whitespace-pre-wrap font-mono text-[16px] leading-6`}
            value={aboutMarkdown}
            onChange={handleTextareaChange}
          />
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              className={`${pillButtonBaseClass} px-3 py-1.5`}
              onClick={onCopyMarkdown}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy markdown
            </button>
            <button
              type="button"
              className={`${pillButtonBaseClass} px-3 py-1.5 ${isMarkdownDirty ? "" : "opacity-60"}`}
              onClick={onResetMarkdown}
              disabled={!isMarkdownDirty}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset to source
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-fuchsia-200">About subtitle</h2>
            <p className="text-sm text-white/65">
              Update the sentence displayed beneath the About header. Supports the same placeholder tokens listed above.
            </p>
          </div>
          <div className="text-xs text-white/55">
            <span>{subtitleLength.toLocaleString()} characters</span>
          </div>
        </div>
        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45" htmlFor="about-subtitle-editor">
            Subtitle source
          </label>
          <textarea
            id="about-subtitle-editor"
            ref={subtitleTextareaRef}
            className={`${baseInputClass} min-h-[160px] resize-none whitespace-pre-wrap font-mono text-[16px] leading-6`}
            value={aboutSubtitle}
            onChange={handleSubtitleTextareaChange}
          />
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              className={`${pillButtonBaseClass} px-3 py-1.5`}
              onClick={onCopySubtitle}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy subtitle
            </button>
            <button
              type="button"
              className={`${pillButtonBaseClass} px-3 py-1.5 ${isSubtitleDirty ? "" : "opacity-60"}`}
              onClick={onResetSubtitle}
              disabled={!isSubtitleDirty}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset subtitle
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard className="space-y-6">
        <h2 className="text-lg font-semibold text-fuchsia-200">Live preview</h2>
        <div className="space-y-8 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col items-center text-center">
            <img
              src={logoDataUri}
              alt="dose.wiki logo"
              className="logo h-20 w-20 animate-[spin_30s_linear_infinite] md:h-24 md:w-24"
              draggable={false}
            />
            <div className="mt-6 flex flex-col gap-3 text-center">
              <div className="flex items-center justify-center gap-3 text-2xl font-semibold tracking-tight text-fuchsia-300 md:text-3xl">
                <Info className="h-7 w-7" aria-hidden="true" focusable="false" />
                <span>About dose.wiki</span>
              </div>
              <p className="text-base text-white/70 md:text-lg">
                {resolvedSubtitle.length > 0 ? resolvedSubtitle : DEFAULT_SUBTITLE}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#120d27]/40 p-6">
            <ReactMarkdown
              className="prose prose-invert max-w-none"
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={markdownComponents}
            >
              {resolvedPreviewMarkdown}
            </ReactMarkdown>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#120d27]/40 p-6">
            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-fuchsia-200">Founders</h3>
            </div>
            {selectedFounders.length > 0 ? (
              <ul className="mt-6 grid gap-4 md:grid-cols-2">
                {selectedFounders.map((profile) => {
                  const initials = toInitials(profile.displayName || profile.key);
                  return (
                    <li key={profile.key} className="group">
                      <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm shadow-black/30 transition group-hover:border-fuchsia-400/60 group-hover:bg-fuchsia-500/10">
                        <div className="relative h-14 w-14 overflow-hidden rounded-full border border-white/10 bg-white/10 text-center text-base font-semibold text-white/80 shadow-inner shadow-black/20">
                          {profile.avatarUrl ? (
                            <img
                              src={profile.avatarUrl}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-lg">{initials}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white/90 group-hover:text-white">
                            {profile.displayName}
                          </p>
                          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.3em] text-white/45 group-hover:text-white/70">
                            @{profile.key.toLowerCase()}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/65">
                Founder profiles have not been published yet. Pin contributors from the Dev Tools About tab to surface them here.
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard className="space-y-5">
        <div className="flex items-center gap-3">
          <UserRound className="h-5 w-5 text-fuchsia-300" aria-hidden="true" focusable="false" />
          <div>
            <h2 className="text-lg font-semibold text-fuchsia-200">Founders list</h2>
            <p className="text-sm text-white/65">
              Toggle which contributor bios display under the About section. Selections update instantly on the public page once committed.
            </p>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {sortedProfiles.map((profile) => {
            const isSelected = currentFounderSet.has(profile.key);
            const handleToggle = () => onToggleFounderKey(profile.key);
            const initials = initialsByKey.get(profile.key) ?? profile.key.slice(0, 2).toUpperCase();

            return (
              <label
                key={profile.key}
                className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition ${
                  isSelected
                    ? "border-fuchsia-400/60 bg-fuchsia-500/10"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={isSelected}
                  onChange={handleToggle}
                />
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/10 text-sm font-semibold text-white/80">
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white/90">{profile.displayName}</p>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/45">@{profile.key.toLowerCase()}</p>
                </div>
              </label>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            className={`${pillButtonBaseClass} px-3 py-1.5 ${isFounderSelectionDirty ? "" : "opacity-60"}`}
            onClick={onResetFounderKeys}
            disabled={!isFounderSelectionDirty}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reset selections
          </button>
        </div>
        {(addedFounders.length > 0 || removedFounders.length > 0) && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/70">
            {addedFounders.length > 0 && (
              <p>
                <span className="font-semibold text-emerald-300">Added:</span> {formatFounderList(addedFounders)}
              </p>
            )}
            {removedFounders.length > 0 && (
              <p className="mt-2">
                <span className="font-semibold text-rose-300">Removed:</span> {formatFounderList(removedFounders)}
              </p>
            )}
          </div>
        )}
      </SectionCard>

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
