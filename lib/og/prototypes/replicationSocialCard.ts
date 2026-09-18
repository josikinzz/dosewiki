/**
 * THESIS: A black gallery mat lets one experiential artwork carry the card;
 * the template refuses a dashboard of decorative badges around it.
 * OWN-WORLD: Fun/dark dose.wiki tokens, Blinker, a quiet hairline frame, and
 * one fuchsia association cue on an otherwise neutral information rail.
 * STORY: See the work first, then identify its title, creator, effect, medium,
 * and exact rights status without competing chrome.
 * FIRST VIEWPORT: The existing top-left lockup sits above an almost full-width
 * 16:9 artwork; title and credit lead into a three-column provenance footer.
 * FORM: Art-catalog plate, selected for this tightly specified prototype.
 */

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
export const REPLICATION_SOCIAL_CARD_RENDERER_VERSION = "2026-08-25.2";

type ReplicationSocialCardRights = Readonly<{
  licenseName: string;
  licenseUrl?: string;
  rightsholder?: string;
}>

export type ReplicationSocialCardInput = Readonly<{
  slug: string;
  recordId: string;
  title: string;
  creator: string;
  effect: Readonly<{
    name: string;
    slug: string;
  }>;
  mediaType: "image" | "video" | "audio";
  format?: string;
  artworkPath?: string;
  creatorAvatarPath?: string;
  sourceUrl: string;
  rights?: ReplicationSocialCardRights;
}>;



const MARGIN = 56;
const ARTWORK_X = MARGIN;
const ARTWORK_Y = 136;
const ARTWORK_WIDTH = SOCIAL_CARD_SIZE - MARGIN * 2;
const ARTWORK_FRAME_HEIGHT = 626;
const ARTWORK_INSET = 16;
const ARTWORK_IMAGE_WIDTH = ARTWORK_WIDTH - ARTWORK_INSET * 2;
const ARTWORK_IMAGE_HEIGHT = 594;
const CREATOR_AVATAR_SIZE = 112;
const CREATOR_AVATAR_X = MARGIN;
const CREATOR_AVATAR_Y = 806;
const CREATOR_TEXT_X = CREATOR_AVATAR_X + CREATOR_AVATAR_SIZE + 24;
const METADATA_TOP = 970;

function titleCase(value: string): string {
  return value.length === 0
    ? value
    : `${value[0].toUpperCase()}${value.slice(1).toLowerCase()}`;
}

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

function renderBrandLockup(): string {
  const wordmarkSize = 40;
  const wordmarkLeft = 126;
  const wordmarkWidth = measureSocialCardText("dose.wiki", wordmarkSize, 600);

  return `<g>
    <image href="${DOSEWIKI_LOGO_DATA_URI}" x="54" y="45" width="58" height="58"/>
    ${renderDoseWikiWordmark(
      wordmarkLeft + wordmarkWidth / 2,
      91,
      wordmarkSize,
      false,
    )}
  </g>`;
}

function renderMetadataColumn(
  label: string,
  value: string,
  x: number,
  maxWidth: number,
  accent = false,
): string {
  const valueSize = fitSocialCardText(value, 38, 26, maxWidth, 600);

  return `<g>
    <text x="${x}" y="${METADATA_TOP + 45}" font-family="Blinker" font-size="19" font-weight="600" letter-spacing="3.2" fill="${SOCIAL_CARD_COLORS.textFaint}">${escapeSocialCardXml(label.toUpperCase())}</text>
    <text x="${x}" y="${METADATA_TOP + 91}" font-family="Blinker" font-size="${valueSize}" font-weight="600" fill="${accent ? SOCIAL_CARD_COLORS.accentStrong : SOCIAL_CARD_COLORS.text}">${escapeSocialCardXml(value)}</text>
  </g>`;
}

