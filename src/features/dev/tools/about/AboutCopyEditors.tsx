import { useId, useState, type ChangeEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/common/Icon";
import { ExpandButton } from "@/components/common/ExpandButton";
import {
  ActionNotice,
  EditorField,
  EditorSection,
  EditorStatusPill,
  EditorToolbar,
  TagToken,
} from "@/features/dev/components";
import type { AboutCopyNotice } from "./aboutEditorUtils";

const PLACEHOLDER_TOKENS: Array<{ key: string; label: string }> = [
  { key: "compoundCount", label: "published substances" },
  { key: "effectCount", label: "tracked subjective effects" },
  { key: "reportCount", label: "published trip reports" },
  { key: "replicationCount", label: "replication gallery entries" },
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
  contextual?: boolean;
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
      {copyNotice.ok ? "Copied to clipboard" : "Copy failed. Check clipboard permissions."}
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
  contextual = false,
}: AboutCopyEditorsProps) {
  const [tokensOpen, setTokensOpen] = useState(false);
  const tokensId = useId();
  return (
    <>
      <EditorSection
        headingLevel={contextual ? "h3" : "h2"}
        icon="lucide:file-text"
        title="About copy"
        description="Edit one Markdown document. Text before the section headings appears in Introduction. Use ## Sources and review for the sources section and ## Project history for the history above contributor cards. Check the rendered preview before publishing."
        actions={(
          <EditorStatusPill tone={isMarkdownDirty ? "warning" : "success"}>
            {isMarkdownDirty ? "Changed" : "Clean"}
          </EditorStatusPill>
        )}
      >
        <div className="space-y-6">
          {contextual ? <ExpandButton variant="inline" isExpanded={tokensOpen} onToggle={() => setTokensOpen(value => !value)} ariaControls={tokensId} ariaLabel="Live count placeholders" label="Live count placeholders" /> : null}
          <div id={tokensId} className={contextual && !tokensOpen ? "hidden" : "flex flex-wrap gap-2 text-[11px] theme-text-muted"}>
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
          <EditorField label="Markdown source" htmlFor="about-markdown-editor" description={contextual ? "Markdown formatting and live count placeholders render in Local preview." : undefined}>
            {(control) => <Textarea
              {...control}
              ref={textareaRef}
              className={contextual ? "min-h-[240px] resize-y whitespace-pre-wrap font-mono" : "min-h-[240px] resize-none whitespace-pre-wrap font-mono"}
              value={aboutMarkdown}
              onChange={onMarkdownChange}
            />}
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
              Reset About copy
            </Button>
            <CopyResultNotice copyNotice={copyNotice} target="markdown" />
          </EditorToolbar>
        </div>
      </EditorSection>

      <EditorSection
        headingLevel={contextual ? "h3" : "h2"}
        icon="lucide:type"
        title="Subtitle and meta description"
        description="Appears beneath the About heading and in search metadata. Supports the same placeholder tokens."
        actions={(
          <>
            <EditorStatusPill tone={isSubtitleDirty ? "warning" : "success"}>
              {isSubtitleDirty ? "Changed" : "Clean"}
            </EditorStatusPill>
            <EditorStatusPill tone="neutral">{`${subtitleLength.toLocaleString()} ${contextual ? "source characters" : "characters"}`}</EditorStatusPill>
          </>
        )}
      >
        <div className="space-y-6">
          <EditorField label={contextual ? "Subtitle and meta description source" : "Meta description source"} htmlFor="about-subtitle-editor" description={contextual ? `${subtitleLength.toLocaleString()} source characters. Live count placeholders resolve in the public subtitle and search description.` : undefined}>
            {(control) => <Textarea
              {...control}
              ref={subtitleTextareaRef}
              className={contextual ? "min-h-[80px] resize-y whitespace-pre-wrap" : "min-h-[80px] resize-none whitespace-pre-wrap font-mono"}
              value={aboutSubtitle}
              onChange={onSubtitleChange}
            />}
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
