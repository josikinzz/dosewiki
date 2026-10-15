import { useEffect, useId, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";

import { MAX_LINKS } from "./contributorsModel";
import { MAX_LINK_LABEL_LENGTH, linkProblem } from "./profileEditModel";

export type LinkManagerProps = {
  links: Array<{ label: string; url: string }>;
  onLinkChange: (index: number, field: "label" | "url", value: string) => void;
  onRemoveLink: (index: number) => void;
  onAddLink: () => void;
  onMoveLink?: (from: number, to: number) => void;
  headingLevel?: "h3" | "h4" | "h5";
  headingClassName?: string;
};

const ICON_BUTTON = cn("h-8 w-8", TOUCH_ICON);

export function LinkManager({
  links,
  onLinkChange,
  onRemoveLink,
  onAddLink,
  onMoveLink,
  headingLevel: Heading = "h4",
  headingClassName,
}: LinkManagerProps) {
  const id = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pendingFocus, setPendingFocus] = useState<{ index: number; control: string } | null>(null);
  const full = links.length >= MAX_LINKS;

  useEffect(() => {
    if (!pendingFocus) return;
    const row = listRef.current?.children[pendingFocus.index] as HTMLElement | undefined;
    const target = row?.querySelector<HTMLElement>(`[data-control="${pendingFocus.control}"]:not([disabled])`)
      ?? row?.querySelector<HTMLElement>('[data-control="label"]')
      ?? addRef.current;
    target?.focus();
    setPendingFocus(null);
  }, [pendingFocus, links.length]);

  const nameOf = (index: number) => links[index]?.label.trim() || `Link ${index + 1}`;

  const move = (from: number, to: number) => {
    if (!onMoveLink || to < 0 || to >= links.length) return;
    onMoveLink(from, to);
    setAnnouncement(`Moved ${nameOf(from)} to position ${to + 1} of ${links.length}.`);
    setPendingFocus({ index: to, control: to < from ? "up" : "down" });
  };

  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Heading id={`${id}-heading`} className={headingClassName}>
          Links
        </Heading>
        <p className="theme-text-muted text-sm tabular-nums">{`${links.length} of ${MAX_LINKS}`}</p>
      </div>

      {links.length === 0 ? (
        <p className="theme-text-muted text-sm">
          No links yet. Add up to {MAX_LINKS} sites or social profiles; the page lists them in this order.
        </p>
      ) : (
        <ol ref={listRef} className="space-y-3">
          {links.map((link, index) => {
            const problem = linkProblem(link);
            const problemId = `${id}-problem-${index}`;
            return (
              <li key={index} className="space-y-1.5">
                <fieldset className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]">
                  <legend className="sr-only">{`Link ${index + 1}`}</legend>
                  <Input
                    type="text"
                    data-control="label"
                    value={link.label}
                    maxLength={MAX_LINK_LABEL_LENGTH}
                    onChange={(event) => onLinkChange(index, "label", event.target.value)}
                    placeholder="Name, such as Portfolio"
                    aria-label={`Link ${index + 1} label`}
                    aria-invalid={problem && !link.label.trim() ? true : undefined}
                    aria-describedby={problem ? problemId : undefined}
                    className="col-span-2 text-[16px] sm:col-span-1 md:text-sm"
                  />
                  <Input
                    type="url"
                    inputMode="url"
                    value={link.url}
                    onChange={(event) => onLinkChange(index, "url", event.target.value)}
                    placeholder="https://example.com"
                    aria-label={`Link ${index + 1} URL`}
                    aria-invalid={problem && link.label.trim() ? true : undefined}
                    aria-describedby={problem ? problemId : undefined}
                    className="text-[16px] md:text-sm"
                  />
                  <span className="flex shrink-0 items-center gap-0.5 self-center">
                    {onMoveLink && links.length > 1 ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          data-control="up"
                          className={ICON_BUTTON}
                          disabled={index === 0}
                          aria-label={`Move link ${index + 1} up`}
                          onClick={() => move(index, index - 1)}
                        >
                          <Icon icon="lucide:arrow-up" size={14} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          data-control="down"
                          className={ICON_BUTTON}
                          disabled={index === links.length - 1}
                          aria-label={`Move link ${index + 1} down`}
                          onClick={() => move(index, index + 1)}
                        >
                          <Icon icon="lucide:arrow-down" size={14} />
                        </Button>
                      </>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghostDestructive"
                      size="icon"
                      className={ICON_BUTTON}
                      aria-label={`Remove link ${index + 1}`}
                      title={`Remove ${nameOf(index)}`}
                      onClick={() => {
                        const removed = nameOf(index);
                        onRemoveLink(index);
                        setAnnouncement(`Removed ${removed}. ${links.length - 1} of ${MAX_LINKS} links.`);
                        setPendingFocus({ index: Math.min(index, links.length - 2), control: "label" });
                      }}
                    >
                      <Icon icon="lucide:trash-2" size={15} />
                    </Button>
                  </span>
                </fieldset>
                {problem ? (
                  <p id={problemId} className="flex items-start gap-1.5 text-xs text-[color:var(--theme-danger-text)]">
                    <Icon icon="lucide:circle-alert" size={12} className="mt-0.5 shrink-0" />
                    {problem}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button
          ref={addRef}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onAddLink();
            setPendingFocus({ index: links.length, control: "label" });
          }}
          disabled={full}
        >
          <Icon icon="lucide:plus" size={15} />
          Add link
        </Button>
        {full ? <p className="theme-text-faint text-xs">{`${MAX_LINKS} is the most a profile holds. Remove one to add another.`}</p> : null}
      </div>
      <p aria-live="polite" className="sr-only">{announcement}</p>
    </section>
  );
}
