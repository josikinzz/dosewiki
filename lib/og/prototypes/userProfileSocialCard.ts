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
export const USER_PROFILE_SOCIAL_CARD_RENDERER_VERSION = "2026-08-25.1";

/**
 * A profile-as-portrait social card: identity owns the upper field, while one
 * artwork sits below as evidence rather than competing hero content. The
 * composition inherits dose.wiki's Fun/dark social-card world—pure black,
 * Blinker, orchid accents, upper-left lighting, and the compact brand lockup.
 */

type UserProfileSocialCardMedia = {
  filePath: string;
}

type UserProfileSocialCardReplication = {
  slug: string;
  title: string;
  creatorLabel: string;
  media: UserProfileSocialCardMedia;
}

export type UserProfileSocialCardInput = {
  displayName: string;
  bioExcerpt: string;
  roles: readonly string[];
  avatar?: UserProfileSocialCardMedia;
  featuredReplication?: UserProfileSocialCardReplication;
};


const PORTRAIT_LAYOUT = Object.freeze({
  brandLogoLeft: 54,
  brandLogoTop: 45,
  brandLogoSize: 58,
  brandWordmarkLeft: 126,
  brandWordmarkBaseline: 91,
  brandWordmarkSize: 40,
  contentRight: 1128,
  avatarLeft: 72,
  avatarTop: 176,
  avatarSize: 344,
  identityLeft: 464,
  identityTop: 204,
  identityWidth: 664,
  namePreferredSize: 104,
  nameMinimumSize: 64,
  roleTop: 330,
  roleHeight: 56,
  roleBaselineOffset: 37,
  roleFontSize: 26,
  roleHorizontalPadding: 22,
  roleGap: 12,
  bioTop: 432,
  bioFontSize: 34,
  bioLineHeight: 46,
  bioMaxLines: 4,
});

const FEATURED_LAYOUT = Object.freeze({
  contentRight: 1128,
  avatarLeft: 72,
  avatarTop: 150,
  avatarSize: 220,
  identityLeft: 328,
  identityTop: 148,
  identityWidth: 800,
  namePreferredSize: 84,
  nameMinimumSize: 54,
  roleTop: 250,
  roleHeight: 50,
  roleBaselineOffset: 34,
  roleFontSize: 24,
  roleHorizontalPadding: 20,
  roleGap: 12,
  bioTop: 344,
  bioFontSize: 29,
  bioLineHeight: 38,
  bioMaxLines: 3,
  featureLeft: 72,
  featureTop: 452,
  featureWidth: 1056,
  featureHeight: 608,
  featureRadius: 24,
  artworkLeft: 88,
  artworkTop: 468,
  artworkWidth: 1024,
  artworkHeight: 576,
  artworkRadius: 16,
  featureTextLeft: 72,
  featureArtistBaseline: 1112,
  featureArtistPreferredSize: 48,
  featureArtistMinimumSize: 34,
  featureArtistWidth: 720,
  featureTitleBaseline: 1156,
  featureTitlePreferredSize: 27,
  featureTitleMinimumSize: 20,
  featureTitleWidth: 720,
  featureMetaIconLeft: 836,
  featureMetaIconTop: 1133,
  featureMetaIconSize: 24,
  featureMetaTextLeft: 872,
  featureMetaBaseline: 1156,
  featureMetaFontSize: 22,
});

type ProfileIdentityLayout = typeof PORTRAIT_LAYOUT | typeof FEATURED_LAYOUT;

function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  maxLines: number,
  fontWeight = 400,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let line = "";
  for (let index = 0; index < words.length; index += 1) {
    const candidate = line ? `${line} ${words[index]}` : words[index];
    if (
      !line ||
      measureSocialCardText(candidate, fontSize, fontWeight) <= maxWidth
    ) {
      line = candidate;
      continue;
    }

    lines.push(line);
    line = words[index];
    if (lines.length === maxLines - 1) {
      const remainder = [line, ...words.slice(index + 1)].join(" ");
      let truncated = remainder;
      while (
        truncated.length > 1 &&
        measureSocialCardText(`${truncated}…`, fontSize, fontWeight) > maxWidth
      ) {
        truncated = truncated.slice(0, truncated.lastIndexOf(" "));
      }
      lines.push(
        truncated === remainder ? remainder : `${truncated.replace(/[.,;:]$/, "")}…`,
      );
      return lines;
    }
  }

  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

