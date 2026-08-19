"use client";

import { PanelBadge, PanelButton } from "./panelKit";
import { FontSwatch } from "./CatalogViews";
import { FONT_CHOICES, fontChoiceForValue, type FontChoice } from "./paletteTokensFonts";
import styles from "./ThemeLab.module.css";

/**
 * The Theme Lab's font control: an enumerated list of faces, not a text field.
 *
 * A font is the one theme value where a free-text box would be a trap — a name
 * the visitor's machine happens to have, that nobody they share the theme with
 * does. So the choice is closed, and each row is a real face the site can
 * actually render.
 *
 * Every row is set in the face it offers, which makes this list its own
 * specimen sheet. That costs nothing: a face whose `@font-face` has not been
 * registered yet simply falls through its own stack to the system sans, so the
 * rows for faces you have never picked are previews *of the fallback* until you
 * pick one — which is precisely the promise that nothing downloads until you do.
 *
 * The contract mirrors {@link ColorField} and {@link LengthField}: an `initial`
 * value plus an `onChange`, remounted via `key` when the selection changes.
 * `onChange` emits the CSS stack, or an empty string for "theme default" —
 * which the panel turns into a reset rather than a written value, so a theme
 * that ships its own face keeps it.
 */

interface FontFieldProps {
  /** Current CSS value of the token. Remount via `key` to rebind. */
  initial: string;
  /** Which token this is picking for — only used for the accessible group name. */
  label: string;
  onChange: (next: string) => void;
}

export function FontField({ initial, label, onChange }: FontFieldProps) {
  const selected: FontChoice = fontChoiceForValue(initial);

  return (
    <div className={styles.lengthField}>
      {/* A specimen line above the list, in the face currently in play, so the
          choice is judged on a run of text and not on two letters. */}
      <p
        className="theme-text-secondary m-0 truncate text-[0.9375rem] leading-snug"
        style={{ fontFamily: selected.stack || "inherit" }}
      >
        Handbook of Psychoactive Substances — 25 mg, oral
      </p>
      <p className={styles.fieldCaption}>
        Face <span className={styles.alphaValue}>{selected.label}</span>
      </p>
      <div className="flex flex-col gap-1" role="group" aria-label={`${label} — face`}>
        {FONT_CHOICES.map((choice) => {
          const active = choice.id === selected.id;
          return (
            <PanelButton
              key={choice.id}
              variant={active ? "default" : "outline"}
              aria-pressed={active}
              title={choice.hint}
              className="w-full justify-start gap-2 text-left font-normal"
              onClick={() => onChange(choice.stack)}
            >
              {/* The catalog row's own chip, imported rather than re-declared —
                  a face's specimen should look the same in both places. */}
              <FontSwatch value={choice.stack} />
              <span className="flex-1 truncate">{choice.label}</span>
              {/* Said out loud rather than implied: this is the one choice on
                  the list that costs a download, and the visitor is the person
                  deciding whether to spend it. */}
              {choice.faces ? <PanelBadge variant="outline">downloads</PanelBadge> : null}
            </PanelButton>
          );
        })}
      </div>
      <p className={styles.editorHint}>{selected.hint}</p>
    </div>
  );
}
