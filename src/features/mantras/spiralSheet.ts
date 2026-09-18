import { MANTRA_VISUAL_STRANDS } from "./mantraData";

// Deterministic generator for the decorative full-screen mantra spiral sheet.
//
// This SVG is large (~333 KB) and purely decorative (the two <img> on /mantras are
// aria-hidden). It used to be inlined twice as a data: URI in the prerendered HTML,
// bloating the page to ~725 KB. It is now generated to a static file
// (public/mantras/spiral-sheet.svg) via `npm run generate:mantra-spiral` and served
// once (cacheable, shared by both <img>). The colors are baked oklch literals — no
// CSS variables or currentColor — so the external file renders identically.
//
// Regenerate after changing MANTRA_VISUAL_STRANDS, spiralTracks, or this builder.

type SpiralTrack = {
  id: number;
  startRadius: number;
  endRadius: number;
  turns: number;
  phase: number;
  repeat: number;
  symbols: number;
};

const orbitSymbols = ["ཧཱུྃ", "ཨོཾ", "བྷྲཱུྃ", "ཨ", "མ", "སྭཱ་ཧཱ"];

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

export function buildSpiralSheetSvg() {
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
