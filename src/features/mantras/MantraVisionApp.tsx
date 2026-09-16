import type { CSSProperties } from "react";

import { MantraOrbitField } from "./MantraGlyphs";
import { MANTRA_ENTRIES, MANTRA_VISUAL_STRANDS, SOURCE_LEDGER } from "./mantraData";

const RAIN_COLUMN_COUNT = 24;
const RAIN_REPEAT_COUNT = 9;
const FLOW_HALO_CHARACTER_LIMIT = 72;

const MANTRA_RAIN_COLUMNS = Array.from({ length: RAIN_COLUMN_COUNT }, (_, index) => {
  const strand = MANTRA_VISUAL_STRANDS[index % MANTRA_VISUAL_STRANDS.length];

  return {
    id: `${strand.id}-${index}`,
    text: Array.from({ length: RAIN_REPEAT_COUNT }, () => strand.tibetan).join("  "),
    duration: `${28 + (index % 7) * 4}s`,
    delay: `${index * -1.7}s`,
  };
});

const MANTRA_FLOW_CHARACTERS = Array.from(MANTRA_VISUAL_STRANDS.map((strand) => strand.tibetan).join("").replace(/\s/g, "")).slice(0, FLOW_HALO_CHARACTER_LIMIT);

function MantraRain() {
  return (
    <div className="mantra-rain" aria-hidden="true">
      {MANTRA_RAIN_COLUMNS.map((column, index) => (
        <div
          key={column.id}
          className="mantra-rain-column"
          style={
            {
              "--rain-index": index,
              "--rain-duration": column.duration,
              "--rain-delay": column.delay,
            } as CSSProperties
          }
        >
          <span lang="bo">{column.text}</span>
        </div>
      ))}
    </div>
  );
}

function MantraSwapHalo() {
  return (
    <div className="mantra-swap-halo" aria-hidden="true" lang="bo">
      {MANTRA_FLOW_CHARACTERS.map((char, index) => (
        <span
          key={`${char}-${index}`}
          className="mantra-swap-char"
          style={
            {
              "--swap-angle": `${(360 / MANTRA_FLOW_CHARACTERS.length) * index}deg`,
              "--swap-counter-angle": `${(-360 / MANTRA_FLOW_CHARACTERS.length) * index}deg`,
              "--swap-distance": `${34 + (index % 6) * 3}vmin`,
              "--swap-delay": `${index * -0.42}s`,
              "--swap-duration": `${14 + (index % 9) * 0.8}s`,
            } as CSSProperties
          }
        >
          {char}
        </span>
      ))}
    </div>
  );
}

function FloatingTalisman() {
  const phagpa = MANTRA_ENTRIES.find((entry) => entry.id === "phagpa") ?? MANTRA_ENTRIES[0];

  return (
    <div
      className="mantra-floating-talisman"
      aria-hidden="true"
      style={
        {
          "--talisman-primary": phagpa.color.primary,
          "--talisman-secondary": phagpa.color.secondary,
        } as CSSProperties
      }
      lang="bo"
    >
      <span>{phagpa.tibetan.split("།")[0]}།</span>
      <i />
      <span>{phagpa.seedSyllablesTibetan.join(" ")}</span>
    </div>
  );
}

export function MantraVisionApp() {
  return (
    <main id="main-content" className="mantra-experience mantra-immersive" tabIndex={-1}>
      <section className="mantra-field" aria-labelledby="mantra-title">
        <div className="mantra-field-aura" aria-hidden="true" />
        <div className="mantra-screen-reader-title">
          <p>Thongdrol field</p>
          <h1 id="mantra-title">Mantras that liberate upon seeing</h1>
          <p>
            Tibetan-script renderings of source-attributed Tibetan Buddhist mantra forms. Claims are presented as lineage and devotional teachings, not as guaranteed effects.
          </p>
        </div>

        <div className="mantra-constellation" aria-label="One full-screen field of concentric Tibetan mantra visualizations">
          <MantraRain />
          <MantraOrbitField />
          <MantraSwapHalo />
          <FloatingTalisman />
        </div>
      </section>

      <section className="mantra-source-band" aria-label="Sources and respectful use">
        <p>
          The app uses self-authored schematic SVGs and Tibetan-script renderings from source-attributed mantra forms; official lineage artwork remains linked at the source.
        </p>
        <div className="mantra-explanation-list">
          {MANTRA_VISUAL_STRANDS.map((entry) => (
            <article key={entry.id}>
              <h2>{entry.shortTitle}</h2>
              <p>{entry.traditionalClaim}</p>
            </article>
          ))}
        </div>
        <div className="mantra-source-links">
          {SOURCE_LEDGER.map((source) => (
            <a key={`${source.mantraTitle}-${source.url}`} href={source.url} target="_blank" rel="noreferrer">
              {source.mantraTitle}: {source.organization}
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