function ellipsizeText(
  text: string,
  fontSize: number,
  maxWidth: number,
  fontWeight: number,
): string {
  if (measureSocialCardText(text, fontSize, fontWeight) <= maxWidth) return text;

  let truncated = text.trim();
  while (
    truncated.length > 1 &&
    measureSocialCardText(`${truncated}…`, fontSize, fontWeight) > maxWidth
  ) {
    const wordBreak = truncated.lastIndexOf(" ");
    truncated =
      wordBreak > 0 ? truncated.slice(0, wordBreak) : truncated.slice(0, -1);
  }
  return `${truncated.trimEnd()}…`;
}

function renderBrandLockup(): string {
  const wordmarkWidth = measureSocialCardText(
    "dose.wiki",
    PORTRAIT_LAYOUT.brandWordmarkSize,
    600,
  );

  return `<g>
    <image href="${DOSEWIKI_LOGO_DATA_URI}" x="${PORTRAIT_LAYOUT.brandLogoLeft}" y="${PORTRAIT_LAYOUT.brandLogoTop}" width="${PORTRAIT_LAYOUT.brandLogoSize}" height="${PORTRAIT_LAYOUT.brandLogoSize}"/>
    ${renderDoseWikiWordmark(
      PORTRAIT_LAYOUT.brandWordmarkLeft + wordmarkWidth / 2,
      PORTRAIT_LAYOUT.brandWordmarkBaseline,
      PORTRAIT_LAYOUT.brandWordmarkSize,
    )}
  </g>`;
}

function renderRoleChips(
  roles: readonly string[],
  layout: ProfileIdentityLayout,
): string {
  const chips: string[] = [];
  let left = layout.identityLeft;
  const visibleRoles = roles.filter((role) => role.trim()).slice(0, 3);

  for (const role of visibleRoles) {
    const label = role.trim();
    const availableWidth = layout.contentRight - left;
    if (availableWidth < 120) break;

    const fontSize = fitSocialCardText(
      label,
      layout.roleFontSize,
      20,
      Math.max(120, availableWidth - layout.roleHorizontalPadding * 2),
      600,
    );
    const fittedLabel = ellipsizeText(
      label,
      fontSize,
      Math.max(60, availableWidth - layout.roleHorizontalPadding * 2),
      600,
    );
    const width = Math.min(
      availableWidth,
      Math.ceil(
        measureSocialCardText(fittedLabel, fontSize, 600) +
          layout.roleHorizontalPadding * 2,
      ),
    );

    chips.push(`<g>
      <rect x="${left}" y="${layout.roleTop}" width="${width}" height="${layout.roleHeight}" rx="${layout.roleHeight / 2}" fill="${SOCIAL_CARD_COLORS.selectedSecondary}" stroke="${SOCIAL_CARD_COLORS.borderSelected}" stroke-width="2"/>
      <text x="${left + width / 2}" y="${layout.roleTop + layout.roleBaselineOffset}" text-anchor="middle" font-family="Blinker" font-size="${fontSize}" font-weight="600" fill="${SOCIAL_CARD_COLORS.accentStrong}">${escapeSocialCardXml(fittedLabel)}</text>
    </g>`);
    left += width + layout.roleGap;
  }

  return chips.join("\n");
}

