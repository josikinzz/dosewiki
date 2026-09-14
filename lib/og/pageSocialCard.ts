import { readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { getCategoryIcon } from "../../src/data/config/categoryIcons";
import {
  PAGE_SOCIAL_CARD_SIZE,
  type PageSocialCardKey,
} from "../../src/data/mappings/pageSocialCardUrl";
import type { GalleryCounts } from "../../src/features/effects/gallery/galleryTypes";
import {
  renderTileRows,
  type TileSpec,
} from "./pageSocialCardTiles";
import {
  DOSEWIKI_LOGO_DATA_URI,
  SOCIAL_CARD_CJK_FONT_FAMILY,
  SOCIAL_CARD_COLORS,
  escapeSocialCardXml,
  fitSocialCardText,
  measureSocialCardText,
  renderDoseWikiWordmark,
  renderSocialCardIcon,
  renderSocialCardSvgPng,
} from "./socialCardPrimitives";

export const PAGE_SOCIAL_CARD_RENDER_VERSION = "8";

const SUBSTANCE_TILES: readonly TileSpec[] = [
  { labelLines: ["All"], iconName: "streamline-ultimate:science-molecule-strucutre-bold", selected: true },
  { labelLines: ["Hallucinogens"], iconName: getCategoryIcon("hallucinogens") },
  { labelLines: ["Psychedelic"], iconName: getCategoryIcon("psychedelic") },
  { labelLines: ["Dissociative"], iconName: getCategoryIcon("dissociative") },
  { labelLines: ["Deliriant"], iconName: getCategoryIcon("deliriant") },
  { labelLines: ["Cannabinoid"], iconName: getCategoryIcon("cannabinoid") },
  { labelLines: ["Entactogen"], iconName: getCategoryIcon("entactogen") },
  { labelLines: ["Stimulant"], iconName: getCategoryIcon("stimulant") },
  { labelLines: ["Nootropic"], iconName: getCategoryIcon("nootropic") },
  { labelLines: ["Depressants"], iconName: getCategoryIcon("depressants") },
  { labelLines: ["Sedative-", "hypnotics"], iconName: "solar:moon-sleep-linear" },
  { labelLines: ["Opioid"], iconName: getCategoryIcon("opioid") },
  { labelLines: ["Antidepressant"], iconName: getCategoryIcon("antidepressant") },
  { labelLines: ["Antipsychotic"], iconName: getCategoryIcon("antipsychotic") },
];

const EFFECT_TILES: readonly TileSpec[] = [
  { labelLines: ["All Effects"], iconName: "material-symbols:person-play-outline-rounded", selected: true },
  { labelLines: ["Sensory"], iconName: "lucide:eye" },
  { labelLines: ["Cognitive"], iconName: "fluent:thinking-24-regular" },
  { labelLines: ["Physical"], iconName: "lucide:activity" },
  { labelLines: ["More Info"], iconName: "lucide:info" },
];

const REPLICATION_TILES: readonly TileSpec[] = [
  { labelLines: ["Gallery"], iconName: "hugeicons:ai-image", selected: true },
  { labelLines: ["Tutorials"], iconName: "lucide:list" },
  { labelLines: ["Audio"], iconName: "lucide:audio-lines" },
  { labelLines: ["More Info"], iconName: "lucide:info" },
];

const HOME_TILES: readonly TileSpec[] = [
  { labelLines: ["Substances"], iconName: "streamline-ultimate:science-molecule-strucutre-bold" },
  { labelLines: ["Effects"], iconName: "material-symbols:person-play-outline-rounded" },
  { labelLines: ["Reports"], iconName: "hugeicons:content-writing" },
  { labelLines: ["Replications"], iconName: "hugeicons:camera-ai" },
  { labelLines: ["About"], iconName: "lucide:info" },
];

const ABOUT_TILES: readonly TileSpec[] = [
  { labelLines: ["Mission"], iconName: "lucide:compass", selected: true },
  { labelLines: ["Documentation"], iconName: "lucide:book-open" },
  { labelLines: ["Downloads"], iconName: "lucide:download" },
  { labelLines: ["Founders &", "Contributors"], iconName: "lucide:users" },
  { labelLines: ["Contact &", "Feedback"], iconName: "lucide:mail" },
];

function renderIconTitleRow(
  title: string,
  iconName: string,
  top: number,
  preferredTitleSize = 94,
): string {
  const iconSize = 132;
  const gap = 38;
  const titleSize = fitSocialCardText(title, preferredTitleSize, 62, 890, 600);
  const titleWidth = measureSocialCardText(title, titleSize, 600);
  const left =
    (PAGE_SOCIAL_CARD_SIZE - iconSize - gap - titleWidth) / 2;
  const baselineY = top + (iconSize + titleSize * 0.72) / 2;

  return `${renderSocialCardIcon(
    iconName,
    left,
    top,
    iconSize,
    SOCIAL_CARD_COLORS.accentStrong,
  )}
  <text x="${left + iconSize + gap}" y="${baselineY}" font-family="Blinker" font-size="${titleSize}" font-weight="600" letter-spacing="-1.5" fill="${SOCIAL_CARD_COLORS.accentStrong}">${escapeSocialCardXml(title)}</text>`;
}

function renderPageBrandLockup(): string {
  const wordmarkSize = 40;
  const wordmarkLeft = 126;
  const wordmarkWidth = measureSocialCardText(
    "dose.wiki",
    wordmarkSize,
    600,
  );

  return `<g>
    <image href="${DOSEWIKI_LOGO_DATA_URI}" x="54" y="45" width="58" height="58"/>
    ${renderDoseWikiWordmark(
      wordmarkLeft + wordmarkWidth / 2,
      91,
      wordmarkSize,
    )}
  </g>`;
}

function cardSvg(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_SOCIAL_CARD_SIZE}" height="${PAGE_SOCIAL_CARD_SIZE}" viewBox="0 0 ${PAGE_SOCIAL_CARD_SIZE} ${PAGE_SOCIAL_CARD_SIZE}">
    <defs>
      <linearGradient id="page-selected-base" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${SOCIAL_CARD_COLORS.selectedPrimary}"/>
        <stop offset="1" stop-color="${SOCIAL_CARD_COLORS.selectedSecondary}"/>
      </linearGradient>
      <radialGradient id="page-selected-highlight" cx="18%" cy="0%" r="70%">
        <stop offset="0" stop-color="${SOCIAL_CARD_COLORS.selectedHighlight}"/>
        <stop offset="42%" stop-color="${SOCIAL_CARD_COLORS.selectedHighlight}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="page-control-base" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${SOCIAL_CARD_COLORS.controlSurface}"/>
        <stop offset="1" stop-color="${SOCIAL_CARD_COLORS.controlSecondary}"/>
      </linearGradient>
      <radialGradient id="page-control-highlight" cx="12%" cy="0%" r="72%">
        <stop offset="0" stop-color="${SOCIAL_CARD_COLORS.controlHighlight}"/>
        <stop offset="36%" stop-color="${SOCIAL_CARD_COLORS.controlHighlight}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="${SOCIAL_CARD_COLORS.background}"/>
    ${body}
    ${renderPageBrandLockup()}
  </svg>`;
}

function renderHomeCard(): Buffer {
  return renderSocialCardSvgPng(
    cardSvg(`
      <image href="${DOSEWIKI_LOGO_DATA_URI}" x="495" y="72" width="210" height="210"/>
      ${renderDoseWikiWordmark(600, 410, 112)}
      <text x="600" y="480" text-anchor="middle" font-family="Blinker" font-size="34" font-style="italic" fill="${SOCIAL_CARD_COLORS.textMuted}">An open encyclopedic database for the study of psychopharmacology</text>
      ${renderTileRows([HOME_TILES.slice(0, 3), HOME_TILES.slice(3)], {
        top: 550,
        tileWidth: 210,
        tileHeight: 252,
        columnGap: 42,
        rowGap: 34,
        labelSize: 30,
      })}
    `),
  );
}

async function renderEffectsCard(): Promise<Buffer> {
  const avatar = await sharp(
    path.join(process.cwd(), "public/profile-avatars/josie/avatar.webp"),
  )
    .png()
    .toBuffer();
  const avatarDataUri = `data:image/png;base64,${avatar.toString("base64")}`;
  const creatorFontSize = 28;
  const creatorAvatarSize = 48;
  const creatorGap = 18;
  const creatorPaddingX = 18;
  const creatorTextWidth =
    measureSocialCardText("created by ", creatorFontSize) +
    measureSocialCardText("Josie Kins", creatorFontSize, 600) +
    measureSocialCardText(", 2011", creatorFontSize);
  const creatorBadgeWidth = Math.ceil(
    creatorPaddingX * 2 +
      creatorAvatarSize +
      creatorGap +
      creatorTextWidth,
  );
  const creatorBadgeLeft =
    (PAGE_SOCIAL_CARD_SIZE - creatorBadgeWidth) / 2;
  const creatorAvatarLeft = creatorBadgeLeft + creatorPaddingX;
  const creatorTextLeft =
    creatorAvatarLeft + creatorAvatarSize + creatorGap;

  return renderSocialCardSvgPng(
    cardSvg(`
      <defs><clipPath id="creator-avatar"><circle cx="${creatorAvatarLeft + creatorAvatarSize / 2}" cy="330" r="${creatorAvatarSize / 2}"/></clipPath></defs>
      ${renderIconTitleRow(
        "Subjective Effect Index",
        "material-symbols:person-play-outline-rounded",
        142,
        88,
      )}
      <g>
        <rect x="${creatorBadgeLeft}" y="292" width="${creatorBadgeWidth}" height="76" rx="38" fill="${SOCIAL_CARD_COLORS.surface}" stroke="${SOCIAL_CARD_COLORS.border}" stroke-width="2"/>
        <image href="${avatarDataUri}" x="${creatorAvatarLeft}" y="306" width="${creatorAvatarSize}" height="${creatorAvatarSize}" clip-path="url(#creator-avatar)" preserveAspectRatio="xMidYMid slice"/>
        <text x="${creatorTextLeft}" y="340" font-family="Blinker" font-size="${creatorFontSize}" fill="${SOCIAL_CARD_COLORS.textMuted}">created by <tspan fill="${SOCIAL_CARD_COLORS.text}" font-weight="600">Josie Kins</tspan><tspan fill="${SOCIAL_CARD_COLORS.textFaint}">, 2011</tspan></text>
      </g>
      ${renderTileRows([EFFECT_TILES.slice(0, 3), EFFECT_TILES.slice(3)], {
        top: 460,
        tileWidth: 230,
        tileHeight: 280,
        columnGap: 42,
        rowGap: 70,
        labelSize: 31,
      })}
    `),
  );
}

function renderSubstancesCard(): Buffer {
  return renderSocialCardSvgPng(
    cardSvg(`
      ${renderIconTitleRow(
        "Substance Index",
        "streamline-ultimate:science-molecule-strucutre-bold",
        142,
      )}
      ${renderTileRows(
        [
          SUBSTANCE_TILES.slice(0, 5),
          SUBSTANCE_TILES.slice(5, 10),
          SUBSTANCE_TILES.slice(10),
        ],
        {
          top: 300,
          tileWidth: 170,
          tileHeight: 220,
          columnGap: 34,
          rowGap: 40,
          labelSize: 26,
        },
      )}
    `),
  );
}

async function renderReplicationsCard(counts: GalleryCounts): Promise<Buffer> {
  const artwork = await sharp(
    path.join(
      process.cwd(),
      "src/assets/replications-after-images-chelsea-morgan.webp",
    ),
  )
    .png()
    .toBuffer();
  const artworkDataUri = `data:image/png;base64,${artwork.toString("base64")}`;
  const stats = [
    ["Replications", counts.total],
    ["Artists", counts.artists],
    ["Images", counts.images],
    ["Videos", counts.videos],
  ] as const;
  const statsMarkup = stats.map(([label, count], index) => {
    // Round down so the abbreviated lower bound never overstates the archive.
    const value = count >= 1000
      ? `${Math.floor(count / 100) / 10}k+`
      : String(count);
    return `<text x="${210 + index * 260}" y="302" text-anchor="middle" font-family="Blinker" font-size="28" fill="${SOCIAL_CARD_COLORS.textMuted}">${label}: <tspan font-weight="600" fill="${SOCIAL_CARD_COLORS.accentStrong}">${value}</tspan></text>`;
  }).join("");

  return renderSocialCardSvgPng(
    cardSvg(`
      <defs>
        <clipPath id="featured-replication">
          <rect x="108" y="308" width="984" height="553" rx="20"/>
        </clipPath>
      </defs>
      ${renderIconTitleRow(
        "Replications",
        "hugeicons:camera-ai",
        56,
        92,
      )}
      <text x="600" y="248" text-anchor="middle" font-family="Blinker" font-size="32" fill="${SOCIAL_CARD_COLORS.textMuted}">Image, video, and audio recreations of subjective effects</text>
      ${statsMarkup}
      <g transform="translate(0 54)">
        <rect x="90" y="290" width="1020" height="640" rx="28" fill="${SOCIAL_CARD_COLORS.surface}" stroke="${SOCIAL_CARD_COLORS.border}" stroke-width="2"/>
        <image href="${artworkDataUri}" x="108" y="308" width="984" height="553" clip-path="url(#featured-replication)" preserveAspectRatio="xMidYMid slice"/>
        ${renderSocialCardIcon(
          "hugeicons:ai-image",
          120,
          879,
          28,
          SOCIAL_CARD_COLORS.accentStrong,
        )}
        <text x="162" y="903" font-family="Blinker" font-size="28" font-weight="600" fill="${SOCIAL_CARD_COLORS.text}">After images</text>
        <text x="326" y="903" font-family="Blinker" font-size="27" fill="${SOCIAL_CARD_COLORS.textFaint}">by Chelsea Morgan</text>
      </g>
      ${renderTileRows([REPLICATION_TILES], {
        top: 1012,
        tileWidth: 116,
        tileHeight: 156,
        columnGap: 56,
        rowGap: 0,
        labelSize: 24,
      })}
    `),
  );
}

function renderChemicalClassesCard(): Buffer {
  return renderSocialCardSvgPng(
    cardSvg(`
      ${renderIconTitleRow(
        "Chemical Class Index",
        "solar:benzene-ring-linear",
        124,
        88,
      )}
      <text x="600" y="318" text-anchor="middle" font-family="Blinker" font-size="31" fill="${SOCIAL_CARD_COLORS.textMuted}">Structural lineages from broad scaffolds to specific families</text>
      <g>
        <rect x="94" y="370" width="1012" height="740" rx="28" fill="${SOCIAL_CARD_COLORS.surface}" stroke="${SOCIAL_CARD_COLORS.border}" stroke-width="2"/>
        <path
          d="M146 462V548H218 M230 560V646H302 M314 658V744H386 M398 756V1038 M398 842H470 M398 940H470 M398 1038H470"
          fill="none"
          stroke="${SOCIAL_CARD_COLORS.accentMuted}"
          stroke-opacity="0.72"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <g fill="${SOCIAL_CARD_COLORS.surface}" stroke="${SOCIAL_CARD_COLORS.accentStrong}" stroke-width="3">
          <circle cx="146" cy="450" r="10"/>
          <circle cx="230" cy="548" r="10"/>
          <circle cx="314" cy="646" r="10"/>
          <circle cx="398" cy="744" r="10"/>
          <circle cx="482" cy="842" r="10"/>
          <circle cx="482" cy="940" r="10"/>
          <circle cx="482" cy="1038" r="10"/>
        </g>
        <g font-family="Blinker" font-weight="500" fill="${SOCIAL_CARD_COLORS.accentStrong}">
          <text x="170" y="463" font-size="36">Amine <tspan fill="${SOCIAL_CARD_COLORS.textFaint}" font-size="27">· 204</tspan></text>
          <text x="254" y="561" font-size="35">Arylalkylamine <tspan fill="${SOCIAL_CARD_COLORS.textFaint}" font-size="26">· 133</tspan></text>
          <text x="338" y="659" font-size="34">Phenethylamine <tspan fill="${SOCIAL_CARD_COLORS.textFaint}" font-size="26">· 76</tspan></text>
          <text x="422" y="757" font-size="32">Alpha-methylphenethylamine <tspan fill="${SOCIAL_CARD_COLORS.textFaint}" font-size="25">· 49</tspan></text>
          <text x="506" y="855" font-size="30">Beta-ketoamphetamine <tspan fill="${SOCIAL_CARD_COLORS.textFaint}" font-size="24">· 18</tspan></text>
          <text x="506" y="953" font-size="30">2,5-Dimethoxyamphetamine <tspan fill="${SOCIAL_CARD_COLORS.textFaint}" font-size="24">· 10</tspan></text>
          <text x="506" y="1051" font-size="30">1,2-Diarylethylamine <tspan fill="${SOCIAL_CARD_COLORS.textFaint}" font-size="24">· 3</tspan></text>
        </g>
      </g>
    `),
  );
}

function renderAboutCard(): Buffer {
  return renderSocialCardSvgPng(
    cardSvg(`
      <image href="${DOSEWIKI_LOGO_DATA_URI}" x="490" y="62" width="220" height="220"/>
      <text x="600" y="402" text-anchor="middle" font-family="Blinker" font-size="90" font-weight="600" letter-spacing="-1.5" fill="${SOCIAL_CARD_COLORS.accentStrong}">About <tspan fill="${SOCIAL_CARD_COLORS.text}">dose</tspan><tspan fill="${SOCIAL_CARD_COLORS.accentStrong}">.wiki</tspan></text>
      <text x="600" y="482" text-anchor="middle" font-family="Blinker" font-size="34" fill="${SOCIAL_CARD_COLORS.textMuted}">An open encyclopedic database for the study of</text>
      <text x="600" y="526" text-anchor="middle" font-family="Blinker" font-size="34" fill="${SOCIAL_CARD_COLORS.textMuted}">psychopharmacology</text>
      ${renderTileRows([ABOUT_TILES.slice(0, 3), ABOUT_TILES.slice(3)], {
        top: 570,
        tileWidth: 210,
        tileHeight: 250,
        columnGap: 42,
        rowGap: 30,
        labelSize: 28,
      })}
    `),
  );
}

/** The /china gift page: the arm-wrestle banner free-floating on the black canvas, captioned in both languages. */
async function renderChinaCard(): Promise<Buffer> {
  const banner = await sharp(
    path.join(process.cwd(), "public/images/downloads/dosewiki-freeodwiki-banner.webp"),
  )
    .png()
    .toBuffer();
  const bannerDataUri = `data:image/png;base64,${banner.toString("base64")}`;
  const cjk = SOCIAL_CARD_CJK_FONT_FAMILY;
  // Counts come from the published pack manifest so the card never drifts from the download page.
  const manifest = JSON.parse(
    await readFile(path.join(process.cwd(), "public/downloads/zh-Hans/manifest.json"), "utf8"),
  ) as { datasets: { id: string; packs: Record<string, { items: number }> }[] };
  const countOf = (id: string): number => {
    const dataset = manifest.datasets.find((entry) => entry.id === id);
    if (!dataset) throw new Error(`China card: dataset ${id} missing from the pack manifest`);
    return dataset.packs["zh-Hans"].items;
  };
  const molecules = JSON.parse(
    await readFile(path.join(process.cwd(), "public/dosewiki-molecules.json"), "utf8"),
  ) as { count: number };
  const stats = [
    ["Substances", "物质", countOf("substances")],
    ["Effects", "效应", countOf("effects")],
    ["Reports", "报告", countOf("reports")],
    ["Articles", "文章", countOf("articles")],
    ["Molecules", "分子", molecules.count],
  ] as const;
  const statsMarkup = stats.map(([label, labelZh, count], index) => {
    const x = 120 + index * 240;
    return `<text x="${x}" y="898" text-anchor="middle" font-family="Blinker" font-size="60" font-weight="600" letter-spacing="-1" fill="${SOCIAL_CARD_COLORS.accentStrong}">${count.toLocaleString("en-GB")}</text>
      <text x="${x}" y="936" text-anchor="middle" font-family="${cjk}" font-size="26" fill="${SOCIAL_CARD_COLORS.textMuted}">${label}&#160;&#160;${labelZh}</text>`;
  }).join("");

  return renderSocialCardSvgPng(
    cardSvg(`
      <text x="600" y="214" text-anchor="middle" font-family="Blinker" font-size="104" font-weight="600" letter-spacing="-1.5" fill="${SOCIAL_CARD_COLORS.text}">dose<tspan fill="${SOCIAL_CARD_COLORS.accentStrong}">.wiki/</tspan>china</text>
      <text x="600" y="286" text-anchor="middle" font-family="${cjk}" font-size="54" font-weight="600" fill="${SOCIAL_CARD_COLORS.accentStrong}">简体中文数据集</text>
      <defs>
        <!-- Same recipe as .theme-cutout-glow (accent halo plus a thin white rim) but spread wider: the card is seen as a thumbnail, where the site's tight glow vanishes. -->
        <filter id="china-cutout-glow" x="-15%" y="-30%" width="130%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="18" flood-color="${SOCIAL_CARD_COLORS.accentStrong}" flood-opacity="0.34"/>
          <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="${SOCIAL_CARD_COLORS.text}" flood-opacity="0.2"/>
        </filter>
      </defs>
      <image href="${bannerDataUri}" x="110" y="320" width="980" height="470" preserveAspectRatio="xMidYMid meet" filter="url(#china-cutout-glow)"/>
      ${statsMarkup}
      <text x="600" y="1030" text-anchor="middle" font-family="${cjk}" font-size="44" font-weight="600" fill="${SOCIAL_CARD_COLORS.text}">Download the dataset<tspan fill="${SOCIAL_CARD_COLORS.textFaint}">&#160;&#160;·&#160;&#160;</tspan>下载数据集</text>
      <text x="600" y="1088" text-anchor="middle" font-family="${cjk}" font-size="30" fill="${SOCIAL_CARD_COLORS.textMuted}">Packs in Chinese and English<tspan fill="${SOCIAL_CARD_COLORS.textFaint}">&#160;&#160;·&#160;&#160;</tspan>中英文数据包</text>
    `),
  );
}

