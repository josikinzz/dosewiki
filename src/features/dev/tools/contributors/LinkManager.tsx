import { Icon } from "@/components/common/Icon";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditorSection, EditorStatusPill } from "@/features/dev/components";

import { MAX_LINKS } from "./contributorsModel";

export type LinkManagerProps = {
  links: Array<{ label: string; url: string }>;
  onLinkChange: (index: number, field: "label" | "url", value: string) => void;
  onRemoveLink: (index: number) => void;
  onAddLink: () => void;
  hasPartialLink: boolean;
};

export function LinkManager({
  links,
  onLinkChange,
  onRemoveLink,
  onAddLink,
  hasPartialLink,
}: LinkManagerProps) {
  return (
    <EditorSection
      icon="lucide:link"
      title="Links"
      actions={(
        <EditorStatusPill tone="neutral">
          {links.length}/{MAX_LINKS}
        </EditorStatusPill>
      )}
    >
      {links.length === 0 && (
        <p className="theme-text-muted text-sm leading-6">
          No links yet. Add up to {MAX_LINKS} trusted resources or social profiles.
        </p>
      )}

      <div className="space-y-3">
        {links.map((link, index) => (
          <div
            key={index}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          >
            <Input
              type="text"
              value={link.label}
              onChange={(event) => onLinkChange(index, "label", event.target.value)}
              placeholder="Label (e.g., Portfolio)"
              aria-label={`Link ${index + 1} label`}
              className="col-span-2 sm:col-span-1"
            />
            <Input
              type="url"
              value={link.url}
              onChange={(event) => onLinkChange(index, "url", event.target.value)}
              placeholder="https://example.com"
              aria-label={`Link ${index + 1} URL`}
            />
            <Button
              type="button"
              variant="ghostDestructive"
              size="icon"
              onClick={() => onRemoveLink(index)}
            >
              <Icon icon="lucide:trash-2" size={16} />
              <span className="sr-only">Remove link {index + 1}</span>
            </Button>
          </div>
        ))}
      </div>

      {hasPartialLink && (
        <p className="text-xs text-[color:var(--theme-danger-text)]" role="status">
          Complete both the label and URL before saving your link.
        </p>
      )}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onAddLink}
        disabled={links.length >= MAX_LINKS}
      >
        <Icon icon="lucide:plus" size={16} />
        Add link
      </Button>
    </EditorSection>
  );
}
