import sharp from "sharp";

import {
  DOSEWIKI_LOGO_DATA_URI,
  SOCIAL_CARD_COLORS,
  SOCIAL_CARD_SIZE,
  escapeSocialCardXml,
  fitSocialCardText,
  measureSocialCardText,
  renderDoseWikiWordmark,
  renderSocialCardIcon,
  renderSocialCardTypeLockup,
  renderSocialCardSvgPng,
} from "../socialCardPrimitives";
export const SUBJECTIVE_EFFECT_SOCIAL_CARD_RENDERER_VERSION = "2026-08-25.1";

type SubjectiveEffectSocialCardContext = {
  label: string;
  iconName: string;
}

type SubjectiveEffectSocialCardMedia = {
  filePath: string;
}

type SubjectiveEffectSocialCardReplication = {
  slug: string;
  title: string;
  creatorLabel: string;
  media: SubjectiveEffectSocialCardMedia;
  creatorAvatar?: SubjectiveEffectSocialCardMedia;
}

export type SubjectiveEffectSocialCardInput = {
  name: string;
  slug: string;
  iconName: string;
  summary: string;
  taxonomy: readonly [string, ...string[]];
  context?: readonly SubjectiveEffectSocialCardContext[];
  landscapeReplication?: SubjectiveEffectSocialCardReplication;
};

const CARD_MARGIN = 72;
const CONTENT_WIDTH = SOCIAL_CARD_SIZE - CARD_MARGIN * 2;
const SUMMARY_FONT_SIZE = 48;
const SUMMARY_LINE_HEIGHT = 62;
const SUMMARY_MAX_LINES = 5;
const FEATURED_ARTWORK_X = 88;
const FEATURED_ARTWORK_Y = 336;
const FEATURED_ARTWORK_WIDTH = 1024;
const FEATURED_ARTWORK_HEIGHT = 468;
const CREATOR_AVATAR_SIZE = 56;
const CREATOR_AVATAR_X = CARD_MARGIN;
const CREATOR_AVATAR_Y = 828;
const REPLICATION_TEXT_X = CREATOR_AVATAR_X + CREATOR_AVATAR_SIZE + 18;


function fitLineWithEllipsis(
  text: string,
  fontSize: number,
  maxWidth: number,
  fontWeight: number,
): string {
  if (measureSocialCardText(text, fontSize, fontWeight) <= maxWidth) return text;

  const ellipsis = "…";
  let low = 0;
  let high = text.length;
  while (low < high) {
    const midpoint = Math.ceil((low + high) / 2);
    const candidate = `${text.slice(0, midpoint).trimEnd()}${ellipsis}`;
    if (measureSocialCardText(candidate, fontSize, fontWeight) <= maxWidth) {
      low = midpoint;
    } else {
      high = midpoint - 1;
    }
  }
  return `${text.slice(0, low).trimEnd()}${ellipsis}`;
}

