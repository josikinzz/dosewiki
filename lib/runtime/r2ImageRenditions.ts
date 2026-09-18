import sharp from "sharp";
import { RESPONSIVE_WIDTHS } from "../next/r2ImagePolicy";

/** Identical bytes and private keys for operator preparation and new uploads. */
export async function* encodeR2ImageRenditions(source: Buffer | string, key: string) {
  const image = sharp(source, { animated: true, limitInputPixels: 100_000_000 });
  const metadata = await image.metadata();
  const sourceWidth = metadata.orientation && metadata.orientation >= 5 ? metadata.height : metadata.width;
  if (!sourceWidth) throw new Error(`No source dimensions: ${key}`);
  let encodedWidth = 0;
  let bytes: Buffer | undefined;
  for (const width of RESPONSIVE_WIDTHS) {
    const actualWidth = Math.min(width, sourceWidth);
    if (!bytes || encodedWidth !== actualWidth) {
      bytes = await image.clone().rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
      encodedWidth = actualWidth;
    }
    yield { key: `_renditions/v1/${key}/${width}.webp`, width, bytes };
  }
}
