import { CodeSurface } from "@/features/dev/components";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";

/**
 * Shared source-content surface used by the substance editor's Available Sources
 * grid and the fullscreen SourcePreviewModal. Both render the source text inside
 * a frosted CodeSurface (theme-code tokens, no baked #020617 navy) so the two
 * views read as the same object. The grid variant pins a square dashboard tile
 * with a header row + maximize affordance; the modal variant fills its dialog
 * body.
 */
interface SourcePreviewTileProps {
  /** Source label shown in the tile header (grid variant only). */
  title?: string;
  /** Raw source content; `null` shows the loading placeholder. */
  content: string | null;
  /** Optional maximize handler — renders the fullscreen affordance when set. */
  onOpenFullscreen?: () => void;
  /** "grid" = square dashboard tile, "fill" = stretches to the dialog body. */
  variant?: "grid" | "fill";
}

export function SourcePreviewTile({
  title,
  content,
  onOpenFullscreen,
  variant = "grid",
}: SourcePreviewTileProps) {
  if (variant === "fill") {
    return (
      <CodeSurface
        value={content ?? undefined}
        emptyText="Loading..."
        className="h-full border-0 bg-transparent"
        preClassName="h-full p-0 text-sm leading-relaxed"
      />
    );
  }

  return (
    <div className="relative aspect-square overflow-hidden rounded-xl border border-[var(--theme-border-subtle)] bg-[var(--theme-surface-deep)]">
      <div className="flex items-center justify-between border-b border-[var(--theme-border-subtle)] px-3 py-2">
        <span className="theme-text-primary truncate text-sm font-medium">{title}</span>
        {onOpenFullscreen ? (
          <Button variant="iconSmall" onClick={onOpenFullscreen} title="Open fullscreen">
            <Icon icon="lucide:maximize-2" className="h-4 w-4" size={16} />
          </Button>
        ) : null}
      </div>
      <div className="absolute inset-x-0 bottom-0 top-10 overflow-auto">
        <CodeSurface
          value={content ?? undefined}
          emptyText="Loading..."
          className="min-h-full border-0 bg-transparent"
          preClassName="p-3 text-xs"
        />
      </div>
    </div>
  );
}
