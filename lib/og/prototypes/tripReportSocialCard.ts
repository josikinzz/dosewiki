/**
 * Individual trip-report social card prototype.
 *
 * The report remains an authored narrative: its title and a verbatim passage
 * lead an open, timeline-inspired composition, while byline, substance, date,
 * dose, route, and tags stay in compact supporting roles. The visual language
 * extends the approved Fun/dark social cards: pure black, Blinker, orchid
 * accents, an upper-left dose.wiki lockup, and one upper-left lighting model.
 */

import sharp from "sharp";

import {
  DOSEWIKI_LOGO_DATA_URI,
  SOCIAL_CARD_COLORS,
  SOCIAL_CARD_SIZE,
  escapeSocialCardXml,
  measureSocialCardText,
  renderDoseWikiWordmark,
  renderSocialCardIcon,
  renderSocialCardTypeLockup,
  renderSocialCardSvgPng,
} from "../socialCardPrimitives";
export const TRIP_REPORT_SOCIAL_CARD_RENDERER_VERSION = "2026-08-25.1";

type TripReportSocialCardSubstance = {
  name: string;
  dose?: string;
  roa?: string;
}

type TripReportSocialCardMedia = {
  filePath: string;
}

export type TripReportSocialCardInput = {
  title: string;
  author: string;
  avatar?: TripReportSocialCardMedia;
  substances: readonly TripReportSocialCardSubstance[];
  excerpt: string;
  excerptContext?: string;
  date?: string;
  tags?: readonly string[];
};

type TextLayout = {
  fontSize: number;
  lines: string[];
};

const CARD_GUTTER = 88;
const AUTHOR_AVATAR_SIZE = 52;
const CONTENT_WIDTH = SOCIAL_CARD_SIZE - CARD_GUTTER * 2;

function splitOverwideWord(word: string, fontSize: number, maxWidth: number, fontWeight: number): string[] {
  const characters = Array.from(word);
  const chunks: string[] = [];
  let chunk = "";

  for (const character of characters) {
    const candidate = `${chunk}${character}`;
    if (chunk && measureSocialCardText(candidate, fontSize, fontWeight) > maxWidth) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk = candidate;
    }
  }

  if (chunk) chunks.push(chunk);
  return chunks;
}

