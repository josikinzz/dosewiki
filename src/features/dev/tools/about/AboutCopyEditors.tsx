import { type ChangeEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/common/Icon";
import {
  EditorField,
  EditorPanel,
  EditorPanelBody,
  EditorPanelHeader,
  EditorToolbar,
  TagToken,
} from "@/features/dev/components";

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
};

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
}: AboutCopyEditorsProps) {
  return (
    <>
      <EditorPanel>
        <EditorPanelHeader
          icon="lucide:file-text"
          title="About copy"
          description="Edit the Markdown that powers the public About page. Formatting updates render in the preview card below. Use the tokens listed underneath to reference live dataset counts."
        />
        <EditorPanelBody className="space-y-6">
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] theme-text-muted">
            {PLACEHOLDER_TOKENS.map((token) => (
              <TagToken
                key={token.key}
                variant="readonly"
                label={(
                  <>
                    <code className="font-mono text-[0.7rem] theme-text-secondary">{`{{${token.key}}}`}</code>
                    <span className="theme-text-faint">{token.label}</span>
                  </>
                )}
              />
            ))}
          </div>
        <EditorField label="Markdown source" htmlFor="about-markdown-editor">
          <Textarea
            id="about-markdown-editor"
            ref={textareaRef}
            className="min-h-[240px] resize-none whitespace-pre-wrap font-mono text-[16px] leading-6"
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
          </EditorToolbar>
        </EditorPanelBody>
      </EditorPanel>

      <EditorPanel>
        <EditorPanelHeader
          title="About subtitle"
          description="Update the sentence displayed beneath the About header. Supports the same placeholder tokens listed above."
          meta={`${subtitleLength.toLocaleString()} characters`}
        />
        <EditorPanelBody className="space-y-6">
        <EditorField label="Subtitle source" htmlFor="about-subtitle-editor">
          <Textarea
            id="about-subtitle-editor"
            ref={subtitleTextareaRef}
            className="min-h-[160px] resize-none whitespace-pre-wrap font-mono text-[16px] leading-6"
            value={aboutSubtitle}
            onChange={onSubtitleChange}
          />
        </EditorField>
          <EditorToolbar label="About subtitle actions" variant="compact" className="text-xs">
            <Button type="button" variant="secondary" size="sm" onClick={onCopySubtitle}>
              <Icon icon="lucide:copy" className="h-3.5 w-3.5" size={14} />
              Copy subtitle
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onResetSubtitle}
              disabled={!isSubtitleDirty}
            >
              <Icon icon="lucide:refresh-cw" className="h-3.5 w-3.5" size={14} />
              Reset subtitle
            </Button>
          </EditorToolbar>
        </EditorPanelBody>
      </EditorPanel>
    </>
  );
}
