"use client";

import { useState } from "react";
import { Icon } from "@/components/common/Icon";
import { PANEL_ICON, PanelBadge, PanelButton, PanelIconButton, PanelInput } from "./panelKit";
import { ThemeCard } from "./ThemeCard";
import {
  MAX_CUSTOM_THEMES,
  MAX_CUSTOM_THEME_NAME,
  canSaveCustomTheme,
  customThemeRef,
  customThemeSwatch,
  deleteCustomThemeSlot,
  renameCustomThemeSlot,
  saveCurrentLookAsCustomTheme,
  suggestCustomThemeName,
} from "./customThemes";
import type { ThemeLabState } from "./paletteLabTheme";
import type { ThemeRef } from "./paletteLabStorage";
import styles from "./PaletteLab.module.css";

/**
 * The visitor's own themes, in the gallery beside the shipped ones.
 *
 * Save-as captures the look being worn — the palette merged with the tweaks on
 * top of it, both themes at once — under a name, and from then on the slot is
 * an ordinary gallery entry: one tap to wear, its own edits, its own export.
 *
 * Rename and delete are per-card and never one stray tap away: renaming opens a
 * field, and deleting asks first. Both replace the card's own body while they
 * are open, so the panel never grows a mode the visitor cannot see they are in.
 *
 * Lives beside the panel rather than inside it because `PaletteLab.tsx` sits
 * against its LOC budget.
 */

/**
 * Move focus into a field the moment it appears.
 *
 * A callback ref rather than `autoFocus`: the accessibility objection to that
 * prop is about focus moving without the visitor asking. Here the field only
 * exists because they just pressed "Save as my theme" or "Rename", so landing
 * in it is the continuation of their own action — and without it a keyboard
 * visitor is left tabbing back through the gallery to reach the field they
 * opened.
 */
function focusOnMount(element: HTMLInputElement | null) {
  element?.focus();
}

/** Escape inside a slot form cancels the form, not the whole panel — the panel's
 *  own Escape handler sits above this and would otherwise close the lab out from
 *  under a half-typed name. */
function cancelOnEscape(cancel: () => void) {
  return (event: React.KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    cancel();
  };
}

interface MyThemesProps {
  themeState: ThemeLabState;
  /** How many tokens the visitor has changed on the theme being worn. */
  changedCount: number;
  onSelect: (ref: ThemeRef) => void;
  /** Bump the panel's editor after a save/rename/delete changed the look. */
  onChanged: () => void;
}

