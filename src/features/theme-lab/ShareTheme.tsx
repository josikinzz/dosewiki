"use client";

import { useCallback, useMemo, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { useTheme } from "@/context/ThemeContext";
import { PRO_ACCENT_SEED_NAMES, getAccent, type AccentId } from "@/theme/accents";
import { PanelButton, PanelDisclosure, PanelTextarea } from "./panelKit";
import { getPreset } from "./palettePresets";
import {
  activeBasePresetId,
  activeCustomSlot,
  effectiveOverrides,
  type ThemeLabState,
} from "./paletteLabTheme";
import { buildShareCode, buildShareLink, offerSharedThemeCode } from "./paletteLabShare";
import { serializeAccentEntry } from "./paletteLabExport";
import { sampleRenderedTokens } from "./presetBaselines";
import { MAX_SHARE_CODE_LENGTH, shareCodeFits } from "./themeShareCodec";
import styles from "./PaletteLab.module.css";

/**
 * The sending end of theme sharing, in the panel's foot beside Advanced.
 *
 * Whatever the visitor is wearing — a shipped palette with tweaks, or one of
 * their own saved themes — turns into one compact code and one link. The code
 * describes the whole look; it is short because it names the palette it started
 * from instead of restating that palette's own several hundred values.
 *
 * A paste field sits under them so a code that arrived by some other route
 * (chat, a note, a screenshot retyped) reaches the same preview-before-apply
 * step a link does. Pasting never applies anything directly.
 *
 * The third button sends a look the other way — out of the browser and back into
 * the repository, as one `Accent` entry for `src/theme/accents.ts`. It belongs
 * here rather than in a surface of its own because it answers the same question
 * the other two do: I am done tuning, now what?
 *
 * Lives beside the panel rather than inside it because `PaletteLab.tsx` sits
 * against its LOC budget.
 */

interface ShareThemeProps {
  themeState: ThemeLabState;
}

/** What the three buttons put on the clipboard. */
type CopyKind = "code" | "link" | "accent";

/** What the shared theme should be called on the other side: the visitor's own
 *  slot name when they are wearing one, else the palette's name. */
function shareName(state: ThemeLabState): string {
  return activeCustomSlot(state)?.name ?? getPreset(activeBasePresetId(state)).name;
}

/** The token the cog's swatch dot has to match, measured in the one combination
 *  the accent table states it in. */
const SWATCH_TOKEN = "--theme-accent";

/**
 * Measure the accent being tuned, in the combinations its table entry is written
 * in: the Pro seeds per colour scheme, and the Fun-dark swatch. Read at click
 * time, never on render — each call restyles the document root twice.
 */
function accentEntryText(state: ThemeLabState, accent: AccentId): string {
  const worn = getAccent(accent);
  const swatch = sampleRenderedTokens([SWATCH_TOKEN], {
    visualStyle: "fun",
    colorScheme: "dark",
  });
  return serializeAccentEntry({
    id: accent,
    label: worn.label,
    // The accent's declared Fun half when it has one: an accent being tuned in Pro
    // keeps the colourway it ships with, whatever palette the panel happens to be
    // wearing. Only the default accent, which declares none, falls back to that.
    funPresetId: worn.funPresetId ?? activeBasePresetId(state),
    swatch: swatch[SWATCH_TOKEN],
    pro: {
      light: sampleRenderedTokens(PRO_ACCENT_SEED_NAMES.light, {
        visualStyle: "pro",
        colorScheme: "light",
      }),
      dark: sampleRenderedTokens(PRO_ACCENT_SEED_NAMES.dark, {
        visualStyle: "pro",
        colorScheme: "dark",
      }),
    },
  });
}

export function ShareTheme({ themeState }: ShareThemeProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<CopyKind | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The accent being tuned. It is the one thing on the panel that is not a
  // palette token: the entry has to name the accent whose seeds these are.
  const { surface, accent } = useTheme();

  const code = useMemo(
    () =>
      buildShareCode({
        name: shareName(themeState),
        basePresetId: activeBasePresetId(themeState),
        surfaceId: surface,
        accentId: accent,
        overrides: effectiveOverrides(themeState),
      }),
    [themeState, surface, accent],
  );

  // A look tuned token-by-token can outgrow what a URL will carry. Say so
  // rather than handing over a link the other end is going to refuse.
  const fits = shareCodeFits(code);

  const copy = useCallback(
    async (kind: CopyKind) => {
      const text =
        kind === "code"
          ? code
          : kind === "link"
            ? buildShareLink(code)
            : accentEntryText(themeState, accent);
      try {
        await navigator.clipboard.writeText(text);
        setCopied(kind);
        window.setTimeout(() => setCopied(null), 1600);
      } catch {
        // Clipboard blocked (permissions, insecure context): put the value in
        // the field they can select instead of failing silently.
        setDraft(text);
        setError("Clipboard blocked — select the text below and copy it manually.");
      }
    },
    [accent, code, themeState],
  );

  const preview = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Paste a Theme Lab share code first.");
      return;
    }
    setError(null);
    // Straight to the invite: even a code the visitor pasted themselves gets
    // previewed before it can land, because a code is unreadable by eye.
    offerSharedThemeCode(trimmed, false);
  }, [draft]);

  return (
    <div className={styles.shareArea}>
      <PanelDisclosure
        label="Share"
        hint="code · link · accent"
        open={open}
        controls="palette-lab-share"
        onToggle={() => setOpen((value) => !value)}
      />

      {open && (
        <div className={styles.advancedDrawer} id="palette-lab-share">
          <p className={styles.slotConfirm}>
            Send this look to someone. They’ll see a preview and decide for themselves — it can’t
            replace a theme they already saved.
          </p>
          {!fits && (
            <p className={styles.importError} role="status">
              This look changes too many colors to fit in a link ({code.length} characters, limit{" "}
              {MAX_SHARE_CODE_LENGTH}). Use the JSON export under Advanced instead.
            </p>
          )}
          <div className={styles.jsonActions}>
            <PanelButton
              title="Copy a compact code for this theme"
              disabled={!fits}
              onClick={() => copy("code")}
            >
              <Icon icon={copied === "code" ? "lucide:check" : "lucide:copy"} size={14} />
              {/* The flip to "Copied" is the only success feedback, so say it
                  aloud too — a live region, because focus never moves. */}
              <span aria-live="polite">{copied === "code" ? "Copied" : "Copy code"}</span>
            </PanelButton>
            <PanelButton
              variant="outline"
              title="Copy a link that opens this theme"
              disabled={!fits}
              onClick={() => copy("link")}
            >
              <Icon icon={copied === "link" ? "lucide:check" : "lucide:link"} size={14} />
              <span aria-live="polite">{copied === "link" ? "Copied" : "Copy link"}</span>
            </PanelButton>
          </div>

          <span className={styles.fieldCaption}>
            Tuning an accent? Copy its table entry for src/theme/accents.ts
          </span>
          <div className={styles.jsonActions}>
            <PanelButton
              variant="outline"
              title="Copy an Accent entry for the accent these seeds belong to"
              onClick={() => copy("accent")}
            >
              <Icon icon={copied === "accent" ? "lucide:check" : "lucide:file-code"} size={14} />
              <span aria-live="polite">
                {copied === "accent" ? "Copied" : `Copy ${getAccent(accent).label} entry`}
              </span>
            </PanelButton>
          </div>

          <span className={styles.fieldCaption}>
            Have a code? Paste it to preview it before it applies
          </span>
          <PanelTextarea
            className="mb-2 min-h-16 break-all"
            aria-label="Theme share code"
            placeholder="Paste a Theme Lab share code…"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              if (error) setError(null);
            }}
          />
          {error && <p className={styles.importError}>{error}</p>}
          <div className={styles.jsonActions}>
            <PanelButton title="Preview this code before it applies" onClick={preview}>
              <Icon icon="lucide:eye" size={14} />
              <span>Preview</span>
            </PanelButton>
          </div>
        </div>
      )}
    </div>
  );
}
