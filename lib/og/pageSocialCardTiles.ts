import { PAGE_SOCIAL_CARD_SIZE } from "../../src/data/mappings/pageSocialCardUrl";
import {
  SOCIAL_CARD_COLORS,
  escapeSocialCardXml,
  renderSocialCardIcon,
} from "./socialCardPrimitives";

export type TileSpec = {
  labelLines: readonly string[];
  iconName: string;
  selected?: boolean;
};

function renderTile(
  spec: TileSpec,
  x: number,
  y: number,
  size: number,
  labelSize: number,
): string {
  // Match an app icon: a square art surface with its caption outside.
  const iconSize = Math.round(
    size * (spec.labelLines.length > 1 ? 0.52 : 0.58),
  );
  const iconX = x + (size - iconSize) / 2;
  const iconY = y + (size - iconSize) / 2;
  const labelStartY = y + size + labelSize + 12;
  const stroke = spec.selected
    ? SOCIAL_CARD_COLORS.borderSelected
    : SOCIAL_CARD_COLORS.controlBorder;
  const surface = spec.selected
    ? `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="28" fill="url(#page-selected-base)" stroke="${stroke}" stroke-width="2"/>
       <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="28" fill="url(#page-selected-highlight)"/>`
    : `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="28" fill="url(#page-control-base)" stroke="${stroke}" stroke-width="2"/>
       <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="28" fill="url(#page-control-highlight)"/>`;

  return `<g>
    ${surface}
    ${renderSocialCardIcon(
      spec.iconName,
      iconX,
      iconY,
      iconSize,
      spec.selected ? SOCIAL_CARD_COLORS.accent : SOCIAL_CARD_COLORS.accentMuted,
    )}
    ${spec.labelLines
      .map(
        (line, index) =>
          `<text x="${x + size / 2}" y="${labelStartY + index * labelSize * 1.08}" text-anchor="middle" font-family="Blinker" font-size="${labelSize}" font-weight="600" fill="${spec.selected ? SOCIAL_CARD_COLORS.text : SOCIAL_CARD_COLORS.tileLabelMuted}">${escapeSocialCardXml(line)}</text>`,
      )
      .join("\n")}
  </g>`;
}

export function renderTileRows(
  rows: readonly (readonly TileSpec[])[],
  options: {
    top: number;
    tileWidth: number;
    tileHeight: number;
    columnGap: number;
    rowGap: number;
    labelSize: number;
  },
): string {
  return rows
    .flatMap((row, rowIndex) => {
      const rowWidth =
        row.length * options.tileWidth + (row.length - 1) * options.columnGap;
      const left = (PAGE_SOCIAL_CARD_SIZE - rowWidth) / 2;
      return row.map((tile, columnIndex) =>
        renderTile(
          tile,
          left + columnIndex * (options.tileWidth + options.columnGap),
          options.top + rowIndex * (options.tileHeight + options.rowGap),
          options.tileWidth,
          options.labelSize,
        ),
      );
    })
    .join("\n");
}
