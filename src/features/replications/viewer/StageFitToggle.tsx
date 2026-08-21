'use client';

import { Icon } from '@/components/common/Icon';
import { focusRingClassName } from '@/components/ui/surface';
import { cn } from '@/lib/utils';
import type { FitMode } from './viewerLogic';

/**
 * The fit/fill chip every immersive stage shows: bounded cover-crop versus
 * the whole frame. Same round on-media optics as the other stage controls;
 * `className` places it (and opts back into pointer events where the stage
 * chrome is `pointer-events-none`).
 */
export function StageFitToggle({
  fitMode,
  onToggle,
  className,
}: {
  fitMode: FitMode;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={fitMode === 'fill'}
      aria-label={fitMode === 'fill' ? 'Fit the whole frame' : 'Fill the stage (crops the frame)'}
      className={cn(
        'grid size-11 flex-none place-items-center rounded-full',
        'bg-black/55 theme-media-tile-title backdrop-blur-sm',
        'transition-opacity active:opacity-100 hover:opacity-100 opacity-80',
        'motion-reduce:transition-none',
        focusRingClassName,
        className,
      )}
    >
      <Icon icon={fitMode === 'fill' ? 'lucide:shrink' : 'lucide:expand'} className="size-5" />
    </button>
  );
}
