export type ShowcaseWork = {
  slug: string;
  title: string;
  type: "video" | "image";
  url: string;
  thumbnailUrl?: string;
  format?: string;
  duration?: number;
  hasAudio?: boolean;
  width?: number;
  height?: number;
  previewUrl?: string;
  motionUrl?: string;
  motionPosterUrl?: string;
  byline: string;
  artistName: string | null;
  artistHref: string | null;
  artistHrefExternal: boolean;
  avatarUrl?: string | null;
  effectSlug: string;
  effectName: string;
};

export const SHOWCASE_WORK_CAP = 12;
