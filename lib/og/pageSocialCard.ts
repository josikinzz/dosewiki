import path from "node:path";

import sharp from "sharp";

import { getCategoryIcon } from "../../src/data/config/categoryIcons";
import {
  PAGE_SOCIAL_CARD_SIZE,
  type PageSocialCardKey,
} from "../../src/data/mappings/pageSocialCardUrl";
import {
  DOSEWIKI_LOGO_DATA_URI,
  SOCIAL_CARD_COLORS,
  escapeSocialCardXml,
  fitSocialCardText,
  renderDoseWikiWordmark,
  renderSocialCardIcon,
  renderSocialCardSvgPng,
} from "./socialCardPrimitives";

export const PAGE_SOCIAL_CARD_RENDER_VERSION = "1";

type TileSpec = {
  labelLines: readonly string[];
  iconName: string;
  selected?: boolean;
};

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

function renderTile(
  spec: TileSpec,
  x: number,
  y: number,
  width: number,
  height: number,
  iconSize: number,
  labelSize: number,
): string {
  const iconX = x + (width - iconSize) / 2;
  const iconY = y + Math.max(24, (height - iconSize - spec.labelLines.length * labelSize * 1.08) / 2 - 3);
  const labelStartY = y + height - 26 - (spec.labelLines.length - 1) * labelSize * 1.08;
  const fill = spec.selected ? SOCIAL_CARD_COLORS.surfaceSelected : SOCIAL_CARD_COLORS.surface;
  const stroke = spec.selected ? SOCIAL_CARD_COLORS.borderSelected : SOCIAL_CARD_COLORS.border;

  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="24" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
    ${renderSocialCardIcon(spec.iconName, iconX, iconY, iconSize)}
    ${spec.labelLines
      .map(
        (line, index) =>
          `<text x="${x + width / 2}" y="${labelStartY + index * labelSize * 1.08}" text-anchor="middle" font-family="Blinker" font-size="${labelSize}" font-weight="${spec.selected ? 600 : 400}" fill="${spec.selected ? SOCIAL_CARD_COLORS.text : SOCIAL_CARD_COLORS.textMuted}">${escapeSocialCardXml(line)}</text>`,
      )
      .join("\n")}
  </g>`;
}

function renderTileRows(
  rows: readonly (readonly TileSpec[])[],
  options: {
    top: number;
    tileWidth: number;
    tileHeight: number;
    columnGap: number;
    rowGap: number;
    iconSize: number;
    labelSize: number;
  },
): string {
  return rows
    .flatMap((row, rowIndex) => {
      const rowWidth = row.length * options.tileWidth + (row.length - 1) * options.columnGap;
      const left = (PAGE_SOCIAL_CARD_SIZE - rowWidth) / 2;
      return row.map((tile, columnIndex) =>
        renderTile(
          tile,
          left + columnIndex * (options.tileWidth + options.columnGap),
          options.top + rowIndex * (options.tileHeight + options.rowGap),
          options.tileWidth,
          options.tileHeight,
          options.iconSize,
          options.labelSize,
        ),
      );
    })
    .join("\n");
}

function renderPageTitle(title: string, baselineY: number, preferredSize = 94): string {
  const fontSize = fitSocialCardText(title, preferredSize, 58, 1060, 600);
  return `<text x="600" y="${baselineY}" text-anchor="middle" font-family="Blinker" font-size="${fontSize}" font-weight="600" letter-spacing="-1.5" fill="${SOCIAL_CARD_COLORS.accent}">${escapeSocialCardXml(title)}</text>`;
}

function cardSvg(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_SOCIAL_CARD_SIZE}" height="${PAGE_SOCIAL_CARD_SIZE}" viewBox="0 0 ${PAGE_SOCIAL_CARD_SIZE} ${PAGE_SOCIAL_CARD_SIZE}">
    <rect width="100%" height="100%" fill="${SOCIAL_CARD_COLORS.background}"/>
    ${body}
  </svg>`;
}

