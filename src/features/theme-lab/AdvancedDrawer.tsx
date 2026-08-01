"use client";

import type { ThemeName } from "@/context/ThemeContext";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui";
import { PANEL_ICON, PanelButton, PanelIconButton, PanelTextarea } from "./panelKit";
import styles from "./PaletteLab.module.css";

/**
 * The panel's foot: the always-visible copy action, the disclosure, and the
 * technical drawer behind it (JSON console, apply/revert, danger zone).
 *
 * Lifted out of `PaletteLab.tsx` when its controls moved onto the shared kit —
 * the panel component sits against its LOC budget, and this block is a
 * self-contained slab of markup with no state of its own.
 */

interface AdvancedDrawerProps {
  theme: ThemeName;
  open: boolean;
  onToggle: () => void;
  copied: boolean;
  onCopy: () => void;
  jsonValue: string;
  jsonDirty: boolean;
  jsonError: string | null;
  onJsonChange: (value: string) => void;
  onApply: () => void;
  onRevert: () => void;
  onResetTheme: () => void;
  onResetAll: () => void;
}

export function AdvancedDrawer({
  theme,
  open,
  onToggle,
  copied,
  onCopy,
  jsonValue,
  jsonDirty,
  jsonError,
  onJsonChange,
  onApply,
  onRevert,
  onResetTheme,
  onResetAll,
}: AdvancedDrawerProps) {
  return (
    <div className={styles.jsonArea}>
      {/* Always-visible bar: a plain "copy" primary, and the toggle that reveals
          the technical drawer (closed by default). */}
      <div className={styles.jsonBar}>
        <div className={styles.jsonBarTop}>
          <PanelButton
            aria-label="Copy colors"
            title="Copy these colors to the clipboard"
            onClick={onCopy}
          >
            <Icon icon={copied ? "lucide:check" : "lucide:copy"} size={14} />
            <span>{copied ? "Copied" : "Copy colors"}</span>
          </PanelButton>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="auto"
          aria-expanded={open}
          aria-controls="palette-lab-advanced"
          onClick={onToggle}
          className={`w-full min-h-8 justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left [@media(pointer:coarse)]:min-h-11 ${PANEL_ICON[14]}`}
        >
          <span className={styles.advancedToggleText}>
            <span className={styles.advancedToggleLabel}>Advanced</span>
            <span className={styles.advancedToggleHint}>export · import · reset</span>
          </span>
          <Icon
            icon="lucide:chevron-right"
            size={14}
            className={`${styles.advancedCaret} ${open ? styles.advancedCaretOpen : ""}`}
          />
        </Button>
      </div>

      {open && (
        <div className={styles.advancedDrawer} id="palette-lab-advanced">
          <span className={styles.fieldCaption}>JSON{jsonDirty ? " · edited" : ""}</span>
          <PanelTextarea
            className="mb-2 min-h-20 whitespace-pre"
            aria-label="Theme colors JSON"
            placeholder='{"dark":{…},"light":{…}}'
            value={jsonValue}
            onChange={(event) => onJsonChange(event.target.value)}
          />
          {jsonError && <p className={styles.importError}>{jsonError}</p>}
          <div className={styles.jsonActions}>
            <PanelButton
              disabled={!jsonDirty}
              aria-label="Apply JSON"
              title="Apply the JSON above"
              onClick={onApply}
            >
              <Icon icon="lucide:check" size={14} />
              <span>Apply</span>
            </PanelButton>
            {jsonDirty && (
              <PanelIconButton
                aria-label="Revert JSON edits"
                title="Revert JSON edits"
                onClick={onRevert}
              >
                <Icon icon="lucide:undo-2" size={15} />
              </PanelIconButton>
            )}
          </div>

          <div className={styles.dangerZone}>
            <span className={styles.dangerLabel}>Danger zone</span>
            <div className={styles.dangerActions}>
              <PanelButton
                variant="ghostDestructive"
                className="flex-1 justify-center"
                aria-label={`Reset ${theme} theme`}
                title={`Reset every color in the ${theme} theme`}
                onClick={onResetTheme}
              >
                <Icon icon="lucide:rotate-ccw" size={14} />
                <span>Reset this theme</span>
              </PanelButton>
              <PanelButton
                variant="ghostDestructive"
                className="flex-1 justify-center"
                aria-label="Reset all themes"
                title="Reset every color in both themes"
                onClick={onResetAll}
              >
                <Icon icon="lucide:trash-2" size={14} />
                <span>Reset everything</span>
              </PanelButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
