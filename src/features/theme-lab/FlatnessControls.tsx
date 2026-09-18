"use client";

import { PanelChip } from "./panelKit";
import {
  CORNER_STEPS,
  CORNER_TOKEN_IDS,
  DEPTH_STEPS,
  DEPTH_TOKEN_IDS,
  GLOW_STEPS,
  GLOW_TOKEN_IDS,
  cornerOverrides,
  depthOverrides,
  detectStep,
  glowOverrides,
  type FlatnessStep,
} from "./flatnessAxes";
import { BLUR_TOKEN_ID } from "./themeLabStorage";
import styles from "./ThemeLab.module.css";

/**
 * The flat↔deep axis, as four one-tap rows under the Essentials catalog: shadow
 * depth, ambient glow, corner roundness, and the backdrop-blur switch. Depth,
 * glow, and corners write ordinary per-token overrides computed from the look's
 * own sampled baselines (so "Soft" fades *what is on screen*, not a hardcoded
 * palette); blur writes the sentinel token the appliers translate into
 * `html[data-blur="off"]`.
 *
 * No step highlighted means the visitor's own per-token edits are in charge —
 * the axis never fights the catalog.
 */

interface FlatnessControlsProps {
  /** The value a token resolves to for the live look, with no user edits. */
  baselineValue: (id: string) => string;
  /** The visitor's own override for a token id, if any. */
  overrideValue: (id: string) => string | undefined;
  /** Write a map of per-token values (delete-on-equal against baselines). */
  onApplyMap: (map: Record<string, string>) => void;
  /** Remove the visitor's overrides for these ids. */
  onResetIds: (ids: string[]) => void;
  /** Write the blur sentinel into both themes (or clear it). */
  onSetBlur: (off: boolean) => void;
  blurOff: boolean;
}

function AxisRow({
  label,
  steps,
  activeId,
  onPick,
}: {
  label: string;
  steps: FlatnessStep[];
  activeId: string | null;
  onPick: (step: FlatnessStep) => void;
}) {
  return (
    <div className={AXIS_ROW} role="group" aria-label={label}>
      <span className={AXIS_LABEL}>{label}</span>
      <div className="flex gap-1">
        {steps.map((step) => (
          <PanelChip key={step.id} active={activeId === step.id} onClick={() => onPick(step)}>
            {step.label}
          </PanelChip>
        ))}
      </div>
    </div>
  );
}

/** Utility-class layout on purpose: the panel stylesheet is capped to its
 *  bespoke instruments, and these rows are plain kit-era flex layout. */
const AXIS_ROW = "flex flex-wrap items-center justify-between gap-2 px-1.5 py-1";
const AXIS_LABEL = "theme-text-muted text-[0.78125rem]";

export function FlatnessControls({
  baselineValue,
  overrideValue,
  onApplyMap,
  onResetIds,
  onSetBlur,
  blurOff,
}: FlatnessControlsProps) {
  const depthActive = detectStep(
    DEPTH_STEPS,
    DEPTH_TOKEN_IDS,
    overrideValue,
    baselineValue,
    depthOverrides,
  );
  const glowActive = detectStep(
    GLOW_STEPS,
    GLOW_TOKEN_IDS,
    overrideValue,
    baselineValue,
    glowOverrides,
  );
  const cornerActive = detectStep(
    CORNER_STEPS,
    CORNER_TOKEN_IDS,
    overrideValue,
    baselineValue,
    cornerOverrides,
  );

  const pickDepth = (step: FlatnessStep) => {
    if (step.factor === null) onResetIds(DEPTH_TOKEN_IDS);
    else onApplyMap(depthOverrides(baselineValue, step.factor));
  };
  const pickGlow = (step: FlatnessStep) => {
    if (step.factor === null) onResetIds(GLOW_TOKEN_IDS);
    else onApplyMap(glowOverrides(baselineValue, step.factor));
  };
  const pickCorner = (step: FlatnessStep) => {
    if (step.factor === null) onResetIds(CORNER_TOKEN_IDS);
    else onApplyMap(cornerOverrides(baselineValue, step.factor));
  };

  return (
    <section className={styles.group} aria-label="Flatness">
      <div className={styles.essentialHead}>
        <span className={styles.groupTitle}>Flatness</span>
      </div>
      <p className={styles.essentialBlurb}>
        How much depth the site wears — shadows, ambient glow, frosted-glass blur, and how
        round the corners are. Every color stays editable on top.
      </p>
      <AxisRow label="Shadow depth" steps={DEPTH_STEPS} activeId={depthActive} onPick={pickDepth} />
      <AxisRow label="Ambient glow" steps={GLOW_STEPS} activeId={glowActive} onPick={pickGlow} />
      <AxisRow label="Corners" steps={CORNER_STEPS} activeId={cornerActive} onPick={pickCorner} />
      <div className={AXIS_ROW} role="group" aria-label="Backdrop blur">
        <span className={AXIS_LABEL}>Backdrop blur</span>
        <div className="flex gap-1">
          <PanelChip active={!blurOff} onClick={() => onSetBlur(false)}>
            On
          </PanelChip>
          <PanelChip active={blurOff} onClick={() => onSetBlur(true)}>
            Off
          </PanelChip>
        </div>
      </div>
    </section>
  );
}

export { BLUR_TOKEN_ID };
