"use client";

import dynamic from "next/dynamic";

import { Icon } from "@/components/common/Icon";
import { Button, Surface } from "@/components/ui";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";

const MoleculeQuickEditor = dynamic(
  () =>
    import("../molecule-editor/MoleculeQuickEditor").then(
      (module) => module.MoleculeQuickEditor,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="theme-text-faint flex min-h-[18rem] items-center justify-center gap-2 text-sm">
        <Icon icon="lucide:loader-2" size={16} className="animate-spin" />
        Loading the molecule editor
      </div>
    ),
  },
);

export interface ReviewMoleculePanelProps {
  slug: string;
  name: string;
  onClose: () => void;
  id: string;
  className?: string;
}

export function ReviewMoleculePanel({
  slug,
  name,
  onClose,
  id,
  className,
}: ReviewMoleculePanelProps) {
  const headingId = `${id}-heading`;

  return (
    <Surface
      asChild
      variant="card"
      padding="none"
      radius="xl"
      className={cn("overflow-hidden", className)}
    >
      <section id={id} aria-labelledby={headingId}>
        <div className="flex items-start gap-3 border-b border-[var(--theme-border-subtle)] px-4 py-2.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
            <Icon
              icon="lucide:hexagon"
              size={15}
              className="theme-text-secondary shrink-0"
            />
            <h2
              id={headingId}
              className="theme-text-primary min-w-0 truncate text-sm font-semibold"
            >
              Molecule depiction: {name}
            </h2>
            <p className="theme-text-muted min-w-0 text-xs">
              Saves publish straight to the live article, with no commit step.
            </p>
          </div>
          <Button
            variant="iconClose"
            size="auto"
            className={cn("shrink-0", TOUCH_ICON)}
            onClick={onClose}
            title="Close the molecule panel (M)"
            aria-label="Close the molecule panel"
          >
            <Icon icon="lucide:x" size={15} />
          </Button>
        </div>
        <MoleculeQuickEditor slug={slug} className="p-4" />
      </section>
    </Surface>
  );
}
