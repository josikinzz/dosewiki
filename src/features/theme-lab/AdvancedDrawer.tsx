"use client";

import type { ColorScheme } from "@/context/ThemeContext";
import { Icon } from "@/components/common/Icon";
import { PanelButton, PanelDisclosure, PanelIconButton, PanelTextarea } from "./panelKit";
import styles from "./ThemeLab.module.css";

interface AdvancedDrawerProps {
  theme: ColorScheme;
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
      <div className={styles.jsonBar}>
        <div className={styles.jsonBarTop}>
          <PanelButton
            aria-label="Copy colors"
            title="Copy these colors to the clipboard"
            onClick={onCopy}
          >
            <Icon icon={copied ? "lucide:check" : "lucide:copy"} size={14} />
            <span aria-live="polite">{copied ? "Copied" : "Copy colors"}</span>
          </PanelButton>
        </div>
        <PanelDisclosure
          label="Advanced"
          hint="export · import · reset"
          open={open}
          controls="theme-lab-advanced"
          onToggle={onToggle}
        />
      </div>

      {open && (
        <div className={styles.advancedDrawer} id="theme-lab-advanced">
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