async function renderMediaDataUri(
  media: UserProfileSocialCardMedia,
  width: number,
  height: number,
  fit: "cover" | "contain",
): Promise<string> {
  const png = await sharp(media.filePath)
    .resize(width, height, {
      fit,
      position: "centre",
      background: SOCIAL_CARD_COLORS.background,
    })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

function renderBioExcerpt(
  bioExcerpt: string,
  layout: ProfileIdentityLayout,
): string {
  const lines = wrapText(
    bioExcerpt,
    layout.identityWidth,
    layout.bioFontSize,
    layout.bioMaxLines,
  );

  return lines
    .map(
      (line, index) =>
        `<text x="${layout.identityLeft}" y="${layout.bioTop + index * layout.bioLineHeight}" font-family="Blinker" font-size="${layout.bioFontSize}" font-weight="400" fill="${SOCIAL_CARD_COLORS.textSecondary}">${escapeSocialCardXml(line)}</text>`,
    )
    .join("\n");
}

function renderFeaturedReplication(
  replication: UserProfileSocialCardReplication,
  artworkDataUri: string,
): string {
  const artistSize = fitSocialCardText(
    replication.creatorLabel,
    FEATURED_LAYOUT.featureArtistPreferredSize,
    FEATURED_LAYOUT.featureArtistMinimumSize,
    FEATURED_LAYOUT.featureArtistWidth,
    600,
  );
  const fittedArtist = ellipsizeText(
    replication.creatorLabel,
    artistSize,
    FEATURED_LAYOUT.featureArtistWidth,
    600,
  );
  const titleSize = fitSocialCardText(
    replication.title,
    FEATURED_LAYOUT.featureTitlePreferredSize,
    FEATURED_LAYOUT.featureTitleMinimumSize,
    FEATURED_LAYOUT.featureTitleWidth,
    400,
  );
  const fittedTitle = ellipsizeText(
    replication.title,
    titleSize,
    FEATURED_LAYOUT.featureTitleWidth,
    400,
  );

  return `<g>
    <rect x="${FEATURED_LAYOUT.featureLeft}" y="${FEATURED_LAYOUT.featureTop}" width="${FEATURED_LAYOUT.featureWidth}" height="${FEATURED_LAYOUT.featureHeight}" rx="${FEATURED_LAYOUT.featureRadius}" fill="${SOCIAL_CARD_COLORS.surface}" stroke="${SOCIAL_CARD_COLORS.border}" stroke-width="2"/>
    <rect x="${FEATURED_LAYOUT.artworkLeft}" y="${FEATURED_LAYOUT.artworkTop}" width="${FEATURED_LAYOUT.artworkWidth}" height="${FEATURED_LAYOUT.artworkHeight}" rx="${FEATURED_LAYOUT.artworkRadius}" fill="${SOCIAL_CARD_COLORS.background}"/>
    <image href="${artworkDataUri}" x="${FEATURED_LAYOUT.artworkLeft}" y="${FEATURED_LAYOUT.artworkTop}" width="${FEATURED_LAYOUT.artworkWidth}" height="${FEATURED_LAYOUT.artworkHeight}" clip-path="url(#profile-artwork-clip)" preserveAspectRatio="xMidYMid slice"/>
    <text x="${FEATURED_LAYOUT.featureTextLeft}" y="${FEATURED_LAYOUT.featureArtistBaseline}" font-family="Blinker" font-size="${artistSize}" font-weight="600" letter-spacing="-1" fill="${SOCIAL_CARD_COLORS.text}">${escapeSocialCardXml(fittedArtist)}</text>
    <text x="${FEATURED_LAYOUT.featureTextLeft}" y="${FEATURED_LAYOUT.featureTitleBaseline}" font-family="Blinker" font-size="${titleSize}" font-weight="400" fill="${SOCIAL_CARD_COLORS.textMuted}">${escapeSocialCardXml(fittedTitle)}</text>
    ${renderSocialCardIcon(
      "hugeicons:ai-image",
      FEATURED_LAYOUT.featureMetaIconLeft,
      FEATURED_LAYOUT.featureMetaIconTop,
      FEATURED_LAYOUT.featureMetaIconSize,
      SOCIAL_CARD_COLORS.accentStrong,
    )}
    <text x="${FEATURED_LAYOUT.featureMetaTextLeft}" y="${FEATURED_LAYOUT.featureMetaBaseline}" font-family="Blinker" font-size="${FEATURED_LAYOUT.featureMetaFontSize}" font-weight="600" fill="${SOCIAL_CARD_COLORS.accentMuted}">Featured replication</text>
  </g>`;
}

export async function renderUserProfileSocialCardPng(
  input: UserProfileSocialCardInput,
): Promise<Buffer> {
  const identityLayout = input.featuredReplication
    ? FEATURED_LAYOUT
    : PORTRAIT_LAYOUT;
  const [avatarDataUri, artworkDataUri] = await Promise.all([
    input.avatar
      ? renderMediaDataUri(
          input.avatar,
          identityLayout.avatarSize,
          identityLayout.avatarSize,
          "cover",
        )
      : Promise.resolve(null),
    input.featuredReplication
      ? renderMediaDataUri(
          input.featuredReplication.media,
          FEATURED_LAYOUT.artworkWidth,
          FEATURED_LAYOUT.artworkHeight,
          "cover",
        )
      : Promise.resolve(null),
  ]);
  const nameSize = fitSocialCardText(
    input.displayName,
    identityLayout.namePreferredSize,
    identityLayout.nameMinimumSize,
    identityLayout.identityWidth,
    600,
  );
  const fittedName = ellipsizeText(
    input.displayName,
    nameSize,
    identityLayout.identityWidth,
    600,
  );
  const feature =
    input.featuredReplication && artworkDataUri
      ? renderFeaturedReplication(input.featuredReplication, artworkDataUri)
      : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SOCIAL_CARD_SIZE}" height="${SOCIAL_CARD_SIZE}" viewBox="0 0 ${SOCIAL_CARD_SIZE} ${SOCIAL_CARD_SIZE}">
    <defs>
      <clipPath id="profile-avatar-clip">
        <circle cx="${identityLayout.avatarLeft + identityLayout.avatarSize / 2}" cy="${identityLayout.avatarTop + identityLayout.avatarSize / 2}" r="${identityLayout.avatarSize / 2}"/>
      </clipPath>
      <clipPath id="profile-artwork-clip">
        <rect x="${FEATURED_LAYOUT.artworkLeft}" y="${FEATURED_LAYOUT.artworkTop}" width="${FEATURED_LAYOUT.artworkWidth}" height="${FEATURED_LAYOUT.artworkHeight}" rx="${FEATURED_LAYOUT.artworkRadius}"/>
      </clipPath>
      <radialGradient id="profile-avatar-ring" cx="18%" cy="0%" r="90%">
        <stop offset="0" stop-color="${SOCIAL_CARD_COLORS.accentStrong}"/>
        <stop offset="1" stop-color="${SOCIAL_CARD_COLORS.accentMuted}"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="${SOCIAL_CARD_COLORS.background}"/>
    ${renderBrandLockup()}
    ${renderSocialCardTypeLockup("User Profile", "lucide:user-round")}
    <circle cx="${identityLayout.avatarLeft + identityLayout.avatarSize / 2}" cy="${identityLayout.avatarTop + identityLayout.avatarSize / 2}" r="${identityLayout.avatarSize / 2 + 6}" fill="none" stroke="url(#profile-avatar-ring)" stroke-width="4"/>
    ${
      avatarDataUri
        ? `<image href="${avatarDataUri}" x="${identityLayout.avatarLeft}" y="${identityLayout.avatarTop}" width="${identityLayout.avatarSize}" height="${identityLayout.avatarSize}" clip-path="url(#profile-avatar-clip)" preserveAspectRatio="xMidYMid slice"/>`
        : renderSocialCardIcon("lucide:user-round", identityLayout.avatarLeft + identityLayout.avatarSize * 0.2, identityLayout.avatarTop + identityLayout.avatarSize * 0.2, identityLayout.avatarSize * 0.6, SOCIAL_CARD_COLORS.textMuted)
    }
    <text x="${identityLayout.identityLeft}" y="${identityLayout.identityTop + nameSize}" font-family="Blinker" font-size="${nameSize}" font-weight="600" letter-spacing="-1.5" fill="${SOCIAL_CARD_COLORS.text}">${escapeSocialCardXml(fittedName)}</text>
    ${renderRoleChips(input.roles, identityLayout)}
    ${renderBioExcerpt(input.bioExcerpt, identityLayout)}
    ${feature}
  </svg>`;

  return renderSocialCardSvgPng(svg);
}