function renderHomeCard(): Buffer {
  return renderSocialCardSvgPng(
    cardSvg(`
      <image href="${DOSEWIKI_LOGO_DATA_URI}" x="495" y="72" width="210" height="210"/>
      ${renderDoseWikiWordmark(600, 410, 112)}
      <text x="600" y="480" text-anchor="middle" font-family="Blinker" font-size="34" font-style="italic" fill="${SOCIAL_CARD_COLORS.textMuted}">An open encyclopedic database for the study of psychopharmacology</text>
      ${renderTileRows([HOME_TILES], {
        top: 636,
        tileWidth: 178,
        tileHeight: 196,
        columnGap: 34,
        rowGap: 0,
        iconSize: 82,
        labelSize: 27,
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

  return renderSocialCardSvgPng(
    cardSvg(`
      <defs><clipPath id="creator-avatar"><circle cx="491" cy="478" r="24"/></clipPath></defs>
      ${renderSocialCardIcon("material-symbols:person-play-outline-rounded", 500, 72, 200)}
      ${renderPageTitle("Subjective Effect Index", 374, 88)}
      <g>
        <rect x="390" y="440" width="420" height="76" rx="38" fill="${SOCIAL_CARD_COLORS.surface}" stroke="${SOCIAL_CARD_COLORS.border}" stroke-width="2"/>
        <image href="${avatarDataUri}" x="467" y="454" width="48" height="48" clip-path="url(#creator-avatar)" preserveAspectRatio="xMidYMid slice"/>
        <text x="535" y="488" font-family="Blinker" font-size="28" fill="${SOCIAL_CARD_COLORS.textMuted}">created by <tspan fill="${SOCIAL_CARD_COLORS.text}" font-weight="600">Josie Kins</tspan><tspan fill="${SOCIAL_CARD_COLORS.textFaint}">, 2011</tspan></text>
      </g>
      ${renderTileRows([EFFECT_TILES], {
        top: 650,
        tileWidth: 174,
        tileHeight: 194,
        columnGap: 28,
        rowGap: 0,
        iconSize: 82,
        labelSize: 27,
      })}
    `),
  );
}

function renderSubstancesCard(): Buffer {
  return renderSocialCardSvgPng(
    cardSvg(`
      ${renderSocialCardIcon("streamline-ultimate:science-molecule-strucutre-bold", 500, 58, 200)}
      ${renderPageTitle("Substance Index", 350)}
      ${renderTileRows([SUBSTANCE_TILES.slice(0, 7), SUBSTANCE_TILES.slice(7)], {
        top: 466,
        tileWidth: 132,
        tileHeight: 210,
        columnGap: 28,
        rowGap: 34,
        iconSize: 72,
        labelSize: 23,
      })}
    `),
  );
}

function renderReplicationsCard(): Buffer {
  return renderSocialCardSvgPng(
    cardSvg(`
      ${renderSocialCardIcon("hugeicons:camera-ai", 505, 78, 190)}
      ${renderPageTitle("Replications", 382)}
      <text x="600" y="458" text-anchor="middle" font-family="Blinker" font-size="32" fill="${SOCIAL_CARD_COLORS.textMuted}">Image, video, and audio recreations of subjective effects</text>
      ${renderTileRows([REPLICATION_TILES], {
        top: 640,
        tileWidth: 204,
        tileHeight: 204,
        columnGap: 34,
        rowGap: 0,
        iconSize: 88,
        labelSize: 29,
      })}
    `),
  );
}

function renderChemicalClassesCard(): Buffer {
  return renderSocialCardSvgPng(
    cardSvg(`
      ${renderSocialCardIcon("solar:benzene-ring-linear", 500, 62, 200)}
      ${renderPageTitle("Chemical Class Index", 360, 88)}
      <text x="600" y="438" text-anchor="middle" font-family="Blinker" font-size="31" fill="${SOCIAL_CARD_COLORS.textMuted}">Structural lineages from broad scaffolds to specific families</text>
      <g>
        <rect x="94" y="526" width="1012" height="584" rx="28" fill="${SOCIAL_CARD_COLORS.surface}" stroke="${SOCIAL_CARD_COLORS.border}" stroke-width="2"/>
        <path d="M160 624V1035 M160 690H232V1035 M232 758H304V1035 M304 826H376V1035" fill="none" stroke="#4a424d" stroke-width="2"/>
        <g font-family="Blinker" font-weight="500" fill="${SOCIAL_CARD_COLORS.accent}">
          <text x="130" y="618" font-size="38">Amine <tspan fill="${SOCIAL_CARD_COLORS.textFaint}" font-size="30">· 204</tspan></text>
          <text x="202" y="686" font-size="36">Arylalkylamine <tspan fill="${SOCIAL_CARD_COLORS.textFaint}" font-size="29">· 133</tspan></text>
          <text x="274" y="754" font-size="35">Phenethylamine <tspan fill="${SOCIAL_CARD_COLORS.textFaint}" font-size="28">· 76</tspan></text>
          <text x="346" y="822" font-size="33">Alpha-methylphenethylamine <tspan fill="${SOCIAL_CARD_COLORS.textFaint}" font-size="27">· 49</tspan></text>
          <text x="418" y="904" font-size="31">Beta-ketoamphetamine <tspan fill="${SOCIAL_CARD_COLORS.textFaint}" font-size="26">· 18</tspan></text>
          <text x="418" y="974" font-size="31">2,5-Dimethoxyamphetamine <tspan fill="${SOCIAL_CARD_COLORS.textFaint}" font-size="26">· 10</tspan></text>
          <text x="418" y="1044" font-size="31">1,2-Diarylethylamine <tspan fill="${SOCIAL_CARD_COLORS.textFaint}" font-size="26">· 3</tspan></text>
        </g>
      </g>
    `),
  );
}

function renderAboutCard(): Buffer {
  return renderSocialCardSvgPng(
    cardSvg(`
      <image href="${DOSEWIKI_LOGO_DATA_URI}" x="490" y="62" width="220" height="220"/>
      <text x="600" y="402" text-anchor="middle" font-family="Blinker" font-size="90" font-weight="600" letter-spacing="-1.5" fill="${SOCIAL_CARD_COLORS.accent}">About <tspan fill="${SOCIAL_CARD_COLORS.text}">dose</tspan><tspan fill="${SOCIAL_CARD_COLORS.accent}">.wiki</tspan></text>
      <text x="600" y="482" text-anchor="middle" font-family="Blinker" font-size="34" fill="${SOCIAL_CARD_COLORS.textMuted}">An open encyclopedic database for the study of</text>
      <text x="600" y="526" text-anchor="middle" font-family="Blinker" font-size="34" fill="${SOCIAL_CARD_COLORS.textMuted}">psychopharmacology</text>
      ${renderTileRows([ABOUT_TILES], {
        top: 662,
        tileWidth: 184,
        tileHeight: 208,
        columnGap: 28,
        rowGap: 0,
        iconSize: 78,
        labelSize: 25,
      })}
    `),
  );
}

export async function renderPageSocialCardPng(key: PageSocialCardKey): Promise<Buffer> {
  switch (key) {
    case "home":
      return renderHomeCard();
    case "substances":
      return renderSubstancesCard();
    case "effects":
      return await renderEffectsCard();
    case "replications":
      return renderReplicationsCard();
    case "chemical-classes":
      return renderChemicalClassesCard();
    case "about":
      return renderAboutCard();
  }
}
