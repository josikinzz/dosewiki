import type { CSSProperties } from "react";
import { MANTRA_VISUAL_STRANDS } from "./mantraData";


// The decorative spiral sheet is generated to a static file
// (npm run generate:mantra-spiral) and served once, instead of being inlined twice
// as a ~333KB data: URI in the prerendered HTML. Builder lives in spiralSheet.ts.
const SPIRAL_SHEET_SRC = "/mantras/spiral-sheet.svg";


export function MantraOrbitField() {
  const activeStrand = MANTRA_VISUAL_STRANDS[0];

  return (
    <div className="mantra-orbit-stage" aria-label="Single full-screen dense spiral field of Tibetan mantras">
      <img className="mantra-spiral-sheet mantra-spiral-sheet-main" src={SPIRAL_SHEET_SRC} alt="" aria-hidden="true" draggable={false} />
      <img className="mantra-spiral-sheet mantra-spiral-sheet-echo" src={SPIRAL_SHEET_SRC} alt="" aria-hidden="true" draggable={false} />
      <svg className="mantra-core-svg" viewBox="0 0 1000 1000" role="img" aria-labelledby="orbit-title orbit-desc">
        <title id="orbit-title">Dense Tibetan mantra spiral field</title>
        <desc id="orbit-desc">
          Multiple source-attributed Tibetan mantra renderings move as a dense full-screen spiral with seed syllables and a faint mantra-rain background.
        </desc>
        <defs>
          <radialGradient id="mantraOrbitCoreGlow" cx="50%" cy="50%" r="58%">
            <stop offset="0%" stopColor={activeStrand.color.primary} stopOpacity="0.34" />
            <stop offset="46%" stopColor={activeStrand.color.secondary} stopOpacity="0.12" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
        <circle cx="500" cy="500" r="492" fill="url(#mantraOrbitCoreGlow)" />
        <g className="mantra-orbit-core" style={{ "--mantra-primary": activeStrand.color.primary, "--mantra-secondary": activeStrand.color.secondary } as CSSProperties}>
          <circle className="mantra-orbit-core-halo" cx="500" cy="500" r="128" />
          <circle className="mantra-orbit-core-ring" cx="500" cy="500" r="86" />
          <text className="mantra-orbit-core-mark" x="500" y="528" textAnchor="middle">
            ཧཱུྃ
          </text>
        </g>
      </svg>
    </div>
  );
}
