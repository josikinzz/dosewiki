import { Icon } from "@/components/common/Icon";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { MAX_LINKS } from "./types";
import type { LinkManagerProps } from "./types";

export function LinkManager({
  links,
  onLinkChange,
  onRemoveLink,
  onAddLink,
  hasPartialLink,
}: LinkManagerProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Links</Label>
        <span className="text-xs text-white/45">
          {links.length}/{MAX_LINKS}
        </span>
      </div>

      {links.length === 0 && (
        <p className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-3 text-sm text-white/55">
          No links added yet. Use the button below to add up to three trusted resources or social profiles.
        </p>
      )}

      <div className="space-y-3">
        {links.map((link, index) => (
          <div key={index} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Input
              type="text"
              value={link.label}
              onChange={(event) => onLinkChange(index, "label", event.target.value)}
              placeholder="Label (e.g., Portfolio)"
            />
            <Input
              type="url"
              value={link.url}
              onChange={(event) => onLinkChange(index, "url", event.target.value)}
              placeholder="https://example.com"
            />
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={() => onRemoveLink(index)}
            >
              <Icon icon="lucide:trash-2" size={16} />
              <span className="sr-only">Remove link</span>
            </Button>
          </div>
        ))}
      </div>

      {hasPartialLink && (
        <p className="text-xs text-rose-300">
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
    </div>
  );
}
