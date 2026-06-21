import { useEffect } from "preact/hooks";

import { MANTRA_ENTRIES, MANTRA_VISUAL_STRANDS } from "../shared/mantras";

const RAIN_COLUMN_COUNT = 24;
const RAIN_REPEAT_COUNT = 9;
const FLOW_HALO_CHARACTER_LIMIT = 72;

type SpiralTrack = {
  id: number;
  startRadius: number;
  endRadius: number;
  turns: number;
  phase: number;
  repeat: number;
  symbols: number;
};

const SPIRAL_TRACKS: SpiralTrack[] = [
  { id: 0, startRadius: 86, endRadius: 496, turns: 2.36, phase: -108, repeat: 6, symbols: 5 },
  { id: 1, startRadius: 94, endRadius: 490, turns: 2.5, phase: -80, repeat: 6, symbols: 4 },
  { id: 2, startRadius: 102, endRadius: 496, turns: 2.64, phase: -52, repeat: 6, symbols: 5 },
  { id: 3, startRadius: 110, endRadius: 488, turns: 2.78, phase: -24, repeat: 6, symbols: 4 },
  { id: 4, startRadius: 118, endRadius: 496, turns: 2.92, phase: 4, repeat: 6, symbols: 5 },
  { id: 5, startRadius: 90, endRadius: 490, turns: 3.06, phase: 32, repeat: 6, symbols: 4 },
  { id: 6, startRadius: 98, endRadius: 496, turns: 3.2, phase: 60, repeat: 6, symbols: 5 },
  { id: 7, startRadius: 106, endRadius: 488, turns: 3.34, phase: 88, repeat: 6, symbols: 4 },
  { id: 8, startRadius: 114, endRadius: 496, turns: 2.44, phase: 116, repeat: 6, symbols: 5 },
  { id: 9, startRadius: 122, endRadius: 490, turns: 2.58, phase: 144, repeat: 6, symbols: 4 },
  { id: 10, startRadius: 92, endRadius: 496, turns: 2.72, phase: 172, repeat: 6, symbols: 5 },
  { id: 11, startRadius: 100, endRadius: 488, turns: 2.86, phase: 200, repeat: 6, symbols: 4 },
  { id: 12, startRadius: 108, endRadius: 496, turns: 3, phase: 228, repeat: 6, symbols: 5 },
  { id: 13, startRadius: 116, endRadius: 490, turns: 3.14, phase: 256, repeat: 6, symbols: 4 },
];

const DENSE_MANTRA_TEXT = MANTRA_VISUAL_STRANDS.map((entry) => entry.tibetan).join("  ");

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

function spiralPoint(track: SpiralTrack, progress: number) {
  const radius = track.startRadius + (track.endRadius - track.startRadius) * progress;
  const angle = track.phase + progress * track.turns * 360;
  const radians = angle * (Math.PI / 180);

  return {
    angle,
    x: Number((500 + Math.cos(radians) * radius).toFixed(3)),
    y: Number((500 + Math.sin(radians) * radius).toFixed(3)),
  };
}

function spiralPathD(track: SpiralTrack) {
  const steps = 180;
  const points = Array.from({ length: steps + 1 }, (_, index) => spiralPoint(track, index / steps));
  const firstPoint = points[0];
  const restPoints = points.slice(1);

  if (!firstPoint) {
    return "";
  }

  return `M ${firstPoint.x} ${firstPoint.y} ${restPoints.map((point) => `L ${point.x} ${point.y}`).join(" ")}`;
}

