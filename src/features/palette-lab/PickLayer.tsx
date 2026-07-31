"use client";

import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { TokenSwatch, channelSwatch } from "./CatalogViews";
import type { PickCandidate, PickRole } from "./pickToken";
import styles from "./PaletteLab.module.css";

/**
 * The eyedropper's page-level layer: the hover outline, the "not themed yet"
 * toast, and the chooser shown when one click maps to several tokens.
 *
 * It is portaled over the page rather than living inside the panel, so it is
 * kept beside the panel component instead of inside it.
 */

const ROLE_LABEL: Record<PickRole, string> = {
  fill: "Background",
  text: "Text",
  border: "Border",
};

export interface PickMenuState {
  x: number;
  y: number;
  candidates: PickCandidate[];
}

interface PickLayerProps {
  picking: boolean;
  hoverRect: DOMRect | null;
  hoverLabel: string;
  toast: { x: number; y: number } | null;
  menu: PickMenuState | null;
  currentValue: (id: string) => string;
  onApply: (candidate: PickCandidate) => void;
}

export function PickLayer({
  picking,
  hoverRect,
  hoverLabel,
  toast,
  menu,
  currentValue,
  onApply,
}: PickLayerProps) {
  return (
    <>
      {picking && hoverRect && (
        <div
          data-pl-overlay=""
          className={styles.pickOverlay}
          style={{
            top: hoverRect.top,
            left: hoverRect.left,
            width: hoverRect.width,
            height: hoverRect.height,
          }}
          aria-hidden="true"
        >
          <span className={styles.pickOverlayLabel}>{hoverLabel || "Not themed yet"}</span>
        </div>
      )}
      {toast && (
        <div
          data-pl-overlay=""
          className={styles.pickToast}
          style={{ top: toast.y, left: toast.x }}
          role="status"
        >
          This part isn’t themed yet
        </div>
      )}
      {menu && (
        <div
          data-pl-overlay=""
          className={styles.pickMenu}
          style={{ top: menu.y, left: menu.x }}
          role="menu"
          aria-label="Edit which color"
        >
          <p className={styles.pickMenuTitle}>Edit which color?</p>
          {menu.candidates.map((candidate, index) => (
            <Button
              key={`${candidate.role}:${candidate.id}`}
              type="button"
              role="menuitem"
              variant="ghost"
              size="auto"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus={index === 0}
              className={cn(
                "w-full min-h-8 justify-start gap-2 rounded-lg px-1.5 py-1.5 text-left",
                "[@media(pointer:coarse)]:min-h-11",
              )}
              onClick={() => onApply(candidate)}
            >
              <TokenSwatch background={channelSwatch(candidate.id, currentValue(candidate.id))} />
              <span className={styles.pickMenuRole}>{ROLE_LABEL[candidate.role]}</span>
              <span className={styles.pickMenuName}>{candidate.label}</span>
            </Button>
          ))}
        </div>
      )}
    </>
  );
}
