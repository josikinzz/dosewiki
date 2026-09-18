/**
 * The two halves of the replication corpus, and the one flag that selects one.
 *
 * The rescue is the same operation for both — fetch off a deployment nobody
 * controls, archive with a verified digest, upload to production, repoint the
 * row, verify through the public query — and every invariant that makes it safe
 * is shared. Only the middle differs: a video is transcoded to a web rendition
 * and serves that; an image is served as the archived master, byte for byte.
 *
 * `video` is the default everywhere, so an invocation written before images
 * existed still means exactly what it meant.
 *
 * This lives in its own module rather than in either script so the archive step
 * and the repoint step cannot end up disagreeing about what a media type is.
 */
export const MEDIA_TYPES = Object.freeze(["video", "image"]);

export const DEFAULT_MEDIA_TYPE = "video";

export function assertMediaType(value) {
  if (!MEDIA_TYPES.includes(value)) {
    throw new Error(`--media-type must be one of ${MEDIA_TYPES.join(", ")}; got ${value}.`);
  }
  return value;
}
