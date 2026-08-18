"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/common/Icon";
import { useTheme } from "@/context/ThemeContext";
import { PanelBadge, PanelButton } from "./panelKit";
import { customThemeSwatch } from "./customThemes";
import { getPreset } from "./palettePresets";
import {
  MAX_CUSTOM_THEMES,
  acceptPendingShare,
  canAcceptSharedTheme,
  declinePendingShare,
  type PendingShare,
} from "./paletteLabShare";
import { usePaletteLabTheme } from "./paletteLabStore";
import { ThemeStrips } from "./ThemeCard";
import styles from "./PaletteLab.module.css";

/**
 * Preview-before-apply: the step between someone else's link and the visitor's
 * own site.
 *
 * Docked to the bottom of the viewport rather than thrown up as a modal, on
 * purpose. The whole question being asked — *do you want to look at this?* —
 * can only be answered by seeing the page wearing it, so the page stays
 * visible and interactive behind the card while the theme is on. Nothing has
 * been written at this point: the look comes from a preview layer that lives
 * outside the saved envelope, so "No thanks" leaves storage untouched.
 *
 * Accepting adds the theme as a *new* named slot beside whatever the visitor
 * already had. It never overwrites a saved theme or a preset tweak, which is
 * what makes trying a stranger's look free.
 */

export function SharedThemeInvite({ pending }: { pending: PendingShare }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const theme = pending.theme;
  // Read reactively: a visitor who deletes a saved theme in the panel while
  // this card is up should immediately be able to keep the shared one.
  const themeState = usePaletteLabTheme();
  const atCap = Boolean(theme) && !canAcceptSharedTheme(themeState);
  const { setSurface, setAccent } = useTheme();
  const accept = useCallback(() => {
    const accepted = acceptPendingShare();
    if (!accepted) return;
    setSurface(accepted.surfaceId);
    setAccent(accepted.accentId);
  }, [setSurface, setAccent]);

  // The card can appear without the visitor asking for it (they followed a
  // link), so focus moves to it — otherwise a keyboard visitor has no idea the
  // site just changed under them, and no way to reach the decision.
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, []);

  /** Escape declines, scoped to the card — the rest of the site keeps its own
   *  Escape behavior while this is up. */
  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    declinePendingShare();
  }, []);

  const swatch = theme
    ? customThemeSwatch({
        id: "shared",
        name: theme.name,
        overrides: theme.overrides,
        basePresetId: theme.basePresetId,
      })
    : null;

  const card = (
    <div className={styles.inviteLayer} data-palette-lab="">
      {/* A dialog owning its own Escape is the pattern the rule warns about for
          ordinary containers; here it is the alternative to a site-wide
          listener. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={cardRef}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={styles.invite}
        role="dialog"
        aria-modal="false"
        aria-label="Shared theme"
      >
        {theme ? (
          <>
            <p className={styles.inviteTitle}>
              <Icon icon="lucide:palette" size={15} />
              <span>Someone shared a theme with you</span>
            </p>
            <p className={styles.inviteName}>
              {theme.name}
              <PanelBadge variant="secondary">{getPreset(theme.basePresetId).name}</PanelBadge>
            </p>
            {swatch && <ThemeStrips swatch={swatch} />}
            <p className={styles.slotConfirm}>
              You’re looking at it right now — this is a preview only.{" "}
              {theme.unknownBase
                ? "It was built on a palette this site no longer ships, so it’s showing over the default one. "
                : ""}
              Keeping it adds <strong>{theme.name}</strong> to your own themes. Nothing you’ve
              already saved changes either way.
            </p>
            {atCap && (
              <p className={styles.importError} role="status">
                You already have the maximum of {MAX_CUSTOM_THEMES} saved themes — delete one in the
                Theme Lab to keep this.
              </p>
            )}
            <div className={styles.jsonActions}>
              <PanelButton
                className="flex-1 justify-center"
                disabled={atCap}
                onClick={accept}
              >
                <Icon icon="lucide:check" size={14} />
                <span>Keep this theme</span>
              </PanelButton>
              <PanelButton
                variant="outline"
                className="flex-1 justify-center"
                onClick={declinePendingShare}
              >
                No thanks
              </PanelButton>
            </div>
          </>
        ) : (
          <>
            <p className={styles.inviteTitle}>
              <Icon icon="lucide:shield-alert" size={15} />
              <span>That shared theme wasn’t applied</span>
            </p>
            <p className={styles.importError} role="status">
              {pending.error}
            </p>
            <div className={styles.jsonActions}>
              <PanelButton
                variant="outline"
                className="flex-1 justify-center"
                onClick={declinePendingShare}
              >
                Dismiss
              </PanelButton>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(card, document.body);
}