export function MyThemes({ themeState, changedCount, onSelect, onChanged }: MyThemesProps) {
  const { customThemes, activeThemeRef } = themeState;
  /** Non-null while the save field is open; holds the name being typed. */
  const [draftName, setDraftName] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const atCap = !canSaveCustomTheme(themeState);

  const closeAll = () => {
    setDraftName(null);
    setRenamingId(null);
    setConfirmingId(null);
  };

  const save = () => {
    saveCurrentLookAsCustomTheme(draftName ?? "");
    closeAll();
    onChanged();
  };

  const rename = (id: string) => {
    renameCustomThemeSlot(id, renameDraft);
    setRenamingId(null);
  };

  const remove = (id: string) => {
    deleteCustomThemeSlot(id);
    closeAll();
    onChanged();
  };

  return (
    <section className={styles.group} aria-label="My themes">
      <div className={styles.essentialHead}>
        <span className={styles.groupTitle}>My themes</span>
        <PanelButton
          variant="secondary"
          disabled={atCap}
          title={
            atCap
              ? `You have the maximum of ${MAX_CUSTOM_THEMES} saved themes — delete one to save another.`
              : "Save the look you are wearing right now as your own theme"
          }
          onClick={() => {
            closeAll();
            setDraftName(suggestCustomThemeName(themeState));
          }}
        >
          <Icon icon="lucide:bookmark-plus" size={14} />
          <span>Save as my theme</span>
        </PanelButton>
      </div>

      {draftName !== null && (
        // The listener is scoped Escape handling, the same pattern the panel
        // itself documents: the alternative is the panel swallowing Escape and
        // closing the whole lab over a half-typed name.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <form
          className={styles.slotForm}
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
          onKeyDown={cancelOnEscape(closeAll)}
        >
          <PanelInput
            ref={focusOnMount}
            aria-label="Name for this theme"
            maxLength={MAX_CUSTOM_THEME_NAME}
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
          />
          <div className={styles.slotActions}>
            <PanelButton type="submit" className="flex-1 justify-center">
              <Icon icon="lucide:check" size={14} />
              <span>Save</span>
            </PanelButton>
            <PanelButton
              type="button"
              variant="outline"
              className="flex-1 justify-center"
              onClick={closeAll}
            >
              Cancel
            </PanelButton>
          </div>
        </form>
      )}

      {customThemes.length === 0 ? (
        <p className={styles.essentialBlurb}>
          Nothing saved yet. Wear a theme, tweak it however you like, then save it here — your own
          themes sit right beside the shipped ones.
        </p>
      ) : (
        <ul className={styles.presetList}>
          {customThemes.map((slot) => {
            const isActive = activeThemeRef.kind === "custom" && slot.id === activeThemeRef.id;
            const modified = isActive && changedCount > 0;

            if (renamingId === slot.id) {
              return (
                <li key={slot.id}>
                  {/* Scoped Escape, as on the save form above. */}
                  {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
                  <form
                    className={styles.slotForm}
                    onSubmit={(event) => {
                      event.preventDefault();
                      rename(slot.id);
                    }}
                    onKeyDown={cancelOnEscape(() => setRenamingId(null))}
                  >
                    <PanelInput
                      ref={focusOnMount}
                      aria-label={`New name for ${slot.name}`}
                      maxLength={MAX_CUSTOM_THEME_NAME}
                      value={renameDraft}
                      onChange={(event) => setRenameDraft(event.target.value)}
                    />
                    <div className={styles.slotActions}>
                      <PanelButton type="submit" className="flex-1 justify-center">
                        Save
                      </PanelButton>
                      <PanelButton
                        type="button"
                        variant="outline"
                        className="flex-1 justify-center"
                        onClick={() => setRenamingId(null)}
                      >
                        Cancel
                      </PanelButton>
                    </div>
                  </form>
                </li>
              );
            }

            if (confirmingId === slot.id) {
              return (
                <li key={slot.id}>
                  {/* Scoped Escape, as on the save form above — here it keeps
                      the theme instead of cancelling a name. */}
                  {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
                  <div
                    className={styles.slotForm}
                    role="group"
                    aria-label={`Delete ${slot.name}`}
                    onKeyDown={cancelOnEscape(() => setConfirmingId(null))}
                  >
                    <p className={styles.slotConfirm}>Delete “{slot.name}”? This can’t be undone.</p>
                    <div className={styles.slotActions}>
                      <PanelButton
                        variant="ghostDestructive"
                        className="flex-1 justify-center"
                        onClick={() => remove(slot.id)}
                      >
                        <Icon icon="lucide:trash-2" size={14} />
                        <span>Delete</span>
                      </PanelButton>
                      <PanelButton
                        variant="outline"
                        className="flex-1 justify-center"
                        onClick={() => setConfirmingId(null)}
                      >
                        Keep
                      </PanelButton>
                    </div>
                  </div>
                </li>
              );
            }

            return (
              <li key={slot.id}>
                <ThemeCard
                  name={slot.name}
                  swatch={customThemeSwatch(slot)}
                  active={isActive}
                  title="Your saved theme"
                  badge={
                    isActive ? (
                      <PanelBadge variant="default">
                        {modified ? "active · edited" : "active"}
                      </PanelBadge>
                    ) : undefined
                  }
                  onSelect={() => onSelect(customThemeRef(slot.id))}
                />
                <div className={styles.slotActions}>
                  <PanelIconButton
                    className={PANEL_ICON[13]}
                    aria-label={`Rename ${slot.name}`}
                    title={`Rename ${slot.name}`}
                    onClick={() => {
                      closeAll();
                      setRenameDraft(slot.name);
                      setRenamingId(slot.id);
                    }}
                  >
                    <Icon icon="lucide:pencil" size={13} />
                  </PanelIconButton>
                  <PanelIconButton
                    className={PANEL_ICON[13]}
                    aria-label={`Delete ${slot.name}`}
                    title={`Delete ${slot.name}`}
                    onClick={() => {
                      closeAll();
                      setConfirmingId(slot.id);
                    }}
                  >
                    <Icon icon="lucide:trash-2" size={13} />
                  </PanelIconButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