async function renderLanguagesCard(): Promise<Buffer> {
  const languages = [
    ["cn", "Chinese"],
    ["nl", "Dutch"],
    ["pl", "Polish"],
    ["cz", "Czech"],
    ["fr", "French"],
    ["de", "German"],
  ] as const;
  const flags = await Promise.all(languages.map(async ([code, label], index) => {
    const svg = await readFile(path.join(process.cwd(), `public/flags/${code}.svg`));
    const x = 330 + (index % 3) * 270;
    const y = 430 + Math.floor(index / 3) * 220;
    return `<image href="data:image/svg+xml;base64,${svg.toString("base64")}" x="${x - 62}" y="${y - 62}" width="124" height="124"/>
      <text x="${x}" y="${y + 108}" text-anchor="middle" font-family="Blinker" font-size="34" fill="${SOCIAL_CARD_COLORS.text}">${label}</text>`;
  }));
  const placeholders = [465, 600, 735].map((x) =>
    `<circle cx="${x}" cy="904" r="40" fill="none" stroke="${SOCIAL_CARD_COLORS.textFaint}" stroke-width="3" stroke-dasharray="8 9"/>`,
  ).join("");

  return renderSocialCardSvgPng(cardSvg(`
    <text x="600" y="265" text-anchor="middle" font-family="Blinker" font-size="104" font-weight="600" letter-spacing="-1.5" fill="${SOCIAL_CARD_COLORS.accentStrong}">Languages</text>
    ${flags.join("")}
    ${placeholders}
    <text x="600" y="1010" text-anchor="middle" font-family="Blinker" font-size="32" fill="${SOCIAL_CARD_COLORS.textMuted}">More languages to come</text>
    <text x="600" y="1110" text-anchor="middle" font-family="Blinker" font-size="30" fill="${SOCIAL_CARD_COLORS.textFaint}">dose.wiki/languages/</text>
  `));
}

export async function renderPageSocialCardPng(
  key: PageSocialCardKey,
  replicationCounts?: GalleryCounts,
): Promise<Buffer> {
  switch (key) {
    case "home":
      return renderHomeCard();
    case "substances":
      return renderSubstancesCard();
    case "effects":
      return await renderEffectsCard();
    case "replications":
      if (!replicationCounts) {
        throw new Error("Replication social cards require current gallery counts.");
      }
      return await renderReplicationsCard(replicationCounts);
    case "chemical-classes":
      return renderChemicalClassesCard();
    case "about":
      return renderAboutCard();
    case "china":
      return await renderChinaCard();
    case "languages":
      return await renderLanguagesCard();
  }
}