export async function renderReplicationSocialCardPng(
  input: ReplicationSocialCardInput,
): Promise<Buffer> {
  const [artwork, creatorAvatar] = await Promise.all([
    input.artworkPath
      ? sharp(input.artworkPath)
          .resize(ARTWORK_IMAGE_WIDTH, ARTWORK_IMAGE_HEIGHT, {
            fit: "cover",
            position: "centre",
          })
          .png()
          .toBuffer()
      : Promise.resolve(null),
    input.creatorAvatarPath
      ? sharp(input.creatorAvatarPath)
          .resize(CREATOR_AVATAR_SIZE, CREATOR_AVATAR_SIZE, {
            fit: "cover",
            position: "centre",
          })
          .png()
          .toBuffer()
      : Promise.resolve(null),
  ]);
  const artworkDataUri = artwork
    ? `data:image/png;base64,${artwork.toString("base64")}`
    : null;
  const creatorAvatarDataUri = creatorAvatar
    ? `data:image/png;base64,${creatorAvatar.toString("base64")}`
    : null;
  const attributionWidth =
    SOCIAL_CARD_SIZE - MARGIN - CREATOR_TEXT_X;
  const artistSize = fitSocialCardText(
    input.creator,
    68,
    48,
    attributionWidth,
    600,
  );
  const fittedArtist = fitLineWithEllipsis(
    input.creator,
    artistSize,
    attributionWidth,
    600,
  );
  const titleSize = fitSocialCardText(
    input.title,
    36,
    26,
    attributionWidth,
    400,
  );
  const fittedTitle = fitLineWithEllipsis(
    input.title,
    titleSize,
    attributionWidth,
    400,
  );
  const mediaValue = input.format
    ? `${titleCase(input.mediaType)} · ${input.format.toUpperCase()}`
    : titleCase(input.mediaType);
  const rightsValue =
    input.rights?.licenseName ?? "Rights remain with original creator";
  const rightsholderLine = input.rights?.rightsholder
    ? `Rightsholder: ${input.rights.rightsholder}`
    : null;
  const fallbackEffectSize = fitSocialCardText(
    input.effect.name,
    78,
    44,
    ARTWORK_IMAGE_WIDTH - 160,
    600,
  );
  const videoOverlay =
    artworkDataUri && input.mediaType === "video"
      ? `<g>
          <circle cx="600" cy="449" r="56" fill="${SOCIAL_CARD_COLORS.background}" fill-opacity="0.72" stroke="${SOCIAL_CARD_COLORS.controlBorder}" stroke-width="2"/>
          ${renderSocialCardIcon(
            "lucide:play",
            575,
            424,
            50,
            SOCIAL_CARD_COLORS.text,
          )}
        </g>`
      : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SOCIAL_CARD_SIZE}" height="${SOCIAL_CARD_SIZE}" viewBox="0 0 ${SOCIAL_CARD_SIZE} ${SOCIAL_CARD_SIZE}">
    <defs>
      <clipPath id="replication-artwork-clip">
        <rect x="${ARTWORK_X + ARTWORK_INSET}" y="${ARTWORK_Y + ARTWORK_INSET}" width="${ARTWORK_IMAGE_WIDTH}" height="${ARTWORK_IMAGE_HEIGHT}" rx="16"/>
      </clipPath>
      <clipPath id="replication-creator-avatar-clip">
        <circle cx="${CREATOR_AVATAR_X + CREATOR_AVATAR_SIZE / 2}" cy="${CREATOR_AVATAR_Y + CREATOR_AVATAR_SIZE / 2}" r="${CREATOR_AVATAR_SIZE / 2}"/>
      </clipPath>
      <radialGradient id="replication-fallback-glow" cx="50%" cy="42%" r="64%">
        <stop offset="0%" stop-color="${SOCIAL_CARD_COLORS.accentMuted}" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="${SOCIAL_CARD_COLORS.surface}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="${SOCIAL_CARD_COLORS.background}"/>
    ${renderBrandLockup()}
    ${renderSocialCardTypeLockup("Replication Index", "hugeicons:camera-ai")}

    <rect x="${ARTWORK_X}" y="${ARTWORK_Y}" width="${ARTWORK_WIDTH}" height="${ARTWORK_FRAME_HEIGHT}" rx="24" fill="${SOCIAL_CARD_COLORS.surface}" stroke="${SOCIAL_CARD_COLORS.border}" stroke-width="2"/>
    ${
      artworkDataUri
        ? `<image href="${artworkDataUri}" x="${ARTWORK_X + ARTWORK_INSET}" y="${ARTWORK_Y + ARTWORK_INSET}" width="${ARTWORK_IMAGE_WIDTH}" height="${ARTWORK_IMAGE_HEIGHT}" preserveAspectRatio="xMidYMid slice" clip-path="url(#replication-artwork-clip)"/>`
        : `<g clip-path="url(#replication-artwork-clip)">
            <rect x="${ARTWORK_X + ARTWORK_INSET}" y="${ARTWORK_Y + ARTWORK_INSET}" width="${ARTWORK_IMAGE_WIDTH}" height="${ARTWORK_IMAGE_HEIGHT}" fill="${SOCIAL_CARD_COLORS.surfaceSecondary}"/>
            <rect x="${ARTWORK_X + ARTWORK_INSET}" y="${ARTWORK_Y + ARTWORK_INSET}" width="${ARTWORK_IMAGE_WIDTH}" height="${ARTWORK_IMAGE_HEIGHT}" fill="url(#replication-fallback-glow)"/>
            ${renderSocialCardIcon("hugeicons:camera-ai", 526, 292, 148, SOCIAL_CARD_COLORS.accentStrong)}
            <text x="600" y="548" text-anchor="middle" font-family="Blinker" font-size="${fallbackEffectSize}" font-weight="600" letter-spacing="-1" fill="${SOCIAL_CARD_COLORS.text}">${escapeSocialCardXml(input.effect.name)}</text>
            <text x="600" y="596" text-anchor="middle" font-family="Blinker" font-size="19" font-weight="600" letter-spacing="3.2" fill="${SOCIAL_CARD_COLORS.textFaint}">SUBJECTIVE EFFECT REPLICATION</text>
          </g>`
    }
    ${videoOverlay}

    ${
      creatorAvatarDataUri
        ? `<image href="${creatorAvatarDataUri}" x="${CREATOR_AVATAR_X}" y="${CREATOR_AVATAR_Y}" width="${CREATOR_AVATAR_SIZE}" height="${CREATOR_AVATAR_SIZE}" preserveAspectRatio="xMidYMid slice" clip-path="url(#replication-creator-avatar-clip)"/>`
        : `<circle cx="${CREATOR_AVATAR_X + CREATOR_AVATAR_SIZE / 2}" cy="${CREATOR_AVATAR_Y + CREATOR_AVATAR_SIZE / 2}" r="${CREATOR_AVATAR_SIZE / 2}" fill="${SOCIAL_CARD_COLORS.surfaceHighlight}"/>${renderSocialCardIcon("lucide:user-round", CREATOR_AVATAR_X + 13, CREATOR_AVATAR_Y + 13, 46, SOCIAL_CARD_COLORS.textMuted)}`
    }
    <text x="${CREATOR_TEXT_X}" y="862" font-family="Blinker" font-size="${artistSize}" font-weight="600" letter-spacing="-1.5" fill="${SOCIAL_CARD_COLORS.text}">${escapeSocialCardXml(fittedArtist)}</text>
    <text x="${CREATOR_TEXT_X}" y="914" font-family="Blinker" font-size="${titleSize}" font-weight="400" fill="${SOCIAL_CARD_COLORS.textSecondary}">${escapeSocialCardXml(fittedTitle)}</text>

    <line x1="${MARGIN}" y1="${METADATA_TOP}" x2="${SOCIAL_CARD_SIZE - MARGIN}" y2="${METADATA_TOP}" stroke="${SOCIAL_CARD_COLORS.border}" stroke-width="2"/>
    ${renderMetadataColumn("Associated effect", input.effect.name, MARGIN, 360, true)}
    ${renderMetadataColumn("Media", mediaValue, 460, 250)}
    ${renderMetadataColumn("Licence", rightsValue, 746, 398)}
    ${
      rightsholderLine
        ? `<text x="746" y="${METADATA_TOP + 137}" font-family="Blinker" font-size="24" fill="${SOCIAL_CARD_COLORS.textMuted}">${escapeSocialCardXml(rightsholderLine)}</text>`
        : ""
    }
  </svg>`;

  return renderSocialCardSvgPng(svg);
}
