export const MEDIA_TYPES = Object.freeze(["video", "image"]);

export const DEFAULT_MEDIA_TYPE = "video";

export function assertMediaType(value) {
  if (!MEDIA_TYPES.includes(value)) {
    throw new Error(`--media-type must be one of ${MEDIA_TYPES.join(", ")}; got ${value}.`);
  }
  return value;
}
