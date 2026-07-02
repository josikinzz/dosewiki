import { type ChangeEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/common/Icon";
import {
  ActionNotice,
  EditorField,
  EditorSection,
  EditorStatusPill,
  EditorToolbar,
  TagToken,
} from "@/features/dev/components";
import type { AboutCopyNotice } from "./aboutEditorUtils";

export const PLACEHOLDER_TOKENS: Array<{ key: string; label: string }> = [
  { key: "compoundCount", label: "published substances" },
  { key: "effectCount", label: "tracked subjective effects" },
  { key: "psychoactiveClassCount", label: "psychoactive classes" },
  { key: "categoryCount", label: "alias of psychoactive classes" },
  { key: "chemicalClassCount", label: "chemical classes" },
  { key: "mechanismClassCount", label: "mechanism-of-action classes" },
  { key: "mechanismOfActionClassCount", label: "alias of mechanism-of-action classes" },
];

type AboutCopyEditorsProps = {
  aboutMarkdown: string;
  onMarkdownChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onResetMarkdown: () => void;
  onCopyMarkdown: () => void;
  isMarkdownDirty: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  aboutSubtitle: string;
  onSubtitleChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onResetSubtitle: () => void;
  onCopySubtitle: () => void;
  isSubtitleDirty: boolean;
  subtitleLength: number;
  subtitleTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  copyNotice?: AboutCopyNotice | null;
};

function CopyResultNotice({
  copyNotice,
  target,
}: {
  copyNotice: AboutCopyNotice | null | undefined;
  target: AboutCopyNotice["target"];
}) {
  if (!copyNotice || copyNotice.target !== target) {
    return null;
  }

  return (
    <ActionNotice tone={copyNotice.ok ? "success" : "danger"}>
      {copyNotice.ok ? "Copied to clipboard" : "Copy failed — check clipboard permissions"}
    </ActionNotice>
  );
}

export function AboutCopyEditors({
  aboutMarkdown,
  onMarkdownChange,
  onResetMarkdown,
  onCopyMarkdown,
  isMarkdownDirty,
  textareaRef,
  aboutSubtitle,
  onSubtitleChange,
  onResetSubtitle,
  onCopySubtitle,
  isSubtitleDirty,
  subtitleLength,
  subtitleTextareaRef,
  copyNotice,
}: AboutCopyEditorsProps) {
  return (
    <>
      <EditorSection
        icon="lucide:file-text"
        title="Page copy"
        description="Edit the Markdown behind the public About page's Mission tab. Formatting updates render in the live preview below. Use the tokens listed underneath to reference live dataset counts."
        actions={(
          <EditorStatusPill tone={isMarkdownDirty ? "warning" : "success"}>
            {isMarkdownDirty ? "Changed" : "Clean"}
          </EditorStatusPill>
        )}
      >
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2 text-[11px] theme-text-muted">
            {PLACEHOLDER_TOKENS.map((token) => (
              <TagToken
                key={token.key}
                variant="readonly"
                label={(
                  <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 whitespace-normal">
                    <code className="font-mono text-[0.7rem] theme-text-secondary">{`{{${token.key}}}`}</code>
                    <span className="theme-text-faint">{token.label}</span>
                  </span>
                )}
              />
            ))}
          </div>
          <EditorField label="Markdown source" htmlFor="about-markdown-editor">
            <Textarea
              id="about-markdown-editor"
              ref={textareaRef}
              className="min-h-[240px] resize-none whitespace-pre-wrap font-mono"
              value={aboutMarkdown}
              onChange={onMarkdownChange}
            />
          </EditorField>
          <EditorToolbar label="About markdown actions" variant="compact" className="text-xs">
            <Button type="button" variant="secondary" size="sm" onClick={onCopyMarkdown}>
              <Icon icon="lucide:copy" className="h-3.5 w-3.5" size={14} />
              Copy markdown
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onResetMarkdown}
              disabled={!isMarkdownDirty}
            >
              <Icon icon="lucide:refresh-cw" className="h-3.5 w-3.5" size={14} />
              Reset to source
            </Button>
            <CopyResultNotice copyNotice={copyNotice} target="markdown" />
          </EditorToolbar>
        </div>
      </EditorSection>

      <EditorSection
        icon="lucide:type"
        title="Meta description"
        description="Used as the About page's search and meta description — it is not displayed on the page itself. Supports the same placeholder tokens listed above."
        actions={(
          <>
            <EditorStatusPill tone={isSubtitleDirty ? "warning" : "success"}>
              {isSubtitleDirty ? "Changed" : "Clean"}
            </EditorStatusPill>
            <EditorStatusPill tone="neutral">{`${subtitleLength.toLocaleString()} characters`}</EditorStatusPill>
          </>
        )}
      >
        <div className="space-y-6">
          <EditorField label="Meta description source" htmlFor="about-subtitle-editor">
            <Textarea
              id="about-subtitle-editor"
              ref={subtitleTextareaRef}
              className="min-h-[80px] resize-none whitespace-pre-wrap font-mono"
              value={aboutSubtitle}
              onChange={onSubtitleChange}
            />
          </EditorField>
          <EditorToolbar label="Meta description actions" variant="compact" className="text-xs">
            <Button type="button" variant="secondary" size="sm" onClick={onCopySubtitle}>
              <Icon icon="lucide:copy" className="h-3.5 w-3.5" size={14} />
              Copy description
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onResetSubtitle}
              disabled={!isSubtitleDirty}
            >
              <Icon icon="lucide:refresh-cw" className="h-3.5 w-3.5" size={14} />
              Reset to source
            </Button>
            <CopyResultNotice copyNotice={copyNotice} target="subtitle" />
          </EditorToolbar>
        </div>
      </EditorSection>
    </>
  );
}