function escapeSvg(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildSpiralSheetSvg() {
  const spiralStrands = SPIRAL_TRACKS.map((_, index) => MANTRA_VISUAL_STRANDS[index % MANTRA_VISUAL_STRANDS.length]);
  const guidePaths = SPIRAL_TRACKS.map((track, index) => {
    const stroke = index % 2 === 0 ? "rgba(248,239,225,.08)" : "rgba(185,147,255,.09)";

    return `<path d="${spiralPathD(track)}" fill="none" stroke="${stroke}" stroke-width=".8"/>`;
  }).join("");
  const textPaths = SPIRAL_TRACKS.map((track, index) => {
    const strand = spiralStrands[index];
    const pathId = `spiral-track-${track.id}`;
    const text = `${strand.tibetan}  ${DENSE_MANTRA_TEXT}  `.repeat(track.repeat);
    const fontSize = index % 6 < 2 ? 14 : 12;
    const opacity = index % 6 >= 4 ? 0.74 : 0.88;
    const glyphs = strand.seedSyllablesTibetan;
    const symbols = Array.from({ length: track.symbols }, (_, symbolIndex) => {
      const progress = (symbolIndex + 1) / (track.symbols + 1);
      const { angle, x, y } = spiralPoint(track, progress);
      const glyph = glyphs[symbolIndex % glyphs.length];

      return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${angle + 88} ${x} ${y})" fill="${escapeSvg(strand.colors.secondary)}" font-size="24" font-weight="780" opacity=".9" paint-order="stroke fill" stroke="rgba(10,7,16,.76)" stroke-width="2">${escapeSvg(glyph)}</text>`;
    }).join("");

    return `<path id="${pathId}" d="${spiralPathD(track)}" fill="none"/><text fill="${escapeSvg(strand.colors.primary)}" font-size="${fontSize}" font-weight="760" opacity="${opacity}" paint-order="stroke fill" stroke="rgba(10,7,16,.72)" stroke-width="1.35"><textPath href="#${pathId}" startOffset="${(index * 11) % 100}%">${escapeSvg(text)}</textPath></text>${symbols}`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><g font-family="Noto Sans Tibetan, Kailasa, Himalaya, Microsoft Himalaya, serif">${guidePaths}${textPaths}</g></svg>`;
}

const SPIRAL_SHEET_SRC = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(buildSpiralSheetSvg())}`;

function ConcentricMandala() {
  const active = MANTRA_VISUAL_STRANDS[0];

  return (
    <div className="orbit-stage" aria-label="Single full-screen dense spiral field of Tibetan mantras">
      <img className="spiral-sheet spiral-sheet-main" src={SPIRAL_SHEET_SRC} alt="" aria-hidden="true" draggable={false} />
      <img className="spiral-sheet spiral-sheet-echo" src={SPIRAL_SHEET_SRC} alt="" aria-hidden="true" draggable={false} />
      <svg className="core-svg" viewBox="0 0 1000 1000" role="img" aria-label="Dense Tibetan mantra spiral field">
        <defs>
          <radialGradient id="coreGlow" cx="50%" cy="50%" r="58%">
            <stop offset="0%" stop-color={active.colors.primary} stop-opacity="0.34" />
            <stop offset="46%" stop-color={active.colors.secondary} stop-opacity="0.12" />
            <stop offset="100%" stop-color="transparent" />
          </radialGradient>
        </defs>
        <circle cx="500" cy="500" r="492" fill="url(#coreGlow)" />
        <g className="orbit-core" style={`--primary:${active.colors.primary};--secondary:${active.colors.secondary}`}>
          <circle className="orbit-core-halo" cx="500" cy="500" r="128" />
          <circle className="orbit-core-ring" cx="500" cy="500" r="86" />
          <text className="orbit-core-mark" x="500" y="528" text-anchor="middle">
            ཧཱུྃ
          </text>
        </g>
      </svg>
    </div>
  );
}

function MantraRain() {
  return (
    <div className="mantra-rain" aria-hidden="true">
      {MANTRA_RAIN_COLUMNS.map((column) => (
        <div className="rain-column" key={column.id} style={`--rain-duration:${column.duration};--rain-delay:${column.delay}`}>
          <span lang="bo">{column.text}</span>
        </div>
      ))}
    </div>
  );
}

function SwapHalo() {
  return (
    <div className="swap-halo" aria-hidden="true" lang="bo">
      {MANTRA_FLOW_CHARACTERS.map((char, index) => (
        <span
          key={`${char}-${index}`}
          className="swap-char"
          style={`--swap-angle:${(360 / MANTRA_FLOW_CHARACTERS.length) * index}deg;--swap-counter-angle:${(-360 / MANTRA_FLOW_CHARACTERS.length) * index}deg;--swap-distance:${34 + (index % 6) * 3}vmin;--swap-delay:${index * -0.42}s;--swap-duration:${14 + (index % 9) * 0.8}s`}
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
      className="floating-talisman"
      aria-hidden="true"
      lang="bo"
      style={`--talisman-primary:${phagpa.colors.primary};--talisman-secondary:${phagpa.colors.secondary}`}
    >
      <span>{phagpa.tibetan.split("།")[0]}།</span>
      <i />
      <span>{phagpa.seedSyllablesTibetan.join(" ")}</span>
    </div>
  );
}

export function App() {
  useEffect(() => {
    document.title = "Mantra Vision Mandala";
  }, []);

  return (
    <main className="mantra-shell">
      <style>{`
        :root { color-scheme: dark; }
        body { margin: 0; background: #100812; }
        @keyframes orbit-spin { to { transform: rotate(360deg); } }
        @keyframes orbit-spin-reverse { to { transform: rotate(-360deg); } }
        @keyframes mandala-orbit { to { transform: rotate(360deg); } }
        @keyframes mandala-counter-orbit { to { transform: rotate(-360deg); } }
        @keyframes spiral-breathe { 0%,100% { opacity: .68; } 48%,58% { opacity: 1; } }
        @keyframes spiral-breathe-reverse { 0%,100% { opacity: .96; } 44%,62% { opacity: .58; } }
        @keyframes field-breathe { from { transform: rotate(-2deg) scale(1); } to { transform: rotate(2deg) scale(1.035); } }
        @keyframes rain-fall { from { transform: translateY(-30%); } to { transform: translateY(10%); } }
        @keyframes swap-char { 0%,100% { opacity: .08; } 38%,62% { opacity: .54; } 50% { opacity: .64; } }
        @keyframes talisman-drift {
          0% { transform: translate(-50%, -50%) translate(-35vmin, 31vmin) rotate(-3deg); }
          25% { transform: translate(-50%, -50%) translate(-40vmin, -24vmin) rotate(2deg); }
          50% { transform: translate(-50%, -50%) translate(34vmin, -31vmin) rotate(3deg); }
          75% { transform: translate(-50%, -50%) translate(41vmin, 23vmin) rotate(-2deg); }
          100% { transform: translate(-50%, -50%) translate(-35vmin, 31vmin) rotate(-3deg); }
        }
        .mantra-shell {
          --tibetan: "Noto Sans Tibetan", "Kailasa", "Himalaya", "Microsoft Himalaya", serif;
          min-height: 100dvh;
          overflow-x: hidden;
          background:
            radial-gradient(circle at 50% 44%, rgba(103, 45, 92, 0.33), transparent 34%),
            radial-gradient(circle at 16% 12%, rgba(240,199,111,0.16), transparent 28%),
            radial-gradient(circle at 84% 18%, rgba(185,147,255,0.16), transparent 32%),
            linear-gradient(145deg,#1a0e19,#0a0710 68%);
          color: #f8efe1;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .mantra-field { position: relative; min-height: 100dvh; overflow: hidden; isolation: isolate; }
        .mantra-field::before {
          position: absolute;
          inset: -18vmax;
          z-index: -2;
          background:
            conic-gradient(from 24deg at 50% 50%, transparent, rgba(240,199,111,0.13), transparent, rgba(239,118,185,0.12), transparent),
            repeating-radial-gradient(circle at 50% 50%, rgba(248,239,225,0.08) 0 1px, transparent 1px 6.5vmin);
          animation: field-breathe 36s ease-in-out infinite alternate;
          content: "";
          opacity: .72;
          will-change: transform;
        }
        .screen-reader-title {
          position: absolute;
          width: 1px;
          height: 1px;
          margin: -1px;
          padding: 0;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
        .constellation {
          position: relative;
          display: grid;
          width: 100vw;
          height: 100dvh;
          min-height: 100dvh;
          place-items: center;
          overflow: hidden;
          contain: layout paint;
        }
        .mantra-rain {
          position: absolute;
          inset: -12dvh 0;
          z-index: 0;
          display: grid;
          grid-template-columns: repeat(24, minmax(0, 1fr));
          pointer-events: none;
          opacity: .22;
          mask-image: radial-gradient(circle at 50% 50%, black 0 44%, transparent 78%);
          contain: layout paint style;
        }
        .rain-column {
          color: rgba(157, 221, 158, .25);
          contain: layout paint style;
          font-family: var(--tibetan);
          font-size: clamp(.72rem, 1.15vw, 1.08rem);
          font-weight: 760;
          line-height: 1.1;
          text-orientation: mixed;
          text-shadow: 0 0 16px rgba(129, 215, 209, .16);
          transform: translateY(-34%);
          animation: rain-fall var(--rain-duration) ease-in-out infinite alternate;
          animation-delay: var(--rain-delay);
          will-change: transform;
          writing-mode: vertical-rl;
        }
        .rain-column:nth-child(3n) { color: rgba(240,199,111,.23); }
        .rain-column:nth-child(4n) { color: rgba(185,147,255,.2); }
        .orbit-stage {
          position: relative;
          z-index: 2;
          aspect-ratio: 1;
          width: min(142vmin, calc(100vw + 18rem), calc(100dvh + 28rem));
          max-width: none;
          contain: layout paint style;
          isolation: isolate;
        }
        .orbit-stage::before {
          position: absolute;
          inset: 7%;
          z-index: -1;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(185,147,255,.16), transparent 68%);
          content: "";
          pointer-events: none;
        }
        .spiral-sheet,
        .core-svg {
          position: absolute;
          inset: 0;
          display: block;
          width: 100%;
          height: 100%;
          pointer-events: none;
          user-select: none;
        }
        .spiral-sheet {
          z-index: 1;
          transform-origin: center;
          will-change: transform;
        }
        .spiral-sheet-main { animation: mandala-orbit 96s linear infinite; }
        .spiral-sheet-echo { z-index: 0; opacity: .26; animation: mandala-counter-orbit 164s linear infinite; }
        .core-svg { z-index: 2; overflow: visible; }
        .orbit-guide { fill: none; stroke: rgba(248,239,225,.12); stroke-width: 1; }
        .spiral-guide { fill: none; stroke: rgba(248,239,225,.07); stroke-width: .8; }
        .spiral-guide:nth-child(2n) { stroke: rgba(185,147,255,.08); }
        .orbit-layer { animation: spiral-breathe var(--orbit-duration) ease-in-out infinite; animation-delay: var(--orbit-delay); will-change: opacity; }
        .orbit-layer-reverse { animation-name: spiral-breathe-reverse; }
        .orbit-ring-text, .orbit-symbol, .orbit-core-mark, .swap-char, .floating-talisman {
          font-family: var(--tibetan);
          letter-spacing: 0;
          text-transform: none;
        }
        .orbit-ring-text {
          fill: var(--primary);
          font-size: clamp(12px, 1.58vmin, 23px);
          font-weight: 760;
          paint-order: stroke fill;
          stroke: rgba(10,7,16,.72);
          stroke-width: 2px;
        }
        .spiral-text {
          font-size: clamp(8.5px, 1.08vmin, 16px);
          opacity: .86;
          stroke-width: 1.35px;
        }
        .orbit-ring-text-1, .orbit-ring-text-2 { font-size: clamp(16px, 2.05vmin, 30px); }
        .spiral-text.orbit-ring-text-1, .spiral-text.orbit-ring-text-2 { font-size: clamp(9.5px, 1.22vmin, 17px); }
        .orbit-ring-text-5, .orbit-ring-text-6 { opacity: .76; }
        .spiral-text.orbit-ring-text-5, .spiral-text.orbit-ring-text-6 { opacity: .72; }
        .orbit-symbol {
          fill: var(--secondary);
          font-size: clamp(18px, 2.4vmin, 34px);
          font-weight: 780;
          opacity: .86;
          paint-order: stroke fill;
          stroke: rgba(10,7,16,.76);
          stroke-width: 2px;
        }
        .orbit-core { filter: none; }
        .orbit-core-halo { fill: rgba(240,199,111,.1); stroke: var(--primary); stroke-opacity: .54; stroke-width: 1.4; }
        .orbit-core-ring { fill: none; stroke: var(--secondary); stroke-opacity: .46; stroke-width: 1.6; }
        .orbit-core-mark {
          fill: var(--primary);
          font-size: clamp(90px, 14vmin, 152px);
          font-weight: 780;
          paint-order: stroke fill;
          stroke: rgba(10,7,16,.76);
          stroke-width: 3px;
        }
        .swap-halo { position: absolute; inset: 0; z-index: 3; contain: layout paint style; pointer-events: none; }
        .swap-char {
          position: absolute;
          top: 50%;
          left: 50%;
          color: rgba(248,239,225,.56);
          font-size: clamp(1rem, 2.2vmin, 2rem);
          font-weight: 760;
          opacity: 0;
          text-shadow: 0 0 20px rgba(240,199,111,.2);
          transform: rotate(var(--swap-angle)) translateY(calc(var(--swap-distance) * -1)) rotate(var(--swap-counter-angle)) scale(.72);
          animation: swap-char var(--swap-duration) ease-in-out infinite;
          animation-delay: var(--swap-delay);
          will-change: opacity, transform;
        }
        .floating-talisman {
          position: absolute;
          z-index: 1;
          left: 50%;
          top: 50%;
          display: grid;
          width: min(30rem, 42vw);
          max-width: calc(100vw - 2rem);
          gap: .75rem;
          justify-items: center;
          padding: clamp(.9rem,1.8vw,1.35rem) clamp(1rem,2.4vw,1.8rem);
          border: 1px solid color-mix(in srgb, var(--talisman-primary) 46%, transparent);
          border-radius: .5rem;
          background: linear-gradient(135deg, rgba(49,31,24,.86), rgba(24,14,26,.72));
          box-shadow: 0 0 54px color-mix(in srgb, var(--talisman-primary) 18%, transparent);
          color: rgba(248,239,225,.74);
          font-size: clamp(.82rem,1.55vw,1.38rem);
          font-weight: 760;
          line-height: 1.35;
          text-align: center;
          opacity: .58;
          transform: translate(-50%, -50%) translate(-35vmin, 31vmin) rotate(-3deg);
          animation: talisman-drift 44s ease-in-out infinite;
          animation-delay: var(--talisman-delay, 0s);
          contain: layout paint style;
          will-change: transform;
        }
        .floating-talisman i { display: block; width: min(18rem,72%); height: 1px; background: linear-gradient(90deg, transparent, var(--talisman-primary), transparent); }
        .source-band {
          display: grid;
          gap: 1rem;
          padding: clamp(1.25rem, 3vw, 2.5rem) clamp(1rem, 4vw, 4rem);
          border-top: 1px solid rgba(240,199,111,.13);
          background: #0b0710;
          color: rgba(248,239,225,.74);
        }
        .source-band p { margin: 0; max-width: 72ch; font-size: .92rem; line-height: 1.7; }
        .explanation-list { display: grid; gap: .85rem; grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr)); }
        .explanation-list article { display: grid; gap: .35rem; }
        .explanation-list h2, .explanation-list p { margin: 0; }
        .explanation-list h2 { color: #f0c76f; font-size: .75rem; font-weight: 760; letter-spacing: .18em; text-transform: uppercase; }
        .explanation-list p { color: rgba(248,239,225,.72); font-size: .86rem; line-height: 1.6; }
        .source-links { display: flex; flex-wrap: wrap; gap: .55rem; }
        .source-links a { color: #f0c76f; font-size: .8rem; text-underline-offset: .18em; }
        @media (max-width: 920px) {
          .constellation { display: flex; align-items: center; justify-content: center; }
          .mantra-rain { grid-template-columns: repeat(14, minmax(0,1fr)); opacity: .16; }
          .rain-column:nth-child(n + 15) { display: none; }
          .orbit-stage { flex: 0 0 auto; width: min(156vmin, calc(100vw + 15rem), calc(100dvh + 12rem)); }
          .floating-talisman { width: min(20rem,70vw); font-size: clamp(.72rem,3.2vw,1rem); transform: translate(-50%, -50%) translate(-12vmin, 31vmin) rotate(-2deg); }
          .swap-char { font-size: clamp(.85rem,3.8vmin,1.3rem); }
        }
        @media (prefers-reduced-motion: reduce) {
          .mantra-field::before, .rain-column, .spiral-sheet, .orbit-layer, .swap-char, .floating-talisman { animation: none; }
        }
      `}</style>
      <section className="mantra-field" aria-labelledby="title">
        <div className="screen-reader-title">
          <p>Thongdrol field</p>
          <h1 id="title">Mantras that liberate upon seeing</h1>
          <p>
            Tibetan-script renderings of source-attributed Tibetan Buddhist mantra forms. Claims are lineage and devotional teachings, not guaranteed effects.
          </p>
        </div>
        <div className="constellation" aria-label="One full-screen field of concentric Tibetan mantra visualizations">
          <MantraRain />
          <ConcentricMandala />
          <SwapHalo />
          <FloatingTalisman />
        </div>
      </section>
      <section className="source-band" aria-label="Sources and respectful use">
        <p>
          Self-authored schematic SVGs using Tibetan-script renderings from source-attributed mantra forms. Official lineage artwork remains linked at the source.
        </p>
        <div className="explanation-list">
          {MANTRA_VISUAL_STRANDS.map((entry) => (
            <article key={entry.id}>
              <h2>{entry.shortTitle}</h2>
              <p>{entry.traditionalClaim}</p>
            </article>
          ))}
        </div>
        <div className="source-links">
          {MANTRA_VISUAL_STRANDS.flatMap((entry) =>
            entry.sources.map((source) => (
              <a key={`${entry.id}-${source.url}`} href={source.url} target="_blank" rel="noreferrer">
                {entry.shortTitle}: {source.organization}
              </a>
            )),
          )}
        </div>
      </section>
    </main>
  );
}
