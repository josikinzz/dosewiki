import { type ChangeEvent } from "react";
import { SectionCard } from "@/components/common/SectionCard";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/common/Icon";

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
      <SectionCard className="space-y-6">
        <div className="flex flex-col gap-2">
          <h2 className="flex items-center gap-3 text-xl font-semibold text-fuchsia-200">
            <Icon icon="lucide:file-text" className="h-5 w-5 text-fuchsia-300" size={20} />
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
          <Label htmlFor="about-markdown-editor">
            Markdown source
          </Label>
          <Textarea
            id="about-markdown-editor"
            ref={textareaRef}
            className="min-h-[240px] resize-none whitespace-pre-wrap font-mono text-[16px] leading-6"
            value={aboutMarkdown}
            onChange={onMarkdownChange}
          />
          <div className="flex flex-wrap gap-2 text-xs">
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
          <Label htmlFor="about-subtitle-editor">
            Subtitle source
          </Label>
          <Textarea
            id="about-subtitle-editor"
            ref={subtitleTextareaRef}
            className="min-h-[160px] resize-none whitespace-pre-wrap font-mono text-[16px] leading-6"
            value={aboutSubtitle}
            onChange={onSubtitleChange}
          />
          <div className="flex flex-wrap gap-2 text-xs">
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
          </div>
        </div>
      </SectionCard>
    </>
  );
}
