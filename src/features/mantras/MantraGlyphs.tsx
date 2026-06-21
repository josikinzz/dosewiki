import type { CSSProperties } from "react";

import { MANTRA_VISUAL_STRANDS, type MantraEntry } from "./mantraData";

type GlyphProps = {
  entry: MantraEntry;
  density: number;
  active: boolean;
  reducedMotion: boolean;
};

const ringAngles = Array.from({ length: 24 }, (_, index) => index * 15);
const petalAngles = Array.from({ length: 16 }, (_, index) => index * 22.5);
const rayAngles = Array.from({ length: 36 }, (_, index) => index * 10);
const orbitSymbols = ["ཧཱུྃ", "ཨོཾ", "བྷྲཱུྃ", "ཨ", "མ", "སྭཱ་ཧཱ"];

type SpiralTrack = {
  id: number;
  startRadius: number;
  endRadius: number;
  turns: number;
  phase: number;
  repeat: number;
  symbols: number;
};

const spiralTracks: SpiralTrack[] = [
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

const denseMantraText = MANTRA_VISUAL_STRANDS.map((entry) => entry.tibetan).join("  ");

function svgNumber(value: number) {
  return Number(value.toFixed(3));
}

function escapeSvg(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSpiralSheetSvg() {
  const spiralStrands = spiralTracks.map((_, index) => MANTRA_VISUAL_STRANDS[index % MANTRA_VISUAL_STRANDS.length]);
  const guidePaths = spiralTracks
    .map((track, index) => {
      const stroke = index % 2 === 0 ? "oklch(88% 0.06 84 / 0.08)" : "oklch(80% 0.08 315 / 0.09)";

      return `<path d="${spiralPathD(track)}" fill="none" stroke="${stroke}" stroke-width="0.8"/>`;
    })
    .join("");
  const textPaths = spiralTracks
    .map((track, index) => {
      const strand = spiralStrands[index];
      const pathId = `spiral-track-${track.id}`;
      const text = `${strand.tibetan}  ${denseMantraText}  `.repeat(track.repeat);
      const fontSize = index % 6 < 2 ? 14 : 12;
      const opacity = index % 6 >= 4 ? 0.74 : 0.88;
      const glyphs = strand.seedSyllablesTibetan.length ? strand.seedSyllablesTibetan : orbitSymbols;
      const symbols = Array.from({ length: track.symbols }, (_, symbolIndex) => {
        const progress = (symbolIndex + 1) / (track.symbols + 1);
        const { angle, x, y } = spiralPoint(track, progress);
        const glyph = glyphs[symbolIndex % glyphs.length];

        return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${angle + 88} ${x} ${y})" fill="${escapeSvg(strand.color.secondary)}" font-size="24" font-weight="780" opacity="0.9" paint-order="stroke fill" stroke="oklch(7% 0.03 318 / 0.76)" stroke-width="2">${escapeSvg(glyph)}</text>`;
      }).join("");

      return `<path id="${pathId}" d="${spiralPathD(track)}" fill="none"/><text fill="${escapeSvg(strand.color.primary)}" font-size="${fontSize}" font-weight="760" opacity="${opacity}" paint-order="stroke fill" stroke="oklch(7% 0.03 318 / 0.68)" stroke-width="1.35"><textPath href="#${pathId}" startOffset="${(index * 11) % 100}%">${escapeSvg(text)}</textPath></text>${symbols}`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><g font-family="Noto Sans Tibetan, Kailasa, Himalaya, Microsoft Himalaya, serif">${guidePaths}${textPaths}</g></svg>`;
}

const spiralSheetSrc = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(buildSpiralSheetSvg())}`;

function glyphStyle(entry: MantraEntry, reducedMotion: boolean): CSSProperties {
  return {
    "--mantra-primary": entry.color.primary,
    "--mantra-secondary": entry.color.secondary,
    "--mantra-halo": entry.color.halo,
    animationPlayState: reducedMotion ? "paused" : "running",
  } as CSSProperties;
}

function RingText({
  id,
  radius,
  children,
  className,
}: {
  id: string;
  radius: number;
  children: string;
  className?: string;
}) {
  return (
    <>
      <defs>
        <path
          id={id}
          d={`M ${320 - radius} 320 a ${radius} ${radius} 0 1 1 ${radius * 2} 0 a ${radius} ${radius} 0 1 1 -${radius * 2} 0`}
        />
      </defs>
      <text className={className}>
        <textPath href={`#${id}`} startOffset="0">
          {children}
        </textPath>
      </text>
    </>
  );
}

function PolarText({
  angle,
  radius,
  children,
  className,
}: {
  angle: number;
  radius: number;
  children: string;
  className?: string;
}) {
  const radians = (angle - 90) * (Math.PI / 180);
  const x = svgNumber(320 + Math.cos(radians) * radius);
  const y = svgNumber(320 + Math.sin(radians) * radius);

  return (
    <text className={className} x={x} y={y} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${angle} ${x} ${y})`}>
      {children}
    </text>
  );
}

function Petals({ count = 16, radius = 108 }: { count?: number; radius?: number }) {
  return (
    <g className="mantra-petals">
      {Array.from({ length: count }, (_, index) => {
        const angle = (360 / count) * index;
        return (
          <ellipse
            key={angle}
            cx="320"
            cy={320 - radius}
            rx="17"
            ry="48"
            transform={`rotate(${angle} 320 320)`}
          />
        );
      })}
    </g>
  );
}

function WaterfallGlyph({ entry, density, reducedMotion }: GlyphProps) {
  const text = `${entry.tibetan} `.repeat(Math.max(2, density));

  return (
    <svg className="mantra-svg" viewBox="0 0 640 640" role="img" aria-labelledby="waterfall-title waterfall-desc">
      <title id="waterfall-title">{entry.title}</title>
      <desc id="waterfall-desc">A self-authored circular visualization of the liberation upon sight mantra.</desc>
      <defs>
        <radialGradient id="waterfallGlow" cx="50%" cy="50%" r="58%">
          <stop offset="0%" stopColor="var(--mantra-primary)" stopOpacity="0.32" />
          <stop offset="55%" stopColor="var(--mantra-secondary)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <circle cx="320" cy="320" r="280" fill="url(#waterfallGlow)" />
      <g className="mantra-spin-slow" style={{ animationPlayState: reducedMotion ? "paused" : "running" }}>
        <RingText id="waterfall-ring-1" radius={248} className="mantra-ring-text mantra-ring-text-large">
          {text}
        </RingText>
        <RingText id="waterfall-ring-2" radius={198} className="mantra-ring-text mantra-ring-text-small">
          {`${entry.seedSyllablesTibetan.join(" ། ")} ། `.repeat(Math.max(4, density))}
        </RingText>
        {rayAngles.map((angle) => (
          <line key={angle} className="mantra-ray" x1="320" y1="74" x2="320" y2="100" transform={`rotate(${angle} 320 320)`} />
        ))}
      </g>
      <g className="mantra-spin-reverse" style={{ animationPlayState: reducedMotion ? "paused" : "running" }}>
        {ringAngles.map((angle, index) => (
          <PolarText key={angle} angle={angle} radius={151} className="mantra-syllable">
            {entry.seedSyllablesTibetan[index % entry.seedSyllablesTibetan.length]}
          </PolarText>
        ))}
      </g>
      <circle className="mantra-core-ring" cx="320" cy="320" r="118" />
      <circle className="mantra-core-ring mantra-core-ring-soft" cx="320" cy="320" r="74" />
      <text className="mantra-core mantra-core-display" x="320" y="332" textAnchor="middle">
        ཧཱུྃ
      </text>
    </svg>
  );
}

function NamgyalmaGlyph({ entry, density, reducedMotion }: GlyphProps) {
  const loops = Array.from({ length: Math.max(6, density + 4) }, (_, index) => 70 + index * 22);

  return (
    <svg className="mantra-svg" viewBox="0 0 640 640" role="img" aria-labelledby="namgyalma-title namgyalma-desc">
      <title id="namgyalma-title">{entry.title}</title>
      <desc id="namgyalma-desc">A self-authored spiral mandala visualization for Namgyalma mantra viewing.</desc>
      <defs>
        <radialGradient id="namgyalmaGlow" cx="50%" cy="50%" r="62%">
          <stop offset="0%" stopColor="var(--mantra-primary)" stopOpacity="0.3" />
          <stop offset="62%" stopColor="var(--mantra-secondary)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <circle cx="320" cy="320" r="286" fill="url(#namgyalmaGlow)" />
      <Petals count={24} radius={188} />
      <g className="mantra-spin-slow" style={{ animationPlayState: reducedMotion ? "paused" : "running" }}>
        {loops.map((radius, index) => (
          <circle key={radius} className={index % 2 === 0 ? "mantra-spiral-line" : "mantra-spiral-line mantra-spiral-line-soft"} cx="320" cy="320" r={radius} />
        ))}
        {loops.slice(1).map((radius, index) => (
          <RingText key={radius} id={`namgyalma-ring-${radius}`} radius={radius} className={index % 2 === 0 ? "mantra-ring-text mantra-ring-text-mini" : "mantra-ring-text mantra-ring-text-faint"}>
            {`${entry.seedSyllablesTibetan[index % entry.seedSyllablesTibetan.length]} ། ${entry.tibetan} `.repeat(3)}
          </RingText>
        ))}
      </g>
      <g className="mantra-spin-reverse" style={{ animationPlayState: reducedMotion ? "paused" : "running" }}>
        {petalAngles.map((angle, index) => (
          <PolarText key={angle} angle={angle} radius={118} className="mantra-syllable mantra-syllable-gold">
            {entry.seedSyllablesTibetan[index % entry.seedSyllablesTibetan.length]}
          </PolarText>
        ))}
      </g>
      <circle className="mantra-core-ring" cx="320" cy="320" r="82" />
      <text className="mantra-core mantra-core-display" x="320" y="316" textAnchor="middle">
        ཨོཾ
      </text>
      <text className="mantra-core mantra-core-caption" x="320" y="354" textAnchor="middle">
        བྷྲཱུྃ
      </text>
    </svg>
  );
}

function PhagpaGlyph({ entry, density, reducedMotion }: GlyphProps) {
  const markerCount = Math.max(10, density * 2);
  const markers = Array.from({ length: markerCount }, (_, index) => index);

  return (
    <svg className="mantra-svg mantra-svg-wide" viewBox="0 0 760 520" role="img" aria-labelledby="phagpa-title phagpa-desc">
      <title id="phagpa-title">{entry.title}</title>
      <desc id="phagpa-desc">A self-authored horizontal talisman visualization for the Phagpa and Six Syllables pair.</desc>
      <defs>
        <linearGradient id="phagpaPanel" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="var(--mantra-primary)" stopOpacity="0.28" />
          <stop offset="48%" stopColor="var(--mantra-halo)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--mantra-secondary)" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      <rect className="mantra-panel" x="56" y="82" width="648" height="356" rx="38" fill="url(#phagpaPanel)" />
      <rect className="mantra-panel-border" x="78" y="104" width="604" height="312" rx="24" />
      <g className="mantra-spin-slow" style={{ transformOrigin: "380px 260px", animationPlayState: reducedMotion ? "paused" : "running" }}>
        {markers.map((marker) => (
          <circle
            key={marker}
            className="mantra-orbit-dot"
            cx={124 + (marker * 512) / Math.max(1, markerCount - 1)}
            cy={marker % 2 === 0 ? 132 : 388}
            r={marker % 3 === 0 ? 6 : 3.5}
          />
        ))}
      </g>
      <text className="mantra-card-line mantra-card-line-primary" x="380" y="212" textAnchor="middle">
        ཨོཾ་ཧ་ནུ་པྷ་ཤ་བྷ་ར་ཧེ་ཡེ་སྭཱ་ཧཱ།
      </text>
      <path className="mantra-divider-path" d="M 148 260 C 248 226, 512 294, 612 260" />
      <text className="mantra-card-line mantra-card-line-secondary" x="380" y="328" textAnchor="middle">
        ཨ་ཨ་ཤ་ས་མ་ཧ།
      </text>
      <g className="mantra-corners">
        <path d="M118 144 h58 m-58 0 v58" />
        <path d="M642 144 h-58 m58 0 v58" />
        <path d="M118 376 h58 m-58 0 v-58" />
        <path d="M642 376 h-58 m58 0 v-58" />
      </g>
    </svg>
  );
}

function HungGlyph({ entry, density, reducedMotion }: GlyphProps) {
  const text = `${entry.tibetan} `.repeat(Math.max(2, density));

  return (
    <svg className="mantra-svg" viewBox="0 0 640 640" role="img" aria-labelledby="hung-title hung-desc">
      <title id="hung-title">{entry.title}</title>
      <desc id="hung-desc">A self-authored symbolic HUNG, triad-label, and ring diagram.</desc>
      <defs>
        <radialGradient id="hungGlow" cx="50%" cy="48%" r="58%">
          <stop offset="0%" stopColor="var(--mantra-secondary)" stopOpacity="0.24" />
          <stop offset="62%" stopColor="var(--mantra-primary)" stopOpacity="0.14" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <circle cx="320" cy="320" r="282" fill="url(#hungGlow)" />
      <g className="mantra-spin-slow" style={{ animationPlayState: reducedMotion ? "paused" : "running" }}>
        <RingText id="hung-ring-1" radius={248} className="mantra-ring-text mantra-ring-text-large">
          {text}
        </RingText>
        {rayAngles.map((angle) => (
          <line key={angle} className="mantra-ray mantra-ray-violet" x1="320" y1="96" x2="320" y2="124" transform={`rotate(${angle} 320 320)`} />
        ))}
      </g>
      <circle className="mantra-core-ring" cx="320" cy="330" r="126" />
      <circle className="mantra-core-ring mantra-core-ring-soft" cx="320" cy="330" r="84" />
      <text className="mantra-core mantra-core-hung" x="320" y="358" textAnchor="middle">
        ཧཱུྃ
      </text>
      <g className="mantra-triad-labels">
        <PolarText angle={0} radius={194} className="mantra-syllable">
          དཀོན་མཆོག
        </PolarText>
        <PolarText angle={120} radius={194} className="mantra-syllable">
          རྩ་བ
        </PolarText>
        <PolarText angle={240} radius={194} className="mantra-syllable">
          སྐུ
        </PolarText>
      </g>
    </svg>
  );
}

export function MantraGlyph(props: GlyphProps) {
  const style = glyphStyle(props.entry, props.reducedMotion);

  return (
    <div className="mantra-glyph-frame" style={style}>
      {props.entry.id === "waterfall" ? <WaterfallGlyph {...props} /> : null}
      {props.entry.id === "namgyalma" ? <NamgyalmaGlyph {...props} /> : null}
      {props.entry.id === "phagpa" ? <PhagpaGlyph {...props} /> : null}
      {props.entry.id === "hung" ? <HungGlyph {...props} /> : null}
    </div>
  );
}

function spiralPoint(track: SpiralTrack, progress: number) {
  const radius = track.startRadius + (track.endRadius - track.startRadius) * progress;
  const angle = track.phase + progress * track.turns * 360;
  const radians = angle * (Math.PI / 180);

  return {
    angle,
    x: svgNumber(500 + Math.cos(radians) * radius),
    y: svgNumber(500 + Math.sin(radians) * radius),
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

export function MantraOrbitField() {
  const activeStrand = MANTRA_VISUAL_STRANDS[0];

  return (
    <div className="mantra-orbit-stage" aria-label="Single full-screen dense spiral field of Tibetan mantras">
      <img className="mantra-spiral-sheet mantra-spiral-sheet-main" src={spiralSheetSrc} alt="" aria-hidden="true" draggable={false} />
      <img className="mantra-spiral-sheet mantra-spiral-sheet-echo" src={spiralSheetSrc} alt="" aria-hidden="true" draggable={false} />
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