function wrapSocialCardText(
  value: string,
  fontSize: number,
  maxWidth: number,
  fontWeight: number,
): string[] {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const words = normalized.split(" ").flatMap((word) =>
    measureSocialCardText(word, fontSize, fontWeight) <= maxWidth
      ? [word]
      : splitOverwideWord(word, fontSize, maxWidth, fontWeight),
  );
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measureSocialCardText(candidate, fontSize, fontWeight) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function ellipsizeSocialCardText(
  value: string,
  fontSize: number,
  maxWidth: number,
  fontWeight: number,
): string {
  const suffix = "…";
  const normalized = value.replace(/\s+/g, " ").trim();
  const words = normalized.split(" ");
  let visible = "";

  for (const word of words) {
    const candidate = visible ? `${visible} ${word}` : word;
    if (measureSocialCardText(`${candidate}${suffix}`, fontSize, fontWeight) > maxWidth) break;
    visible = candidate;
  }

  if (visible) return `${visible}${suffix}`;

  const characters = Array.from(normalized);
  while (
    characters.length > 0 &&
    measureSocialCardText(`${characters.join("")}${suffix}`, fontSize, fontWeight) > maxWidth
  ) {
    characters.pop();
  }

  return `${characters.join("").trimEnd()}${suffix}`;
}

function fitWrappedSocialCardText(
  value: string,
  options: {
    preferredSize: number;
    minimumSize: number;
    maxWidth: number;
    maxLines: number;
    fontWeight: number;
  },
): TextLayout {
  for (let fontSize = options.preferredSize; fontSize >= options.minimumSize; fontSize -= 1) {
    const lines = wrapSocialCardText(value, fontSize, options.maxWidth, options.fontWeight);
    if (lines.length <= options.maxLines) return { fontSize, lines };
  }

  const fontSize = options.minimumSize;
  const lines = wrapSocialCardText(value, fontSize, options.maxWidth, options.fontWeight);
  if (lines.length <= options.maxLines) return { fontSize, lines };

  const visibleLines = lines.slice(0, options.maxLines);
  const remainder = lines.slice(options.maxLines - 1).join(" ");
  visibleLines[options.maxLines - 1] = ellipsizeSocialCardText(
    remainder,
    fontSize,
    options.maxWidth,
    options.fontWeight,
  );
  return { fontSize, lines: visibleLines };
}

function renderTextLines(
  layout: TextLayout,
  options: {
    x: number;
    firstBaseline: number;
    lineHeight: number;
    fill: string;
    fontWeight: number;
    letterSpacing?: number;
  },
): string {
  return layout.lines
    .map(
      (line, index) =>
        `<text x="${options.x}" y="${options.firstBaseline + index * options.lineHeight}" font-family="Blinker" font-size="${layout.fontSize}" font-weight="${options.fontWeight}"${options.letterSpacing === undefined ? "" : ` letter-spacing="${options.letterSpacing}"`} fill="${options.fill}">${escapeSocialCardXml(line)}</text>`,
    )
    .join("\n");
}

function renderBrandLockup(): string {
  const wordmarkSize = 40;
  const wordmarkLeft = 126;
  const wordmarkWidth = measureSocialCardText("dose.wiki", wordmarkSize, 600);

  return `<g>
    <image href="${DOSEWIKI_LOGO_DATA_URI}" x="54" y="45" width="58" height="58"/>
    ${renderDoseWikiWordmark(wordmarkLeft + wordmarkWidth / 2, 91, wordmarkSize)}
  </g>`;
}

function renderByline(
  author: string,
  baselineY: number,
  avatarDataUri: string | null,
): string {
  const prefix = "by ";
  const fontSize = 30;
  const iconSize = 25;
  const mediaLeft = CARD_GUTTER;
  const avatarTop = baselineY - 40;
  const textLeft =
    mediaLeft + (avatarDataUri ? AUTHOR_AVATAR_SIZE + 15 : iconSize + 13);
  const media = avatarDataUri
    ? `<circle cx="${mediaLeft + AUTHOR_AVATAR_SIZE / 2}" cy="${avatarTop + AUTHOR_AVATAR_SIZE / 2}" r="${AUTHOR_AVATAR_SIZE / 2 + 2}" fill="none" stroke="${SOCIAL_CARD_COLORS.accentMuted}" stroke-width="2"/>
      <image href="${avatarDataUri}" x="${mediaLeft}" y="${avatarTop}" width="${AUTHOR_AVATAR_SIZE}" height="${AUTHOR_AVATAR_SIZE}" clip-path="url(#report-author-avatar-clip)" preserveAspectRatio="xMidYMid slice"/>`
    : renderSocialCardIcon(
        "lucide:user-round",
        mediaLeft,
        baselineY - iconSize + 1,
        iconSize,
        SOCIAL_CARD_COLORS.textFaint,
      );

  return `<g>
    ${media}
    <text x="${textLeft}" y="${baselineY}" font-family="Blinker" font-size="${fontSize}" fill="${SOCIAL_CARD_COLORS.textMuted}">${prefix}<tspan font-weight="600" fill="${SOCIAL_CARD_COLORS.text}">${escapeSocialCardXml(author)}</tspan></text>
  </g>`;
}

function renderSubstancePills(
  substances: readonly TripReportSocialCardSubstance[],
  top: number,
): { svg: string; bottom: number } {
  const fontSize = 34;
  const pillHeight = 72;
  const rowGap = 16;
  const columnGap = 16;
  const iconSize = 31;
  const paddingX = 24;
  const iconGap = 14;
  let x = CARD_GUTTER;
  let y = top;
  const pills: string[] = [];

  for (const substance of substances) {
    const details = [substance.dose, substance.roa].filter(Boolean).join(" · ");
    const separator = details ? " · " : "";
    const textWidth =
      measureSocialCardText(substance.name, fontSize, 600) +
      measureSocialCardText(`${separator}${details}`, fontSize, 400);
    const pillWidth = Math.ceil(paddingX * 2 + iconSize + iconGap + textWidth);

    if (x !== CARD_GUTTER && x + pillWidth > SOCIAL_CARD_SIZE - CARD_GUTTER) {
      x = CARD_GUTTER;
      y += pillHeight + rowGap;
    }

    const textLeft = x + paddingX + iconSize + iconGap;
    const baselineY = y + 47;
    pills.push(`<g>
      <rect x="${x}" y="${y}" width="${pillWidth}" height="${pillHeight}" rx="36" fill="${SOCIAL_CARD_COLORS.surface}" stroke="${SOCIAL_CARD_COLORS.controlBorder}" stroke-width="2"/>
      ${renderSocialCardIcon(
        "lucide:beaker",
        x + paddingX,
        y + (pillHeight - iconSize) / 2,
        iconSize,
        SOCIAL_CARD_COLORS.accentStrong,
      )}
      <text x="${textLeft}" y="${baselineY}" font-family="Blinker" font-size="${fontSize}" fill="${SOCIAL_CARD_COLORS.textMuted}"><tspan font-weight="600" fill="${SOCIAL_CARD_COLORS.accent}">${escapeSocialCardXml(substance.name)}</tspan>${escapeSocialCardXml(`${separator}${details}`)}</text>
    </g>`);
    x += pillWidth + columnGap;
  }

  return {
    svg: pills.join("\n"),
    bottom: substances.length === 0 ? top : y + pillHeight,
  };
}

function renderContextPills(input: TripReportSocialCardInput, top: number): string {
  const items = [
    input.date ? { icon: "lucide:calendar", label: input.date } : null,
    ...(input.tags ?? []).map((tag) => ({ icon: "lucide:tag", label: tag })),
  ].filter((item): item is { icon: string; label: string } => item !== null);
  const fontSize = 30;
  const iconSize = 27;
  const height = 60;
  const gap = 14;
  const paddingX = 19;
  let x = CARD_GUTTER;
  const pills: string[] = [];

  for (const item of items) {
    const width = Math.ceil(
      paddingX * 2 + iconSize + 12 + measureSocialCardText(item.label, fontSize, 400),
    );
    if (x + width > SOCIAL_CARD_SIZE - CARD_GUTTER) break;

    pills.push(`<g>
      <rect x="${x}" y="${top}" width="${width}" height="${height}" rx="30" fill="${SOCIAL_CARD_COLORS.surfaceSecondary}" stroke="${SOCIAL_CARD_COLORS.border}" stroke-width="2"/>
      ${renderSocialCardIcon(
        item.icon,
        x + paddingX,
        top + (height - iconSize) / 2,
        iconSize,
        SOCIAL_CARD_COLORS.accentMuted,
      )}
      <text x="${x + paddingX + iconSize + 12}" y="${top + 40}" font-family="Blinker" font-size="${fontSize}" fill="${SOCIAL_CARD_COLORS.textMuted}">${escapeSocialCardXml(item.label)}</text>
    </g>`);
    x += width + gap;
  }

  return pills.join("\n");
}

export async function renderTripReportSocialCardPng(
  input: TripReportSocialCardInput,
): Promise<Buffer> {
  const avatarDataUri = input.avatar
    ? await sharp(input.avatar.filePath)
        .resize(AUTHOR_AVATAR_SIZE, AUTHOR_AVATAR_SIZE, {
          fit: "cover",
          position: "centre",
        })
        .png()
        .toBuffer()
        .then((png) => `data:image/png;base64,${png.toString("base64")}`)
    : null;
  const title = fitWrappedSocialCardText(input.title, {
    preferredSize: 86,
    minimumSize: 64,
    maxWidth: CONTENT_WIDTH,
    maxLines: 2,
    fontWeight: 600,
  });
  const titleLineHeight = Math.round(title.fontSize * 0.98);
  const titleFirstBaseline = 240;
  const titleBottom = titleFirstBaseline + (title.lines.length - 1) * titleLineHeight;
  const bylineBaseline = titleBottom + 62;
  const substanceTop = bylineBaseline + 42;
  const substanceBlock = renderSubstancePills(input.substances, substanceTop);
  const excerptTop = Math.max(540, substanceBlock.bottom + 78);
  const excerptTextLeft = 176;
  const excerpt = fitWrappedSocialCardText(input.excerpt, {
    preferredSize: 47,
    minimumSize: 44,
    maxWidth: SOCIAL_CARD_SIZE - excerptTextLeft - CARD_GUTTER,
    maxLines: 5,
    fontWeight: 400,
  });
  const excerptLineHeight = Math.round(excerpt.fontSize * 1.28);
  const excerptFirstBaseline = excerptTop + excerpt.fontSize;
  const excerptBottom = excerptFirstBaseline + (excerpt.lines.length - 1) * excerptLineHeight;
  const excerptContextY = Math.min(963, excerptBottom + 58);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SOCIAL_CARD_SIZE}" height="${SOCIAL_CARD_SIZE}" viewBox="0 0 ${SOCIAL_CARD_SIZE} ${SOCIAL_CARD_SIZE}">
    <defs>
      <linearGradient id="report-rail" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${SOCIAL_CARD_COLORS.accentStrong}" stop-opacity="0.92"/>
        <stop offset="1" stop-color="${SOCIAL_CARD_COLORS.accentMuted}" stop-opacity="0.08"/>
      </linearGradient>
      <radialGradient id="report-ambient" cx="12%" cy="0%" r="72%">
        <stop offset="0" stop-color="${SOCIAL_CARD_COLORS.selectedHighlight}" stop-opacity="0.22"/>
        <stop offset="46%" stop-color="${SOCIAL_CARD_COLORS.selectedHighlight}" stop-opacity="0"/>
      </radialGradient>
      <clipPath id="report-author-avatar-clip">
        <circle cx="${CARD_GUTTER + AUTHOR_AVATAR_SIZE / 2}" cy="${bylineBaseline - 40 + AUTHOR_AVATAR_SIZE / 2}" r="${AUTHOR_AVATAR_SIZE / 2}"/>
      </clipPath>
    </defs>
    <rect width="100%" height="100%" fill="${SOCIAL_CARD_COLORS.background}"/>
    <rect width="100%" height="520" fill="url(#report-ambient)"/>
    ${renderBrandLockup()}
    ${renderSocialCardTypeLockup("Experience Reports", "hugeicons:content-writing")}
    ${renderTextLines(title, {
      x: CARD_GUTTER,
      firstBaseline: titleFirstBaseline,
      lineHeight: titleLineHeight,
      fill: SOCIAL_CARD_COLORS.accentStrong,
      fontWeight: 600,
      letterSpacing: -1.5,
    })}
    ${renderByline(input.author, bylineBaseline, avatarDataUri)}
    ${substanceBlock.svg}
    ${renderSocialCardIcon(
      "lucide:quote",
      CARD_GUTTER - 8,
      excerptTop + 8,
      64,
      SOCIAL_CARD_COLORS.accentMuted,
    )}
    <line x1="112" y1="${excerptTop + 88}" x2="112" y2="${excerptContextY - 16}" stroke="url(#report-rail)" stroke-width="3" stroke-linecap="round"/>
    ${renderTextLines(excerpt, {
      x: excerptTextLeft,
      firstBaseline: excerptFirstBaseline,
      lineHeight: excerptLineHeight,
      fill: SOCIAL_CARD_COLORS.text,
      fontWeight: 400,
      letterSpacing: -0.35,
    })}
    ${input.excerptContext ? `<text x="${excerptTextLeft}" y="${excerptContextY}" font-family="Blinker" font-size="24" font-weight="600" letter-spacing="2.2" text-transform="uppercase" fill="${SOCIAL_CARD_COLORS.accentMuted}">${escapeSocialCardXml(input.excerptContext.toUpperCase())}</text>` : ""}
    ${renderContextPills(input, 1040)}
  </svg>`;

  return renderSocialCardSvgPng(svg);
}

