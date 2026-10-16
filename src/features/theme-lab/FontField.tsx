"use client";

import { PanelBadge, PanelButton } from "./panelKit";
import { FontSwatch } from "./CatalogViews";
import { FONT_CHOICES, fontChoiceForValue, type FontChoice } from "./paletteTokensFonts";
import styles from "./ThemeLab.module.css";

interface FontFieldProps {
  initial: string;
  label: string;
  onChange: (next: string) => void;
}

export function FontField({ initial, label, onChange }: FontFieldProps) {
  const selected: FontChoice = fontChoiceForValue(initial);

  return (
    <div className={styles.lengthField}>
      <p
        className="theme-text-secondary m-0 truncate text-[0.9375rem] leading-snug"
        style={{ fontFamily: selected.stack || "inherit" }}
      >
        Handbook of Psychoactive Substances: 25 mg, oral
      </p>
      <p className={styles.fieldCaption}>
        Face <span className={styles.alphaValue}>{selected.label}</span>
      </p>
      <div className="flex flex-col gap-1" role="group" aria-label={`${label}: face`}>
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
              <FontSwatch value={choice.stack} />
              <span className="flex-1 truncate">{choice.label}</span>
              {choice.faces ? <PanelBadge variant="outline">downloads</PanelBadge> : null}
            </PanelButton>
          );
        })}
      </div>
      <p className={styles.editorHint}>{selected.hint}</p>
    </div>
  );
}
