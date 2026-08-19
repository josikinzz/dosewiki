"use client";

import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { TokenSwatch, channelSwatch } from "./CatalogViews";
import type { PickCandidate, PickRole } from "./pickToken";
import styles from "./ThemeLab.module.css";

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

/** `role="menu"` promises arrow-key movement between items; focus starts on the
 *  first item, and Up/Down walk the list with wrap-around. */
function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
  );
  if (items.length === 0) return;
  const index = items.indexOf(document.activeElement as HTMLButtonElement);
  const delta = event.key === "ArrowDown" ? 1 : -1;
  items[(index + delta + items.length) % items.length]?.focus();
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
          // Focus lives on the items (the first autofocuses); the container is
          // programmatically focusable only so the arrow keys have a home when
          // an item is dismissed under the pointer.
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
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