function wrapSocialCardText(
  text: string,
  fontSize: number,
  maxWidth: number,
  maxLines: number,
  fontWeight = 400,
): string[] {
  const words = text.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let line = "";
  let wordIndex = 0;

  while (wordIndex < words.length && lines.length < maxLines) {
    const word = words[wordIndex];
    const candidate = line ? `${line} ${word}` : word;
    if (measureSocialCardText(candidate, fontSize, fontWeight) <= maxWidth) {
      line = candidate;
      wordIndex += 1;
      continue;
    }

    if (!line) {
      line = fitLineWithEllipsis(word, fontSize, maxWidth, fontWeight);
      wordIndex += 1;
    }

    if (lines.length === maxLines - 1) {
      const remainder = [line, ...words.slice(wordIndex)].filter(Boolean).join(" ");
      lines.push(fitLineWithEllipsis(remainder, fontSize, maxWidth, fontWeight));
      return lines;
    }

    lines.push(line);
    line = "";
  }

  if (line && lines.length < maxLines) lines.push(line);
  return lines;
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

function renderTaxonomy(
  taxonomy: SubjectiveEffectSocialCardInput["taxonomy"],
  x: number,
  baselineY: number,
  maxWidth: number,
  preferredSize = 31,
): string {
  const label = taxonomy.join("  ›  ");
  const fontSize = fitSocialCardText(label, preferredSize, 20, maxWidth, 400);
  const fittedLabel = fitLineWithEllipsis(label, fontSize, maxWidth, 400);
  return `<text x="${x}" y="${baselineY}" font-family="Blinker" font-size="${fontSize}" font-weight="400" letter-spacing="0.2" fill="${SOCIAL_CARD_COLORS.textMuted}">${escapeSocialCardXml(fittedLabel)}</text>`;
}

function renderContext(
  context: readonly SubjectiveEffectSocialCardContext[],
  iconY: number,
  baselineY: number,
  maxX: number,
): string {
  const groups: string[] = [];
  let x = CARD_MARGIN;

  for (const { label, iconName } of context) {
    const iconSize = 28;
    const gap = 14;
    const availableWidth = maxX - x;
    if (availableWidth < iconSize + gap + 60) break;

    const labelMaxWidth = availableWidth - iconSize - gap;
    const fontSize = fitSocialCardText(label, 30, 20, labelMaxWidth, 600);
    const fittedLabel = fitLineWithEllipsis(label, fontSize, labelMaxWidth, 600);
    const labelWidth = measureSocialCardText(fittedLabel, fontSize, 600);

    groups.push(`<g>
      ${renderSocialCardIcon(iconName, x, iconY, iconSize, SOCIAL_CARD_COLORS.accentMuted)}
      <text x="${x + iconSize + gap}" y="${baselineY}" font-family="Blinker" font-size="${fontSize}" font-weight="600" fill="${SOCIAL_CARD_COLORS.textSecondary}">${escapeSocialCardXml(fittedLabel)}</text>
    </g>`);
    x += iconSize + gap + labelWidth + 42;
  }

  return groups.join("\n");
}

export async function renderSubjectiveEffectSocialCardPng(
  input: SubjectiveEffectSocialCardInput,
): Promise<Buffer> {
  const replication = input.landscapeReplication;
  const [artworkDataUri, creatorAvatarDataUri] = replication
    ? await Promise.all([
        sharp(replication.media.filePath)
          .resize(FEATURED_ARTWORK_WIDTH, FEATURED_ARTWORK_HEIGHT, {
            fit: "cover",
            position: "centre",
          })
          .png()
          .toBuffer()
          .then((png) => `data:image/png;base64,${png.toString("base64")}`),
        replication.creatorAvatar
          ? sharp(replication.creatorAvatar.filePath)
              .resize(CREATOR_AVATAR_SIZE, CREATOR_AVATAR_SIZE, {
                fit: "cover",
                position: "centre",
              })
              .png()
              .toBuffer()
              .then((png) => `data:image/png;base64,${png.toString("base64")}`)
          : Promise.resolve(null),
      ])
    : [null, null];
  const hasArtwork =
    replication !== undefined &&
    artworkDataUri !== null;
  const titleMaxWidth = hasArtwork ? 936 : 862;
  const titlePreferredSize = hasArtwork ? 84 : 116;
  const titleMinimumSize = hasArtwork ? 48 : 54;
  const titleSize = fitSocialCardText(
    input.name,
    titlePreferredSize,
    titleMinimumSize,
    titleMaxWidth,
    600,
  );
  const fittedTitle = fitLineWithEllipsis(
    input.name,
    titleSize,
    titleMaxWidth,
    600,
  );
  const summaryFontSize = hasArtwork ? 34 : SUMMARY_FONT_SIZE;
  const summaryLineHeight = hasArtwork ? 43 : SUMMARY_LINE_HEIGHT;
  const summaryLines = wrapSocialCardText(
    input.summary,
    summaryFontSize,
    CONTENT_WIDTH,
    hasArtwork ? 3 : SUMMARY_MAX_LINES,
  );
  const context = input.context ?? [];
  const route = `dose.wiki/effects/${input.slug}`;
  const routeFontSize = fitSocialCardText(route, 29, 20, 520, 400);

  const body =
    hasArtwork && replication
      ? (() => {
          const artistSize = fitSocialCardText(
            replication.creatorLabel,
            30,
            22,
            650,
            600,
          );
          const fittedArtist = fitLineWithEllipsis(
            replication.creatorLabel,
            artistSize,
            650,
            600,
          );
          const replicationTitleSize = fitSocialCardText(
            replication.title,
            22,
            18,
            650,
            400,
          );
          const replicationTitle = fitLineWithEllipsis(
            replication.title,
            replicationTitleSize,
            650,
            400,
          );

          return `
    ${renderSocialCardIcon(input.iconName, CARD_MARGIN, 158, 96, SOCIAL_CARD_COLORS.accentStrong)}
    <text x="192" y="226" font-family="Blinker" font-size="${titleSize}" font-weight="600" letter-spacing="-1.5" fill="${SOCIAL_CARD_COLORS.accentStrong}">${escapeSocialCardXml(fittedTitle)}</text>
    ${renderTaxonomy(input.taxonomy, 192, 272, 936, 28)}
    <line x1="${CARD_MARGIN}" y1="296" x2="${SOCIAL_CARD_SIZE - CARD_MARGIN}" y2="296" stroke="${SOCIAL_CARD_COLORS.border}" stroke-width="2"/>

    <rect x="${CARD_MARGIN}" y="320" width="${CONTENT_WIDTH}" height="500" rx="24" fill="${SOCIAL_CARD_COLORS.surface}" stroke="${SOCIAL_CARD_COLORS.border}" stroke-width="2"/>
    <image href="${artworkDataUri}" x="${FEATURED_ARTWORK_X}" y="${FEATURED_ARTWORK_Y}" width="${FEATURED_ARTWORK_WIDTH}" height="${FEATURED_ARTWORK_HEIGHT}" preserveAspectRatio="xMidYMid slice" clip-path="url(#effect-replication-clip)"/>
    ${
      creatorAvatarDataUri
        ? `<image href="${creatorAvatarDataUri}" x="${CREATOR_AVATAR_X}" y="${CREATOR_AVATAR_Y}" width="${CREATOR_AVATAR_SIZE}" height="${CREATOR_AVATAR_SIZE}" preserveAspectRatio="xMidYMid slice" clip-path="url(#effect-creator-avatar-clip)"/>`
        : `<circle cx="${CREATOR_AVATAR_X + CREATOR_AVATAR_SIZE / 2}" cy="${CREATOR_AVATAR_Y + CREATOR_AVATAR_SIZE / 2}" r="${CREATOR_AVATAR_SIZE / 2}" fill="${SOCIAL_CARD_COLORS.surfaceHighlight}"/>${renderSocialCardIcon("lucide:user-round", CREATOR_AVATAR_X + 12, CREATOR_AVATAR_Y + 12, 32, SOCIAL_CARD_COLORS.textMuted)}`
    }
    <text x="${REPLICATION_TEXT_X}" y="852" font-family="Blinker" font-size="${artistSize}" font-weight="600" fill="${SOCIAL_CARD_COLORS.text}">${escapeSocialCardXml(fittedArtist)}</text>
    <text x="${REPLICATION_TEXT_X}" y="881" font-family="Blinker" font-size="${replicationTitleSize}" font-weight="400" fill="${SOCIAL_CARD_COLORS.textMuted}">${escapeSocialCardXml(replicationTitle)}</text>
    <line x1="${CARD_MARGIN}" y1="892" x2="${SOCIAL_CARD_SIZE - CARD_MARGIN}" y2="892" stroke="${SOCIAL_CARD_COLORS.border}" stroke-width="2"/>

    ${summaryLines
      .map(
        (line, index) =>
          `<text x="${CARD_MARGIN}" y="${942 + index * summaryLineHeight}" font-family="Blinker" font-size="${summaryFontSize}" font-weight="400" fill="${SOCIAL_CARD_COLORS.textSecondary}">${escapeSocialCardXml(line)}</text>`,
      )
      .join("\n")}

    <line x1="${CARD_MARGIN}" y1="1062" x2="${SOCIAL_CARD_SIZE - CARD_MARGIN}" y2="1062" stroke="${SOCIAL_CARD_COLORS.border}" stroke-width="2"/>
    ${renderContext(context, 1091, 1115, 660)}
    <text x="${SOCIAL_CARD_SIZE - CARD_MARGIN}" y="1116" text-anchor="end" font-family="Blinker" font-size="${routeFontSize}" font-weight="400" fill="${SOCIAL_CARD_COLORS.textFaint}">${escapeSocialCardXml(route)}</text>`;
        })()
      : `
    <g opacity="0.08">
      ${renderSocialCardIcon(input.iconName, 830, 730, 430, SOCIAL_CARD_COLORS.accentMuted)}
    </g>

    ${renderSocialCardIcon(input.iconName, CARD_MARGIN, 252, 142, SOCIAL_CARD_COLORS.accentStrong)}
    <text x="266" y="348" font-family="Blinker" font-size="${titleSize}" font-weight="600" letter-spacing="-1.5" fill="${SOCIAL_CARD_COLORS.accentStrong}">${escapeSocialCardXml(fittedTitle)}</text>
    ${renderTaxonomy(input.taxonomy, 266, 427, 860)}
    <line x1="${CARD_MARGIN}" y1="492" x2="${SOCIAL_CARD_SIZE - CARD_MARGIN}" y2="492" stroke="${SOCIAL_CARD_COLORS.border}" stroke-width="2"/>

    ${summaryLines
      .map(
        (line, index) =>
          `<text x="${CARD_MARGIN}" y="${594 + index * summaryLineHeight}" font-family="Blinker" font-size="${summaryFontSize}" font-weight="400" fill="${SOCIAL_CARD_COLORS.textSecondary}">${escapeSocialCardXml(line)}</text>`,
      )
      .join("\n")}

    <line x1="${CARD_MARGIN}" y1="954" x2="${SOCIAL_CARD_SIZE - CARD_MARGIN}" y2="954" stroke="${SOCIAL_CARD_COLORS.border}" stroke-width="2"/>
    ${renderContext(context, 994, 1020, 660)}
    <text x="${SOCIAL_CARD_SIZE - CARD_MARGIN}" y="1110" text-anchor="end" font-family="Blinker" font-size="${routeFontSize}" font-weight="400" fill="${SOCIAL_CARD_COLORS.textFaint}">${escapeSocialCardXml(route)}</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SOCIAL_CARD_SIZE}" height="${SOCIAL_CARD_SIZE}" viewBox="0 0 ${SOCIAL_CARD_SIZE} ${SOCIAL_CARD_SIZE}">
    <defs>
      <clipPath id="effect-replication-clip">
        <rect x="${FEATURED_ARTWORK_X}" y="${FEATURED_ARTWORK_Y}" width="${FEATURED_ARTWORK_WIDTH}" height="${FEATURED_ARTWORK_HEIGHT}" rx="16"/>
      </clipPath>
      <clipPath id="effect-creator-avatar-clip">
        <circle cx="${CREATOR_AVATAR_X + CREATOR_AVATAR_SIZE / 2}" cy="${CREATOR_AVATAR_Y + CREATOR_AVATAR_SIZE / 2}" r="${CREATOR_AVATAR_SIZE / 2}"/>
      </clipPath>
    </defs>
    <rect width="100%" height="100%" fill="${SOCIAL_CARD_COLORS.background}"/>
    ${renderBrandLockup()}
    ${renderSocialCardTypeLockup("Subjective Effects", "material-symbols:person-play-outline-rounded")}
    ${body}
  </svg>`;

  return renderSocialCardSvgPng(svg);
}
